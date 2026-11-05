# T5 回传契约

依据 `docs/p4/rex-facts.md`：F1、F2、F3、F5、F7、F9。

## 步骤
1. **result 文件**：`maestro/adapters/pi/child/subagent-done.ts` 新增 `writeResultArtifact()`，tmp+rename 原子写入。
   - 普通分支：`<sessionFile>.result.json`，在写 `.exit` 之后、`ctx.shutdown()` 之前写。
   - 持久化分支：`<sessionFile>.result.<taskId>.json`，在 `appendPersistentTaskEvent` 之后、清空 `currentTask` 之前写。
   - 字段：`v:1, finalText, subagentId(PI_SUBAGENT_ID), taskId, generation, status("done"|"error"), errorMessage, blockId(REX_BLOCK), finishedAt`。`finalText` 取 settle 时最后一条非空 assistant 文本。
2. `maestro/adapters/pi/session.ts` 新增 `readSubagentResult(sessionFile, expected)`：校验 `v===1` 和 id/taskId/generation，任何不匹配或解析失败都返回 null。
3. `maestro/runtime/pi-run-session.ts`（普通/恢复）和 `pi-persistent-io.ts`（`readTaskSummary`）：先读 result 文件，读不到再回退 `findLastAssistantSummary`。
4. **替换屏幕哨兵**：`launch.ts` 和 `launch-resume.ts` 的 `; echo '__SUBAGENT_DONE_'$?'__'` 改为把 `$?` 原子写入 `<sessionFile>.exitcode`（tmp+mv）。`completion.ts` 的 sentinel 分支改为读该文件（`reason` 值改名为 `"exitcode"`，同步所有引用和测试），删除 `TERMINAL_SENTINEL`。`readScreen` 只保留诊断用途。
5. **身份**：子代理启动参数加 `--name <子代理显示名>`，让 Pi 原生根记录 `msg` 带身份（F1）。`RexSurfaceProvider.inspectSurface` 读取根记录的 `state`（`working`/`blocked`/`done`/`error`/`idle`）映射到 lifecycle。
6. **OSC 子记录**：新增 `maestro/adapters/pi/child/rex-status.ts`：写 `/dev/tty`，失败静默，**只写 `id=pira` 子记录，绝不写根记录**。`agent_start` 发 working；结束时发 done/error，`msg` 为 `task=<id> gen=<n> result=<basename>`（≤2048 字节，超长截断）。
7. **inbox**：子代理的持久化 inbox 从 1000ms 轮询改为 `fs.watch(dirname)` 唤醒 + 5s 兜底轮询；去掉集成测试 / p1 中"idle 后等 2 秒再发送"的等待，验证 README 已知限制 4 消失。
8. 单测：result 写入原子性、id/taskId/generation 不匹配回退、`.exitcode` 兜底（无 `.exit` 时也能判定完成和退出码）、OSC 序列格式与长度上限、inbox 唤醒。

## 门禁
- typecheck、`npm test`（用 `docs/p4/baseline/test-gate.sh` 判定）、lint、`docs:tools:check`、no-foreign-host。
- `npm run test:integration:rex` 通过，并新增用例：
  - 普通子代理：result.json 存在，投递内容与 finalText 一致；删除 result.json 后从 JSONL 回退。
  - 持久化子代理：运行中根记录为 `working`，完成后为 `done`；`result.<taskId>.json` 正确；第二轮不需要额外等待。
  - 强杀子 Pi（kill 其 pid）：通过 `.exitcode` 或 block 消失兜底投递 error，父进程不挂起。
- 真实模型冒烟：在当前 Rex 会话中用 `CBAPI/cn:deepseek-v4.1-flash` 跑 `npm run p1` 和 `p1:persistent`，测完清理 block/window。

## 提交
可以拆分：result 文件 / exitcode / 状态 / inbox。
