/** Host notices belong to the kernel; tool text is authored in Rex terms. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SpawningConfig } from "../../maestro/core/config/spawning-config.ts";
import {
	decideDelegation,
	parseDelegationDepth,
} from "../../maestro/core/delegation-depth.ts";
import type { RexHostContext } from "./rex-composition.ts";
import { readWorktreeBoundary } from "./worktree-boundary.ts";

export function registerRexHostNotice(
	pi: ExtensionAPI,
	host: RexHostContext,
	spawning: SpawningConfig,
	env: NodeJS.ProcessEnv = process.env,
): void {
	const boundary = readWorktreeBoundary(env);
	const child = !!env.PI_SUBAGENT_ID;
	const marker = child ? "[Rex child]" : "[Rex host]";
	const decision = decideDelegation(
		parseDelegationDepth(env.PI_SUBAGENT_DEPTH),
		spawning.maxDepth,
	);
	const boundaryNotice = boundary
		? [
				`Your workspace is the managed worktree at ${boundary.worktree}. All reads, writes, and commands must run there.`,
				`Do not cd into or modify the parent/source checkout at ${boundary.source}; the parent reviews and integrates your work.`,
				"Edit and write calls aimed at the source checkout are blocked. Bash and other shell commands cannot be confined mechanically, so the workspace rule is mandatory even though it is not a security sandbox.",
			]
		: [];
	const notice = child
		? [
				marker,
				`You are a subagent running inside Rex (session ${host.sessionId}, block ${host.blockId}).`,
				decision.allowed
					? `Delegation is limited by spawning.maxDepth=${spawning.maxDepth}; use only the subagent tool when delegation is available.`
					: "You are a leaf at this session's delegation depth limit. Complete your task directly; do not spawn further agents.",
				...boundaryNotice,
				"When reporting where you are, use $REX_BLOCK and block IDs: window numbers are positional and change as tabs open and close.",
				"Do your task and report the result; the parent receives it automatically.",
			]
		: [
				marker,
				`You are running inside Rex (session ${host.sessionId}, block ${host.blockId}). A Rex window is a tab; a block is a pane.`,
				...boundaryNotice,
				'Subagents run natively in Rex: use the subagent tool. placement "split" (default) opens a block beside you in the current tab while it has capacity; placement "tab" opens the child in a new Rex tab; placement "minimized" creates a floating layer in the current tab and minimizes it to the client tray without consuming a split slot.',
				"The subagent tool is the only way to delegate here. Do not start, track, or control subagents through a multiplexer CLI.",
				`Delegation is limited by spawning.maxDepth=${spawning.maxDepth}; children are leaves with the default maximum of 1.`,
			];
	pi.on("before_agent_start", (event) => {
		const current = event.systemPromptOptions.appendSystemPrompt ?? "";
		if (current.includes(marker)) return;
		event.systemPromptOptions.appendSystemPrompt = [current, notice.join("\n")]
			.filter(Boolean)
			.join("\n\n");
	});
}
