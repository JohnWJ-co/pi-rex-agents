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
npm test
bun test/smoke-extension.ts
npm run typecheck
npm run lint
npm run format:check
npm run docs:tools:check
git diff --check
npm run test:integration:rex
```

The smoke test must run inside Rex and pass; a skip means the environment was not verified.

The same command includes `rex-placement.test.ts`: a fresh parent loads the
current checkout with `-e`, then checks split/split/tab, close-and-reuse and
explicit tab using real child blocks and session evidence. The default split
limit is 2; reload/resume reservation adoption is also covered by unit tests.
A skipped placement test is not passing placement evidence.
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

`up` creates a short `pira-lab-*` root with `mkdtemp`, starts `rex server run --listen unix://<root>/s --state-dir <root>/state --restore=false`, creates a session, and runs `rex whoami --json` inside the lab block. The returned endpoint must equal the lab socket. `drive` records `evidence.json` with the endpoint, child session, report envelope, parent continuation, and block IDs before/during/after the delegation. `down` stops only the recorded helper/server and removes the lab root.

Never synchronize with a fixed sleep. Wait for a file, session entry, Pi OSC/program status, or Rex block condition. Never call Herdr APIs or clean a user session.

For a refactor behavior pin:

```bash
node --experimental-strip-types .pi/skills/verify-pi-rex-agents/scripts/pin.ts > /tmp/pi-rex-pin.json
```

Compare a pin made from the intended base checkout with the current tree. A difference is a behavior change and needs review. Keep every extension source file under the repository's established size limit and inspect the final `git diff` and package preview.
