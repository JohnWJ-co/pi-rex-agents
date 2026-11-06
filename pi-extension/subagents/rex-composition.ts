/** Rex-only composition used by the kernel's Pi entry point. */
import { mkdirSync } from "node:fs";
import type { PiRunSessionInfrastructure } from "../../maestro/runtime/index.ts";
import { SupervisionCoordinator } from "../../maestro/core/supervision.ts";
import { createWorktreeOperations } from "../../maestro/runtime/worktree-operations.ts";
import { RexSurfaceProvider } from "../../maestro/surfaces/rex/rex-surface-provider.ts";
import { rexWorktreeRoot } from "../../maestro/surfaces/rex/worktree.ts";

export interface RexHostContext {
	sessionId: string;
	blockId: string;
}

export function rexHostContext(
	env: NodeJS.ProcessEnv = process.env,
): RexHostContext | undefined {
	return env.REX_SESSION && env.REX_BLOCK
		? { sessionId: env.REX_SESSION, blockId: env.REX_BLOCK }
		: undefined;
}

/** No CLI calls or background resources are started during registration. */
export function createRexInfrastructure(
	host: RexHostContext,
): PiRunSessionInfrastructure {
	mkdirSync(rexWorktreeRoot(), { recursive: true });
	const provider = new RexSurfaceProvider({
		sessionId: host.sessionId,
		anchorBlockId: host.blockId,
	});
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
