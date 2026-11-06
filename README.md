# pi-rex-agents (P2)

Rex 宿主的 Pi 子代理扩展：父 Pi 在 Rex 的当前 block 中运行，`subagent` 工具在 Rex 里创建 block（同 tab）或 window（新 tab），把子 Pi 放到独立 surface 中异步运行，父 Pi 不阻塞。

编排内核作为库复用 `pi-herdr-agents` 的注册、投递、持久化、模型路由和 worktree 逻辑；surface 层、文案和 placement 完全按 Rex 实现。

## 当前状态

P2 已可用：

- 10 个父工具：`subagent`、`subagent_cancel`、`subagent_interrupt`、`subagent_resume`、`subagent_send`、`subagent_stop`、`subagents_list`、`subagents_write_task_models`、`worktree_list`、`worktree_remove`
- `subagent` / `subagent_resume` 支持 `placement`：
  - `"split"`（默认）：在当前 tab 的父 block 右侧 `rex split`，最多 `maxPerTab`（默认 2）个子 block
  - `"tab"`：`rex window new`，在新 tab 打开
  - split 达到上限（或并发预留已满）后，下一次 split 自动改用新 tab；子 block 关闭后名额释放。内核按本父进程登记且仍在父 window 中存活的子 block 计数，`/reload` 保留登记表和预留队列
  - `panes.mode` 只接受 `"split"` / `"tab"`，`panes.maxPerTab` 只接受 1..8 的整数；详见 [placement 配置](docs/configuration.md#pane-placement)
- 会话级宿主提示：每轮把 “你在 Rex 里、子代理用 subagent 工具、placement 语义” 追加到 system prompt；子代理会话则追加“你是叶子、没有 subagent 工具”的提示
- 工具描述、参数描述、命令输出、投递消息全部使用 Rex 术语
- Rex 版 `SurfaceProvider`：创建 / 输入 / 捕获 / 状态 / 进程身份 / 关闭 / 枚举 / worktree
- 通过 Pi 的 extension API 加载；不修改内核源码，只在注册边界包装

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

`--no-extensions` 会关闭其他扩展的自动发现，只加载显式 `-e` 的扩展。长期使用建议把本包装为 Pi 包，并确保 `pi list` 里没有未过滤的 `pi-herdr-agents`（两者注册同名工具，例如 `subagent`）。完整安装与冲突处理见 [docs/install.md](docs/install.md)。

本扩展只在 `REX_SESSION` 与 `REX_BLOCK` 都存在时注册工具；在普通终端里不会生效。子代理进程带 `PI_SUBAGENT_ID`，作为叶子不会注册 `subagent` 工具。

配置读取 `$PI_CODING_AGENT_DIR/rex-agents/config.json`，默认是 `~/.pi/agent/rex-agents/config.json`。旧的 `herdr-agents/config.json` 不读取、不迁移；新文件不存在时使用默认配置（split、right、`maxPerTab=2`）。详见 [配置说明](docs/configuration.md#configuration-file)。

子代理会在第一轮前自动启用已安装的上下文压缩工具，即使指定 `tools: "read,bash"`。目前支持 billion-context 的 `compress`、`decompress`、`search_context`、`acp_status` 以及可选的 `acp_rule`；显式的 `deny-tools` 仍然优先。新启动、resume、persistent 和 worktree handoff 都适用。未安装压缩插件时不添加工具，沿用 Pi 原生 auto-compaction，详见 [配置说明](docs/configuration.md#context-compression-tools)。

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

不需要 Rex 的检查：

```bash
npm run typecheck
bun src/host-message-check.ts
bun src/wording-check.ts
```

## 目录

- `maestro/surfaces/rex/rex-cli.ts`：`rex` CLI 的 argv 封装，不拼接 shell
- `maestro/surfaces/rex/rex-surface-provider.ts`：Rex `SurfaceProvider`
- `src/infrastructure.ts`：把 provider 组装成内核的 `PiRunSessionInfrastructure`
- `maestro/runtime/pi-placement.ts`：内核的 split 名额预留队列；原生 placement 沿 launch/resume 链传递
- `src/rex-host-api.ts`：注册边界的文案包装（描述、命令输出、消息）
- `src/rex-wording.ts`：上游 Host 文案 → Rex 文案的精确替换
- `src/extension.ts`：Pi extension 入口 + system prompt 宿主提示
- `maestro/surfaces/rex/git.ts` / `maestro/surfaces/rex/worktree.ts`：worktree 原语与受管目录
- `src/p0.ts` / `src/p1.ts` / `src/p2.ts`：P0 / P1 / P2 探针
- `src/host-message.ts`：投递消息的 Host 文案改写
- `src/doctor.ts`：Rex / Pi / 包冲突自检
- `skills/pi-rex-agents/SKILL.md`：模型侧的 Rex 子代理操作说明
- `docs/`：架构与历史验收记录

## 关键映射

| 概念 / 操作 | Rex |
|---|---|
| tab | `window` |
| pane | `block` |
| 同 tab 分屏 | `rex split --focus=false` |
| 新 tab | `rex window new --focus=false` |
| 输入 | `rex send` + `rex send-key enter` |
| 屏幕读取 | `rex capture --format=text --trim` |
| 状态 | `com.superlogical.terminal.program_status`（OSC 7501） |
| 进程信息 | `com.superlogical.terminal.process` |
| worktree | `git worktree add/remove` + Rex window |

## 已知限制

1. **没有 Rex 原生侧栏标记**：Pi 自己的 widget 仍可用（P2 已验证），但不是 Rex 侧栏。
2. **split 上限按父进程计数**：默认最多 2 个子 block；其他父进程的子 block 和用户手工添加的 block 不占本父进程的名额。worktree 子代理始终使用新 tab。
3. **进程身份是尽力校验**：Rex 提供 `program_status.owner.pid`、`foreground.pid`、cwd，但没有 pane shell 的强身份；worktree 清理保留上游的脏工作区和进程占用检查，并给出 warning。
4. **持久化专家的第二轮有短暂 settle 窗口**：集成测试在 `subagents_list` 显示 idle 后等待 2 秒再发送；适配层暂不修改上游行为。
5. **不是 Rex 原生插件**：本包是运行在 Rex 中 Pi 进程内的 Pi extension，不是 Rex 自己的 Lua/插件系统。
6. **工具名冲突**：不能同时加载未过滤的 `pi-herdr-agents` 与 `pi-rex-agents`，见 [docs/install.md](docs/install.md)。

## P0 / P1 / P2 的边界

P0 只证明 Rex surface 可用；P1 接入真实 `subagent` 工具链；P2 补齐真实 TUI 加载、cancel/interrupt/resume、状态 widget 和 worktree 文案。历史验收记录保留在 `docs/`，描述的是当时的实现；当前行为以本文和代码为准。
