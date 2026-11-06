import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const packed = JSON.parse(
	execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
		cwd: root,
		encoding: "utf8",
	}),
)[0];
const packageFiles = new Set(packed.files.map(({ path }) => path));

const reviewClauses = [
	"Cross-family independent review requires a reviewer from a different model family than the author.",
	"For ordinary review, prefer a different authenticated model family.",
	"When no other authenticated model family is available, ordinary review may use a same-family reviewer in a fresh standalone session.",
	"Disclose that this review is context-isolated, not cross-family independent.",
	"Cross-family verification must not use this fallback.",
];

describe("Rex package contract", () => {
	it("declares the Rex package identity and consistent install metadata", () => {
		assert.equal(manifest.name, "pi-rex-agents");
		assert.equal(manifest.version, "0.4.0");
		assert.equal(manifest.private, true);
		assert.equal(manifest.license, "MIT");
		assert.equal(lock.name, manifest.name);
		assert.equal(lock.version, manifest.version);
		assert.equal(lock.packages[""].name, manifest.name);
		assert.equal(lock.packages[""].version, manifest.version);
		assert.equal(manifest.dependencies["pi-herdr-agents"], undefined);
		assert.deepEqual(manifest.pi.extensions, [
			"./pi-extension/subagents/index.ts",
		]);
		assert.deepEqual(manifest.pi.skills, ["./skills/pi-rex-agents"]);
	});

	it("ships only Rex runtime, license, configuration and the operating skill", () => {
		for (const path of [
			"package.json",
			"README.md",
			"LICENSE",
			"config.json.example",
			"skills/pi-rex-agents/SKILL.md",
			"pi-extension/subagents/index.ts",
			"maestro/runtime/pi-run-session.ts",
			"maestro/adapters/pi/child/subagent-done.ts",
			"maestro/surfaces/rex/rex-cli.ts",
		]) {
			assert.ok(packageFiles.has(path), `missing package file: ${path}`);
		}
		const rootFiles = new Set([
			"package.json",
			"README.md",
			"LICENSE",
			"config.json.example",
			"skills/pi-rex-agents/SKILL.md",
		]);
		for (const path of packageFiles) {
			assert.ok(
				rootFiles.has(path) ||
					/^(?:pi-extension\/subagents|maestro\/(?:core|runtime|adapters\/pi|surfaces\/rex))\/.+\.ts$/.test(
						path,
					),
				`unexpected package file: ${path}`,
			);
		}
		assert.equal(read("LICENSE"), read("LICENSE-pi-herdr-agents"));
		assert.match(
			read("skills/pi-rex-agents/SKILL.md"),
			/^---\nname: pi-rex-agents\ndescription: .+\n---/,
		);
	});

	it("derives archive identity from package.json without an upstream publish workflow", () => {
		assert.equal(packed.name, manifest.name);
		assert.equal(packed.version, manifest.version);
		assert.equal(packed.filename, `${manifest.name}-${manifest.version}.tgz`);
		assert.equal(
			existsSync(join(root, ".github/workflows/release.yml")),
			false,
		);
		assert.equal(manifest.scripts.publish, undefined);
	});

	it("defines independent and ordinary review separately in README, guides, and CONTEXT", () => {
		for (const path of [
			"README.md",
			"docs/configuration.md",
			"docs/roles.md",
			"CONTEXT.md",
		]) {
			const normalized = read(path).replace(/\s+/g, " ").trim();
			for (const clause of reviewClauses) {
				assert.ok(
					normalized.includes(clause),
					`${path} must include: ${clause}`,
				);
			}
		}
	});

	it("lists every top-level test file in the npm test script", () => {
		const script = manifest.scripts.test.split(/\s+/);
		const unlisted = readdirSync(join(root, "test"))
			.filter((name) => /\.test\.(ts|js)$/.test(name))
			.filter((name) => !script.includes(`test/${name}`));
		assert.deepEqual(unlisted, [], "add to the npm test script");
	});
});
