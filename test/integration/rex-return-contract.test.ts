import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { isRecord, isString } from "../../maestro/core/config/type-guards.ts";
import {
	findLastAssistantSummary,
	getNewEntries,
	getSubagentResultFile,
	readSubagentResult,
} from "../../maestro/adapters/pi/session.ts";
import {
	childBlocks,
	createRexLab,
	destroyRexLab,
	rexAvailable,
	sendParentPrompt,
	startParentPi,
	waitForBlock,
	waitForFile,
	waitForProgramStatus,
	waitForReport,
	waitForSessionEntry,
	type RexLab,
} from "./rex-harness.ts";

const availability = rexAvailable();
const options = availability.ok
	? {}
	: { skip: `Rex return contract skipped: ${availability.reason}` };
let lab: RexLab | undefined;
let gates: string[] = [];

function findPiDescendant(rootPid: number): number {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const rows = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
			encoding: "utf8",
		});
		const processes = rows
			.split("\n")
			.map((line) => line.trim())
			.map((line) => {
				const match = /^(\d+)\s+(\d+)\s+(.*)$/.exec(line);
				return match
					? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }
					: undefined;
			})
			.filter(
				(entry): entry is { pid: number; ppid: number; command: string } =>
					Boolean(entry),
			);
		const descendants = new Set<number>([rootPid]);
		let changed = true;
		while (changed) {
			changed = false;
			for (const entry of processes) {
				if (descendants.has(entry.ppid) && !descendants.has(entry.pid)) {
					descendants.add(entry.pid);
					changed = true;
				}
			}
		}
		const child = processes.find(
			(entry) =>
				entry.pid !== rootPid &&
				descendants.has(entry.pid) &&
				entry.command.trim() === "pi",
		);
		if (child) return child.pid;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
	}
	throw new Error(`could not find Pi descendant of ${rootPid}`);
}

afterEach(async () => {
	for (const gate of gates)
		if (existsSync(dirname(gate))) writeFileSync(gate, "release\n");
	gates = [];
	if (lab) {
		await destroyRexLab(lab);
		lab = undefined;
	}
});

function publishedResult(
	sessionFile: string,
	file = getSubagentResultFile(sessionFile),
	persistent = false,
) {
	const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
	assert.ok(
		isRecord(raw) &&
			isString(raw.subagentId) &&
			isString(raw.taskId) &&
			isString(raw.generation),
	);
	const result = readSubagentResult(sessionFile, {
		subagentId: raw.subagentId,
		taskId: raw.taskId,
		generation: raw.generation,
		persistent,
	});
	assert.ok(result);
	return result;
}

describe("Rex return contract", () => {
	it(
		"publishes ordinary results matching delivery and falls back to JSONL after removal",
		options,
		async () => {
			lab = await createRexLab();
			await startParentPi(lab);
			await sendParentPrompt(
				lab,
				'Call the subagent tool with these EXACT parameters: name: "ReturnArtifact" agent: "test-echo" task: "Return exactly REX_RETURN_ARTIFACT" Do not do anything else.',
			);
			const delivered = await waitForReport(lab, "ReturnArtifact");
			assert.ok(delivered.childSession);
			const sessionFile = delivered.childSession;
			const result = publishedResult(sessionFile);
			assert.equal(result.finalText, "REX_RETURN_ARTIFACT");
			assert.equal(result.status, "done");
			assert.ok(String(delivered.report.content).includes(result.finalText));
			rmSync(getSubagentResultFile(sessionFile));
			assert.equal(readSubagentResult(sessionFile, result), null);
			assert.equal(
				findLastAssistantSummary(getNewEntries(sessionFile, 0))?.summary,
				result.finalText,
			);
			await waitForFile(
				`${sessionFile}.exitcode`,
				(content) => content.trim() === "0",
			);
			await waitForBlock(
				lab,
				(ids) => ids.length === 1,
				"ordinary child cleanup",
			);
			assert.deepEqual(await childBlocks(lab), []);
		},
	);

	it(
		"keeps native working/done identity and immediately accepts the next persistent inbox",
		options,
		async () => {
			lab = await createRexLab();
			const id = "returncontract";
			const name = `Persistent-${id}`;
			const marker = join(lab.root, "persistent-start");
			const followupGate = join(lab.root, "inspect-first-result");
			gates.push(followupGate);
			await startParentPi(lab);
			await sendParentPrompt(
				lab,
				`INTEGRATION_PERSISTENT_SPECIALIST:${id} PERSISTENT_START_FILE: ${marker} PERSISTENT_FOLLOWUP_GATE: ${followupGate}`,
			);
			await waitForFile(marker, (content) =>
				content.includes(`PERSISTENT_START_${id}`),
			);
			const blocks = await childBlocks(lab);
			assert.equal(blocks.length, 1);
			const blockId = blocks[0]!;
			const working = await waitForProgramStatus(
				lab,
				blockId,
				(record) => record.app === "pi" && record.state === "working",
				"persistent root working",
			);
			assert.equal(working.msg, name);
			const first = await waitForReport(lab, name);
			assert.ok(first.childSession);
			const sessionFile = first.childSession;
			const done = await waitForProgramStatus(
				lab,
				blockId,
				(record) => record.app === "pi" && record.state === "done",
				"persistent root done",
			);
			assert.equal(done.msg, name);
			const firstFiles = readdirSync(dirname(sessionFile)).filter(
				(file) =>
					file.startsWith(`${basename(sessionFile)}.result.`) &&
					file.endsWith(".json"),
			);
			assert.equal(firstFiles.length, 1);
			const firstResult = publishedResult(
				sessionFile,
				join(dirname(sessionFile), firstFiles[0]!),
				true,
			);
			assert.equal(firstResult.finalText, `PERSISTENT_TASK_1_RESULT_${id}`);
			assert.ok(String(first.report.content).includes(firstResult.finalText));
			const pira = await waitForProgramStatus(
				lab,
				blockId,
				(record) => record.id === "pira" && record.state === "done",
				"persistent child metadata",
			);
			assert.equal(
				pira.msg,
				`task=${firstResult.taskId} gen=${firstResult.generation} result=${basename(getSubagentResultFile(sessionFile, firstResult.taskId))}`,
			);
			// Release the observer barrier and let the parent dispatch immediately; no idle grace period.
			writeFileSync(followupGate, "release\n");
			await waitForSessionEntry(
				lab.parentSession,
				(entry) =>
					entry.customType === "subagent_result" &&
					String(entry.content).includes(`PERSISTENT_TASK_2_RESULT_${id}`),
			);
			const files = readdirSync(dirname(sessionFile)).filter(
				(file) =>
					file.startsWith(`${basename(sessionFile)}.result.`) &&
					file.endsWith(".json"),
			);
			assert.equal(files.length, 2);
			const results = files.map((file) =>
				publishedResult(sessionFile, join(dirname(sessionFile), file), true),
			);
			assert.equal(new Set(results.map((result) => result.taskId)).size, 2);
			assert.ok(
				results.some(
					(result) => result.finalText === `PERSISTENT_TASK_2_RESULT_${id}`,
				),
			);
			await waitForSessionEntry(
				lab.parentSession,
				(entry) =>
					entry.message?.role === "assistant" &&
					JSON.stringify(entry.message.content).includes(
						`PERSISTENT_LIFECYCLE_COMPLETE_${id}`,
					),
			);
			await waitForFile(
				`${sessionFile}.exitcode`,
				(content) => content.trim() === "0",
			);
			await waitForBlock(
				lab,
				(ids) => ids.length === 1,
				"persistent child cleanup",
			);
		},
	);

	it(
		"delivers an error after killing the owned child Pi without a completion sidecar",
		options,
		async () => {
			lab = await createRexLab();
			const gate = join(lab.root, "hold-child-provider");
			gates.push(gate);
			await startParentPi(lab);
			await sendParentPrompt(
				lab,
				`INTEGRATION_PLACEMENT:returnkill:reuse GATE:${gate}`,
			);
			const blocks = await waitForBlock(
				lab,
				(ids) => ids.length === 2,
				"kill-test child creation",
			);
			const blockId = blocks.find((id) => id !== lab?.parentBlockId);
			assert.ok(blockId);
			const root = await waitForProgramStatus(
				lab,
				blockId,
				(record) => record.app === "pi" && record.state === "working",
				"owned child Pi working",
			);
			assert.equal(root.msg, "Placement-returnkill-4");
			assert.ok(root.owner?.pid && root.owner.pid !== process.pid);
			const childPid = findPiDescendant(root.owner.pid);
			process.kill(childPid, "SIGKILL");
			const delivered = await waitForSessionEntry(
				lab.parentSession,
				(entry) =>
					entry.customType === "subagent_result" &&
					entry.details?.name === "Placement-returnkill-4" &&
					entry.details.exitCode === 137,
			);
			assert.match(String(delivered.content), /failed/);
			assert.equal(delivered.details?.exitCode, 137);
			assert.ok(delivered.details?.sessionFile);
			assert.equal(existsSync(`${delivered.details!.sessionFile}.exit`), false);
			assert.equal(
				(
					await waitForFile(
						`${delivered.details!.sessionFile}.exitcode`,
						(content) => /^137\s*$/.test(content),
					)
				).trim(),
				"137",
			);
			assert.equal(
				existsSync(getSubagentResultFile(delivered.details!.sessionFile!)),
				false,
			);
			await waitForBlock(
				lab,
				(ids) => ids.length === 1,
				"killed child cleanup",
			);
		},
	);
});
