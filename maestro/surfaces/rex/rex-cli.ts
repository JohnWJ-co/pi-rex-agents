/**
 * Thin, dependency-free wrapper around the `rex` CLI.
 *
 * P0 intentionally talks to Rex through its documented CLI/JSON API rather
 * than through private sockets. Every call is argv-based; no shell is used by
 * this module. Commands that are typed into a block are quoted separately.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isFiniteNumber, isString } from "../../core/config/type-guards.ts";

const execFileAsync = promisify(execFile);

export interface RexBlockInfo {
	block_id: string;
	label?: string;
	creator_name?: string;
	flavor?: string;
	host_id?: string;
	owner?: string;
}

export interface RexWindowInfo {
	window_id: string;
	label?: string;
	focused_block_id?: string;
	layers: Array<{
		layer_id?: string;
		kind?: string;
		blocks: RexBlockInfo[];
	}>;
}

export interface RexSessionInfo {
	revision: number;
	session_id: string;
	label?: string;
	active_window_id?: string;
	windows: RexWindowInfo[];
}

export interface RexNewSessionResult {
	session_id: string;
	initial_windows: Array<{
		window_id: string;
		block_ids: string[];
		revision: number;
	}>;
}

export interface RexSplitResult {
	anchor_id: string;
	block_ids: string[];
	split_ids?: string[];
	revision: number;
}

export interface RexProcessEntry {
	pid: number;
	user_id: number;
	name: string;
	path?: string;
	argv0?: string;
	cwd?: string;
	invoked_path?: string;
	script?: string;
	user?: string;
}

export interface RexProcessInfo {
	last_exit?: number | null;
	child?: RexProcessEntry | null;
	foreground?: RexProcessEntry | null;
	ancestors?: RexProcessEntry[] | null;
	home?: string;
}

export interface RexProgramStatusRecord {
	id?: string;
	state: "idle" | "working" | "done" | "blocked" | "error" | string;
	app?: string;
	effective_app?: string;
	kind?: string;
	msg?: string;
	progress?: number | null;
	title?: string;
	updated_at?: string;
	owner?: {
		pid: number;
		name: string;
	};
}

export interface RexProgramStatus {
	records: RexProgramStatusRecord[];
}

export interface RexRunResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface RexCliOptions {
	binary?: string;
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv;
}

interface RexCommandFailure {
	message: string;
	code?: number | string;
	stdout?: string;
	stderr?: string;
}

function normalizeRexCommandFailure(cause: any): RexCommandFailure {
	const message = cause instanceof Error ? cause.message : String(cause);
	const code =
		isFiniteNumber(cause?.code) || isString(cause?.code)
			? cause.code
			: undefined;
	return {
		message,
		code,
		stdout: isString(cause?.stdout) ? cause.stdout : undefined,
		stderr: isString(cause?.stderr) ? cause.stderr : undefined,
	};
}

/** Build the complete argv passed to rex without invoking a shell. */
export function buildRexArgv(
	args: readonly string[],
	env: NodeJS.ProcessEnv = process.env,
): string[] {
	const prefix = ["--autostart=false"];
	const server = env.REX_SERVER;
	if (server) prefix.unshift("-S", server);
	return [...prefix, ...args];
}

export class RexCommandError extends Error {
	readonly args: string[];
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;

	constructor(
		args: string[],
		failure: RexCommandFailure,
		stdout = "",
		stderr = "",
	) {
		super(`rex ${args.join(" ")} failed: ${failure.message}`);
		this.name = "RexCommandError";
		this.args = args;
		this.exitCode = failure.code === undefined ? null : Number(failure.code);
		this.stdout = stdout;
		this.stderr = stderr;
	}
}

export function shellQuote(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function parseJson<T>(text: string, what: string): T {
	const trimmed = text.trim();
	if (!trimmed) throw new Error(`rex ${what} returned empty JSON`);
	try {
		// SAFETY: Rex JSON call sites bind T to the documented response schema.
		return JSON.parse(trimmed) as T;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`rex ${what} returned invalid JSON: ${reason}\n${trimmed.slice(0, 2000)}`,
		);
	}
}

export class RexCli {
	readonly binary: string;
	readonly timeoutMs: number;
	readonly env: NodeJS.ProcessEnv;

	constructor(options: RexCliOptions = {}) {
		this.binary = options.binary ?? "rex";
		this.timeoutMs = options.timeoutMs ?? 30_000;
		this.env = options.env ?? process.env;
	}

	async run(args: string[], timeoutMs = this.timeoutMs): Promise<RexRunResult> {
		const argv = buildRexArgv(args, this.env);
		try {
			const result = await execFileAsync(this.binary, argv, {
				env: this.env,
				timeout: timeoutMs,
				maxBuffer: 16 * 1024 * 1024,
				encoding: "utf8",
			});
			return {
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				exitCode: 0,
			};
		} catch (error) {
			const failure = normalizeRexCommandFailure(error);
			const stdout = failure.stdout ?? "";
			const stderr = failure.stderr ?? "";
			if (failure.code === 0) {
				return { stdout, stderr, exitCode: 0 };
			}
			throw new RexCommandError(argv, failure, stdout, stderr);
		}
	}

	async newSession(label: string, cwd: string): Promise<RexNewSessionResult> {
		const result = await this.run(["new", label, "-c", cwd, "--json"]);
		return parseJson<RexNewSessionResult>(result.stdout, "new");
	}

	async inspectSession(sessionId: string): Promise<RexSessionInfo> {
		const result = await this.run(["session", "inspect", sessionId, "--json"]);
		return parseJson<RexSessionInfo>(result.stdout, "session inspect");
	}

	async split(
		sessionId: string,
		anchorBlockId: string,
		options: {
			direction?: "right" | "left" | "above" | "below";
			cwd?: string;
			label?: string;
			focus?: boolean;
			ratio?: number;
		} = {},
	): Promise<RexSplitResult> {
		const args = [
			"split",
			"-s",
			sessionId,
			"-b",
			anchorBlockId,
			"--split",
			options.direction ?? "right",
			"--focus=false",
			"--json",
		];
		if (options.cwd) args.push("-c", options.cwd);
		if (options.label) args.push("--label", options.label);
		if (options.ratio !== undefined)
			args.push("--ratio", String(options.ratio));
		const result = await this.run(args);
		return parseJson<RexSplitResult>(result.stdout, "split");
	}

	async newWindow(
		sessionId: string,
		label: string,
		cwd: string,
	): Promise<{ window_id: string; block_ids: string[]; revision: number }> {
		const result = await this.run([
			"window",
			"new",
			"-s",
			sessionId,
			label,
			"--focus=false",
			"-c",
			cwd,
			"--json",
		]);
		return parseJson<{
			window_id: string;
			block_ids: string[];
			revision: number;
		}>(result.stdout, "window new");
	}

	/** Type text into a block. This does NOT send Enter. */
	async sendText(
		sessionId: string,
		blockId: string,
		text: string,
	): Promise<void> {
		await this.run(["send", "-s", sessionId, "-b", blockId, text]);
	}

	async sendKey(
		sessionId: string,
		blockId: string,
		key: string,
	): Promise<void> {
		await this.run(["send-key", "-s", sessionId, "-b", blockId, key]);
	}

	/** Type a command and press Enter. */
	async runCommand(
		sessionId: string,
		blockId: string,
		command: string,
	): Promise<void> {
		await this.sendText(sessionId, blockId, command);
		await this.sendKey(sessionId, blockId, "enter");
	}

	async capture(
		sessionId: string,
		blockId: string,
		options: { lines?: number; trim?: boolean } = {},
	): Promise<string> {
		const args = ["capture", "-s", sessionId, "-b", blockId, "--format=text"];
		if (options.trim !== false) args.push("--trim");
		const result = await this.run(args);
		if (!options.lines) return result.stdout;
		const lines = result.stdout.replace(/\n$/, "").split("\n");
		return `${lines.slice(-options.lines).join("\n")}\n`;
	}

	async closeBlock(sessionId: string, blockId: string): Promise<void> {
		await this.run(["block", "close", "-s", sessionId, blockId]);
	}

	async closeWindow(sessionId: string, windowId: string): Promise<void> {
		await this.run(["window", "close", "-s", sessionId, windowId]);
	}

	async killSession(sessionId: string): Promise<void> {
		await this.run(["session", "kill", sessionId]);
	}

	async programStatus(
		sessionId: string,
		blockId: string,
	): Promise<RexProgramStatus> {
		const result = await this.run([
			"block",
			"call",
			"program_status",
			"-s",
			sessionId,
			"-b",
			blockId,
		]);
		return parseJson<RexProgramStatus>(
			result.stdout,
			"block call program_status",
		);
	}

	async processInfo(
		sessionId: string,
		blockId: string,
	): Promise<RexProcessInfo> {
		const result = await this.run([
			"block",
			"call",
			"process",
			"-s",
			sessionId,
			"-b",
			blockId,
		]);
		return parseJson<RexProcessInfo>(result.stdout, "block call process");
	}

	async focusBlock(sessionId: string, blockId: string): Promise<void> {
		await this.run(["block", "focus", "-s", sessionId, blockId]);
	}

	async focusWindow(sessionId: string, windowId: string): Promise<void> {
		await this.run(["window", "focus", "-s", sessionId, windowId]);
	}

	async renameBlock(
		sessionId: string,
		blockId: string,
		label: string,
	): Promise<void> {
		await this.run(["block", "rename", "-s", sessionId, blockId, label]);
	}

	async renameWindow(
		sessionId: string,
		windowId: string,
		label: string,
	): Promise<void> {
		await this.run(["window", "rename", "-s", sessionId, windowId, label]);
	}

	async renameSession(sessionId: string, label: string): Promise<void> {
		await this.run(["session", "rename", sessionId, label]);
	}
}

export function flattenBlocks(
	session: RexSessionInfo,
): Array<{ block: RexBlockInfo; window: RexWindowInfo }> {
	return session.windows.flatMap((window) =>
		window.layers.flatMap((layer) =>
			layer.blocks.map((block) => ({ block, window })),
		),
	);
}

export function activeFocusedBlock(
	session: RexSessionInfo,
): string | undefined {
	const active = session.windows.find(
		(window) => window.window_id === session.active_window_id,
	);
	return active?.focused_block_id;
}
