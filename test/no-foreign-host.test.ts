/**
 * Guard against foreign-host wording leaking back into the Rex tree.
 *
 * Every TypeScript string literal (including template fragments, with escapes
 * decoded) and every Markdown line under `maestro/`, `pi-extension/` and
 * `skills/` must name Rex, not the host this fork came from. Comments are not
 * model- or user-visible, so the TypeScript AST walk ignores them instead of
 * grepping raw lines.
 *
 * `docs/UPSTREAM.md` and `docs/adr/` are outside the scanned roots and are
 * intentionally not covered. Identifiers and regular-expression literals are
 * also out of scope: the guard covers shipped prose and string payloads.
 */
import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import ts from "typescript";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories whose shipped text must not mention the foreign host. */
const SCAN_ROOTS = ["maestro", "pi-extension", "skills"] as const;

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".md"]);
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

interface ForbiddenPattern {
	readonly label: string;
	readonly pattern: RegExp;
}

/**
 * `herdr` in any casing also covers `HERDR_` and `pi-herdr-*`. `hc ` is the
 * foreign CLI invocation form; it must start a word so ordinary prose such as
 * "searchc " cannot trip it.
 */
const FORBIDDEN: readonly ForbiddenPattern[] = [
	{ label: "herdr", pattern: /herdr/i },
	{ label: "hc ", pattern: /(?<![A-Za-z0-9_])hc[ \t]/ },
];

interface Finding {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly label: string;
	readonly text: string;
	readonly excerpt: string;
}

/** Every string-bearing node we inspect: plain strings and template pieces. */
function literalText(node: ts.Node): string | undefined {
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		return node.text;
	if (
		ts.isTemplateHead(node) ||
		ts.isTemplateMiddle(node) ||
		ts.isTemplateTail(node)
	)
		return node.text;
	return undefined;
}

function excerptAround(text: string, index: number, length: number): string {
	const start = Math.max(0, index - 40);
	const end = Math.min(text.length, index + length + 40);
	const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
	return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`;
}

function matchesFor(
	text: string,
): { label: string; index: number; length: number }[] {
	const hits: { label: string; index: number; length: number }[] = [];
	for (const { label, pattern } of FORBIDDEN) {
		const global = new RegExp(pattern.source, `${pattern.flags}g`);
		for (const match of text.matchAll(global)) {
			hits.push({ label, index: match.index, length: match[0].length });
		}
	}
	return hits.sort(
		(a, b) => a.index - b.index || a.label.localeCompare(b.label),
	);
}

/**
 * Scan one TypeScript source. Matching happens on decoded literal text, so
 * `"he\u0072dr"` and `` `…${x} herdr` `` are caught while `// herdr` and
 * `/* HERDR_ *\/` are not.
 */
function scanTypeScriptSource(source: string, file: string): Finding[] {
	const sourceFile = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
	);
	const findings: Finding[] = [];

	const visit = (node: ts.Node): void => {
		const text = literalText(node);
		if (text !== undefined) {
			const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(
				node.getStart(sourceFile),
			);
			for (const hit of matchesFor(text)) {
				const lineOffset = text.slice(0, hit.index).split("\n").length - 1;
				findings.push({
					file,
					line: startLine + 1 + lineOffset,
					column: 1,
					label: hit.label,
					text: text.slice(hit.index, hit.index + hit.length),
					excerpt: excerptAround(text, hit.index, hit.length),
				});
			}
		}
		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return findings;
}

/**
 * Scan Markdown text. HTML comments are documentation-only, so they are
 * blanked (keeping their newlines) before matching.
 */
function scanMarkdownSource(source: string, file: string): Finding[] {
	const withoutComments = source.replace(/<!--[\s\S]*?-->/g, (comment) =>
		"\n".repeat(comment.split("\n").length - 1),
	);
	const findings: Finding[] = [];
	const lines = withoutComments.split("\n");
	for (const [index, line] of lines.entries()) {
		for (const hit of matchesFor(line)) {
			findings.push({
				file,
				line: index + 1,
				column: hit.index + 1,
				label: hit.label,
				text: line.slice(hit.index, hit.index + hit.length),
				excerpt: excerptAround(line, hit.index, hit.length),
			});
		}
	}
	return findings;
}

function scanFile(source: string, file: string): Finding[] {
	return TYPESCRIPT_EXTENSIONS.has(extensionOf(file))
		? scanTypeScriptSource(source, file)
		: scanMarkdownSource(source, file);
}

function extensionOf(name: string): string {
	return name.slice(name.lastIndexOf("."));
}

function isScannedFile(name: string): boolean {
	return SCANNED_EXTENSIONS.has(extensionOf(name));
}

function collectFiles(root: string, files: string[] = []): string[] {
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const full = join(root, entry.name);
		if (entry.isDirectory()) collectFiles(full, files);
		else if (entry.isFile() && isScannedFile(entry.name)) files.push(full);
	}
	return files;
}

/** Scan the given roots below `baseDir`; paths in findings are repo-relative. */
function scanTree(baseDir: string, roots: readonly string[]): Finding[] {
	const findings: Finding[] = [];
	for (const root of roots) {
		for (const file of collectFiles(join(baseDir, root))) {
			const display = relative(baseDir, file).split(sep).join("/");
			findings.push(...scanFile(readFileSync(file, "utf8"), display));
		}
	}
	return findings;
}

function formatFinding(finding: Finding): string {
	return `${finding.file}:${finding.line}:${finding.column} [${finding.label}] "${finding.excerpt}"`;
}

function formatFindings(findings: readonly Finding[]): string {
	return [
		`${findings.length} foreign-host mention(s) in model- or user-visible text:`,
		...findings.map((finding) => `  ${formatFinding(finding)}`),
	].join("\n");
}

/**
 * A miniature tree that proves the guard has teeth: plain strings, template
 * fragments and Markdown are caught, comments are ignored.
 */
function buildFixtureTree(): string {
	const root = mkdtempSync(join(tmpdir(), "no-foreign-host-"));
	mkdirSync(join(root, "maestro", "nested"), { recursive: true });
	mkdirSync(join(root, "skills", "pack"), { recursive: true });
	writeFileSync(
		join(root, "maestro", "nested", "strings.ts"),
		[
			'export const plain = "unused";',
			'export const pane = "Herdr pane";',
			"export const templated = `launch via hc split ${pane}`;",
			'export const escaped = "he\\u0072dr";',
			"// herdr in a line comment is fine",
			"/* HERDR_ and hc in a block comment are fine */",
			'export const clean = "rex block";',
			"",
		].join("\n"),
	);
	writeFileSync(
		join(root, "skills", "pack", "guide.md"),
		[
			"# Guide",
			"",
			"Use hc tab and HERDR_SESSION here.",
			"",
			"<!-- herdr inside an HTML comment is fine -->",
			"",
		].join("\n"),
	);
	return root;
}

describe("foreign-host wording fixture", () => {
	it("catches plain strings, template fragments, escapes and Markdown, and ignores comments", () => {
		const root = buildFixtureTree();
		try {
			const findings = scanTree(root, ["maestro", "skills"]);
			const signature = findings.map(
				(finding) => `${finding.file}:${finding.line}:${finding.label}`,
			);
			assert.deepEqual(
				signature,
				[
					"maestro/nested/strings.ts:2:herdr",
					"maestro/nested/strings.ts:3:hc ",
					"maestro/nested/strings.ts:4:herdr",
					"skills/pack/guide.md:3:hc ",
					"skills/pack/guide.md:3:herdr",
				],
				formatFindings(findings),
			);
			for (const finding of findings)
				assert.match(finding.excerpt, /herdr|hc /i);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("reports nothing for a clean fixture tree", () => {
		const root = mkdtempSync(join(tmpdir(), "no-foreign-host-"));
		try {
			mkdirSync(join(root, "maestro"));
			writeFileSync(
				join(root, "maestro", "clean.ts"),
				'export const text = "rex block beside you";\n// herdr comment\nexport const other = `rex tab ${text}`;\n',
			);
			mkdirSync(join(root, "pi-extension"));
			writeFileSync(
				join(root, "pi-extension", "clean.ts"),
				'export const partial = "searchc value";\n',
			);
			writeFileSync(
				join(root, "maestro", "clean.md"),
				"# Rex\n\nNo foreign names.\n",
			);
			assert.deepEqual(scanTree(root, ["maestro", "pi-extension"]), []);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("no foreign-host wording", () => {
	it("scans shipped TypeScript strings and Markdown under the Rex roots", () => {
		const scanned: string[] = [];
		for (const root of SCAN_ROOTS) {
			const files = collectFiles(join(REPO_ROOT, root));
			assert.ok(files.length > 0, `no scannable files under ${root}`);
			scanned.push(...files);
		}
		assert.ok(
			scanned.length > 40,
			`only ${scanned.length} files scanned; the guard would be too weak`,
		);

		const findings = scanTree(REPO_ROOT, SCAN_ROOTS);
		assert.equal(findings.length, 0, formatFindings(findings));
	});
});
