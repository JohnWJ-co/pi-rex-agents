import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { RexCli } from "../../maestro/surfaces/rex/rex-cli.ts";
import { RexSurfaceProvider } from "../../maestro/surfaces/rex/rex-surface-provider.ts";
import {
	createRexLab,
	destroyRexLab,
	rexAvailable,
	type RexLab,
} from "./rex-harness.ts";

const availability = rexAvailable();
const options = availability.ok
	? {}
	: { skip: `Rex placement skipped: ${availability.reason}` };
let labs: RexLab[] = [];

afterEach(async () => {
	for (const lab of labs.splice(0)) await destroyRexLab(lab);
});

async function makeProvider(): Promise<{
	lab: RexLab;
	provider: RexSurfaceProvider;
}> {
	const lab = await createRexLab();
	labs.push(lab);
	return {
		lab,
		provider: new RexSurfaceProvider({
			sessionId: lab.sessionId,
			cli: new RexCli({ env: lab.env }),
			anchorBlockId: lab.parentBlockId,
			worktreeRoot: `${lab.root}/worktrees`,
		}),
	};
}

describe("Rex placement", () => {
	it(
		"creates a split beside the parent and preserves cwd in surface inventory",
		options,
		async () => {
			const { lab, provider: surfaceProvider } = await makeProvider();
			const surface = await surfaceProvider.createSurface({
				name: "placement-split",
				cwd: lab.project,
				placement: { kind: "split", direction: "right" },
			});
			const listed = (await surfaceProvider.listSurfaces()).find(
				(entry) => entry.id === surface,
			);
			assert.ok(listed);
			assert.equal(listed.cwd, lab.project);
			assert.equal(
				listed.workspaceId,
				lab.sessionId ? listed.workspaceId : undefined,
			);
			await surfaceProvider.closeSurface(surface);
		},
	);

	it("creates a tab placement in a distinct Rex window", options, async () => {
		const { lab, provider: surfaceProvider } = await makeProvider();
		const surface = await surfaceProvider.createSurface({
			name: "placement-tab",
			cwd: lab.project,
			placement: { kind: "tab" },
		});
		const session = await surfaceProvider.cli.inspectSession(lab.sessionId);
		const listed = (await surfaceProvider.listSurfaces()).find(
			(entry) => entry.id === surface,
		);
		assert.ok(listed);
		assert.ok(
			session.windows.some((window) => window.window_id === listed.windowId),
		);
		await surfaceProvider.closeSurface(surface);
	});

	it(
		"creates, inventories, and removes a managed worktree surface",
		options,
		async () => {
			const { lab, provider: surfaceProvider } = await makeProvider();
			const worktree = await surfaceProvider.createWorktreeSurface({
				name: "placement-worktree",
				cwd: lab.project,
				branch: "conformance-placement",
				base: "HEAD",
			});
			const listed = (
				await surfaceProvider.listWorktreeSurfaces({ cwd: lab.project })
			).find((entry) => entry.workspaceId === worktree.workspaceId);
			assert.ok(listed);
			assert.equal(listed.path, worktree.path);
			assert.equal(listed.branch, worktree.branch);
			assert.equal(listed.isLinkedWorktree, true);
			assert.equal(Object.hasOwn(listed, "surfaceId"), false);
			await surfaceProvider.removeWorktreeSurface(worktree.workspaceId);
			assert.equal(
				(await surfaceProvider.listWorktreeSurfaces({ cwd: lab.project })).some(
					(entry) => entry.workspaceId === worktree.workspaceId,
				),
				false,
			);
		},
	);
});
