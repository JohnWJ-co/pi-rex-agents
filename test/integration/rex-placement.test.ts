import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
	childBlocks,
	createRexLab,
	destroyRexLab,
	flattenBlocks,
	readSession,
	rexAvailable,
	sendParentPrompt,
	startParentPi,
	waitForBlock,
	waitForPiTurnSettled,
	waitForReport,
	waitForSessionEntry,
	type RexLab,
} from "./rex-harness.ts";

const availability = rexAvailable();
const options = availability.ok
	? {}
	: { skip: `Rex placement skipped: ${availability.reason}` };
let lab: RexLab | undefined;
let gate: string | undefined;

afterEach(async () => {
	// Release provider requests even when a topology assertion fails.
	if (gate) writeFileSync(gate, "release\n");
	if (lab) await destroyRexLab(lab);
	gate = undefined;
	lab = undefined;
});

describe("Rex kernel placement", () => {
	it(
		"places split, split, tab and reuses a closed child slot through real parent tools",
		options,
		async (t) => {
			const current = await createRexLab();
			lab = current;
			gate = join(current.root, "placement.release");
			const id = Date.now().toString(36);
			const childName = (number: number) => `Placement-${id}-${number}`;
			const child = async (number: number) => {
				const blocks = flattenBlocks(
					await current.cli.inspectSession(current.sessionId),
				);
				const found = blocks.find(
					({ block }) => block.label === childName(number),
				);
				assert.ok(found, `child ${number} is a real Rex block`);
				return { block: found.block.block_id, window: found.window.window_id };
			};
			const launchStage = async (stage: "start" | "reuse" | "tab") => {
				await sendParentPrompt(
					current,
					`INTEGRATION_PLACEMENT:${id}:${stage} GATE:${gate}`,
				);
				await waitForSessionEntry(
					current.parentSession,
					(entry) =>
						entry.type === "message" &&
						entry.message?.role === "assistant" &&
						JSON.stringify(entry.message.content).includes(
							`PLACEMENT_READY_${id}_${stage}`,
						),
				);
				await waitForPiTurnSettled(current);
			};

			// startParentPi passes -e EXTENSION_SOURCE: this process loads the current
			// checkout, regardless of the coordinating session's last /reload.
			await startParentPi(current);
			const parent = flattenBlocks(
				await current.cli.inspectSession(current.sessionId),
			).find(({ block }) => block.block_id === current.parentBlockId);
			assert.ok(parent);
			await launchStage("start");
			const [first, second, third] = await Promise.all([
				child(1),
				child(2),
				child(3),
			]);
			assert.equal(first.window, parent.window.window_id);
			assert.equal(second.window, parent.window.window_id);
			assert.notEqual(third.window, parent.window.window_id);

			await current.cli.closeBlock(current.sessionId, first.block);
			await waitForBlock(
				current,
				(ids) => !ids.includes(first.block),
				"first child closed",
			);
			await launchStage("reuse");
			const fourth = await child(4);
			assert.equal(fourth.window, parent.window.window_id);

			// Leave a free split slot, then prove explicit tab still opens a window.
			await current.cli.closeBlock(current.sessionId, second.block);
			await waitForBlock(
				current,
				(ids) => !ids.includes(second.block),
				"second child closed",
			);
			await launchStage("tab");
			const fifth = await child(5);
			assert.notEqual(fifth.window, parent.window.window_id);

			t.diagnostic(
				JSON.stringify({
					parentWindow: parent.window.window_id,
					first,
					second,
					third,
					fourth,
					fifth,
				}),
			);
			writeFileSync(gate, "release\n");
			for (const number of [3, 4, 5]) {
				const delivered = await waitForReport(current, childName(number));
				assert.ok(
					delivered.childSession,
					"report supplies child session evidence",
				);
				assert.ok(
					readSession(delivered.childSession).some(
						(entry) =>
							entry.message?.role === "assistant" &&
							JSON.stringify(entry.message.content).includes(
								`PLACEMENT_CHILD_${id}_${number}`,
							),
					),
				);
			}
			await waitForBlock(
				current,
				(ids) => ids.every((block) => block === current.parentBlockId),
				"placement children cleaned",
			);
			assert.deepEqual(await childBlocks(current), []);
		},
	);
});
