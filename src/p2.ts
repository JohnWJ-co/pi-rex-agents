/**
 * P2 integration probe: cancel, interrupt and resume against real Rex surfaces.
 *
 * This uses the upstream pi-herdr-agents tools through a fake Pi extension host,
 * but the child processes, Rex blocks and status probes are real.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import piRexAgentsExtension from "./extension.ts";
import { flattenBlocks, RexCli } from "./rex-cli.ts";
import { RexSurfaceProvider } from "./rex-surface-provider.ts";

type Handler = (...args: any[]) => unknown;

const rexSession = process.env.REX_SESSION;
const rexBlock = process.env.REX_BLOCK;
if (!rexSession || !rexBlock) {
  throw new Error("P2 must run inside a Rex block (REX_SESSION/REX_BLOCK)");
}
if (process.env.PI_SUBAGENT_ID) {
  throw new Error("P2 must run as the parent, not as a child subagent");
}
const parentSessionFile = process.env.PI_SESSION_FILE;
if (!parentSessionFile) {
  throw new Error("PI_SESSION_FILE is required for the parent session");
}

const header = JSON.parse(
  readFileSync(parentSessionFile, "utf8").split("\n")[0] ?? "{}",
) as { id?: string; cwd?: string };
const parentSessionId = header.id ?? "unknown";
const parentSessionDir = dirname(parentSessionFile);
const cwd = process.env.P2_CWD ?? process.cwd();
const modelOverride = process.env.P2_MODEL?.split("/");
const model = {
  provider: modelOverride?.[0] || "CBAPI",
  id: modelOverride?.slice(1).join("/") || "cn:deepseek-v4.1-flash",
  name: modelOverride?.slice(1).join("/") || "Deepseek-V4.1-Flash",
  api: "openai-completions",
  baseUrl: "",
  reasoning: true,
  input: ["text"],
  contextWindow: 128000,
  maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const modelRegistry = {
  find(provider: string, modelId: string) {
    return provider === model.provider && modelId === model.id ? model : undefined;
  },
  getAvailable: () => [model],
  getAll: () => [model],
  hasConfiguredAuth: () => true,
};

const tools = new Map<string, any>();
const commands = new Map<string, any>();
const handlers = new Map<string, Handler[]>();
const messages: any[] = [];
const notifications: string[] = [];
const widgets = new Map<string, { value: unknown; lines: string[]; options?: unknown }>();

function on(event: string, handler: Handler) {
  const list = handlers.get(event) ?? [];
  list.push(handler);
  handlers.set(event, list);
  return () => {};
}

const pi = {
  on,
  registerTool(tool: any) {
    tools.set(tool.name, tool);
  },
  registerCommand(command: any) {
    commands.set(command.name, command);
  },
  registerMessageRenderer() {},
  registerEntryRenderer() {},
  getActiveTools: () => [],
  getThinkingLevel: () => "low" as const,
  sendMessage(message: any) {
    messages.push(message);
  },
  sendUserMessage(message: any) {
    messages.push(message);
  },
  events: {
    on: () => () => {},
    emit() {},
  },
};

function renderWidget(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "function") {
    const component = (value as any)(undefined, {});
    if (component?.render) return component.render(120).map(String);
  }
  return [String(value)];
}

const ctx: any = {
  ui: {
    setWidget(name: string, value: unknown, options?: unknown) {
      if (!value) {
        widgets.delete(name);
        return;
      }
      widgets.set(name, { value, lines: renderWidget(value), options });
    },
    notify(message: string) {
      notifications.push(message);
    },
  },
  mode: "tui",
  hasUI: true,
  cwd,
  sessionManager: {
    getCwd: () => cwd,
    getSessionDir: () => parentSessionDir,
    getSessionId: () => parentSessionId,
    getSessionFile: () => parentSessionFile,
    getLeafId: () => null,
    getLeafEntry: () => undefined,
    getEntry: () => undefined,
    getLabel: () => undefined,
    getBranch: () => [],
    buildContextEntries: () => [],
    buildSessionProjection: () => ({ entries: [], messages: [], thinkingLevel: "low", model: null }),
    getHeader: () => header,
    getEntries: () => [],
    getTree: () => [],
    getSessionName: () => undefined,
  },
  modelRegistry,
  model,
  scopedModels: [],
  thinkingLevel: "low",
  isIdle: () => true,
  isProjectTrusted: () => true,
  signal: undefined,
  abort() {},
  hasPendingMessages: () => false,
  shutdown() {},
  getContextUsage: () => undefined,
  compact() {},
  getSystemPrompt: () => "",
  tools: [],
  executeTool: async () => ({ isError: true, content: [] }),
};

piRexAgentsExtension(pi as never);
await emitSessionStart();

const provider = new RexSurfaceProvider({ sessionId: rexSession, anchorBlockId: rexBlock });
const subagentTool = requireTool("subagent");
const cancelTool = requireTool("subagent_cancel");
const interruptTool = requireTool("subagent_interrupt");
const resumeTool = requireTool("subagent_resume");
const listTool = requireTool("subagents_list");

async function emitSessionStart() {
  for (const handler of handlers.get("session_start") ?? []) {
    await handler({ type: "session_start", reason: "startup" }, ctx);
  }
}

function requireTool(name: string): any {
  const tool = tools.get(name);
  if (!tool) throw new Error(`${name} tool was not registered`);
  return tool;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function surfaceIds(): Promise<Set<string>> {
  return new Set((await provider.listSurfaces()).map((surface) => surface.id));
}

async function waitForNewSurface(before: Set<string>, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = await provider.listSurfaces();
    const added = now.find((surface) => !before.has(surface.id));
    if (added) return added.id;
    await sleep(300);
  }
  throw new Error("child surface was not created");
}

async function waitForStatus(
  surfaceId: string,
  wanted: string,
  timeoutMs = 30_000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let last: any;
  while (Date.now() < deadline) {
    last = await provider.inspectSurface(surfaceId);
    if (last.agentStatus === wanted) return last;
    await sleep(300);
  }
  throw new Error(`surface ${surfaceId} did not reach ${wanted}: ${JSON.stringify(last)}`);
}

async function waitForMessage(
  predicate: (message: any) => boolean,
  timeoutMs = 120_000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.find(predicate);
    if (found) return found;
    await sleep(500);
  }
  throw new Error(`message was not delivered within ${timeoutMs}ms`);
}

async function waitForWidget(name: string, timeoutMs = 30_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const widget = widgets.get(name);
    if (widget?.lines.some((line) => line.includes("Subagents"))) return widget.lines;
    await sleep(300);
  }
  throw new Error(`widget ${name} did not render`);
}

async function invoke(tool: any, name: string, args: any): Promise<any> {
  return tool.execute(name, args, undefined, () => {}, ctx);
}

const before = await surfaceIds();
const longTask =
  "Use the bash tool to run `sleep 30` and wait for it to finish. Then reply with exactly P2_LONG_DONE and nothing else.";
const started = await invoke(subagentTool, "p2-long", {
  name: "p2-long",
  task: longTask,
  cwd,
  model: `${model.provider}/${model.id}`,
  thinking: "low",
});
if (started?.details?.error || started?.details?.launchFailure) {
  throw new Error(`long child failed to launch: ${JSON.stringify(started)}`);
}
const longSurface = await waitForNewSurface(before);
const longWorking = await waitForStatus(longSurface, "working");
const longWidget = await waitForWidget("subagent-status");

const cancelled = await invoke(cancelTool, "p2-cancel", {
  id: started.details.id,
});
await waitForMessage(
  (message) =>
    JSON.stringify(message).includes("p2-long") &&
    JSON.stringify(message).includes("cancelled"),
  60_000,
);
await provider.waitForSurfaceAbsence(longSurface, { timeoutMs: 20_000 });

const beforeInterrupt = await surfaceIds();
const interruptTask =
  "Use the bash tool to run `sleep 30` and wait for it to finish. Then reply with exactly P2_INTERRUPT_DONE and nothing else.";
const interruptStarted = await invoke(subagentTool, "p2-interrupt", {
  name: "p2-interrupt",
  task: interruptTask,
  cwd,
  model: `${model.provider}/${model.id}`,
  thinking: "low",
});
if (interruptStarted?.details?.error || interruptStarted?.details?.launchFailure) {
  throw new Error(`interrupt child failed to launch: ${JSON.stringify(interruptStarted)}`);
}
const interruptSurface = await waitForNewSurface(beforeInterrupt);
await waitForStatus(interruptSurface, "working");
const interrupted = await invoke(interruptTool, "p2-interrupt-tool", {
  id: interruptStarted.details.id,
});
if (interrupted?.details?.status !== "interrupt_requested") {
  throw new Error(`unexpected interrupt result: ${JSON.stringify(interrupted)}`);
}
const interruptCancel = await invoke(cancelTool, "p2-cancel-interrupt", {
  id: interruptStarted.details.id,
});
await waitForMessage(
  (message) =>
    JSON.stringify(message).includes("p2-interrupt") &&
    JSON.stringify(message).includes("cancelled"),
  60_000,
);
await provider.waitForSurfaceAbsence(interruptSurface, { timeoutMs: 20_000 });

const resume = await invoke(resumeTool, "p2-resume", {
  sessionPath: started.details.sessionFile,
  name: "p2-resume",
  message: "Reply with exactly P2_RESUMED_OK and nothing else.",
  autoExit: true,
});
if (resume?.details?.error) {
  throw new Error(`resume failed: ${JSON.stringify(resume)}`);
}
const resumedMessage = await waitForMessage(
  (message) => JSON.stringify(message).includes("P2_RESUMED_OK"),
  120_000,
);

const sessionCheck = await new RexCli().inspectSession(rexSession);
const parentSurvived = flattenBlocks(sessionCheck).some(
  ({ block }) => block.block_id === rexBlock,
);
const list = await invoke(listTool, "p2-list", {});

const result = {
  ok:
    Boolean(parentSurvived) &&
    cancelled?.details?.status !== "unconfirmed" &&
    interrupted?.details?.status === "interrupt_requested" &&
    Boolean(resume?.details?.id) &&
    Boolean(resumedMessage),
  parentSurvived,
  long: {
    id: started.details.id,
    surface: longSurface,
    working: longWorking.agentStatus,
    widget: longWidget,
    cancel: cancelled?.details,
  },
  interrupt: {
    id: interruptStarted.details.id,
    surface: interruptSurface,
    request: interrupted?.details,
    cancel: interruptCancel?.details,
  },
  resume: {
    id: resume?.details?.id,
    status: resume?.details?.status,
    message: resumedMessage ? "P2_RESUMED_OK" : null,
  },
  list: list?.details,
  notifications,
};

console.log(JSON.stringify(result, null, 2));

await emitShutdown();
if (!result.ok) process.exitCode = 1;

async function emitShutdown() {
  for (const handler of handlers.get("session_shutdown") ?? []) {
    await handler({ type: "session_shutdown", reason: "quit" }, ctx);
  }
}
