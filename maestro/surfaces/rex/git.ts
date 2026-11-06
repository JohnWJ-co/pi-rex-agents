/**
 * Minimal argv-only Git helper for worktree management.
 *
 * No shell, no interpolation. Keeping this separate from RexCli makes it
 * obvious that worktree operations never pass through Rex's command parser.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitResult {
	stdout: string;
	stderr: string;
}

export async function git(
	cwd: string,
	args: string[],
	timeoutMs = 30_000,
): Promise<GitResult> {
	try {
		const result = await execFileAsync("git", ["-C", cwd, ...args], {
			timeout: timeoutMs,
			maxBuffer: 16 * 1024 * 1024,
			encoding: "utf8",
		});
		return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
	} catch (error) {
		// SAFETY: execFile rejects with a Node child-process error carrying these fields.
		const err = error as {
			code?: number | string;
			stdout?: string;
			stderr?: string;
			message?: string;
		};
		const detail = (err.stderr || err.stdout || err.message || "").trim();
		throw new Error(
			`git ${args.join(" ")} failed in ${cwd}${detail ? `: ${detail}` : ""}`,
		);
	}
}

export function parseWorktreeList(output: string): Array<{
	path: string;
	head?: string;
	branch?: string;
	bare: boolean;
	detached: boolean;
	locked?: string;
	prunable?: string;
}> {
	const entries: Array<{
		path: string;
		head?: string;
		branch?: string;
		bare: boolean;
		detached: boolean;
		locked?: string;
		prunable?: string;
	}> = [];
	let current: (typeof entries)[number] | undefined;

	for (const line of output.split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current) entries.push(current);
			current = {
				path: line.slice("worktree ".length),
				bare: false,
				detached: false,
			};
			continue;
		}
		if (!current) continue;
		if (line.startsWith("HEAD ")) current.head = line.slice(5);
		else if (line.startsWith("branch ")) current.branch = line.slice(7);
		else if (line === "bare") current.bare = true;
		else if (line === "detached") current.detached = true;
		else if (line.startsWith("locked"))
			current.locked = line.slice(6).trim() || "locked";
		else if (line.startsWith("prunable"))
			current.prunable = line.slice(8).trim() || "prunable";
	}
	if (current) entries.push(current);
	return entries;
}

export function shortBranch(ref: string | undefined): string | undefined {
	return ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}
