import "../isolated-agent-dir.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	writeResultArtifact,
	findFinalAssistantText,
} from "../../maestro/adapters/pi/child/subagent-done.ts";
import { formatRexChildStatus } from "../../maestro/adapters/pi/child/rex-status.ts";
import { watchPersistentInbox } from "../../maestro/adapters/pi/child/inbox.ts";
import { withExitCodeArtifact } from "../../maestro/adapters/pi/launch-command.ts";
import {
	consumePersistentTaskInbox,
	getSubagentResultFile,
	readSubagentResult,
	writePersistentTaskInbox,
	type PersistentTaskInboxEntry,
	type SubagentResultArtifact,
} from "../../maestro/adapters/pi/session.ts";

function fixture(t: import("node:test").TestContext) {
	const dir = mkdtempSync(join(tmpdir(), "pira-result-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const session = join(dir, "child.jsonl");
	const result: SubagentResultArtifact = {
		v: 1,
		finalText: "final child text",
		subagentId: "child",
		taskId: "task-1",
		generation: "generation-1",
		status: "done",
		blockId: "block:child",
		finishedAt: new Date().toISOString(),
	};
	return { dir, session, result };
}

test("result publication replaces complete JSON and removes temporary files even on rename failure", (t) => {
	const { dir, session, result } = fixture(t);
	writeResultArtifact(session, result);
	assert.deepEqual(readSubagentResult(session, result), result);
	const replacement = { ...result, finalText: "replacement" };
	writeResultArtifact(session, replacement);
	assert.equal(readSubagentResult(session, result)?.finalText, "replacement");
	assert.deepEqual(readdirSync(dir), ["child.jsonl.result.json"]);
	rmSync(getSubagentResultFile(session));
	mkdirSync(getSubagentResultFile(session));
	assert.throws(() => writeResultArtifact(session, result));
	assert.deepEqual(readdirSync(dir), ["child.jsonl.result.json"]);
});

for (const field of ["subagentId", "taskId", "generation"] as const)
	test(`result identity rejects a different ${field}`, (t) => {
		const { session, result } = fixture(t);
		writeResultArtifact(session, result);
		assert.equal(
			readSubagentResult(session, { ...result, [field]: "other" }),
			null,
		);
	});

test("result reader rejects missing, partial, malformed and unsupported artifacts", (t) => {
	const { session, result } = fixture(t);
	assert.equal(readSubagentResult(session, result), null);
	for (const content of [
		"{",
		"null",
		JSON.stringify({ ...result, v: 2 }),
		JSON.stringify({ ...result, status: "working" }),
		JSON.stringify({ ...result, finishedAt: "invalid" }),
	]) {
		writeFileSync(getSubagentResultFile(session), content);
		assert.equal(readSubagentResult(session, result), null);
	}
});

test("persistent results belong to individual tasks and cannot escape their directory", (t) => {
	const { session, result } = fixture(t);
	const first = { ...result, taskId: "../one/two" };
	writeResultArtifact(session, first, true);
	writeResultArtifact(session, { ...result, finalText: "second" }, true);
	assert.deepEqual(
		readSubagentResult(session, { ...first, persistent: true }),
		first,
	);
	assert.equal(
		readSubagentResult(session, { ...result, persistent: true })?.finalText,
		"second",
	);
	assert.equal(readSubagentResult(session, result), null);
});

test("final result text skips empty assistant messages and tool output", () => {
	assert.equal(
		findFinalAssistantText([
			{ role: "assistant", content: [{ type: "text", text: "early" }] },
			{
				role: "assistant",
				content: [
					{ type: "text", text: "last" },
					{ type: "text", text: "line" },
					{ type: "thinking", text: "hidden" },
				],
			},
			{ role: "toolResult", content: [{ type: "text", text: "tool" }] },
			{ role: "assistant", content: [{ type: "text", text: "  " }] },
		]),
		"last\nline",
	);
});

test("exitcode script preserves shell status, quotes paths and replaces stale evidence", (t) => {
	const { dir } = fixture(t);
	const session = join(dir, "child ' $ literal.jsonl");
	writeFileSync(`${session}.exitcode`, "0\n");
	writeFileSync(`${session}.exit`, '{"type":"done"}');
	assert.throws(
		() =>
			execFileSync("bash", ["-c", withExitCodeArtifact("(exit 17)", session)], {
				stdio: "pipe",
			}),
		{ status: 17 },
	);
	assert.equal(readFileSync(`${session}.exitcode`, "utf8"), "17\n");
	assert.deepEqual(readdirSync(dir), ["child ' $ literal.jsonl.exitcode"]);
});

test("OSC child records retain pira identity and cap decoded UTF-8 metadata at 2048 bytes", () => {
	for (const state of ["working", "done", "error"] as const) {
		const sequence = formatRexChildStatus(state, {
			taskId: "task",
			generation: "gen",
			result: "child.result.json",
		});
		assert.ok(
			sequence.startsWith(`\x1b]7501;id=pira:state=${state}:app=pira:msg=`),
		);
		assert.ok(sequence.endsWith("\x1b\\"));
		const encoded = sequence.split("msg=")[1].slice(0, -2);
		assert.equal(
			Buffer.from(encoded, "base64").toString("utf8"),
			"task=task gen=gen result=child.result.json",
		);
	}
	const sequence = formatRexChildStatus("done", {
		taskId: "中文\x07\x1b".repeat(1000),
		generation: "gen",
		result: "file",
	});
	const decoded = Buffer.from(sequence.split("msg=")[1].slice(0, -2), "base64");
	assert.ok(decoded.length <= 2048);
	for (const character of decoded.toString("utf8")) {
		const code = character.codePointAt(0);
		assert.ok(
			code !== undefined && code >= 32 && code !== 127 && code !== 0xfffd,
		);
	}
});

test("atomic inbox rename wakes an idle watcher before the five-second reconciliation", async (t) => {
	const { session } = fixture(t);
	const probe = `${session}.task-inbox.watcher-probe`;
	let markReady = () => {};
	let receiveInbox = (_inbox: PersistentTaskInboxEntry) => {};
	let readyDeadline: ReturnType<typeof setTimeout> | undefined;
	const ready = new Promise<void>((resolve, reject) => {
		markReady = resolve;
		readyDeadline = setTimeout(
			() => reject(new Error("watcher 未就绪：2 秒内未收到探针事件")),
			2_000,
		);
	});
	const stop = watchPersistentInbox(session, () => {
		if (existsSync(probe)) {
			markReady();
			return;
		}
		const inbox = consumePersistentTaskInbox(session);
		if (inbox) receiveInbox(inbox);
	});
	t.after(stop);
	// FSEvents can miss writes during startup; wait for an observed directory event.
	const probeWrites = setInterval(() => writeFileSync(probe, "ready"), 25);
	try {
		writeFileSync(probe, "ready");
		await ready;
	} finally {
		clearTimeout(readyDeadline);
		clearInterval(probeWrites);
		rmSync(probe, { force: true });
	}

	let deadline: ReturnType<typeof setTimeout> | undefined;
	try {
		const inbox = await new Promise<PersistentTaskInboxEntry>(
			(resolve, reject) => {
				receiveInbox = resolve;
				deadline = setTimeout(
					() => reject(new Error("inbox did not wake before fallback")),
					2_000,
				);
				writePersistentTaskInbox(session, 1, {
					task: "task-2",
					message: "next task",
				});
			},
		);
		assert.equal(inbox.message, "next task");
	} finally {
		clearTimeout(deadline);
	}
});
