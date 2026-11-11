[English](configuration.md) | **简体中文**

# Configuration

本页是持久化 `config.json` 设置、任务模型偏好，以及 `/subagents-init` 期间其他扩展所使用事件的参考。简短介绍见 README 中的[配置说明](../README.zh-CN.md)。

## Configuration file

持久化用户配置位于 `$PI_CODING_AGENT_DIR/rex-agents/config.json`，默认是 `~/.pi/agent/rex-agents/config.json`。宿主使用 Pi 公开的 agent 目录解析器。`PI_CODING_AGENT_DIR` 为空时使用默认值，开头的 `~` 按 Pi 中的方式展开。该文件不会从已安装包的根目录读取，因此 npm 与 git 包升级不会覆盖它。复制已安装包的 `config.json.example` 可创建它，或运行 `/subagents-init` 来生成并起草模型任务偏好。没有 Rex 配置时，panes 默认使用 split、right、`maxPerTab: 2`，以及居中的 80% 最小化边界。

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

如果 `config.json` 缺失，status、role、pane、spawning、persistent-specialist、supervision、guidelines 和 outcome-ledger 设置都会回退到 `config.json.example`。模型路由不读取示例文件：在真实 `config.json` 存在之前，不会应用任何模型覆盖。

`config.json` 是 Pi agent 目录下的持久化用户状态，在扩展启动时加载。修改后运行 `/reload`。包根目录中的 `config.json` 会被忽略；请手动迁移，或重新运行 `/subagents-init`。

## Context-compression tools

每个新建或恢复的子代理、持久专家和交互式 worktree handoff，都会在首轮之前自动启用已安装的上下文压缩工具，即使 `tools` 列表受限（例如 `read,bash`）。`billion-context` provider 通过其注册的 `compress` 工具被检测到；其注册的 `compress`、`decompress`、`search_context`、`acp_status` 和可选的 `acp_rule` 工具会被启用。显式的 `deny-tools` 条目优先。父代理从其完整的已注册工具列表中发现这些工具，并将它们追加到启动 `--tools` 列表，同时保留调用方已保存的工具策略。Pi 按 `--tools` 过滤工具注册，因此子代理侧激活无法恢复被省略的工具。父代理和子代理都要加载压缩 provider；修改启动代码或扩展后，在父代理中运行 `/reload`。未安装 provider 时，不会更改任何工具或压缩设置：Pi 使用其原生自动压缩。其他 provider 应放在 `maestro/adapters/pi/context-tools.ts`。

## Child session evidence

内核通过 `--name` 传递每个子代理的显示名称，因此 Pi 的根 OSC 记录可以识别该子代理。无需额外配置。子代理会在其会话旁发布一个带版本的结果 JSON；启动包装器在进程退出后写入 `.exitcode`。父代理会校验结果中的 subagent、task 和 generation 身份，并在不可用时回退到会话 JSONL。持久会话的收件箱变更通过目录监听唤醒，并带有 5 秒协调；投递后可以立即发送下一个任务。参见[返回契约](delegation-outcome-contract.md#rex-runtime-evidence)。

## Model preferences

可复制的示例与模型无关，因此无需特定 provider 的凭据即可使用。要配置模型，请用已认证模型目录中的精确 ID 替换空节：

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

`models.tasks` 候选是按顺序排列的精确已认证 ID。只能在 `subagent` 工具的 `model` 参数中使用 `task:<category>`；它在 frontmatter 或模型默认值中无效。跨家族独立审查要求审查者来自与作者不同的模型家族。对于普通审查，优先选择不同的已认证模型家族。当没有其他已认证模型家族可用时，普通审查可以在全新的独立会话中使用同家族审查者。应披露该审查是上下文隔离的，而非跨家族独立审查。跨家族验证不得使用此回退。若已知作者家族，使用精确的已认证候选清单 `provider/model-id`；`task:review` 无法确立独立性。家族是独立性边界；项目策略可能另行要求不同的 provider。这是指导，而非扩展的强制约束。

## Draft task-model preferences

运行 `/subagents-init [preferences]` 以起草任务模型偏好。例如：

```text
/subagents-init Prefer capability over price for implementation; keep recon inexpensive
```

该命令会提供**活动会话注册表中所有可用模型**的脱敏快照，包括扩展注册的 provider、精确 ID、显示名称、报告的 base token 成本、上下文/输出限制、输入模态、推理能力，以及支持的思考级别。当 Pi 暴露时，会包含安全的扩展注册和认证来源元数据；凭据、端点和原始认证标签不会包含在内。已配置认证不能证明账户访问权限或请求成功。缺失成本保持未知；报告为零不代表免费，OAuth 也不确立订阅计费。简报使用紧凑 JSON，不截断模型，并报告模型数量和 JSON 字符数（不是 token 估算）；大型目录仍会消耗上下文。这是当前的同步快照：如果动态 provider 的初始目录刷新尚未完成，它可能缺席。init 不会刷新 provider，也不会探测网络可用性。简报还包含 `configRevision`，即提供已保存偏好的精确配置字节的修订号。当有回合正在运行或有消息排队时，init 不会启动；注册表为空时以通知结束，而不是提示。这两种情况都不会写入任何内容。

起草会考虑当前已保存的 task、default 和 per-agent 偏好。可选命令参数设置排序偏好。否则，它偏向为实质性工作选择能力，为有界侦察和测试执行选择效率。类别描述的是工作，而不是复杂度层级：

| 类别 | 工作 |
| --- | --- |
| `coding` | 实现工作者 |
| `review` | 代码审查者 |
| `recon` | 侦察员 |
| `qa` | 软件与测试运行者 |
| `architecture` | 规划与诊断 |
| `docs` | 文档工作者 |

Init 会要求 agent 使用第一手来源研究各 provider 的主要候选，披露不确定性和值得注意的排除项，并避免不同路由中出现重复的上游模型，除非有意的冗余已得到解释。显示名称有助于识别候选，但与别名一样，不能证明上游等价；仍需研究。仅凭价格或上下文大小不是质量证据。不会运行实时模型探测。

提案会附带排序 `basis`。当搜索不可用或没有产生可用证据时，它是 `{"kind":"registry-only"}`。只有在提供本次运行中查阅的 http(s) `sources`、每个来源对排序产生的 `influence`，以及剩余的 `uncertainty` 时，它才是 `{"kind":"research"}`。代码检查 basis 的结构，而不是来源是否被阅读，因此 basis 会标记为按提交内容记录且未经核实。

init 运行期间，它会发出带版本的任务模型批准事件。若没有 offer，提示会引导模型使用 `subagents_write_task_models` 并带上 `expectedConfigRevision`。当恰好一个已加载扩展提供 offer 时，init 会打开该扩展的流程，该扩展的指令会替换写入器指令；随后由该扩展负责批准和写入。两个或更多 offer，或一个无效 offer，会在任何扩展打开或发送提示之前终止 init。一旦记录了 offer，拒绝或失败也会终止 init：它绝不会回退到直接写入器。参见[任务模型初始化事件](#task-model-init-events)。

## Task-model writer

写入器会校验并原子地替换 `models.tasks` 和 `tasksMeta`，同时保留无关设置。其工具 schema 接受只提供部分类别的非空输入（省略的类别会被移除），拒绝空的 `tasks: {}` 输入，并在去除首尾空白后拒绝同一类别内的完全重复引用；ID 仍然区分大小写。其结果包含规范化后保存的 `tasks`、`tasksMeta`、`configPath`、`missingCategories` 和 `configRevision`。Init 会请求全部六个类别，并基于该保存结果（而非未保存的草稿）生成前后对比表，还必须解释缺失的类别或更改过的选择。

可选的 `basis` 必须与 `tasksMeta.method` 具有相同的 kind。研究型 basis 至少需要一个来源，其 http(s) URL 具有主机名且 `influence` 非空，另需非空的 `uncertainty`。写入器在写入前校验它，在结果中返回它，但绝不会保存它；只有 `tasksMeta.method` 会持久化。不带 `basis` 的调用（包括研究调用）保留先前的契约。

可选的 `expectedConfigRevision` 使写入以提案所读取的配置为条件。修订号是 `sha256:` 后跟精确 `config.json` 字节（不是规范化 JSON，也不只是 `models.tasks`）的 SHA-256 的 64 个小写十六进制数字；文件缺失时为字面量 `missing`。任何字节变化（包括空白或无关设置）都会使修订号过期；`missing` 修订号会拒绝现在已存在的文件，而现有修订号会拒绝已被删除的文件。过期的修订号会以 `Stale task model config revision` 失败而不替换配置：应重新读取、重新提议并重新批准，而不是重试。格式错误的修订号（包括 `null` 和空字符串）会失败关闭。省略该字段则保留无条件写入。对缺失文件的写入仍会从打包的 `config.json.example` 初始化。`configRevision` 是实际写入字节的修订号，可作为下一个前置条件。

每个写入器调用（无论是否带条件）都会在读取一个快照、检查修订号并将私有临时文件原子重命名到位期间，持有同级独占锁 `config.json.lock`。已持有的锁会立即以 `Task model config writer busy` 失败；不等待、不重试。锁绝不会被自动打破：崩溃后，错误会指出记录的 owner，并报告该进程何时不再运行；只有在确认没有写入器活动后，才应移除锁。每次调用只移除自己的锁和临时文件。该锁是建议性的：它串行化协作的写入器，但无法约束文本编辑器或其他忽略它的进程。修订号检查能发现读取快照之前所做的更改；它不是针对任意外部写入者的文件系统事务。

## Task routing

`task:<category>` 值用于选择子代理模型；它们不是斜杠命令，也不会更改父模型。有序的已认证候选方案会在启动前解析。普通非持久化运行可以在安全启动失败后，或在运行中的子代理以 provider/agent 错误结束后，重试后续候选；已完成的否定任务结果之后不会重试。不确定的资源创建、命令分派或回滚会阻止回退，因为另一次尝试可能重复工作。持久化专家在运行中子代理出错后不会推进到后续候选。这不是逐步路由；worktree 只使用第一个已认证候选，不进行回退重试。候选清单不会强制保证审查者独立性。跨家族独立审查要求审查者来自与作者不同的模型家族。对于普通审查，优先选择不同的已认证模型家族。当没有其他已认证模型家族可用时，普通审查可以在全新的独立会话中使用同家族审查者。应披露该审查是上下文隔离的，而非跨家族独立审查。跨家族验证不得使用此回退。通往同一家族的另一条路由并不是独立审查。家族是独立性边界；项目策略可能另行要求不同的 provider。写入偏好后运行 `/reload`（或启动新会话）。

## Persistent specialist limit

将 `persistent.maxAgents` 设为同时保留的持久专家数量上限。默认值为 `3`；达到上限时，持久专家 spawn 会在 Rex 创建 pane 或 workspace 之前被拒绝，且不会驱逐任何专家。准入会在获取资源之前预留容量，因此重叠启动即使其运行行尚未出现，也会计入上限。预留可在 reload 后继续存在，并转移给正在运行的专家；若获取失败则释放；退出会清除待处理预留。

## Delegation depth limit

将 `spawning.maxDepth` 设为任何启动可创建的最深子代理。它必须是正整数，默认值为 `1`；未知键和其他值会导致配置加载失败。顶层父会话深度为 `0`，其子代理为深度 `1`，因此子代理默认是叶子。处于深度 `maxDepth` 的会话不能启动任何内容。

该限制由宿主在每条子代理启动路径上强制执行：`subagent`（包括 `agent`、persistent 和 `worktree` 启动）、`subagent_resume` 和 `/subagent`。它适用于所有角色，而不仅是 `self-spawn` 角色。被拒绝的启动会在 Rex 创建 pane 或 workspace 之前返回可操作的错误。`/worktree` handoff 不是子代理：它在父代理自身深度继续父会话，因此在达到上限时仍允许，仅当父深度未知时才被拒绝。

每个启动的子代理都会收到 `PI_SUBAGENT_DEPTH=<parent depth + 1>`，而 `/worktree` handoff 会收到父代理自己的深度，该值在启动命令中显式设置，因此遗留在 pane shell 中的值永远不会到达新会话。父代理从该变量读取自身深度；变量缺失表示顶层会话（深度 `0`）。存在但不是规范非负整数的值（例如空、`abc`、`-1` 或 `1.5`）会被视为未知深度：会话被视为已达到上限，在取消设置该变量之前，每次启动都会被拒绝。它绝不会把计数重置为 `0`。修改 `spawning.maxDepth` 后运行 `/reload`。

## Outcome ledger

父代理会将每次模型尝试的一行 JSON 追加到 `$PI_CODING_AGENT_DIR/rex-agents/outcomes.jsonl`，默认是 `~/.pi/agent/rex-agents/outcomes.jsonl`。回退模型尝试会有自己的行。已检查和未检查的运行都会被记录，因此后续路由工具可以从每次运行获得数据；目前还没有任何东西读取该文件。

```json
{"v":1,"at":"2026-10-30T16:52:03.000Z","runId":"a1b2c3d4","attempt":1,"role":"worker","requestedModel":"task:implementation","category":"implementation","model":"provider/model-id","thinking":"medium","elapsedSec":252,"outcome":"completed","checkTries":2,"verdict":"rejected","checkHash":"sha256:9f2c…"}
```

`outcome` 为 `completed`、`failed`、`help` 或 `cancelled`；`verdict` 是 [accept-check 判定](tools.zh-CN.md#accept-checks)之一（没有检查时为 `none`）。裸启动时 `role` 缺失，`category` 仅在 `task:<category>` 模型请求时出现，`checkTries` 和 `checkHash` 仅在请求了检查时出现。一行永远不会包含任务文本、检查输出、环境值或检查命令：`checkHash` 是命令的 SHA-256，因此对同一检查的多次运行可以归组，而检查内容不可读。该文件不会轮转。写入失败永远不会改变或延迟投递。

这不是持久专家的投递账本，后者按会话 generation 记录任务分派。

账本默认开启。将顶层 `outcomeLedger` 设为 `false` 可停止写入；任何不是 `true` 或 `false` 的值都会导致配置加载失败。修改后运行 `/reload`。

## Launch roster

`subagent` 工具会向父代理的系统提示注入协调指南。其中一条要求父代理在一组中的最后一次启动后，打印一个 Markdown 表格，包含表头行（`| name | agent kind | role | model | worktree |`）、分隔行，以及每个子代理一行；子代理没有 worktree 时写 `none`。Markdown 客户端会将其渲染为表格，终端仍会显示可读的竖线分隔行。

将 `guidelines.launchRoster` 设为 `false` 只会删除该句。其余命名指南，包括 `<task>-<role>[-n]` 标签以及在提示、handoff 和结果中使用每个名称，仍保留在提示中。默认值为 `true`。任何不是 `true` 或 `false` 的值，以及 `guidelines` 下的任何其他键，都会导致配置错误。

```json
{
  "guidelines": {
    "launchRoster": false
  }
}
```

该设置会在扩展加载时读取，因此修改后运行 `/reload`。

## Deprecated `roles.bundled`

`roles.bundled` 已弃用且无效，因为本包不附带任何角色。现有的 `true` 和 `false` 值会被接受，以便当前配置继续加载；父会话在每次扩展加载时报告一条警告，指明文件并要求你移除该键。扩展绝不会重写该文件。其他值仍是配置错误，`roles` 下的未知键也是如此。已注册的角色包构成整个包层，而全局和项目定义保持优先于它们。

## Task-model init events

两个带版本的 `pi.events` 通道让另一个扩展无需导入本包即可参与 `/subagents-init`。两者都携带调用命令的实时 `ExtensionCommandContext`，因此适用于同一进程中受信任的扩展。上下文仅在事件发出期间是当前的。

init 运行期间，宿主会发出带版本的任务模型批准事件：

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

- 在监听器的第一个 `await` 之前同步调用 `offer`。`emit` 返回后，`offer` 会回答 `"closed"` 且不记录任何内容。
- 只要你的扩展负责任务模型批准，即使它正忙也应提供 offer，并在 `open` 中拒绝。`owner` 是一个可打印且不含空格的 token。
- 在收集结束之前，宿主不会打开任何内容。两个 offer（即使 owner 相同）或无效 offer 会终止 init。只有一个 offer 时，宿主会调用一次 `open()`，它必须同步返回。
- `ready` 必须让 `toolName` 保持活动。其 `instructions` 会替换宿主发送的提示中的写入器指令。
- `ready` 必须包含 `cancel`。当宿主没有把提示交给 Pi（工具不活动，或 `pi.sendUserMessage` 抛出异常）时，它会在报告 `not-started` 之前调用一次 `cancel()`。`cancel` 只能关闭本次 `open` 创建的流程，绝不能关闭之后的流程。抛出异常的 `cancel` 会随结果一并报告。
- 抛出异常、返回 promise、无效结果（包括缺少 `cancel`）或 `blocked` 都会以通知终止 init，且不发送提示。宿主无法撤销 `open` 在失败前所做的更改。
- Pi 异步接受提示。它仍可能在 `start` 报告 `started` 后拒绝该提示，例如当选定的模型没有配置认证时；宿主只在没有选择模型时才会预先拒绝。Pi 会在该检查之前将提示投递给 `input` 处理器（来源 `"extension"`），并且只有在通过后才发出 `before_agent_start` 和 `agent_start`。如果扩展的流程生命周期超过单个提示，应在其他输入或一次运行在这些事件之前到达时关闭它，以免后续请求继承该流程。
- Pi 的事件总线会记录并吞掉监听器异常。提供 offer 之前抛出异常的监听器看起来与没有监听器相同，因此 init 会使用直接写入器。守护写入器的扩展仍会拒绝该写入。

另一个扩展的命令会发出带版本的任务模型启动事件，以启动同样的 init：

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

宿主会以 `Pi subagent extension` 同步提供 offer，直到发出方调用 `start()` 之前不会启动任何内容。仅当恰好有一个宿主提供 offer 时才调用它。`start` 使用请求的上下文运行 init 并同步返回；发出方会显示 `not-started` 原因。宿主不会在子代理会话中监听，并会在 `session_shutdown` 时取消订阅。批准监听器也应在那里取消订阅，正如 role-pack bridge 所做的那样。

## Supervision transport

在受支持的本地文件系统上，监督使用文件唤醒加上一个共享的 4.8 秒 pane 协调。唤醒只会促使收集新证据；它本身绝不会确立结果。当任何子代理对该检查的等待被挂起时，协调器的文件监听保持被引用，因此即使父代理没有其他事件循环工作，sidecar 仍会被观察到。当等待结束、被中止或其子代理被注销时，引用会被释放。没有挂起的等待时，监听保持未引用，不会阻止进程运行。如果 watcher 或共享 pane 检查变得不可用，监督会静默回退到旧的一秒轮询节奏。调用方无需采取任何操作。

在持久化用户 `config.json` 中把 `supervision.forcePolling` 设为 `true`，可禁用唤醒并有意使用该旧节奏。修改后运行 `/reload`。活动协调器会切换传输方式，但不会替换其注册或共享协调计时器。挂起的等待会在下一次等待使用新传输之前释放其旧监听引用或轮询计时器。

从尚不支持实时重配置的版本沿用下来的协调器无法安全地应用已更改的模式。Reload 会报告明确的重新启动要求，而不是替换该 owner 或忽略设置。恢复之前的设置并 reload 以继续使用该会话，然后在其子代理完成后用新设置重新启动 Pi。未更改的模式仍允许跨升级接管。

`subagents_list` 报告活动传输模式（`wake+batch`、`polling(forced)` 或 `polling(fallback)`）和 watcher 数量。

`supervision.hangWarningMinutes` 默认值为 `15`；将其设为 `0` 可禁用无进展建议。例如，以下配置保留默认传输并设置 30 分钟的建议预算：

```json
{
  "supervision": {
    "forcePolling": false,
    "hangWarningMinutes": 30
  }
}
```

当子代理报告为活动或阻塞状态时，父代理会将持久化会话 JSONL 和活动快照更新与该预算进行比较。建议仅作警告，每个无进展事件触发一次，绝不会中断、杀死、重试或重新启动子代理。它会识别 `blocked-tool`（未完成的工具调用仍可能完成）、`truncated-turn`（观察到 `toolUse` 停止但没有工具调用；原因未知），或在两种情况均未确立时识别 `generic-no-progress`，然后包含会话路径和手动恢复选项。普通子代理可以被中断、用 `subagent_cancel` 取消，或在终止后恢复或重新启动。普通 pane 中的持久专家可以用 `subagent_stop` 中断或停止并替换；它们无法恢复。受管 worktree 子代理（包括持久专家）会保留其 workspace，并且只有在前一个进程退出后才在那里继续；不要使用 `subagent_resume` 或启动并发写入者。交互式子代理会像对待停滞/恢复通知一样保持安静；其 widget 状态仍会更新。后续持久化更新会清除该事件，并为非交互式子代理发送相应的已恢复通知。`polling(fallback)` 表示至少有一个被跟踪的子代理正在使用逐子代理轮询；其他子代理仍可使用 wake+batch。

2026-09-06 的一项 Linux 手动基准测试使用了保持挂起的隔离 Rex pane、20 秒窗口以及扩展的完成/监督接缝。在三轮轮换、每轮 10 个子代理的情况下，wake+batch 平均为 2.20 次 CLI 启动/秒，而强制轮询为 14.20 次（减少 84.5%）；从证据到 resolver 的平均延迟为 3.2 ms，强制轮询为 449.0 ms，最大协调探针间隔为 4.82 s。该基准测量 supervisor 和隔离 Rex 树的 `/proc` CPU ticks，而非父模型延迟；原始样本由 `test/bench/supervision-bench.mjs` 写入 `/tmp/issue29-bench/`。

## Pane placement

`panes.mode` 接受 `"split"`（默认）、`"tab"` 或 `"minimized"`。默认配置为 `{ "mode": "split", "direction": "right", "maxPerTab": 2, "minimizedBounds": [0.1, 0.1, 0.8, 0.8] }`。`panes.maxPerTab` 必须是 1 到 10 的整数；零、小数、大于 10 的值和非数字会引发 `invalidPaneConfig`。`panes.minimizedBounds` 是可选的 `[x, y, width, height]` 数组，表示从最小化子代理恢复的浮动层的窗口比例；所有值必须有限，宽度和高度必须为正，且矩形必须位于窗口内。它默认是 `[0.1, 0.1, 0.8, 0.8]`（居中，占窗口 80%）。旧的 `"grouped"` 模式无效。`panes.direction` 对 split 接受 `"right"`（默认）或 `"down"`。

在交互式父会话中，`/panes-mode` 在 `split`、`tab` 和 `minimized` 之间切换；无参数时打开选择器。`/panes-maxPerTab` 接受 1 到 10 的整数，或无参数调用时打开 1-10 选择器。两个命令都会原子地更新持久化配置中的 `panes`，保留所有其他设置，并立即应用于新启动。

`subagent` 和 `subagent_resume` 上的原生 `placement` 参数会为该调用覆盖 `panes.mode`。`"split"` 在容量允许时于当前 Rex 窗口中父代理旁边打开一个 block，随后溢出到新 tab。`"tab"` 总是打开新的 Rex 窗口。`"minimized"` 在父窗口中创建浮动层并立即最小化到客户端托盘；其 block 继续运行，并由客户端在 `panes.minimizedBounds` 处恢复。Worktree 子代理总是打开新 tab，且不消耗 split 容量。恢复使用保存的会话 cwd 和相同的放置策略。

内核只统计此父代理已注册、且 `provider.listSurfaces()` 确认仍在父 block 当前窗口中活动且未最小化的子 block。其他父代理的子代理、用户创建的 block、worktree block、最小化的 block、已关闭的 block 以及其他窗口中的子代理不占用这些槽位。关闭 split 子代理会在下一次读取清单时释放一个槽位。该限制独立于 `persistent.maxAgents`。

一个父代理拥有的队列会串行化检查和 surface 创建。成功的 split 会保留其槽位，直到子代理进入注册表，因此重叠启动在 Pi 启动期间无法超过上限。具有不确定回复但观察到 block ID 的创建会保留该预留，直到注册或确认消失。排队的获取会在发出变更之前检查取消。如果无法验证父窗口，启动会使用新 tab。

`/reload` 会同时接管现有注册表和预留队列；它不会重置容量。完整进程重启不会接管另一个进程的子代理。ID 确立所有权，绝不由标签确立。放置会保留焦点，并且不会移动现有 block。内核边界参见 [Rex surface 放置](rex-surface.md)。

修改角色或模型设置后运行 `/reload`。pane 命令会立即应用于新启动，无需 reload。

## Model resolution and fallback

`models.default` 为未指定模型的子代理设置模型。`models.agents` 设置按 agent 的默认值，以传递给 `subagent({ agent: ... })` 的 agent 名称为键。显式 `model` 工具参数优先，其次是 agent frontmatter、按 agent 配置、全局默认值，最后是父模型。模型值必须是精确的已认证 `provider/model-id` 引用。值可以包含按顺序的逗号分隔回退列表，例如 `provider/preferred, provider/fallback`。工具参数也接受 `task:<category>` 作为其完整值（不能放在列表中），用于已配置的 `coding`、`review`、`recon`、`qa`、`architecture` 或 `docs` 偏好。扩展会在启动前校验每个候选，然后仅在安全启动失败或选定子代理以 provider/agent 错误结束后才启动后续候选。不确定的创建或分派会阻止回退，并保留任何已获取的 owner，直到确认退出。Pi 负责该子代理内部的自动瞬时重试；扩展不会从错误文本推断重试次数或永久性。在父代理 `/reload`、`/new`、`/resume` 或 `/fork` 之后启动的后续候选会使用实时父会话作为其工件和谱系，与完成投递一样。其候选列表和 thinking 级别保持原始调用的值。原始父目录和进程目录仍是目录解析的基础。每次尝试都会重新读取角色文件，因此当工具调用未指定 `cwd` 时，更改后的角色 `cwd` 可以重定向回退。如果没有可用的实时父上下文，该候选会失败而不启动。已完成的子代理结果（包括否定任务结果）绝不会切换模型。回退尝试时，完成元数据报告请求的候选、每个尝试过的候选、实际使用的模型，以及按尝试顺序的每个原始模型失败。

当会话限制模型范围（`--models` 或 `enabledModels` 设置）时，指南目录只列出范围内的集合，条目上限与已认证目录相同，任务类别候选清单只保留范围内的候选。范围外的模型绝不会出现在目录中，即使它们已认证且对模型注册表可见。启动时的模型选择也以相同方式受范围限制：精确 `provider/model-id` 引用、`task:` 类别展开和回退重解析都针对会话的范围集合进行。在受限会话中，扩展还会在创建 pane、worktree 或会话文件之前强制执行以下各项：

- 省略 `model` 时，仅当父模型在范围内才会继承父模型。否则普通、持久化或 worktree 的 `subagent` 调用以及 `/worktree` 会失败，并在错误中指明父模型和范围。要启动，请传入范围内的 `model` 或 `task:` 类别，在角色定义中设置 `model`，或用 `/model` 切换父模型。
- `subagent_resume` 读取要恢复会话的已存储模型，方式与 Pi 的 `buildSessionContext()` 恢复它相同（在活动分支上，取最新的 `model_change` 和最新 assistant 响应中较晚者），并在该模型缺失或超出范围时拒绝。否则它用 `--model` 固定该模型，以便 Pi 无法恢复不同的模型。
- 回退候选会在其尝试之前再次对照实时范围检查。范围不再包含的候选会被跳过，并以原因记录在回退失败中。候选顺序和 thinking 级别保持不变。
- 新建、持久化、worktree、`/worktree` 和恢复的子代理会以精确允许列表的形式在 `PI_SUBAGENT_MODEL_SCOPE`（`provider/model-id` 引用的 JSON 数组）中接收父代理所解析出的范围，因此嵌套委派仍受范围限制。子代理自身的路由会将其范围与该允许列表相交。Pi 将 `--models` 读取为模式（glob、部分 ID、`:thinking` 后缀），因此子代理的 Pi 可能将父引用如 `p/foo:free` 解析为不同的模型 `p/foo`；允许列表会使该模型保持在范围之外。当子代理目录中没有任何引用可解析时，子代理会保持受允许列表限制，而不会变得无范围；格式错误的允许列表会使范围为空。子代理还会以 Pi 的 `--models provider/model-id,…` 形式接收范围，仅作为 Pi 自身模型循环的提示。包含逗号的范围引用无法以这种方式传递，启动会失败。

扩展仅检查精确 `provider/model-id` 是否属于 Pi 为父代理所解析的范围，并受父代理继承的任何允许列表收窄。当会话无范围限制（没有 `--models`、`enabledModels` 缺失或为空，且没有继承的允许列表）时，这些检查均不适用，子代理不会收到 `--models`，`PI_SUBAGENT_MODEL_SCOPE` 设置为空。范围仅限制此扩展启动的内容。它不会阻止在子代理 pane 中工作的人使用 Pi 自己的 `/model` 命令切换模型。

目录中列出的模型和已配置认证不能证明活动 provider 账户可以使用该模型。Provider 可能仅在发出请求时才拒绝某个账户/模型组合。完成信息会保留每个原始 provider 原因及其模型，并建议检查账户访问权限、使用受支持的模型启动新的子代理，或选择适当的已配置回退。`subagent_resume` 不选择模型，应仅在会话的已存储模型可用后使用；在受限会话中，只有当该模型在范围内时才会保留已存储模型，如上所述。持久会话的 sidecar 采用 fail-closed 策略：v1 不会恢复或复活已停止或崩溃的专家；保留其证据并启动新的专家。完成信息不会声称 Pi 未暴露的永久失败或重试次数。可靠的结构化永久性和重试次数需要上游 Pi/ExtensionAPI 诊断接缝，以处理最终 provider 错误和重试结果。
