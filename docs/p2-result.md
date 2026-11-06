# P2 验收结果

> 历史记录：保留 P0–P2 当时的适配层实现与验收证据。当前 hard fork 内核、命名、配置和回传行为以 [README](../README.md) 与 [P4 状态](p4/STATUS.md) 为准。

日期：2026-11-04  
环境：Rex 0.0.1793645657-gd018d2，Pi 1.5.0

## P2-1 真实交互式 Pi

用 `rex new` 启动真实 Pi TUI，只加载本扩展：

```bash
rex new p2-smoke -c "$PWD" --json -- \
  pi --no-extensions -e "$PWD/pi-extension/subagents/index.ts"
```

启动页显示 `[Extensions] index.ts`；`/subagent list` 和 `/worktree list` 均可执行。详见 [p2-interactive.md](p2-interactive.md)。

## P2-2 父会话状态展示

`bun src/p2.ts` 在子代理运行期间捕获到了上游 widget：

```text
╭─ Subagents ────────────────────────────────────────────────────────────── 1 active ─╮
│ 00:01  p2-long                    cn:deepseek-v4.1-flash|low · running…           │
╰────────────────────────────────────────────────────────────────────────────────────╯
```

widget 由 `pi-herdr-agents` 自带，Rex 适配层不需要重复实现。

## P2-3 cancel / interrupt / resume

`bun src/p2.ts` 通过真实 Rex block 和真实 Pi 子进程完成：

| 场景 | 结果 |
|---|---|
| 启动长任务并观察 `working` | 通过 |
| `subagent_cancel` | `status: confirmed`，子块被移除 |
| `subagent_interrupt` | `status: interrupt_requested`，随后取消并移除 |
| `subagent_resume` | `status: started`，子代理回复 `P2_RESUMED_OK` |
| 父块存活 | `parentSurvived: true` |
| 清理后 `subagents_list` | `agents: []` |

完整输出见测试运行记录；测试结束后当前 Rex 会话只剩父块。

## P2-4 worktree 展示文案

worktree 结果中原来的 Herdr 专用行：

```text
herdr worktree remove --workspace window:...
```

现在会被扩展在投递前改写为：

```text
rex window close window:...
```

`bun src/p1.ts --worktree` 验证了结果正文和 `details.resultContent` 都不再包含 `herdr worktree remove`；实际清理仍通过 `worktree_remove` 工具或 `/worktree remove` 完成。

## P2-5 安装与冲突

见 [install.md](install.md)。核心结论：Pi 不允许两个扩展注册同名工具，因此不能同时加载 `pi-herdr-agents` 和 `pi-rex-agents`；Rex 场景应二选一。

## P2-6 文档与打包

- package manifest 已声明 `pi.extensions`。
- `npm run check` 覆盖类型检查、宿主文案改写检查和 P0 冒烟。
- P2 的专项测试为 `npm run p2`，需要在 Rex block 内运行。

## P2 回归汇总

| 命令 | 结果 |
|---|---|
| `npm run check` | typecheck、host 文案检查、P0 全部通过 |
| `bun src/p1.ts` | `ok: true`，`parentSurvived: true` |
| `bun src/p1.ts --worktree` | 通过；结果正文和 `details.resultContent` 均无 `herdr worktree remove` |
| `bun src/p1.ts --persistent` | 通过；第二轮 `P1_SECOND_OK`，随后 stop |
| `bun src/p2.ts` | `ok: true`，cancel `confirmed`，interrupt `interrupt_requested`，resume `P2_RESUMED_OK` |
| `npm run doctor` | `ok: true`，Rex/Pi CLI、入口和包冲突检查正常 |
