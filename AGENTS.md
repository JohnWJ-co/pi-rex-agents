# Repository instructions for agents

These instructions apply to changes in `pi-rex-agents-p4`.

## What this package is

`pi-rex-agents` is the Rex host adapter for the Pi subagent extension. It is a hard fork of the upstream execution kernel: parent Pi runs inside a Rex block, ordinary children run in Rex blocks or windows, and completion returns to the parent automatically. Rex is accessed through its documented CLI with explicit argv; no private socket protocol is part of this package.

This tree is the P4 migration worktree. Keep changes scoped to the current checkout. Do not modify the sibling `pi-rex-agents` checkout or the upstream `pi-herdr-agents` checkout. Do not commit or push unless the parent agent explicitly owns that action.

## Read these first

- [`README.md`](./README.md) — installation and everyday use
- [`docs/p4/plan.md`](docs/p4/plan.md) and the relevant task card under [`docs/p4/tasks/`](docs/p4/tasks/) — migration scope
- [`docs/p4/rex-facts.md`](docs/p4/rex-facts.md) — measured Rex behavior, especially socket isolation and OSC lifecycle
- [`maestro/surfaces/rex/rex-cli.ts`](maestro/surfaces/rex/rex-cli.ts) — the only Rex CLI wrapper and argv boundary
- [`maestro/surfaces/rex/rex-surface-provider.ts`](maestro/surfaces/rex/rex-surface-provider.ts) — Rex surface lifecycle
- [`src/extension.ts`](src/extension.ts) — Pi composition root
- [`test/integration/rex-harness.ts`](test/integration/rex-harness.ts) and [`test/integration/fake-provider.ts`](test/integration/fake-provider.ts) — deterministic Rex integration fixtures
- [`.pi/skills/verify-pi-rex-agents/SKILL.md`](.pi/skills/verify-pi-rex-agents/SKILL.md) — verification map and isolated lab
- [`.pi/skills/run-integration-tests/SKILL.md`](.pi/skills/run-integration-tests/SKILL.md) — integration preflight and cleanup

## Code map

- `src/extension.ts` — Rex-only Pi composition root; loads the kernel with Rex infrastructure and host notices
- `maestro/surfaces/rex/rex-cli.ts` — dependency-free explicit-argv Rex CLI wrapper; every call uses `--autostart=false` and propagates `REX_SERVER`
- `maestro/surfaces/rex/rex-surface-provider.ts` — block/window creation, Pi command execution, OSC/program status observation, process inspection and cleanup
- `src/rex-host-api.ts`, `src/rex-wording.ts` — Rex host API proxy and user-facing host text
- `maestro/runtime/pi-placement.ts` — parent-owned split admission and reservations, preserved with the Pi run registry across reloads
- `src/infrastructure.ts`, `maestro/surfaces/rex/worktree.ts`, `maestro/surfaces/rex/git.ts` — runtime seams and Rex-managed worktree paths
- `pi-extension/subagents/` — execution kernel, delivery envelope, controls, persistent specialists and renderers
- `maestro/core/` — host-neutral seams, lifecycle, routing, wakeups and worktree contracts retained by the fork
- `maestro/runtime/` — Pi run sessions, delivery, cleanup, worktree operations and supervision
- `maestro/adapters/pi/` — Pi launch transactions, child protocol, session I/O and process evidence
- `maestro/adapters/pi/context-tools.ts` — registered compression-provider discovery; the parent appends these tools to fresh, resume, persistent and interactive handoff launch allowlists through the runtime seam
- `maestro/surfaces/rex/` — the only real SurfaceProvider implementation; `maestro/surfaces/fake/` is test-only
- `test/integration/rex-harness.ts` — isolated Rex server, fake-provider configuration, parent launch and observable wait helpers
- `test/integration/rex-smoke.test.ts` — real parent-to-child Rex smoke lifecycle
- `test/integration/rex-placement.test.ts` — real split/split/tab placement, close-and-reuse and explicit tab evidence
- `test/integration/fake-provider.ts` — deterministic HTTP provider used by integration tests
- `.pi/skills/verify-pi-rex-agents/scripts/lab.ts` — manual doctor/up/drive/down evidence lab
- `.pi/skills/verify-pi-rex-agents/scripts/pin.ts` — registration behavior pin

Update this map when moving or adding a major seam.

## Host invariants

- Every Rex CLI call remains explicit argv and shell-free. `REX_SERVER` is passed as `-S <endpoint>` when present and `--autostart=false` is always explicit.
- The isolated lab starts `rex server run --listen unix://<root>/s --state-dir <root>/state --restore=false` under a `mkdtemp(join(tmpdir(), "pira-lab-"))` root. Refuse socket endpoints longer than 104 bytes.
- The first lab check runs `rex whoami --json` inside the lab block and requires the endpoint to equal the lab socket.
- Children are launched through the real `subagent` tool. A completed delegation must provide the report envelope, the child session evidence and the child block lifecycle evidence.
- Synchronization waits for observable files, session entries, OSC/program status or Rex block changes. Fixed sleeps are not synchronization. `waitForPiReady` requires startup `idle`; after a turn, use `waitForPiTurnSettled` for `done` or `idle`, never `working` or `blocked` (F1).
- The extension is Rex-only. A child is a leaf and must not register or invoke another delegation path.
- The parent owns review, integration, publication and cleanup. Do not switch the parent checkout, push branches, or remove unrelated Rex sessions.

## Documentation synchronization

When behavior changes, update every affected surface in the same change:

- public tool parameters, lifecycle or host wording → the generated tool docs and their checked snapshot, plus `README.md` when everyday use changes
- report envelope, session evidence or host lifecycle → the delegation outcome contract and the relevant Rex facts
- Rex configuration, model routing or launch arguments → `README.md`, configuration prose and the integration harness
- placement, block cleanup or worktree behavior → the Rex surface documentation and worktree guide
- verification behavior → `AGENTS.md`, the two Rex skills and the lab evidence shape
- domain terms or migration decisions → `CONTEXT.md` or the relevant `docs/p4` record

Do not make the integration test weaker to accommodate a flaky or unavailable environment. A missing Rex environment is an explicit skip and is not passing evidence.

## Verification

For ordinary changes, run:

```bash
npm test
npm run docs:tools:check
npm run format:check
npm run lint
npm run typecheck
npm pack --dry-run
git diff --check
```

For Rex lifecycle, delivery, placement or cleanup changes, also run inside Rex:

```bash
node --experimental-strip-types .pi/skills/verify-pi-rex-agents/scripts/lab.ts doctor
npm run test:integration:rex
```

For an end-to-end evidence claim, run `lab.ts up`, `drive`, and `down`, then inspect `evidence.json`. Record skipped and failed tests separately; do not report a skipped smoke test as a passing lifecycle check.

`npm run typecheck` covers production TypeScript, tests and `.pi/skills/**/*.ts` under strict mode. `npm run lint` requires a Node version supported by the repository's oxlint configuration.

## Before handing off

- inspect `git status --short` and the complete final diff
- run `npm pack --dry-run` after package or documentation path changes and inspect the file list
- confirm no temporary `pira-lab-*` root, `pi-integ-*` root, Rex server or integration process remains
- run `rex ls --json` and confirm no test-owned session remains
- confirm no generated evidence, local config, provider credentials or session artifacts are staged
- confirm no accidental empty root directory exists:

```bash
test -z "$(find . -mindepth 1 -maxdepth 1 -type d -empty -print)"
```

Report changed files, unresolved issues, and the exact local gates run. Keep the task card and `docs/p4/STATUS.md` unchanged unless the parent agent asks for those updates.
