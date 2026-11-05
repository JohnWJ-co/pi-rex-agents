# T0 原样入库内核 + 上游 Harness 工具（行为不变）

## 目标
本仓库不再依赖 npm 包 `pi-herdr-agents`，内核源码进入本仓库，行为与 fork 前完全一致。这是之后所有任务的对照基线。

## 来源
`/Users/qiangwenjun/Documents/project/pi-herdr-agents`，基线 commit `e1e7d72`（版本 3.7.2）。复制前先执行 `git -C <src> status` 确认工作区干净且 HEAD 为 `e1e7d72`；不一致就停下，记录到 STATUS.md。

## 步骤
1. 复制到本仓库根目录（保持相对路径）：`maestro/`、`pi-extension/`、`test/`（全部，包括 integration、fixtures、helpers）、`tools/oxlint/`、`scripts/update-tool-docs.ts`、`oxlint.config.ts`、`biome.json`、`config.json.example`、`CONTEXT.md`、`docs/{tools,configuration,delegation-outcome-contract,worktree-subagents,troubleshooting,development}.md`、`docs/adr/`、`.pi/skills/verify-pi-herdr-agents/`、`.pi/skills/run-integration-tests/`、`skills/pi-herdr-agents/`。
2. 不复制：`plugins/`、`.pi/skills/release/`、`RELEASING.md`、`CHANGELOG.md`、`.github/`、`examples/`、`docs/research/`、`docs/assets/`、各种 plan 文档。
3. 新增 `docs/UPSTREAM.md`：基线仓库、commit、版本、MIT 许可原文（复制上游 LICENSE 为 `LICENSE-pi-herdr-agents`），以及"本仓库是 hard fork，不追上游"的说明。
4. `package.json`：删除 `pi-herdr-agents` 依赖；按上游 package.json 补齐 peer/dev 依赖（`@earendil-works/pi-ai`、`@earendil-works/pi-tui`、`@sinclair/typebox`、`@biomejs/biome`、`oxlint`、`@oxlint/plugins`、`typescript@5.9.3`）；加入上游的 `test`、`test:integration`、`lint`、`format`、`format:check`、`docs:tools`、`docs:tools:check` 脚本（路径不变）。保留现有 `p0/p1/p2/doctor/check` 脚本。
5. `src/*.ts` 中所有 `pi-herdr-agents/...` import 改为相对路径（`../maestro/...`、`../pi-extension/...`），其余一行不改。
6. tsconfig：合并上游 tsconfig 的 include 与 strict 设置，让 `maestro/ pi-extension/ test/ scripts/ src/ .pi/skills/` 都被检查。
7. `npm install`。

## 门禁
- `npm run typecheck` 通过。
- `npm test`（上游单测）全绿；把通过数、失败数写进 STATUS.md。若有失败，先确认在上游仓库是否同样失败（在 `<src>` 跑同一条测试）；上游也失败的记录为"继承失败"，不修。
- `npm run lint`、`npm run format:check` 通过（或记录继承问题）。
- `bun src/smoke-extension.ts` 通过（它应该加载到本地内核副本）。
- `grep -rn "from \"pi-herdr-agents" src` 为空。

## 不做
不删除任何 Herdr 代码，不改任何行为，不改文案。

## 提交
`P4.T0: vendor pi-herdr-agents 3.7.2 kernel and harness`
