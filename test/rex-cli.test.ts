import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildRexArgv,
	RexCli,
	type RexProgramStatusRecord,
} from "../maestro/surfaces/rex/rex-cli.ts";
import { RexSurfaceProvider } from "../maestro/surfaces/rex/rex-surface-provider.ts";

function statusProvider(records: RexProgramStatusRecord[]) {
	const cli = new RexCli();
	cli.inspectSession = async () => ({
		revision: 1,
		session_id: "session:test",
		windows: [
			{
				window_id: "window:test",
				layers: [{ blocks: [{ block_id: "block:test" }] }],
			},
		],
	});
	cli.programStatus = async () => ({ records });
	cli.processInfo = async () => {
		throw new Error("Root OSC status must not require process fallback");
	};
	return new RexSurfaceProvider({
		sessionId: "session:test",
		anchorBlockId: "block:test",
		cli,
	});
}

for (const state of ["working", "blocked", "done", "error", "idle"]) {
	it(`maps native root ${state} without allowing pira metadata to shadow it`, async () => {
		const provider = statusProvider([
			{
				id: "pira",
				app: "pira",
				state: "done",
				msg: "child metadata",
				owner: { pid: 9999, name: "child" },
			},
			{
				id: "root",
				app: "pi",
				state,
				msg: "Display name",
				owner: { pid: 1234, name: "pi" },
			},
		]);
		const inspection = await provider.inspectSurface("block:test");
		assert.equal(inspection.kind, "present");
		assert.equal(inspection.agentStatus, state);
		assert.equal(inspection.message, "Display name");
		assert.equal(await provider.getAgentPid("block:test"), 1234);
	});
}

it("accepts an implicit root record but never promotes a child-only record", async () => {
	const child = { id: "pira", app: "pira", state: "done" };
	assert.equal(
		await statusProvider([child]).getProgramStatus("block:test"),
		undefined,
	);
	const root = { app: "pi", state: "working", msg: "Implicit root" };
	assert.equal(
		await statusProvider([child, root]).getProgramStatus("block:test"),
		root,
	);
});

describe("buildRexArgv", () => {
	it("adds the isolated server before user arguments", () => {
		const args = ["session", "inspect", "session:one", "--json"];
		assert.deepEqual(
			buildRexArgv(args, { REX_SERVER: "unix:///tmp/rex-lab/s" }),
			["-S", "unix:///tmp/rex-lab/s", "--autostart=false", ...args],
		);
		assert.deepEqual(args, ["session", "inspect", "session:one", "--json"]);
	});

	it("keeps the default server selection when REX_SERVER is absent", () => {
		const args = ["whoami", "--json"];
		assert.deepEqual(buildRexArgv(args, {}), ["--autostart=false", ...args]);
	});

	it("does not rewrite user supplied values that resemble rex options", () => {
		const args = ["run", "--", "-S", "user-value", "--autostart=false"];
		assert.deepEqual(
			buildRexArgv(args, { REX_SERVER: "unix:///tmp/rex-lab/s" }),
			["-S", "unix:///tmp/rex-lab/s", "--autostart=false", ...args],
		);
	});
});
