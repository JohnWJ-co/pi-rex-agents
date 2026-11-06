/**
 * Per-launch surface placement for Rex subagents.
 *
 * The upstream tool schema has no placement field and the launch operations
 * receive a single fixed PaneConfig. A tool call can still choose where its
 * child goes: the tool wrapper runs the launch inside this AsyncLocalStorage
 * scope, and createPane reads it. Async context keeps concurrent launches with
 * different placements independent.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { PaneConfig } from "../maestro/core/config/pane-config.ts";
import type { RexPlacement } from "../maestro/surfaces/rex/rex-surface-provider.ts";

/** The values the `placement` tool parameter accepts. */
export type ChildPlacement = "split" | "tab";

export const childPlacement = new AsyncLocalStorage<
  ChildPlacement | undefined
>();

/** Narrow an untrusted tool argument to a placement value. */
export function resolvePlacement(value: unknown): ChildPlacement | undefined {
  if (value === "split" || value === "tab") return value;
  return undefined;
}

/**
 * Translation of the session-wide PaneConfig into a Rex placement.
 *
 * Rex has no "grouped agents tab": the equivalent is splitting the parent tab
 * up to maxPerTab children, then opening new tabs. createPane applies that cap
 * to every split request, so grouped and split share the same path here.
 */
export function placementFromPaneConfig(config: PaneConfig): RexPlacement {
  if (config.mode === "tab") return { kind: "tab" };
  return { kind: "split", direction: config.direction };
}

/** The placement for one launch: the tool call wins over the session config. */
export function placementForLaunch(config: PaneConfig): RexPlacement {
  const chosen = childPlacement.getStore();
  if (chosen === "tab") return { kind: "tab" };
  if (chosen === "split") {
    return { kind: "split", direction: config.direction };
  }
  return placementFromPaneConfig(config);
}
