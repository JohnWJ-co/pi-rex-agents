# Changelog

All notable changes to `pi-rex-agents` are recorded here.

## 0.4.0 - 2026-11-11

First Rex-native release. The execution kernel is a hard fork of the MIT-licensed
3.7.2 Pi subagent kernel and ships inside this repository; no upstream npm package
is required.

### Added

- Rex is the only surface provider: `split` and `tab` placement, automatic
  result delivery, block/window lifecycle observation and cleanup.
- Managed worktrees with an absolute workspace contract, parent-owned review
  and explicit `worktree_list` / `worktree_remove` controls.
- Persistent specialists with inbox-driven follow-up turns, `caller_ping`
  task handoff and `subagent_stop`.
- Context-compression tool discovery for fresh, resumed, persistent and
  worktree handoff launches.
- Deterministic Rex integration harness with an isolated server and fake
  provider.
- `test/no-foreign-host.test.ts` guard over shipped TypeScript strings and
  Markdown.
- `/panes-mode` to switch split/tab/minimized and `/panes-maxPerTab` to set the
  per-tab split limit (1-10), with interactive selectors when called without
  arguments.
- `placement: "minimized"`: create a floating layer in the parent window and
  immediately minimize it to the Rex client tray. Minimized children keep
  running, do not consume `panes.maxPerTab` split slots, and restore at
  `panes.minimizedBounds` (default `[0.1, 0.1, 0.8, 0.8]`).

### Changed

- Configuration lives at `$PI_CODING_AGENT_DIR/rex-agents/config.json`.
- Public wording uses Rex terms: block, window and tab.
- `caller_ping` ends the current persistent task while keeping the specialist
  available; `subagent_done` without a current task keeps the session alive.
- A persistent child aborts a leftover run before `subagent_stop` shuts it down.
- Auto-exit child prompts and parent tool guidance now state that
  `subagent_done` is unavailable, so callers ask for a final summary instead
  of a tool call.

### Removed

- Pre-fork surface implementation, sidebar marker, Windows-specific launch
  paths and their exclusive tests.
- Legacy configuration migration; the old directory is never read or written.

### Verification

- `bash docs/p4/baseline/test-gate.sh`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run docs:tools:check`
- `npm pack --dry-run`
