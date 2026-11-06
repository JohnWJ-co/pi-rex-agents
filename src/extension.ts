/**
 * pi-rex-agents: Pi extension entry point.
 *
 * Loaded by Pi inside a Rex block. The actual orchestration is pi-herdr-agents;
 * this extension injects a Rex-backed SurfaceProvider and runtime composition.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import subagentsExtension from "../pi-extension/subagents/index.ts";
import { createWorktreeCleanupOperations } from "../maestro/runtime/worktree-operations.ts";
import { createRexHostApi } from "./rex-host-api.ts";
import { createRexInfrastructure } from "./infrastructure.ts";
import { RexSurfaceProvider } from "../maestro/surfaces/rex/rex-surface-provider.ts";
import { rexWorktreeRoot } from "../maestro/surfaces/rex/worktree.ts";

const REX_HOST_MARKER = "[Rex host]";
const REX_CHILD_MARKER = "[Rex child]";

function appendNotice(
  event: { systemPromptOptions: { appendSystemPrompt?: string } },
  marker: string,
  notice: string,
): void {
  const current = event.systemPromptOptions.appendSystemPrompt ?? "";
  if (current.includes(marker)) return;
  event.systemPromptOptions.appendSystemPrompt = current
    ? `${current}\n\n${notice}`
    : notice;
}

/**
 * Tells the model which host it runs in before every run. Rex installs no Pi
 * session hook, and the kernel's tool text originally named another host, so
 * without this the model can mistake Rex for that host and reach for its CLI.
 */
function rexHostNotice(sessionId: string, blockId: string): string {
  return [
    REX_HOST_MARKER,
    `You are running inside Rex (session ${sessionId}, block ${blockId}). A Rex window is a tab; a block is a pane.`,
    'Subagents run natively in Rex: use the subagent tool. placement "split" (default) opens a block beside you in the current tab while it has capacity; placement "tab" opens the child in a new Rex tab.',
    "Never start, track, or control subagents with herdr, hc, the herdr-core skill, or the rex CLI; those are not this host. The subagent tool is the only way to delegate here.",
    "Children are leaves: they do not get the subagent tool.",
  ].join("\n");
}

/** A child has no subagent tool here; say so before it reaches for another host. */
function rexChildNotice(sessionId: string, blockId: string): string {
  return [
    REX_CHILD_MARKER,
    `You are a subagent running inside Rex (session ${sessionId}, block ${blockId}).`,
    "You are a leaf: no subagent tool is registered, and you must not spawn further agents with herdr, hc, or the rex CLI.",
    "When reporting where you are, use $REX_BLOCK and block IDs: window numbers are positional and change as tabs open and close.",
    "Do your task and report the result; the parent receives it automatically.",
  ].join("\n");
}

export default function piRexAgentsExtension(pi: ExtensionAPI): void {
  const sessionId = process.env.REX_SESSION;
  const blockId = process.env.REX_BLOCK;

  // pi-rex-agents is Rex-only. Outside Rex it must not register tools that
  // cannot acquire a surface.
  if (!sessionId || !blockId) return;

  // Inside a child it stays a leaf: no tools, only the host notice.
  if (process.env.PI_SUBAGENT_ID) {
    pi.on("before_agent_start", (event) => {
      appendNotice(event, REX_CHILD_MARKER, rexChildNotice(sessionId, blockId));
    });
    return;
  }

  mkdirSync(rexWorktreeRoot(), { recursive: true });

  const provider = new RexSurfaceProvider({
    sessionId,
    anchorBlockId: blockId,
  });

  pi.on("before_agent_start", (event) => {
    appendNotice(event, REX_HOST_MARKER, rexHostNotice(sessionId, blockId));
  });

  // Every tool and command the kernel registers passes through this proxy:
  // Rex wording, the per-launch placement parameter, and message rewriting.
  const hostApi = createRexHostApi(pi);

  subagentsExtension(hostApi, {
    infrastructure: createRexInfrastructure(provider),
    // Worktree cleanup adapter: Rex-managed worktrees live under the
    // pi-rex-agents root rather than the kernel's default location, while the
    // dirty-worktree and live-child checks stay upstream's.
    cleanupOperations: (ctx) =>
      createWorktreeCleanupOperations(provider as never, {
        manifestDir: join(
          ctx.sessionManager.getSessionDir(),
          "artifacts",
          ctx.sessionManager.getSessionId(),
          "worktree-runs",
        ),
        liveHolders: () => [],
        managedRoot: rexWorktreeRoot(),
      }),
  });
}
