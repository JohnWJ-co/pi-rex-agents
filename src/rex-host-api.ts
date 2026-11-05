/**
 * The Pi API surface Rex hands to the upstream orchestration kernel.
 *
 * The kernel registers every tool and command through the API object it is
 * given, so this proxy is where Rex adapts the host-facing surface without
 * forking the kernel: tool descriptions and parameters are reworded, the
 * `subagent` tools gain a per-launch `placement`, command output is relabeled,
 * and delivered messages already pass through the host text rewrite.
 */
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { rewriteRexHostText } from "./host-message.ts";
import { childPlacement, resolvePlacement } from "./placement.ts";
import { rexifyResultDetails, rexifySchema, rexifyText } from "./rex-wording.ts";

type AnyTool = ToolDefinition<any, any, any>;

/** Tools that create a surface and therefore accept a placement. */
const PLACEMENT_TOOLS = new Set(["subagent", "subagent_resume"]);

const PLACEMENT_PROPERTY = {
  type: "string",
  enum: ["split", "tab"],
  description:
    'Where the child runs. "split" (default) opens a Rex block beside you in the current tab; "tab" opens the child in a new Rex tab (a Rex window). Worktree children always open in a new tab.',
} as const;

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

function wrapExecute(tool: AnyTool, withPlacement: boolean): AnyTool["execute"] {
  const original = tool.execute.bind(tool) as (
    ...args: any[]
  ) => Promise<AgentToolResult<unknown>>;

  return (async (toolCallId, params, signal, onUpdate, ctx) => {
    let launchParams = params;
    let placement: ReturnType<typeof resolvePlacement>;
    if (withPlacement && params && typeof params === "object") {
      const { placement: requested, ...rest } = params as Record<
        string,
        unknown
      >;
      launchParams = rest as typeof params;
      placement = resolvePlacement(requested);
    }
    const run = () =>
      original(toolCallId, launchParams, signal, onUpdate, ctx);
    const result = placement
      ? await childPlacement.run(placement, run)
      : await run();
    return rexifyToolResult(result);
  }) as AnyTool["execute"];
}

function adaptTool(tool: AnyTool): AnyTool {
  const parameters = rexifySchema(tool.parameters);
  const base: AnyTool = {
    ...tool,
    description: rexifyText(tool.description),
    parameters,
    ...(tool.promptSnippet === undefined
      ? {}
      : { promptSnippet: rexifyText(tool.promptSnippet) }),
  };
  if (!PLACEMENT_TOOLS.has(tool.name)) {
    return { ...base, execute: wrapExecute(tool, false) };
  }
  const properties = (parameters as { properties?: Record<string, unknown> })
    .properties;
  return {
    ...base,
    parameters: {
      ...(parameters as Record<string, unknown>),
      properties: { ...(properties ?? {}), placement: PLACEMENT_PROPERTY },
    } as AnyTool["parameters"],
    execute: wrapExecute(tool, true),
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
