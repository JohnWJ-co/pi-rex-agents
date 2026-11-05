# T4 源头文案、删除替换层、切换入口

## 步骤
1. 直接修改内核里所有面向模型或用户的文案（工具描述、参数描述、promptSnippet、投递消息、命令输出、错误信息、widget）：pane→block，workspace→window，Herdr→Rex，terminal tab→Rex tab；`herdr worktree remove --workspace X` 改为 `rex window close X`。以 `src/rex-wording.ts` 的替换表和 `src/wording-check.ts` 的断言为验收清单：每一条替换都要在源头落实。
2. 宿主提示：把 `src/extension.ts` 中的 `rexHostNotice` / `rexChildNotice` 并入 `pi-extension/subagents` 的 system prompt 逻辑。子代理不能再派生子代理：用内核的 delegation-depth / `spawning.maxDepth` 表达（Rex 下默认子代理是叶子，与当前行为一致），不在入口单独 return。
3. 入口切换：`package.json` 的 `pi.extensions` 改为 `./pi-extension/subagents/index.ts`；Rex 专属的组装（provider、worktree root、cleanup operations）放进内核的 composition root。`REX_SESSION`/`REX_BLOCK` 缺失时不注册工具（行为与现在一致）。
4. 删除 `src/rex-host-api.ts`、`src/rex-wording.ts`、`src/host-message.ts`、`src/host-message-check.ts`、`src/wording-check.ts`、`src/extension.ts`、`src/infrastructure.ts`（如果已经清空）。`src/` 只保留 p0/p1/p2 探针、doctor、git/worktree 工具；能移入 `maestro/` 或 `test/` 的就移过去。
5. 新增 `test/no-foreign-host.test.ts`：扫描 `maestro/`、`pi-extension/`、`skills/` 的字符串字面量和 Markdown，禁止出现 `herdr`、`Herdr`、`HERDR_`、`hc `（忽略注释、`docs/UPSTREAM.md`、`docs/adr/`）。
6. pin 对比：用 T1 的 `pin.ts` 对 T3 结束时的提交和当前树各跑一次，diff 只能出现预期的文案变化；在 STATUS.md 摘录 diff 摘要。

## 门禁
- typecheck、`npm test`、lint、`docs:tools:check`、no-foreign-host。
- `bun src/smoke-extension.ts`（或迁移后的等价测试）通过。
- `npm run test:integration:rex` 通过。
- 在 lab 中 `drive` 一次，确认投递消息里没有 Herdr 字样。

## 提交
`P4.T4: Rex wording at the source; drop rewrite layer; kernel entry point`
