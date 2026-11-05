/**
 * Rex composition for the pi-herdr-agents orchestration kernel.
 *
 * Everything above the SurfaceProvider seam (tools, delivery, persistence,
 * model routing, resume/fork state) stays exactly as upstream. This file only
 * supplies the host-specific pieces.
 */

import type { PaneConfig } from "pi-herdr-agents/maestro/core/config/pane-config.ts";
import type { PiLaunchOperations } from "pi-herdr-agents/maestro/adapters/pi/launch-operations.ts";
import { SupervisionCoordinator } from "pi-herdr-agents/maestro/core/supervision.ts";
import { launchOperationsFromSurface } from "pi-herdr-agents/maestro/adapters/pi/launch-operations.ts";
import { createWorktreeOperations } from "pi-herdr-agents/maestro/runtime/worktree-operations.ts";
import type { PiRunSessionInfrastructure } from "pi-herdr-agents/maestro/runtime/index.ts";
import { placementForLaunch } from "./placement.ts";
import { RexSurfaceProvider } from "./rex-surface-provider.ts";

/** Default: a block beside the parent in the current Rex tab, at most four. */
export const REX_PANE_CONFIG: PaneConfig = {
  mode: "split",
  direction: "right",
  maxPerTab: 4,
};

export function createRexInfrastructure(
  provider: RexSurfaceProvider,
  paneConfig: PaneConfig = REX_PANE_CONFIG,
): PiRunSessionInfrastructure {
  const worktreeOperations = createWorktreeOperations();
  const upstreamLaunchOperations = launchOperationsFromSurface(
    provider,
    paneConfig,
    worktreeOperations,
  );

  // Split children created by this process in the parent's tab. Upstream's
  // maxPerTab only applies to its grouped pane factory; Rex has no grouped
  // tab, so the cap lives here and covers every split request.
  const splitChildren = new Set<string>();
  let pendingSplits = 0;

  async function pruneClosedSplits(): Promise<void> {
    if (splitChildren.size === 0) return;
    try {
      const live = new Set(
        (await provider.listSurfaces()).map((surface) => surface.id),
      );
      for (const id of [...splitChildren]) {
        if (!live.has(id)) splitChildren.delete(id);
      }
    } catch {
      // An unreachable server fails the launch itself; keep the local count.
    }
  }

  // A tool call may choose a new tab for its own child; everything else about
  // the launch pipeline stays upstream's.
  const launchOperations: PiLaunchOperations = {
    ...upstreamLaunchOperations,
    async createPane(name, cwd, control) {
      let placement = placementForLaunch(paneConfig);
      if (placement.kind === "split") {
        if (splitChildren.size + pendingSplits >= paneConfig.maxPerTab) {
          await pruneClosedSplits();
        }
        if (splitChildren.size + pendingSplits >= paneConfig.maxPerTab) {
          placement = { kind: "tab" };
        }
      }
      if (placement.kind !== "split") {
        return provider.createSurface({
          name,
          cwd: cwd ?? process.cwd(),
          placement,
          signal: control?.signal,
        });
      }
      // Reserve the slot before awaiting creation so concurrent launches see
      // each other's pending splits instead of overshooting the cap.
      pendingSplits += 1;
      try {
        const surface = await provider.createSurface({
          name,
          cwd: cwd ?? process.cwd(),
          placement,
          signal: control?.signal,
        });
        splitChildren.add(surface);
        return surface;
      } finally {
        pendingSplits -= 1;
      }
    },
    closePane(surface) {
      splitChildren.delete(surface);
      return upstreamLaunchOperations.closePane(surface);
    },
  };

  const supervision = new SupervisionCoordinator(
    async () => {
      try {
        return {
          complete: true,
          panes: (await provider.listSurfaces()).map((surface) => ({
            paneId: surface.id,
            workspaceId: surface.workspaceId ?? "",
          })),
        };
      } catch {
        return { complete: false, panes: [] };
      }
    },
    (surfaceId) => provider.inspectSurface(surfaceId),
  );

  return {
    surfaceProvider: provider,
    launchOperations,
    worktreeOperations,
    supervision,
  };
}
