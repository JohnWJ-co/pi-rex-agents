# P0 验证记录

> 历史记录：保留 P0–P2 当时的适配层实现与验收证据。当前 hard fork 内核、命名、配置和回传行为以 [README](../README.md) 与 [P4 状态](p4/STATUS.md) 为准。

## 环境

- macOS
- Node `v26.7.0`
- Pi `1.5.0`
- Rex CLI `rex 0.0.1793645657-gd018d2`
- 测试日期：2026-11-04

## 测试命令

```bash
npm run p0
```

保留会话的调试运行：

```bash
npm run p0 -- --keep
```

## 测试流程

1. `rex new` 创建一次性 session（临时 cwd）。
2. `RexSurfaceProvider.createSurface()` 在父块右侧 `rex split` 一个子块，`--focus=false`。
3. 校验 `active_window.focused_block_id` 仍等于父块。
4. 在子块启动交互式 Pi：

   ```text
   PI_PROGRAM_STATUS=1 pi --no-extensions --no-skills --no-context-files \
     --no-mcp --no-session --name p0-child --tui-mode fullscreen \
     'Reply with exactly P0_CHILD_OK and nothing else.'
   ```

5. 轮询 `rex block call program_status`，等待 `working` 和 `done`。
6. `rex capture` 断言输出包含 `P0_CHILD_OK`。
7. 发送第二轮 prompt，再次等待 `working -> done`，断言输出包含 `P0_FOLLOWUP_OK`。
8. `rex block call process` 断言能拿到 PID。
9. `rex block close` 关闭子块，确认子块消失且父块仍存在。
10. 未传 `--keep` 时自动 `rex session kill` 清理测试 session。

## 实测结果

两次运行均通过。第二次（自动清理运行）的关键结果：

```json
{
  "ok": true,
  "focusStable": true,
  "transitions": [
    { "state": "no-program-status" },
    { "state": "working" },
    { "state": "done" },
    { "state": "working" },
    { "state": "done" }
  ],
  "inspection": {
    "present": "present",
    "agentStatus": "done",
    "state": "done",
    "raw": {
      "state": "done",
      "app": "pi",
      "effective_app": "pi",
      "owner": { "pid": 48528, "name": "node" }
    }
  },
  "processPids": [48221, 48528, 48268],
  "agentPid": 48528,
  "shellPid": 48268,
  "foreground": {
    "pid": 48528,
    "name": "node",
    "argv0": "pi"
  },
  "parentSurvived": true,
  "kept": false
}
```

## 结论

P0 的核心假设成立：

- Rex 可以作为 `pi-herdr-agents` 的 surface 执行宿主；
- 子 Pi 的 `working` / `done` 状态可以通过 Rex 的 `program_status` 可靠观察；
- 文本输入、屏幕读取、关闭和父会话存活都满足后续适配所需的最小语义；
- `rex split --focus=false` 保持父块焦点，这是多代理场景能成立的关键行为。

## 遗留风险

1. **进程身份**：已确认 `program_status.owner.pid` 与 `foreground.pid` 一致，且 `foreground.argv0` 为 `pi`。但 `info.child` 在本机是 root 的 `login`，不是 shell；`shellPid` 需要从 ancestors/foreground 中查找 shell，不能直接使用 `child.pid`。
2. **状态语义**：Herdr 的 `agentStatus` 只有 `idle | working | blocked | done | unknown`；Rex 额外有 `error`。P1 需要决定 `error` 是映射到 `unknown` 还是 `blocked`。
3. **Herdr 专有 UI**：sidebar marker、pane title、focus workspace 等不在 P0 的 seam 内，P1 需要用 Rex 的 label / session / client API 重新实现。
4. **worktree**：Rex 没有内建的 worktree surface，P1 需要组合 `git worktree` 和 Rex session/window 管理。
