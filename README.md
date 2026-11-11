**English** | [简体中文](README.zh-CN.md)

# pi-rex-agents

`pi-rex-agents` is a Rex-native Pi subagent extension. The parent Pi keeps working in the current Rex block; `subagent` launches a child Pi in a block in the same tab or in a new tab, and automatically returns the result to the parent session when the child finishes. The parent process does not block, and does not need to poll logs or status.

This repository contains the execution engine hard-forked from the MIT-licensed 3.7.2 Pi subagent kernel, and does not depend on the upstream npm package. For the upstream baseline, license, and manual porting rules, see [UPSTREAM](docs/UPSTREAM.md).

## Demo

A 65-second tour of split, tab, and minimized subagent placement.

https://github.com/user-attachments/assets/cfe55810-4e73-4d65-b233-626516a92b7e

## Features

- **Rex-native placement**: `placement: "split"` launches beside the parent block, `placement: "tab"` launches in a new tab, and `placement: "minimized"` launches in a floating layer in the current tab and immediately minimizes it to a capsule in the bottom-right corner. A Rex window is a tab and a block is a pane.
- **Automatic return delivery**: completion, failure, and help-request messages wake the parent session through steer messages, and results are published atomically by the host.
- **Persistent specialists**: a `persistent` subagent reuses the same session across tasks, receives follow-up tasks through `subagent_send`, and stops gracefully through `subagent_stop`.
- **Managed worktree**: writing tasks run in an isolated Git checkout; the parent agent handles review, integration, and cleanup.
- **Compression tool passthrough**: installed context-compression tools are enabled automatically for fresh, resume, persistent, and worktree handoff runs.
- **Leaf subagents**: subagents do not register or invoke other delegation paths, avoiding infinite nesting.
- **Verifiable**: deterministic Rex integration tests use an isolated server and a fake provider, and never call a real model.

## Requirements

- Node.js 22.6+
- Pi (with the extension API) and the Rex CLI
- Run Pi inside a Rex block: `REX_SESSION` and `REX_BLOCK` must be present
- Currently supports macOS and Linux; Windows is not supported

## Installation

### Install from GitHub

```bash
pi install https://github.com/JohnWJ-co/pi-rex-agents
```

After installation, `pi list` should show this package; the extension entry point is `./pi-extension/subagents/index.ts`.

### Run from a source checkout

```bash
git clone https://github.com/JohnWJ-co/pi-rex-agents.git
cd pi-rex-agents
npm ci
npm run doctor
```

To load the current checkout temporarily:

```bash
pi --no-extensions -e "$PWD/pi-extension/subagents/index.ts"
```

For long-term use, run `pi install /absolute/path/to/pi-rex-agents`. For installation and self-check details, see [Installation](docs/install.md).

## Usage

The package provides the following parent-session tools and commands:

| Tool | Purpose |
|---|---|
| `subagent` | Spawn a subagent, optionally specifying role, model, placement, worktree, persistent, and accept check |
| `subagent_resume` | Resume an existing child session in a new block or tab |
| `subagent_interrupt` | Send Escape to a running subagent to interrupt the current turn |
| `subagent_cancel` | Cancel an ordinary subagent, confirm that its process has exited, and deliver one cancelled result |
| `subagent_send` | Send the next task to an idle persistent specialist |
| `subagent_stop` | Stop a persistent specialist after the current task settles |
| `subagents_list` | List available roles and subagent definitions |
| `subagents_write_task_models` | Validate and atomically write task-model preferences |
| `worktree_list` | List managed worktrees, including leftovers from other sessions |
| `worktree_remove` | Explicitly remove a worktree by path, branch, or window ID |

Commands: `/subagent`, `/subagents-init`, `/worktree`, `/panes-mode`, `/panes-maxPerTab`. For full parameters, lifecycle, and events, see the [tools reference](docs/tools.md); for the operating guide, see the [pi-rex-agents skill](skills/pi-rex-agents/SKILL.md).

## Placement and worktrees

- `placement: "split"` is the default: it starts the child block beside the parent block. Each parent process has a default cap of 2 managed child blocks; once the cap is reached, a new tab is used. Closing a child block frees its slot, and `/reload` preserves the registry and reservations. Blocks that users add manually and other parent processes do not count against the cap.
- `placement: "tab"` starts directly in a new tab. A Rex window is a tab.
- `placement: "minimized"` creates a floating layer in the current tab and immediately minimizes it to the tray in the bottom-right corner of the client; the subagent keeps running in the same window. It does not consume a split slot under `panes.maxPerTab`. Setting `panes.mode` to `"minimized"` makes this the default launch mode.
- Worktree subagents always use a new tab and create an isolated checkout from the committed Git state. The subagent receives an absolute workspace path and must read, write, and run commands inside that workspace; it must not `cd` into or modify the parent/source checkout. The parent agent handles review, integration, and cleanup.
- Explicit path writes such as `edit`/`write` that target the source checkout are rejected, and the corresponding workspace path is suggested. Shell commands such as `Bash` cannot be reliably intercepted and are constrained only by prompt instructions.
- Completed worktrees are kept by default for parent review; removal must be explicitly initiated through `worktree_remove` or `/worktree remove`.

See the [worktree guide](docs/worktree-subagents.md) and the [Rex surface reference](docs/rex-surface.md) for details.

## Configuration

Configuration is read from `$PI_CODING_AGENT_DIR/rex-agents/config.json`, defaulting to `~/.pi/agent/rex-agents/config.json`; defaults are used when the file is missing. Configuration from the old directory is neither read nor migrated.

```json
{
  "panes": {
    "mode": "split",
    "direction": "right",
    "maxPerTab": 2,
    "minimizedBounds": [0.1, 0.1, 0.8, 0.8]
  },
  "persistent": {
    "maxAgents": 3
  },
  "spawning": {
    "maxDepth": 1
  },
  "outcomeLedger": true
}
```

`panes.mode` accepts `"split"`, `"tab"`, or `"minimized"`; `panes.maxPerTab` accepts only integers from 1 to 10, defaults to 2, and constrains only split subagents, not minimized ones. `panes.minimizedBounds` controls the position and size of a minimized subagent when it is restored, in `[x, y, width, height]` format, defaulting to `[0.1, 0.1, 0.8, 0.8]` (centered in the window at 80% size). In interactive Pi, use `/panes-mode` to switch between the three modes and `/panes-maxPerTab` to enter an integer from 1 to 10 or open a picker; both take effect immediately and are written back to the configuration file. For the full set of keys, model routing, supervision, and the outcome ledger, see [Configuration](docs/configuration.md) and [config.json.example](config.json.example).

Subagents automatically enable installed context-compression tools, including billion-context's `compress`, `decompress`, `search_context`, and `acp_status`, as well as the optional `acp_rule`, even when `tools: "read,bash"` is passed. An explicit `deny-tools` still takes precedence; this applies to fresh, resume, persistent, and worktree handoff runs. Without a compression plugin, Pi's native auto-compaction is used.

## Return contract

| Evidence | Purpose |
|---|---|
| Atomically published `.result.json`; the per-task result file for persistent agents | The parent reads the body after validating subagentId, taskId, and generation |
| session JSONL | Body fallback and audit evidence when the result file is unavailable |
| `.exit` | Semantic exit record from the Pi kernel |
| `.exitcode` | Process exit code recorded by the wrapper script; still allows reporting failure when the child Pi is force-killed |
| Rex `program_status` root record | Pi-native working / blocked / done / idle states |
| `id=pira` child record | Task, generation, and result metadata appended by the extension |

Completion is determined without reading the terminal screen. The persistent inbox wakes on directory events and falls back to a 5-second poll; as soon as one round's result arrives, the next round can be sent immediately. For the complete fields and acceptance requirements, see the [runtime evidence contract](docs/delegation-outcome-contract.md#rex-runtime-evidence).

## Review model selection

Cross-family independent review requires a reviewer from a different model family than the author. For ordinary review, prefer a different authenticated model family. When no other authenticated model family is available, ordinary review may use a same-family reviewer in a fresh standalone session. Disclose that this review is context-isolated, not cross-family independent. Cross-family verification must not use this fallback.

For role configuration and tool permissions, see [Roles and custom agents](docs/roles.md). Bash in `read,bash` can modify files; a reviewer's permissions should match the task.

## Development and verification

```bash
npm ci
bash docs/p4/baseline/test-gate.sh
npm run typecheck
npm run lint
npm run format:check
npm run docs:tools:check
node --experimental-strip-types --test test/no-foreign-host.test.ts
bun test/smoke-extension.ts
npm pack --dry-run
```

The baseline gate runs the full `npm test` in a child process with the Rex environment variables cleared, while preserving the caller's Rex environment for integration verification. Run `npm run test:integration:rex` inside a Rex block; it uses an isolated Rex server and a fake provider, and does not call a real model. The real-model probes are `npm run p1` and `npm run p1:persistent`, which default to `CBAPI/cn:deepseek-v4.1-flash`.

For the code map and gate requirements, see [AGENTS.md](AGENTS.md); for testing and release details, see [development](docs/development.md). Historical records: [P0](docs/p0-result.md), [P1](docs/p1-result.md), [P2](docs/p2-result.md) (Chinese), [P4](docs/p4/STATUS.md) (English).

## Documentation

- [Tools reference](docs/tools.md)
- [Configuration](docs/configuration.md)
- [Worktree guide](docs/worktree-subagents.md)
- [Roles and custom agents](docs/roles.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Documentation map](docs/README.md)
- [中文文档](docs/README.zh-CN.md)

## Known limitations

- Rex-native sidebar indicators are not implemented yet; Pi's own status widget is available.
- Process and cwd visibility is limited by system permissions. Worktree cleanup discloses process information that cannot be determined and blocks removal when known occupancy or a dirty state exists.
- Write protection for worktree subagents covers only known write tools with explicit file paths and is not a security sandbox; the workspace constraint for shell commands is prompt-level.
- Windows is not currently supported.

## License

MIT. For the full copyright and license text, see [LICENSE](LICENSE); for upstream attribution and porting boundaries, see [UPSTREAM](docs/UPSTREAM.md).
