import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { isPlainObject, isString } from "./type-guards.ts";

export type PaneMode = "split" | "tab";
export type PaneDirection = "right" | "down";

export interface PaneConfig {
	mode: PaneMode;
	direction: PaneDirection;
	maxPerTab: number;
}

type PaneCreator = (name: string, cwd?: string) => string;
type SplitPaneCreator = (
	name: string,
	direction: PaneDirection,
	cwd?: string,
) => string;

function invalidPaneConfig(source: string, message: string): never {
	throw new Error(`Invalid subagent pane config in ${source}: ${message}`);
}

export function parsePaneConfig(
	rawConfig: any,
	source = "config.json",
): PaneConfig {
	if (!isPlainObject(rawConfig)) {
		invalidPaneConfig(source, "root must be an object");
	}
	if (!Object.hasOwn(rawConfig, "panes")) {
		return { mode: "split", direction: "right", maxPerTab: 2 };
	}
	if (!isPlainObject(rawConfig.panes)) {
		invalidPaneConfig(source, "panes must be an object");
	}

	const unsupportedKeys = Object.keys(rawConfig.panes).filter(
		(key) => key !== "mode" && key !== "direction" && key !== "maxPerTab",
	);
	if (unsupportedKeys.length > 0) {
		invalidPaneConfig(
			source,
			`panes has unsupported key(s): ${unsupportedKeys.join(", ")}`,
		);
	}

	let mode: PaneMode = "split";
	if (Object.hasOwn(rawConfig.panes, "mode")) {
		if (
			!isString(rawConfig.panes.mode) ||
			(rawConfig.panes.mode !== "split" && rawConfig.panes.mode !== "tab")
		) {
			invalidPaneConfig(source, 'panes.mode must be "split" or "tab"');
		}
		mode = rawConfig.panes.mode;
	}

	let direction: PaneDirection = "right";
	if (Object.hasOwn(rawConfig.panes, "direction")) {
		if (
			!isString(rawConfig.panes.direction) ||
			(rawConfig.panes.direction !== "right" &&
				rawConfig.panes.direction !== "down")
		) {
			invalidPaneConfig(source, 'panes.direction must be "right" or "down"');
		}
		direction = rawConfig.panes.direction;
	}

	const maxPerTab = Object.hasOwn(rawConfig.panes, "maxPerTab")
		? rawConfig.panes.maxPerTab
		: 2;
	if (!Number.isSafeInteger(maxPerTab) || maxPerTab < 1 || maxPerTab > 10) {
		invalidPaneConfig(
			source,
			"panes.maxPerTab must be an integer between 1 and 10",
		);
	}
	return { mode, direction, maxPerTab };
}

interface PaneConfigSource {
	sourcePath: string;
	rawConfig: string;
}

function readPaneConfigFile(
	configPath: string,
	examplePath: string,
): PaneConfigSource {
	try {
		return {
			sourcePath: configPath,
			rawConfig: readFileSync(configPath, "utf8"),
		};
	} catch (error) {
		// SAFETY: readFileSync only throws Node fs errors here, which carry code.
		const errno = error as NodeJS.ErrnoException;
		if (errno.code !== "ENOENT") throw error;
	}

	try {
		return {
			sourcePath: examplePath,
			rawConfig: readFileSync(examplePath, "utf8"),
		};
	} catch (error) {
		// SAFETY: see the preceding readFileSync error handling.
		const errno = error as NodeJS.ErrnoException;
		if (errno.code === "ENOENT") {
			throw new Error(
				`Missing subagent pane config. Expected ${configPath} or ${examplePath}.`,
			);
		}
		throw error;
	}
}

export function loadPaneConfig(
	configDir: string,
	examplePath: string,
): PaneConfig {
	const configPath = join(configDir, "config.json");
	const { sourcePath, rawConfig } = readPaneConfigFile(configPath, examplePath);
	let parsed;
	try {
		parsed = JSON.parse(rawConfig);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON in subagent config ${sourcePath}: ${detail}`);
	}
	return parsePaneConfig(parsed, sourcePath);
}

export function createSubagentPaneFactory(
	config: PaneConfig,
	createTab: PaneCreator,
	createSplit: SplitPaneCreator,
): PaneCreator {
	return config.mode === "split"
		? (name, cwd) => createSplit(name, config.direction, cwd)
		: createTab;
}

export interface PaneConfigPatch {
	mode?: PaneMode;
	maxPerTab?: number;
}

/**
 * Atomically merge `patch` into the durable `panes` object, preserving every
 * other top-level setting. A missing config is seeded from the packaged
 * example so unrelated defaults are not silently dropped.
 */
export function writePaneConfig(
	configPath: string,
	examplePath: string,
	patch: PaneConfigPatch,
): PaneConfig {
	let source: string;
	let sourcePath = configPath;
	try {
		source = readFileSync(configPath, "utf8");
	} catch (error) {
		// SAFETY: readFileSync only throws Node fs errors here, which carry code.
		const errno = error as NodeJS.ErrnoException;
		if (errno.code !== "ENOENT") throw error;
		source = readFileSync(examplePath, "utf8");
		sourcePath = examplePath;
	}

	let parsed: any;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		throw new Error(
			`Invalid JSON in subagent config ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!isPlainObject(parsed))
		throw new Error(
			`Invalid JSON in subagent config ${sourcePath}: root must be an object`,
		);

	const panes = isPlainObject(parsed.panes) ? { ...parsed.panes } : {};
	if (patch.mode !== undefined) panes.mode = patch.mode;
	if (patch.maxPerTab !== undefined) panes.maxPerTab = patch.maxPerTab;
	const next = { ...parsed, panes };
	const validated = parsePaneConfig(next, configPath);
	const output = JSON.stringify(next, null, 2) + "\n";

	mkdirSync(dirname(configPath), { recursive: true });
	const temporary = join(
		dirname(configPath),
		`.${Date.now()}-${process.pid}-${randomUUID()}-config.tmp`,
	);
	let published = false;
	try {
		writeFileSync(temporary, output, { flag: "wx" });
		renameSync(temporary, configPath);
		published = true;
	} finally {
		if (!published) rmSync(temporary, { force: true });
	}
	return validated;
}
