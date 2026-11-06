import { watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";

/** Directory watches survive the inbox publisher's atomic rename. */
export function watchPersistentInbox(
	sessionFile: string,
	check: () => void,
	fallbackMs = 5_000,
): () => void {
	let watcher: FSWatcher | undefined;
	let closed = false;
	const prefix = `${basename(sessionFile)}.task-inbox.`;
	const drain = () => {
		if (closed) return;
		try {
			check();
		} catch {
			// A malformed or transiently unavailable inbox must not kill the watcher.
		}
	};
	const attach = () => {
		if (closed || watcher) return;
		try {
			watcher = watch(dirname(sessionFile), (_event, filename) => {
				if (!filename || filename.toString().startsWith(prefix)) drain();
			});
			watcher.on("error", () => {
				watcher?.close();
				watcher = undefined;
			});
		} catch {
			// Reattach on the next reconciliation if the directory is not ready yet.
		}
	};
	attach();
	const poller = setInterval(() => {
		attach();
		drain();
	}, fallbackMs);
	poller.unref();
	drain();
	return () => {
		closed = true;
		clearInterval(poller);
		watcher?.close();
	};
}
