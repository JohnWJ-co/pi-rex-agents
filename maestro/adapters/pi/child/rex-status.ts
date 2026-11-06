import { closeSync, openSync, writeSync } from "node:fs";
import { formatProgramStatus } from "@earendil-works/pi-tui";

/** Pi owns the root OSC record. This extension only publishes its pira child. */
export function formatRexChildStatus(
	state: "working" | "done" | "error",
	metadata: { taskId: string; generation: string; result: string },
): string {
	return formatProgramStatus({
		state,
		app: "pira",
		message: `task=${metadata.taskId} gen=${metadata.generation} result=${metadata.result}`,
	}).replace("\x1b]7501;", "\x1b]7501;id=pira:");
}

export function reportRexChildStatus(
	state: "working" | "done" | "error",
	metadata: { taskId: string; generation: string; result: string },
): void {
	let fd: number | undefined;
	try {
		fd = openSync("/dev/tty", "w");
		writeSync(fd, formatRexChildStatus(state, metadata));
	} catch {
		// No controlling terminal is normal in RPC and unit-test processes.
	} finally {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				// Observability must never interfere with completion.
			}
		}
	}
}
