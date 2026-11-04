# pi-rex-agents (P0)

把 `pi-herdr-agents` 的 `SurfaceProvider` 执行宿主适配到 Rex 的 P0 验证层。

P0 不注册 Pi 工具，也不启动完整的多代理编排；它只验证最关键的问题：

> `pi-herdr-agents` 依赖的 surface（创建、输入、屏幕读取、状态、进程信息、关闭）在 Rex 上是否真的成立？

## 结论

P0 已通过。下列能力在 Rex 中可用：

| 能力 | Rex 实现 | P0 结果 |
|---|---|---|
| 创建子 surface | `rex split`（默认右分屏，`--focus=false`） | 通过，且不抢走父块焦点 |
| 向子 surface 输入 | `rex send` + `rex send-key enter` | 通过 |
| 读取子 surface | `rex capture --format=text --trim` | 通过，能读到完整回答 |
| 子代理状态 | `rex block call program_status`（OSC 7501） | 通过：`working -> done`，后续轮次再次 `working -> done` |
| 进程信息 | `rex block call process` | 通过，可拿到 PID 集合 |
| 关闭子 surface | `rex block close` | 通过，父块和会话继续存活 |
| 枚举 surface | `rex session inspect --json` | 通过 |

运行记录见 [docs/p0-result.md](docs/p0-result.md)。

## 快速运行

```bash
npm install
npm run p0
```

指定子 Pi 的模型：

```bash
npm run p0 -- --model CBAPI/cn:deepseek-v4.1-flash
```

保留测试会话以便手动检查：

```bash
npm run p0 -- --keep
```

其他参数：

```bash
npm run p0 -- --session session:... --keep   # 复用现有会话，不杀死它
npm run p0 -- --cwd /path/to/project
npm run p0 -- --timeout-ms 180000
```

## 代码结构

- `src/rex-cli.ts`：无依赖的 `rex` CLI/JSON 包装器。所有命令都通过 argv 调用，不拼接 shell。
- `src/rex-surface-provider.ts`：P0 版 `RexSurfaceProvider`，覆盖创建 / 输入 / 捕获 / 状态 / 进程 / 关闭 / 枚举。
- `src/p0.ts`：端到端集成探针。创建临时 Rex session、启动交互式 Pi、验证两轮 `working -> done`、读取 token、关闭子块并确认父会话存活。

## 关键发现

1. `rex send` 只输入文本，不会自动回车；必须再发 `rex send-key ... enter`。P0 的 `runCommand` 已封装这一点。
2. `rex split --focus=false` 不改变父块焦点。这个属性对“父代理继续运行、子代理在侧边执行”的模型很关键。
3. `program_status` 依赖交互式 TUI + Pi 的 OSC 7501 上报：
   - 子 Pi 需要设置 `PI_PROGRAM_STATUS=1`；
   - 使用 `pi -p` 一次性模式时没有可用的 `program_status`；
   - 交互式 Pi 会报告 `working`、`done`、`blocked`、`error`、`idle`。
4. Rex 的 `block call process` 能提供 PID、foreground/child/ancestors 和 cwd。P0 已验证：`program_status.owner.pid` 与 `foreground.pid` 一致，且 `foreground.argv0` 为 `pi`。注意 `info.child` 在这台机器上是 root 的 `login`，不是 shell；P1 不能用 `child` 代替代理进程或 shell。
5. Rex 没有 Herdr 那种内建 worktree surface 原语。P1 的 worktree 隔离需要用 `git worktree add/remove` + Rex surface 自己实现。

## P0 明确不包含

- 不注册 `subagent`、`subagent_send`、`subagents_list` 等 Pi 工具；
- 不包含完整 21 个 `SurfaceProvider` 方法；
- 不包含 worktree 生命周期；
- 不包含 sidebar marker、parent widget、delivery ledger、resume/fork 恢复；
- 不包含角色包和 task-model 路由。

这些属于 P1/P2。P0 的结论是：**底层 seam 在 Rex 上可用，继续做完整适配是可行的。**
