# Rex surface placement

The kernel owns the native `placement` argument on `subagent` and
`subagent_resume`. It passes the argument through the task, run session, Pi
adapter and launch operations to `createPane`. The Rex composition supplies
surface operations directly to the kernel.

`maestro/runtime/pi-placement.ts` owns one reservation queue per parent run
registry. For a split it reads `provider.listSurfaces()`, locates the parent
block's current window, and counts live registered ordinary children in that
window that are not minimized. It includes split creations awaiting registry
admission. The default limit is 2; `panes.maxPerTab` accepts integers from 1
through 10. On reaching the limit it requests a tab instead. Explicit tabs and
minimized placements bypass split admission, and worktree creation always uses
a separate tab.

The queue covers inventory and creation, with cancellation checked before
mutation. Registry admission transfers a pending reservation to the registered
child. A confirmed close releases a slot on the next inventory read. An observed
block from an uncertain split reply also retains its reservation while live.
When the parent window cannot be verified, admission chooses a new tab.

`createDefaultRunSession(options, previous)` adopts the existing registry and
reservation owner on `/reload`, so pending and active children keep their slots.
Other parents' blocks and user-created blocks do not count against this
parent's limit. Nothing adopts blocks by label.

The provider translates split into `rex split --focus=false` beside its stable
parent block and tab into `rex window new --focus=false`. A minimized child is
created with `session.new_layer` in the parent window at
`panes.minimizedBounds` (default `[0.1, 0.1, 0.8, 0.8]`, centered at 80%)
and immediately changed to `state: "minimized"` with
`session.set_layer_state`; the block keeps running in the client's tray and is
returned to normal by the client when the user restores it. Every CLI call uses
explicit argv, `--autostart=false`, and the inherited `REX_SERVER` endpoint. See
[configuration](configuration.md#pane-placement) and the
[worktree guide](worktree-subagents.md#launch-contract).

Verification uses `test/maestro/pi-placement.test.ts` for reservations and
`test/maestro/pi-run-session.test.ts` for reload/resume adoption.
`test/integration/rex-placement.test.ts` starts a fresh parent Pi with this
checkout's extension in an isolated Rex server, checks split/split/tab/minimized placement, closes one child, and verifies the next split
returns to the parent window.
The isolated harness owns cleanup; it never operates on another Rex session.

## Managed-worktree child isolation

A managed-worktree launch passes its absolute worktree and source-checkout
paths in `PI_SUBAGENT_WORKTREE` and `PI_SUBAGENT_SOURCE_CWD`. The source path
is the Git checkout root, including when the launch cwd is a subdirectory. The child notice
names the worktree as its workspace and forbids changing into or modifying the
source checkout. A child-side `tool_call` guard blocks known writing tools with
explicit file-path parameters when canonical resolution places the target in
the source checkout but outside the worktree, and reports the matching
worktree path. Symlinked ancestors, symlink targets, nonexistent tails and
`/var` versus `/private/var` aliases are resolved before the decision. Built-in
file-tool paths also use Pi's home, `@`, file-URL and Unicode-space normalization.
Ordinary children receive empty values and no guard handler. `Bash` is not
parsed: shell writes remain prompt-constrained and are not a security boundary.

## Program status and completion

Pi receives `--name <display name>` and owns the root OSC 7501 record.
`inspectSurface` reads that root: working maps to running, blocked to blocked,
done to done, error to error, and idle to idle. Supplementary `id=pira`
records never override the root; the child extension uses them only for
bounded task/generation/result metadata.

The child writes an atomic result artifact; the parent checks its launch/task
identity before reading the final text and falls back to JSONL if unavailable.
The shell atomically publishes `<sessionFile>.exitcode` after Pi exits.
Neither OSC nor captured terminal text commits completion. See the
[return contract](delegation-outcome-contract.md#rex-runtime-evidence).

`test/integration/rex-return-contract.test.ts` checks ordinary artifact delivery
and JSONL fallback, persistent root working/done identity with two immediate
inbox rounds, and error delivery after killing the owned child Pi. It uses
only the deterministic provider and the isolated lab's blocks.
