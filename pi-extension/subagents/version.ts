import { readFileSync } from "node:fs";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isString } from "../../maestro/core/config/type-guards.ts";

const PACKAGE_JSON = new URL("../../package.json", import.meta.url);
const RELEASES_API =
	"https://api.github.com/repos/JohnWJ-co/pi-rex-agents/releases/latest";
export const UPDATE_COMMAND =
	"pi update https://github.com/JohnWJ-co/pi-rex-agents";

let cachedVersion: string | undefined;
let updateCheck: Promise<void> | undefined;

export function installedVersion(): string {
	if (cachedVersion) return cachedVersion;
	try {
		// SAFETY: this is the package's own local manifest; the version field is
		// checked for a non-empty string immediately below.
		const parsed = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
			version?: unknown;
		};
		cachedVersion =
			isString(parsed.version) && parsed.version.trim()
				? parsed.version.trim()
				: "unknown";
	} catch {
		cachedVersion = "unknown";
	}
	return cachedVersion;
}

export function compareVersions(left: string, right: string): number {
	const parse = (value: string): number[] | undefined => {
		const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
		return match
			? [Number(match[1]), Number(match[2]), Number(match[3])]
			: undefined;
	};
	const a = parse(left);
	const b = parse(right);
	if (!a || !b) return 0;
	for (let index = 0; index < 3; index += 1) {
		if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
	}
	return 0;
}

export async function latestReleaseVersion(): Promise<string | undefined> {
	try {
		const response = await fetch(RELEASES_API, {
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "pi-rex-agents-update-check",
			},
			signal: AbortSignal.timeout(2_500),
		});
		if (!response.ok) return undefined;
		// SAFETY: the GitHub release endpoint returns an object; tag_name is
		// treated as untrusted and must pass the string check before use.
		const body = (await response.json()) as { tag_name?: unknown };
		return isString(body.tag_name) && body.tag_name.trim()
			? body.tag_name.trim()
			: undefined;
	} catch {
		return undefined;
	}
}

export function registerVersionCommand(pi: ExtensionAPI): void {
	pi.registerCommand("subagents-version", {
		description: "Show the installed pi-rex-agents version and update command",
		async handler(_args, ctx) {
			const current = installedVersion();
			const latest = await latestReleaseVersion();
			if (latest && compareVersions(latest, current) > 0) {
				ctx.ui.notify(
					`pi-rex-agents ${current} → ${latest} available. Update: ${UPDATE_COMMAND}`,
					"warning",
				);
				return;
			}
			ctx.ui.notify(
				`pi-rex-agents ${current}${latest ? ` (latest ${latest})` : ""}. Update: ${UPDATE_COMMAND}`,
				"info",
			);
		},
	});
}

/**
 * Check the latest GitHub release once per process. This is a background
 * notification only: it never blocks session startup or changes behavior when
 * the network is unavailable. Set PI_REX_AGENTS_UPDATE_CHECK=0 to disable it.
 */
export function checkForUpdate(ctx: Pick<ExtensionContext, "ui">): void {
	if (
		process.env.PI_SUBAGENT_ID ||
		process.env.PI_REX_AGENTS_UPDATE_CHECK === "0" ||
		process.env.NODE_TEST_CONTEXT
	)
		return;
	updateCheck ??= latestReleaseVersion()
		.then((latest) => {
			if (!latest) return;
			const current = installedVersion();
			if (compareVersions(latest, current) <= 0) return;
			ctx.ui.notify(
				`pi-rex-agents ${current} → ${latest} available. Update: ${UPDATE_COMMAND}`,
				"warning",
			);
		})
		.catch(() => {
			// Update checks are advisory; network and provider failures are ignored.
		});
}
