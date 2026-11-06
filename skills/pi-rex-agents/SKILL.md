---
name: pi-rex-agents
description: Use when delegating to subagents, supervising child agents, or managing worktrees inside Rex. Explains Rex placement (same-tab block vs new tab), automatic result delivery, and why child agents are leaves.
---

# Subagents in Rex

This session runs inside a Rex block. Rex is the host: a **window** is a tab,
a **block** is a pane. The `subagent` tool is the only supported way to
delegate; another multiplexer or its skills do not apply here, even if installed.

## Launching

- One child: `subagent` with `name`, `task`, and an explicit `model` +
  `thinking` for orchestrated work.
- Placement: `placement: "split"` (default) opens a block beside you in the
  current Rex tab. `placement: "tab"` opens the child in a new Rex tab (a new
  window). Use `"tab"` when the user asks for a new tab/window; never create
  it by hand with the `rex` CLI. The default limit is 2 live children in the
  parent window; further splits use a new tab. Closing a child frees its slot,
  and `/reload` retains registered children and pending reservations. Configure
  `panes.maxPerTab` (integer 1..8) in
  `$PI_CODING_AGENT_DIR/rex-agents/config.json` (default
  `~/.pi/agent/rex-agents/config.json`). The previous host config path is neither read nor migrated.
- Worktree children (`worktree: { branch }`) always open in a new tab under
  `~/.pi/rex-agents/worktrees`; the parent checkout's uncommitted changes are
  not copied (the base is committed HEAD).
- Roles come from `.pi/agents` and `~/.pi/agent/agents`; this host ships no
  role pack. `agent` may be omitted for a bare child.

## Tools and results

- Installed compression-provider tools are appended to an explicit tool allowlist, including `tools: "read,bash"`; explicit deny rules still apply. Without a compression provider, Pi keeps native auto-compaction.
- The parent reads validated result artifacts and falls back to session JSONL for text. Semantic exit, the wrapper exit code and owned process evidence govern completion; terminal screen text does not.
- Persistent specialists accept a new task after the previous result arrives. Directory events wake their inbox, with a 5-second polling fallback. A busy specialist rejects a send and keeps no queue. Task-result, help, crash, stop, and stop-failure notices name the specialist's logical ID; use `subagent_send` with that ID or the specialist name for follow-ups, while any task ID in the notice identifies only the task being reported.

## While children run

- Do not poll, sleep, tail logs, or call `subagents_list` to check status.
  Completion, failure, and help requests arrive automatically as messages that
  start a new turn.
- End the turn or work on independent tasks. Dependent writes stay sequential;
  parallelize only independent work.

## Children

- A child is a leaf: it does not get the `subagent` tool. Give it one bounded
  outcome, the files it may touch, and how to verify.
- The parent owns integration: inspect each result or worktree handoff, run the
  relevant tests, and clean up with `worktree_remove` when done.
