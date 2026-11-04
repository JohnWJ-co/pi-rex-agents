/**
 * Load-level smoke test for the Pi extension.
 *
 * This does not execute a subagent; it proves the upstream pi-herdr-agents
 * extension can be constructed with the Rex infrastructure and registers its
 * public tools/commands in a plain Node process.
 */
import piRexAgentsExtension from "./extension.ts";

type Handler = (...args: any[]) => unknown;

const tools: string[] = [];
const commands: string[] = [];
const renderers: string[] = [];
const handlers = new Map<string, Handler[]>();

const pi = {
  on(event: string, handler: Handler) {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
    return () => {};
  },
  registerTool(tool: { name: string }) {
    tools.push(tool.name);
  },
  registerCommand(command: { name: string }) {
    commands.push(command.name);
  },
  registerMessageRenderer(name: string) {
    renderers.push(name);
  },
  getActiveTools() {
    return [];
  },
  getThinkingLevel() {
    return "medium";
  },
  sendMessage() {},
  sendUserMessage() {},
  events: {
    on() {
      return () => {};
    },
    emit() {},
  },
};

process.env.REX_SESSION = "session:smoke";
process.env.REX_BLOCK = "block:smoke";
delete process.env.PI_SUBAGENT_ID;

piRexAgentsExtension(pi as never);

const expectedTools = [
  "subagent",
  "subagent_cancel",
  "subagent_interrupt",
  "subagent_resume",
  "subagent_send",
  "subagent_stop",
  "subagents_list",
  "subagents_write_task_models",
  "worktree_list",
  "worktree_remove",
];
const missing = expectedTools.filter((name) => !tools.includes(name));

console.log(JSON.stringify({ tools, commands, renderers, missing }, null, 2));

if (missing.length > 0) {
  throw new Error(`missing tools: ${missing.join(", ")}`);
}
