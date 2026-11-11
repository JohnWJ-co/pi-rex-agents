import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { isFiniteNumber, isPlainObject, isString } from "./type-guards.ts";

export type PaneMode = "split" | "tab" | "minimized";
export type PaneDirection = "right" | "down";
export type PaneBounds = [number, number, number, number];

export interface PaneConfig {
	mode: PaneMode;
	direction: PaneDirection;
	maxPerTab: number;
	/** Restore bounds for minimized children: [x, y, width, height]. */
	minimizedBounds?: PaneBounds;
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
		(key) =>
			key !== "mode" &&
			key !== "direction" &&
			key !== "maxPerTab" &&
			key !== "minimizedBounds",
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
			(rawConfig.panes.mode !== "split" &&
				rawConfig.panes.mode !== "tab" &&
				rawConfig.panes.mode !== "minimized")
		) {
			invalidPaneConfig(
				source,
				'panes.mode must be "split", "tab", or "minimized"',
			);
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
	const minimizedBounds = Object.hasOwn(rawConfig.panes, "minimizedBounds")
		? parseMinimizedBounds(rawConfig.panes.minimizedBounds, source)
		: undefined;
	const config: PaneConfig = { mode, direction, maxPerTab };
	if (minimizedBounds) config.minimizedBounds = minimizedBounds;
	return config;
}

function parseMinimizedBounds(value: any, source: string): PaneBounds {
	if (!Array.isArray(value) || value.length !== 4) {
		invalidPaneConfig(
			source,
			"panes.minimizedBounds must be [x, y, width, height]",
		);
	}
	const [x, y, width, height] = value;
	if (![x, y, width, height].every((entry) => isFiniteNumber(entry))) {
		invalidPaneConfig(
			source,
			"panes.minimizedBounds values must be finite numbers",
		);
	}
	if (
		x < 0 ||
		y < 0 ||
		width <= 0 ||
		height <= 0 ||
		x + width > 1 ||
		y + height > 1
	) {
		invalidPaneConfig(
			source,
			"panes.minimizedBounds must fit inside the window with positive width and height",
		);
	}
	return [x, y, width, height];
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
	createMinimized?: PaneCreator,
): PaneCreator {
	if (config.mode === "split")
		return (name, cwd) => createSplit(name, config.direction, cwd);
	if (config.mode === "tab") return createTab;
	if (!createMinimized)
		throw new Error(
			"Minimized pane placement requires a minimized pane creator",
		);
	return createMinimized;
}

export interface PaneConfigPatch {
	mode?: PaneMode;
	maxPerTab?: number;
	minimizedBounds?: PaneBounds;
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
	if (patch.minimizedBounds !== undefined)
		panes.minimizedBounds = patch.minimizedBounds;
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
