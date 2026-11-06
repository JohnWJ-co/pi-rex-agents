import type { RunResult, Task } from "../core/types.ts";

// pi-rex-agents extension
export function defaultRetainSurface(_result: RunResult, task: Task): boolean {
	return !!task.worktree;
}
