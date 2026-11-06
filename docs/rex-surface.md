# Rex surface placement

The kernel owns the native `placement` argument on `subagent` and
`subagent_resume`. It passes the argument through the task, run session, Pi
adapter and launch operations to `createPane`. The Rex API proxy only rewrites
wording; it does not inject parameters or use async-local placement state.

`maestro/runtime/pi-placement.ts` owns one reservation queue per parent run
registry. For a split it reads `provider.listSurfaces()`, locates the parent
block's current window, and counts live registered ordinary children in that
window. It includes split creations awaiting registry admission. The default
limit is 2; `panes.maxPerTab` accepts integers from 1 through 8. On reaching the
limit it requests a tab instead. Explicit tabs bypass split admission, and
worktree creation always uses a separate tab.

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
parent block and tab into `rex window new --focus=false`. Every CLI call uses
explicit argv, `--autostart=false`, and the inherited `REX_SERVER` endpoint. See
[configuration](configuration.md#pane-placement) and the
[worktree guide](worktree-subagents.md#launch-contract).

Verification uses `test/maestro/pi-placement.test.ts` for reservations and
`test/maestro/pi-run-session.test.ts` for reload/resume adoption.
`test/integration/rex-placement.test.ts` starts a fresh parent Pi with this
checkout's extension in an isolated Rex server, checks split/split/tab window
IDs, closes one child, and verifies the next split returns to the parent window.
The isolated harness owns cleanup; it never operates on another Rex session.
