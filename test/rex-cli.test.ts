import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRexArgv } from "../maestro/surfaces/rex/rex-cli.ts";

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
