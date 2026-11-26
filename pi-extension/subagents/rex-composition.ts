/** Rex-only composition used by the kernel's Pi entry point. */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { buildRexArgv } from "../../maestro/surfaces/rex/rex-cli.ts";
import { isRecord, isString } from "../../maestro/core/config/type-guards.ts";
import type { PiRunSessionInfrastructure } from "../../maestro/runtime/index.ts";
import { SupervisionCoordinator } from "../../maestro/core/supervision.ts";
import { createWorktreeOperations } from "../../maestro/runtime/worktree-operations.ts";
import { RexSurfaceProvider } from "../../maestro/surfaces/rex/rex-surface-provider.ts";
import { rexWorktreeRoot } from "../../maestro/surfaces/rex/worktree.ts";

export interface RexHostContext {
	sessionId: string;
	blockId: string;
}

/**
 * Newer Rex versions no longer put REX_SESSION in a pane's environment: a tab
 * can move between sessions while its block IDs stay stable. Resolve the
 * current session from REX_BLOCK with the public `rex whoami` JSON command.
 */
export function resolveRexSessionFromBlock(
	blockId: string,
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	try {
		const childEnv = { ...process.env, ...env };
		// Resolve from the stable block, never from a stale inherited session.
		delete childEnv.REX_SESSION;
		const output = execFileSync(
			"rex",
			buildRexArgv(["whoami", "--json"], childEnv),
			{
				// Preserve PATH and the rest of the host environment; the passed
				// env contributes the block ID and optional explicit overrides.
				env: childEnv,
				encoding: "utf8",
				timeout: 5_000,
				maxBuffer: 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		// SAFETY: rex whoami is documented to return a JSON object.
		const parsed = JSON.parse(output) as unknown;
		if (!isRecord(parsed) || !isString(parsed.session_id)) return undefined;
		if (isString(parsed.block_id) && parsed.block_id !== blockId)
			return undefined;
		return parsed.session_id;
	} catch {
		return undefined;
	}
}

export function rexHostContext(
	env: NodeJS.ProcessEnv = process.env,
	resolveSession: (
		blockId: string,
		env: NodeJS.ProcessEnv,
	) => string | undefined = resolveRexSessionFromBlock,
): RexHostContext | undefined {
	const blockId = env.REX_BLOCK?.trim();
	if (!blockId) return undefined;
	const sessionId = env.REX_SESSION?.trim() || resolveSession(blockId, env);
	return sessionId ? { sessionId, blockId } : undefined;
}

/** Provider resources are created lazily; host resolution may call `rex whoami` when REX_SESSION is absent. */
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
