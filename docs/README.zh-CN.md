[English](README.md) | **简体中文**

# Documentation map

当前运行时指南描述的是 Rex hard fork。`adr/` 与 `research/` 下的文件保留上游决策与研究背景；P0–P2 页面被标记为历史。历史页面将 fork 前的执行宿主称为 `LegacyHost`，这是对已被取代的 runtime 的中性别名。当前行为由 [README](../README.zh-CN.md)、[P4 status](p4/STATUS.md) 和运行时契约定义。

本页面用于查找某项任务的权威文档。当前已发布的行为与已接受的 ADR 管辖现有 API。当后续 ADR 取代先前的计划或研究时，它们只是证据，而非已发布的契约。

## Shipped contracts

- [`../README.md`](../README.zh-CN.md) — 安装、日常使用与安全。
- [`tools.md`](tools.zh-CN.md) — 公开工具、命令、参数与运行生命周期。
- [`delegation-outcome-contract.md`](delegation-outcome-contract.md) —
  `delegation-outcome/v0.1` 契约：报告 envelope、provenance、大小上限、
  宿主证据、accept check 判定、工具 schema 兼容性以及一致性测试。
- [`configuration.md`](configuration.zh-CN.md) — `config.json`、模型偏好、
  task-model init 事件、监督、pane 布局以及 outcome ledger。
- [`roles.md`](roles.zh-CN.md) — 角色发现、编写、工具访问控制与角色包。
- [`troubleshooting.md`](troubleshooting.zh-CN.md) — 完成投递及其他常见问题。
- [`development.md`](development.md) — 代码地图、CI 与本地检查。
- [`../CONTEXT.md`](../CONTEXT.md) — 编排术语表。
- [`worktree-subagents.md`](worktree-subagents.zh-CN.md) — worktree 操作、
  评审、恢复与清理。

本包在 Rex block 和 window 中运行异步 Pi 子代理，并为写入型任务支持受管 worktree。它附带 [`pi-rex-agents` 操作技能](../skills/pi-rex-agents/SKILL.md)，但不附带 agent 角色或规划与评审工作流。项目定义、全局定义和已安装的角色包提供角色（[ADR-0013](adr/0013-pack-neutral-execution-host.md)）。`read,bash` 工具允许列表并非只读，因为 shell 命令可以修改文件。

CI 检查格式、lint、单元测试和包内容。确定性的 Rex 集成仍是本地关卡。

## Architecture and code map

[ADR-0012](adr/0012-adopt-maestro-seams-in-repo.md) 记录了已接受的架构决策。

- `../maestro/core/` — 与宿主无关的接口、领域规则、角色与配置。
- `../maestro/adapters/pi/` — Pi 宿主适配器与子代理协议。
- `../maestro/surfaces/rex/` — Rex provider 与 CLI 驱动。
- `../maestro/runtime/` — 运行归属以及真实的 Pi/Rex 组合。
- `../pi-extension/subagents/index.ts` — Pi 宿主入口；
  `model-registry.ts` 与 `config-path.ts` 仍是宿主本地的永久所有者。
- `../test/maestro/` — seam 一致性测试与依赖规则测试；真实的一致性运行在
  `../test/integration/` 中。

参见[完整代码地图](development.md#code-map)。Rex 是唯一的真实 surface 实现；内存 fake 仅用于一致性测试夹具。

## ADRs

| ADR | 状态 | 决策 |
| --- | --- | --- |
| [`0001`](adr/0001-btw-ephemeral-side-questions.md) | 被 0013 取代 | 历史性的 `/btw` 旁问决策；该命令已被移除。 |
| [`0002`](adr/0002-agent-workflow-skill-runtime-taxonomy.md) | 部分被 0009 和 0013 取代 | 保持 agent 执行、技能与 Pi runtime 相互独立。 |
| [`0003`](adr/0003-installable-role-packs.md) | 已接受；内置层被 0013 取代 | 定义可安装角色包的发现与冲突规则。 |
| [`0004`](adr/0004-require-active-user-approval-for-workflow-execution.md) | 被 0009 取代 | 历史性的精确脚本审批决策。 |
| [`0005`](adr/0005-parent-owns-workflow-script-authority.md) | 被 0009 取代 | 历史性的工作流脚本权限决策。 |
| [`0006`](adr/0006-limit-v1-execution-effects-to-isolated-worktrees.md) | 部分被 0009 取代 | 历史性的 runner 副作用边界；受管 worktree 规则仍然保留。 |
| [`0007`](adr/0007-require-fresh-review-for-workflow-scripts.md) | 被 0009 取代 | 历史性的工作流评审决策。 |
| [`0008`](adr/0008-adopt-pi-only-subagent-execution.md) | 部分被 0012 取代 | 保持仅 Pi 执行；0012 仅取代 adapter seam 限制。 |
| [`0009`](adr/0009-remove-workflow-subsystem.md) | 已接受；技能归属已由 0013 迁移 | 移除 workflow 子系统；使用公开的 subagent fan-out 与父代理综合。 |
| [`0010`](adr/0010-persistent-specialists-as-session-generations.md) | 已接受 | 将持久专家定义为逻辑身份，其 session generation 受策略约束。 |
| [`0011`](adr/0011-explicit-worktree-cleanup.md) | 已接受；由 0015 修订 | 按 cwd 包含关系授权显式 worktree 清理；保留分支并拒绝自动回收。 |
| [`0012`](adr/0012-adopt-maestro-seams-in-repo.md) | 已接受 | 采用仓库内 seam 与一致性 fake；保留单一包、仅 Pi 执行和仅 Rex surface。 |
| [`0013`](adr/0013-pack-neutral-execution-host.md) | 已接受 | 交付 pack-neutral 执行宿主；角色与工作流移至可选包，并移除 `/iterate` 和 `/btw`。 |
| [`0014`](adr/0014-operator-cancel-terminal-intent.md) | 已接受 | Operator cancel 在自有终止前记录终态意图：不回退，只产生一个已确认的 cancelled 结果，未确认的运行保持存活。 |
| [`0015`](adr/0015-report-opened-primary-workspace.md) | 已接受 | 报告（且永不自动关闭）worktree 创建所打开的主工作区。 |
| [`0016`](adr/0016-delegation-outcome-contract.md) | 已接受 | 定义一个小型、带版本的 delegation outcome 契约，并以本包作为其参考实现。 |
| [`0017`](adr/0017-accept-check.md) | 已接受 | 由调用方提供的 accept check；父代理的复核从封闭集合中判定结论，每次模型尝试都会追加一行 outcome ledger。 |

## Active design

尚未成为已发布行为的提案设计。仅当代码与上述已发布契约文档发生变化时，它们才会成为契约。

- [`accept-check-design.md`](accept-check-design.md) — 已在
  `delegation-outcome/v0.1` 中实现（[ADR-0017](adr/0017-accept-check.md)）；
  保留其理由、仍待解决的问题以及后续步骤。已发布的行为见
  [`tools.md`](tools.zh-CN.md#accept-checks) 和
  [契约](delegation-outcome-contract.md#verdicts)。

## Historical material

- [`orchestrated-review-workflow-plan.md`](orchestrated-review-workflow-plan.md)
  — 已被取代的工作流设计，作为历史保留。其 `skills/orchestrate`
  与 review-evaluation 路径现在属于某个角色包。
- [`research/`](research/) — 背景证据与备选方案，而非已发布行为。
