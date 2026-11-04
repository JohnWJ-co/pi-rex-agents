/**
 * pi-rex-agents: Pi extension entry point.
 *
 * Loaded by Pi inside a Rex block. The actual orchestration is pi-herdr-agents;
 * this extension injects a Rex-backed SurfaceProvider and runtime composition.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import subagentsExtension from "pi-herdr-agents/pi-extension/subagents/index.ts";
import { createWorktreeCleanupOperations } from "pi-herdr-agents/maestro/runtime/worktree-operations.ts";
import { createRexInfrastructure } from "./infrastructure.ts";
import { RexSurfaceProvider } from "./rex-surface-provider.ts";
import { rexWorktreeRoot } from "./worktree.ts";

export default function piRexAgentsExtension(pi: ExtensionAPI): void {
  const sessionId = process.env.REX_SESSION;
  const blockId = process.env.REX_BLOCK;

  // pi-rex-agents is Rex-only. Outside Rex it must not fall back to Herdr or
  // register tools that cannot acquire a surface.
  if (!sessionId || !blockId || process.env.PI_SUBAGENT_ID) {
    return;
  }

  mkdirSync(rexWorktreeRoot(), { recursive: true });

  const provider = new RexSurfaceProvider({
    sessionId,
    anchorBlockId: blockId,
  });

  subagentsExtension(pi, {
    infrastructure: createRexInfrastructure(provider),
    // Herdr's cleanup scans ~/.herdr/worktrees. Rex-managed worktrees live
    // under the pi-rex-agents root instead, so provide the matching cleanup
    // adapter while keeping all dirty/live-child checks from upstream.
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
