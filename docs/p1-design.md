# P1 架构定稿：pi-rex-agents

> 历史记录：保留 P0–P2 当时的适配层实现与验收证据。当前 hard fork 内核、命名、配置和回传行为以 [README](../README.md) 与 [P4 状态](p4/STATUS.md) 为准。

## 目标

在 Rex 中提供与 `pi-herdr-agents` 一致的子代理体验：父 Pi 异步启动子 Pi，子代理运行在独立的 Rex block 中，父代理可以查询、继续对话、停止和恢复；父 Pi 进程不阻塞，父会话在子代理运行期间保持可交互。

## 核心决策

**复用 `pi-herdr-agents` 的编排引擎，只替换 surface 层。**

`pi-herdr-agents` 的 `subagentsExtension(pi, options)` 已经提供：

- 10 个父工具与 2 个子工具
- 子代理生命周期、结果投递、持久化专家
- model fallback、task-model 路由
- 角色包、accept check、worktree 工具
- widget / status / resume / fork 恢复

它通过 `PiRunSessionInfrastructure` 接受注入的 `surfaceProvider`、`launchOperations`、`supervision` 和 `worktreeOperations`。因此 `pi-rex-agents` 不 fork 上游，只做三件事：

1. 实现 Rex 版 `SurfaceProvider`
2. 组装 Rex 运行时基础设施
3. 将 `pi-herdr-agents` 的 extension 原样注册到 Pi

伪代码：

```ts
export default function piRexAgents(pi: ExtensionAPI) {
  if (!process.env.REX_SESSION || !process.env.REX_BLOCK) return;
  const provider = new RexSurfaceProvider({
    sessionId: process.env.REX_SESSION,
    anchorBlockId: process.env.REX_BLOCK,
  });
  subagentsExtension(pi, {
    infrastructure: createRexInfrastructure(provider),
  });
}
```

## Rex 映射

| 抽象 | Rex 对象 |
| --- | --- |
| workspace | `session` |
| tab / group | `window` |
| pane / surface | `block` |
| 分屏 | `rex split` |
| 新标签 | `rex window new` |
| 输入 | `rex send` + `rex send-key enter` |
| 屏幕读取 | `rex capture` |
| 状态 | `com.superlogical.terminal.program_status` |
| 进程信息 | `com.superlogical.terminal.process` |

### placement

- `split`：`rex split --split=right|below --focus=false`
- `tab`：`rex window new --focus=false`
- `grouped`：Rex 没有与 Herdr「同 tab 内多 pane」完全等价的 grouping。P1 将 `grouped` 映射为独立 window，行为上仍是可管理的 surface；后续可改为同一 window 内多个 split。

### 子进程启动

`runScript` 将脚本写入临时文件，再执行：

```bash
bash /tmp/pi-rex-agents/xxx.sh
```

脚本内部包含 Pi 启动命令和 `PI_HERDR_AGENTS_SESSION` 等环境变量。这样可以避免多行命令通过 `rex send` 输入时被 shell/TUI 误解析。

### 状态

优先读取 `program_status`：

- `working` -> `working`
- `blocked` -> `blocked`
- `done` -> `done`
- `idle` -> `idle`
- `error` / 无记录 -> `unknown`

如果子 Pi 已启动但尚未上报 OSC 7501，返回 `unknown`，但 `process` 中能看到 Pi 进程；`waitForShellReady` 只用于 Rex 新 block，不用于等待 Pi 就绪。

### 进程身份

P1 使用：

- `program_status.owner.pid`（子 Pi 自己上报）
- `process.foreground.pid` / `argv0` / `cwd`
- `process.ancestors` 中识别 shell

不使用 Linux `/proc` 环境读取。macOS 上没有 `/proc`，上游的 `waitForPiReady` / `captureProcessIdentity` 只在 worktree handoff 路径使用，P1 的普通 block 路径不依赖它。

## 运行时组装

```ts
const paneConfig = { mode: "split", direction: "right", maxPerTab: 4 };
const launchOperations = {
  ...launchOperationsFromSurface(provider, paneConfig, createWorktreeOperations()),
  // macOS: replace upstream /proc-based readiness if worktree handoff is enabled.
  waitForPiReady: rexWaitForPiReady,
};
const supervision = new SupervisionCoordinator(
  async () => ({
    complete: true,
    panes: (await provider.listSurfaces()).map(s => ({
      paneId: s.id,
      workspaceId: s.workspaceId ?? "",
    })),
  }),
  id => provider.inspectSurface(id),
);
```

`markerWriter` / `markerSessionReader` 不注入，因此 Herdr 侧栏标记自动关闭；其余编排逻辑仍可工作。

## P1 范围

必须完成：

- 完整 `SurfaceProvider` 21 个方法
- `RexCli` 的 split/window/send/capture/process/program-status/close/list/focus
- `runScript`、`waitForShellReady`、`waitForSurfaceAbsence`
- worktree：`git worktree` 创建/移除 + Rex window + 上游清理适配器
- 包装 `subagentsExtension` 的 extension 入口
- 真实 Rex 中跑通：spawn、两轮 send、结果读取、stop、父会话存活

## Worktree

Rex 没有 `herdr worktree` 原语，因此 provider 使用：

1. `git worktree add -b <branch> <path> <base>`
2. `rex window new --focus=false -c <path> -- <command>`
3. `git worktree remove <path>` + `rex window close`

`createWorktreeCleanupOperations(provider, { managedRoot })` 复用上游的脏工作区、未跟踪文件、冲突和进程占用检查，只把 `herdr` 的清理命令替换为 Rex provider 的 `removeWorktreeSurface`。

P1 暂不承诺：

- Herdr 侧栏 marker / 原生 sidebar UI
- Rex 内完全等价的 grouped pane
- macOS 上的 worktree 进程身份强校验
- 与上游每个边缘行为逐条一致（例如 Herdr 的 tab 命名、workspace claim）

## 验收

1. `npm run typecheck` 通过
2. `npm run p0` 通过
3. 在 Rex 中加载 extension，`subagent` 工具可创建子 block
4. `subagents_list` 能看到子代理
5. `subagent_send` 能完成第二轮任务
6. `subagent_stop` 能终止子代理，父会话存活
7. `rex ls` 中测试会话可清理
