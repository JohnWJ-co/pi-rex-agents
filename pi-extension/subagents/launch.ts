import { randomUUID } from "node:crypto";
import { resolveContextTools } from "../../maestro/runtime/index.ts";
import type {
	PiLaunchSnapshot,
	PiAttemptSnapshot,
} from "../../maestro/runtime/index.ts";
import {
	resolveRuntimePlans,
	type ResolvedRuntimePlan,
	type ThinkingLevel,
} from "../../maestro/core/routing.ts";
import { sessionModelRegistry } from "./model-registry.ts";
import {
	resolveModelDefault,
	type ModelConfig,
} from "../../maestro/core/config/model-config.ts";
import { getAgentConfigDir } from "./config-path.ts";
import { normalizeAcceptSpec } from "../../maestro/core/accept.ts";
import type { PaneConfig } from "../../maestro/core/config/pane-config.ts";
import type { SubagentRuntime } from "./state.ts";
import {
	SubagentParams,
	resolveDenyTools,
	discoverAgentCatalog,
	missingRoleMessage,
	resolveEffectiveSessionMode,
	resolveEffectivePersistent,
	resolveEffectiveAutoExit,
	resolveEffectiveInteractive,
	loadAgentDefaults,
} from "./catalog.ts";

interface LaunchPlannerDeps {
	runtime: SubagentRuntime;
	modelConfig: ModelConfig;
	paneConfig: PaneConfig;
}

export interface AgentModelLock {
	agent: string;
	pinnedModel?: string;
	pinnedThinking?: string;
	requestedModel?: string;
	requestedThinking?: string;
}

export interface PreparedLaunchParams {
	params: typeof SubagentParams.static;
	modelLock?: AgentModelLock;
	refusal?: string;
}

export type LaunchPlanner = ReturnType<typeof createLaunchPlanner>;

/** Launch snapshots and runtime plans bound to one extension instance. */
export function createLaunchPlanner({
	runtime,
	modelConfig,
	paneConfig,
}: LaunchPlannerDeps) {
	function normalizePiAttempt(
		params: typeof SubagentParams.static,
		ctx: {
			sessionManager: {
				getSessionFile(): string | null | undefined;
				getSessionId(): string;
				getSessionDir(): string;
			};
			cwd: string;
			isProjectTrusted?: () => boolean;
			model?: { provider: string; id: string };
			modelRegistry: {
				find(provider: string, modelId: string): any;
				getAvailable?: () => any[];
				getAll?: () => any[];
				hasConfiguredAuth?: (model: any) => boolean;
			};
		},
		parentThinking: ThinkingLevel,
		options: {
			id: string;
			controlTaskId: string;
			origin: Pick<PiLaunchSnapshot["parent"], "cwd" | "invocationCwd">;
		},
	): PiAttemptSnapshot {
		const agentDefs = params.agent
			? loadAgentDefaults(params.agent, runtime.pi)
			: null;
		if (params.agent && !agentDefs) {
			const diagnostic = discoverAgentCatalog(runtime.pi).diagnostics.find(
				(candidate) => candidate.agentName === params.agent,
			);
			// Raw here: the public tool boundary and the delivery serializer encode.
			throw new Error(
				diagnostic ? diagnostic.message : missingRoleMessage(params.agent),
			);
		}
		if (!ctx.model)
			throw new Error("Subagent launch requires a resolved parent model");

		const effectiveTools = params.tools ?? agentDefs?.tools;
		const effectiveSkills = params.skills ?? agentDefs?.skills;
		const persistent = resolveEffectivePersistent(params, agentDefs);
		const effectiveAutoExit = resolveEffectiveAutoExit(params, agentDefs);
		const effectiveInteractive = resolveEffectiveInteractive(params, agentDefs);
		const logicalId = options.id;
		const generationId = randomUUID();
		const taskId = randomUUID();
		const parentSessionFile = ctx.sessionManager.getSessionFile();
		if (!parentSessionFile) throw new Error("No session file");
		const snapshot = launchSnapshot(ctx, parentThinking);

		return {
			snapshot: {
				...snapshot,
				parent: { ...snapshot.parent, ...options.origin },
			},
			task: {
				id: options.controlTaskId,
				name: params.name,
				prompt: params.task,
				role: params.agent ?? "",
				cwd: options.origin.cwd,
				worktree: params.worktree ?? undefined,
				placement: params.placement,
				accept: params.accept ? normalizeAcceptSpec(params.accept) : undefined,
				requestedModel: params.model,
				session: { mode: resolveEffectiveSessionMode(params, agentDefs) },
				behavior: {
					skills: effectiveSkills
						?.split(",")
						.map((s) => s.trim())
						.filter(Boolean),
					denyTools: [...resolveDenyTools(agentDefs)],
					autoExit: effectiveAutoExit,
					interactive: effectiveInteractive,
					persistent,
					systemPromptMode: agentDefs?.systemPromptMode,
				},
				systemPrompt: params.agent ? undefined : params.systemPrompt,
			},
			role: agentDefs
				? {
						...agentDefs.role,
						systemPrompt: agentDefs.body ?? params.systemPrompt ?? "",
					}
				: {
						name: "",
						version: "1",
						description: "Pi host-resolved role",
						systemPrompt: params.systemPrompt ?? "",
						allowedTools: [],
					},
			resolved: {
				agent: params.agent,
				cwd: params.cwd,
				roleCwd: agentDefs?.cwd,
				tools: effectiveTools,
			},
			identity: { id: logicalId, logicalId, generationId, taskId },
		};
	}

	/**
	 * A named role's own model/thinking pin is authoritative. Drop the
	 * caller-supplied values before routing so a request cannot silently
	 * replace the role's provider/model; preserve the conflict for the tool
	 * result notice. Bare launches and roles without a pin keep the existing
	 * request precedence.
	 */
	function prepareLaunchParams(
		params: typeof SubagentParams.static,
	): PreparedLaunchParams {
		const catalog = discoverAgentCatalog(runtime.pi);
		const projectAgents = catalog.agents.filter(
			(agent) => agent.source === "project",
		);
		const agentName = params.agent?.trim() ?? "";
		if (projectAgents.length > 0) {
			const projectNames = projectAgents.map((agent) => agent.name);
			if (!agentName) {
				return {
					params,
					refusal: `This project defines roles in .pi/agents, so bare subagents are disabled. Use one of the project roles: ${projectNames.join(", ")}. Global and package roles are also disabled.`,
				};
			}
			if (!projectNames.includes(agentName)) {
				return {
					params,
					refusal: `This project only permits roles defined in .pi/agents: ${projectNames.join(", ")}. Agent ${agentName} is outside that project scope. Bare subagents and global/package roles are disabled.`,
				};
			}
		}
		if (!agentName) return { params };
		const agentDefs = loadAgentDefaults(agentName, runtime.pi);
		if (!agentDefs) return { params };
		const configuredModel = Object.hasOwn(modelConfig.agents, agentName)
			? modelConfig.agents[agentName]
			: undefined;
		const pinnedModel = agentDefs.model?.trim() || configuredModel;
		const pinnedThinking = agentDefs.thinking?.trim();
		if (!pinnedModel && !pinnedThinking) return { params };

		const next = { ...params };
		const lock: AgentModelLock = { agent: agentName };
		let stripped = false;
		if (pinnedModel && next.model) {
			lock.pinnedModel = pinnedModel;
			if (next.model !== pinnedModel) lock.requestedModel = next.model;
			delete next.model;
			stripped = true;
		}
		if (pinnedThinking && next.thinking) {
			lock.pinnedThinking = pinnedThinking;
			if (next.thinking !== pinnedThinking)
				lock.requestedThinking = next.thinking;
			delete next.thinking;
			stripped = true;
		}
		if (!stripped) return { params };
		const hasRequestOverride =
			lock.requestedModel !== undefined || lock.requestedThinking !== undefined;
		return hasRequestOverride
			? { params: next, modelLock: lock }
			: { params: next };
	}

	function resolveSubagentRuntimePlans(
		params: typeof SubagentParams.static,
		ctx: Parameters<typeof normalizePiAttempt>[1],
		parentThinking: ThinkingLevel,
	): ResolvedRuntimePlan[] {
		const agentDefs = params.agent
			? loadAgentDefaults(params.agent, runtime.pi)
			: null;
		if (params.agent && !agentDefs) {
			const diagnostic = discoverAgentCatalog(runtime.pi).diagnostics.find(
				(candidate) => candidate.agentName === params.agent,
			);
			// Raw here: the public tool boundary and the delivery serializer encode.
			throw new Error(
				diagnostic ? diagnostic.message : missingRoleMessage(params.agent),
			);
		}
		if (!ctx.model)
			throw new Error("Subagent launch requires a resolved parent model");
		const plans = resolveRuntimePlans(
			{ model: params.model, thinking: params.thinking },
			{
				model: resolveModelDefault(params.agent, agentDefs?.model, modelConfig),
				thinking: agentDefs?.thinking,
			},
			{
				provider: ctx.model.provider,
				modelId: ctx.model.id,
				thinking: parentThinking,
			},
			sessionModelRegistry(ctx),
			modelConfig.tasks,
			!!params.worktree,
		);
		if (params.worktree && plans.length > 1) {
			throw new Error(
				"Model fallbacks are not supported for worktree subagents.",
			);
		}
		return plans;
	}

	function launchSnapshot(
		ctx: Parameters<typeof normalizePiAttempt>[1],
		thinking?: ThinkingLevel,
	): PiLaunchSnapshot {
		return {
			parent: {
				cwd: ctx.cwd,
				invocationCwd: process.cwd(),
				sessionFile: ctx.sessionManager.getSessionFile() ?? "",
				sessionId: ctx.sessionManager.getSessionId(),
				sessionDir: ctx.sessionManager.getSessionDir(),
				agentDir: getAgentConfigDir(),
			},
			parentRuntime:
				ctx.model && thinking
					? { provider: ctx.model.provider, modelId: ctx.model.id, thinking }
					: undefined,
			modelRegistry: sessionModelRegistry(ctx),
			contextTools: resolveContextTools(
				runtime.pi?.getAllTools().map((tool) => tool.name) ?? [],
			),
			paneConfig,
		};
	}

	return {
		normalizePiAttempt,
		resolveSubagentRuntimePlans,
		prepareLaunchParams,
		launchSnapshot,
	};
}
