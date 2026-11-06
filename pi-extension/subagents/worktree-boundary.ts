/** Worktree child path isolation: instruction context plus an edit/write guard. */
import { lstatSync, readlinkSync, realpathSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	isRecord,
	isString,
	type JsonObject,
} from "../../maestro/core/config/type-guards.ts";
import {
	WORKTREE_PATH_ENV,
	WORKTREE_SOURCE_ENV,
} from "../../maestro/core/worktree.ts";

export interface WorktreeBoundary {
	/** Canonical path of the checkout the child owns. */
	worktree: string;
	/** Canonical path of the parent/source checkout, which is read-only here. */
	source: string;
}

export interface WorktreeBoundaryFileSystem {
	realpath(path: string): string;
	lstat(path: string): Stats;
	readlink(path: string): string;
}

export interface WorktreeWriteInput {
	toolName: string;
	input: JsonObject;
	cwd: string;
	boundary: WorktreeBoundary;
	fs?: WorktreeBoundaryFileSystem;
}

export type WorktreeWriteDecision =
	| { block: false }
	| {
			block: true;
			reason: string;
			target: string;
			suggested: string;
	  };

const nodeFileSystem: WorktreeBoundaryFileSystem = {
	realpath: realpathSync,
	lstat: lstatSync,
	readlink: readlinkSync,
};

const MISSING_CODES = new Set(["ENOENT", "ENOTDIR"]);
const MAX_SYMLINK_HOPS = 40;

function errorCode(error: Error): string | undefined {
	// SAFETY: file-system failures are Node errors with an optional errno code.
	return (error as NodeJS.ErrnoException).code;
}

/** True when `target` is `root` or a descendant, with path-component boundaries. */
export function pathInside(root: string, target: string): boolean {
	const rel = relative(root, target);
	return (
		rel === "" ||
		(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
	);
}

/**
 * Resolve symlinks for an existing or not-yet-existing path.
 *
 * realpath() supplies the platform's canonical aliases (`/var` and
 * `/private/var` on macOS, for example). Missing tails are resolved through
 * their nearest existing ancestor; a dangling final symlink is followed so a
 * link into the source checkout cannot hide behind ENOENT.
 */
export function canonicalPath(
	path: string,
	fs: WorktreeBoundaryFileSystem = nodeFileSystem,
): string {
	let current = resolve(path);
	const suffix: string[] = [];
	for (let hop = 0; hop <= MAX_SYMLINK_HOPS; hop++) {
		try {
			const canonical = fs.realpath(current);
			return resolve(canonical, ...suffix.reverse());
		} catch (error) {
			const code = error instanceof Error ? errorCode(error) : undefined;
			if (!code || !MISSING_CODES.has(code)) throw error;
		}
		let stats: Stats | undefined;
		try {
			stats = fs.lstat(current);
		} catch (error) {
			const code = error instanceof Error ? errorCode(error) : undefined;
			if (!code || !MISSING_CODES.has(code)) throw error;
		}
		if (stats?.isSymbolicLink()) {
			const target = fs.readlink(current);
			current = resolve(dirname(current), target);
			continue;
		}
		const parent = dirname(current);
		if (parent === current) {
			throw new Error(`Cannot canonicalize ${JSON.stringify(path)}`);
		}
		suffix.push(relative(parent, current));
		current = parent;
	}
	throw Object.assign(
		new Error(`Too many symbolic links while canonicalizing ${path}`),
		{ code: "ELOOP" },
	);
}

/**
 * Read the boundary carried by the launch protocol. Missing, relative, or
 * identical values mean this is not a managed worktree session.
 */
export function readWorktreeBoundary(
	env: NodeJS.ProcessEnv,
	fs: WorktreeBoundaryFileSystem = nodeFileSystem,
): WorktreeBoundary | undefined {
	const worktree = env[WORKTREE_PATH_ENV];
	const source = env[WORKTREE_SOURCE_ENV];
	if (!worktree || !source || !isAbsolute(worktree) || !isAbsolute(source)) {
		return undefined;
	}
	const canonicalWorktree = canonicalPath(worktree, fs);
	const canonicalSource = canonicalPath(source, fs);
	if (canonicalWorktree === canonicalSource) return undefined;
	return { worktree: canonicalWorktree, source: canonicalSource };
}

/**
 * Writing tools with an explicit file path parameter. Only these tools can be
 * checked reliably; shell commands are deliberately outside this guard.
 */
function writingPathKeys(toolName: string): readonly string[] {
	switch (toolName) {
		case "write":
		case "edit":
		case "str_replace_editor":
			return ["path", "file_path", "filePath"];
		case "multi_edit":
		case "create_file":
		case "write_file":
		case "edit_file":
			return ["path", "file_path", "filePath"];
		case "notebook_edit":
			return ["notebook_path", "path"];
		default:
			return [];
	}
}

export function writingTargets(toolName: string, input: JsonObject): string[] {
	if (toolName === "str_replace_editor" && input.command === "view") return [];
	const targets = new Set<string>();
	for (const key of writingPathKeys(toolName)) {
		const value = input[key];
		if (isString(value) && value.length > 0) targets.add(value);
	}
	return [...targets];
}

/** Match Pi file-tool path normalization before checking the real target. */
function writingTargetPath(
	toolName: string,
	path: string,
	cwd: string,
): string {
	if (toolName === "edit" || toolName === "write") {
		path = path.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
		if (path.startsWith("@")) path = path.slice(1);
		if (path === "~") path = homedir();
		else if (path.startsWith("~/")) path = join(homedir(), path.slice(2));
		if (path.startsWith("file://")) path = fileURLToPath(path);
	}
	return resolve(cwd, path);
}

export function assessWorktreeWrite({
	toolName,
	input,
	cwd,
	boundary,
	fs = nodeFileSystem,
}: WorktreeWriteInput): WorktreeWriteDecision {
	for (const rawTarget of writingTargets(toolName, input)) {
		const target = canonicalPath(
			writingTargetPath(toolName, rawTarget, cwd),
			fs,
		);
		if (
			!pathInside(boundary.source, target) ||
			pathInside(boundary.worktree, target)
		) {
			continue;
		}
		const suffix = relative(boundary.source, target);
		const suggested = suffix
			? join(boundary.worktree, suffix)
			: boundary.worktree;
		return {
			block: true,
			target,
			suggested,
			reason: [
				`This is a managed worktree session. The target \`${target}\` is inside the parent/source checkout \`${boundary.source}\`, outside your worktree \`${boundary.worktree}\`.`,
				"Do not modify the parent checkout; the parent reviews and integrates your work.",
				`Use the corresponding worktree path instead: \`${suggested}\`${
					suffix ? "." : " (the worktree root)."
				}`,
			].join(" "),
		};
	}
	return { block: false };
}

export interface WorktreeBoundaryGuardOptions {
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	fs?: WorktreeBoundaryFileSystem;
}

/**
 * Block known writing tools whose explicit target resolves into the source
 * checkout. Ordinary children have no boundary environment and register no
 * handler. Bash is intentionally not parsed here: the child notice states the
 * prompt-level workspace contract that shell commands cannot be confined to.
 */
export function registerWorktreeBoundaryGuard(
	pi: ExtensionAPI,
	{
		env = process.env,
		cwd = process.cwd(),
		fs,
	}: WorktreeBoundaryGuardOptions = {},
): boolean {
	const boundary = readWorktreeBoundary(env, fs);
	if (!boundary) return false;
	pi.on("tool_call", async (event, ctx) => {
		const decision = assessWorktreeWrite({
			toolName: event.toolName,
			input: isRecord(event.input) ? event.input : {},
			cwd: ctx.cwd || cwd,
			boundary,
			fs,
		});
		if (!decision.block) return;
		ctx.ui?.notify("Blocked a write to the parent/source checkout.", "warning");
		return { block: true, reason: decision.reason };
	});
	return true;
}
