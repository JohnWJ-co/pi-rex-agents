/**
 * The Pi API surface Rex hands to the upstream orchestration kernel.
 *
 * The kernel registers every tool and command through the API object it is
 * given. This proxy rewords tool descriptions, command output and messages;
 * placement parameters and launch policy are owned by the kernel.
 */
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { rewriteRexHostText } from "./host-message.ts";
import { rexifyResultDetails, rexifySchema, rexifyText } from "./rex-wording.ts";

type AnyTool = ToolDefinition<any, any, any>;

function rexifyToolResult(
  result: AgentToolResult<unknown>,
): AgentToolResult<unknown> {
  const content = Array.isArray(result.content)
    ? result.content.map((item) =>
        item && item.type === "text"
          ? { ...item, text: rexifyText(item.text) }
          : item,
      )
    : result.content;
  if (result.details === undefined) return { ...result, content };
  return {
    ...result,
    content,
    details: rexifyResultDetails(result.details),
  };
}

function wrapExecute(tool: AnyTool): AnyTool["execute"] {
  const original = tool.execute.bind(tool) as (
    ...args: any[]
  ) => Promise<AgentToolResult<unknown>>;
  return (async (...args) => rexifyToolResult(await original(...args))) as AnyTool["execute"];
}

function adaptTool(tool: AnyTool): AnyTool {
  return {
    ...tool,
    description: rexifyText(tool.description),
    parameters: rexifySchema(tool.parameters),
    ...(tool.promptSnippet === undefined
      ? {}
      : { promptSnippet: rexifyText(tool.promptSnippet) }),
    execute: wrapExecute(tool),
  };
}

/**
 * Command output names the containing resource. Rex calls it a window; the
 * kernel inherited "workspace" from its original host.
 */
function rexifyCommandContext(
  ctx: ExtensionCommandContext,
): ExtensionCommandContext {
  const ui = ctx.ui;
  if (!ui) return ctx;
  const shadowUi = Object.create(ui) as typeof ui;
  shadowUi.notify = ((message: string, ...rest: unknown[]) =>
    ui.notify(
      typeof message === "string" ? rexifyText(message) : message,
      ...(rest as [Parameters<typeof ui.notify>[1]]),
    )) as typeof ui.notify;
  const shadow = Object.create(ctx) as ExtensionCommandContext;
  shadow.ui = shadowUi;
  return shadow;
}

type CommandDefinition = Omit<RegisteredCommand, "name" | "sourceInfo">;

function adaptCommand(command: CommandDefinition): CommandDefinition {
  return {
    ...command,
    handler: (args, ctx) => command.handler(args, rexifyCommandContext(ctx)),
  };
}

/** Build the API proxy the upstream extension registers everything through. */
export function createRexHostApi(pi: ExtensionAPI): ExtensionAPI {
  const hostApi = Object.create(pi) as ExtensionAPI;

  const registerTool = pi.registerTool.bind(pi) as (tool: AnyTool) => void;
  hostApi.registerTool = ((tool: AnyTool) => {
    registerTool(adaptTool(tool));
  }) as ExtensionAPI["registerTool"];

  const registerCommand = pi.registerCommand.bind(pi);
  hostApi.registerCommand = ((name, command) =>
    registerCommand(name, adaptCommand(command))) as ExtensionAPI["registerCommand"];

  const sendMessage = pi.sendMessage.bind(pi);
  hostApi.sendMessage = ((message, options) =>
    sendMessage(
      rewriteRexHostText(message),
      options,
    )) as ExtensionAPI["sendMessage"];

  return hostApi;
}
