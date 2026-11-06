# P2-1 真实交互式 Pi 会话验收

> 历史记录：保留 P0–P2 当时的适配层实现与验收证据。当前 hard fork 内核、命名、配置和回传行为以 [README](../README.md) 与 [P4 状态](p4/STATUS.md) 为准。

日期：2026-11-04  
环境：Rex 0.0.1793645657-gd018d2，Pi 1.5.0

## 方法

用 `rex new` 启动一个真实 Pi TUI，只加载本扩展：

```bash
rex new p2-smoke -c "$PWD" --json -- \
  pi --no-extensions -e "$PWD/pi-extension/subagents/index.ts"
```

然后用 `rex send` + `rex send-key enter` 输入命令，读取 PTY 屏幕。

## 结果

启动页面显示：

```text
[Extensions]
  extension.ts
```

说明 `pi-rex-agents` 被 Pi 作为 extension 加载。

`/subagent list`：

```text
 No subagent definitions found.
```

命令存在并正确进入 upstream 的 catalog 路径；当前项目没有定义角色，所以列表为空。

`/worktree list`：

```text
 No managed worktrees found.
```

命令存在，且 Rex 适配器的 managed worktree 根目录为空。

## 结论

- 真实 Pi TUI 可以加载本扩展。
- `/subagent`、`/worktree` 命令可用。
- 测试会话已用 `rex kill` 清理。
- 本次没有触发真实模型调用；工具链的运行验证在 P1/P2-3 的 harness 中完成。
