[English](troubleshooting.md) | **简体中文**

# Troubleshooting

本页汇总了常见问题的检查步骤。每一节都链接到完整的参考文档。

## Troubleshooting completion delivery

如果子代理已经结束，但父代理返回空白或不相干的响应，先确认结果是否到达父会话：

```bash
jq -c 'select(.type == "custom_message" and .customType == "subagent_result")' "$PI_SESSION_FILE" | tail -1
```

如果该条目存在，说明派生和结果提取都正常；此时应排查父代理的唤醒与面向模型的投递，而不是子进程。完成唤醒必须直接携带该有界结果——不要另发一条消息，只是让父代理去看相邻的 custom message。

Git 包引用是固定的。要把已安装的开发副本切回当前的 `main`，需显式安装该 ref 并重新加载当前 Pi 会话：

```bash
pi install git:github.com/giuseppecrj/Pi subagent extension@main
# Then run /reload inside Pi.
```

用一个自主子代理对投递做冒烟测试，并指示它返回某个精确的标记。成功的标准是该标记本身——而不只是一条通用唤醒通知——自动出现在父代理的回合中。

子代理的 tab、pane 和 worktree 工作区在创建时不会抢占键盘焦点。启动命令通过显式 ID 定位子 pane，因此焦点与命令投递相互独立。如果全新启动或恢复启动失败，扩展会尝试对它创建的普通 pane 执行已确认的回滚，并保留原始启动错误。未经确认的回滚会保留所有权，而不是声称清理成功。它不会关闭调用方提供的 surface，托管的 worktree 工作区在失败时也会保留。注意：`interactive` 选项控制的是父代理状态通知，而不是终端焦点。

## An acquisition or dispatch is uncertain

不要立即重复启动。Rex 客户端超时并不能证明服务器已停止创建资源或投递命令。

1. 读取错误或确认信息中给出的确切 pane、workspace、session 和 manifest 标识。切勿根据显示标签选择资源。
2. 对于 `status: "uncertain"` 的确认，使用现有 run 的控制工具。其已获取的所有者仍处于监督之下，且回退被禁用。结果只会在确认终止之后出现。未经确认的控制响应并不意味着进程已停止。
3. 对于没有所有者的创建失败，先检查所报告的资源以及保留的 manifest，再决定另一次启动是否安全。worktree 恢复证据并不授权自动移除或复用同一分支。

启动和交接子进程都有[有限的操作预算](tools.zh-CN.md#launch-deadlines-and-uncertainty)。失败的 Git 交接会报告未知状态。在集成或清理之前先检查保留的检出。显式清理 Git 命令仍按其现有超时同步运行。

## A child is stalled or makes no progress

当 pane 检查失败，或 pane 在没有完成记录的情况下消失时，widget 会显示 `stalled`。仅有时间流逝绝不会让某个 run 变成 stalled。无进展提示在每次 episode 中只警告一次，且绝不中断、杀死、重试或重启子代理。用 `subagent_interrupt` 中断子代理，用 `subagent_cancel` 结束普通 run，或用 `subagent_stop` 停止持久专家。参见[进行中的状态更新](tools.zh-CN.md#in-progress-status-updates)和[监督传输](configuration.zh-CN.md#supervision-transport)。

## A model fails

模型出现在目录中、且已配置认证，并不能证明你的 provider 账户可以使用该模型。完成结果会保留每个模型对应的原始 provider 原因。检查账户访问权限、用受支持的模型启动新的子代理，或配置回退。参见[模型解析与回退](configuration.zh-CN.md#model-resolution-and-fallback)。

## An accept check reports error or an unexpected verdict

`Check: error (timed out after 600s)` 表示父代理的复检从未给出答复：它超时、被信号杀死、其目录不存在，或 `sh` 无法启动。对于运行缓慢的测试套件，提高 `accept.timeoutSec`（最多 3,600），并在报告中给出的目录（`details.accept.cwd`）里手动运行该命令。检查运行时没有 `PI_SUBAGENT_*` 变量，因此依赖这些变量的检查在复检中会失败。`rejected (child reported a pass; …)` 表示子代理自身的 run 通过，而父代理的检查失败；对普通子代理，投递信息会写明 `shared checkout`，该检出中其他写入者的修改可能导致这种情况，因此并行写入者应使用 worktree。`skipped` 表示 run 未自然完成，`none` 表示未请求任何检查，包括所有恢复的 run。参见[验收检查](tools.zh-CN.md#accept-checks)。

## Worktree removal is refused

移除操作会报告每个阻塞项，例如有未提交的文件、存在活动进程，或检查结果未知。提交工作或传入 `--preserve`，停止检出中的任何进程，并在源仓库或其祖先目录启动父 Pi 会话。参见[显式 worktree 清理](tools.zh-CN.md#explicit-worktree-cleanup)和[清理与恢复](worktree-subagents.zh-CN.md#cleanup)。
