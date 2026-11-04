/**
 * P1 integration probe: drive the real Pi extension through a fake extension
 * host, but use the actual Rex surface provider for the child process.
 *
 * This is deliberately a harness, not the final CLI. It proves that the
 * upstream `subagent` tool can launch a Pi child in Rex, observe its OSC 7501
 * status, and deliver the completion back to the parent extension.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import piRexAgentsExtension from "./extension.ts";
import { flattenBlocks, RexCli } from "./rex-cli.ts";

type Handler = (...args: any[]) => unknown;

const rexSession = process.env.REX_SESSION;
const rexBlock = process.env.REX_BLOCK;
if (!rexSession || !rexBlock) {
  throw new Error("P1 must run inside a Rex block (REX_SESSION/REX_BLOCK)");
}
if (process.env.PI_SUBAGENT_ID) {
  throw new Error("P1 must run as the parent, not as a child subagent");
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
const repoRoot = process.cwd();
const cwd = process.env.P1_CWD ?? repoRoot;
const useWorktree = process.argv.includes("--worktree");
const usePersistent = process.argv.includes("--persistent");
const worktreeBranch = `p1-wt-${Date.now()}`;

const modelOverride = process.env.P1_MODEL?.split("/");
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
  getAvailable() {
    return [model];
  },
  getAll() {
    return [model];
  },
  hasConfiguredAuth() {
    return true;
  },
};

const tools = new Map<string, any>();
const commands = new Map<string, any>();
const handlers = new Map<string, Handler[]>();
const messages: any[] = [];
const notifications: string[] = [];

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
  getActiveTools() {
    return [];
  },
  getThinkingLevel() {
    return "medium";
  },
  sendMessage(message: any) {
    messages.push(message);
  },
  sendUserMessage(message: any) {
    messages.push(message);
  },
  events: {
    on() {
      return () => {};
    },
    emit() {},
  },
};

const ctx: any = {
  ui: {
    setWidget() {},
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
    buildSessionProjection: () => ({ entries: [], messages: [], thinkingLevel: "medium", model: null }),
    getHeader: () => header,
    getEntries: () => [],
    getTree: () => [],
    getSessionName: () => undefined,
  },
  modelRegistry,
  model,
  scopedModels: [],
  thinkingLevel: "medium",
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

async function emit(event: string, payload: unknown) {
  for (const handler of handlers.get(event) ?? []) {
    await handler(payload, ctx);
  }
}

await emit("session_start", { type: "session_start" });

const subagentTool = tools.get("subagent");
const listTool = tools.get("subagents_list");
if (!subagentTool) throw new Error("subagent tool was not registered");
if (!listTool) throw new Error("subagents_list tool was not registered");

const started = await subagentTool.execute(
  "p1-subagent",
  {
    name: "p1-child",
    task: "Reply with exactly P1_CHILD_OK and nothing else.",
    cwd,
    model: `${model.provider}/${model.id}`,
    thinking: "medium",
    ...(useWorktree ? { worktree: { branch: worktreeBranch } } : {}),
    ...(usePersistent ? { persistent: true } : {}),
  },
  undefined,
  () => {},
  ctx,
);

console.log(JSON.stringify({ event: "started", result: started, useWorktree, worktreeBranch }, null, 2));

const deadline = Date.now() + 120_000;
let completion: any;
let lastList = "";
while (Date.now() < deadline) {
  const list = await listTool.execute("p1-list", {}, undefined, () => {}, ctx);
  const listText = JSON.stringify(list);
  if (listText !== lastList) {
    lastList = listText;
    console.log(JSON.stringify({ event: "list", at: new Date().toISOString(), list }, null, 2));
  }
  completion = messages.find(
    (message) =>
      JSON.stringify(message).includes("P1_CHILD_OK") ||
      message?.customType === "subagent_result" ||
      message?.type === "subagent_result",
  );
  // Persistent children are only idle after the completion turn has settled.
  // Sending while the child is still finalizing races the inbox poller and can
  // be acknowledged as a task without producing a second turn.
  const idle = listText.includes("| idle |");
  if (completion && (!usePersistent || idle)) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

let worktreeResult: unknown;
if (useWorktree) {
  const listWorktrees = tools.get("worktree_list");
  const removeWorktree = tools.get("worktree_remove");
  if (!listWorktrees || !removeWorktree) throw new Error("worktree tools were not registered");
  const before = await listWorktrees.execute("p1-wt-list", {}, undefined, () => {}, ctx);
  console.log(JSON.stringify({ event: "worktree_before", before }, null, 2));
  const target =
    (started as any)?.details?.worktree?.path ??
    (started as any)?.worktree?.path ??
    JSON.stringify(started).match(/\/Users\/[^\s"']*p1-wt-[^\s"']*/)?.[0];
  if (!target) throw new Error(`could not determine worktree path from ${JSON.stringify(started)}`);
  const removed = await removeWorktree.execute(
    "p1-wt-remove",
    { target },
    undefined,
    () => {},
    ctx,
  );
  const after = await listWorktrees.execute("p1-wt-list-after", {}, undefined, () => {}, ctx);
  worktreeResult = { before, target, removed, after };
  console.log(JSON.stringify({ event: "worktree_cleanup", worktreeResult }, null, 2));
}

let persistentResult: unknown;
if (usePersistent) {
  // The child appends its task-done event during agent_settled. Give that turn
  // a moment to finish before injecting the next user message.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const sendTool = tools.get("subagent_send");
  const stopTool = tools.get("subagent_stop");
  if (!sendTool || !stopTool) throw new Error("persistent control tools were not registered");
  const beforeSecond = messages.length;
  const sent = await sendTool.execute(
    "p1-send",
    { name: "p1-child", message: "Reply with exactly P1_SECOND_OK and nothing else." },
    undefined,
    () => {},
    ctx,
  );
  const secondDeadline = Date.now() + 120_000;
  let second: any;
  while (Date.now() < secondDeadline) {
    second = messages
      .slice(beforeSecond)
      .find((message) => JSON.stringify(message).includes("P1_SECOND_OK"));
    if (second) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const stopped = await stopTool.execute(
    "p1-stop",
    { name: "p1-child" },
    undefined,
    () => {},
    ctx,
  );
  persistentResult = { sent, second: second ?? null, stopped };
  console.log(JSON.stringify({ event: "persistent", persistentResult }, null, 2));
}

const sessionCheck = await new RexCli().inspectSession(rexSession);
const parentSurvived = flattenBlocks(sessionCheck).some(
  ({ block }) => block.block_id === rexBlock,
);

console.log(
  JSON.stringify(
    {
      event: "result",
      ok: Boolean(completion) && parentSurvived,
      parentSurvived,
      completion: completion ?? null,
      worktree: worktreeResult ?? null,
      persistent: persistentResult ?? null,
      notifications,
      messageCount: messages.length,
    },
    null,
    2,
  ),
);

await emit("session_shutdown", { type: "session_shutdown", reason: "quit" });

if (!completion || !parentSurvived || (usePersistent && !persistentResult)) {
  process.exitCode = 1;
}
