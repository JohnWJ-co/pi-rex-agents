import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	childBlocks,
	createRexLab,
	destroyRexLab,
	rexAvailable,
	sendParentPrompt,
	startParentPi,
	waitForBlock,
	waitForReport,
	waitForSessionEntry,
	type RexLab,
} from "./rex-harness.ts";

const availability = rexAvailable();
const testOptions = availability.ok
	? {}
	: { skip: `Rex smoke skipped: ${availability.reason}` };
let lab: RexLab | undefined;

afterEach(async () => {
	if (lab) {
		await destroyRexLab(lab);
		lab = undefined;
	}
});

describe("Rex smoke", () => {
	it(
		"delivers a real subagent report and cleans the child block",
		testOptions,
		async () => {
			assert.ok(availability.ok, availability.ok ? "" : availability.reason);
			lab = await createRexLab();
			await startParentPi(lab);
			const before = await childBlocks(lab);
			await sendParentPrompt(
				lab,
				'Call the subagent tool with these EXACT parameters: name: "RexSmoke" agent: "test-echo" task: "Return exactly REX_SMOKE_CHILD" Do not do anything else. After you receive the subagent result, say REX_SMOKE_PARENT_CONTINUED.',
			);
			await waitForBlock(
				lab,
				(ids) => ids.some((id) => !before.includes(id)),
				"child block creation",
			);
			const delivered = await waitForReport(lab, "RexSmoke");
			assert.match(
				String(delivered.report.content),
				/<subagent_report from="RexSmoke"/,
			);
			assert.ok(delivered.childSession && delivered.childSession.length > 0);
			const continued = await waitForSessionEntry(
				lab.parentSession,
				(entry) =>
					entry.type === "message" &&
					entry.message?.role === "assistant" &&
					JSON.stringify(entry.message.content).includes(
						"REX_SMOKE_PARENT_CONTINUED",
					),
			);
			assert.equal(continued.message?.role, "assistant");
			await waitForBlock(
				lab,
				(ids) => ids.every((id) => id === lab?.parentBlockId),
				"child block cleanup",
			);
			assert.deepEqual(await childBlocks(lab), []);
		},
	);
});
