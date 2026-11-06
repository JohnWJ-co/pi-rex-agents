# T3 placement 原生化、maxPerTab=2、split 计数下沉

## 步骤
1. `pi-extension/subagents/launch-tools.ts`（以及 catalog 中的参数定义）：`subagent` 和 `subagent_resume` 的 TypeBox schema 原生加入 `placement: "split" | "tab"`（描述用 Rex 术语，与当前 `src/rex-host-api.ts` 中的 `PLACEMENT_PROPERTY` 语义一致），沿 launch 调用链显式传参直到 `createPane`。
2. `maestro/core/config/pane-config.ts`：`PaneMode` 只保留 `"split" | "tab"`，默认 `{ mode: "split", direction: "right", maxPerTab: 2 }`；`maxPerTab` 只接受 1..8 的整数，否则报 `invalidPaneConfig`。删除 grouped pane factory 和相关测试；更新 `config.json.example`。
   配置路径隔离提前纳入 T3：`pi-extension/subagents/config-path.ts` 改读 `$PI_CODING_AGENT_DIR/rex-agents/config.json`（默认 `~/.pi/agent/rex-agents/config.json`）；不读取、不迁移旧 `herdr-agents/config.json`，缺省使用 split/right/2。增加旧路径含 grouped 配置仍可加载内核的回归测试；其余命名收尾仍留 T6。
3. split 上限下沉到内核 placement reservation：计数 = 本父进程登记表中、位于父 block 所在 window、`provider.listSurfaces()` 确认仍然存活的 split child；在 reservation 队列内检查和预留；超限改为 tab。`/reload`（新建 run session、旧登记表恢复）后计数仍然正确。
4. 删除 `src/placement.ts`、`src/infrastructure.ts` 中的 split 计数，以及 `src/rex-host-api.ts` 中的 placement 注入（文案代理留给 T4）。
5. 工具 schema 契约：`npm run docs:tools` 重新生成 `test/fixtures/tool-schema/current.json` 和 `docs/tools.md` 的标记块。新增 placement 属于兼容扩展；若 `released.json` 比较报 breaking，在 STATUS.md 说明原因，然后**用户确认后**才更新 `released.json`（hard fork 的首个基线可以以 T3 结束时的 schema 为准，需要说明）。
6. 单测：配置默认值 2、0 和 9 及非整数报错、split→split→tab、关闭一个后回到 split、并发两个 launch 不超额、模拟 reload 后计数保持。

## 门禁
- typecheck、`npm test`（用 `docs/p4/baseline/test-gate.sh` 判定）、lint、`docs:tools:check`。
- 集成：新增 `test/integration/rex-placement.test.ts`，在 lab 中验证第 1、2 个 split 在父 window，第 3 个开新 window，关掉 1 个后下一个回到 split。

## 提交
`P4.T3: native placement parameter and kernel-owned split cap (default 2)`
