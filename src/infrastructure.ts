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

/** Default: a block beside the parent in the current Rex tab. */
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
  // A tool call may choose a new tab for its own child; everything else about
  // the launch pipeline stays upstream's.
  const launchOperations: PiLaunchOperations = {
    ...upstreamLaunchOperations,
    createPane(name, cwd, control) {
      return provider.createSurface({
        name,
        cwd: cwd ?? process.cwd(),
        placement: placementForLaunch(paneConfig),
        signal: control?.signal,
      });
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
