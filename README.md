# pi-rex-agents (P2)

把 [`pi-herdr-agents`](https://github.com/earendil-works/pi-herdr-agents) 的编排内核适配到 **Rex** 的 Pi 扩展。

一句话：父 Pi 在 Rex 的当前 block 中运行；`subagent` 工具通过 Rex 创建新的 block / window，把子 Pi 放到独立 surface 中异步运行，父 Pi 不阻塞。

## 当前状态

P2 已可用，复用 `pi-herdr-agents` 的注册、投递、持久化、模型路由和 worktree 逻辑，只替换 surface 层：

- 10 个父工具：`subagent`、`subagent_cancel`、`subagent_interrupt`、`subagent_resume`、`subagent_send`、`subagent_stop`、`subagents_list`、`subagents_write_task_models`、`worktree_list`、`worktree_remove`
- 与上游一致的子代理生命周期、结果投递、持久化专家、worktree 隔离
- Rex 版 `SurfaceProvider`：创建 / 输入 / 捕获 / 状态 / 进程身份 / 关闭 / 枚举 / worktree
- 通过 Pi 的 extension API 加载；不修改 `pi-herdr-agents` 源码

P0 的底层验证记录见 [docs/p0-result.md](docs/p0-result.md)，P1 架构见 [docs/p1-design.md](docs/p1-design.md)，P1 实测见 [docs/p1-result.md](docs/p1-result.md)，P2 验收见 [docs/p2-result.md](docs/p2-result.md)，安装说明见 [docs/install.md](docs/install.md)。

## 快速运行

```bash
cd /Users/qiangwenjun/Documents/project/pi-rex-agents
npm install
npm run typecheck
npm run doctor
```

在 **Rex 的交互式 Pi** 中加载：

```bash
pi --no-extensions -e /Users/qiangwenjun/Documents/project/pi-rex-agents/src/extension.ts
```

`--no-extensions` 是为了避免同时加载已安装的 `pi-herdr-agents`：两者注册同名工具（例如 `subagent`），同时加载会报工具名冲突。完整安装与冲突处理见 [docs/install.md](docs/install.md)。如果希望长期使用，二选一：

- 只在需要 Rex 适配时显式 `-e` 加载本扩展；或
- 移除/禁用全局 `pi-herdr-agents`，只保留 `pi-rex-agents`。

本扩展只在 `REX_SESSION` 与 `REX_BLOCK` 都存在时注册工具；在普通终端里不会生效。

## 集成测试

测试需要一个 Rex 会话，并且当前 Pi 进程运行在 Rex block 内（`REX_SESSION` / `REX_BLOCK` 已设置）。

```bash
# 普通子代理：启动、状态、结果读取、父会话存活
bun src/p1.ts

# worktree 隔离：创建 -> 子代理运行 -> worktree_list -> worktree_remove
bun src/p1.ts --worktree

# 持久化专家：第一轮 -> subagent_send 第二轮 -> subagent_stop
bun src/p1.ts --persistent

# P2：cancel / interrupt / resume
bun src/p2.ts
```

默认模型是 `CBAPI/cn:deepseek-v4.1-flash`；P1 测试可通过 `P1_MODEL`、P2 测试可通过 `P2_MODEL` 覆盖，格式为 `provider/model`。

## 目录

- `src/rex-cli.ts`：`rex` CLI 的 argv 封装，不拼接 shell
- `src/rex-surface-provider.ts`：Rex `SurfaceProvider`
- `src/infrastructure.ts`：把 provider 组装成 `pi-herdr-agents` 的 `PiRunSessionInfrastructure`
- `src/extension.ts`：Pi extension 入口
- `src/git.ts` / `src/worktree.ts`：worktree 原语与受管目录
- `src/p0.ts`：P0 surface 探针
- `src/p1.ts`：P1 编排集成探针
- `src/p2.ts`：P2 cancel/interrupt/resume 探针
- `src/host-message.ts`：worktree 结果中的 Host 文案改写
- `src/doctor.ts`：Rex / Pi / 包冲突自检
- `docs/p1-design.md`：架构和映射
- `docs/p1-result.md`：P1 验收结果
- `docs/p2-result.md`：P2 验收结果
- `docs/p2-interactive.md`：真实 Pi TUI 验收
- `docs/install.md`：安装与工具名冲突处理

## 关键映射

| `pi-herdr-agents` 抽象 | Rex |
|---|---|
| workspace | `session` |
| tab / group | `window` |
| pane / surface | `block` |
| 分屏创建 | `rex split --focus=false` |
| 新标签创建 | `rex window new --focus=false` |
| 输入 | `rex send` + `rex send-key enter` |
| 屏幕读取 | `rex capture --format=text --trim` |
| 状态 | `com.superlogical.terminal.program_status`（OSC 7501） |
| 进程信息 | `com.superlogical.terminal.process` |
| worktree | `git worktree add/remove` + Rex window |

## 已知限制

1. **Herdr 侧栏 marker 没有等价实现**：Rex 没有 Herdr 的 sidebar marker 通道；Pi 自己的 widget 仍可用（P2 已验证），但不是 Rex 原生侧栏。
2. **grouped 不完全等价**：Rex 的 window 不等于 Herdr 同 tab 多 pane 的 grouping，P1 将 `grouped` 映射为独立 window。
3. **进程身份是尽力校验**：Rex 提供 `program_status.owner.pid`、`foreground.pid`、cwd，但没有 Herdr 的 pane shell 强身份；worktree 清理保留上游的脏工作区和进程占用检查，并给出 warning。
4. **持久化专家的第二轮有短暂 settle 窗口**：集成测试在 `subagents_list` 显示 idle 后等待 2 秒再发送；上游在真实 Herdr 中的投递路径可能没有这个竞态，Rex 适配层暂不修改上游行为。
5. **不是 Rex 原生插件**：本包是运行在 Rex 中 Pi 进程内的 Pi extension，不是 Rex 自己的 Lua/插件系统。
6. **工具名冲突**：不能同时加载 `pi-herdr-agents` 与 `pi-rex-agents`；Rex 场景需二选一，见 [docs/install.md](docs/install.md)。

## P0 / P1 / P2 的边界

P0 只证明 Rex surface 可用；P1 接入真实 `subagent` 工具链；P2 补齐真实 TUI 加载、cancel/interrupt/resume、状态 widget 和 worktree 文案。仍未承诺与 Herdr 的每个边缘行为逐条一致，尤其是 sidebar、workspace claim、grouped pane 和 macOS 上的进程身份强校验。
