# T2 Rex 成为唯一 surface，删除 Herdr

## 步骤
1. `src/rex-cli.ts` 和 `src/rex-surface-provider.ts` 迁到 `maestro/surfaces/rex/`（`rex-cli.ts`、`rex-surface-provider.ts`）；`src/` 中的引用改为新位置。
2. `maestro/runtime/pi-run-session.ts`：默认 provider 改为从 `REX_SESSION`/`REX_BLOCK` 构造的 `RexSurfaceProvider`；删除 `HERDR_SOCKET_PATH`、marker writer/reader 分支。保留 `infrastructure` 注入口（测试用 fake）。
3. 删除：`maestro/surfaces/herdr/`、`maestro/runtime/delegated-marker.ts`、`plugins/sidebar/` 与 `test/sidebar-plugin.test.js`、`.github/workflows/` 与 `test/release-workflow.test.ts`、`.pi/skills/release/`、`RELEASING.md`、`examples/role-pack/`（同时删除或改写引用它的测试），以及只测这些模块的测试（`test/maestro/herdr-*.test.ts`、`delegated-marker.test.ts`、`sidebar*`、`test/integration/{herdr-lab,sidebar*,mux-surface}.ts` 等）。**保留** `test/verify-lab-guards.test.ts`：T1 已把它改成测试 Rex lab 的 `path-guards.ts`。`test/test.ts` 中引用 Herdr 的用例：改成 fake provider 或删除，逐个在提交说明里列出。
4. `maestro/core/lifecycle.ts`：`source: "herdr"` 改为 `"surface"`；注释中的 "Herdr owns coarse turn state" 改为 surface（Rex 的 OSC 根记录，F1）。
5. 删除 Windows 分支：`script-shell.ts`、`script-launch.ts`、`supervision.ts`、`worktree-operations.ts`、`pi-run-session*.ts` 中的 `win32` 路径及对应测试。
6. `test/maestro/dependency-rule.test.ts`：`surfaces/herdr` 改为 `surfaces/rex`。
7. 新增 `test/maestro/rex-surface-provider.test.ts`：用一个假的 rex 可执行文件（脚本记录 argv、返回固定 JSON）测试 provider；把 `harness-adapter.conformance.ts` 中适用于 SurfaceProvider 的契约，对 fake 和 Rex（lab，集成测试）各跑一遍。
8. `src/infrastructure.ts` 暂时保留 split 上限逻辑（T3 删除）。
9. 同步 AGENTS.md 代码地图和 CONTEXT.md（Surface provider：Rex 是唯一实现）。

## 门禁
- typecheck、lint、format:check；`npm test` 用 `docs/p4/baseline/test-gate.sh` 判定（被删除测试对应的基线条目同步从基线文件中移除，并在 STATUS.md 说明）。
- `grep -rni herdr maestro pi-extension --include='*.ts' | grep -v '^\S*:\s*//'` 只允许剩下文案（T4 处理），在 STATUS.md 列出剩余条目数。
- `npm run test:integration:rex` 通过；`npm run p1`、`p1:persistent`、`p2` 在 lab 或当前 Rex 会话中通过（按 T1 技能执行，测完清理）。

## 提交
可以拆成多个：`P4.T2: move Rex provider into kernel`、`P4.T2: remove Herdr surface and sidebar marker`、`P4.T2: drop Windows paths`。
