# P1 验收记录

> 历史记录：保留 P0–P2 当时的适配层实现与验收证据。当前 hard fork 内核、命名、配置和回传行为以 [README](../README.md) 与 [P4 状态](p4/STATUS.md) 为准。

日期：2026-11-04（Rex 0.0.1793645657-gd018d2，Pi + `pi-herdr-agents` 3.7.2）

## 环境

- 父 Pi：Rex session `silent-delta` 的 block 中
- 子 Pi：由 `pi-herdr-agents` 的 `subagent` 工具在 Rex 新 block 中启动
- 默认模型：`CBAPI/cn:deepseek-v4.1-flash`
- 测试入口：`src/p1.ts`（真实 provider + 真实 `subagent` 工具链，只把 Pi extension host 替换为测试 harness）

## 验收项

| 验收项 | 命令 | 结果 |
|---|---|---|
| TypeScript 编译 | `npm run typecheck` | 通过 |
| 普通子代理 | `bun src/p1.ts` | 通过：`P1_CHILD_OK`，父会话存活 |
| 状态变化 | 同上 | `working -> done`，子进程 PID 被 `program_status.owner.pid` 与 `foreground` 共同确认 |
| 持久化专家第二轮 | `bun src/p1.ts --persistent` | 通过：`subagent_send` 第二轮返回 `P1_SECOND_OK` |
| 持久化专家停止 | 同上 | `subagent_stop` 返回 `stop_requested`，父会话存活 |
| worktree 创建/列表/清理 | `bun src/p1.ts --worktree` | 通过：worktree 创建、`worktree_list` 识别、`worktree_remove` 清理，清理后列表为空 |
| 父块焦点稳定 | 普通测试 | 通过：默认 `rex split --focus=false`，父块焦点未被抢走 |

## 关键实测输出

普通子代理：

```json
{
  "ok": true,
  "parentSurvived": true,
  "completion": "P1_CHILD_OK"
}
```

持久化专家：

```json
{
  "persistentResult": {
    "sent": { "outcome": "dispatched" },
    "second": {
      "customType": "subagent_result",
      "details": { "contentIncludes": "P1_SECOND_OK" }
    },
    "stopped": { "status": "stop_requested" }
  }
}
```

worktree：

```json
{
  "worktreeResult": {
    "before": "p1-wt-... — /Users/qiangwenjun/.pi/rex-agents/worktrees/pi-rex-agents/p1-wt-...",
    "removed": "worktree_remove({ target: ... })",
    "after": "No managed worktrees found."
  }
}
```

## 本次修复的实际问题

1. **`rex send` 不自动回车**：provider 在文本输入后补发 `rex send-key enter`。
2. **`grouped` 没有 Rex 等价物**：映射为独立 window，而不是假装同 tab 多 pane。
3. **Rex 不暴露 PGID**：`foregroundProcessGroupId` 只在空闲 shell 场景填写；有前台子进程时留空，避免上游 worktree 清理误删忙碌的 checkout。
4. **worktree 的宿主文案**：P1 时上游 `presentation.ts` 仍打印 `herdr worktree remove`；P2 已在扩展投递前改写为 `rex window close`，实际清理仍由 `worktree_remove` 工具完成。
5. **持久化第二轮的 settle 竞态**：如果 `subagents_list` 刚显示 idle 就立即 `subagent_send`，子 Pi 可能还在 `agent_settled` 边界；测试等待 2 秒后稳定通过。没有修改上游投递逻辑，避免破坏 Herdr 行为。

## 尚未覆盖

- Herdr 侧栏 marker / 原生 sidebar
- workspace claim 语义
- `grouped` 真同 tab 多 pane
- macOS 上 worktree handoff 的强进程身份校验
- 真实 Pi 交互会话中的 `/subagent` 命令手工验收（P2 已覆盖，见 docs/p2-result.md）
- `subagent_cancel` / `subagent_interrupt` 的专项 E2E（P2 已覆盖，见 docs/p2-result.md）

这些是 P2 的候选工作，不影响 P1 的普通子代理、持久化专家和 worktree 主路径。
