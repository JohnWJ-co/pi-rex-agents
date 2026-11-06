# 安装与冲突处理

## 前提

- 在 Rex block 内运行 Pi，`REX_SESSION`、`REX_BLOCK` 都存在。
- Node.js 22.6+，可用的 Pi 和 Rex CLI。
- 从源码运行时先执行 `npm ci`。执行内核已 hard fork 在本仓库，不需要安装上游 npm 包。

## 临时加载

在本仓库根目录运行：

```bash
pi --no-extensions -e "$PWD/pi-extension/subagents/index.ts"
```

`--no-extensions` 关闭自动发现，只加载显式 `-e` 的扩展。普通终端缺少 Rex 宿主身份时，本扩展不注册工具。

## 安装为 Pi 包

```bash
pi install /absolute/path/to/pi-rex-agents
```

包通过以下 manifest 声明入口和操作指南：

```json
{
  "pi": {
    "extensions": ["./pi-extension/subagents/index.ts"],
    "skills": ["./skills/pi-rex-agents"]
  }
}
```

打包内容仅包含运行时、README、LICENSE、示例配置和操作指南。开发测试、迁移文档和本机 `.pi` 配置留在源码检出中。

## 处理工具名冲突

**不要同时加载未过滤的 `pi-herdr-agents` 和 `pi-rex-agents`**：两者注册同名工具，包括 `subagent` 和 `worktree_list`。

在 Rex 中使用本包时，用 `pi config` 禁用旧包，或使用上面的 `--no-extensions -e ...` 临时加载。检查包状态：

```bash
pi list
```

带 `(filtered)` 的旧包不加载资源、不注册工具。只有未过滤的旧包构成冲突。若要卸载旧包，可执行：

```bash
pi remove npm:pi-herdr-agents
```

本包不读取或迁移旧的 `herdr-agents/config.json`；新配置位于 `~/.pi/agent/rex-agents/config.json`，也可由 `PI_CODING_AGENT_DIR` 改变根目录。配置缺失时使用默认值。

## 自检与验证

源码检出中执行：

```bash
npm run doctor
npm run typecheck
bun test/smoke-extension.ts
npm run test:integration:rex
```

`doctor` 检查 Rex/Pi CLI、入口和 `pi list` 包状态，并保留未过滤旧包的冲突检查。Rex 集成测试使用隔离 server 和 fake provider；跳过表示没有验证该环境。

在交互式 Pi 中，`/subagent list` 和 `/worktree list` 应能运行。空角色目录是正常情况；本包不附带角色。默认 split 最多容纳本父进程管理的 2 个子 block，满后使用新 tab；`placement: "tab"` 和 worktree 子代理直接使用新 tab。`panes.maxPerTab` 只接受 1..8 的整数，详见 [配置说明](configuration.md#pane-placement)。

真实模型探针为 `npm run p1`、`npm run p1:persistent` 和 `npm run p2`，默认模型是 `CBAPI/cn:deepseek-v4.1-flash`。只在任务明确需要真实模型证据时运行。
