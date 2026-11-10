/**
 * Extension loaded into sub-agents.
 * - Shows agent identity + available tools as a compact styled widget above the editor
 * - Provides a `subagent_done` tool for interactive agents to self-terminate
 */
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
	appendPersistentTaskEvent,
	consumePersistentTaskInbox,
	readPersistentDeliveryLedger,
	readPersistentTaskEvents,
	getSubagentResultFile,
	type SubagentResultArtifact,
} from "../session.ts";
import { createSubagentActivityRecorder } from "../activity-file.ts";
import { createDoneNudge } from "./done-nudge.ts";
import { registerDeclaredSkills } from "./declared-skills.ts";
import { isChildBusy } from "../../../core/child-busy.ts";
import {
	readOwnProcessIdentity,
	writeProcessIdentityRecord,
} from "../process-identity.ts";
import { isString } from "../../../core/config/type-guards.ts";
import { hasUndeliveredChildren } from "../../../core/undelivered-children.ts";
import {
	ACCEPT_FILE_ENV,
	type ChildAcceptReport,
} from "../../../core/accept.ts";
import { readAcceptSpecFile } from "../accept-runner.ts";
import { createChildAcceptLoop } from "./accept-check.ts";
import { reportRexChildStatus } from "./rex-status.ts";
import { watchPersistentInbox } from "./inbox.ts";

/** Publish only complete JSON; a failed write preserves any previous result. */
export function writeResultArtifact(
	sessionFile: string,
	result: SubagentResultArtifact,
	persistent = false,
): string {
	const file = getSubagentResultFile(
		sessionFile,
		persistent ? result.taskId : undefined,
	);
	const temp = `${file}.tmp.${process.pid}.${randomUUID()}`;
	try {
		writeFileSync(temp, JSON.stringify(result), {
			encoding: "utf8",
			flag: "wx",
		});
		renameSync(temp, file);
	} finally {
		rmSync(temp, { force: true });
	}
	return file;
}

export function findFinalAssistantText(messages: any[] | undefined): string {
	for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
		const message = messages![i];
		if (message?.role !== "assistant" || !Array.isArray(message.content))
			continue;
		const text = message.content
			.filter(
				(part: any) =>
					part.type === "text" && isString(part.text) && part.text.trim(),
			)
			.map((part: any) => part.text)
			.join("\n");
		if (text.trim()) return text;
	}
	return "";
}

export function shouldMarkUserTookOver(agentStarted: boolean): boolean {
	return agentStarted;
}

export function shouldAutoExitOnAgentEnd(
	_userTookOver: boolean,
	messages: any[] | undefined,
	runAborted = false,
): boolean {
	// Escape during a tool lets Pi start the next provider request on the
	// aborted signal, which lazyStream records as stopReason "error".
	if (runAborted) return false;
	// Manual input should not strand an auto-exit subagent. If the latest agent
	// turn completed normally, close the session. Escape/abort still leaves it
	// open for inspection or another prompt.
	//
	// stopReason: "error" (e.g. exhausted retries on a provider overload) also
	// returns true — we want to shut down so the parent is woken up — but we
	// pair this with findLatestAssistantError() so the parent learns it was an
	// error, not a clean completion.
	if (messages) {
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg?.role === "assistant") {
				return msg.stopReason !== "aborted";
			}
		}
	}

	return true;
}

export interface SubagentErrorInfo {
	errorMessage: string;
	stopReason: "error";
}

/**
 * If the last assistant message in the turn ended with `stopReason: "error"`
 * (typically auto-retry exhausted on an overload / rate limit / server error),
 * return its error info so the parent orchestrator can surface a clear
 * failure instead of silently treating the run as completed.
 *
 * Returns `null` when the latest assistant turn completed normally or was
 * aborted by the user (handled separately by shouldAutoExitOnAgentEnd).
 */
export function findLatestAssistantError(
	messages: any[] | undefined,
): SubagentErrorInfo | null {
	if (!messages) return null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg?.role !== "assistant") continue;
		if (msg.stopReason !== "error") return null;
		const raw = isString(msg.errorMessage) ? msg.errorMessage.trim() : "";
		return {
			errorMessage:
				raw ||
				"Subagent agent loop ended with stopReason=error (no errorMessage field).",
			stopReason: "error",
		};
	}
	return null;
}

export function buildCompletionSidecar(
	messages: any[] | undefined,
	accept?: ChildAcceptReport,
):
	| { type: "done"; accept?: ChildAcceptReport }
	| { type: "error"; errorMessage: string; stopReason: "error" } {
	const errorInfo = findLatestAssistantError(messages);
	if (errorInfo) return { type: "error", ...errorInfo };
	// Only a check that ran adds its report; the sidecar never holds output.
	return accept ? { type: "done", accept } : { type: "done" };
}

export function buildPersistentTaskEvent(task: string, generation: string) {
	return {
		version: 1 as const,
		type: "task-done" as const,
		task,
		generation,
		at: new Date().toISOString(),
	};
}

export function isPersistentStopDirective(
	inbox: ReturnType<typeof consumePersistentTaskInbox>,
): boolean {
	return inbox?.type === "stop";
}

function findUnsettledPersistentTask(
	sessionFile: string,
	generation: string,
): string {
	const settledTasks = new Set(
		readPersistentTaskEvents(sessionFile)
			.filter((event) => event.generation === generation)
			.map((event) => event.task),
	);
	return (
		readPersistentDeliveryLedger(sessionFile)
			.filter(
				(entry) =>
					entry.generation === generation &&
					entry.outcome === "dispatched" &&
					!settledTasks.has(entry.task),
			)
			.at(-1)?.task ?? ""
	);
}

export function parseDeniedTools(rawValue: string | undefined): string[] {
	return (rawValue ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

/**
 * A managed worktree child names its own process at load from immutable
 * kernel facts, which Pi's process-title rewrite cannot alter.
 */
export function recordProcessIdentity(
	id: string | undefined,
	sessionFile: string | undefined,
	file = process.env.PI_SUBAGENT_PROCESS_FILE,
): void {
	if (!file || !id || !sessionFile) return;
	try {
		writeProcessIdentityRecord(file, {
			version: 1,
			id,
			sessionFile,
			...readOwnProcessIdentity(),
		});
	} catch {
		// Unrecorded identity leaves a worktree cancel unconfirmed, never guessed.
	}
}

export default function (pi: ExtensionAPI) {
	let toolNames: string[] = [];
	let denied: string[] = [];

	// Read subagent identity from env vars (set by parent orchestrator)
	const subagentName = process.env.PI_SUBAGENT_NAME ?? "";
	const subagentAgent = process.env.PI_SUBAGENT_AGENT ?? "";
	const deniedToolsValue = process.env.PI_DENY_TOOLS;
	const autoExit = process.env.PI_SUBAGENT_AUTO_EXIT === "1";
	const persistent = process.env.PI_SUBAGENT_PERSISTENT === "1";
	const generation = process.env.PI_SUBAGENT_GENERATION_ID ?? "";
	const sessionFile = process.env.PI_SUBAGENT_SESSION;
	const initialTask = process.env.PI_SUBAGENT_TASK_ID ?? "";
	const subagentId = process.env.PI_SUBAGENT_ID ?? "";
	const blockId = process.env.REX_BLOCK ?? "";
	let stopInboxWatcher: (() => void) | undefined;
	let currentTask = persistent
		? findUnsettledPersistentTask(sessionFile ?? "", generation) ||
			(initialTask &&
			!readPersistentTaskEvents(sessionFile ?? "").some(
				(event) =>
					event.task === initialTask && event.generation === generation,
			)
				? initialTask
				: "")
		: "";
	let startedTask = currentTask;
	const recorder = createSubagentActivityRecorder({
		runningChildId: process.env.PI_SUBAGENT_ID,
		activityFile: process.env.PI_SUBAGENT_ACTIVITY_FILE,
		persistent,
	});
	recordProcessIdentity(subagentId, sessionFile);

	function publishResult(messages: any[] | undefined, taskId = initialTask) {
		const error = findLatestAssistantError(messages);
		const status = error ? "error" : "done";
		const file = sessionFile
			? getSubagentResultFile(sessionFile, persistent ? taskId : undefined)
			: "";
		if (sessionFile) {
			try {
				writeResultArtifact(
					sessionFile,
					{
						v: 1,
						finalText: findFinalAssistantText(messages),
						subagentId,
						taskId,
						generation,
						status,
						errorMessage: error?.errorMessage,
						blockId,
						finishedAt: new Date().toISOString(),
					},
					persistent,
				);
			} catch {
				// Completion still has its .exit/exitcode and JSONL fallback paths.
			}
		}
		reportRexChildStatus(status, {
			taskId,
			generation,
			result: basename(file),
		});
	}
	// The role's declared skills, as this child's own Pi loaded them.
	registerDeclaredSkills(pi);

	function renderWidget(ctx: { ui: { setWidget: Function } }, _theme: any) {
		ctx.ui.setWidget(
			"subagent-tools",
			(_tui: any, theme: any) => {
				const box = new Box(1, 0, (text: string) =>
					theme.bg("toolSuccessBg", text),
				);

				const label = subagentAgent || subagentName;
				const agentTag = label
					? theme.bold(theme.fg("accent", `[${label}]`))
					: "";

				const countInfo = theme.fg("dim", ` — ${toolNames.length} tools`);
				const deniedInfo =
					denied.length > 0
						? theme.fg("dim", " · ") +
							theme.fg("error", `${denied.length} denied`)
						: "";

				const content = new Text(`${agentTag}${countInfo}${deniedInfo}`, 0, 0);
				box.addChild(content);

				return box;
			},
			{ placement: "aboveEditor" },
		);
	}

	let userTookOver = false;
	let agentStarted = false;
	let latestAgentMessages: any[] | undefined;
	let completionFinalized = false;
	let sessionContext:
		| Pick<ExtensionContext, "isIdle" | "abort" | "shutdown">
		| undefined;
	// A child without auto-exit closes only through subagent_done, so one that
	// forgets it is asked once whether its task is complete.
	const doneNudge =
		!autoExit && !persistent
			? createDoneNudge({
					// A run that starts between the idle check and delivery queues the
					// question instead of rejecting it.
					send: (message) =>
						pi.sendUserMessage(message, { deliverAs: "followUp" }),
					isBusy: () => isChildBusy(pi.events),
				})
			: undefined;

	// Show widget + status bar on session start
	pi.on("session_start", (_event, ctx) => {
		sessionContext = ctx;
		recorder.sessionStart();
		const tools = pi.getAllTools();
		toolNames = tools.map((t) => t.name).sort();
		denied = parseDeniedTools(deniedToolsValue);

		renderWidget(ctx, null);
		if (persistent && sessionFile)
			stopInboxWatcher ??= watchPersistentInbox(sessionFile, drainInbox);
	});

	pi.on("input", () => {
		recorder.input();
		// Ignore the initial task message that starts an autonomous subagent.
		// Only inputs after the first agent run has started count as user takeover.
		if (!shouldMarkUserTookOver(agentStarted)) return;
		userTookOver = true;
	});

	pi.on("before_agent_start", () => {
		recorder.beforeAgentStart();
		doneNudge?.runStarting();
	});

	pi.on("agent_start", () => {
		agentStarted = true;
		startedTask = currentTask;
		recorder.agentStart();
		reportRexChildStatus("working", {
			taskId: currentTask || initialTask,
			generation,
			result: sessionFile
				? basename(
						getSubagentResultFile(
							sessionFile,
							persistent ? currentTask : undefined,
						),
					)
				: "",
		});
	});

	pi.on("agent_end", (event) => {
		latestAgentMessages = event.messages;
		recorder.agentEndWaiting();
		if (autoExit) {
			// Reset any recorded manual input marker. Auto-exit is decided by whether
			// the latest agent turn completed normally, not by who initiated it.
			userTookOver = false;
		}
	});

	// The accept check runs at the final actionable boundary, where Pi awaits
	// the handler and may continue once; agent_settled only notifies.
	const acceptSpec =
		autoExit && !persistent
			? readAcceptSpecFile(process.env[ACCEPT_FILE_ENV])
			: undefined;
	const acceptLoop = acceptSpec
		? createChildAcceptLoop({ spec: acceptSpec, cwd: process.cwd() })
		: undefined;
	if (acceptLoop)
		pi.on("agent_before_settle", async (event, ctx) => {
			// A settle that will not exit (undelivered children) checks later.
			if (completionFinalized || hasUndeliveredChildren()) return undefined;
			return acceptLoop.beforeSettle(event, ctx.signal);
		});

	pi.on("agent_settled", (event, ctx) => {
		const runAborted = event?.aborted === true;
		if (doneNudge && !completionFinalized) {
			doneNudge.settled(latestAgentMessages, runAborted, ctx);
		}
		if (persistent && !completionFinalized) {
			// An explicit done can queue the next inbox before this turn settles.
			// Only the task that actually started the latest turn may settle here.
			if (currentTask !== startedTask) return;
			let messages = latestAgentMessages;
			try {
				const branchMessages = ctx.sessionManager
					.getBranch()
					.flatMap((entry) =>
						entry.type === "message" ? [entry.message] : [],
					);
				if (branchMessages.length > 0) messages = branchMessages;
			} catch {
				// Fall back to the latest low-level run when session evidence is unavailable.
			}
			if (
				currentTask &&
				shouldAutoExitOnAgentEnd(userTookOver, messages, runAborted)
			) {
				appendPersistentTaskEvent(
					process.env.PI_SUBAGENT_SESSION ?? "",
					buildPersistentTaskEvent(currentTask, generation),
				);
				publishResult(messages, currentTask);
				currentTask = "";
				recorder.agentEndWaiting();
				drainInbox();
			}
			return;
		}
		if (!autoExit || completionFinalized) return;

		let messages = latestAgentMessages;
		try {
			const branchMessages = ctx.sessionManager
				.getBranch()
				.flatMap((entry) => (entry.type === "message" ? [entry.message] : []));
			if (branchMessages.length > 0) messages = branchMessages;
		} catch {
			// Fall back to the latest low-level run when session evidence is unavailable.
		}

		if (!shouldAutoExitOnAgentEnd(userTookOver, messages, runAborted)) return;
		// Children this session launched deliver their results as steers. Exiting
		// now would drop them, so wait: the last delivery starts a new turn, and
		// its settlement reaches this point again. A settled error still exits so
		// the parent learns of it promptly.
		if (findLatestAssistantError(messages) === null && hasUndeliveredChildren())
			return;
		completionFinalized = true;

		// Surface a settled stopReason: "error" to the parent via the .exit
		// sidecar. Transient errors followed by retry or compaction never reach
		// this point as the latest assistant message.
		const sessionFile = process.env.PI_SUBAGENT_SESSION;
		if (sessionFile) {
			try {
				writeFileSync(
					`${sessionFile}.exit`,
					JSON.stringify(
						buildCompletionSidecar(messages, acceptLoop?.report()),
					),
				);
			} catch {
				// Best effort — the watcher can still read the shell exitcode
				// after shutdown if the completion sidecar cannot be written.
			}
		}

		publishResult(messages);
		recorder.agentEndDone();
		ctx.shutdown();
	});

	pi.on("turn_start", (event) => {
		// Queued follow-ups can start a new turn within the same agent run.
		startedTask = currentTask;
		recorder.turnStart(event.turnIndex);
	});

	pi.on("turn_end", (event) => {
		recorder.turnEnd(event.turnIndex);
	});

	pi.on("before_provider_request", () => {
		recorder.beforeProviderRequest();
	});

	pi.on("after_provider_response", () => {
		recorder.afterProviderResponse();
	});

	pi.on("message_update", (event) => {
		recorder.messageUpdate(event.assistantMessageEvent?.type);
	});

	pi.on("tool_execution_start", (event) => {
		recorder.toolExecutionStart(event.toolCallId, event.toolName);
	});

	pi.on("tool_call", (event) => {
		recorder.toolCall(event.toolCallId, event.toolName);
	});

	pi.on("tool_execution_update", (event) => {
		recorder.toolExecutionUpdate(event.toolCallId, event.toolName);
	});

	pi.on("tool_result", (event) => {
		recorder.toolResult(event.toolCallId, event.toolName);
	});

	pi.on("tool_execution_end", (event) => {
		recorder.toolExecutionEnd(event.toolCallId, event.toolName);
	});

	pi.on("session_shutdown", async (event) => {
		stopInboxWatcher?.();
		doneNudge?.cancel();
		recorder.sessionShutdown(event.reason);
		// A check still running belongs to this session: stop it, bounded.
		await acceptLoop?.shutdown();
	});

	pi.registerTool({
		name: "caller_ping",
		label: "Caller Ping",
		description:
			"Send a help request to the parent agent. " +
			"For a persistent specialist this ends the current task and keeps the session available; otherwise it exits this session. " +
			"The parent will be notified with your message and can resume this session with a response. " +
			"Use when you're stuck, need clarification, or need the parent to take action.",
		parameters: Type.Object({
			message: Type.String({ description: "What you need help with" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const sessionFile = process.env.PI_SUBAGENT_SESSION;
			if (!sessionFile) {
				throw new Error(
					"caller_ping is only available in subagent contexts. " +
						"PI_SUBAGENT_SESSION environment variable is not set.",
				);
			}

			recorder.callerPing();
			if (persistent) {
				appendPersistentTaskEvent(sessionFile, {
					type: "help-request",
					task: currentTask,
					generation,
					message: params.message,
				});
				// The help request ends this task. The parent's answer arrives as a
				// new task through the inbox, so the poller must be free to take it
				// while the run that asked for help is still streaming.
				currentTask = "";
				return {
					content: [
						{
							type: "text",
							text: "Help request sent. Stay available for subagent_send.",
						},
					],
					details: {},
				};
			}
			const exitData = {
				type: "ping" as const,
				name: process.env.PI_SUBAGENT_NAME ?? "subagent",
				message: params.message,
			};
			writeFileSync(`${sessionFile}.exit`, JSON.stringify(exitData));
			completionFinalized = true;

			ctx.shutdown();
			return {
				content: [
					{
						type: "text",
						text: "Ping sent. Session will exit and parent will be notified.",
					},
				],
				details: {},
			};
		},
	});

	function drainInbox() {
		if (!sessionFile || currentTask || completionFinalized || !sessionContext)
			return;
		const inbox = consumePersistentTaskInbox(sessionFile);
		if (!inbox) return;
		if (isPersistentStopDirective(inbox)) {
			try {
				writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }));
			} catch {
				// The parent can still confirm the shell exitcode artifact.
			}
			completionFinalized = true;
			recorder.subagentDone();
			// The run that asked for help belongs to no task, and shutdown waits
			// for idle. Abort it so stop does not time out on an orphaned turn.
			if (!sessionContext.isIdle()) {
				sessionContext.abort();
			}
			sessionContext.shutdown();
			return;
		}
		currentTask = inbox.task;
		latestAgentMessages = undefined;
		recorder.taskStart();
		// Pi may still be unwinding agent_settled; followUp queues the next turn.
		pi.sendUserMessage(inbox.message, { deliverAs: "followUp" });
	}

	if (autoExit) return;

	pi.registerTool({
		name: "subagent_done",
		label: "Subagent Done",
		description:
			"Call this tool when you have completed the current task. " +
			"For a persistent specialist it returns the task result and keeps the session available for subagent_send; " +
			"otherwise it closes this session and returns your results to the main session. " +
			"Your LAST assistant message before calling this becomes the summary returned to the caller.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const sessionFile = process.env.PI_SUBAGENT_SESSION;
			let messages = latestAgentMessages;
			try {
				const branch = ctx.sessionManager
					.getBranch()
					.flatMap((entry) =>
						entry.type === "message" ? [entry.message] : [],
					);
				if (branch.length) messages = branch;
			} catch {
				// Use agent_end evidence if the session branch is unavailable.
			}
			recorder.subagentDone();
			if (persistent) {
				// A persistent child outlives its tasks. With no current task (for
				// example right after caller_ping) it must stay available instead of
				// writing .exit and shutting down.
				if (!sessionFile || !currentTask) {
					return {
						content: [
							{
								type: "text",
								text: "No current task. Staying available for subagent_send.",
							},
						],
						details: {},
					};
				}
				appendPersistentTaskEvent(
					sessionFile,
					buildPersistentTaskEvent(currentTask, generation),
				);
				publishResult(messages, currentTask);
				currentTask = "";
				drainInbox();
				return {
					content: [
						{
							type: "text",
							text: "Task complete. Staying available for subagent_send.",
						},
					],
					details: {},
				};
			}
			if (sessionFile) {
				writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }));
				publishResult(messages);
			}
			completionFinalized = true;
			ctx.shutdown();
			return {
				content: [{ type: "text", text: "Shutting down subagent session." }],
				details: {},
			};
		},
	});
}
