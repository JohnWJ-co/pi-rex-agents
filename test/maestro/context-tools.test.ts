import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveContextTools } from "../../maestro/adapters/pi/context-tools.ts";
import { buildSubagentToolAllowlist } from "../../maestro/adapters/pi/launch-command.ts";

const compressionTools = [
	"compress",
	"decompress",
	"search_context",
	"acp_status",
];

describe("context-compression provider registry", () => {
	it("resolves billion-context tools in stable order, without duplicates", () => {
		assert.deepEqual(
			resolveContextTools([
				"acp_cache",
				...[...compressionTools].reverse(),
				"compress",
			]),
			compressionTools,
		);
	});

	it("includes the optional registered acp_rule", () => {
		assert.deepEqual(resolveContextTools([...compressionTools, "acp_rule"]), [
			...compressionTools,
			"acp_rule",
		]);
	});

	it("leaves native auto-compaction alone when no provider is installed", () => {
		assert.deepEqual(resolveContextTools(["read", "bash"]), []);
	});

	it("requires the marker even when other provider tools are registered", () => {
		assert.deepEqual(resolveContextTools(["decompress", "acp_rule"]), []);
	});

	it("does not invent missing tools from a partially installed provider", () => {
		assert.deepEqual(resolveContextTools(["compress", "acp_status"]), [
			"compress",
			"acp_status",
		]);
	});
});

describe("context tools in the launch allowlist", () => {
	it("deduplicates extra tools while retaining the child control tools", () => {
		assert.equal(
			buildSubagentToolAllowlist("read,bash,compress", true, [
				...compressionTools,
				"compress",
			]),
			"read,bash,compress,decompress,search_context,acp_status,caller_ping",
		);
		assert.equal(
			buildSubagentToolAllowlist("read,bash", false, compressionTools),
			"read,bash,compress,decompress,search_context,acp_status,caller_ping,subagent_done",
		);
	});

	it("keeps unrestricted launches unrestricted, including an empty tools list", () => {
		assert.equal(
			buildSubagentToolAllowlist(undefined, true, compressionTools),
			null,
		);
		assert.equal(
			buildSubagentToolAllowlist(" , ", false, compressionTools),
			null,
		);
	});
});
