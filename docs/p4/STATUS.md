# P4 进度

规则：
- 只在 `/Users/qiangwenjun/Documents/project/pi-rex-agents-p4`（分支 `p4-kernel`）中工作，绝不修改主 checkout `/Users/qiangwenjun/Documents/project/pi-rex-agents`，也不修改上游 `/Users/qiangwenjun/Documents/project/pi-herdr-agents`。
- 按 T0→T6 顺序执行。每个任务完成后：更新本文件（完成项、门禁结果、提交 hash、偏差说明），然后提交。
- 门禁失败时停止，不要跳过或弱化门禁；在本文件写明失败的命令、输出摘要、你的判断和建议，然后结束本轮等待指示。
- 真实 Rex 测试结束后清理所有自己创建的 block/window/lab，不要动用户的其他 block。
- 不合并、不推送、不改 `released.json`（T3 需要用户确认的情况除外）。

| 任务 | 状态 | 提交 | 备注 |
|---|---|---|---|
| T0 | 已完成，门禁通过 | 待提交 | 完整复制范围已修正；test-gate 最终通过，1452 个测试已加载 |
| T1 | 待开始 | | |
| T2 | 待开始 | | |
| T3 | 待开始 | | |
| T4 | 待开始 | | |
| T5 | 待开始 | | |
| T6 | 待开始 | | |

## 日志

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

结论：T0 全部门禁通过，准备创建提交。未在上游 checkout 安装依赖或运行测试；主 checkout 和上游 checkout 未修改。