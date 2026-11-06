# pi-rex-agents

`pi-rex-agents` 0.4.0 是 Rex 原生的 Pi 子代理扩展。父 Pi 在当前 block 中继续工作；`subagent` 在同一 tab 的 block 或新 tab 中启动子 Pi，完成后自动把结果送回父会话。

本仓库包含从上游 3.7.2 hard fork 的执行内核，不依赖 `pi-herdr-agents` npm 包。上游来源、MIT 许可证和人工移植规则见 [UPSTREAM](docs/UPSTREAM.md)。

## 安装

需要 Node.js 22.6+、Pi 和 Rex，并在 Rex block 内运行 Pi：`REX_SESSION`、`REX_BLOCK` 必须存在。开发检出先运行：

```bash
cd /absolute/path/to/pi-rex-agents
npm ci
npm run doctor
```

临时加载当前检出：

```bash
pi --no-extensions -e "$PWD/pi-extension/subagents/index.ts"
```

长期使用可运行 `pi install /absolute/path/to/pi-rex-agents`。不要同时加载未过滤的 `pi-herdr-agents`，因为两者注册同名工具。`pi list` 中带 `(filtered)` 的旧包不加载资源。安装、自检和冲突处理详见 [安装说明](docs/install.md)。

## 使用

本包提供 `subagent`、`subagent_resume`、`subagent_interrupt`、`subagent_cancel`、`subagent_send`、`subagent_stop`、`subagents_list`、`subagents_write_task_models`、`worktree_list` 和 `worktree_remove`。

- `placement: "split"` 在父 block 旁启动子代理；`placement: "tab"` 在新 tab 启动。Rex 的 window 就是 tab，block 就是 pane。
- split 默认最多 2 个本父进程管理的子 block；名额已满时使用新 tab。关闭子 block 后释放名额，`/reload` 保留登记和预留状态。用户手动添加的 block 和其他父进程不占此名额。
- worktree 子代理始终使用新 tab，基于已提交的 Git 状态创建隔离检出。完成后保留窗口、分支和工作区，由父代理审查及清理。
- 子代理是叶子。父代理负责拆分任务、检查结果、运行验证、整合和清理。本包不附带角色或工作流；角色可以来自项目、个人配置或角色包。
- 完成、失败和求助消息会自动唤醒父会话。派出后继续独立工作或结束当前轮次，不需要轮询日志或状态。

详细参数见 [工具参考](docs/tools.md)，操作指南见 [pi-rex-agents skill](skills/pi-rex-agents/SKILL.md)。

## 配置

读取 `$PI_CODING_AGENT_DIR/rex-agents/config.json`，默认 `~/.pi/agent/rex-agents/config.json`。旧的 `herdr-agents/config.json` 不读取、不迁移；新文件缺失时使用默认值。

```json
{
  "panes": {
    "mode": "split",
    "split": "right",
    "maxPerTab": 2
  }
}
```

`panes.mode` 只接受 `"split"` 或 `"tab"`；`panes.maxPerTab` 只接受 1..8 的整数，默认 2。完整配置见 [configuration](docs/configuration.md) 和 [config.json.example](config.json.example)。

子代理自动启用已安装的上下文压缩工具，包括 billion-context 的 `compress`、`decompress`、`search_context`、`acp_status` 及可选的 `acp_rule`，即使传入 `tools: "read,bash"`。显式 `deny-tools` 仍优先；fresh、resume、persistent 和 worktree handoff 都适用。没有压缩插件时沿用 Pi 原生 auto-compaction。

## 回传契约

| 证据 | 用途 |
|---|---|
| 原子发布的 `.result.json`；persistent 的每任务结果文件 | 父进程校验 subagentId、taskId、generation 后读取正文 |
| session JSONL | 结果文件不可用时的正文回退和审计证据 |
| `.exit` | Pi 内核的语义退出记录 |
| `.exitcode` | 包装脚本记录进程退出码；子 Pi 被强杀时仍可报告失败 |
| Rex `program_status` 根记录 | Pi 原生 working / blocked / done / idle 状态 |
| `id=pira` 子记录 | 扩展追加任务、generation 和结果元数据 |

完成判定不读取终端屏幕。persistent inbox 使用目录事件唤醒，并以 5 秒轮询兜底；收到一轮结果即可立即发送下一轮。完整字段与验收要求见 [P4 回传契约表](docs/p4/plan.md#回传契约依据实测) 和 [运行时证据契约](docs/delegation-outcome-contract.md#rex-runtime-evidence)。

## 评审模型选择

Cross-family independent review requires a reviewer from a different model family than the author. For ordinary review, prefer a different authenticated model family. When no other authenticated model family is available, ordinary review may use a same-family reviewer in a fresh standalone session. Disclose that this review is context-isolated, not cross-family independent. Cross-family verification must not use this fallback.

角色配置和工具权限见 [roles](docs/roles.md)。`read,bash` 中的 Bash 可以修改文件；评审者的权限应与任务一致。

## 验证与开发

```bash
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

代码地图和门禁要求见 [AGENTS.md](AGENTS.md)。[P0](docs/p0-result.md)、[P1](docs/p1-result.md)、[P2](docs/p2-result.md) 是历史记录；当前内核行为以代码、本文及 [P4 状态](docs/p4/STATUS.md) 为准。

## 已知限制

- Rex 原生侧栏标记尚未实现；Pi 自身的状态 widget 可用。
- 进程与 cwd 的可见性受系统权限限制。worktree 清理会披露无法确定的进程信息，并阻止存在已知占用或脏状态的删除。
- 与未过滤的 `pi-herdr-agents` 存在工具名冲突，必须禁用其中一个。
