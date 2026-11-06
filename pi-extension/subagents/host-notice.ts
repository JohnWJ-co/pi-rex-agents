/** Host notices belong to the kernel; tool text is authored in Rex terms. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SpawningConfig } from "../../maestro/core/config/spawning-config.ts";
import {
	decideDelegation,
	parseDelegationDepth,
} from "../../maestro/core/delegation-depth.ts";
import type { RexHostContext } from "./rex-composition.ts";

export function registerRexHostNotice(
	pi: ExtensionAPI,
	host: RexHostContext,
	spawning: SpawningConfig,
): void {
	const child = !!process.env.PI_SUBAGENT_ID;
	const marker = child ? "[Rex child]" : "[Rex host]";
	const decision = decideDelegation(
		parseDelegationDepth(process.env.PI_SUBAGENT_DEPTH),
		spawning.maxDepth,
	);
	const notice = child
		? [
				marker,
				`You are a subagent running inside Rex (session ${host.sessionId}, block ${host.blockId}).`,
				decision.allowed
					? `Delegation is limited by spawning.maxDepth=${spawning.maxDepth}; use only the subagent tool when delegation is available.`
					: "You are a leaf at this session's delegation depth limit. Complete your task directly; do not spawn further agents.",
				"When reporting where you are, use $REX_BLOCK and block IDs: window numbers are positional and change as tabs open and close.",
				"Do your task and report the result; the parent receives it automatically.",
			]
		: [
				marker,
				`You are running inside Rex (session ${host.sessionId}, block ${host.blockId}). A Rex window is a tab; a block is a pane.`,
				'Subagents run natively in Rex: use the subagent tool. placement "split" (default) opens a block beside you in the current tab while it has capacity; placement "tab" opens the child in a new Rex tab.',
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
