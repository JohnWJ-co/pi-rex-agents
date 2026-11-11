[English](worktree-subagents.md) | **简体中文**

# Worktree subagents

本指南是使用 `Pi subagent extension` 在隔离的 Git worktree 中运行写入型代理的操作参考。安装与日常使用见 [README](../README.zh-CN.md)。完整的工具 API 和状态模型见[工具与生命周期参考](tools.zh-CN.md)。这些选择背后的产品与开源研究见[研究报告](research/worktree-subagent-orchestration.md)。

## Quick start

在 Rex 内、从 Git 检出运行 Pi，然后为每个独立的写入任务分配唯一分支。示例中使用 `worker`、`scout` 和 `reviewer` 角色名；`Pi subagent extension` 不附带任何角色，因此这些名称必须来自已安装的角色包，或来自项目级/全局定义。若要启动裸子代理，请省略 `agent`。

```typescript
subagent({
  name: "Ticket 123",
  agent: "worker",
  model: "<worker-provider>/<mid-tier-id>",
  thinking: "medium",
  cwd: "/path/to/repository",
  worktree: { branch: "ticket/123", base: "main" },
  task: "Implement ticket 123, run its tests, commit the result, and report the commit SHA. Do not push, merge, or remove the worktree.",
});
```

`base` 可选。省略时，扩展会在创建 worktree 之前解析源码检出中已提交的 `HEAD`。

## When to use a worktree

对于可能写入文件或创建提交的每个独立任务，使用一个单独的 worktree。这可以防止多个工作代理相互覆盖文件和索引。

如果任务是只读的、交互式的，或有意共享当前检出，则改用普通子代理窗格：

```typescript
subagent({
  name: "Scout auth",
  agent: "scout",
  model: "<scout-provider>/<fast-tier-id>",
  thinking: "low",
  task: "Map the auth flow; do not modify files.",
});
```

普通窗格请省略 `worktree`。如果生成的工具客户端要求提供每个已声明的属性，请传入 `worktree: null`；扩展会将其完全视为省略，并在 `cwd` 中启动子代理，而不会调用 `managed worktree create`。

worktree 会隔离检出、索引和 `HEAD`。它们**不是安全沙箱**：worktree 仍共享仓库的对象数据库和大部分 refs，且子进程拥有与 Pi 相同的主机权限。

每次托管 worktree 启动都会在环境中携带 worktree 和源码检出的绝对路径。即使启动发生在子目录中，源码边界仍是 Git 检出根目录。子代理的 Rex 通知会说明 worktree 是其工作区，所有读取、写入和命令都应在此进行，并且不得 `cd` 到或修改源码检出；父代理负责审查和集成结果。当目标解析到源码检出内部但在 worktree 之外时，子代理侧的 `tool_call` 防护会拦截已知写入工具（`edit`、`write` 以及带显式路径参数的同类工具）。拒绝信息会指出源码路径，并提供对应的 worktree 路径。规范化解析会跟随符号链接，并在应用 Pi 内置的文件工具路径规范化（`~`、`@`、file URL 和 Unicode 空格）之后，通过其最近存在的祖先解析不存在的目标。

该防护刻意收窄了范围。它不解析 shell 命令，`Bash` 仍可写入进程有权限访问的任何位置。针对 shell 命令的工作区规则通过提示词强制执行，并不是安全边界。普通的非 worktree 子代理携带空边界变量，也不会注册防护处理器。

宿主管理的 Git 命令通过其工作目录选择检出，而不是继承的 `GIT_DIR`、`GIT_WORK_TREE`、索引/对象目录覆盖项，或命令局部的 `GIT_CONFIG_*` 覆盖项。宿主会从其子进程环境的副本中移除这些变量。常规的用户/全局配置（包括被包含的文件）、身份、签名、凭据和钩子仍保持启用。此策略不会修改父环境、用户 shell 命令、验收检查，或已经运行的 Rex server 的环境。

## Launch contract

普通子代理和恢复操作接受原生 `placement: "split" | "tab"`。默认是在父代理旁 split，当前窗口中由该父代理拥有的活动子代理最多 2 个（`panes.maxPerTab`，取值 1 到 10 的整数）。窗口已满时，下一次 split 请求会发往新标签页；关闭子代理会释放其名额。内核在 `/reload` 前后保留登记与预留。无论 `placement` 为何，worktree 启动始终使用新的 Rex 标签页，且不占用普通 split 名额。参见 [Rex surface 放置方式](rex-surface.md)。

worktree 启动时：

- `cwd` 选择源码 Git 仓库。相对工具参数会相对于父 Pi 进程的当前目录解析。当 `cwd` 是链接检出时，Rex 的资源准备使用其主检出，而请求的检出提供 base SHA 和 manifest 来源信息。
- `worktree.branch` 是新的唯一分支名。Git/Rex 会拒绝无法创建或已在其他位置检出的分支。
- `worktree.base` 可以是能解析为源码仓库中某个提交的任意修订版本。默认使用已提交的 `HEAD`。
- 扩展将 `base` 解析为精确 SHA，写入所有权 manifest，然后调用 `managed worktree create --no-focus`。
- Rex 会将新 worktree 归入源码仓库的主工作区，并在没有打开的工作区时打开一个。扩展会在创建前后异步读取 `managed worktree list --cwd`，并读取所打开工作区终端的 `Rex block list`，仅用于在当前进程中记录一项占用声明（claim）。每次读取的超时时间为 3 秒。在 120 秒的 worktree 获取预算内，最多三次读取会占用至多 9 秒实际时间，且不会阻塞事件循环。此前已经打开的工作区不会被声明占用。快照不可读、超时或不完整时不会声明占用任何内容，并且会作为启动诊断报告在 `subagent` 确认信息或 `/worktree` 通知中，绝不会输出到控制台。若创建前快照失败，后续读取会被跳过。普通窗格启动不会执行这些调用。该占用声明不会写入 manifest，也不会在此进程退出后保留。
- 子代理从返回 worktree 的根目录启动，位于该工作区保留的根窗格和新归属的 `Agents` 标签页中。退出 Pi 后会回到可交互的检出 shell；这不会关闭根窗格。从链接检出成功启动本身并不授权在此清理：清理会检查调用方父会话 cwd 下的规范主仓库/源码仓库，而不是 `manifest.sourceCwd` 或共享 Git 身份。应从主检出或包含该检出的祖先目录启动父 Pi 会话，然后使用正常的显式清理流程；在现有 Pi 会话内更改目录不会改变其会话 cwd。
- 父检出的未提交和未跟踪文件不会被复制。子代理必须看到的内容应在启动前提交，或在任务中传入所需上下文。
- 创建 worktree 不会抢占终端焦点。

对于显式的交互式交接，使用 `/worktree <worktree> [task]`。它会从当前已提交分支创建 worktree，将活动对话分支 fork 到目标 cwd 的会话中，在返回的根窗格中启动一个常规的长生命周期 Pi 进程，并且只有在确认 Pi 已启动后才聚焦目标工作区：根窗格的 Rex 前台进程列表中必须有一个 Pi 进程，其 cwd 为 worktree，并且在启动时环境（`/proc/<pid>/environ`）中包含 `the child session environment marker`，其中指明了 fork 出来的会话文件。环境不可读（例如进程正在退出）时，绝不视为确认启动。命令行文本永远不是证据，因为 Pi 会重写其进程标题，随后 Rex 只会报告 `pi`。确认过程读取 Linux 的 `/proc`；在其他主机上，确认会在有界等待时间内失败，并适用下文的启动失败保留规则。使用 `/worktree list` 检查源码仓库位于当前 cwd 子树内的托管 worktree，包括跨会话孤儿项。原始进程和会话保持完整；不会通过移动窗格来更改正在运行的 shell 的 cwd。

`worktree` 不能在 agent frontmatter 中设置，也不会由 `/subagent <agent> <task>` 简写暴露。它在每次调用 `subagent` 工具时选择。worktree 子代理不支持有序模型回退列表：失败的尝试会保留其 worktree 和分支以供审查，因此重试无法安全地复用所请求的分支。持久专家要么在其整个生命周期内持有一个 worktree 租约，要么在普通窗格中以只读方式运行；它不能重新绑定。

父代理会将已注册的上下文压缩工具追加到 worktree 子代理和交互式交接的启动 `--tools` 列表中，使它们从第一个模型回合起就可用。交接保持其正常的交互式启动，不加载子代理协议扩展。显式拒绝仍对子代理生效；如果没有安装 provider，Pi 会使用原生 auto-compaction。参见[上下文压缩配置](configuration.zh-CN.md#context-compression-tools)。

## Parent and worker responsibilities

| 父代理/编排器 | 工作代理 |
| --- | --- |
| 选择唯一分支和已提交的 base | 仅在提供的检出中工作，并使用其绝对路径 |
| 提供完整任务上下文 | 编辑前先阅读现有代码 |
| 审查返回的 Git 元数据和 diff | 运行相关验证 |
| 为工作代理保持源码检出只读 | 绝不 `cd` 到源码检出中或修改它 |
| 决定如何以及何时集成 | 当任务要求提交时执行提交 |
| 显式执行 push、创建 PR、merge 或清理 | 除非明确授权，否则不要 push、merge、切换分支或移除 worktree |

建议工作代理创建提交，因为这为父代理提供精确的审查与集成单元。工作代理的未提交更改仍会保留并报告，不会被丢弃。

## Parallel writing pattern

独立任务可以从同一个已提交 base 并发启动：

```typescript
subagent({
  name: "API ticket",
  agent: "worker",
  model: "<worker-provider>/<mid-tier-id>",
  thinking: "medium",
  worktree: { branch: "tickets/api", base: "main" },
  task: "Implement the API ticket, test it, and commit. Do not push or merge.",
});

subagent({
  name: "UI ticket",
  agent: "worker",
  model: "<worker-provider>/<mid-tier-id>",
  thinking: "medium",
  worktree: { branch: "tickets/ui", base: "main" },
  task: "Implement the UI ticket, test it, and commit. Do not push or merge.",
});
```

不要并行执行以下任务：修改同一行为的任务、依赖彼此尚未合并输出的任务，或需要按顺序执行迁移的任务。应串行运行这些任务，或先集成前置任务，并将其已提交 SHA 用作下一任务的 base。

## Lifecycle and ownership manifest

在请求 Rex 创建资源之前，扩展会在以下位置写入 manifest：

```text
<parent-session-directory>/artifacts/<parent-session-id>/worktree-runs/<run-id>.json
```

manifest 使用 Rex 所有者标识符 `pi-rex-subagents`。旧宿主创建的 manifest 不会被接管。它会记录请求的 base 和分支、观测到的工作区/窗格/路径、子会话路径、时间戳、状态，以及可用时的最终 Git 交接信息。

可能的状态包括：

| 状态 | 含义 |
| --- | --- |
| `provisioning` | 已记录意图；尚未确认 Rex 创建 |
| `provisioned` | worktree 工作区已存在 |
| `running` | 子代理启动命令已送达 |
| `ready_for_review` | 子代理成功退出；工作区已保留 |
| `needs_help` | 子代理调用了 `caller_ping`；工作区已保留 |
| `failed` | 创建、启动或执行失败；任何已创建的工作区都会保留 |
| `cancelled` | 父代理使用 `subagent_cancel` 取消了运行，并已确认子代理在启动时验证过的 Pi 进程身份已退出；工作区、检出和提交都会保留 |
| `removed` | 父代理的显式清理已确认检出不存在；分支和 manifest 会保留 |

manifest 用于支持所有权和检查；v1 在 Pi/Rex 完整重启后不提供自动重新协调。不要手动编辑 manifest。

## Completion handoff

父代理会收到常规子代理摘要，以及：

- worktree 路径
- Rex 工作区 ID
- 分支
- 请求的 base ref 和解析后的 base SHA
- head SHA
- `base..HEAD` 中的提交数量
- 合并统计已提交、已暂存、未暂存和未跟踪工作的更改文件
- 单独的未跟踪文件
- 工作树状态：clean、dirty 或 conflicted

`clean` 表示没有已暂存、未暂存或未跟踪的文件。它**并不**表示该分支相对于其 base 没有提交或 diff。

使用[验收检查](tools.zh-CN.md#accept-checks)时，父代理会先捕获此交接信息，然后在 worktree 根目录重新运行检查，因此检查写入的构建产物不会出现在报告的状态中。`Check:` 行会列出检查 `paths` 下任何已更改或未跟踪的文件。拒绝的判定不会更改 manifest 状态；在重新检查期间取消会记录为 `cancelled`。

运行时会在父代理执行验收检查之前，为每次受监视的尝试捕获一份 Git 交接信息。其异步探测共享 15 秒预算，并且每个输出流有 1 MiB 上限。如果 Git 检查失败、超时、超出该上限，或返回格式错误的必需证据，则 SHA/数量/状态/文件字段会报告为未知，而不是猜测，并且警告会包含在交接信息中。在集成或删除之前，请直接检查保留的工作区。每份保留的交接信息都会指向 `/worktree remove` 和 `worktree_remove`，并将原始 Rex 命令作为操作员覆盖手段，供在独立安全检查后使用。

## Parallel pull-request review without new worktrees

对于并行只读审查，请为 pull request 或保留的工作代理结果准备一个稳定的现有检出。不要为每个审查者创建一个托管 worktree。

1. 父代理记录规范仓库根目录、精确的比较 base 和 head SHA，以及确切的任务/规格证据。它要确保审查运行期间没有写入者更改检出。
2. 明确决定已暂存、未暂存和未跟踪文件是否在范围内。对于纳入范围的脏状态，记录有界清单和指纹；仅凭一个提交 SHA 无法固定它。
3. 在普通窗格中启动每个只读子代理，并将 `cwd` 设置为该检出。省略 `worktree`。使用默认分组放置时，扩展会复用该检出的工作区，以及此父代理拥有的 Agents 标签页中的可用空间，包括保留的写入者根标签页。它绝不会移动写入者或创建另一个 worktree。不同父进程不会按标签接管彼此的标签页。
4. 为每个审查者提供相同的精确范围。要求其在审查结果之前报告仓库根目录和 `git rev-parse HEAD`。
5. 在每个依赖型审查波次之前以及报告之前，重新检查 head 和脏状态指纹。漂移会使先前证据失效；应重新审查新状态，而不是混用不同修订版本。

`read,bash` 工具允许列表并不能强制执行只读行为，因为 Bash 可以修改检出。告知公开审查者仅使用安全的检查方式，避免生成产物的验证，并消费提供的机械证据。超过 16,000 个字符的公开子代理的完成报告会被缩写；需要完整报告时，从提供的会话路径一次性获取其最终助手消息，并对输出加以限制。这是证据检索，不是实时会话轮询。

角色包提供的审查工作流（例如 `/skill:orchestrate`）建立在此公开子代理模式之上，并记录各自的方法论。宿主不提供审查运行器，也不创建私有审查检出。审查者读取的是 head 检出，因此父代理必须生成更改文件清单和 unified diff，或完整的修改前后摘录，因为 head 检出读取无法恢复已删除或仅存在于 base 的 blob。实际生效的工具是解析后的角色允许列表和拒绝规则。

```typescript
subagent({
  name: "PR reviewer",
  agent: "reviewer",
  model: "<review-provider>/<mid-tier-id>",
  thinking: "medium",
  cwd: "/path/to/pr-checkout",
  task: "Review base <base-sha> through head <head-sha>. First report git rev-parse HEAD. Do not modify files.",
});
```

保留的工作代理 worktree 可以作为这个检出。父代理负责任何最终报告、PR 操作、集成和清理。

## Review and integration

将完成视为审查交接，而不是验收通过。使用结果中的路径、工作区 ID 和 base SHA：

```bash
Rex workspace focus <workspace-id>
git -C <worktree-path> status --short
git -C <worktree-path> log --oneline <base-sha>..HEAD
git -C <worktree-path> diff --stat <base-sha>...HEAD
git -C <worktree-path> diff <base-sha>...HEAD
```

然后：

1. 阅读工作代理摘要和测试证据。
2. 检查已提交和未提交的更改。
3. 在 worktree 中运行相关测试。
4. 解决 worktree 中的脏状态或冲突状态。
5. 有意识地集成——根据仓库策略执行 merge、cherry-pick 或发布 PR。
6. 在目标分支上重新运行集成检查。
7. 仅在其有用状态已保留后移除 worktree。

扩展绝不会自动 push、创建 PR、merge、cherry-pick 或更改父检出。

## Failure, help, and restart behavior

- **普通启动失败：** 如果全新启动或 `subagent_resume` 在扩展创建其窗格后失败，回滚只会关闭该窗格，并要求确认其已不存在。确定发生在派发前的失败在确认回滚后仍可进入普通模型回退。worktree 脚本写入失败会保留检出并报告失败，而不会去监督一个不存在的子代理。如果派发或回滚仍不确定，已初始化的子代理会继续保持归属和受监督状态，而不会触发回退。确认信息会报告 `uncertain`。宿主不会关闭调用方提供的 surface。
- **创建失败：** manifest 会被标记为 `failed`。超时、传输失败或不完整的变更响应会记录 `acquisitionUncertain: true`，并且只记录观测到的身份信息。宿主会针对唯一分支匹配执行一次有界恢复检查，并记录任何恢复的工作区或路径。恢复证据不会授权延迟派发 Pi、回退或自动移除。立即得到空列表并不能证明服务器之后不会完成创建。
- **创建后启动失败：** manifest 会被标记为 `failed`，并保留工作区、fork 出的会话和路径。除非确认 Pi 已启动，否则不会聚焦目标位置。
- **工作代理失败：** 会返回摘要和可用的 Git 状态；工作区保持打开。自动退出会等待 Pi 完全稳定，因此临时 provider 错误后发生的自动压缩或重试不会提前结束工作代理。
- **操作员取消：** `subagent_cancel` 绝不会关闭保留的根窗格或工作区。启动时，子代理的协议扩展会在 `<session>.process.json` 中记录自己的进程身份（PID、`/proc` 启动时间、boot ID 和 PID namespace 链接），父代理仅在该进程作为 Rex block shell 或其子孙进程、且存活于父进程的 PID namespace 中时接受它。取消只会向该身份发送 SIGTERM，并在发送信号前立即重新验证（PID 和启动时间），然后确认该身份已不存在，或在无法确认其仍存活时确认 block 已消失。命令行文本和 Rex 的前台列表永远不是证据：Pi 会重写其进程标题，且 Rex 只列出前台进程。若身份仍存活（例如已挂起且 SIGTERM 待处理的 Pi），或其 SIGTERM 发送失败但身份仍存活，即使 block 已消失，终止状态仍为 `unconfirmed`。未捕获的身份（包括在非 Linux 主机上）、不可读的身份、属于另一次启动或另一个 PID namespace 的身份，或其 PID 现在具有另一启动时间的身份，绝不会被发送信号，并且除非 block 不存在这一事实可确认终止，否则同样会保持 `unconfirmed`。在最终检查和发送信号之间，PID 仍可能被复用，因为 Node 没有 pidfd 信号机制。每个 Rex 查询都受取消截止时间约束；即使在计时器运行之前，在截止时间之后到达的答案也绝不会改变所报告的结果。该次运行会保持活动状态，重试 `subagent_cancel` 会重新检查；如果启动时捕获的信息已过期，重试会在其自己的截止时间内再次捕获身份。确认后，manifest 会标记为 `cancelled`，并且正常的 Git 交接信息会送达一次。如果在终止状态未确认时父进程关闭，会记录普通的关闭（shutdown）状态，绝不会记录为 `cancelled`。不会进行任何 Git 清理、分支更改或移除。
- **`caller_ping`：** 子代理以 `needs_help` 退出；应在保留的工作区中继续进行受 worktree 约束的后续工作，而不是通过 `subagent_resume`。公开的 `subagent_resume` 会在创建窗格之前拒绝托管 worktree 子会话，因此不会静默丢失 worktree 所有权或策略。
- **父代理执行 `/reload`、`/new`、`/resume` 或 `/fork`：** 活动的内存中监视器会转移到替代父会话。
- **完整进程重启或崩溃：** worktree 会保留，但 v1 不会自动重新发现并恢复其监视器。

`subagent_resume` 会拒绝托管 worktree 会话。它不会重新挂接托管 worktree 生命周期，也不会生成新的 worktree 交接信息。对于 worktree 后续工作，请聚焦保留的工作区，并从其 shell 手动恢复：

```bash
Rex workspace focus <workspace-id>
pi --session <child-session-path>
```

原始父代理的生命周期不会监视这种手动延续。不要为已经检出的分支创建另一个托管 worktree。

## Cleanup

worktree 和分支清理始终是显式的。普通的临时审查者窗格会在结果送达后关闭；仅当其最后一个窗格关闭时，Rex 才会移除其标签页。保留的 worktree 根 shell 被排除在自动清理之外，用户添加的窗格会被保留。持久专家在任务之间保留其窗格，并遵循现有的显式停止语义。

父会话有一个仅检查用的清单和一个显式移除接口：

```text
/worktree list
/worktree remove <path|branch|workspace-id> [--preserve]
```

等效工具是 `worktree_list({})` 和 `worktree_remove({ target, preserve?: true })`。分支名有歧义时使用精确路径。不会向子代理提供这些工具或 `/worktree remove`。它们现有的 `/worktree list`（仓库本地的 Rex 列表）和 `/worktree <name>` 交接仍可用。分离条目在子代理列表中标记为 `(detached HEAD)`，且不会妨碍对同级的具名分支条目进行清理检查；分离的检出本身仍会被阻止移除。

授权基于 **cwd 包含关系**：规范源码仓库根目录必须等于规范会话 cwd，或位于其下。对于链接检出，这意味着调用方父会话 cwd 下的规范主仓库/源码仓库；成功启动本身并不授权清理，授权也不使用 `manifest.sourceCwd` 或共享 Git 身份。应从主检出或包含该检出的祖先目录启动父 Pi 会话，然后使用正常的显式清理流程；在现有 Pi 会话内更改目录不会改变其会话 cwd。授权不使用托管检出的位置，也不要求存在当前会话的 manifest。发现过程会扫描 `~/.pi/rex-agents/worktrees/`，合并 Git 登记信息和 Rex 工作区状态，并包含已结束会话留下的孤儿项。范围外的条目永远不可移除；未登记的残留项和失败的探测结果都是未知，不能视为干净。清单包括路径、分支、源码、工作区、Git 状态、manifest 是否存在、具体阻塞项，以及单独的进程检查警告。托管根目录、源码和 cwd 仅使用 lstat/stat/readlink 进行规范化（绝不使用无界的 `open`）：符号链接的祖先目录可以正常工作，但逃逸出托管根目录的检出符号链接会被阻止。在 no-open 解析证明某个托管条目仍位于托管根目录内部之前，发现过程不会对该条目执行 `readdir`，因此指向受保护目录的符号链接无法冻结 Pi。

源码仓库可以是 Git 子模块。其共享 Git 目录位于超级项目的 `.git/modules` 下，因此清理会通过 `git config` 读取 `core.worktree`，这也会遵循被包含的配置文件。随后，清理会要求与其他任何源码相同的顶层目录和公共目录证明。如果读取或某项证明失败，该条目就是未知，不能移除。托管检出中已初始化的子模块仍会阻止移除。

移除操作会重新检查包含关系与 Git 登记，确认没有检测到进程持有者，也没有已知的活动子进程或持久专家租约，并且没有未提交、未跟踪或冲突文件。活性检查会检查任何会话中 cwd 位于该检出内的可观测同用户进程，无论运行时名称如何（包括带线程后缀的 Node 名称）。只有 Rex 确认空闲的保留 shell PID 可获豁免；同一 PID 上的活动运行时不能豁免。分离 HEAD、锁定的检出、已初始化的子模块和冲突的身份证据都会阻止移除。对于已初始化的子模块，请有意地取消初始化，或使用操作员移除。不提供 force 选项。

不可读的单个进程详情（包括无法确定的同用户 cwd，即除 ENOENT 或 ESRCH 之外的任何错误）属于**警告，而不是阻塞项**，且没有覆盖标志。每次遇到不可读条目后扫描都会继续，因此另一个可观测的持有者仍会阻止移除。未知进程不会被归类为无关进程。清单行会提供独立的 `blockers` 和 `warnings` 数组；移除结果会暴露 `warnings`，并保留先前检查中的警告，包括拒绝，以及可获取时的保留/移除失败。人类可读输出包含相同的警告，带有计数，且每次检查最多采样十个 PID，不包含进程命令或环境。Pi 工具的拒绝和失败使用抛出错误，因此其警告会随错误消息传递，而不是放在结构化工具详情中。

这不能证明整台机器上没有任何活动：同用户检查受权限限制，不会检查其他用户的进程，受保护的进程也可能在未被检测到的情况下持有该检出。Linux 会枚举 `/proc`，并仅使用 no-open 解析器解析 `/proc/<pid>/cwd`。已消失的进程和已确认的僵尸进程不会持有检出。macOS 使用同用户的 `lsof` cwd 记录，并在不打开目录的情况下解析；单条返回记录中不可读或缺失的详情会产生警告，但全局 `lsof` 失败即使返回部分输出也会阻止移除。两个平台都无法覆盖被操作系统隐藏的进程。不支持的平台、失败或为空的全局枚举，以及未知的 Git、包含关系或所有权状态，仍会构成阻塞项。

有未提交内容的工作区需要显式 `--preserve` 或 `preserve: true`。这会将所有未提交和未跟踪文件暂存，并在保留的分支上创建一个 WIP 提交。提交失败会恢复保留操作前的索引，并保持检出及其未提交文件不变；移除不会继续。即使随后的重新检查或移除失败，成功时也会报告保留 SHA。冲突、分离 HEAD 和其他阻塞项不能通过保留操作绕过。

忽略的文件不会阻止清理。清单会显示其确切文件数，成功移除会报告删除了多少个。计数会流式处理以 NUL 分隔的 Git 列表，而不是缓冲所有路径；错误和 30 秒超时仍会阻止移除，绝不会报告猜测的零。保留操作不会捕获忽略的文件；当存在忽略文件时，尝试保留和成功保留的报告都会披露这一排除情况。

打开的 worktree 窗口会在重新进行资格检查后通过 Rex provider 移除。源会话会保留；Rex provider 不会创建已打开主工作区的占用声明，也不会建议关闭主会话。仅存在于 Git 的孤儿项使用 `git worktree remove`，验证检出不存在，然后清理过期的 Git 登记。移除失败会报告，绝不会强制。可达的已归属 manifest 在成功后会被合并更新为 `removed`；缺失的跨会话 manifest 会被报告，且不会被重写。manifest 更新失败会产生 removed-with-warning 结果。已移除的 manifest 仅提供已移除的证据；同一路径上重新创建的检出会独立分类。缺失和悬空的 manifest 路径属于不匹配项；无法判定的路径和身份冲突仍会构成阻塞项。清理的 Git 和 Rex 调用有 30 秒超时。

分支及其提交始终会保留：清理绝不会删除、强制更新或重写分支。它绝不会在完成、关闭或定时器触发时运行。会话启动会跳过 worktree 清单，以避免阻塞 Pi 初始化；使用 `/worktree list` 或 `worktree_list` 获取显式清单。扩展仅在 Rex 内注册其清单工具；无法进行的检查会报告为未知。不支持的平台和失败的全局进程枚举会阻止移除。个别可见性缺口（包括无法确定的同用户进程 cwd）会作为警告披露，不能证明孤儿项处于空闲状态。

## Current limits

此第一版有意不提供：

- 自动 push、创建 PR、merge 或 cherry-pick
- 自动移除 worktree 或分支
- 感知 worktree 的 `subagent_resume`
- 完整进程重启后的持久监视器协调
- 自动关闭源码仓库的主工作区
- 依赖 DAG 调度或 merge 队列
- 堆叠分支管理
- 多仓库工作区
