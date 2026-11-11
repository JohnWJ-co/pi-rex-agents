import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
	encodeHostValue,
	HOST_ERROR_CHARS,
} from "../../maestro/core/host-text.ts";
import type {
	PaneConfig,
	PaneMode,
} from "../../maestro/core/config/pane-config.ts";
import { writePaneConfig } from "../../maestro/core/config/pane-config.ts";
import {
	getSubagentsConfigExamplePath,
	getSubagentsConfigPath,
} from "./config-path.ts";

const PANE_MODES: readonly PaneMode[] = ["split", "tab"];
const MAX_PER_TAB_OPTIONS = Array.from({ length: 10 }, (_, index) =>
	String(index + 1),
);

function errorText(message: string): string {
	return encodeHostValue(message, HOST_ERROR_CHARS);
}

function isPaneMode(value: string): value is PaneMode {
	return value === "split" || value === "tab";
}

function parseMaxPerTab(value: string): number | undefined {
	if (!/^\d+$/.test(value)) return undefined;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10
		? parsed
		: undefined;
}

async function chooseMode(
	args: string,
	ctx: ExtensionCommandContext,
	current: PaneMode,
): Promise<PaneMode | undefined> {
	const requested = args.trim().toLowerCase();
	if (requested) {
		if (!isPaneMode(requested)) {
			ctx.ui.notify(
				`Invalid pane mode "${errorText(args.trim())}". Use split or tab.`,
				"error",
			);
			return undefined;
		}
		return requested;
	}
	if (!ctx.hasUI) {
		ctx.ui.notify(
			"Pane mode requires interactive UI here; pass /panes-mode split or /panes-mode tab.",
			"warning",
		);
		return undefined;
	}
	const selected = await ctx.ui.select(
		`Select pane placement mode (current: ${current})`,
		[...PANE_MODES],
	);
	return selected && isPaneMode(selected) ? selected : undefined;
}

async function chooseMaxPerTab(
	args: string,
	ctx: ExtensionCommandContext,
	current: number,
): Promise<number | undefined> {
	const requested = args.trim();
	if (requested) {
		const parsed = parseMaxPerTab(requested);
		if (parsed === undefined) {
			ctx.ui.notify(
				`Invalid panes.maxPerTab "${errorText(requested)}". Enter an integer from 1 to 10.`,
				"error",
			);
		}
		return parsed;
	}
	if (!ctx.hasUI) {
		ctx.ui.notify(
			"panes.maxPerTab requires interactive UI here; pass /panes-maxPerTab 1-10.",
			"warning",
		);
		return undefined;
	}
	const selected = await ctx.ui.select(
		`Select max managed subagent blocks per tab (current: ${current})`,
		MAX_PER_TAB_OPTIONS,
	);
	return selected ? parseMaxPerTab(selected) : undefined;
}

/** Parent-session commands that edit the durable `panes` configuration. */
export function registerPaneCommands(
	pi: ExtensionAPI,
	{ paneConfig }: { paneConfig: PaneConfig },
): void {
	if (process.env.PI_SUBAGENT_ID) return;

	pi.registerCommand("panes-mode", {
		description:
			"Switch pane placement between split and tab; no argument opens a selector",
		handler: async (args, ctx) => {
			const mode = await chooseMode(args, ctx, paneConfig.mode);
			if (mode === undefined) return;
			try {
				const saved = writePaneConfig(
					getSubagentsConfigPath(),
					getSubagentsConfigExamplePath(),
					{ mode },
				);
				paneConfig.mode = saved.mode;
				ctx.ui.notify(
					`Pane mode set to ${saved.mode}. New subagent launches use this mode.`,
					"info",
				);
			} catch (error) {
				ctx.ui.notify(
					`Could not save pane mode: ${errorText(error instanceof Error ? error.message : String(error))}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("panes-maxPerTab", {
		description:
			"Set the maximum managed subagent blocks per tab; no argument opens a 1-10 selector",
		handler: async (args, ctx) => {
			const maxPerTab = await chooseMaxPerTab(args, ctx, paneConfig.maxPerTab);
			if (maxPerTab === undefined) return;
			try {
				const saved = writePaneConfig(
					getSubagentsConfigPath(),
					getSubagentsConfigExamplePath(),
					{ maxPerTab },
				);
				paneConfig.maxPerTab = saved.maxPerTab;
				ctx.ui.notify(
					`panes.maxPerTab set to ${saved.maxPerTab}. New subagent launches use this limit.`,
					"info",
				);
			} catch (error) {
				ctx.ui.notify(
					`Could not save panes.maxPerTab: ${errorText(error instanceof Error ? error.message : String(error))}`,
					"error",
				);
			}
		},
	});
}
