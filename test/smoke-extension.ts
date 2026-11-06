/** Load-level smoke for the public kernel entry; no subagent or Rex CLI calls. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockExtensionApi } from "./helpers/mock-extension-api.ts";

const keys = [
	"PI_CODING_AGENT_DIR",
	"REX_SESSION",
	"REX_BLOCK",
	"PI_SUBAGENT_ID",
	"PI_SUBAGENT_DEPTH",
	"PI_DENY_TOOLS",
] as const;
const saved = new Map(keys.map((key) => [key, process.env[key]]));
const agentDir = mkdtempSync(join(tmpdir(), "pira-smoke-agent-"));
const expectedTools = [
	"subagent",
	"subagent_cancel",
	"subagent_interrupt",
	"subagent_resume",
	"subagent_send",
	"subagent_stop",
	"subagents_list",
	"subagents_write_task_models",
	"worktree_list",
	"worktree_remove",
];

try {
	for (const key of keys) delete process.env[key];
	process.env.PI_CODING_AGENT_DIR = agentDir;
	const { default: extension } = await import(
		"../pi-extension/subagents/index.ts"
	);

	for (const missing of ["both", "REX_SESSION", "REX_BLOCK"]) {
		process.env.REX_SESSION = "session:smoke";
		process.env.REX_BLOCK = "block:smoke";
		if (missing !== "REX_BLOCK") delete process.env.REX_SESSION;
		if (missing !== "REX_SESSION") delete process.env.REX_BLOCK;
		const mock = createMockExtensionApi();
		extension(mock.api);
		assert.deepEqual(mock.registeredTools, [], missing);
		assert.deepEqual(mock.registeredCommands, [], missing);
	}

	process.env.REX_SESSION = "session:smoke";
	process.env.REX_BLOCK = "block:smoke";
	for (const scope of ["parent", "child"]) {
		if (scope === "child") {
			process.env.PI_SUBAGENT_ID = "smoke-child";
			process.env.PI_SUBAGENT_DEPTH = "1";
		}
		const mock = createMockExtensionApi();
		const { default: scopedExtension } = await import(
			`../pi-extension/subagents/index.ts?smoke-${scope}`
		);
		scopedExtension(mock.api);
		try {
			const names = mock.registeredTools.map((tool) => tool.name);
			const parentOnly = [
				"worktree_list",
				"worktree_remove",
				"subagents_write_task_models",
			];
			assert.deepEqual(
				[...names].sort(),
				expectedTools
					.filter((name) => scope === "parent" || !parentOnly.includes(name))
					.sort(),
			);
			const event = { systemPromptOptions: { appendSystemPrompt: "existing" } };
			for (let i = 0; i < 2; i++)
				for (const handler of mock.eventHandlers.get("before_agent_start") ??
					[])
					await handler(event, {});
			const prompt = event.systemPromptOptions.appendSystemPrompt;
			assert.ok(prompt.startsWith("existing"));
			assert.equal(prompt.match(/\[Rex (host|child)\]/g)?.length, 1);
			assert.doesNotMatch(prompt, /herdr/i);
			if (scope === "child") assert.match(prompt, /You are a leaf/);
			console.log(JSON.stringify({ scope, tools: names, notice: prompt }));
		} finally {
			for (const handler of mock.eventHandlers.get("session_shutdown") ?? [])
				await handler({ reason: "quit" }, { ui: { setWidget() {} } });
		}
	}
	console.log("Rex kernel entry smoke OK");
} finally {
	for (const [key, value] of saved)
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	rmSync(agentDir, { recursive: true, force: true });
}
