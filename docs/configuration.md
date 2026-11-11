# Configuration

This page is the reference for the durable `config.json` settings, task-model preferences, and the events other extensions use during `/subagents-init`. For a short introduction, see [Choose models](../README.md#choose-models) in the README.

## Configuration file

The durable user configuration is `$PI_CODING_AGENT_DIR/rex-agents/config.json`,
defaulting to `~/.pi/agent/rex-agents/config.json`. The host uses Pi's public
agent-directory resolver. An empty `PI_CODING_AGENT_DIR` uses the default,
and a leading `~` expands as it does in Pi. It is not read from the
installed package root, so npm and git package upgrades do not overwrite it.
Create it by copying the installed package's `config.json.example`, or run
`/subagents-init` to seed and draft model task preferences. Without a Rex config,
panes default to split, right, `maxPerTab: 2`, and centered 80% minimized bounds.

```json
{
  "status": {
    "enabled": true
  },
  "models": {
    "agents": {}
  },
  "persistent": {
    "maxAgents": 3
  },
  "spawning": {
    "maxDepth": 1
  },
  "supervision": {
    "forcePolling": false,
    "hangWarningMinutes": 15
  },
  "panes": {
    "mode": "split",
    "direction": "right",
    "maxPerTab": 2,
    "minimizedBounds": [0.1, 0.1, 0.8, 0.8]
  },
  "guidelines": {
    "launchRoster": true
  },
  "outcomeLedger": true
}
```

If `config.json` is absent, status, role, pane, spawning, persistent-specialist, supervision, guidelines, and outcome-ledger settings fall back to `config.json.example`.
Model routing does not read the example: no model overrides apply until a real
`config.json` exists.

`config.json` is durable user state under the Pi agent directory and is loaded
when the extension starts. Run `/reload` after changing it. Package-root
`config.json` files are ignored; move them manually or re-run `/subagents-init`.

## Context-compression tools

Every fresh or resumed child, persistent specialist, and interactive worktree
handoff automatically activates installed context-compression tools before its
first turn, even with a restricted `tools` list such as `read,bash`. The
`billion-context` provider is detected by its registered `compress` tool; its
registered `compress`, `decompress`, `search_context`, `acp_status`, and optional
`acp_rule` tools are enabled. Explicit `deny-tools` entries take precedence.
The parent discovers these tools from its full registered tool list and appends
them to the launch `--tools` list, while preserving the caller's saved tool
policy. Pi filters tool registration by `--tools`, so child-side activation
cannot restore an omitted tool. Load the compression provider in both parent
and child; run `/reload` in the parent after changing the launch code or
extensions. Without an installed provider, no tools or compaction settings
are changed: Pi uses its native auto-compaction. Additional providers belong
in `maestro/adapters/pi/context-tools.ts`.

## Child session evidence

The kernel passes each child's display name with `--name`, so Pi's root OSC
record identifies the child. No additional configuration is needed. The child
publishes a versioned result JSON beside its session; the launch wrapper writes
`.exitcode` after process exit. The parent validates the result's subagent,
task and generation identity and falls back to session JSONL when unavailable.
Persistent inbox changes wake through a directory watch with a 5-second
reconciliation; the next task can be sent immediately after delivery. See the
[return contract](delegation-outcome-contract.md#rex-runtime-evidence).

## Model preferences

The copyable example is model-neutral, so it works without requiring credentials
for a specific provider. To configure models, replace the empty section with
exact IDs from your authenticated model catalog:

```json
{
  "models": {
    "default": "your-provider/your-default-model",
    "agents": {
      "scout": "your-provider/your-fast-model",
      "reviewer": "your-provider/your-review-model"
    },
    "tasks": {
      "coding": ["your-provider/your-coding-model"],
      "review": ["your-provider/your-review-model"],
      "recon": ["your-provider/your-fast-model"],
      "qa": ["your-provider/your-qa-model"],
      "architecture": ["your-provider/your-architecture-model"],
      "docs": ["your-provider/your-docs-model"]
    },
    "tasksMeta": {
      "generatedAt": "2026-09-17T00:00:00Z",
      "method": "research"
    }
  }
}
```

`models.tasks` candidates are ordered exact authenticated IDs. Use
`task:<category>` only in the `subagent` tool's `model` argument; it is not
valid in frontmatter or model defaults. Cross-family independent review requires
a reviewer from a different model family than the author. For ordinary review,
prefer a different authenticated model family. When no other authenticated
model family is available, ordinary review may use a same-family reviewer in a
fresh standalone session. Disclose that this review is context-isolated, not
cross-family independent. Cross-family verification must not use this fallback.
Use an exact authenticated
shortlist `provider/model-id` when the
authoring family is known; `task:review` does not establish independence. Family
is the independence boundary; project policy may separately require a different
provider. This is guidance, not extension enforcement.

## Draft task-model preferences

Run `/subagents-init [preferences]` to draft task-model preferences. For example:

```text
/subagents-init Prefer capability over price for implementation; keep recon inexpensive
```

The command supplies a sanitized snapshot of **all available models from the
active session registry**, including extension-registered providers, exact IDs,
display names, reported base token costs, context/output limits, input
modalities, reasoning, and supported thinking levels. Safe extension-registration and auth-source
metadata is included when Pi exposes it; credentials, endpoints, and raw auth
labels are not. Configured authentication does not prove account access or a
successful request. Missing costs remain unknown; reported zero does not mean
free, and OAuth does not establish subscription billing. The brief uses compact
JSON without truncating models and reports its model count and JSON character
count (not a token estimate); large catalogs still consume context. This is the
current synchronous snapshot: a dynamic provider whose initial catalog refresh
has not completed might be absent. Init does not refresh providers or probe the
network for availability. The brief also includes `configRevision`, the
revision of the exact config bytes that supplied the saved preferences. Init
does not start while a turn runs or messages are queued, and an empty registry
ends with a notice instead of a prompt. Neither case writes anything.

The draft considers current saved task, default, and per-agent preferences.
Optional command arguments set ranking preferences. Otherwise it favors
capability for substantive work and efficiency for bounded reconnaissance and
test execution. Categories describe work, not complexity tiers:

| Category | Work |
| --- | --- |
| `coding` | Implementation workers |
| `review` | Code reviewers |
| `recon` | Reconnaissance scouts |
| `qa` | Software and test runners |
| `architecture` | Planning and diagnosis |
| `docs` | Documentation workers |

Init asks the agent to research major candidates across providers using primary
sources, disclose uncertainty and notable exclusions, and avoid duplicate
upstream models across routes unless deliberate redundancy is explained. Display
names help identify candidates but, like aliases, do not prove upstream
equivalence; research is still required. Price or context size alone is not
quality evidence. No live model probes run.

The proposal carries a ranking `basis`. It is `{"kind":"registry-only"}` when
search is unavailable or yields no usable evidence. It is `{"kind":"research"}`
only with the http(s) `sources` consulted in this run, the `influence` each had
on the ranking, and the remaining `uncertainty`. Code checks the basis's shape,
not whether a source was read, so the basis is labeled as submitted and
unverified.

While init runs, it emits the versioned task-model approval event.
With no offer, the prompt directs the model to `subagents_write_task_models`
with `expectedConfigRevision`. When exactly one loaded extension offers, init
opens that extension's flow, and the extension's instructions replace the
writer instruction; the extension then owns approval and the write. Two or more
offers, or an invalid one, stop init before any extension opens or a prompt is
sent. Once an offer is recorded, a refusal or failure also stops init: it never
falls back to the direct writer. See [Task-model init events](#task-model-init-events).

## Task-model writer

The writer validates and atomically replaces `models.tasks` and `tasksMeta`,
preserving unrelated settings. Its tool schema accepts partial nonempty
categories (omitted categories are removed), rejects empty `tasks: {}` input,
and rejects exact duplicate refs within a category after trimming;
IDs remain case-sensitive. Its result includes normalized saved `tasks`,
`tasksMeta`, `configPath`, `missingCategories`, and `configRevision`. Init requests all six categories
and a before/after table based on that saved result, not the unsaved draft, and
must explain missing categories or changed choices.

Optional `basis` must have the same kind as `tasksMeta.method`. A research basis
needs at least one source with an http(s) URL that has a host and a nonblank
`influence`, plus a nonblank `uncertainty`. The writer validates it before
writing, returns it in the result, and never saves it; only `tasksMeta.method`
persists. Calls without `basis`, including research calls, keep the earlier
contract.

Optional `expectedConfigRevision` makes a write conditional on the config the
proposal was read from. A revision is `sha256:` followed by 64 lowercase hex
digits of the SHA-256 of the exact `config.json` bytes (not normalized JSON or
only `models.tasks`), or the literal `missing` when the file is absent. Any byte
change, including whitespace or unrelated settings, makes the revision stale; a
`missing` revision rejects a file that now exists, and an existing revision
rejects a file that was removed. A stale revision fails with `Stale task model
config revision` without replacing configuration: re-read, re-propose, and
re-approve rather than retrying. Malformed revisions, including `null` and empty
strings, fail closed. Omitting the field keeps the unconditional write. A write
to a missing file still seeds from the packaged `config.json.example`.
`configRevision` is the revision of the exact bytes written and can serve as the
next precondition.

Every writer call, conditional or not, holds an exclusive `config.json.lock`
sibling while it reads one snapshot, checks the revision, and atomically renames
a private temporary file into place. A held lock fails immediately with `Task
model config writer busy`; there are no waits or retries. The lock is never
broken automatically: after a crash, the error names the recorded owner and
reports when that process is no longer running, and you remove the lock only
after confirming that no writer is active. Each call removes only its own lock
and temporary file. This lock is advisory: it serializes cooperating writers
but cannot constrain a text editor or another process that ignores it. The
revision check detects changes made before the snapshot is read; it is not a
filesystem transaction against arbitrary external writers.

## Task routing

`task:<category>` values select subagent models; they are not slash commands and
do not change the parent model. Ordered authenticated candidate plans resolve
before launch. Ordinary nonpersistent runs can retry later candidates after
a safe launch failure or after a running child settles with a provider/agent error,
not after a completed negative task result. Uncertain resource creation,
command dispatch, or rollback blocks fallback because another attempt could
duplicate work. Persistent specialists do not
advance after a running-child error. This is not per-step routing; worktrees
use the first authenticated candidate only, without fallback retries.
Shortlists do not enforce reviewer independence. Cross-family independent
review requires a reviewer from a different model family than the author. For
ordinary review, prefer a different authenticated model family. When no other
authenticated model family is available, ordinary review may use a same-family
reviewer in a fresh standalone session. Disclose that this review is
context-isolated, not cross-family independent. Cross-family verification
must not use this fallback. Another route to the same family is not
independent review. Family is the independence boundary; project policy may
separately require a different provider. Run `/reload` (or start a new session)
after writing preferences.

## Persistent specialist limit

Set `persistent.maxAgents` to the maximum concurrently retained persistent specialists. It defaults to `3`; a persistent spawn at the cap is rejected before Rex creates a pane or workspace, and no specialist is evicted. Admission reserves capacity before resource acquisition, so overlapping launches count toward the cap even before their running rows appear. Reservations survive reload and transfer to the running specialist or are released when acquisition fails; quitting clears pending reservations.

## Delegation depth limit

Set `spawning.maxDepth` to the deepest child any launch may create. It must be a positive integer and defaults to `1`; unknown keys and other values fail configuration loading. A top-level parent session is depth `0`, and its children are depth `1`, so children are leaves by default. A session at depth `maxDepth` cannot launch anything.

The limit is enforced by the host on every child launch path: `subagent` (including `agent`, persistent, and `worktree` launches), `subagent_resume`, and `/subagent`. It applies to all roles, not only `self-spawn` ones. A refused launch returns an actionable error before Rex creates a pane or workspace. A `/worktree` handoff is not a child: it continues the parent's conversation at the parent's own depth, so it is allowed at the limit and refused only when the parent's depth is unknown.

Every launched child receives `PI_SUBAGENT_DEPTH=<parent depth + 1>`, and a `/worktree` handoff receives the parent's own depth, set explicitly in the launch command so a value left in the pane's shell never reaches the new session. A parent reads its own depth from that variable; an absent variable means a top-level session (depth `0`). A present value that is not a canonical non-negative integer (for example empty, `abc`, `-1`, or `1.5`) is treated as an unknown depth: the session is treated as already at the limit and every launch is refused until the variable is unset. It never resets the count to `0`. Run `/reload` after changing `spawning.maxDepth`.

## Outcome ledger

The parent appends one JSON line per model attempt to `$PI_CODING_AGENT_DIR/rex-agents/outcomes.jsonl`, defaulting to `~/.pi/agent/rex-agents/outcomes.jsonl`. A fallback model attempt gets its own line. Checked and unchecked runs are both recorded, so later routing tools have data from every run; nothing reads the file yet.

```json
{"v":1,"at":"2026-10-30T16:52:03.000Z","runId":"a1b2c3d4","attempt":1,"role":"worker","requestedModel":"task:implementation","category":"implementation","model":"provider/model-id","thinking":"medium","elapsedSec":252,"outcome":"completed","checkTries":2,"verdict":"rejected","checkHash":"sha256:9f2c…"}
```

`outcome` is `completed`, `failed`, `help`, or `cancelled`; `verdict` is one of the [accept-check verdicts](tools.md#accept-checks) (`none` without a check). `role` is absent for a bare launch, `category` appears only for a `task:<category>` model request, and `checkTries` and `checkHash` only when a check was requested. A line never holds the task text, the check output, environment values, or the check command: `checkHash` is the SHA-256 of the command, so runs of the same check group together without it being readable. The file is not rotated. A write failure never changes or delays a delivery.

This is not the persistent specialists' delivery ledger, which records task dispatch per session generation.

The ledger is on by default. Set top-level `outcomeLedger` to `false` to stop writing it; any value other than `true` or `false` fails configuration loading. Run `/reload` after changing it.

## Launch roster

The `subagent` tool injects coordination guidelines into the parent's system
prompt. One of them asks the parent, after the final launch of a group, to print
a markdown table with a header row (`| name | agent kind | role | model |
worktree |`), a separator row, and one row per child, writing `none` when a
child has no worktree. Markdown clients render it as a table, and terminals
still show readable pipe-separated rows.

Set `guidelines.launchRoster` to `false` to drop only that sentence. The rest
of the naming guidance, including `<task>-<role>[-n]` labels and using each name
in prompts, handoffs, and results, stays in the prompt. It defaults to `true`.
Any value other than `true` or `false`, and any other key under `guidelines`, is
a configuration error.

```json
{
  "guidelines": {
    "launchRoster": false
  }
}
```

The setting is read when the extension loads, so run `/reload` after changing
it.

## Deprecated `roles.bundled`

`roles.bundled` is deprecated and has no effect because this package ships no
roles. Existing `true` and `false` values are accepted so that current
configuration keeps loading; a parent session reports one warning per extension
load naming the file and asking you to remove the key. The extension never
rewrites the file. Other values remain configuration errors, as do unknown keys
under `roles`. Registered role packs are the entire package layer, and global and
project definitions keep their precedence over them.

## Task-model init events

Two versioned `pi.events` channels let another extension take part in
`/subagents-init` without importing this package. Both carry the invoking
command's live `ExtensionCommandContext`, so they are for trusted extensions in
the same process. The context is current only while the event is emitted.

The host emits the versioned task-model approval event while init
runs:

```typescript
type ApprovalRequest = {
  apiVersion: 1;
  brief: TaskModelBrief; // frozen: operatorPreferences, categories, configRevision, current, models (never empty)
  context: ExtensionCommandContext;
  offer(offer: { owner: string; open(): OpenResult }): "recorded" | "closed";
};
type OpenResult =
  | {
      kind: "ready";
      destination: { toolName: string; instructions: string };
      cancel(): void; // closes the flow this open created
    }
  | { kind: "blocked"; reason: string };
```

- Call `offer` synchronously, before the listener's first `await`. After `emit`
  returns, `offer` answers `"closed"` and records nothing.
- Offer whenever your extension owns task-model approval, even when it is busy,
  and refuse from `open`. `owner` is one printable token without spaces.
- The host opens nothing until collection ends. Two offers (even with the same
  owner) or an invalid offer stop init. With one offer, the host calls `open()`
  once, and it must return synchronously.
- `ready` must leave `toolName` active. Its `instructions` replace the host's
  writer instruction in the prompt the host sends.
- `ready` must include `cancel`. When the host does not hand the prompt to Pi
  (the tool is inactive, or `pi.sendUserMessage` throws), it calls `cancel()`
  once before reporting `not-started`. `cancel` must close only the flow that
  this `open` created, never a later one. A `cancel` that throws is reported
  with the outcome.
- A throw, a promise, an invalid result (including a missing `cancel`), or
  `blocked` stops init with a notice and no prompt. The host cannot undo what
  `open` changed before failing.
- Pi accepts the prompt asynchronously. It can still reject it after `start`
  reports `started`, for example when the selected model has no configured
  auth; the host refuses up front only when no model is selected. Pi delivers
  the prompt to `input` handlers (source `"extension"`) before that check and
  emits `before_agent_start` and `agent_start` only after it passes. An
  extension whose flow outlives one prompt should close it when other input or
  a run arrives before those events, so a later request cannot inherit it.
- Pi's event bus logs and swallows listener exceptions. A listener that throws
  before offering looks the same as no listener, so init uses the direct
  writer. An extension that guards the writer still refuses that write.

Another extension's command emits the versioned task-model start event
to start the same init:

```typescript
type StartRequest = {
  apiVersion: 1;
  context: ExtensionCommandContext;
  preferences: string; // ranking preferences, passed through as typed
  offer(offer: { owner: string; start(): InitOutcome }): "recorded" | "closed";
};
type InitOutcome =
  | { kind: "started"; destination: string }
  | { kind: "not-started"; reason: string };
```

The host offers synchronously as `Pi subagent extension` and starts nothing until the
emitter calls `start()`. Call it only when exactly one host offered. `start`
runs init with the request's context and returns synchronously; the emitter
shows a `not-started` reason. The host does not listen in subagent sessions
and unsubscribes at `session_shutdown`. Unsubscribe an approval listener there
too, as the role-pack bridge does.

## Supervision transport

On supported local filesystems, supervision uses file wake-ups plus one shared
4.8-second pane reconciliation. A wake-up only prompts fresh evidence
collection; it never establishes a result by itself. While any child's wait for
that check is parked, the coordinator's file watches stay referenced, so the
sidecar is still observed when the parent has no other event-loop work. The
reference is released when the wait settles, is aborted, or its child is
unregistered. With no parked wait, the watches stay unreferenced and do not
keep the process running. If the watcher
or shared pane inspection becomes unavailable, supervision quietly returns to
the legacy one-second polling cadence. No caller action is required.

Set `supervision.forcePolling` to `true` in the durable user `config.json` to
disable wake-ups and use that legacy cadence deliberately. Run `/reload` after
changing it. The live coordinator switches transport without replacing its
registrations or shared reconciliation timer. A parked wait releases its old
watch reference or polling timer before the next wait uses the new transport.

A coordinator retained from a version without live reconfiguration cannot apply
a changed mode safely. Reload reports an explicit restart requirement instead of
replacing that owner or ignoring the setting. Restore the previous setting and
reload to keep using that session, then let its children finish before restarting
Pi with the new setting. An unchanged mode still permits adoption across the
upgrade.

`subagents_list` reports the active transport mode (`wake+batch`,
`polling(forced)`, or `polling(fallback)`) and watcher count.

`supervision.hangWarningMinutes` defaults to `15`; set it to `0` to disable
no-progress advisories. For example, this keeps the default transport and sets
a 30-minute advisory budget:

```json
{
  "supervision": {
    "forcePolling": false,
    "hangWarningMinutes": 30
  }
}
```

While a child projects active or blocked, the parent compares durable session
JSONL and activity-snapshot updates against this budget. An advisory is warning-only, fires once per no-progress episode, and
never interrupts, kills, retries, or restarts a child. It identifies `blocked-tool` (an outstanding tool call may still complete),
`truncated-turn` (an observed `toolUse` stop with no tool call; its cause is unknown), or
`generic-no-progress` when neither condition is established, then
includes the session path and manual recovery options. Ordinary children can be
interrupted, cancelled with `subagent_cancel`, or, after termination, resumed or
newly spawned. Persistent
ordinary-pane specialists can be interrupted or stopped with `subagent_stop` and
replaced; they cannot be resumed. Managed-worktree children, including persistent
ones, retain their workspace and continue there only after the previous process
has exited; do not use `subagent_resume` or start a concurrent writer. Interactive children stay
quiet just as they do for stalled/recovered notices; their widget state still
updates. A later durable update clears the episode and sends the corresponding
recovered notice for non-interactive children.
`polling(fallback)` means at least one tracked child is using per-child polling;
other children can still use wake+batch.

A Linux manual benchmark on 2026-09-06 used isolated Rex panes held pending,
20-second windows, and the extension's completion/supervision seams. At 10
children across three rotated rounds, wake+batch averaged 2.20 CLI launches/s
versus 14.20 for forced polling (84.5% fewer); mean evidence-to-resolver
latency was 3.2 ms versus 449.0 ms, and the largest reconciliation probe gap
was 4.82 s. The benchmark measures `/proc` CPU ticks for the supervisor and
isolated Rex tree, not parent-model latency; raw samples are written to
`/tmp/issue29-bench/` by `test/bench/supervision-bench.mjs`.

## Pane placement

`panes.mode` accepts `"split"` (default), `"tab"`, or `"minimized"`. The default configuration is `{ "mode": "split", "direction": "right", "maxPerTab": 2, "minimizedBounds": [0.1, 0.1, 0.8, 0.8] }`. `panes.maxPerTab` must be an integer from 1 through 10; zero, fractions, values above 10, and non-numbers raise `invalidPaneConfig`. `panes.minimizedBounds` is an optional `[x, y, width, height]` array of window fractions for the floating layer restored from a minimized child; all values must be finite, width and height must be positive, and the rectangle must fit inside the window. It defaults to `[0.1, 0.1, 0.8, 0.8]` (centered, 80% of the window). The old `"grouped"` mode is invalid. `panes.direction` accepts `"right"` (default) or `"down"` for splits.

In an interactive parent session, `/panes-mode` switches between `split`, `tab`, and `minimized`; without an argument it opens a selector. `/panes-maxPerTab` accepts an integer from 1 through 10, or opens a 1-10 selector when called without an argument. Both commands atomically update `panes` in the durable config, preserve every other setting, and apply to new launches immediately.

The native `placement` argument on `subagent` and `subagent_resume` overrides `panes.mode` for that call. `"split"` opens a block beside the parent in its current Rex window while capacity remains, then overflows into a new tab. `"tab"` always opens a new Rex window. `"minimized"` creates a floating layer in the parent window and immediately minimizes it to the client tray; its block keeps running and is restored by the client at `panes.minimizedBounds`. Worktree children always open a new tab and do not consume split capacity. Resume uses the saved session cwd with the same placement policy.

The kernel counts only this parent's registered child blocks that `provider.listSurfaces()` confirms are still live in the parent block's current window and are not minimized. Other parents' children, user-created blocks, worktree blocks, minimized blocks, closed blocks and children in other windows do not occupy these slots. Closing a split child releases a slot on the next inventory read. The limit is independent of `persistent.maxAgents`.

One parent-owned queue serializes inspection and surface creation. A successful split reserves its slot until the child enters the registry, so overlapping launches cannot exceed the cap during Pi startup. A create with an uncertain reply and an observed block ID retains that reservation until registration or confirmed disappearance. A queued acquisition checks cancellation before issuing a mutation. If the parent window cannot be verified, the launch uses a new tab.

`/reload` adopts both the existing registry and the reservation queue; it does not reset capacity. A full process restart does not adopt another process's children. IDs establish ownership, never labels. Placement preserves focus and does not move existing blocks. See [Rex surface placement](rex-surface.md) for the kernel boundary.

Run `/reload` after changing role or model settings. The pane commands apply to new launches immediately and do not require a reload.

## Model resolution and fallback

`models.default` sets the model for subagents that do not specify a model.
`models.agents` sets per-agent defaults, keyed by the agent name passed to
`subagent({ agent: ... })`. Explicit `model` tool arguments take precedence,
followed by agent frontmatter, per-agent config, the global default, and finally
the parent model. Model values must be exact authenticated `provider/model-id`
references. A value can contain an ordered comma-separated fallback list, for
example `provider/preferred, provider/fallback`. The tool argument also accepts
`task:<category>` as its complete value (not in a list), for configured
`coding`, `review`, `recon`, `qa`, `architecture`, or `docs` preferences. The extension validates every
candidate before launch, then launches later candidates only after a safe launch failure or the selected
child settles with a provider/agent error. An uncertain creation or dispatch
blocks fallback and retains any acquired owner until exit is confirmed. Pi owns any automatic transient
retrying inside that child; the extension does not infer retry counts or
permanence from the error text. A later candidate that launches after a parent
`/reload`, `/new`, `/resume`, or `/fork` uses the live parent session for its
artifacts and lineage, as completion delivery does. Its candidate list and
thinking level stay those of the original call. The original parent directory
and process directory remain the bases for directory resolution. Role files are
read again for each attempt, so a changed role `cwd` can redirect a fallback
when the tool call did not specify `cwd`. If no live parent context is available,
that candidate fails without launching. A completed child result, including a
negative task result, never switches models. Completion metadata reports the
requested candidate, every attempted candidate, the model actually used, and
each raw model failure in attempt order when fallbacks are tried.

When the session scopes models (`--models` or the `enabledModels` setting), the
guideline catalog lists only the scoped set, under the same entry cap as
the authenticated catalog, and task-category shortlists keep only scoped
candidates. Models outside the scope never appear in the catalog, even when they
are authenticated and visible to the model registry. Spawn-time model selection
is scoped the same way: exact `provider/model-id` references, `task:` category
expansion, and fallback re-resolution all resolve against the session's scoped
set. In a scoped session the extension also enforces the following, each
before it creates a pane, worktree or session file:

- An omitted `model` inherits the parent model only when that model is in the
  scope. Otherwise the ordinary, persistent or worktree `subagent` call, and
  `/worktree`, fail with an error that names the parent model and the scope.
  To launch, pass an in-scope `model` or `task:` category, set `model` in the
  role definition, or switch the parent model with `/model`.
- `subagent_resume` reads the stored model of the session being resumed as
  Pi's `buildSessionContext()` restores it (on the active branch, the later of
  the latest `model_change` and the latest assistant response) and refuses when
  that model is missing or out of scope. Otherwise it pins that model with
  `--model` so Pi cannot restore a different one.
- A fallback candidate is checked again against the live scope just before its
  attempt. A candidate the scope no longer contains is skipped and recorded in
  the fallback failures with the reason. Candidate order and thinking level
  stay unchanged.
- Fresh, persistent, worktree, `/worktree` and resumed children receive the
  parent's resolved scope as an exact allowlist in
  `PI_SUBAGENT_MODEL_SCOPE` (a JSON array of `provider/model-id` refs), so
  nested delegation stays scoped. The child's own routing intersects its
  scope with that allowlist. Pi reads `--models` as patterns (globs, partial
  ids, `:thinking` suffixes), so a child's Pi can resolve a parent ref such
  as `p/foo:free` to a different model `p/foo`; the allowlist keeps that
  model out of scope. When none of the refs resolves in the child's catalog,
  the child stays scoped to the allowlist rather than becoming unscoped, and
  a malformed allowlist leaves nothing in scope. The children also receive
  the scope as Pi's `--models provider/model-id,…`, only as a hint for Pi's
  own model cycling. A scope ref that contains a comma cannot be passed
  this way, and the launch fails.

The extension checks only exact `provider/model-id` membership in the scope Pi
resolved for the parent, narrowed by any allowlist the parent inherited. When
the session is unscoped (no `--models`, `enabledModels` absent or empty, and no
inherited allowlist), none of these checks apply, children get no `--models`,
and `PI_SUBAGENT_MODEL_SCOPE` is set empty. The scope
limits only what this extension launches. It does not stop someone working in a
child pane from switching models with Pi's own `/model` command.

A catalog-listed model and configured authentication do not prove that the
active provider account can use that model. Providers may reject an account /
model combination only when the request is made. The completion preserves each
raw provider reason with its model and suggests checking account access,
spawning a new subagent with a supported model, or choosing an appropriate
configured fallback. `subagent_resume` does not select a model and should be
used only after the session's stored model is usable; in a scoped session it
keeps the stored model only when that model is in scope, as described above. Persistent session sidecars fail closed: v1 does not resume or revive a stopped or crashed specialist; retain its evidence and spawn a new specialist. The completion does not
claim a permanent failure or a retry count that Pi has not exposed. Reliable
structured permanence and retry counts require an upstream Pi/ExtensionAPI
diagnostics seam for final provider errors and retry outcomes.
