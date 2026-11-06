import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createRexLab,
	destroyRexLab,
	rexBinary,
	waitForFile as waitForLabFile,
	type RexLab,
	EXTENSION_SOURCE,
} from "./rex-harness.ts";
import { execFileSync } from "node:child_process";
import {
	RexCli,
	buildRexArgv,
	shellQuote,
} from "../../maestro/surfaces/rex/rex-cli.ts";
import { RexSurfaceProvider } from "../../maestro/surfaces/rex/rex-surface-provider.ts";
import { TEST_MODEL } from "./fake-provider.ts";

export type MuxBackend = "rex";
export const USE_TEST_PROVIDER = true;
export const PI_TIMEOUT = Number(process.env.PI_TEST_TIMEOUT ?? "120000");

export interface TestEnv {
	dir: string;
	backend: MuxBackend;
	workspaceId: string;
	surfaces: string[];
	tempFiles: string[];
	root: string;
	lab: Promise<RexLab>;
	resolvedLab?: RexLab;
	providers: Map<string, RexSurfaceProvider>;
}

export function getAvailableBackends(): MuxBackend[] {
	return process.env.REX_SESSION ? ["rex"] : [];
}

export function setBackend(_backend: MuxBackend): undefined {
	return undefined;
}

export function restoreBackend(_previous: string | undefined): void {}

export const TEST_MODEL_NAME = TEST_MODEL;
export { TEST_MODEL };
export { shellQuote };

const surfaceProviders = new Map<string, RexSurfaceProvider>();
let currentLab: RexLab | undefined;

export function createTestEnv(_backend: MuxBackend): TestEnv {
	const root = mkdtempSync(join(tmpdir(), "pi-integ-rex-"));
	return {
		dir: join(root, "project"),
		backend: "rex",
		workspaceId: "",
		surfaces: [],
		tempFiles: [],
		root,
		lab: createRexLab({ root }),
		providers: new Map(),
	};
}

async function ready(env: TestEnv): Promise<RexLab> {
	if (!env.resolvedLab) {
		env.resolvedLab = await env.lab;
		env.workspaceId = env.resolvedLab.sessionId;
	}
	currentLab = env.resolvedLab;
	return env.resolvedLab;
}

async function providerFor(env: TestEnv): Promise<RexSurfaceProvider> {
	const lab = await ready(env);
	const existing = env.providers.get(lab.sessionId);
	if (existing) return existing;
	const provider = new RexSurfaceProvider({
		sessionId: lab.sessionId,
		cli: new RexCli({ env: lab.env }),
		anchorBlockId: lab.parentBlockId,
		worktreeRoot: join(lab.root, "worktrees"),
	});
	env.providers.set(lab.sessionId, provider);
	currentLab = lab;
	return provider;
}

export async function cleanupTestEnv(env: TestEnv): Promise<void> {
	if (env.resolvedLab) await destroyRexLab(env.resolvedLab);
	else await env.lab.catch(() => undefined);
}

export async function createTrackedSurface(
	env: TestEnv,
	name: string,
): Promise<string> {
	const provider = await providerFor(env);
	const surface = await provider.createSurface({ name, cwd: env.dir });
	env.surfaces.push(surface);
	surfaceProviders.set(surface, provider);
	return surface;
}

export async function inspectPane(surface: string) {
	const provider = surfaceProviders.get(surface);
	if (!provider) throw new Error(`Rex surface ${surface} is not tracked`);
	return provider.inspectSurface(surface);
}

export async function waitForPaneReady(
	surface: string,
	timeout = PI_TIMEOUT,
): Promise<void> {
	const provider = surfaceProviders.get(surface);
	if (!provider) return;
	await provider.waitForShellReady(surface, { timeoutMs: timeout });
}

export function untrackSurface(env: TestEnv, surface: string): void {
	env.surfaces = env.surfaces.filter((id) => id !== surface);
}

export async function startPi(
	surface: string,
	testDir: string,
	task: string,
	opts?: { model?: string; extraArgs?: string },
): Promise<void> {
	const lab = currentLab;
	if (!lab) throw new Error("Rex integration fixture is not active");
	const model = opts?.model ?? TEST_MODEL;
	const agentDir = lab.agentDir;
	const extra = opts?.extraArgs ?? "";
	const command = [
		`cd ${shellQuote(testDir)} &&`,
		`PI_CODING_AGENT_DIR=${shellQuote(agentDir)}`,
		`pi -ne -e ${shellQuote(EXTENSION_SOURCE)}`,
		`--model ${shellQuote(model)}`,
		extra,
		shellQuote(task),
		`; echo '__TEST_DONE_'$?'__'`,
	]
		.filter(Boolean)
		.join(" ");
	await lab.cli.runCommand(lab.sessionId, surface, command);
}

export async function runInPane(
	surface: string,
	command: string,
): Promise<void> {
	if (!currentLab) throw new Error("Rex integration fixture is not active");
	await currentLab.cli.runCommand(currentLab.sessionId, surface, command);
}

export function readPane(surface: string, lines = 200): string {
	if (!currentLab) throw new Error("Rex integration fixture is not active");
	const output = execFileSync(
		rexBinary(),
		buildRexArgv([
			"capture",
			"-s",
			currentLab.sessionId,
			"-b",
			surface,
			"--format=text",
			"--trim",
		]),
		{ encoding: "utf8", env: currentLab.env },
	);
	const text = output.trimEnd();
	if (!lines) return `${text}\n`;
	return `${text.split("\n").slice(-lines).join("\n")}\n`;
}

export async function readPaneAsync(
	surface: string,
	lines = 200,
): Promise<string> {
	if (!currentLab) throw new Error("Rex integration fixture is not active");
	return currentLab.cli.capture(currentLab.sessionId, surface, {
		lines,
		trim: true,
	});
}

export async function closePane(surface: string): Promise<void> {
	if (!currentLab) return;
	await currentLab.cli.closeBlock(currentLab.sessionId, surface);
}

export async function interruptPane(surface: string): Promise<void> {
	if (!currentLab) return;
	await currentLab.cli.sendKey(currentLab.sessionId, surface, "Escape");
}

export async function waitForScreen(
	surface: string,
	pattern: RegExp,
	timeout = PI_TIMEOUT,
	lines = 200,
): Promise<string> {
	const deadline = Date.now() + timeout;
	let screen = "";
	while (Date.now() < deadline) {
		screen = await readPaneAsync(surface, lines).catch(() => "");
		if (pattern.test(screen)) return screen;
		await sleep(100);
	}
	throw new Error(`Timeout (${timeout}ms) waiting for ${pattern}: ${screen}`);
}

export async function waitForFile(
	path: string,
	timeout = PI_TIMEOUT,
	pattern?: RegExp,
): Promise<string> {
	return waitForLabFile(
		path,
		(content) => !pattern || pattern.test(content),
		timeout,
	);
}

export async function waitForPiExit(
	surface: string,
	timeout = PI_TIMEOUT,
): Promise<number> {
	const screen = await waitForScreen(surface, /__TEST_DONE_(\d+)__/, timeout);
	return Number(screen.match(/__TEST_DONE_(\d+)__/)?.[1] ?? -1);
}

export function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function uniqueId(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function trackTempFile(env: TestEnv, path: string): void {
	env.tempFiles.push(path);
}

export function getFocusedSurface(_backend: MuxBackend): string | null {
	return null;
}

export function focusSurface(_backend: MuxBackend, _surface: string): void {}
export function getSurfacePane(_backend: MuxBackend, surface: string): string {
	return surface;
}
export async function waitForFocusedSurface(
	_backend: MuxBackend,
	_surface: string,
	_timeout = PI_TIMEOUT,
): Promise<void> {}
