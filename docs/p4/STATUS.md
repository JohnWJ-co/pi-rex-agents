# P4 进度

规则：
- 只在 `/Users/qiangwenjun/Documents/project/pi-rex-agents-p4`（分支 `p4-kernel`）中工作，绝不修改主 checkout `/Users/qiangwenjun/Documents/project/pi-rex-agents`，也不修改上游 `/Users/qiangwenjun/Documents/project/pi-herdr-agents`。
- 按 T0→T6 顺序执行。每个任务完成后：更新本文件（完成项、门禁结果、提交 hash、偏差说明），然后提交。
- 门禁失败若由本任务改动直接造成且修法机械（类型收窄、import、格式、同步新行为的测试期望），可修复后继续，并在本文件记录。原因不明、需要弱化或跳过断言、涉及删除测试、涉及 `released.json` 或与任务卡冲突时，记录失败命令、输出摘要、判断与建议，停止等待指示。不得弱化门禁。
- 真实 Rex 测试结束后清理所有自己创建的 block/window/lab，不要动用户的其他 block。
- 不合并、不推送、不改 `released.json`（T3 需要用户确认的情况除外）。

| 任务 | 状态 | 提交 | 备注 |
|---|---|---|---|
| T0 | 已完成，门禁通过 | `41af43a2c17ae86ec7c5e57b3c1989c6b71147a8` | 完整复制范围已修正；test-gate 最终通过，1452 个测试已加载 |
| T1 | 已完成，门禁通过 | `15cdafc` | Rex lab、集成 harness、验证技能和 AGENTS.md 已完成；test-gate 与真实 Rex smoke 通过 |
| T2 | 已完成返工，门禁通过 | `6202306` | 恢复通用测试并迁移 audit-stop 到 Rex harness；Rex provider 已入内核；Herdr/sidebar/Windows 专属路径已删除；保留 `test/verify-lab-guards.test.ts` |
| T2b | 已完成，门禁通过 | `74be436` | 父端白名单覆盖 fresh/resume/persistent/handoff；真实 acp_status 调用及 block 清理通过 |
| T3 | 已完成，门禁通过 | `da8f08a22a09e547d6109083a5eef32779e9fa86` | 原生 placement、split 上限 2、Rex 配置隔离；真实集成 11/11 通过 |
| T4 | 待开始 | | |
| T5 | 待开始 | | |
| T6 | 待开始 | | |

## 日志

### T3 完成：修正 F1 状态等待协议，placement 集成通过

监督确认上轮超时源于 harness 对 F1 的误读：启动和中断使用 `idle`，正常一轮结束使用 `done`。新增 `test/integration/rex-harness.ts` 的 `waitForPiTurnSettled`，只接受 Pi 的 `done` 或 `idle`，`working`、`blocked`、`error` 均不满足；placement 的 `launchStage` 先读该轮 session 标记，再调用新 helper。`waitForPiReady` 保持原来的启动 `idle` 语义，默认 `PI_TIMEOUT=120_000` 未变。没有延长超时、跳过检查或降低拓扑/报告/会话/清理断言。同步了 F1、AGENTS 和两个验证技能，以下失败日志保留为历史。

本次修正后验证：

- `npm run test:integration:rex`：**11 tests / 11 pass / 0 fail / 0 skipped**，退出码 0，总耗时 10840.607625ms。placement 用例耗时 3261.392791ms，另外覆盖原有 real smoke 和 9 项 RexSurfaceProvider conformance。
- 拓扑实证：父 window `window:01a1afc1-82ee-78b2-a4d8-94daef442bfa`；第 1、2 个子 block 位于父 window，第 3 个位于 `window:01a1afc1-88e7-7a41-ae4c-ebbd7d8c9631`；关闭第 1 个后，第 4 个重新进入父 window；关闭第 2 个后，显式 tab 的第 5 个仍进入新 window `window:01a1afc1-8ca3-79bc-bb0a-3417428b415a`。第 3、4、5 个都有真实报告和子 session，最终子 block 全部消失。
- 通过 `startParentPi` 的 `--no-extensions -e <当前 checkout>/src/extension.ts` 加载新代码，没有依赖本协调会话的 `/reload` 状态。
- 重新运行 `npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run docs:tools:check`、`git diff --check`：全部通过。
- `lab.ts doctor`：通过，集成开始前无并行套件和 live lab。`npm pack --dry-run --json`：通过，164 个文件，已检查完整清单；含内核 reservation 和 Rex surface 文档，不含旧 `src/placement.ts`、本地 settings、会话、证据或凭据。
- test-gate 沿用上一轮通过的单元门禁：`bash docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t3-verified-gate.JFFyee`，默认 `MIN_TESTS=1155`，两轮均加载 1180 项、无持续新增失败。本次之后只修正集成 harness/用例及说明，单元覆盖代码未变。`released.json` 比较无 breaking，未修改基线和允许集合。
- 本轮日志与收尾证据：`/tmp/pi-rex-agents-p4-t3-protocol-check.V58QTZ` 中的 `integration.log`、`integration.exitcode`、`typecheck.log`、`lint.log`、`format.log`、`docs.log`、`diff.log`、`pack.json`、`postflight.json`。上一轮 test-gate 与失败集成日志继续保留，便于追溯。

T3 实现和交接：

- placement 已成为 `subagent` / `subagent_resume` 的原生参数，显式沿 launch/resume 链传递；split 名额由内核的父进程 reservation 和登记表维护，默认 2，覆盖并发、关闭后复用、reload 和 resume。宿主 ALS、参数注入和 split 计数已删除。
- 配置隔离为 `$PI_CODING_AGENT_DIR/rex-agents/config.json`；缺省 split/right/2，`maxPerTab` 只接受 1..8 的整数。不读取、不迁移旧 Herdr 配置，并覆盖旧路径存在 grouped 配置的加载回归。
- 已逐文件核对 `t3-build` 的 `24ec41242faeaa872f0f9706984dab605a264507` 并人工纳入当前 T3 工作区：`maestro/core/config/pane-config.ts` 和 `config.json.example` 与该提交完全一致；`test/test.ts` 保留其全部修改，再加 Rex 配置隔离回归。没有 merge 或 cherry-pick。受管 worktree 仍保留，管理清单标记其 source 为主 checkout、位于当前 cwd 清理范围外；未绕过管理工具删除。
- postflight 确认无 `pira-lab-*` / `pi-integ-*` 根、测试进程或测试 Rex session；原 session 只剩父 block。`.pi/settings.json` 仍为 `S`（skip-worktree），`released.json` 和基线没有 diff，无根目录空目录或待提交证据/凭据。
- 未派遣被禁用的 `gpt-6-astra`，未修改主 checkout、上游或旧用户配置；不合并、不推送。仅提交 T3，完成后停止，不开始 T4。

### T3 续跑：静态门禁通过，placement 集成超时后停止

按监督放宽后的规则完成两处机械同步：accept-recheck 夹具返回确定存在的 operations；RunSession 转发测试增加显式 `placement: "tab"` 的输入和完整对象期望。补跑 wording 检查后，将 placement 的表示断言同步为原生 TypeBox union，并恢复模拟工具的完整描述；生产文案映射没有改动，没有新增非空断言、删除用例或降低断言要求。

本轮正式门禁结果：

- `npm run typecheck`、`npm run lint`、`npm run docs:tools:check`、`npm run format:check`（151 个文件）、`git diff --check`：通过。`bun src/wording-check.ts` 机械同步后通过，输出 `rex host surface OK`。
- `bash docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t3-verified-gate.JFFyee`：通过，保持默认 `MIN_TESTS=1155`。两轮均为 **1180 tests / 1161 pass / 9 fail / 10 skipped**；第 1 轮两个暂定新增失败没有持续，最终输出 `OK：没有持续性新增失败`，退出码 0。raw npm test 仍有允许集合中的失败，不能描述为零失败。
- released/current 契约用例 `has no breaking change against the last released schema` 通过；新增 placement 为兼容扩展。`test/fixtures/tool-schema/released.json`、基线脚本和允许集合均未修改。
- `node --experimental-strip-types .pi/skills/verify-pi-rex-agents/scripts/lab.ts doctor`：通过，Rex `0.0.1793741575-g1b6654`、Pi `1.5.0`、Node `v26.7.0`，无已有 lab 或运行中的集成。
- `npm pack --dry-run --json`：通过，164 个文件。包含 `maestro/runtime/pi-placement.ts`、`docs/rex-surface.md`；不含已删除的 `src/placement.ts`、本地 settings、会话、证据或凭据。
- **`npm run test:integration:rex` 失败，退出码 1：11 tests / 10 pass / 1 fail / 0 skipped。** 原有 real smoke 和 9 项 RexSurfaceProvider conformance 均通过；新增 placement 用例失败，不能报告为 placement 验收通过。

placement 失败原文：

```text
places split, split, tab and reuses a closed child slot through real parent tools (122285.245833ms)
Error: Timed out waiting for parent Pi idle status
    at waitFor (test/integration/rex-harness.ts:179:8)
    at async waitForPiReady (test/integration/rex-harness.ts:274:2)
    at async launchStage (test/integration/rex-placement.test.ts:70:5)
    at async TestContext.<anonymous> (test/integration/rex-placement.test.ts:80:4)
```

- fresh parent 通过 `--no-extensions -e <当前 checkout>/src/extension.ts` 加载新代码。第一轮 start 已读到 `PLACEMENT_READY`，随后等父 Pi 的 idle OSC 状态在 120 秒后超时；尚未执行 split/split/tab 的拓扑断言，也没有得出关闭后复用的结论。
- 当前原因未明，不能据此判定 reservation 错误或修改状态断言。按监督最新规则停止：不延长超时、不跳过或删除断言、不重试集成、不提交 T3，等待下一步定位指令。没有自行 `/reload` 或调用本会话的旧 subagent 路径，也未再派遣 `gpt-6-astra`。
- 静态门禁、test-gate 两轮日志、失败集成日志、doctor、pack 与收尾证据保存在 `/tmp/pi-rex-agents-p4-t3-verified-gate.JFFyee`；主要文件为 `test-gate.log`、`run1.log`、`run2.log`、`integration.log`、`integration.exitcode`、`postflight.json`。此前三轮 RunSession 期望遗漏的失败日志仍保留于 `/tmp/pi-rex-agents-p4-t3-final-gate.WLP4Ul`。

清理与范围：afterEach 已释放等待文件并销毁隔离 lab。只读 postflight 确认无 `pira-lab-*` / `pi-integ-*` 临时根、测试进程或测试 Rex session；本 session 只剩原父 block `block:01a1af49-22e2-7bfe-b2e6-2984426ea5df`，未操作其他 session。`.pi/settings.json` 仍为 `S`（skip-worktree），受保护文件没有 diff，没有暂存文件或根目录空目录。未修改主 checkout、上游或旧用户配置，没有合并、推送或 T3 提交。变更保留在 `p4-kernel` 工作区，不开始 T4。

### T3 继续：按监督放宽停止规则修复夹具并继续门禁

- 补跑 `bun src/wording-check.ts` 发现其旧检查仍要求宿主注入的 `enum`；已同步为原生 TypeBox union 的 `anyOf.const`，继续严格断言 split/tab 两个值。另恢复模拟工具的完整描述，使夹具继续覆盖已有的精确文案映射；没有修改生产文案映射或减少断言。修复后检查退出码 0。

监督授权机械修复后继续：accept-recheck 夹具现在返回显式非可选 operations，两处调用直接使用该属性；没有新增 `!` 断言、删除测试或放宽断言。以下失败记录保留为历史。

- typecheck 已通过。test-gate 首次续跑三轮均加载 1180 项（分别 1162/1160/1161 pass，8/10/9 fail，10 skipped），唯一持续新增失败是 `resolves roles, merges env and forwards launch input without acquiring infrastructure`：完整对象断言缺少新增的 `placement`。已同步为输入显式 `tab` 并校验完整转发，保留所有既有断言后重跑；原始日志位于 `/tmp/pi-rex-agents-p4-t3-final-gate.WLP4Ul`。

### T3 继续：可选 launchOperations 已修复，测试夹具类型检查失败后停止

按监督指令修复了上一轮的基础设施契约：

- `maestro/runtime/pi-run-session-types.ts` 将 `launchOperations` 改为可选注入；`maestro/runtime/pi-run-session.ts` 的 worktree 缺省链改用 `options.infrastructure?.launchOperations?.worktree ??`。`src/infrastructure.ts` 不构造 launch operations，继续交由内核按 pane snapshot 构造。
- `test/maestro/pi-run-session.test.ts` 新增不注入 `launchOperations` 的回归：从缺省 Rex 配置加载 split/right/2，并发启动三个子代理，验证 split/split/tab。针对性命令 `node --experimental-strip-types --test --test-name-pattern='without injected launch operations' test/maestro/pi-run-session.test.ts`：**1 passed、0 failed、0 skipped**。
- 三个修改文件已执行 Biome format；没有修改既有测试的断言、基线脚本或 `MIN_TESTS=1155`。

重新启动正式门禁，首项 `npm run typecheck` **失败，退出码 2**：

```text
test/maestro/accept-recheck.test.ts(419,2): error TS18048: 'operations' is possibly 'undefined'.
test/maestro/accept-recheck.test.ts(501,10): error TS2532: Object is possibly 'undefined'.
```

- 原因：`PiRunSessionInfrastructure.launchOperations` 现在可选，而 accept-recheck 的两处测试仍直接使用 `f.options.infrastructure!.launchOperations`。该夹具在第 95 行明确注入 operations，因此是测试夹具的类型收窄遗漏，不能归为基线或 flaky。生产代码原先缺少属性的 TS2741 已消除。
- 建议后续从夹具返回确定存在的 operations，或在两处访问前增加明确的存在性断言，再完整重跑门禁。本轮按顶部规则停止，没有继续修复或重试。
- `test-gate`、lint、`docs:tools:check`、format:check、doctor、placement/Rex 集成、pack dry-run 均未执行；runner 遇首个失败立即退出。没有得出 released/current 比较结论，`released.json` 未修改。
- 日志与退出码：`/tmp/pi-rex-agents-p4-t3-optional-gate.xlmRzq/typecheck.log`、`typecheck.exitcode`、`exitcode`；runner 与只读 postflight 证据位于同一目录。

收尾：本轮没有派出子代理、没有自行 `/reload`、没有启动 lab 或集成。`rex ls --json` 无测试会话，临时目录无 `pira-lab-*` / `pi-integ-*`，无测试进程或 lab server 残留；仅保留既有 Rex 主服务器。`.pi/settings.json` 保持 `S`（skip-worktree），无暂存改动、无根目录空目录。没有修改主 checkout、上游或旧用户配置，没有合并、推送或 T3 提交；不开始 T4。

### T3：原生 placement 与配置隔离已实现，typecheck 失败后停止

当前实现均保留在 `p4-kernel` 未提交工作区；没有合并或推送，不开始 T4。

- `subagent` / `subagent_resume` 的 catalog 与 TypeBox schema 原生加入 `placement`，经 task、run session、Pi adapter、fresh/resume launch 传到 `createPane`。删除 `src/placement.ts`、宿主 infrastructure split 计数和 API proxy 参数注入，保留文案代理到 T4。
- 新增 `maestro/runtime/pi-placement.ts`：按本父进程登记、仍存活且在父 window 内的普通子 block 计数；队列覆盖 inventory 和 create，并预留等待注册的 split，超额转 tab。run-session owner 在 reload 时保留 registry 和 reservation；worktree 保持独立 tab。
- `PaneMode` 仅保留 split/tab，默认 split/right/2；`maxPerTab` 校验整数 1..8。已核对 `t3-pane-config` 的 `24ec412` 配置改动后按文件应用，没有合并整个 worktree。
- 按监督追加要求提前隔离配置：`pi-extension/subagents/config-path.ts` 改读 `$PI_CODING_AGENT_DIR/rex-agents/config.json`；不读取、不迁移旧 `herdr-agents/config.json`。新增旧路径含 grouped 配置仍可加载内核的回归测试。plan、任务卡及路径文档同步；其余改名留 T6，outcome ledger 路径不在本轮改动中。
- 新增 `test/integration/rex-placement.test.ts`，通过 fresh parent Pi 的 `-e <checkout>/src/extension.ts` 加载当前代码，检查 split/split/tab、关闭后复用、显式 tab、报告与子 session 及清理；已加入 `test:integration:rex`。本轮尚未执行该真实集成用例。
- 同步 README、配置、worktree、Rex surface 文档、代码地图和两项验证技能。`npm run docs:tools` 已重新生成文档与 `current.json`；`released.json` 没有修改。

正式门禁前的开发检查：

- 配置与 reload 针对性测试：14 passed、0 failed、0 skipped；配置路径 resolver 相关 15 项通过。
- 初次运行 placement/run-session/adapter/accept/persistent 五组针对性测试：141 tests / 135 pass / 6 fail / 0 skipped。6 个失败均来自本轮误将 ledger 测试夹具改到新目录；恢复 ledger 夹具及文档原路径后，`test/maestro/accept-recheck.test.ts` + `test/maestro/pi-placement.test.ts` 共 16 passed、0 failed、0 skipped。没有删除或放宽断言。
- 在本 worktree 执行监督指定命令 `pi -p --no-session --model CBAPI/cn:deepseek-v4.1-flash "只回复 OK"`：退出码 0，返回 `OK`，没有扩展加载错误；同时有本机模型 scope 的既有 warning：`No models match pattern "ds/*"`、`"stepfun/*"`、`"MIMO/*"`。随后已通知监督可 reload；没有自行 `/reload`，也没有在未收到确认时用本会话工具进行真实子代理验证。
- `t3-test`、`t3-test-2` 的早先启动失败，监督已定位为新校验读取旧 grouped 配置，**与模型无关**。用户禁止任何 provider 的 `gpt-6-astra` 后未再派遣；后续测试子代理应优先使用 `CBAPI/cn:deepseek-v4.1-flash`。

正式门禁：

- 第一项 `npm run typecheck`：**失败，退出码 2**。完整输出保存在 `/tmp/pi-rex-agents-p4-t3-gate.DsemUt/typecheck.log`，原文：

```text
src/infrastructure.ts(27,3): error TS2741: Property 'launchOperations' is missing in type '{ surfaceProvider: RexSurfaceProvider; worktreeOperations: WorktreeOperations; supervision: SupervisionCoordinator; }' but required in type 'PiRunSessionInfrastructure'.
```

- 原因：删除宿主层 launch wrapper 后，`createRexInfrastructure()` 只返回 provider、worktree 和 supervision；`maestro/runtime/pi-run-session-types.ts` 的 `PiRunSessionInfrastructure.launchOperations` 仍是必填。内核 `launchOperations(snapshot)` 已有缺省构造分支，但类型契约没有同步。这是本轮确定性回归，不能归为基线或 flaky。
- 建议下一轮将 `launchOperations` 明确为可选注入，由内核根据 snapshot 构造默认 operations，再完整重跑门禁；本轮只记录建议，没有继续修改或重试。
- 按顶部停止规则，未执行后续 lint、format:check、docs:tools:check、test-gate、doctor、Rex 集成、pack dry-run。`npm run docs:tools` 的生成成功不等于契约检查通过；尚未得到 released/current 比较结论。未修改 test-gate 或默认 `MIN_TESTS=1155`。

收尾：

- 本轮没有启动 placement lab；`rex ls --json` 无测试会话，系统临时目录无 `pira-lab-*` / `pi-integ-*`，无集成或 lab 进程残留；只保留既有 Rex 主服务器。检查结果保存在同一门禁目录的 `postflight.json`。
- `t3-build` 完成后保留的 block `block:01a1af84-e09c-7d59-a556-a527e7252d78` 已按明确 ID 关闭；复查本 session 只剩父 block `block:01a1af49-22e2-7bfe-b2e6-2984426ea5df`。前后快照保存在门禁目录的 `parent-blocks.json` / `parent-blocks-after.json`。未修改其他 session。
- `t3-pane-config` worktree 保留在 `/Users/qiangwenjun/.pi/rex-agents/worktrees/pi-rex-agents/t3-pane-config`；管理器报告 source repo 在当前 cwd containment 之外，因此未删除。没有修改该 worktree、主 checkout 或上游 checkout。
- `.pi/settings.json` 保持 `S`（skip-worktree），未修改、未暂存；`released.json` 未修改；无暂存改动、无根目录空目录。T3 不提交，按规则停止等待下一步指示。

### T2b 完成：按 F11 统一父端白名单，真实压缩工具验证通过

本轮修正与最终实现：

- 监督已确认上轮真实验证使用了未重载的旧父内核，并在本轮开始前执行 `/reload`。按 `docs/p4/rex-facts.md` 的 F11，保留父端 `resolveContextTools` 注册表及 `extraTools` 路径；删除未提交的 `maestro/adapters/pi/child/context-tools.ts`、`subagent-done.ts` 中的激活调用和对应假 Pi 激活测试，交互 handoff 同样只通过父端白名单启用。
- fresh、resume（`maestro/adapters/pi/launch-resume.ts`）、persistent、交互 handoff 均携带父端已注册的压缩工具；显式 denied 优先；未安装 provider 时不添加工具，保留 Pi 原生 auto-compaction；不改变保存的用户 tools 策略。父端发现通过 runtime barrel 导出，保留架构边界。
- 新增父端启动命令矩阵，覆盖已安装、未安装、compress 被拒绝三种情况及全部四条启动路径；handoff 断言不加载 child 激活扩展或完成协议。注册表/allowlist 针对性测试 7 passed，启动路径针对性测试 10 passed，均为 0 failed、0 skipped。
- 同步工具参数说明、生成文档及 schema 快照、README、配置文档、handoff 文档和 AGENTS 代码地图；将监督新增的 F11 与修订后的 T2b 任务卡一并提交。下方两轮失败记录保留为历史，其诊断建议已由本轮监督结论和修正替代。

最终正式门禁（没有降低或修改基线）：

- `npm run typecheck`、`npm run lint`、`npm run format:check`（148 个文件）、`npm run docs:tools:check`、`git diff --check`：全部通过。
- `docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t2b-f11-gate.Z4ESzk`：通过，未覆盖默认 `MIN_TESTS=1155`。第 1 轮 `1171 tests / 1151 pass / 10 fail / 10 skipped`，第 2 轮 `1171 tests / 1153 pass / 8 fail / 10 skipped`，退出码 0，脚本输出 `OK：没有持续性新增失败`。第 1 轮三个暂定新增失败未持续；第 2 轮失败属于既有允许集合，不能将 raw npm test 描述为零失败。
- 原始门禁输出、两轮测试日志及 test-gate 退出码保存在 `/tmp/pi-rex-agents-p4-t2b-f11-gate.Z4ESzk`（`console.log`、`run1.log`、`run2.log`、`exitcode` 及各静态检查日志）。
- `npm pack --dry-run --json`：通过，163 个文件。新 `maestro/adapters/pi/context-tools.ts` 被包含；不存在已删除的 child 激活模块，没有本地配置、凭据或会话证据入包。

真实门禁（当前 Rex 会话，本轮仅一个只读验证子代理）：

- `t2b-f11-test`，ID `0943a09b-ef89-4596-9fe6-6629701b82b4`；请求和实际模型均为 `CBAPI/cn:deepseek-v4.1-flash`，`thinking=low`、`tools=read,bash`、`fork=false`。没有派出实现子代理，所有代码修改均由主会话完成。
- 先检查启动脚本 `/Users/qiangwenjun/.pi/agent/sessions/--Users-qiangwenjun-Documents-project-pi-rex-agents-p4--/artifacts/01a1af49-443d-73f4-b681-23609c7191c0/subagent-scripts/t2b-f11-test-0943a09b-ef89-4596-9fe6-6629701b82b4.sh`，实际参数为 `--tools 'read,bash,compress,decompress,search_context,acp_status,caller_ping'`。
- 再核验 session `/Users/qiangwenjun/.pi/agent/sessions/--Users-qiangwenjun-Documents-project-pi-rex-agents-p4--/2026-11-06T06-11-48-855Z_0943a09b-ef89-4596-9fe6-6629701b82b4-34cd4783-30728f76-7120.jsonl`：第 2 行模型记录匹配指定模型；第 4 行首轮工具快照包含上述全部工具。
- 第 6 行：`toolCall name=acp_status arguments={}`，ID `call_00_DMDh25vaksAmeRCtc10e4525`。第 7 行：对应 `toolResult toolCallId=call_00_DMDh25vaksAmeRCtc10e4525 toolName=acp_status isError=false`。结果摘录：`ACTIVE SURFACE: pack=lean v1.0.0 | host=billion-context-pi 0.1.83`，`Estimate: 13.5k (4%)`。全文件恰好一次 toolCall 和一次 toolResult，没有其他工具调用。
- 子 block `block:01a1af7c-1aaa-772f-b2f9-bf06505d2596` 已自动清理。只读核对前后 block 列表完全一致，均仅包含父 block `block:01a1af49-22e2-7bfe-b2e6-2984426ea5df`；没有关闭任何其他 block。
- 筛选证据及前后快照保存在同一门禁目录的 `live-evidence.json`、`blocks-before.json`、`blocks-after.json`、`rex-before.json`、`rex-after.json`、`postflight.json`，原始会话和这些证据均未暂存入库。

提交与清理：

- `rex ls --json` 无测试会话；系统临时目录无 `pira-lab-*` 或 `pi-integ-*`；无本轮子进程、lab 或集成测试进程残留。只保留原有 Rex 主服务器，未修改其他 session。
- `.pi/settings.json` 保持 `S`（skip-worktree），没有修改或暂存；没有修改主 checkout 或上游 checkout，没有合并或推送。根目录空目录检查通过。
- 提交信息：`P4.T2b: guarantee context-compression tools in every subagent`。本轮只完成 T2b，停在此处，不开始 T3。

### T2b 继续：runtime 分层修复通过，真实工具激活验证失败

按监督指令进行的修复：

- `maestro/runtime/index.ts` 新增 `export { resolveContextTools } from "../adapters/pi/context-tools.ts";`，`pi-extension/subagents/launch.ts` 改为从 `../../maestro/runtime/index.ts` 导入。没有修改 `test/maestro/dependency-rule.test.ts`；没有发现 runtime barrel 的独立出口集合约束。
- `node --experimental-strip-types --test test/maestro/dependency-rule.test.ts`：14 passed、0 failed、0 skipped，之前的两项跨层 import 回归均消除。
- 在静态门禁和 test-gate 全部通过之后，按本轮明确授权、在提交前派出唯一的只读验证子代理 `t2b-test`；没有派出实现子代理。

本轮正式门禁：

- `npm run typecheck`、`npm run lint`、`npm run format:check`（149 文件）、`npm run docs:tools:check`、`git diff --check`：全部通过。
- `npm pack --dry-run`：通过，164 个文件，两个新 adapter 模块均包含；无本地配置或会话证据。
- `docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t2b-fixed-gate.DWhoCZ`：通过，未覆盖 `MIN_TESTS=1155`。首轮 `1171 tests / 1154 pass / 7 fail / 10 skipped`，脚本输出 `OK：没有持续性新增失败`，退出码 0。原始输出见该目录的 `console.log`、`run1.log` 和 `exitcode`。
- **真实 `acp_status` 门禁失败**，因此本轮不提交，也不继续修复或重试真实子代理。

真实验证证据：

- 子代理：`t2b-test`，ID `3e364dd2-a552-4124-b8ad-518165c9c644`；请求和实际模型均为 `CBAPI/cn:deepseek-v4.1-flash`，`thinking=low`，`tools=read,bash`，`fork=false`。任务仅要求一次 `acp_status({})` 后退出，不允许其他工具调用或实现工作。
- 子 session：`/Users/qiangwenjun/.pi/agent/sessions/--Users-qiangwenjun-Documents-project-pi-rex-agents-p4--/2026-11-06T05-45-45-170Z_3e364dd2-a552-4124-b8ad-518165c9c644-e88864bc-bc6697c6-eaca.jsonl`。
- JSONL 第 2 行确认 `provider=CBAPI`、`modelId=cn:deepseek-v4.1-flash`。第 4 行首轮 system 工具快照摘录：`message.toolsAdded[*].name = ["read", "bash", "caller_ping"]`；没有 `compress`、`decompress`、`search_context` 或 `acp_status`。
- 全文件统计：所有 toolCall 为 0、所有 toolResult 为 0；`acp_status` toolCall 和结果均为 0，不能提供成功调用摘录。第 6 行子代理返回：`acp_status 未启用：我的工具清单只有 read、bash、caller_ping`，并报告验证失败，没有尝试替代工具。
- 启动脚本：`/Users/qiangwenjun/.pi/agent/sessions/--Users-qiangwenjun-Documents-project-pi-rex-agents-p4--/artifacts/01a1af49-443d-73f4-b681-23609c7191c0/subagent-scripts/t2b-test-3e364dd2-a552-4124-b8ad-518165c9c644.sh`。明确加载 `-e '/Users/qiangwenjun/Documents/project/pi-rex-agents-p4/maestro/adapters/pi/child/subagent-done.ts'`，实际启动白名单是 `--tools 'read,bash,caller_ping'`。父端本次未追加压缩工具；尚未通过重载父会话验证父端新代码。
- activity 证据的 `phase=done`、`turnIndex=0`，确认首轮已正常结束；模型完成不等于上下文工具门禁通过。
- 子 block：`block:01a1af64-3e88-75b4-8190-ebd89407e438`。返回报告后执行只读 `rex block ls -s "$REX_SESSION" --json`，确认该 block 已消失；`blocks-before.json` 与 `blocks-after.json` 均只包含父 block `block:01a1af49-22e2-7bfe-b2e6-2984426ea5df`，不需要额外关闭其他 block。
- 筛选后的会话证据与 block 前后快照保存在 `/tmp/pi-rex-agents-p4-t2b-fixed-gate.DWhoCZ/live-evidence.json`、`blocks-before.json`、`blocks-after.json`；原始会话和证据均未暂存入库。

判断与建议：

- 确认了真实首轮工具没有自动启用；现有假 Pi 的 `session_start` spy 测试不足以证明真实运行时生效。尚未定位是注册列表、事件时机、激活被覆盖或其他扩展交互；不能根据子代理的“没有注册”表述断定 provider 没有安装。
- 下一轮建议先核对真实 Pi 的工具注册与 `session_start` 激活次序；如确认该时机的激活被覆盖，按任务卡改在第一次 `before_agent_start` 做，并重新执行规定门禁。当前仅记录建议，没有实施或再次派出子代理。
- 按“门禁失败时停止”规则，本轮在真实验证失败处停止。分层修复保留在未提交工作区；T2b 仍未完成，不开始 T3。

### T2b：上下文工具保障已实现，架构门禁失败后停止

实现与范围（全部留在 `p4-kernel` 的未提交工作区）：

- 新增 `maestro/adapters/pi/context-tools.ts`，按 `compress` marker 识别 billion-context，仅返回已注册的 `compress`、`decompress`、`search_context`、`acp_status` 和可选 `acp_rule`，结果去重且顺序稳定；未安装 provider 时不改工具或 Pi 原生 auto-compaction。
- 新增 `maestro/adapters/pi/child/context-tools.ts`，由普通/persistent 子代理的 `session_start` 启用缺失工具，保留既有 active tools，并尊重 `parseDeniedTools`。交互 handoff 单独加载这个小扩展，避免加载子代理完成协议。
- `buildSubagentToolAllowlist` 新增可选 `extraTools`，fresh、resume、persistent 和 handoff 启动链传递父端发现的工具；不限制 `tools` 时仍返回 `null`，不重写保存的用户工具策略。
- 更新 `subagent.tools` 说明，已运行 `npm run docs:tools`；同步 README、配置文档、worktree handoff 文档和 AGENTS 代码地图。新增 `test/maestro/context-tools.test.ts`，补充 fresh/resume 启动命令与 handoff 扩展断言。

正式门禁前的针对性检查：

- `node --experimental-strip-types --test test/maestro/context-tools.test.ts`：15 passed、0 failed、0 skipped。
- `node --experimental-strip-types --test --test-name-pattern='keeps compression tools visible|forks the active conversation and focuses after launch' test/launch.test.ts`：2 passed、0 failed、0 skipped。
- 开发期间曾修正测试夹具自身的 persistent shutdown 计时器清理、以及 mock transport 不创建 resume session 文件的问题；没有删除或放宽产品断言。

正式门禁结果：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run format:check`：通过，检查 149 个文件。
- `npm run docs:tools:check`：通过。
- `git diff --check`：通过。
- `npm pack --dry-run`：通过，164 个文件；检查清单确认两个新 adapter 模块被包含，没有打入本地配置、凭据或会话证据。
- `docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t2b-gate.jdTnjw`：**失败，退出码 1**。未覆盖 `MIN_TESTS`，沿用脚本的 1155；三轮均为 `1171 tests / 1150 pass / 11 fail / 10 skipped`。脚本最终判定下列两个测试三轮持续失败，属于新增回归：
  - `overall enforcement has no violations`
  - `pi-extension never imports adapters or surfaces directly`
- 完整输出和三轮日志：`/tmp/pi-rex-agents-p4-t2b-gate.jdTnjw/console.log`、`run1.log`、`run2.log`、`run3.log`。

根因和后续建议：

- 两项失败都指向同一个新增 import：`pi-extension/subagents/launch.ts:2` 的 `import { resolveContextTools } from "../../maestro/adapters/pi/context-tools.ts";`。
- 架构检查原文：`pi-extension/subagents/launch.ts: forbidden import ../../maestro/adapters/pi/context-tools.ts`。这是本轮父端可见性实现越过 host → runtime → adapter 边界造成的确定性回归，与既有允许失败或墙钟超时无关。
- 建议后续将父端 provider 解析放到 `maestro/runtime/` 内，经已有 runtime seam 传递已注册工具名；保持 adapter 内的注册表、子端第一轮激活逻辑和架构检查不变。按照工作规则，本轮不继续修复、不重跑 test-gate，等待用户指示。

真实验证与收尾：

- 因正式门禁失败，**没有提交，也没有派出任何子代理**；任务卡要求的 `CBAPI/cn:deepseek-v4.1-flash` / `tools: "read,bash"` / `acp_status` 真实验证尚未执行。因此目前只有假 Pi 的 `session_start` 激活证据，不能声称真实 Pi 激活或 JSONL 验证已通过。
- 没有创建 block/window/lab；只读 `rex ls --json` 核验没有 `pira-lab-*` / `pi-integ-*` 会话，系统临时目录也没有相应根目录；没有遗留本轮 gate/integration 进程，未触碰其他 Rex session 的 block。Rex listing 保存在同一日志目录的 `rex-ls.json`。
- `.pi/settings.json` 仍为 `S`（skip-worktree），本轮没有修改或暂存。没有修改主 checkout 或上游 checkout，没有合并或推送。
- 根目录空目录检查通过。T2b 保持未提交、未完成状态；不开始 T3。

### T2：Rex provider 入内核，删除 Herdr/sidebar/Windows

实现与范围：

- 将 `src/rex-cli.ts`、`src/rex-surface-provider.ts`、`src/uncertainty.ts`、`src/git.ts`、`src/worktree.ts` 迁移到 `maestro/surfaces/rex/`，并更新内核与测试导入；新增 Rex provider conformance 和 fake Rex CLI provider 测试。
- `PiRunSession` 默认从 `REX_SESSION`/`REX_BLOCK` 构造 `RexSurfaceProvider`，删除 `HERDR_SOCKET_PATH`、delegated marker 和 Herdr surface 依赖；lifecycle 状态源改为 `surface`。
- 删除 Herdr surface、sidebar、release/role-pack 和 Windows-only 路径及其专属测试；保留 T1 已迁移的 `test/verify-lab-guards.test.ts`，它继续覆盖 `.pi/skills/verify-pi-rex-agents/scripts/path-guards.ts`。`package.json` 默认测试脚本现明确包含 `test/test.ts`、`test/worktree-cleanup.test.ts`、`test/launch.test.ts` 和 `test/verify-lab-guards.test.ts`；此前漏掉这些通用测试是本次返工修正的原因。恢复 `test/integration/hang-advisory.test.ts`，并将 `test/integration/audit-stop.test.ts` 及其 child-only shutdown fixture 迁移到 Rex harness。
- `test/test.ts` 中删除的 Herdr/role-pack 专属用例为：`discovers and launches a Pi package role pack without repeated role names`、`removes role-pack listeners when their extension instance shuts down`、`rejects ambiguous package-layer role names with actionable diagnostics`、`keeps child Herdr list formatting, handoff dispatch, and silent startup`；以及 `herdr.ts` 套件中的 CLI stderr、`isHerdrAvailable`、命令构造、响应解析、process exit confirmation 全部 Herdr-only 用例。T2 还改写了 `test/test.ts` 的 subagent discovery 和 self-spawn fixture：显式注入不可用 fake surface，并隔离全局 runtime/`REX_*` 环境，以继续验证 role precedence、self-spawn 和 depth guard，不删除这些通用用例。`test/integration/` 的 persistent、placement、cancel、lifecycle 已改用 Rex harness。
- 从 T1 到 T2 删除的专属测试文件及用例数（按源文件中的 `it`/`test` 用例统计）为：`test/integration/harness-conformance.test.ts` 4（旧 Harness conformance）、`test/integration/mux-surface.test.ts` 10（Herdr/mux surface）、`test/integration/sidebar-lifecycle.test.ts` 7、`test/integration/sidebar.test.ts` 9（sidebar）、`test/integration/surface-conformance.test.ts` 1（旧 surface）、`test/maestro/async-io.test.ts` 3（旧异步 I/O）、`test/maestro/audit-herdr-dispatch.test.ts` 2、`test/maestro/audit-ownership.test.ts` 12、`test/maestro/delegated-marker.test.ts` 21、`test/maestro/git-handoff-async.test.ts` 4、`test/maestro/herdr-cli.test.ts` 5、`test/maestro/herdr-lab.test.ts` 14、`test/maestro/herdr-placement-async.test.ts` 10、`test/maestro/herdr-socket.test.ts` 14、`test/maestro/herdr-surface-provider.test.ts` 13、`test/maestro/opened-primary-workspace.test.ts` 18、`test/maestro/script-launch.test.ts` 33、`test/maestro/sidebar-fixture-ownership.test.ts` 22、`test/package-manifest.test.js` 11（Herdr package manifest）、`test/release-workflow.test.ts` 7（release workflow）、`test/sidebar-plugin.test.js` 24（sidebar plugin），合计 246 个。另删除 T2 专属 fixture/helper `test/fake-herdr-socket.ts`，以及 `test/bench/` 基准、Herdr lab/sidebar fixture；这些不计入测试用例数。`test/integration/audit-stop.test.ts` 与 `test/integration/hang-advisory.test.ts` 曾随旧 Harness 删除，现已恢复/迁移，因此不计为删除。
- 修复 macOS `/private/var` 与 `/var` 的语义等价路径断言：`test/maestro/audit-git-environment.test.ts` 使用 realpath，`maestro/runtime/worktree-operations.ts` 在 worktree 注册匹配时规范化 path。

门禁结果：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run format:check`：通过，检查 146 个文件。
- `npm run docs:tools:check`：通过。
- `git diff --check`：通过。
- `docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t2-restore-gate2`：两次均加载 `1155 tests / 1136 pass / 9 fail / 10 skipped`；第 1 次的两个暂定失败 `a fallback owner transferred after the cancel shows its own unconfirmed kill and stays live`、`public launch owns the four-argument advisory route and keeps duplicate and fresh evaluations cold` 未在第 2 次持续，输出 `OK：没有持续性新增失败`。`MIN_TESTS` 已从 554 调整为 1155。
- `node --experimental-strip-types --test --test-concurrency=1 test/integration/audit-stop.test.ts`：通过，macOS 按任务中的 Linux process identity 条件跳过 1 个测试；测试已使用 Rex compat harness，不再依赖 Herdr/mux。
- `npm run test:integration:rex`：通过，Rex smoke 和 RexSurfaceProvider conformance 共 10 tests、0 failed、0 skipped。
- T2 Herdr 扫描剩余 44 条，均为后续 T4/T6 处理的历史身份、配置命名或源头文案；扫描结果已保留在本轮 `/tmp/pi-rex-agents-p4-t2-herdr.txt`。

真实 Rex 探针：

- 当前 Rex 会话普通 p1：通过，父会话存活，报告为 `P1_CHILD_OK`。
- 当前 Rex 会话 `p1:persistent`：通过，第一轮 `P1_CHILD_OK`、第二轮 `P1_SECOND_OK`，随后 `subagent_stop` 成功请求停止。
- 当前 Rex 会话 p2：通过，`cancel=confirmed`、`interrupt=interrupt_requested`、`resume=P2_RESUMED_OK`，父会话存活。
- 隔离 lab：`doctor`、`up`、`down` 通过；lab p1 启动子 Pi 时因隔离 `models.json` 没有 `CBAPI/cn:deepseek-v4.1-flash`，子进程报告 `Error: Model "CBAPI/cn:deepseek-v4.1-flash" not found`，未将该次作为通过证据；随后 `down` 报告 `labRootExists=false leftoverPids=none`。当前 Rex 会话探针已满足任务卡的“lab 或当前 Rex 会话”要求。
- T2 创建的 Rex windows、blocks、lab 临时目录和进程均已清理；`rex ls` 中没有 `pira-lab-*` 资源。

判断：T2 返工后的全部门禁通过，待创建修正提交。按用户监督指令停在 T2，等待用户从 p4 worktree 启动新的 Pi；不开始 T2b。

### T0：门禁失败，停止

本轮在 `/Users/qiangwenjun/Documents/project/pi-rex-agents-p4`（分支 `p4-kernel`）执行了 T0 的本地化实现：复制 T0 要求的 `pi-herdr-agents 3.7.2` 基线内容，写入 `docs/UPSTREAM.md`，建立本地 `package.json`、`tsconfig.json` 和 `package-lock.json`，并将 `src/extension.ts`、`src/infrastructure.ts`、`src/placement.ts` 的上游包名导入改为本地相对导入。上游 `/Users/qiangwenjun/Documents/project/pi-herdr-agents` 在执行前核验为干净的 `main` 分支，HEAD 为 `e1e7d72834bfaff70ba39a7ec2ffd437b44c2134`；没有修改上游或主 checkout。

依赖安装：

- 命令：`cd /Users/qiangwenjun/Documents/project/pi-rex-agents-p4 && npm install`
- 结果：成功，新增 142 个包，审计发现 0 个漏洞；npm 提示 2 个包的 install scripts 尚未授权，但不影响安装完成。

按 T0 任务卡执行的门禁结果：

- `npm run typecheck`：失败，退出码 2。缺失 `scripts/tool-docs.ts`、`test/maestro/tool-schema.test.ts` 引用的 `scripts/tool-docs.ts`、`examples/role-pack/extension.ts`；同时出现 `test/maestro/tool-schema.test.ts` 的隐式 `any` 和不可迭代类型错误。完整关键错误包括：`Cannot find module './tool-docs.ts'`、`Cannot find module '../../scripts/tool-docs.ts'`、`Cannot find module '../examples/role-pack/extension.ts'`。
- `npm test`：失败，`912` 个测试中 `877` 通过、`25` 失败、`10` 跳过。失败原因包括上述文件缺失、`docs/roles.md` 缺失、`plugins/sidebar/sidebar.mjs` 缺失、`.github/workflows/ci.yml` 和 `.github/workflows/publish.yml` 缺失，以及 macOS `/private/var` 与 `/var` 路径差异导致的路径断言失败。
- `npm run lint`：通过。
- `npm run format:check`：通过。
- `bun src/smoke-extension.ts`：通过，输出 21 passed、0 failed。
- `src` 导入扫描：通过，未发现 `from "pi-herdr-agents...` 导入。

按 T0 任务卡要求，对照执行上游 `cd /Users/qiangwenjun/Documents/project/pi-herdr-agents && npm test`：上游依赖未安装，结果为 `403` 个测试、`370` 通过、`27` 失败、`6` 跳过；失败主要是缺少 `typescript`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`、`@sinclair/typebox`、`@earendil-works/pi-tui` 等依赖。该对照结果不能使目标 worktree 的 T0 门禁通过。

判断：T0 门禁未通过，按照工作规则停止，不开始 T1，不提交本轮未完成的 T0。当前目标 worktree 保留实现改动和失败记录，等待后续指示。

### T0 重跑：完整复制范围后的基线门禁失败

根据任务卡提交 `2fa8ac8`，重新读取了 `docs/p4/tasks/T0-vendor-baseline.md` 以及 `docs/p4/baseline/check-failures.sh`、`inherited-failures.txt`、`flaky.txt`、`expected-identity.txt`。未在上游 checkout 安装依赖或运行测试。

在目标 worktree 中按上游 `e1e7d72` 的 `git ls-files` 完整复制了 264 个文件，保留目标仓库的 `package.json`、`tsconfig.json`、`README.md`、`.gitignore`，并保留 `LICENSE-pi-herdr-agents` 的改名规则。缺失的 `scripts/tool-docs.ts`、`examples/role-pack/`、`docs/roles.md`、`plugins/sidebar/`、`.github/workflows/`、`CHANGELOG.md`、`RELEASING.md` 等文件均已补齐。

门禁结果：

- `npm run typecheck`：通过。
- `npm test`：退出码非零，但完整加载了 `1452` 个测试；结果为 `1419` 通过、`23` 失败、`10` 跳过。
- `docs/p4/baseline/check-failures.sh /tmp/pi-rex-agents-p4-t0.log`：失败，报告两个不在允许失败集合中的新增失败：`local evidence keeps the host presentation cold while pane observations still redraw` 和 `public resume rejected-send preserves late-read demand and delivery retention`。
- 第一项错误为 `AssertionError [ERR_ASSERTION]: actual Pi attempt did not settle`，位置为 `test/test.ts:712`、`test/test.ts:906`。
- 第二项错误为 `AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: assert.ok(Date.now() < deadline)`，位置为 `test/test.ts:2498`。
- 由于基线脚本报告新增失败，本次重跑未继续执行 `npm run lint`、`npm run format:check`、`bun src/smoke-extension.ts` 和导入扫描；按规则在失败门禁处停机。此前复制范围不完整时这些门禁曾通过，但不能替代本次完整复制后的门禁结果。

判断：T0 的复制范围问题已修正，typecheck 和测试加载数量已达到任务卡要求；当前仍因基线脚本判定两个新增测试失败而未通过 T0。按规则不开始 T1、不提交 T0，保留目标 worktree 改动和 `/tmp/pi-rex-agents-p4-t0.log` 供后续处理。

### T0 最终重跑：test-gate 门禁通过

根据提交 `4dc8c26` 更新后的判定规则，运行了：

`cd /Users/qiangwenjun/Documents/project/pi-rex-agents-p4 && docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t0-gate`

结果：

- 第 1 次运行：`1452 tests / 1420 pass / 22 fail / 10 skipped`，暂定一个超出基线失败：`launches a frontmatter-only named role without a caller systemPrompt`。
- 第 2 次运行：`1452 tests / 1420 pass / 22 fail / 10 skipped`，该失败未持续出现。
- `test-gate.sh` 输出：`OK：没有持续性新增失败`。
- 测试总数为 `1452`，达到 T0 要求的至少 `1452`。

补跑剩余门禁：

- `npm run lint`：通过。
- `npm run format:check`：通过，检查 170 个文件，无需修改。
- `bun src/smoke-extension.ts`：通过，工具清单完整，`missing` 为空。
- `grep -rn 'from "pi-herdr-agents' src`：通过，无匹配。

提交前的附加 `git diff --cached --check` 检查发现两个原样复制的上游文档存在既有行尾空格：`docs/research/pi-worktree-session-handoff.md:3` 和 `docs/research/worktree-subagent-orchestration.md:5`。T0 要求原样入库且不改文档行为，因此保留该上游内容；它不属于 T0 任务卡门禁。

结论：T0 全部门禁通过，已创建提交 `41af43a2c17ae86ec7c5e57b3c1989c6b71147a8`。未在上游 checkout 安装依赖或运行测试；主 checkout 和上游 checkout 未修改。

### T1：Rex lab、集成 harness、验证技能

实现内容：

- `src/rex-cli.ts` 新增 `buildRexArgv()`；所有 Rex CLI 调用显式加入 `--autostart=false`，并在 `REX_SERVER` 存在时显式加入 `-S <endpoint>`，保持 shell-free 和用户参数顺序。
- 新增 `test/rex-cli.test.ts`，覆盖有/无 `REX_SERVER`、argv 顺序和用户参数不被改写。
- 新增 `test/integration/rex-harness.ts` 与 `test/integration/rex-smoke.test.ts`，使用 deterministic fake-provider，通过真实父 Pi、`subagent` 工具、报告投递、子 session 和 block 生命周期验证 Rex 路径。
- 新增 `.pi/skills/verify-pi-rex-agents/`（含 `lab.ts`、`path-guards.ts`、`pin.ts` 和验证说明），删除复制来的 `.pi/skills/verify-pi-herdr-agents/`；更新 `.pi/skills/run-integration-tests/SKILL.md` 为 Rex preflight/postflight。
- `lab.ts` 遵守 F8：使用 `mkdtemp(join(tmpdir(), "pira-lab-"))`，短 Unix socket，以 `REX_SERVER=unix://<lab>/s` 启动独立 Rex server，并在 lab block 内执行 `rex whoami --json` 校验 endpoint；`down` 清理 lab server、session、block 和临时目录。
- 重写 `AGENTS.md` 为 Rex 版本，增加代码地图、验证流程和提交检查。
- `package.json` 增加 `test:integration:rex`（`--test-concurrency=1`），并把 Rex CLI 单测加入默认测试脚本。

T1 门禁：

- `docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t1-gate`：通过。第 1 次为 `1455 tests / 1424 pass / 21 fail / 10 skipped`，第 2 次为 `1455 tests / 1425 pass / 20 fail / 10 skipped`；暂定新增失败未持续，脚本输出 `OK：没有持续性新增失败`。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run format:check`：通过，检查 173 个文件。
- `npm run docs:tools:check`：通过。
- `node --experimental-strip-types --test test/rex-cli.test.ts test/verify-lab-guards.test.ts`：22 passed、0 failed。
- `node --experimental-strip-types .pi/skills/verify-pi-rex-agents/scripts/pin.ts`：通过，生成 `/tmp/pi-rex-agents-t1-pin.json`。
- `npm pack --dry-run`：通过；当前仍包含 T0 基线中的 Herdr、sidebar、role-pack 和 release 文件，按计划留待 T2/T6 删除和收尾。
- `git diff --check`：通过。

真实 Rex lab 门禁：

- `lab.ts doctor`：通过。Rex `0.0.1793741575-g1b6654`、Pi `1.5.0`、Node `v26.7.0`、当前 `REX_SESSION=session:01a1ad74-819e-77df-b7f6-ab986b5e5126` 和当前 block 均核验通过。
- `lab.ts up`：通过，lab root 为 `/var/folders/7h/6mfm49q94tgctb4rr8vvn86w0000gn/T/pira-lab-2QkyM9`。
- `lab.ts drive`：通过。whoami endpoint 为 `unix:///var/folders/7h/6mfm49q94tgctb4rr8vvn86w0000gn/T/pira-lab-2QkyM9/s`；父 Pi 收到 `<subagent_report from="RexSmoke">`，子 session 存在，子 block 从 `block:01a1add1-9c36-730d-8d57-829d40408d94` 出现后清理，父进程继续运行。
- `lab.ts down`：通过，输出 `labRootExists=false leftoverPids=none`。
- `npm run test:integration:rex`：通过，1 passed、0 failed、0 skipped。
- postflight：`rex ls` 未发现 `pira-lab-*` 或 `pi-integ-*` 资源；临时目录、lab current 文件和 lab/test integration 进程均无残留。未触碰 `session:01a1ad74` 中的其他 block。

结论：T1 全部门禁通过，准备创建提交。未修改主 checkout 或上游 checkout。