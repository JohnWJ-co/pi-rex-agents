---
name: verify-pi-rex-agents
description: Verify pi-rex-agents changes end to end through an isolated Rex server, a real parent Pi and the deterministic provider. Use after changing Rex placement, launch, delivery, lifecycle, cleanup or harness behavior.
---

# Verify pi-rex-agents

The product is a Pi extension hosted by Rex. Verification must exercise a real parent Pi in an isolated Rex server, with the extension loaded from this checkout and `test/integration/fake-provider.ts` providing deterministic model responses.

Use this lab entry point from the repository root:

```bash
L="node --experimental-strip-types .pi/skills/verify-pi-rex-agents/scripts/lab.ts"
```

`doctor` is read-only and must be clean before lifecycle work:

```bash
$L doctor
```

It checks the Rex and Pi binaries, Node, `REX_SESSION`/`REX_BLOCK`, the working-tree extension, concurrent integration suites, and any current lab endpoint. Run only one Rex integration suite at a time.

For lifecycle, delivery, placement or cleanup changes, run all of:

```bash
bash docs/p4/baseline/test-gate.sh
bun test/smoke-extension.ts
npm run typecheck
npm run lint
npm run format:check
npm run docs:tools:check
git diff --check
npm run test:integration:rex
```

For the retained P4 acceptance gate, judge the unit suite with `bash docs/p4/baseline/test-gate.sh`.
It clears `REX_SESSION`, `REX_BLOCK` and `REX_SERVER` in the gate process so
unit tests must inject deterministic infrastructure. Preserve the caller's real
Rex environment for the integration suite and manual lab; their evidence shape
and lifecycle checks are unchanged.

The smoke test must run inside Rex and pass; a skip means the environment was not verified.

The same command includes `rex-placement.test.ts`: a fresh parent loads the
current checkout with `-e`, then checks split/split/tab, close-and-reuse and
explicit tab using real child blocks and session evidence. The default split
limit is 2; reload/resume reservation adoption is also covered by unit tests.
A skipped placement test is not passing placement evidence.
The same suite includes `rex-return-contract.test.ts`: ordinary result JSON
and JSONL fallback, persistent root working/done identity with two immediate
inbox rounds, and error delivery after killing only the owned child Pi.
No idle grace period or terminal-screen completion evidence is allowed.
Startup uses `waitForPiReady` (`idle` only); each later turn uses
`waitForPiTurnSettled` (`done` or `idle`, excluding `working` and `blocked`).
Keep the existing timeout and require session evidence before checking status (F1).

The smoke test starts a parent Pi with `--no-extensions -e <checkout>/pi-extension/subagents/index.ts`, calls the real `subagent` tool through the deterministic provider, checks the `<subagent_report>` delivery and child session, observes a child block appear, and waits for it to disappear.

For a manual evidence run:

```bash
$L up
$L drive
$L down
```

`up` creates a short `pira-lab-*` root with `mkdtemp`, starts `rex server run --listen unix://<root>/s --state-dir <root>/state --restore=false`, creates a session, and runs `rex whoami --json` inside the lab block. The returned endpoint must equal the lab socket. `drive` records `evidence.json` with the endpoint, child session, report envelope, parent continuation, and block IDs before/during/after the delegation. It also requires a validated
`resultFile` / `result` matching the delivery and `exitcode: 0` after child exit. `down` stops only the recorded helper/server and removes the lab root.

Never synchronize with a fixed sleep. Wait for a file, session entry, Pi OSC/program status, or Rex block condition. Never call legacy host APIs or clean a user session.

For a refactor behavior pin:

```bash
node --experimental-strip-types .pi/skills/verify-pi-rex-agents/scripts/pin.ts > /tmp/pi-rex-pin.json
```

The package identity gate (`test/package-manifest.test.js`) must pass with an empty `docs/p4/baseline/expected-identity.txt`. Inspect `npm pack --dry-run`: it may contain only runtime TypeScript, package metadata, README, LICENSE, the example config and `skills/pi-rex-agents/SKILL.md`; tests, migration docs and lab artifacts stay outside the package. Require no extension file over 32 KiB (`find pi-extension/subagents -type f -size +32k -print`) and no empty root directories. Never update `released.json` to accommodate a rename; stop on a breaking schema difference.

Compare a pin made from the intended base checkout with the current tree. A difference is a behavior change and needs review. Keep every extension source file under the repository's established size limit and inspect the final `git diff` and package preview.
