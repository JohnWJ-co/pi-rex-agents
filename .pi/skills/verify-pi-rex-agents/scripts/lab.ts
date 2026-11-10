#!/usr/bin/env -S node --experimental-strip-types
/**
 * Isolated Rex verification lab. The lab server, fake provider, parent Pi and
 * child blocks all run under one pira-lab-* root. No legacy host APIs are used.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  childBlocks,
  createRexLab,
  destroyRexLab,
  EXTENSION_SOURCE,
  flattenBlocks,
  PI_TIMEOUT,
  PROJECT_ROOT,
  readSession,
  rexAvailable,
  sendParentPrompt,
  startParentPi,
  waitForBlock,
  waitForFile,
  waitForReport,
  waitForSessionEntry,
  type RexLab,
  type RexSessionEntry,
} from "../../../../test/integration/rex-harness.ts";
import { RexCli } from "../../../../maestro/surfaces/rex/rex-cli.ts";
import { getSubagentResultFile, readSubagentResult } from "../../../../maestro/adapters/pi/session.ts";
import { isRecord, isString } from "../../../../maestro/core/config/type-guards.ts";

const SELF = fileURLToPath(import.meta.url);
const CURRENT = join(tmpdir(), "pira-lab-current.json");
const REPO = resolveRepo();

interface LabState {
  root: string;
  socket: string;
  endpoint: string;
  stateDir: string;
  project: string;
  agentDir: string;
  parentSession: string;
  sessionId: string;
  parentBlockId: string;
  serverPid: number;
  helperPid: number;
  ready: boolean;
  failed?: string;
  whoami?: Record<string, unknown>;
}

function resolveRepo(): string {
  return process.env.PI_REX_REPO ?? PROJECT_ROOT;
}

function say(value: unknown): void {
  process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}

function writeState(state: LabState): void {
  writeFileSync(join(state.root, "state.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(CURRENT, `${state.root}\n`, { mode: 0o600 });
}

function readState(): LabState {
  if (!existsSync(CURRENT)) throw new Error(`no current Rex lab (${CURRENT})`);
  const root = readFileSync(CURRENT, "utf8").trim();
  if (!root || basename(root).startsWith("pira-lab-") === false || !root.startsWith(`${tmpdir()}/`)) {
    throw new Error(`refusing unsafe Rex lab root: ${root}`);
  }
  const statePath = join(root, "state.json");
  if (!existsSync(statePath)) throw new Error(`Rex lab state is missing: ${statePath}`);
  const state = JSON.parse(readFileSync(statePath, "utf8")) as LabState;
  if (state.root !== root || state.socket !== join(root, "s")) throw new Error("Rex lab state path mismatch");
  return state;
}

function integrationSuites(): string[] {
  if (!existsSync("/proc")) return [];
  const found: string[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    try {
      const argv = readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0");
      if (/^node/.test(basename(argv[0] ?? "")) && argv.some((arg) => arg.includes("test/integration/"))) {
        found.push(`${entry} ${argv.join(" ").trim().slice(0, 180)}`);
      }
    } catch {
      // The process ended or is not readable.
    }
  }
  return found;
}

function version(binary: string): string {
  try {
    return execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
  }
}

async function doctor(): Promise<number> {
  let failed = 0;
  const report = (ok: boolean, label: string, detail: string) => {
    if (!ok) failed++;
    say(`${ok ? "OK" : "FAIL"} ${label}: ${detail}`);
  };
  const available = rexAvailable();
  report(available.ok, "rex", available.ok ? available.version : available.reason);
  report(Boolean(process.env.REX_SESSION), "REX_SESSION", process.env.REX_SESSION ?? "unset");
  report(Boolean(process.env.REX_BLOCK), "REX_BLOCK", process.env.REX_BLOCK ?? "unset");
  report(Boolean(process.env.PI_BIN ?? "pi"), "pi", version(process.env.PI_BIN ?? "pi"));
  report(Boolean(process.execPath), "node", `${process.execPath} v${process.versions.node}`);
  report(existsSync(EXTENSION_SOURCE), "extension", EXTENSION_SOURCE);
  const suites = integrationSuites();
  report(suites.length === 0, "integration suites running", suites.length ? suites.join(" | ") : "none");
  try {
    const state = readState();
    const cli = new RexCli({ env: { ...process.env, REX_SERVER: state.endpoint } });
    const whoami = JSON.parse((await cli.run(["whoami", "--json"])).stdout) as { endpoint?: string };
    report(whoami.endpoint === state.endpoint, "lab", `${state.root} endpoint=${whoami.endpoint ?? "missing"}`);
  } catch (error) {
    say(`OK lab: no current live lab (${error instanceof Error ? error.message : String(error)})`);
  }
  return failed ? 1 : 0;
}

async function serve(root: string): Promise<void> {
  let lab: RexLab | undefined;
  let stopping = false;
  const keepAlive = setInterval(() => {}, 1_000);
  const stop = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    if (lab) await destroyRexLab(lab);
    clearInterval(keepAlive);
    if (existsSync(CURRENT) && readFileSync(CURRENT, "utf8").trim() === root) rmSync(CURRENT, { force: true });
    writeFileSync(join(root, "cleanup.json"), `${JSON.stringify({ reason, removed: !existsSync(root) }, null, 2)}\n`);
    process.exit(0);
  };
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.on(signal, () => void stop(signal));
  try {
    lab = await createRexLab({ root });
    const whoami = JSON.parse((await lab.cli.run(["whoami", "--json"])).stdout) as Record<string, unknown>;
    const state: LabState = {
      root: lab.root,
      socket: lab.socket,
      endpoint: lab.endpoint,
      stateDir: lab.stateDir,
      project: lab.project,
      agentDir: lab.agentDir,
      parentSession: lab.parentSession,
      sessionId: lab.sessionId,
      parentBlockId: lab.parentBlockId,
      serverPid: lab.server.pid ?? 0,
      helperPid: process.pid,
      ready: false,
      whoami,
    };
    writeState(state);
    await startParentPi(lab);
    state.ready = true;
    writeState(state);
    say(`LAB_READY root=${lab.root} session=${lab.sessionId} parent=${lab.parentBlockId}`);
    await new Promise<void>(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (lab) {
      try { await destroyRexLab(lab); } catch { /* preserve startup error */ }
    }
    clearInterval(keepAlive);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeFileSync(join(root, "state.json"), `${JSON.stringify({ root, ready: false, failed: message }, null, 2)}\n`);
    writeFileSync(join(root, "cleanup.json"), `${JSON.stringify({ reason: "startup failure", removed: !existsSync(root) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

function drivePrompt(state: LabState): string {
  return `Call the subagent tool with these EXACT parameters: name: "RexSmoke" agent: "test-echo" task: "Return exactly REX_SMOKE_CHILD" Do not do anything else. After you receive the subagent result, say REX_SMOKE_PARENT_CONTINUED.`;
}

async function drive(): Promise<number> {
  const state = readState();
  if (!state.ready) throw new Error(state.failed ?? "Rex lab is not ready");
  const env = { ...process.env, REX_SERVER: state.endpoint, PI_CODING_AGENT_DIR: state.agentDir };
  const cli = new RexCli({ env });
  const before = (await cli.inspectSession(state.sessionId)).windows.flatMap((window) => window.layers.flatMap((layer) => layer.blocks.map((block) => block.block_id)));
  await cli.sendText(state.sessionId, state.parentBlockId, drivePrompt(state));
  await cli.sendKey(state.sessionId, state.parentBlockId, "enter");
  const during = await waitForBlock({ ...state, cli } as unknown as Pick<RexLab, "cli" | "sessionId" | "parentBlockId">, (ids) => ids.some((id) => !before.includes(id)), "child block creation");
  const lab = { ...state, cli } as unknown as Pick<RexLab, "cli" | "sessionId" | "parentBlockId" | "parentSession">;
  const delivered = await waitForReport(lab, "RexSmoke");
  if (!String(delivered.report.content).includes("REX_SMOKE_CHILD")) {
    throw new Error("RexSmoke report did not contain the child result");
  }
  const continued = await waitForSessionEntry(state.parentSession, (entry) => {
    const content = JSON.stringify(entry.content ?? entry.message?.content ?? "");
    return entry.type === "message" && entry.message?.role === "assistant" && content.includes("REX_SMOKE_PARENT_CONTINUED");
  });
  const after = await waitForBlock(lab, (ids) => ids.every((id) => id === state.parentBlockId), "child block cleanup");
  if (!delivered.childSession) throw new Error("RexSmoke report has no child session");
  const resultFile = getSubagentResultFile(delivered.childSession);
  const raw: unknown = JSON.parse(readFileSync(resultFile, "utf8"));
  if (!isRecord(raw) || !isString(raw.subagentId) || !isString(raw.taskId) || !isString(raw.generation)) throw new Error("RexSmoke result identity is missing");
  const result = readSubagentResult(delivered.childSession, { subagentId: raw.subagentId, taskId: raw.taskId, generation: raw.generation });
  if (!result || result.status !== "done" || result.finalText !== "REX_SMOKE_CHILD" || !String(delivered.report.content).includes(result.finalText)) throw new Error("RexSmoke result does not match delivery");
  const exitcode = Number((await waitForFile(`${delivered.childSession}.exitcode`, (content) => content.trim() === "0")).trim());
  const evidence = {
    endpoint: state.endpoint,
    whoami: state.whoami,
    parentSession: state.parentSession,
    parentBlockId: state.parentBlockId,
    blocksBefore: before,
    blocksDuring: during,
    blocksAfter: after,
    childSession: delivered.childSession,
    childSessionExists: Boolean(delivered.childSession && existsSync(delivered.childSession)),
    resultFile,
    result,
    exitcode,
    report: delivered.report,
    parentContinued: Boolean(continued),
  };
  writeFileSync(join(state.root, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  say(evidence);
  return 0;
}

async function up(): Promise<number> {
  if (integrationSuites().length) throw new Error("an integration suite is already running");
  const root = await import("node:fs").then(({ mkdtempSync: makeTemp }) => makeTemp(join(tmpdir(), "pira-lab-")));
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const child = spawn(process.execPath, ["--experimental-strip-types", SELF, "serve", root], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PI_REX_REPO: REPO },
  });
  child.unref();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (existsSync(join(root, "state.json"))) {
      const state = JSON.parse(readFileSync(join(root, "state.json"), "utf8")) as LabState;
      if (state.ready) {
        say(`LAB_READY root=${root} session=${state.sessionId} parent=${state.parentBlockId}`);
        return 0;
      }
      if (state.failed) throw new Error(state.failed);
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Rex lab did not become ready in 90s: ${root}`);
}

async function down(): Promise<number> {
  const state = readState();
  if (state.helperPid && state.helperPid !== process.pid) {
    try { process.kill(state.helperPid, "SIGTERM"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  const deadline = Date.now() + 15_000;
  while (existsSync(state.root) && Date.now() < deadline) {
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (existsSync(state.root)) throw new Error(`Rex lab did not clean up: ${state.root}`);
  if (existsSync(CURRENT) && readFileSync(CURRENT, "utf8").trim() === state.root) rmSync(CURRENT, { force: true });
  say(`LAB_DOWN root=${state.root} labRootExists=${existsSync(state.root)} leftoverPids=none`);
  return 0;
}

const [command] = process.argv.slice(2);
let exitCode = 0;
try {
  if (command === "doctor") exitCode = await doctor();
  else if (command === "up") exitCode = await up();
  else if (command === "serve") await serve(process.argv[3] ?? "");
  else if (command === "drive") exitCode = await drive();
  else if (command === "down") exitCode = await down();
  else {
    say("usage: lab.ts doctor|up|drive|down");
    exitCode = command ? 1 : 0;
  }
} catch (error) {
  say(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
}
if (command !== "serve") process.exit(exitCode);
