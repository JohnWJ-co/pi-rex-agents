import { existsSync, readFileSync, rmSync } from "node:fs";

import { isNonEmptyString, isString } from "../../core/config/type-guards.ts";
import {
	parseChildAcceptReport,
	type ChildAcceptReport,
} from "../../core/accept.ts";

const ABORT_MESSAGE = "Aborted while waiting for subagent to finish";

export interface CompletionResult {
	reason: "done" | "ping" | "exitcode" | "error";
	exitCode: number;
	ping?: { name: string; message: string };
	errorMessage?: string;
	/** Who wrote errorMessage: the child's sidecar, or the host's own diagnostic. */
	errorSource?: "child" | "host";
	/** The child's own accept-check report; evidence, never the verdict. */
	accept?: ChildAcceptReport;
}

export interface CompletionOptions {
	intervalMs: number;
	/** Legacy diagnostic callback; completion never reads terminal contents. */
	readTerminalTail?: () => Promise<string>;
	inspectPane?: () => Promise<import("../../core/types.ts").PaneInspection>;
	/** Bounded artifact grace after explicit pane disappearance. Default: 500ms. */
	paneDisappearanceGraceMs?: number;
	onPaneInspection?: (
		inspection: import("../../core/types.ts").PaneInspection,
		observedAt: number,
	) => void;
	sessionFile?: string;
	/** Persistent lifetime ownership cannot end on a pre-shutdown sidecar. */
	requireProcessExit?: boolean;
	/** Only launch-verified process identity, never transcript or activity state. */
	inspectProcess?: () => "alive" | "exited" | "unknown";
	onTick?: (elapsedSeconds: number) => void;
	/** Wait for a local file wake-up or a scheduled reconciliation. */
	waitForNextCheck?: (signal: AbortSignal) => Promise<"wake" | "reconcile">;
	/** Drain local task evidence before any terminal fallback. */
	onLocalEvidence?: () => void;
}

export function interpretExitSidecar(payload: any): CompletionResult {
	if (payload?.type === "ping") {
		return {
			reason: "ping",
			exitCode: 0,
			ping: {
				name: isString(payload.name) ? payload.name : "subagent",
				message: isString(payload.message) ? payload.message : "",
			},
		};
	}

	if (payload?.type === "error") {
		return isNonEmptyString(payload.errorMessage)
			? {
					reason: "error",
					exitCode: 1,
					errorMessage: payload.errorMessage,
					errorSource: "child",
				}
			: {
					reason: "error",
					exitCode: 1,
					errorMessage:
						"Subagent exited with stopReason=error (no errorMessage in sidecar).",
					errorSource: "host",
				};
	}

	if (payload?.type === "done") {
		const accept = parseChildAcceptReport(payload.accept);
		return accept
			? { reason: "done", exitCode: 0, accept }
			: { reason: "done", exitCode: 0 };
	}

	return {
		reason: "error",
		exitCode: 1,
		errorMessage:
			"Invalid subagent completion sidecar: unsupported payload type.",
		errorSource: "host",
	};
}

function readExitSidecar(
	sessionFile: string | undefined,
	consume = true,
): CompletionResult | null {
	if (!sessionFile) return null;

	const exitFile = `${sessionFile}.exit`;
	if (!existsSync(exitFile)) return null;

	try {
		const result = interpretExitSidecar(
			JSON.parse(readFileSync(exitFile, "utf8")),
		);
		if (consume) rmSync(exitFile, { force: true });
		return result;
	} catch {
		// The child may still be writing the file. Retry on the next polling cycle.
		return null;
	}
}

function readExitCode(sessionFile: string | undefined): number | null {
	if (!sessionFile) return null;
	try {
		const raw = readFileSync(`${sessionFile}.exitcode`, "utf8").trim();
		if (!/^\d{1,3}$/.test(raw)) return null;
		const code = Number(raw);
		return code <= 255 ? code : null;
	} catch {
		return null;
	}
}

function completionArtifact(
	options: CompletionOptions,
): CompletionResult | null {
	const sidecar = readExitSidecar(
		options.sessionFile,
		!options.requireProcessExit,
	);
	if (sidecar) return sidecar;
	const exitCode = readExitCode(options.sessionFile);
	if (
		exitCode !== null &&
		(!options.requireProcessExit || options.inspectProcess?.() !== "alive")
	)
		return { reason: "exitcode", exitCode };
	return null;
}

async function waitForDelayedSidecar(
	signal: AbortSignal,
	options: CompletionOptions,
): Promise<CompletionResult | null> {
	// Pi can exit before its wrapper publishes .exitcode. Keep the existing
	// bounded grace before falling back to the pre-shutdown semantic sidecar.
	const readPublishedCompletion = () =>
		options.requireProcessExit && readExitCode(options.sessionFile) === null
			? null
			: completionArtifact(options);
	const immediate = readPublishedCompletion();
	if (immediate) return immediate;

	const graceMs = Math.max(0, options.paneDisappearanceGraceMs ?? 500);
	const deadline = Date.now() + graceMs;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		await abortableDelay(Math.min(25, remaining), signal);
		const result = readPublishedCompletion();
		if (result) return result;
	}
	return completionArtifact(options);
}

function abortableDelay(
	milliseconds: number,
	signal: AbortSignal,
): Promise<void> {
	if (signal.aborted) return Promise.reject(new Error(ABORT_MESSAGE));

	return new Promise<void>((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timer);
			reject(new Error(ABORT_MESSAGE));
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, milliseconds);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

export async function waitForCompletion(
	signal: AbortSignal,
	options: CompletionOptions,
): Promise<CompletionResult> {
	const result = await detectCompletion(signal, options);
	if (options.requireProcessExit && options.sessionFile) {
		try {
			rmSync(`${options.sessionFile}.exit`, { force: true });
		} catch {
			// Exit is already verified; a failed artifact cleanup cannot undo it.
		}
	}
	return result;
}

async function detectCompletion(
	signal: AbortSignal,
	options: CompletionOptions,
): Promise<CompletionResult> {
	const startedAt = Date.now();

	// Coordinated supervision waits for its first shared epoch before remote
	// inspection; local completion artifacts are checked on every wake.
	let reconcile = !options.waitForNextCheck;
	let observedAgent = false;
	for (;;) {
		if (signal.aborted) throw new Error(ABORT_MESSAGE);

		// The child writes .exit before ctx.shutdown(). Keep semantic evidence
		// on disk until independent exit evidence permits releasing a persistent
		// owner, including when all waiters abort and a later wait starts afresh.
		const sidecarResult = readExitSidecar(
			options.sessionFile,
			!options.requireProcessExit,
		);
		if (sidecarResult && !options.requireProcessExit) return sidecarResult;
		options.onLocalEvidence?.();

		const exitCode = readExitCode(options.sessionFile);
		if (
			exitCode !== null &&
			(!options.requireProcessExit || options.inspectProcess?.() !== "alive")
		) {
			options.onLocalEvidence?.();
			const completion =
				completionArtifact(options) ??
				(exitCode !== 0 ? await waitForDelayedSidecar(signal, options) : null);
			if (options.requireProcessExit && options.inspectProcess?.() === "alive")
				continue;
			return completion ?? { reason: "exitcode", exitCode };
		}

		if (options.requireProcessExit && options.inspectProcess?.() === "exited") {
			const completion = await waitForDelayedSidecar(signal, options);
			return (
				completion ?? {
					reason: "error",
					exitCode: 1,
					errorMessage:
						"Subagent process exited before completion evidence was recorded.",
					errorSource: "host",
				}
			);
		}

		if (reconcile && options.inspectPane) {
			let inspection: import("../../core/types.ts").PaneInspection;
			try {
				inspection = await options.inspectPane();
			} catch {
				inspection = { kind: "unavailable", error: "inspectPane threw" };
			}
			const observedAt = Date.now();
			options.onPaneInspection?.(inspection, observedAt);
			const agentExitedWithShell =
				options.requireProcessExit &&
				observedAgent &&
				inspection.kind === "present" &&
				inspection.agent === "shell";
			if (
				inspection.kind === "present" &&
				inspection.agent !== undefined &&
				inspection.agent !== "shell"
			)
				observedAgent = true;
			const paneDisappeared =
				inspection.kind === "missing" || agentExitedWithShell;
			if (
				paneDisappeared &&
				(!options.requireProcessExit || options.inspectProcess?.() !== "alive")
			) {
				// Drain concurrent persistent events before accepting pane fallback.
				options.onLocalEvidence?.();
				// Pane closure and atomic artifact publication are separate operations.
				// Allow a short bounded grace window before declaring evidence lost.
				const racedCompletion = await waitForDelayedSidecar(signal, options);
				if (
					options.requireProcessExit &&
					options.inspectProcess?.() === "alive"
				)
					continue;
				if (racedCompletion) return racedCompletion;
				return {
					reason: "error",
					exitCode: 1,
					errorMessage: agentExitedWithShell
						? "Subagent process exited before completion evidence was recorded."
						: "Subagent block disappeared before completion evidence was recorded.",
					errorSource: "host",
				};
			}
		}

		options.onTick?.(Math.floor((Date.now() - startedAt) / 1000));
		if (options.waitForNextCheck) {
			reconcile = (await options.waitForNextCheck(signal)) === "reconcile";
		} else {
			await abortableDelay(options.intervalMs, signal);
			reconcile = true;
		}
	}
}
