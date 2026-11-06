---
name: run-integration-tests
description: Run the Rex integration smoke suite and verify that the isolated Rex lab and all test-owned resources are cleaned up.
---

# Run Rex integration tests

This package's lifecycle integration suite runs in Rex. Before starting, remain inside a Rex block and confirm the target environment:

```bash
echo "REX_SESSION=$REX_SESSION"
echo "REX_BLOCK=$REX_BLOCK"
command -v rex
npm test
bun test/smoke-extension.ts
npm pack --dry-run
```

For P4 acceptance, judge the unit suite with `bash docs/p4/baseline/test-gate.sh`.
It clears `REX_SESSION`, `REX_BLOCK` and `REX_SERVER` only in the gate process;
unit fixtures inject their own infrastructure instead of borrowing this host.
Keep the real Rex environment in the caller for integration preflight and the lab.

If `REX_SESSION` is unset or `rex` is unavailable, stop and report that the Rex environment is missing. Do not count a skipped test as passing evidence. Run only one integration suite at a time; the suite uses an isolated Rex server but serial execution keeps provider and process resources deterministic.

Run the required deterministic smoke test:

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

```bash
npm run test:integration:rex
```

The test starts `test/integration/fake-provider.ts`, creates a `pira-lab-*` root with a Unix socket no longer than 104 bytes, starts `rex server run --listen ... --state-dir ... --restore=false`, verifies `rex whoami --json` inside a lab block, launches a real parent Pi with `--no-extensions -e <checkout>/pi-extension/subagents/index.ts`, and checks report delivery, child session evidence, block creation and cleanup. Wait on session files, OSC/program status, or block state; fixed sleeps are not synchronization.

For a manual run and evidence:

```bash
L="node --experimental-strip-types .pi/skills/verify-pi-rex-agents/scripts/lab.ts"
$L doctor
$L up
$L drive
$L down
```

Manual `drive` evidence includes `resultFile`, the validated `result` matching
the report body, and `exitcode: 0`, alongside session and block lifecycle data.

Report pass, fail, and skip separately. A skipped Rex test is not full verification.

After every run, perform postflight:

```bash
rex ls --json
find "${TMPDIR:-/tmp}" -maxdepth 1 \( -name 'pira-lab-*' -o -name 'pi-integ-*' \) -print
ps eww -ax | grep -E 'rex server run|test/integration' || true
git status --short
```

Confirm `rex ls --json` contains no test-owned `pira-lab-*` or `pi-integ-*` sessions, no `pira-lab-*` temporary directory remains, and no suite or lab server remains. Remove only verified test-owned residue. Never kill by process name and never modify an unrelated Rex session.
