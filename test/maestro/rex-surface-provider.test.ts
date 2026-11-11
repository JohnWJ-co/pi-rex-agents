import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RexCli } from "../../maestro/surfaces/rex/rex-cli.ts";
import { RexSurfaceProvider } from "../../maestro/surfaces/rex/rex-surface-provider.ts";

async function fakeRex(): Promise<{
	dir: string;
	log: string;
	binary: string;
	dispose(): Promise<void>;
}> {
	const dir = await mkdtemp(join(tmpdir(), "rex-provider-test-"));
	const log = join(dir, "argv.log");
	const binary = join(dir, "rex");
	await writeFile(
		binary,
		`#!/bin/sh
printf '%s\\n' "$@" >> "$REX_TEST_ARGV_LOG"
command=""
for arg in "$@"; do
  case "$arg" in
    new|split|send|send-key|capture|block|session|window) command="$arg"; break ;;
  esac
done
case "$*" in
  *"session inspect"*) printf '%s\\n' '{"session_id":"session-1","revision":1,"active_window_id":"window-1","windows":[{"window_id":"window-1","focused_block_id":"parent","layers":[{"blocks":[{"block_id":"parent","label":"parent"},{"block_id":"child","label":"child"}]}]}]}' ;;
  *"split"*) printf '%s\\n' '{"anchor_id":"parent","block_ids":["child"],"revision":2}' ;;
  *"session.new_layer"*) printf '%s\\n' '{"layer_id":"layer-1","block_ids":["child"],"revision":3}' ;;
  *"session.set_layer_state"*) printf '%s\\n' '{"revision":4}' ;;
  *"session.close_layer"*) printf '%s\\n' '{"revision":5}' ;;
  *"program_status"*) printf '%s\\n' '{"records":[{"state":"working","app":"pi","msg":"running"}]}' ;;
  *"process"*) printf '%s\\n' '{"foreground":{"pid":42,"name":"zsh"},"child":null,"ancestors":[]}' ;;
  *"capture"*) printf '%s\\n' '$ echo rex-test-marker' ;;
  *) : ;;
esac
`,
		"utf8",
	);
	await chmod(binary, 0o755);
	return {
		dir,
		log,
		binary,
		async dispose() {
			await rm(dir, { recursive: true, force: true });
		},
	};
}

async function loggedArgs(log: string): Promise<string[]> {
	return (await readFile(log, "utf8")).trim().split("\n");
}

describe("RexSurfaceProvider", () => {
	it("uses explicit Rex argv and maps fixed CLI JSON to surface operations", async () => {
		const fixture = await fakeRex();
		try {
			const env = {
				...process.env,
				REX_SERVER: "unix:///tmp/rex-test.sock",
				REX_TEST_ARGV_LOG: fixture.log,
			};
			const provider = new RexSurfaceProvider({
				sessionId: "session-1",
				anchorBlockId: "parent",
				cli: new RexCli({ binary: fixture.binary, env }),
			});

			const child = await provider.createSurface({
				name: "child",
				cwd: "/repo",
			});
			assert.equal(child, "child");
			const inspection = await provider.inspectSurface(child);
			assert.equal(inspection.kind, "present");
			assert.equal(inspection.present, "present");
			assert.equal(inspection.agentStatus, "working");
			assert.equal(inspection.agent, "pi");
			assert.equal(Number.isFinite(inspection.observedAt), true);
			assert.equal(inspection.state, "working");
			assert.equal(inspection.message, "running");
			assert.deepEqual(inspection.raw, {
				state: "working",
				app: "pi",
				msg: "running",
			});
			await provider.runCommand(child, "echo hello");
			assert.equal(
				await provider.readScreen(child),
				"$ echo rex-test-marker\n",
			);

			const args = await loggedArgs(fixture.log);
			assert.equal(args[0], "-S");
			assert.equal(args[1], "unix:///tmp/rex-test.sock");
			assert.equal(args[2], "--autostart=false");
			assert.ok(args.includes("split"));
			assert.ok(args.includes("send"));
			assert.ok(args.includes("send-key"));
		} finally {
			await fixture.dispose();
		}
	});

	it("creates a minimized floating surface through the documented layer API", async () => {
		const fixture = await fakeRex();
		try {
			const env = { ...process.env, REX_TEST_ARGV_LOG: fixture.log };
			const provider = new RexSurfaceProvider({
				sessionId: "session-1",
				anchorBlockId: "parent",
				cli: new RexCli({ binary: fixture.binary, env }),
			});
			const child = await provider.createSurface({
				name: "Minimized",
				cwd: "/repo",
				placement: {
					kind: "minimized",
					bounds: [0.2, 0.2, 0.5, 0.5],
				},
			});
			assert.equal(child, "child");
			const args = await loggedArgs(fixture.log);
			assert.ok(args.includes("api"));
			assert.ok(args.includes("session.new_layer"));
			assert.ok(args.includes("session.set_layer_state"));
			assert.ok(args.some((arg) => arg.includes('"window_id":"window-1"')));
			assert.ok(args.some((arg) => arg.includes('"bounds":[0.2,0.2,0.5,0.5]')));
		} finally {
			await fixture.dispose();
		}
	});

	it("writes a launch script through Rex and preserves its script preamble", async () => {
		const fixture = await fakeRex();
		try {
			const env = { ...process.env, REX_TEST_ARGV_LOG: fixture.log };
			const provider = new RexSurfaceProvider({
				sessionId: "session-1",
				cli: new RexCli({ binary: fixture.binary, env }),
			});
			const scriptPath = join(fixture.dir, "launch.sh");
			assert.equal(
				await provider.runScript("child", "echo launched", {
					scriptPath,
					scriptPreamble: "set -eu",
				}),
				scriptPath,
			);
			assert.equal(
				await readFile(scriptPath, "utf8"),
				"#!/bin/bash\nset -eu\necho launched\n",
			);
		} finally {
			await fixture.dispose();
		}
	});
});
