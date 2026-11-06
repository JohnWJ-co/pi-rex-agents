import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RexSurfaceProvider } from "../../maestro/surfaces/rex/rex-surface-provider.ts";
import { RexCli } from "../../maestro/surfaces/rex/rex-cli.ts";
import { registerSurfaceProviderConformance } from "../maestro/surface-provider.conformance.ts";
import {
	createRexLab,
	destroyRexLab,
	rexAvailable,
	type RexLab,
} from "./rex-harness.ts";

const availability = rexAvailable();
const testOptions = availability.ok
	? {}
	: { skip: `Rex surface conformance skipped: ${availability.reason}` };

if (availability.ok) {
	registerSurfaceProviderConformance(
		{ describe, it },
		"RexSurfaceProvider",
		async () => {
			const lab: RexLab = await createRexLab();
			const provider = new RexSurfaceProvider({
				sessionId: lab.sessionId,
				cli: new RexCli({
					env: { ...process.env, REX_SERVER: lab.endpoint },
				}),
				anchorBlockId: lab.parentBlockId,
				worktreeRoot: `${lab.root}/worktrees`,
			});
			return {
				provider,
				cwd: lab.project,
				async dispose() {
					await destroyRexLab(lab);
				},
			};
		},
	);
} else {
	describe("RexSurfaceProvider availability", () => {
		it("requires the Rex environment", testOptions, () => {
			assert.fail(availability.reason);
		});
	});
}
