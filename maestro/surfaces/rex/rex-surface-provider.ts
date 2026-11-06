/**
 * Rex implementation of pi-rex-agents' SurfaceProvider seam.
 *
 * The provider is intentionally a thin adapter over the public `rex` CLI. It
 * never opens Rex's private socket and never assumes another host is present.
 */

import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { git, parseWorktreeList, shortBranch } from "./git.ts";
import {
	activeFocusedBlock,
	flattenBlocks,
	RexCli,
	shellQuote,
	type RexProcessEntry,
	type RexProgramStatusRecord,
	type RexSessionInfo,
} from "./rex-cli.ts";
import { RexAcquisitionUncertainError } from "./uncertainty.ts";
import type { ReportOpenedPrimaryWorkspaceInput } from "../../core/surface-provider.ts";
import { rexWorktreeRoot } from "./worktree.ts";

export type RexAgentStatus =
	| "idle"
	| "working"
	| "blocked"
	| "done"
	| "error"
	| "unknown";

export interface RexPlacement {
	kind: "split" | "tab" | "grouped";
	direction?: "right" | "down";
}

export interface CreateRexSurfaceOptions {
	name: string;
	cwd: string;
	placement?: RexPlacement;
	/** Rex-specific split anchor. Omitted means the current focused block. */
	anchorBlockId?: string;
	signal?: AbortSignal;
}

export interface RexSurfaceInfo {
	id: string;
	name?: string;
	cwd?: string;
	windowId?: string;
	group?: string;
	workspaceId?: string;
}

export interface RexWorktreeSurface {
	path: string;
	branch: string;
	workspaceId: string;
	surfaceId: string;
	diagnostics?: string[];
}

export interface RexWorktreeSurfaceInfo {
	branch: string;
	path: string;
	label?: string;
	workspaceId?: string;
	sourceCwd?: string;
	isLinkedWorktree: boolean;
}

export interface RexSurfaceHandle {
	id: string;
	runCommand(command: string): void | Promise<void>;
	readScreen(lines?: number): string | Promise<string>;
	sendKeys?(keys: string): void | Promise<void>;
	close?(): void | Promise<void>;
}

export type RexPaneInspection =
	| {
			kind: "present";
			present: "present";
			agentStatus: RexAgentStatus;
			agent?: string;
			observedAt: number;
			state?: string;
			message?: string;
			raw?: RexProgramStatusRecord;
	  }
	| {
			kind: "missing";
			present: "missing";
			agentStatus: "unknown";
			observedAt: number;
			state?: string;
			message?: string;
	  }
	| {
			kind: "unavailable";
			present: "unavailable";
			agentStatus: "unknown";
			observedAt: number;
			state?: string;
			message?: string;
	  };

export interface RexSurfaceProcessInfo {
	shellPid?: number;
	foregroundProcessGroupId?: number;
	pids: number[];
	foregroundProcesses: Array<{
		pid: number;
		name?: string;
		argv0?: string;
		cwd?: string;
		argv?: string[];
	}>;
	lastExit?: number | null;
}

export interface RexSurfaceProviderOptions {
	sessionId: string;
	cli?: RexCli;
	anchorBlockId?: string;
	pollIntervalMs?: number;
	worktreeRoot?: string;
}

const SHELL_NAMES = new Set([
	"zsh",
	"bash",
	"fish",
	"sh",
	"dash",
	"ksh",
	"nu",
	"pwsh",
]);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikePiProcess(
	process: RexProcessEntry | null | undefined,
): boolean {
	if (!process) return false;
	return (
		process.argv0 === "pi" ||
		process.name === "pi" ||
		process.script?.endsWith("/pi") === true ||
		process.path?.includes("/pi-coding-agent") === true
	);
}

function mapProgramState(
	record: RexProgramStatusRecord | undefined,
): RexAgentStatus {
	switch (record?.state) {
		case "idle":
			return "idle";
		case "working":
			return "working";
		case "blocked":
			return "blocked";
		case "done":
			return "done";
		case "error":
			return "error";
		default:
			return "unknown";
	}
}

function now(): number {
	return Date.now();
}

export class RexSurfaceProvider {
	readonly name = "rex";
	readonly sessionId: string;
	readonly cli: RexCli;
	readonly pollIntervalMs: number;
	private readonly configuredAnchorBlockId?: string;
	private readonly worktreeRoot: string;
	private readonly surfaceCwds = new Map<string, string>();
	private readonly worktrees = new Map<
		string,
		RexWorktreeSurface & { sourceCwd: string }
	>();

	constructor(options: RexSurfaceProviderOptions) {
		this.sessionId = options.sessionId;
		this.cli = options.cli ?? new RexCli();
		this.pollIntervalMs = options.pollIntervalMs ?? 250;
		this.configuredAnchorBlockId = options.anchorBlockId;
		this.worktreeRoot = options.worktreeRoot ?? rexWorktreeRoot();
	}

	/** Sync by contract: the provider is constructed only inside a live Rex block. */
	isAvailable(): boolean {
		return Boolean(this.sessionId);
	}

	async createSurface(options: CreateRexSurfaceOptions): Promise<string> {
		if (options.signal?.aborted) throw new Error("surface creation aborted");

		const anchor = options.anchorBlockId ?? (await this.resolveAnchor());
		const placement = options.placement ?? {
			kind: "split",
			direction: "right",
		};

		if (placement.kind === "tab" || placement.kind === "grouped") {
			const created = await this.cli.newWindow(
				this.sessionId,
				options.name,
				options.cwd,
			);
			const blockId = created.block_ids[0];
			if (!blockId) throw new Error("rex window new returned no block id");
			// `rex window new` labels the window only; the block it creates is
			// called "shell". Name it after the child so both surfaces are findable.
			await this.cli
				.renameBlock(this.sessionId, blockId, options.name)
				.catch(() => undefined);
			await this.waitForShellReady(blockId);
			this.surfaceCwds.set(blockId, options.cwd);
			return blockId;
		}

		const created = await this.cli.split(this.sessionId, anchor, {
			direction: placement.direction === "down" ? "below" : "right",
			cwd: options.cwd,
			label: options.name,
		});
		const blockId = created.block_ids[0];
		if (!blockId) throw new Error("rex split returned no block id");
		await this.waitForShellReady(blockId);
		this.surfaceCwds.set(blockId, options.cwd);
		return blockId;
	}

	async runCommand(surfaceId: string, command: string): Promise<void> {
		await this.cli.runCommand(this.sessionId, surfaceId, command);
	}

	async runScript(
		surfaceId: string,
		command: string,
		options: { scriptPath: string; scriptPreamble: string },
	): Promise<string> {
		mkdirSync(dirname(options.scriptPath), { recursive: true });
		writeFileSync(
			options.scriptPath,
			`#!/bin/bash\n${options.scriptPreamble.trimEnd()}\n${command}\n`,
			{ mode: 0o755 },
		);
		try {
			await this.runCommand(
				surfaceId,
				`bash ${shellQuote(options.scriptPath)}`,
			);
		} catch (error) {
			throw new RexAcquisitionUncertainError(
				`rex could not confirm dispatch of ${options.scriptPath}`,
				{ kind: "command-dispatch", surfaceId },
				{ cause: error },
			);
		}
		return options.scriptPath;
	}

	async readScreen(surfaceId: string, lines?: number): Promise<string> {
		return this.cli.capture(this.sessionId, surfaceId, { lines, trim: true });
	}

	async closeSurface(surfaceId: string): Promise<void> {
		await this.cli.closeBlock(this.sessionId, surfaceId);
		this.surfaceCwds.delete(surfaceId);
	}

	async listSurfaces(_opts?: {
		timeoutMs?: number;
	}): Promise<RexSurfaceInfo[]> {
		const session = await this.cli.inspectSession(this.sessionId);
		return Promise.all(
			flattenBlocks(session).map(async ({ block, window }) => {
				let cwd = this.surfaceCwds.get(block.block_id);
				if (!cwd) {
					try {
						const process = await this.cli.processInfo(
							this.sessionId,
							block.block_id,
						);
						cwd = process.foreground?.cwd ?? process.child?.cwd;
					} catch {
						// A block can disappear between session inspection and process info.
					}
				}
				return {
					id: block.block_id,
					name: block.label,
					cwd,
					windowId: window.window_id,
					group: window.label,
					workspaceId: window.window_id,
				};
			}),
		);
	}

	attachSurface(id: string): RexSurfaceHandle {
		return {
			id,
			runCommand: (command) => this.runCommand(id, command),
			readScreen: (lines) => this.readScreen(id, lines),
			sendKeys: (keys) => this.sendKeys(id, keys),
			close: () => this.closeSurface(id),
		};
	}

	async createWorktreeSurface(opts: {
		name: string;
		cwd: string;
		branch: string;
		base: string;
		signal?: AbortSignal;
	}): Promise<RexWorktreeSurface> {
		if (opts.signal?.aborted) throw new Error("worktree creation aborted");

		const sourceRoot = await this.gitRoot(opts.cwd);
		const slug = opts.branch.replace(/[^A-Za-z0-9._-]+/g, "-");
		if (!slug) throw new Error(`invalid worktree branch: ${opts.branch}`);
		let path = join(this.worktreeRoot, basename(sourceRoot), slug);
		if (existsSync(path)) {
			throw new Error(`worktree path already exists: ${path}`);
		}

		mkdirSync(dirname(path), { recursive: true });
		await git(sourceRoot, [
			"worktree",
			"add",
			"-b",
			opts.branch,
			path,
			opts.base,
		]);
		path = realpathSync(path);

		let windowId: string | undefined;
		let surfaceId: string | undefined;
		try {
			if (opts.signal?.aborted) throw new Error("worktree creation aborted");
			const created = await this.cli.newWindow(this.sessionId, opts.name, path);
			windowId = created.window_id;
			surfaceId = created.block_ids[0];
			if (!surfaceId) throw new Error("rex window new returned no block id");
			await this.cli
				.renameBlock(this.sessionId, surfaceId, opts.name)
				.catch(() => undefined);
			await this.waitForShellReady(surfaceId);
		} catch (error) {
			if (surfaceId) await this.closeSurface(surfaceId).catch(() => undefined);
			if (windowId)
				await this.cli
					.closeWindow(this.sessionId, windowId)
					.catch(() => undefined);
			await git(sourceRoot, ["worktree", "remove", "--force", path]).catch(
				() => undefined,
			);
			throw error;
		}

		const worktree: RexWorktreeSurface & { sourceCwd: string } = {
			path,
			branch: opts.branch,
			workspaceId: windowId!,
			surfaceId: surfaceId!,
			sourceCwd: sourceRoot,
		};
		this.worktrees.set(worktree.workspaceId, worktree);
		return worktree;
	}

	async removeWorktreeSurface(
		workspaceId: string,
		_opts?: { timeoutMs?: number },
	): Promise<void> {
		const worktree =
			this.worktrees.get(workspaceId) ??
			(await this.lookupWorktree(workspaceId));
		if (!worktree) return;

		// The upstream cleanup path may have already closed the child surface.
		await this.closeSurface(worktree.surfaceId).catch(() => undefined);
		await this.waitForSurfaceAbsence(worktree.surfaceId).catch(() => undefined);
		await git(worktree.sourceCwd, ["worktree", "remove", worktree.path]);
		await this.cli
			.closeWindow(this.sessionId, workspaceId)
			.catch(() => undefined);
		this.worktrees.delete(workspaceId);
	}

	reportOpenedPrimaryWorkspace(
		_input: ReportOpenedPrimaryWorkspaceInput,
	): undefined {
		return undefined;
	}

	setupHint(): string {
		return "pi-rex-agents runs inside a Rex block; REX_SESSION and REX_BLOCK must be set.";
	}

	async inspectSurface(surfaceId: string): Promise<RexPaneInspection> {
		let session: RexSessionInfo;
		try {
			session = await this.cli.inspectSession(this.sessionId);
		} catch (error) {
			return {
				kind: "unavailable",
				present: "unavailable",
				agentStatus: "unknown",
				observedAt: now(),
				message: error instanceof Error ? error.message : String(error),
			};
		}

		const exists = flattenBlocks(session).some(
			({ block }) => block.block_id === surfaceId,
		);
		if (!exists) {
			return {
				kind: "missing",
				present: "missing",
				agentStatus: "unknown",
				observedAt: now(),
			};
		}

		try {
			const record = await this.getProgramStatus(surfaceId);
			if (record) {
				return {
					kind: "present",
					present: "present",
					agentStatus: mapProgramState(record),
					agent: record.effective_app ?? record.app,
					observedAt: now(),
					state: record.state,
					message: record.msg,
					raw: record,
				};
			}

			const process = await this.cli.processInfo(this.sessionId, surfaceId);
			if (looksLikePiProcess(process.foreground)) {
				return {
					kind: "present",
					present: "present",
					agentStatus: "unknown",
					agent: "pi",
					observedAt: now(),
					state: "no-program-status",
					message: "Pi process is running but has not reported OSC 7501 status",
				};
			}
			if (process.foreground && SHELL_NAMES.has(process.foreground.name)) {
				return {
					kind: "present",
					present: "present",
					agentStatus: "idle",
					agent: "shell",
					observedAt: now(),
					state: "shell",
				};
			}
			return {
				kind: "present",
				present: "present",
				agentStatus: "unknown",
				observedAt: now(),
			};
		} catch (error) {
			return {
				kind: "unavailable",
				present: "unavailable",
				agentStatus: "unknown",
				observedAt: now(),
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async getProgramStatus(
		surfaceId: string,
	): Promise<RexProgramStatusRecord | undefined> {
		const status = await this.cli.programStatus(this.sessionId, surfaceId);
		// Child OSC records are supplemental and must never shadow Pi's root.
		return status.records.find((record) => !record.id || record.id === "root");
	}

	async getAgentPid(surfaceId: string): Promise<number | undefined> {
		const status = await this.getProgramStatus(surfaceId);
		if (status?.owner?.pid) return status.owner.pid;
		const info = await this.cli.processInfo(this.sessionId, surfaceId);
		return looksLikePiProcess(info.foreground)
			? info.foreground?.pid
			: undefined;
	}

	async getProcessInfo(
		surfaceId: string,
		_opts?: { timeoutMs?: number },
	): Promise<RexSurfaceProcessInfo> {
		const info = await this.cli.processInfo(this.sessionId, surfaceId);
		const all: RexProcessEntry[] = [
			info.child,
			info.foreground,
			...(info.ancestors ?? []),
		].filter(
			(entry): entry is RexProcessEntry =>
				entry !== null && entry !== undefined,
		);

		const pids = [...new Set(all.map((entry) => entry.pid))];
		const shell = all.find((entry) => SHELL_NAMES.has(entry.name));
		return {
			shellPid: shell?.pid,
			// Rex does not expose PGIDs. Only the idle-shell case is known safely;
			// a live foreground child intentionally leaves this undefined so the
			// upstream worktree cleanup refuses to remove a busy checkout.
			foregroundProcessGroupId:
				shell && info.foreground?.pid === shell.pid ? shell.pid : undefined,
			pids,
			foregroundProcesses: all
				.filter((entry) => entry.pid === info.foreground?.pid)
				.map((entry) => ({
					pid: entry.pid,
					name: entry.name,
					argv0: entry.argv0,
					cwd: entry.cwd,
				})),
			lastExit: info.last_exit,
		};
	}

	async sendKeys(surfaceId: string, keys: string): Promise<void> {
		await this.cli.sendKey(this.sessionId, surfaceId, keys);
	}

	async waitForShellReady(
		surfaceId: string,
		opts?: { timeoutMs?: number },
	): Promise<void> {
		const timeoutMs = opts?.timeoutMs ?? 10_000;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const info = await this.cli.processInfo(this.sessionId, surfaceId);
			const foreground = info.foreground;
			if (foreground && SHELL_NAMES.has(foreground.name)) return;
			await sleep(this.pollIntervalMs);
		}
		throw new Error(`Rex surface ${surfaceId} did not reach a shell prompt`);
	}

	async waitForSurfaceAbsence(
		surfaceId: string,
		opts?: { timeoutMs?: number },
	): Promise<void> {
		const timeoutMs = opts?.timeoutMs ?? 10_000;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const surfaces = await this.listSurfaces({ timeoutMs });
			if (!surfaces.some((surface) => surface.id === surfaceId)) return;
			await sleep(this.pollIntervalMs);
		}
		throw new Error(`Rex surface ${surfaceId} did not disappear`);
	}

	async listWorktreeSurfaces(opts?: {
		cwd?: string;
		timeoutMs?: number;
	}): Promise<RexWorktreeSurfaceInfo[]> {
		const cwd = opts?.cwd ?? process.cwd();
		const sourceRoot = await this.gitRoot(cwd);
		const { stdout } = await git(sourceRoot, [
			"worktree",
			"list",
			"--porcelain",
		]);
		const entries = parseWorktreeList(stdout);
		const main = entries[0]?.path;
		return entries
			.filter((entry) => !entry.bare && entry.path !== main)
			.map((entry) => {
				const known = [...this.worktrees.values()].find(
					(worktree) => worktree.path === entry.path,
				);
				return {
					path: entry.path,
					branch: shortBranch(entry.branch) ?? "",
					label: basename(entry.path),
					workspaceId: known?.workspaceId,
					sourceCwd: sourceRoot,
					isLinkedWorktree: true,
				};
			});
	}

	async focusWorkspace(workspaceId: string): Promise<void> {
		await this.cli.focusWindow(this.sessionId, workspaceId);
	}

	async setTitle(target: "tab" | "workspace", title: string): Promise<void> {
		if (target === "workspace") {
			await this.cli.renameSession(this.sessionId, title);
			return;
		}
		const session = await this.cli.inspectSession(this.sessionId);
		if (!session.active_window_id)
			throw new Error("Rex session has no active window");
		await this.cli.renameWindow(
			this.sessionId,
			session.active_window_id,
			title,
		);
	}

	private async resolveAnchor(): Promise<string> {
		if (this.configuredAnchorBlockId) return this.configuredAnchorBlockId;
		const session = await this.cli.inspectSession(this.sessionId);
		const anchor = activeFocusedBlock(session);
		if (!anchor) throw new Error("no focused Rex block to use as split anchor");
		return anchor;
	}

	private async gitRoot(cwd: string): Promise<string> {
		const { stdout } = await git(cwd, ["rev-parse", "--show-toplevel"]);
		const root = stdout.trim();
		if (!root) throw new Error(`not a Git worktree: ${cwd}`);
		return root;
	}

	private async lookupWorktree(
		workspaceId: string,
	): Promise<(RexWorktreeSurface & { sourceCwd: string }) | undefined> {
		const session = await this.cli
			.inspectSession(this.sessionId)
			.catch(() => undefined);
		const window = session?.windows.find(
			(candidate) => candidate.window_id === workspaceId,
		);
		if (!window) return undefined;
		for (const layer of window.layers) {
			for (const block of layer.blocks) {
				try {
					const info = await this.cli.processInfo(
						this.sessionId,
						block.block_id,
					);
					const cwd = info.foreground?.cwd ?? info.child?.cwd;
					if (!cwd) continue;
					const sourceRoot = await this.gitRoot(cwd);
					return {
						path: cwd,
						branch: "",
						workspaceId,
						surfaceId: block.block_id,
						sourceCwd: sourceRoot,
					};
				} catch {
					// Try the next block in this window.
				}
			}
		}
		return undefined;
	}
}
