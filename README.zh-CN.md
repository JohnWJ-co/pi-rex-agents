[English](README.md) | **简体中文**

# pi-rex-agents

`pi-rex-agents` 是 Rex 原生的 Pi 子代理扩展。父 Pi 在当前 Rex block 中继续工作；`subagent` 在同一 tab 的 block 或新 tab 中启动子 Pi，完成后自动把结果送回父会话。父进程不阻塞，也不需要轮询日志或状态。

本仓库包含从 MIT 许可的 3.7.2 Pi 子代理内核 hard fork 的执行引擎，不依赖上游 npm 包。上游基线、许可证和人工移植规则见 [UPSTREAM](docs/UPSTREAM.md)（英文）。

## 特性

- **Rex 原生放置**：`placement: "split"` 在父 block 旁启动，`placement: "tab"` 在新 tab 启动，`placement: "minimized"` 在当前 tab 的浮动层中启动并立即最小化为右下角胶囊。Rex 的 window 就是 tab，block 就是 pane。
- **自动回传**：完成、失败和求助消息通过 steer 消息唤醒父会话，结果由宿主原子发布。
- **持久专家**：`persistent` 子代理跨任务复用同一会话，通过 `subagent_send` 接收后续任务，通过 `subagent_stop` 优雅停止。
- **托管 worktree**：写入型任务在独立 Git 检出中运行；父代理负责审查、集成和清理。
- **压缩工具透传**：自动启用已安装的上下文压缩工具，fresh、resume、persistent 和 worktree handoff 都适用。
- **叶子子代理**：子代理不再注册或调用其他委派路径，避免无限嵌套。
- **可验证**：确定性 Rex 集成测试使用隔离 server 和 fake provider，不调用真实模型。

## 环境要求

- Node.js 22.6+
- Pi（含扩展 API）和 Rex CLI
- 在 Rex block 内运行 Pi：`REX_SESSION`、`REX_BLOCK` 必须存在
- 当前支持 macOS 和 Linux；不做 Windows 适配

## 安装

### 从 GitHub 安装

```bash
pi install https://github.com/JohnWJ-co/pi-rex-agents
```

安装后 `pi list` 应显示本包，扩展入口为 `./pi-extension/subagents/index.ts`。

### 从源码检出运行

```bash
git clone https://github.com/JohnWJ-co/pi-rex-agents.git
cd pi-rex-agents
npm ci
npm run doctor
```

临时加载当前检出：

```bash
pi --no-extensions -e "$PWD/pi-extension/subagents/index.ts"
```

长期使用可运行 `pi install /absolute/path/to/pi-rex-agents`。安装与自检细节见 [安装说明](docs/install.zh-CN.md)。

## 使用

本包提供以下父会话工具和命令：

| 工具 | 用途 |
|---|---|
| `subagent` | 启动子代理，可指定 role、model、placement、worktree、persistent 和 accept check |
| `subagent_resume` | 在新 block 或 tab 中恢复已有子会话 |
| `subagent_interrupt` | 向运行中的子代理发送 Escape，中断当前轮次 |
| `subagent_cancel` | 取消普通子代理，确认进程退出并投递一条 cancelled 结果 |
| `subagent_send` | 向空闲的持久专家发送下一轮任务 |
| `subagent_stop` | 在当前任务 settle 后停止持久专家 |
| `subagents_list` | 列出可用的角色和子代理定义 |
| `subagents_write_task_models` | 校验并原子写入任务模型偏好 |
| `worktree_list` | 查看托管 worktree，包括跨会话遗留项 |
| `worktree_remove` | 按路径、分支或 window ID 显式删除 worktree |

命令：`/subagent`、`/subagents-init`、`/worktree`、`/panes-mode`、`/panes-maxPerTab`。完整参数、生命周期和事件见 [工具参考](docs/tools.zh-CN.md)，操作指南见 [pi-rex-agents skill](skills/pi-rex-agents/SKILL.md)。

## 放置与 worktree

- `placement: "split"` 是默认值，在父 block 旁启动子 block。每个父进程默认最多 2 个托管子 block；名额满后使用新 tab。关闭子 block 后释放名额，`/reload` 会保留登记和预留状态。用户手动添加的 block 和其他父进程不占名额。
- `placement: "tab"` 直接在新 tab 启动。Rex window 即 tab。
- `placement: "minimized"` 在当前 tab 创建 floating layer 并立即最小化到客户端右下角托盘；子代理仍在同一个 window 中运行。它不占 `panes.maxPerTab` 的 split 名额。把 `panes.mode` 设为 `"minimized"` 可以让默认启动也使用该模式。
- worktree 子代理始终使用新 tab，基于已提交的 Git 状态创建隔离检出。子代理会收到绝对工作区路径，必须在该工作区内读取、写入和执行命令，不得 `cd` 到或修改父/源检出。父代理负责审查、集成和清理。
- 指向源检出的 `edit`/`write` 等显式路径写入会被拒绝，并提示对应的工作区路径。`Bash` 等 shell 命令无法可靠拦截，只能依靠提示约束。
- 完成的 worktree 默认保留供父代理审查；删除必须通过 `worktree_remove` 或 `/worktree remove` 显式发起。

详见 [worktree 指南](docs/worktree-subagents.zh-CN.md) 和 [Rex surface 说明](docs/rex-surface.md)（英文）。

## 配置

读取 `$PI_CODING_AGENT_DIR/rex-agents/config.json`，默认 `~/.pi/agent/rex-agents/config.json`；文件缺失时使用默认值。不会读取或迁移旧目录配置。

```json
{
  "panes": {
    "mode": "split",
    "direction": "right",
    "maxPerTab": 2,
    "minimizedBounds": [0.1, 0.1, 0.8, 0.8]
  },
  "persistent": {
    "maxAgents": 3
  },
  "spawning": {
    "maxDepth": 1
  },
  "outcomeLedger": true
}
```

`panes.mode` 接受 `"split"`、`"tab"` 或 `"minimized"`；`panes.maxPerTab` 只接受 1..10 的整数，默认 2，且只约束 split 子代理，不约束 minimized 子代理。`panes.minimizedBounds` 控制 minimized 子代理恢复时的位置和大小，格式为 `[x, y, width, height]`，默认 `[0.1, 0.1, 0.8, 0.8]`（窗口正中、80% 大小）。交互式 Pi 中可用 `/panes-mode` 切换三种模式，用 `/panes-maxPerTab` 输入 1-10 的整数或打开选择器；两者立即生效并写回配置文件。完整键、模型路由、监督和 outcome ledger 见 [配置说明](docs/configuration.zh-CN.md) 和 [config.json.example](config.json.example)。

子代理会自动启用已安装的上下文压缩工具，包括 billion-context 的 `compress`、`decompress`、`search_context`、`acp_status` 及可选的 `acp_rule`，即使传入 `tools: "read,bash"`。显式 `deny-tools` 仍优先；fresh、resume、persistent 和 worktree handoff 都适用。没有压缩插件时沿用 Pi 原生 auto-compaction。

## 回传契约

| 证据 | 用途 |
|---|---|
| 原子发布的 `.result.json`；persistent 的每任务结果文件 | 父进程校验 subagentId、taskId、generation 后读取正文 |
| session JSONL | 结果文件不可用时的正文回退和审计证据 |
| `.exit` | Pi 内核的语义退出记录 |
| `.exitcode` | 包装脚本记录进程退出码；子 Pi 被强杀时仍可报告失败 |
| Rex `program_status` 根记录 | Pi 原生 working / blocked / done / idle 状态 |
| `id=pira` 子记录 | 扩展追加任务、generation 和结果元数据 |

完成判定不读取终端屏幕。persistent inbox 使用目录事件唤醒，并以 5 秒轮询兜底；收到一轮结果即可立即发送下一轮。完整字段与验收要求见 [运行时证据契约](docs/delegation-outcome-contract.md#rex-runtime-evidence)。

## 评审模型选择

Cross-family independent review requires a reviewer from a different model family than the author. For ordinary review, prefer a different authenticated model family. When no other authenticated model family is available, ordinary review may use a same-family reviewer in a fresh standalone session. Disclose that this review is context-isolated, not cross-family independent. Cross-family verification must not use this fallback.

角色配置和工具权限见 [角色与自定义代理](docs/roles.zh-CN.md)。`read,bash` 中的 Bash 可以修改文件；评审者的权限应与任务一致。

## 开发与验证

```bash
npm ci
bash docs/p4/baseline/test-gate.sh
npm run typecheck
npm run lint
npm run format:check
npm run docs:tools:check
node --experimental-strip-types --test test/no-foreign-host.test.ts
bun test/smoke-extension.ts
npm pack --dry-run
```

基线门禁在清除 Rex 环境变量的子进程中判定全量 `npm test`，保留调用者的 Rex 环境用于集成验证。在 Rex block 内运行 `npm run test:integration:rex`；它使用隔离 Rex server 和 fake provider，不调用真实模型。真实模型探针为 `npm run p1`、`npm run p1:persistent`，默认 `CBAPI/cn:deepseek-v4.1-flash`。

代码地图和门禁要求见 [AGENTS.md](AGENTS.md)，测试与发布细节见 [development](docs/development.md)（英文）。历史记录：[P0](docs/p0-result.md)、[P1](docs/p1-result.md)、[P2](docs/p2-result.md)（中文）、[P4](docs/p4/STATUS.md)（英文）。

## 文档

- [工具参考](docs/tools.zh-CN.md)
- [配置说明](docs/configuration.zh-CN.md)
- [Worktree 指南](docs/worktree-subagents.zh-CN.md)
- [角色与自定义代理](docs/roles.zh-CN.md)
- [故障排查](docs/troubleshooting.zh-CN.md)
- [文档索引](docs/README.zh-CN.md)
- [English documentation](docs/README.md)

## 已知限制

- Rex 原生侧栏标记尚未实现；Pi 自身的状态 widget 可用。
- 进程与 cwd 的可见性受系统权限限制。worktree 清理会披露无法确定的进程信息，并阻止存在已知占用或脏状态的删除。
- worktree 子代理的写入保护只覆盖带显式文件路径的已知写入工具，不是安全沙箱；shell 命令的 workspace 约束是提示级的。
- 当前不做 Windows 适配。

## 许可证

MIT。版权与许可全文见 [LICENSE](LICENSE)；上游归属和移植边界见 [UPSTREAM](docs/UPSTREAM.md)（英文）。
