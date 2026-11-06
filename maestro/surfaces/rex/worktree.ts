import { homedir } from "node:os";
import { join } from "node:path";

/** Managed worktree root used by both the provider and the cleanup adapter. */
export function rexWorktreeRoot(): string {
	return join(homedir(), ".pi", "rex-agents", "worktrees");
}
