/** Rex infrastructure; launch placement and reservations belong to the kernel. */
import { SupervisionCoordinator } from "../maestro/core/supervision.ts";
import { createWorktreeOperations } from "../maestro/runtime/worktree-operations.ts";
import type { PiRunSessionInfrastructure } from "../maestro/runtime/index.ts";
import { RexSurfaceProvider } from "../maestro/surfaces/rex/rex-surface-provider.ts";

export function createRexInfrastructure(
  provider: RexSurfaceProvider,
): PiRunSessionInfrastructure {
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
    worktreeOperations: createWorktreeOperations(),
    supervision,
  };
}
