import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import type { Stats } from "node:fs";
import {
	assessWorktreeWrite,
	canonicalPath,
	pathInside,
	readWorktreeBoundary,
	registerWorktreeBoundaryGuard,
	writingTargets,
	type WorktreeBoundaryFileSystem,
} from "../pi-extension/subagents/worktree-boundary.ts";
import { registerRexHostNotice } from "../pi-extension/subagents/host-notice.ts";
import { createMockExtensionApi } from "./helpers/mock-extension-api.ts";

const enoent = (path: string) =>
	Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });

/** A tiny macOS-like tree where /var is a symlink to /private/var. */
const macVarAliasFs: WorktreeBoundaryFileSystem = {
	realpath(path) {
		if (path === "/private/var" || path.startsWith("/private/var/")) {
			return path;
		}
		throw enoent(path);
	},
	lstat(path) {
		if (path === "/var") {
			// SAFETY: canonicalPath only asks whether this fixture node is a link.
			return { isSymbolicLink: () => true } as Stats;
		}
		throw enoent(path);
	},
	readlink(path) {
		if (path === "/var") return "/private/var";
		throw enoent(path);
	},
};

function fixture(
	run: (paths: {
		root: string;
		source: string;
		worktree: string;
		unrelated: string;
	}) => void,
) {
	const root = mkdtempSync(join(tmpdir(), "pira-worktree-boundary-"));
	mkdirSync(join(root, "source"));
	mkdirSync(join(root, "worktree"));
	mkdirSync(join(root, "unrelated"));
	const source = realpathSync(join(root, "source"));
	const worktree = realpathSync(join(root, "worktree"));
	const unrelated = realpathSync(join(root, "unrelated"));
	try {
		run({ root, source, worktree, unrelated });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe("worktree boundary paths", () => {
	it("compares paths by component, not string prefix", () => {
		assert.equal(pathInside("/repo/source", "/repo/source"), true);
		assert.equal(pathInside("/repo/source", "/repo/source/file.ts"), true);
		assert.equal(
			pathInside("/repo/source", "/repo/source-other/file.ts"),
			false,
		);
		assert.equal(pathInside("/repo/source", "/repo"), false);
	});

	it("canonicalizes /var and /private/var aliases through an injected filesystem", () => {
		assert.equal(
			canonicalPath("/var/repo/work/file.ts", macVarAliasFs),
			"/private/var/repo/work/file.ts",
		);
		assert.equal(
			canonicalPath("/private/var/repo/work/file.ts", macVarAliasFs),
			"/private/var/repo/work/file.ts",
		);
	});

	it("reads only complete absolute boundaries", () => {
		assert.equal(readWorktreeBoundary({}), undefined);
		assert.equal(
			readWorktreeBoundary({
				PI_SUBAGENT_WORKTREE: "relative/worktree",
				PI_SUBAGENT_SOURCE_CWD: "/repo/source",
			}),
			undefined,
		);
	});
});

describe("worktree write decisions", () => {
	it("blocks source-checkout writes and offers the worktree path", () => {
		fixture(({ source, worktree }) => {
			writeFileSync(join(source, "src.ts"), "source\n");
			writeFileSync(join(worktree, "src.ts"), "worktree\n");
			const boundary = readWorktreeBoundary({
				PI_SUBAGENT_WORKTREE: worktree,
				PI_SUBAGENT_SOURCE_CWD: source,
			});
			assert.ok(boundary);

			const decision = assessWorktreeWrite({
				toolName: "write",
				input: { path: "../source/src.ts", content: "changed\n" },
				cwd: worktree,
				boundary,
			});
			assert.equal(decision.block, true);
			if (!decision.block) return;
			assert.equal(decision.target, join(source, "src.ts"));
			assert.equal(decision.suggested, join(worktree, "src.ts"));
			assert.match(decision.reason, /managed worktree session/);
			assert.match(decision.reason, /parent\/source checkout/);
			assert.match(decision.reason, /parent reviews and integrates/);
			assert.ok(decision.reason.includes(join(worktree, "src.ts")));
		});
	});

	it("normalizes file-tool home, @, file URL, and Unicode-space paths", () => {
		fixture(({ source, worktree }) => {
			const target = join(source, "file name.ts");
			for (const path of [
				`~/${relative(homedir(), target)}`,
				`@${target}`,
				pathToFileURL(target).href,
				target.replace("file name", "file\u00a0name"),
			]) {
				for (const toolName of ["edit", "write"]) {
					const decision = assessWorktreeWrite({
						toolName,
						input: { path },
						cwd: worktree,
						boundary: { source, worktree },
					});
					assert.equal(decision.block, true, `${toolName}: ${path}`);
					if (decision.block) assert.equal(decision.target, target);
				}
			}
		});
	});

	it("handles nonexistent targets through their nearest existing ancestor", () => {
		fixture(({ source, worktree }) => {
			const boundary = readWorktreeBoundary({
				PI_SUBAGENT_WORKTREE: worktree,
				PI_SUBAGENT_SOURCE_CWD: source,
			});
			assert.ok(boundary);

			const decision = assessWorktreeWrite({
				toolName: "edit",
				input: { path: join(source, "new", "file.ts") },
				cwd: worktree,
				boundary,
			});
			assert.equal(decision.block, true);
			if (!decision.block) return;
			assert.equal(decision.target, join(source, "new", "file.ts"));
			assert.equal(decision.suggested, join(worktree, "new", "file.ts"));
		});
	});

	it("resolves symlinked targets, ancestors, and dangling links", () => {
		fixture(({ source, worktree }) => {
			writeFileSync(join(source, "src.ts"), "source\n");
			mkdirSync(join(source, "nested"));
			symlinkSync(join(source, "src.ts"), join(worktree, "linked.ts"));
			symlinkSync(source, join(worktree, "source-alias"), "dir");
			symlinkSync(join(source, "missing.ts"), join(worktree, "dangling.ts"));
			const boundary = readWorktreeBoundary({
				PI_SUBAGENT_WORKTREE: worktree,
				PI_SUBAGENT_SOURCE_CWD: source,
			});
			assert.ok(boundary);

			for (const path of [
				"linked.ts",
				"source-alias/nested/new.ts",
				"dangling.ts",
			]) {
				const decision = assessWorktreeWrite({
					toolName: "write",
					input: { path },
					cwd: worktree,
					boundary,
				});
				assert.equal(decision.block, true, path);
			}
		});
	});

	it("allows the worktree, reads, and unrelated outside paths", () => {
		fixture(({ source, worktree, unrelated }) => {
			writeFileSync(join(source, "src.ts"), "source\n");
			const boundary = readWorktreeBoundary({
				PI_SUBAGENT_WORKTREE: worktree,
				PI_SUBAGENT_SOURCE_CWD: source,
			});
			assert.ok(boundary);

			assert.deepEqual(
				assessWorktreeWrite({
					toolName: "write",
					input: { path: join(worktree, "new.ts") },
					cwd: worktree,
					boundary,
				}),
				{ block: false },
			);
			assert.deepEqual(
				assessWorktreeWrite({
					toolName: "read",
					input: { path: join(source, "src.ts") },
					cwd: worktree,
					boundary,
				}),
				{ block: false },
			);
			assert.deepEqual(
				assessWorktreeWrite({
					toolName: "write",
					input: { path: join(unrelated, "note.txt") },
					cwd: worktree,
					boundary,
				}),
				{ block: false },
			);
		});
	});

	it("treats /var and /private/var as the same boundary", () => {
		const decision = assessWorktreeWrite({
			toolName: "write",
			input: { path: "/var/repo/source/file.ts" },
			cwd: "/private/var/repo/worktree",
			boundary: {
				worktree: "/private/var/repo/worktree",
				source: "/private/var/repo/source",
			},
			fs: macVarAliasFs,
		});
		assert.equal(decision.block, true);
		if (!decision.block) return;
		assert.equal(decision.target, "/private/var/repo/source/file.ts");
		assert.equal(decision.suggested, "/private/var/repo/worktree/file.ts");
	});

	it("recognizes writing tools with explicit path parameters", () => {
		assert.deepEqual(writingTargets("write", { path: "a" }), ["a"]);
		assert.deepEqual(writingTargets("edit_file", { file_path: "b" }), ["b"]);
		assert.deepEqual(writingTargets("read", { path: "c" }), []);
		assert.deepEqual(
			writingTargets("str_replace_editor", { command: "view", path: "c" }),
			[],
		);
	});
});

describe("worktree boundary guard", () => {
	it("is a no-op without a worktree boundary", () => {
		const mock = createMockExtensionApi();
		assert.equal(registerWorktreeBoundaryGuard(mock.api, { env: {} }), false);
		assert.equal(mock.eventHandlers.size, 0);
	});

	it("blocks a source write and notifies, while allowing a worktree write", async () => {
		const root = mkdtempSync(join(tmpdir(), "pira-worktree-guard-"));
		mkdirSync(join(root, "source"));
		mkdirSync(join(root, "worktree"));
		const source = realpathSync(join(root, "source"));
		const worktree = realpathSync(join(root, "worktree"));
		try {
			writeFileSync(join(source, "src.ts"), "source\n");
			const mock = createMockExtensionApi();
			assert.equal(
				registerWorktreeBoundaryGuard(mock.api, {
					env: {
						PI_SUBAGENT_WORKTREE: worktree,
						PI_SUBAGENT_SOURCE_CWD: source,
					},
				}),
				true,
			);
			const handler = mock.eventHandlers.get("tool_call")?.[0];
			assert.ok(handler);
			const notifications: string[] = [];
			const ctx = {
				cwd: worktree,
				ui: {
					notify(message: string) {
						notifications.push(message);
					},
				},
			};

			const blocked = await handler(
				{
					toolName: "write",
					input: { path: join(source, "src.ts") },
				},
				ctx,
			);
			assert.equal(blocked?.block, true);
			assert.match(blocked.reason, /parent\/source checkout/);
			assert.deepEqual(notifications, [
				"Blocked a write to the parent/source checkout.",
			]);

			const allowed = await handler(
				{
					toolName: "write",
					input: { path: join(worktree, "src.ts") },
				},
				ctx,
			);
			assert.equal(allowed, undefined);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("worktree host notice", () => {
	it("states the absolute workspace and source constraints for worktree children", () => {
		fixture(({ source, worktree }) => {
			const mock = createMockExtensionApi();
			registerRexHostNotice(
				mock.api,
				{ sessionId: "session:wt", blockId: "block:wt" },
				{ maxDepth: 1 },
				{
					PI_SUBAGENT_ID: "worktree-child",
					PI_SUBAGENT_WORKTREE: worktree,
					PI_SUBAGENT_SOURCE_CWD: source,
					PI_SUBAGENT_DEPTH: "1",
				},
			);
			const event = { systemPromptOptions: { appendSystemPrompt: "" } };
			for (const handler of mock.eventHandlers.get("before_agent_start") ?? [])
				handler(event, {});

			const prompt = event.systemPromptOptions.appendSystemPrompt;
			assert.match(prompt, /^\[Rex child\]/);
			assert.ok(
				prompt.includes(
					`Your workspace is the managed worktree at ${worktree}.`,
				),
			);
			assert.ok(prompt.includes(`parent/source checkout at ${source}`));
			assert.match(prompt, /Do not cd into or modify/);
			assert.match(prompt, /parent reviews and integrates/);
			assert.match(prompt, /Bash and other shell commands cannot be confined/);
		});
	});

	it("keeps the host marker for an interactive handoff but adds the workspace contract", () => {
		fixture(({ source, worktree }) => {
			const mock = createMockExtensionApi();
			registerRexHostNotice(
				mock.api,
				{ sessionId: "session:handoff", blockId: "block:handoff" },
				{ maxDepth: 1 },
				{
					PI_SUBAGENT_WORKTREE: worktree,
					PI_SUBAGENT_SOURCE_CWD: source,
					PI_SUBAGENT_DEPTH: "1",
				},
			);
			const event = { systemPromptOptions: { appendSystemPrompt: "" } };
			for (const handler of mock.eventHandlers.get("before_agent_start") ?? [])
				handler(event, {});

			const prompt = event.systemPromptOptions.appendSystemPrompt;
			assert.match(prompt, /^\[Rex host\]/);
			assert.ok(
				prompt.includes(
					`Your workspace is the managed worktree at ${worktree}.`,
				),
			);
			assert.ok(prompt.includes(`parent/source checkout at ${source}`));
		});
	});

	it("keeps ordinary child and host notices unchanged", () => {
		const childMock = createMockExtensionApi();
		registerRexHostNotice(
			childMock.api,
			{ sessionId: "session:child", blockId: "block:child" },
			{ maxDepth: 1 },
			{ PI_SUBAGENT_ID: "child-1", PI_SUBAGENT_DEPTH: "1" },
		);
		const childEvent = { systemPromptOptions: { appendSystemPrompt: "" } };
		for (const handler of childMock.eventHandlers.get("before_agent_start") ??
			[])
			handler(childEvent, {});
		assert.match(
			childEvent.systemPromptOptions.appendSystemPrompt,
			/^\[Rex child\]/,
		);
		assert.doesNotMatch(
			childEvent.systemPromptOptions.appendSystemPrompt,
			/managed worktree/,
		);

		const hostMock = createMockExtensionApi();
		registerRexHostNotice(
			hostMock.api,
			{ sessionId: "session:host", blockId: "block:host" },
			{ maxDepth: 1 },
			{},
		);
		const hostEvent = { systemPromptOptions: { appendSystemPrompt: "" } };
		for (const handler of hostMock.eventHandlers.get("before_agent_start") ??
			[])
			handler(hostEvent, {});
		assert.match(
			hostEvent.systemPromptOptions.appendSystemPrompt,
			/^\[Rex host\]/,
		);
	});
});
