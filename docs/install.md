**English** | [简体中文](install.zh-CN.md)

# Installation and self-check

## Prerequisites

- Run Pi inside a Rex block, with both `REX_SESSION` and `REX_BLOCK` present.
- Node.js 22.6+, with a working Pi and Rex CLI.
- When running from source, run `npm ci` first. The execution kernel is already hard-forked into this repository, so the upstream npm package does not need to be installed.

## Temporary loading

Run from the root of this repository:

```bash
pi --no-extensions -e "$PWD/pi-extension/subagents/index.ts"
```

`--no-extensions` disables auto-discovery and loads only extensions passed explicitly with `-e`. In an ordinary terminal without the Rex host identity, this extension does not register any tools.

## Install as a Pi package

```bash
pi install /absolute/path/to/pi-rex-agents
```

The package declares its entry points and operating guide through the following manifest:

```json
{
  "pi": {
    "extensions": ["./pi-extension/subagents/index.ts"],
    "skills": ["./skills/pi-rex-agents"]
  }
}
```

The packaged contents include only the runtime, README, LICENSE, example configuration, and operating guide. Development tests, migration docs, and local `.pi` configuration remain in the source checkout.

## Configuration

The new configuration lives at `$PI_CODING_AGENT_DIR/rex-agents/config.json`, defaulting to `~/.pi/agent/rex-agents/config.json`; the root directory can also be changed with `PI_CODING_AGENT_DIR`. Defaults are used when the configuration is missing.

## Self-check and verification

Run from the source checkout:

```bash
npm run doctor
npm run typecheck
bun test/smoke-extension.ts
npm run test:integration:rex
```

`doctor` checks the Rex/Pi CLIs, the extension and skill entry points declared in the manifest, and this package's status in `pi list`. The Rex integration tests use an isolated server and a fake provider; a skip means that environment was not verified.

In interactive Pi, `/subagent list` and `/worktree list` should run. An empty roles directory is normal; this package ships no roles. By default, split placement holds at most 2 child blocks managed by this parent process and uses a new tab once full; `placement: "tab"` and worktree subagents use a new tab directly; `placement: "minimized"` starts in a floating layer in the current tab and minimizes to the bottom-right tray, without consuming a split slot. `panes.maxPerTab` accepts only integers from 1 through 10; `/panes-mode` and `/panes-maxPerTab` change these settings directly. See [Configuration](configuration.md#pane-placement) for details.

The real-model probes are `npm run p1`, `npm run p1:persistent`, and `npm run p2`; the default model is `CBAPI/cn:deepseek-v4.1-flash`. Run them only when the task explicitly requires real-model evidence.
