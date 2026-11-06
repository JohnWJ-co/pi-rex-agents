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
| T2 | 已完成，门禁通过 | `9c12c05` | Rex provider 已入内核；Herdr/sidebar/Windows 专属路径已删除；保留 `test/verify-lab-guards.test.ts`；全部 T2 门禁通过 |
| T2b | 待开始 | | |
| T3 | 待开始 | | |
| T4 | 待开始 | | |
| T5 | 待开始 | | |
| T6 | 待开始 | | |

## 日志

### T2：Rex provider 入内核，删除 Herdr/sidebar/Windows

实现与范围：

- 将 `src/rex-cli.ts`、`src/rex-surface-provider.ts`、`src/uncertainty.ts`、`src/git.ts`、`src/worktree.ts` 迁移到 `maestro/surfaces/rex/`，并更新内核与测试导入；新增 Rex provider conformance 和 fake Rex CLI provider 测试。
- `PiRunSession` 默认从 `REX_SESSION`/`REX_BLOCK` 构造 `RexSurfaceProvider`，删除 `HERDR_SOCKET_PATH`、delegated marker 和 Herdr surface 依赖；lifecycle 状态源改为 `surface`。
- 删除 Herdr surface、sidebar、release/role-pack 和 Windows-only 路径及其专属测试；保留 T1 已迁移的 `test/verify-lab-guards.test.ts`，它继续覆盖 `.pi/skills/verify-pi-rex-agents/scripts/path-guards.ts`。`package.json` 默认测试脚本未引用该文件，引用关系保持一致。
- `test/test.ts` 中删除的 Herdr/role-pack 专属用例为：`discovers and launches a Pi package role pack without repeated role names`、`removes role-pack listeners when their extension instance shuts down`、`rejects ambiguous package-layer role names with actionable diagnostics`、`keeps child Herdr list formatting, handoff dispatch, and silent startup`；以及 `herdr.ts` 套件中的 CLI stderr、`isHerdrAvailable`、命令构造、响应解析、process exit confirmation 全部 Herdr-only 用例。`test/integration/` 的 persistent、placement、cancel、lifecycle 已改用 Rex harness。
- 修复 macOS `/private/var` 与 `/var` 的语义等价路径断言：`test/maestro/audit-git-environment.test.ts` 使用 realpath，`maestro/runtime/worktree-operations.ts` 在 worktree 注册匹配时规范化 path。
- 测试基线从 1452 调整到删除 T2 专属套件后的 554；保留 `test-gate.sh` 的双次运行和持续性失败判定。

门禁结果：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run format:check`：通过，检查 143 个文件。
- `npm run docs:tools:check`：通过。
- `git diff --check`：通过。
- `docs/p4/baseline/test-gate.sh /tmp/pi-rex-agents-p4-t2-gate-final`：第 1 次 `554 tests / 551 pass / 1 fail / 2 skipped`，暂定失败为 `cancelled resume callers still retire both owners on actual lazy-read rejection without getters`；第 2 次 `554 / 552 pass / 0 fail / 2 skipped`，输出 `OK：没有持续性新增失败`。
- `npm run test:integration:rex`：通过，Rex smoke 和 RexSurfaceProvider conformance 共 10 tests、0 failed、0 skipped。
- T2 Herdr 扫描剩余 44 条，均为后续 T4/T6 处理的历史身份、配置命名或源头文案；扫描结果已保留在本轮 `/tmp/pi-rex-agents-p4-t2-herdr.txt`。

真实 Rex 探针：

- 当前 Rex 会话普通 p1：通过，父会话存活，报告为 `P1_CHILD_OK`。
- 当前 Rex 会话 `p1:persistent`：通过，第一轮 `P1_CHILD_OK`、第二轮 `P1_SECOND_OK`，随后 `subagent_stop` 成功请求停止。
- 当前 Rex 会话 p2：通过，`cancel=confirmed`、`interrupt=interrupt_requested`、`resume=P2_RESUMED_OK`，父会话存活。
- 隔离 lab：`doctor`、`up`、`down` 通过；lab p1 启动子 Pi 时因隔离 `models.json` 没有 `CBAPI/cn:deepseek-v4.1-flash`，子进程报告 `Error: Model "CBAPI/cn:deepseek-v4.1-flash" not found`，未将该次作为通过证据；随后 `down` 报告 `labRootExists=false leftoverPids=none`。当前 Rex 会话探针已满足任务卡的“lab 或当前 Rex 会话”要求。
- T2 创建的 Rex windows、blocks、lab 临时目录和进程均已清理；`rex ls` 中没有 `pira-lab-*` 资源。

判断：T2 全部门禁通过，准备提交。下一任务是 T2b；按监督指令不再派出实现类子代理，代码修改在主会话完成。

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