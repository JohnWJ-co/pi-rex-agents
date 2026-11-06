import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	watch,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import {
	holdProvider,
	TEST_MODEL,
	TEST_PROVIDER_URL,
} from "./fake-provider.ts";
import {
	activeFocusedBlock,
	buildRexArgv,
	flattenBlocks,
	RexCli,
	shellQuote,
	type RexProgramStatusRecord,
} from "../../maestro/surfaces/rex/rex-cli.ts";

export { flattenBlocks };

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HARNESS_DIR, "../..");
export const EXTENSION_SOURCE = join(PROJECT_ROOT, "src/extension.ts");
export const PI_TIMEOUT = Number(process.env.PI_TEST_TIMEOUT ?? "120000");

export function rexBinary(): string {
	return process.env.REX_BIN ?? "rex";
}

export function piBinary(): string {
	return process.env.PI_BIN ?? "pi";
}

export function rexAvailable():
	| { ok: true; version: string }
	| { ok: false; reason: string } {
	if (!process.env.REX_SESSION) {
		return {
			ok: false,
			reason:
				"REX_SESSION is unset; run the Rex integration suite inside a Rex block",
		};
	}
	try {
		const output = execFileSync(rexBinary(), ["whoami", "--json"], {
			encoding: "utf8",
		});
		// SAFETY: rex whoami --json is the documented object emitted by the CLI.
		const whoami = JSON.parse(output) as { rex_version?: string };
		return { ok: true, version: whoami.rex_version ?? "unknown" };
	} catch (error) {
		return {
			ok: false,
			reason: `rex is unavailable: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export interface RexLab {
	root: string;
	socket: string;
	endpoint: string;
	stateDir: string;
	project: string;
	agentDir: string;
	parentSession: string;
	sessionId: string;
	parentBlockId: string;
	cli: RexCli;
	server: ChildProcess;
	releaseProvider: () => void;
	env: NodeJS.ProcessEnv;
}

export interface RexSessionEntry {
	type?: string;
	customType?: string;
	content?: unknown;
	details?: {
		name?: string;
		sessionFile?: string;
		error?: string;
	};
	message?: { role?: string; content?: unknown };
}

function writeModels(agentDir: string): void {
	const model = (id: string) => ({
		id,
		name: "Deterministic integration test model",
		reasoning: true,
		input: ["text"],
		contextWindow: 128_000,
		maxTokens: 4_096,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	});
	writeFileSync(
		join(agentDir, "models.json"),
		JSON.stringify(
			{
				providers: {
					"pi-integration": {
						baseUrl: TEST_PROVIDER_URL,
						api: "openai-completions",
						apiKey: "test",
						compat: {
							supportsDeveloperRole: false,
							supportsReasoningEffort: false,
							supportsUsageInStreaming: false,
						},
						models: [
							"test",
							"fallback-primary",
							"fallback-secondary",
							"fallback-fail",
							"account-rejected",
						].map(model),
					},
				},
			},
			null,
			2,
		),
	);
}

function createFixtureProject(project: string): void {
	const agents = join(project, ".pi", "agents");
	mkdirSync(agents, { recursive: true });
	const source = join(PROJECT_ROOT, "test/integration/agents");
	for (const file of readdirSync(source).filter((entry) =>
		entry.endsWith(".md"),
	)) {
		const text = readFileSync(join(source, file), "utf8");
		const configured = text.replace(/^model:\s*.*\n/m, "");
		writeFileSync(join(agents, file), configured);
	}
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: project, stdio: "ignore" });
	git("init", "-q", "-b", "main");
	git("config", "user.email", "rex-integration@example.com");
	git("config", "user.name", "Rex integration");
	git("config", "commit.gpgsign", "false");
	writeFileSync(join(project, "README.md"), "Rex integration fixture\n");
	writeFileSync(join(project, ".gitignore"), ".pi/\n");
	git("add", "README.md", ".gitignore");
	git("commit", "-qm", "fixture");
}

async function waitFor<T>(
	check: () => T | Promise<T>,
	options: { timeoutMs?: number; description: string },
): Promise<NonNullable<T>> {
	const deadline = Date.now() + (options.timeoutMs ?? PI_TIMEOUT);
	let lastError = "";
	while (Date.now() < deadline) {
		try {
			const value = await check();
			if (value) {
				// SAFETY: `value` is truthy only after the caller's predicate succeeds.
				return value as NonNullable<T>;
			}
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50));
	}
	throw new Error(
		`Timed out waiting for ${options.description}${lastError ? `: ${lastError}` : ""}`,
	);
}

export async function waitForFile(
	path: string,
	predicate: (content: string) => boolean = () => true,
	timeoutMs = PI_TIMEOUT,
): Promise<string> {
	const readIfReady = (): string | undefined => {
		if (!existsSync(path)) return undefined;
		const content = readFileSync(path, "utf8");
		return predicate(content) ? content : undefined;
	};
	const immediate = readIfReady();
	if (immediate !== undefined) return immediate;
	return new Promise<string>((resolvePromise, reject) => {
		let settled = false;
		const finish = (error: Error | undefined, content?: string) => {
			if (settled) return;
			settled = true;
			watcher.close();
			clearTimeout(timer);
			if (error) reject(error);
			else resolvePromise(content ?? "");
		};
		const watcher = watch(dirname(path), () => {
			try {
				const content = readIfReady();
				if (content !== undefined) finish(undefined, content);
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		});
		const timer = setTimeout(
			() => finish(new Error(`Timed out waiting for file ${path}`)),
			timeoutMs,
		);
		timer.unref();
		try {
			const content = readIfReady();
			if (content !== undefined) finish(undefined, content);
		} catch (error) {
			finish(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

export async function waitForSessionEntry(
	sessionPath: string,
	predicate: (entry: RexSessionEntry) => boolean,
	timeoutMs = PI_TIMEOUT,
): Promise<RexSessionEntry> {
	return waitFor(
		() => {
			if (!existsSync(sessionPath)) return undefined;
			for (const line of readFileSync(sessionPath, "utf8").split("\n")) {
				if (!line.trim()) continue;
				try {
					// SAFETY: this line was read from the session JSONL boundary.
					const entry = JSON.parse(line) as RexSessionEntry;
					if (predicate(entry)) return entry;
				} catch {
					// A line is only considered after the atomic append is complete.
				}
			}
			return undefined;
		},
		{ timeoutMs, description: `session entry in ${sessionPath}` },
	);
}

export async function waitForBlock(
	lab: Pick<RexLab, "cli" | "sessionId" | "parentBlockId">,
	predicate: (blockIds: string[]) => boolean,
	description: string,
	timeoutMs = PI_TIMEOUT,
): Promise<string[]> {
	return waitFor(
		async () => {
			const session = await lab.cli.inspectSession(lab.sessionId);
			const blockIds = flattenBlocks(session).map(
				({ block }) => block.block_id,
			);
			return predicate(blockIds) ? blockIds : undefined;
		},
		{ timeoutMs, description },
	);
}

export async function waitForPiReady(
	lab: RexLab,
	timeoutMs = PI_TIMEOUT,
): Promise<void> {
	await waitFor(
		async () => {
			const status = await lab.cli.programStatus(
				lab.sessionId,
				lab.parentBlockId,
			);
			return status.records.some(
				(record) => record.app === "pi" && record.state === "idle",
			)
				? true
				: undefined;
		},
		{ timeoutMs, description: "parent Pi idle status" },
	);
}

export function readSession(path: string): RexSessionEntry[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			try {
				// SAFETY: this line was read from the session JSONL boundary.
				return [JSON.parse(line) as RexSessionEntry];
			} catch {
				return [];
			}
		});
}

export async function waitForReport(
	lab: Pick<RexLab, "cli" | "sessionId" | "parentSession">,
	name: string,
	timeoutMs = PI_TIMEOUT,
): Promise<{
	report: RexSessionEntry;
	childSession?: string;
	childBlockId?: string;
}> {
	const before = new Set(
		flattenBlocks(await lab.cli.inspectSession(lab.sessionId)).map(
			({ block }) => block.block_id,
		),
	);
	const report = await waitForSessionEntry(
		lab.parentSession,
		(entry) => {
			if (
				entry.type !== "custom_message" ||
				entry.customType !== "subagent_result"
			)
				return false;
			const content = String(entry.content ?? "");
			return content.includes(`<subagent_report from="${name}"`);
		},
		timeoutMs,
	);
	const childSession = report.details?.sessionFile;
	const currentIds = flattenBlocks(
		await lab.cli.inspectSession(lab.sessionId),
	).map(({ block }) => block.block_id);
	const childBlockId = currentIds.find((id) => !before.has(id));
	return { report, childSession, childBlockId };
}

export async function startParentPi(lab: RexLab): Promise<void> {
	const command = [
		`cd ${shellQuote(lab.project)} &&`,
		`PI_CODING_AGENT_DIR=${shellQuote(lab.agentDir)}`,
		shellQuote(piBinary()),
		"--no-extensions",
		"-e",
		shellQuote(EXTENSION_SOURCE),
		"--model",
		shellQuote(TEST_MODEL),
		"--session",
		shellQuote(lab.parentSession),
		"--tui-mode",
		"regular",
	].join(" ");
	await lab.cli.runCommand(lab.sessionId, lab.parentBlockId, command);
	await waitForPiReady(lab);
}

export async function sendParentPrompt(
	lab: RexLab,
	prompt: string,
): Promise<void> {
	await lab.cli.sendText(lab.sessionId, lab.parentBlockId, prompt);
	await lab.cli.sendKey(lab.sessionId, lab.parentBlockId, "enter");
}

async function stopServer(server: ChildProcess): Promise<void> {
	if (server.exitCode !== null || server.signalCode !== null) return;
	server.kill("SIGTERM");
	await new Promise<void>((resolvePromise) => {
		const timer = setTimeout(() => {
			if (server.exitCode === null && server.signalCode === null)
				server.kill("SIGKILL");
			resolvePromise();
		}, 5_000);
		timer.unref();
		server.once("exit", () => {
			clearTimeout(timer);
			resolvePromise();
		});
	});
}

export async function destroyRexLab(lab: RexLab): Promise<void> {
	try {
		await lab.cli.killSession(lab.sessionId);
	} catch {
		// The server may already be stopping.
	}
	await stopServer(lab.server);
	lab.releaseProvider();
	rmSync(lab.root, { recursive: true, force: true });
}

export async function createRexLab(
	options: { root?: string } = {},
): Promise<RexLab> {
	const root = options.root ?? mkdtempSync(join(tmpdir(), "pira-lab-"));
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const socket = join(root, "s");
	const endpoint = `unix://${socket}`;
	if (Buffer.byteLength(endpoint) > 104) {
		rmSync(root, { recursive: true, force: true });
		throw new Error(`Rex lab socket endpoint exceeds 104 bytes: ${endpoint}`);
	}
	const releaseProvider = holdProvider();
	const stateDir = join(root, "state");
	const project = join(root, "project");
	const agentDir = join(root, "agent");
	const parentSession = join(root, "sessions", "parent.jsonl");
	mkdirSync(stateDir, { recursive: true });
	mkdirSync(project, { recursive: true });
	mkdirSync(join(agentDir, "extensions"), { recursive: true });
	mkdirSync(dirname(parentSession), { recursive: true });
	writeModels(agentDir);
	createFixtureProject(project);
	writeFileSync(
		join(agentDir, "extensions", "subagents.ts"),
		`export { default } from ${JSON.stringify(EXTENSION_SOURCE)};\n`,
	);
	const env: NodeJS.ProcessEnv = {
		...process.env,
		REX_SERVER: endpoint,
		PI_CODING_AGENT_DIR: agentDir,
	};
	delete env.PI_SUBAGENT_ID;
	delete env.PI_DENY_TOOLS;
	delete env.PI_SUBAGENT_SKILLS;
	delete env.PI_SUBAGENT_MODEL_SCOPE;
	const server = spawn(
		rexBinary(),
		[
			"server",
			"run",
			"--listen",
			endpoint,
			"--state-dir",
			stateDir,
			"--restore=false",
		],
		{ env, detached: true, stdio: "ignore" },
	);
	server.unref();
	const cli = new RexCli({ env, timeoutMs: 10_000 });
	let sessionId = "";
	try {
		await waitFor(
			async () => {
				try {
					// SAFETY: Rex's JSON response is the documented whoami object.
					const whoami = JSON.parse(
						(await cli.run(["whoami", "--json"])).stdout,
					) as { endpoint?: string };
					return whoami.endpoint === endpoint ? true : undefined;
				} catch {
					return undefined;
				}
			},
			{ timeoutMs: 15_000, description: "isolated Rex server" },
		);
		const created = await cli.newSession(`pira-lab-${Date.now()}`, project);
		sessionId = created.session_id;
		const initial = await cli.inspectSession(sessionId);
		const parentBlockId =
			activeFocusedBlock(initial) ?? flattenBlocks(initial)[0]?.block.block_id;
		assert.ok(parentBlockId, "isolated Rex session has an initial block");
		const selfCheckPath = join(root, "whoami.json");
		await cli.runCommand(
			sessionId,
			parentBlockId,
			`rex whoami --json > ${shellQuote(selfCheckPath)}`,
		);
		const whoamiText = await waitForFile(selfCheckPath, (content) =>
			content.includes(endpoint),
		);
		// SAFETY: this file was written by the lab block's `rex whoami --json` command.
		assert.equal(
			(JSON.parse(whoamiText) as { endpoint?: string }).endpoint,
			endpoint,
		);
		return {
			root,
			socket,
			endpoint,
			stateDir,
			project,
			agentDir,
			parentSession,
			sessionId,
			parentBlockId,
			cli,
			server,
			releaseProvider,
			env,
		};
	} catch (error) {
		await stopServer(server);
		releaseProvider();
		rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

export function statusFor(
	status: { records: RexProgramStatusRecord[] },
	app: string,
): RexProgramStatusRecord | undefined {
	return status.records.find(
		(record) => record.app === app || record.effective_app === app,
	);
}

export function childBlocks(lab: RexLab): Promise<string[]> {
	return lab.cli.inspectSession(lab.sessionId).then((session) =>
		flattenBlocks(session)
			.map(({ block }) => block.block_id)
			.filter((id) => id !== lab.parentBlockId),
	);
}

export const rexArgvForTest = buildRexArgv;
