# P4 进度

规则：
- 只在 `/Users/qiangwenjun/Documents/project/pi-rex-agents-p4`（分支 `p4-kernel`）中工作，绝不修改主 checkout `/Users/qiangwenjun/Documents/project/pi-rex-agents`，也不修改上游 `/Users/qiangwenjun/Documents/project/pi-herdr-agents`。
- 按 T0→T6 顺序执行。每个任务完成后：更新本文件（完成项、门禁结果、提交 hash、偏差说明），然后提交。
- 门禁失败时停止，不要跳过或弱化门禁；在本文件写明失败的命令、输出摘要、你的判断和建议，然后结束本轮等待指示。
- 真实 Rex 测试结束后清理所有自己创建的 block/window/lab，不要动用户的其他 block。
- 不合并、不推送、不改 `released.json`（T3 需要用户确认的情况除外）。

| 任务 | 状态 | 提交 | 备注 |
|---|---|---|---|
| T0 | 已完成，门禁通过 | `41af43a2c17ae86ec7c5e57b3c1989c6b71147a8` | 完整复制范围已修正；test-gate 最终通过，1452 个测试已加载 |
| T1 | 已完成，门禁通过 | `15cdafc` | Rex lab、集成 harness、验证技能和 AGENTS.md 已完成；test-gate 与真实 Rex smoke 通过 |
| T2 | 已完成返工，门禁通过 | `6202306` | 恢复通用测试并迁移 audit-stop 到 Rex harness；Rex provider 已入内核；Herdr/sidebar/Windows 专属路径已删除；保留 `test/verify-lab-guards.test.ts` |
| T2b | 已完成，门禁通过 | 本提交（P4.T2b） | 父端白名单覆盖 fresh/resume/persistent/handoff；真实 acp_status 调用及 block 清理通过 |
| T3 | 待开始 | | |
| T4 | 待开始 | | |
| T5 | 待开始 | | |
| T6 | 待开始 | | |

## 日志

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