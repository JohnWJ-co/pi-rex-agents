/**
 * Host-surface checks that do not need a live Rex session.
 *
 * Runs the real extension against a stub Pi API to prove that what the model
 * sees is Rex-only, that the subagent tools expose a placement, and that the
 * placement reaches the surface provider through the launch operations.
 */
import assert from "node:assert/strict";
import piRexAgentsExtension from "./extension.ts";
import { createRexHostApi } from "./rex-host-api.ts";
import { createRexInfrastructure, REX_PANE_CONFIG } from "./infrastructure.ts";
import { childPlacement } from "./placement.ts";
import { RexSurfaceProvider } from "../maestro/surfaces/rex/rex-surface-provider.ts";
import { rexifyText } from "./rex-wording.ts";

type Handler = (...args: any[]) => unknown;

interface FakePi {
  pi: any;
  tools: any[];
  commands: any[];
  handlers: Map<string, Handler[]>;
  messages: any[];
}

function makeFakePi(): FakePi {
  const tools: any[] = [];
  const commands: any[] = [];
  const handlers = new Map<string, Handler[]>();
  const messages: any[] = [];
  const pi: any = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {};
    },
    registerTool(tool: any) {
      tools.push(tool);
    },
    registerCommand(name: string, command: any) {
      commands.push({ ...command, name });
    },
    registerMessageRenderer() {},
    getActiveTools() {
      return [];
    },
    getThinkingLevel() {
      return "medium";
    },
    sendMessage(message: any, options: any) {
      messages.push({ message, options });
    },
    sendUserMessage() {},
    events: {
      on() {
        return () => {};
      },
      emit() {},
    },
  };
  return { pi, tools, commands, handlers, messages };
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) strings(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

// ── The real extension's tool surface ──────────────────────────────────────
process.env.REX_SESSION = "session:wording";
process.env.REX_BLOCK = "block:wording";
delete process.env.PI_SUBAGENT_ID;

const host = makeFakePi();
piRexAgentsExtension(host.pi);

assert.equal(host.tools.length, 10, "expected ten registered tools");

const leaked = host.tools.flatMap((tool) =>
  strings({
    description: tool.description,
    promptSnippet: tool.promptSnippet,
    parameters: tool.parameters,
  })
    .filter((text) => /herdr/i.test(text))
    .map((text) => `${tool.name}: ${text}`),
);
assert.deepEqual(leaked, [], `Herdr wording leaked into tool definitions:\n${leaked.join("\n")}`);

for (const name of ["subagent", "subagent_resume"]) {
  const tool = host.tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `${name} is registered`);
  const placement = tool.parameters?.properties?.placement;
  assert.deepEqual(placement?.enum, ["split", "tab"], `${name} exposes placement`);
}

// ── The host notice reaches the system prompt ──────────────────────────────
const starts = host.handlers.get("before_agent_start") ?? [];
assert.equal(starts.length, 1, "one before_agent_start handler");
const event: any = { systemPromptOptions: { appendSystemPrompt: "" } };
starts[0](event, {});
assert.match(event.systemPromptOptions.appendSystemPrompt, /\[Rex host\]/);
assert.match(event.systemPromptOptions.appendSystemPrompt, /placement "tab"/);
assert.match(event.systemPromptOptions.appendSystemPrompt, /session session:wording/);

// The handler must be idempotent for a prompt that already carries the notice.
starts[0](event, {});
assert.equal(
  event.systemPromptOptions.appendSystemPrompt.match(/\[Rex host\]/g)?.length,
  1,
  "the notice is appended once",
);

// ── A child is a leaf and is told so ───────────────────────────────────────
process.env.PI_SUBAGENT_ID = "child-1";
const childHost = makeFakePi();
piRexAgentsExtension(childHost.pi);
assert.equal(childHost.tools.length, 0, "a child registers no tools");
const childStarts = childHost.handlers.get("before_agent_start") ?? [];
assert.equal(childStarts.length, 1, "a child gets one host notice");
const childEvent: any = { systemPromptOptions: { appendSystemPrompt: "" } };
childStarts[0](childEvent, {});
assert.match(childEvent.systemPromptOptions.appendSystemPrompt, /\[Rex child\]/);
assert.match(childEvent.systemPromptOptions.appendSystemPrompt, /leaf/);
delete process.env.PI_SUBAGENT_ID;

// ── Placement reaches the provider ────────────────────────────────────────
class FakeProvider {
  readonly name = "rex";
  readonly placements: unknown[] = [];
  isAvailable() {
    return true;
  }
  async createSurface(options: any) {
    this.placements.push(options.placement);
    return "block:fake";
  }
  async listSurfaces() {
    return [];
  }
  async inspectSurface() {
    return {
      kind: "missing",
      present: "missing",
      agentStatus: "unknown",
      observedAt: Date.now(),
    };
  }
}

const provider = new FakeProvider();
const infrastructure = createRexInfrastructure(provider as never);

await infrastructure.launchOperations.createPane("default", "/tmp");
await childPlacement.run("tab", () =>
  infrastructure.launchOperations.createPane("tabbed", "/tmp"),
);
await childPlacement.run("split", () =>
  infrastructure.launchOperations.createPane("split", "/tmp"),
);
assert.deepEqual(provider.placements, [
  { kind: "split", direction: "right" },
  { kind: "tab" },
  { kind: "split", direction: "right" },
]);

// ── maxPerTab caps splits and grouped maps to the same capped split ───────
class CapProvider {
  readonly name = "rex";
  readonly placements: any[] = [];
  private next = 0;
  private readonly live = new Set<string>();
  async createSurface(options: any) {
    this.placements.push(options.placement);
    const id = `block:${++this.next}`;
    this.live.add(id);
    return id;
  }
  async listSurfaces() {
    return [...this.live].map((id) => ({ id }));
  }
  async closeSurface(id: string) {
    this.live.delete(id);
  }
  async waitForSurfaceAbsence() {}
  async inspectSurface() {
    return {
      kind: "missing",
      present: "missing",
      agentStatus: "unknown",
      observedAt: Date.now(),
    };
  }
}

const capped = new CapProvider();
const cappedInfrastructure = createRexInfrastructure(capped as never, {
  mode: "split",
  direction: "right",
  maxPerTab: 2,
});
const first = await cappedInfrastructure.launchOperations.createPane("a", "/tmp");
await cappedInfrastructure.launchOperations.createPane("b", "/tmp");
await cappedInfrastructure.launchOperations.createPane("c", "/tmp");
assert.deepEqual(
  capped.placements.map((placement) => placement.kind),
  ["split", "split", "tab"],
  "the third split opens a new tab",
);

// A closed child frees its slot.
await cappedInfrastructure.launchOperations.closePane(first);
await cappedInfrastructure.launchOperations.createPane("d", "/tmp");
assert.equal(capped.placements[3].kind, "split", "closing a child frees capacity");

// Explicit "split" obeys the same cap.
await childPlacement.run("split", () =>
  cappedInfrastructure.launchOperations.createPane("e", "/tmp"),
);
assert.equal(capped.placements[4].kind, "tab", "an explicit split is capped too");

// Concurrent launches reserve their slots instead of overshooting.
const concurrent = new CapProvider();
const concurrentInfrastructure = createRexInfrastructure(concurrent as never, {
  mode: "split",
  direction: "right",
  maxPerTab: 2,
});
await Promise.all(
  ["a", "b", "c", "d"].map((name) =>
    concurrentInfrastructure.launchOperations.createPane(name, "/tmp"),
  ),
);
const concurrentKinds = concurrent.placements.map((placement) => placement.kind);
assert.equal(concurrentKinds.filter((kind) => kind === "split").length, 2);
assert.equal(concurrentKinds.filter((kind) => kind === "tab").length, 2);

// Upstream's grouped mode becomes the same capped split in Rex.
const grouped = new CapProvider();
const groupedInfrastructure = createRexInfrastructure(grouped as never, {
  mode: "grouped",
  direction: "right",
  maxPerTab: 2,
});
for (const name of ["a", "b", "c"]) {
  await groupedInfrastructure.launchOperations.createPane(name, "/tmp");
}
assert.deepEqual(
  grouped.placements.map((placement) => placement.kind),
  ["split", "split", "tab"],
  "grouped splits up to the cap, then opens a tab",
);

// ── The tool wrapper strips placement and scopes it for the launch ─────────
const toolHost = makeFakePi();
const toolApi = createRexHostApi(toolHost.pi);
let observedPlacement: unknown = "untouched";
let seenParams: any;
toolApi.registerTool({
  name: "subagent",
  label: "Subagent",
  description:
    "Spawn a sub-agent in a dedicated terminal herdr pane, or in an isolated Herdr-managed Git worktree when worktree is provided. ",
  parameters: { type: "object", properties: { name: { type: "string" } } },
  async execute(_id: string, params: any) {
    seenParams = { ...params };
    observedPlacement = childPlacement.getStore() ?? "none";
    return { content: [{ type: "text", text: "ok" }] };
  },
} as any);

const wrapped = toolHost.tools[0];
assert.deepEqual(
  wrapped.parameters.properties.placement.enum,
  ["split", "tab"],
  "placement parameter is added",
);
assert.doesNotMatch(wrapped.description, /herdr/i);
await wrapped.execute("call-1", { name: "child", placement: "tab" }, undefined, undefined, {});
assert.equal(seenParams.placement, undefined, "placement is not forwarded upstream");
assert.equal(observedPlacement, "tab", "placement is scoped to the launch");

// ── Command output and messages use Rex labels ────────────────────────────
const commandHost = makeFakePi();
const commandApi = createRexHostApi(commandHost.pi);
commandApi.registerCommand("worktree", {
  description: "demo",
  handler: async (_args: string, ctx: any) => {
    ctx.ui.notify("Worktree launched in /tmp/wt (workspace window:abc).", "info");
  },
} as any);
const notices: Array<[string, string]> = [];
await commandHost.commands[0].handler("", {
  ui: {
    notify(message: string, kind: string) {
      notices.push([message, kind]);
    },
  },
});
assert.deepEqual(notices, [["Worktree launched in /tmp/wt (window window:abc).", "info"]]);

const messageHost = makeFakePi();
const messageApi = createRexHostApi(messageHost.pi);
messageApi.sendMessage({
  customType: "subagent_result",
  content:
    "Cancelled subagent \"x\": its pane was closed and Herdr confirmed it is gone.",
  display: true,
} as any);
assert.doesNotMatch(String(messageHost.messages[0].message.content), /Herdr/);
assert.match(String(messageHost.messages[0].message.content), /Rex confirmed/);

// ── A new tab names its block, not just the window ────────────────────────
class LabelCli {
  readonly renamed: Array<[string, string]> = [];
  async newWindow() {
    return { window_id: "window:x", block_ids: ["block:tab"], revision: 1 };
  }
  async split() {
    return { anchor_id: "block:a", block_ids: ["block:split"], revision: 1 };
  }
  async renameBlock(sessionId: string, blockId: string, label: string) {
    this.renamed.push([blockId, label]);
  }
}

class LabelProvider extends RexSurfaceProvider {
  override async waitForShellReady(): Promise<void> {}
}

const labelCli = new LabelCli();
const labelProvider = new LabelProvider({
  sessionId: "session:x",
  cli: labelCli as never,
  anchorBlockId: "block:a",
});
await labelProvider.createSurface({
  name: "child-tab",
  cwd: "/tmp",
  placement: { kind: "tab" },
});
await labelProvider.createSurface({
  name: "child-split",
  cwd: "/tmp",
  placement: { kind: "split", direction: "right" },
});
assert.deepEqual(
  labelCli.renamed,
  [["block:tab", "child-tab"]],
  "the tab block is renamed to the child name",
);

// ── Phrase table covers the known host literals ───────────────────────────
assert.equal(
  rexifyText("Worktree: /tmp/wt\nWorkspace: window:abc\n"),
  "Worktree: /tmp/wt\nWindow: window:abc\n",
);
assert.equal(
  rexifyText("Subagents require herdr. Start pi inside herdr."),
  "Subagents require Rex. Start pi inside herdr.",
);
assert.equal(
  rexifyText("Failed to send Escape ... via herdr: broke"),
  "Failed to send Escape ... via Rex: broke",
);
assert.equal(
  rexifyText("the child pane remains alive"),
  "the child block remains alive",
);
assert.equal(
  rexifyText("remove one managed worktree by exact path, branch, or workspace ID"),
  "remove one managed worktree by exact path, branch, or window ID",
);

console.log("rex host surface OK");
