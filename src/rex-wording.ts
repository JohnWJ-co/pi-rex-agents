/**
 * Rex wording for upstream text.
 *
 * The orchestration kernel is host-neutral except for a handful of literals
 * that name its original host. This module replaces those exact phrases
 * instead of rewriting the word "herdr" everywhere: a child's own report may
 * legitimately discuss another multiplexer, and must survive unchanged.
 */

interface Replacement {
  readonly from: string;
  readonly to: string;
}

const REPLACEMENTS: readonly Replacement[] = [
  {
    from:
      "Spawn a sub-agent in a dedicated terminal herdr pane, or in an isolated Herdr-managed Git worktree when worktree is provided. ",
    to:
      'Spawn a sub-agent in a dedicated Rex block beside you in the current tab (default), in a new Rex tab when placement is "tab", or in an isolated Rex-managed Git worktree when worktree is provided. ',
  },
  {
    from:
      "Resume a previous Pi-backed sub-agent session in a new herdr pane. ",
    to:
      'Resume a previous Pi-backed sub-agent session in a new Rex block (or a new Rex tab when placement is "tab"). ',
  },
  { from: "Herdr-managed Git worktree", to: "Rex-managed Git worktree" },
  { from: "ordinary panes", to: "ordinary blocks" },
  { from: "ordinary pane", to: "ordinary block" },
  { from: "new herdr pane", to: "new Rex block" },
  { from: "pane title", to: "block title" },
  { from: "terminal tab", to: "Rex tab" },
  { from: "its own pane", to: "its own block" },
  { from: "its pane was closed", to: "its block was closed" },
  { from: "child pane", to: "child block" },
  { from: "Subagents require herdr.", to: "Subagents require Rex." },
  { from: "via herdr:", to: "via Rex:" },
  { from: "Herdr confirmed it is gone", to: "Rex confirmed it is gone" },
  { from: "in Herdr pane", to: "in Rex block" },
  {
    from: "pi-herdr-agents ships no roles",
    to: "this host ships no roles",
  },
  { from: "workspace focus failed", to: "tab focus failed" },
  { from: "workspace ID", to: "window ID" },
  { from: "workspace-id", to: "window-id" },
  { from: "herdr not available", to: "rex not available" },
];

const SORTED = [...REPLACEMENTS].sort((a, b) => b.from.length - a.from.length);

function replacePhrases(text: string): string {
  let result = text;
  for (const { from, to } of SORTED) {
    if (result.includes(from)) result = result.split(from).join(to);
  }
  return result;
}

/**
 * The host's own label for a worktree's containing window. The ID is a Rex
 * window ID, so the label must say window, not workspace.
 */
function relabelWorkspaceIds(text: string): string {
  return text
    .replace(/^Workspace: (window:\S+)$/gm, "Window: $1")
    .replace(/(^|\s)\(workspace (window:[\w:-]+)\)/g, "$1(window $2)");
}

/** Rewrite model- and user-visible host text into Rex terms. */
export function rexifyText(text: string): string {
  return relabelWorkspaceIds(replacePhrases(text));
}

/** Rewrite every string in a JSON-schema-like value (tool parameters). */
export function rexifySchema<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === "string") return rexifyText(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => rexifySchema(item, seen)) as T;
  }
  if (value && typeof value === "object") {
    const source = value as Record<string | symbol, unknown>;
    const cached = seen.get(source);
    if (cached !== undefined) return cached as T;
    // Preserve the prototype and symbol keys: TypeBox schemas carry Kind
    // symbols that its compiler reads, even though the values are JSON Schema.
    const clone = Object.create(Object.getPrototypeOf(source)) as Record<
      string | symbol,
      unknown
    >;
    seen.set(source, clone);
    for (const symbol of Object.getOwnPropertySymbols(source)) {
      clone[symbol] = source[symbol];
    }
    for (const key of Object.keys(source)) {
      clone[key] = rexifySchema(source[key], seen);
    }
    return clone as T;
  }
  return value;
}

/** Rewrite the model-visible strings of a tool result. */
export function rexifyResultDetails<T>(details: T): T {
  if (!details || typeof details !== "object") return details;
  const record = details as Record<string, unknown>;
  if (typeof record.error !== "string") return details;
  return { ...record, error: rexifyText(record.error) } as T;
}
