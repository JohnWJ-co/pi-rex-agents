[English](roles.md) | **简体中文**

# Roles and custom agents

本页介绍如何查找具名角色、如何编写自己的角色，以及如何发布角色包。不带 `agent` 的裸 `subagent` 启动不需要这些内容。日常使用见 [README](../README.zh-CN.md)。

## Taxonomy and discovery

本包区分可直接运行的 **代理角色**、Pi 原生 **技能**，以及已认证的 Pi **运行时**。一个多阶段用户成果可以是由角色组合而成的命令或技能；它本身不是代理角色。

宿主自身的编排接口包括：

| 接口 | 入口 | 行为 |
| --- | --- | --- |
| 委派 | `subagent`, `/subagent <agent> <task>` | 启动一个裸子代理或命名子代理；结果自动返回。 |
| Worktree 交接 | `/worktree <name> [task]`, `/worktree list` | 将当前活动对话 fork 到托管 worktree 中。 |

规划、审查和其他多阶段工作流属于角色包和技能，不属于本包。参见
[ADR-0002](adr/0002-agent-workflow-skill-runtime-taxonomy.md)、
[ADR-0009](adr/0009-remove-workflow-subsystem.md) 和
[ADR-0013](adr/0013-pack-neutral-execution-host.md)。

## Roles and role packs

本包是一个不绑定特定角色包的执行宿主：不附带任何代理角色、`/plan` 命令，也不附带规划或审查技能。它唯一的技能 `pi-rex-agents` 是面向该宿主的通用操作指南。命名启动会按以下优先级从项目定义、全局定义和已安装角色包注册的角色中解析 `agent`（详见下文）。空目录也是合法状态。不带 `agent` 的裸启动始终可用。显式指定的角色如果缺失或无效，会在 Rex 创建 pane 或 worktree 之前失败；绝不会被静默替换为裸代理。

所有子代理都通过 Pi 执行。Claude 模型仍可通过正常的 Pi provider/model 路由使用。包含 `cli` 的旧版角色定义会在 Rex 创建 pane 或 worktree 之前失败；请删除 `cli` 和 `cli-model`，然后选择已认证的 Pi `provider/model-id`。

角色包负责其角色的前提条件（例如必需的技能），并且必须记录这些条件。本包不会安装角色包或前提条件。

配置了模型默认值时，角色使用 `config.json` 中的默认值；否则继承父模型。thinking 默认值仍来自 agent frontmatter 或父级。这条解析链仍可作为回退方案使用，但编排器应显式设置每个子代理确切的已认证 `provider/model-id` 和受支持的 thinking 级别。先选择模型档位：fast 用于边界明确的机械性工作与侦察，mid 用于普通实现或审查，frontier 用于架构、安全、疑难诊断或对抗性审查。然后在该模型支持的范围内选择 thinking。跨家族独立审查要求审查者来自与作者不同的模型家族。对于普通审查，优先使用不同的已认证模型家族。当没有任何其他已认证模型家族可用时，普通审查可以在全新的独立会话中使用同家族审查者。应说明该审查是上下文隔离的，而不是跨家族独立审查。跨家族验证不得使用此回退方案。同家族中更强的模型属于质量升级，不是跨家族独立审查。家族是独立性边界；项目策略可以另行要求使用不同的 provider。

发现过程按 **package → global → project** 的顺序加载定义，因此实际优先级仍是 **project**（`.pi/agents/`）> **global**（`$PI_CODING_AGENT_DIR/agents/`，默认为 `~/.pi/agent/agents/`）> **package**。package 定义是已安装的 Pi 角色包贡献的角色；不存在内置层。`subagents_list` 和 `/subagent list` 都会显示每个可见定义的来源；由角色包贡献的角色会包含其 package 标识，例如 `(package:@acme/security-roles)`。被隐藏的较高优先级定义仍会抑制可见的较低优先级定义。

自定义角色和可安装角色包是本包的主要扩展点。完整的创建、打包、验证和启动流程见[自定义代理](#custom-agents)。

## Custom Agents

自定义 agent 角色是本包的主要扩展机制。当子代理需要一项可复用且有边界的职责（例如侦察、实现或审查）时，就创建一个。如果新概念描述的其实是一个多阶段用户成果，请把它做成组合角色的工作流、命令或 Pi 技能；不要把工作流伪装成 agent 定义。

### 1. Choose the scope

| 作用域 | 位置 | 使用场景 |
| ----- | -------- | -------- |
| 项目 | `.pi/agents/<name>.md` | 该角色属于单个仓库 |
| 全局 | `$PI_CODING_AGENT_DIR/agents/<name>.md` | 该角色应在所有位置可用；默认根目录为 `~/.pi/agent` |
| 角色包 | 已安装的 Pi package 所注册的 `roles/` 目录 | 该角色应可独立安装和共享 |

文件名主干就是启动键。`name` frontmatter 是可选的，因为它默认取文件名主干。如果提供，应保持完全一致，以便覆盖行为可预测；角色包会拒绝不匹配的情况。

### 2. Create the definition

```markdown
---
description: Reviews a bounded change for concrete security vulnerabilities
thinking: high
tools: read, bash
system-prompt: append
session-mode: standalone
spawning: false
auto-exit: true
---

# Security Reviewer

Review only the requested change. Trace trust boundaries and affected callers.
Report concrete findings with file and line references, exploit conditions,
severity, and the smallest safe correction. Do not modify files.
```

省略 `model` 时，依次使用 `models.agents.<name>`、`models.default`，然后是父模型。只有当角色本身需要某个确切的已认证 `provider/model-id` 时，才在 frontmatter 中放入 `model`。

`tools` 会传给 Pi 的 `--tools` 允许列表，可以列出任何已注册的内置工具、扩展工具或自定义工具。列出某个工具并不会安装其扩展。请使用一个非空的内联逗号分隔标量，例如 `tools: read, grep`；不要使用 YAML 列表、容器、引号或注释。省略 `tools` 会有意让角色不受限制。同样，`skills` 中的名称必须已能被 Pi 发现；本包不会安装角色的前提条件。

#### How declared skills reach the child

父代理只负责指定技能名称；子代理中的 Pi 决定哪些技能存在。宿主会按 Pi 的技能名称规则（1-64 个小写字母、数字和单个连字符）校验每个声明的名称，并在创建 pane 之前拒绝该次启动，错误信息中会指出被拒绝的名称。宿主会将这些名称以 JSON 数组形式放在 `PI_SUBAGENT_SKILLS` 中传给子代理，并在每次全新启动时显式设置（包括 fork 和 worktree 启动；角色未声明任何技能时为 `[]`）。父代理从不读取技能文件，从不发送 `/skill:` 参数，也从不把技能文本写入任务。

运行在子代理 Pi 内的子代理协议扩展会处理该次启动的第一个 `before_agent_start`。它会按精确名称，在 Pi 已为该子代理加载的技能（已经应用其自身的信任检查、忽略文件、设置和 package 过滤器）中查找每个声明的名称。它读取每个匹配项，并返回一条消息，其中包含 Pi 为 `/skill:name` 写入的 `<skill>` 块。Pi 会在子代理的首次模型请求中把该消息和任务一起发送。名称绝不会被转换为路径，因此 `../x` 不会匹配任何内容。子代理自身的 cwd 和 agent 目录决定 Pi 加载什么，因此 worktree 子代理看到的是其检出中的技能。

Pi 未加载的已声明技能不会阻止子代理。消息末尾会附上宿主说明：`declared skills not loaded by Pi: <names>`。读取有上限：子代理会先检查每个文件的大小。超过 64 KiB 的 `SKILL.md`，或会使总读取量或注入量超过 256 KiB 的技能，会被跳过并在说明中列出，因为此时启动已经在运行。若要解决，请缩短技能（把细节移到它引用的文件中）或减少声明的技能数量。后续轮次不会注入任何内容。恢复的会话已经持有其技能，并会得到 `PI_SUBAGENT_SKILLS=[]`。

### 3. Verify and launch

```text
/subagent list
/subagent security-reviewer Review the authentication changes against main
```

或直接调用工具：

```typescript
subagent({
  name: "Security review",
  agent: "security-reviewer",
  task: "Review the authentication changes against main.",
});
```

角色文件接受 LF 或 CRLF 换行，以及可选的 UTF-8 BOM 前缀。无效或不可读的全局或项目定义会在其优先级层阻止该角色名称，而不会暴露较低优先级的定义。发现过程会报告文件错误，并继续加载无关角色。

agent 文件在列出或启动定义时读取，因此创建或编辑某个文件通常不需要 `/reload`。安装、移除、更新角色包或更改角色包的扩展代码时，使用 Pi 正常的 `/reload` 流程。

### Publish a role pack

角色包是一个普通的 Pi package，包含 Markdown 定义，以及一个通过 Pi 的公开扩展间事件总线注册其目录的极小扩展：

```text
security-roles/
├── package.json
├── extension.ts
└── roles/
    └── security-reviewer.md
```

```json
{
  "name": "@acme/security-roles",
  "version": "1.0.0",
  "keywords": ["pi-package"],
  "type": "module",
  "pi": {
    "extensions": ["./extension.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

```typescript
import { fileURLToPath } from "node:url";

const roles = fileURLToPath(new URL("./roles", import.meta.url));

export default (pi: any) => {
  const unsubscribe = pi.events.on(
    "pi-rex-subagents:roles:discover:v1",  // stable protocol identifier
    (request: { apiVersion: number; register(path: string): void }) => {
      if (request.apiVersion === 1) request.register(roles);
    },
  );
  pi.on("session_shutdown", unsubscribe);
};
```

通过 Pi 安装这两个 package；如果缺少 `pi-rex-agents`，角色包会保持不生效状态：

```bash
pi install /absolute/path/to/pi-rex-agents
pi install npm:@acme/security-roles
```

注册是同步的，接受一个绝对 Markdown 文件，或一个其直接 `.md` 子项为角色的目录。如示例所示，桥接代码必须在 `session_shutdown` 时取消订阅，以免已移除或已更新的 package 在 reload 后仍存活。可复制的 package 采用上方展示的结构：一个 Markdown 角色文件加一个桥接模块。宿主会读取并校验这些文件，从最近的 `package.json` 推导 package 名称/版本，并在列表界面中报告无效路径、缺失描述、文件名/名称不匹配以及 package 层冲突。

已注册的角色包共同构成整个 package 层，彼此之间没有优先级：来自多个角色包的重名角色会带诊断信息被禁用，而不是按扩展加载顺序解决。若要有意覆盖，请使用全局或项目定义。

注册接缝、冲突规则和被否决的备选方案见 [ADR-0003](adr/0003-installable-role-packs.md)。

### Authoring checklist

- 角色具有单一且有边界的职责，以及清晰的报告或交接契约。
- 文件名主干就是角色名称；如果存在 `name`，它必须与主干匹配。
- `description` 说明角色的输入/输出职责。
- `tools` 和 `skills` 只包含已安装且必要的能力。
- 叶子角色设置 `spawning: false`。
- 自主角色设置 `auto-exit: true`；交互式角色不设置。
- 通用角色省略 `model`，除非功能上需要特定的运行时。
- `/subagent list` 显示预期的来源，并且一次冒烟启动成功。

能力声明是严格的：存在时，必须使用不加引号、不缩进的键 `tools:`、`deny-tools:`、`spawning:` 和 `self-spawn:`，且每个键只能出现一次。`tools` 和 `deny-tools` 必须声明为非空的内联逗号分隔标量，`spawning` 和 `self-spawn` 必须恰好为 `true` 或 `false`。YAML 列表、容器、多行值、引号、注释、空值、重复项、非规范键拼写和无效布尔值都会被拒绝。能力声明无效的角色会从发现中排除；按精确名称启动时，会在创建 Rex pane 或 worktree 之前报告诊断。其他不受支持或未知的 frontmatter 仍可能被忽略。请将定义与下方参考表对照，并通过 `/subagent list` 和一次冒烟启动进行验证。

### Frontmatter Reference

| 字段         | 类型    | 描述                                                                                                                                                                                                                                                                 |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string  | 可选的显式 agent 名称，用于 `agent: "my-agent"`；默认为文件名主干，并且在角色包中必须与其匹配                                                                                                                                                                                            |
| `description` | string  | 显示在 `subagents_list` 输出中                                                                                                                                                                                                                                            |
| `model`       | string  | 可选的精确已认证 Pi 模型默认值，或有序的逗号分隔回退列表；省略时依次使用按 agent 配置、全局配置，然后是父级                                                                                                                                                                                       |
| `thinking`    | string  | 可选的 Pi thinking 默认值（`off` 到 `max`）；省略时继承父级                                                                                                                                   |
| `system-prompt` | string | `append` 将 agent 正文作为 Pi 追加的系统提示传入；`replace` 替换 Pi 的默认系统提示。没有此字段时，正文会包含在任务包装器中                                                                                                                                                                                                                                 |
| `tools`       | string  | 在精确的无引号键 `tools:` 下提供一个非空的内联逗号分隔 Pi `--tools` 允许列表；可以包含任何已注册的内置、扩展或自定义工具名称。省略则不受限制。YAML 列表、容器、多行值、引号、注释、非规范键和重复项都会被拒绝。 |
| `skills`      | string  | 逗号分隔的技能名称。子代理自身的 Pi 会解析它们，并随其首个任务到达（见[声明的技能如何到达子代理](#how-declared-skills-reach-the-child)）。不符合 Pi 技能名称规则的名称会拒绝启动；Pi 未加载的名称会向子代理提示。新定义请使用这个复数形式；使用单数 `skill` 的旧项目/全局定义仍然兼容。 |
| `session-mode` | string | 默认子会话模式：`standalone`、`lineage-only` 或 `fork` |
| `spawning`    | boolean | 在精确的无引号键 `spawning:` 下恰好设置 `false`，以拒绝所有子代理启动工具。只接受一个 `true` 或 `false` 声明。 |
| `self-spawn`  | boolean | 在精确的无引号键 `self-spawn:` 下恰好设置 `true`，以允许此角色的子代理再启动同一角色的另一个实例。省略或 `false` 保持默认值，即阻止该行为。`spawning: false` 仍会拒绝所有启动并优先。只接受一个 `true` 或 `false` 声明。 |
| `deny-tools`  | string  | 在精确的无引号键 `deny-tools:` 下提供一个非空的内联逗号分隔 `pi-rex-agents` 工具列表，用于抑制这些工具；这不是通用的跨扩展拒绝列表。YAML 列表、容器、多行值、引号、注释、非规范键和重复项都会被拒绝。 |
| `auto-exit`   | boolean | 在 Pi 完全 settle 后自动关闭，除非 `agent_settled` 报告运行被中止（`agent_settled.aborted`），或最新助手轮次以 `stopReason: "aborted"` 结束；无需调用 `subagent_done`。如果该子代理启动的子代理的结果尚未投递给它，关闭会等待这些结果。用户输入不会永久禁用 auto-exit。推荐用于自主角色；不适用于用户驱动的交互式角色。它还决定 `interactive` 的默认值（见下文）。 |
| `interactive` | boolean | 覆盖停滞/恢复转换是否会唤醒父会话。默认值为 `auto-exit` 的反值：自主 agent（`auto-exit: true`）是非交互式的，会收到停滞 ping；没有 `auto-exit` 的 agent 是交互式的，保持安静。显式值优先。 |
| `persistent` | boolean | 在任务之间保持此角色的专家会话打开。后续工作使用 `subagent_send`；持久专家在 v1 中不能恢复。 |
| `cwd`         | string  | 默认工作目录。绝对路径无歧义；agent frontmatter 中的相对路径从 Pi 的 agent 配置目录（`PI_CODING_AGENT_DIR` 或 `~/.pi/agent`）解析，而不是项目根目录                                                                                                                                                                                                            |
| `disable-model-invocation` | boolean | 从 `subagents_list` 等发现界面隐藏角色。该定义仍可通过 `subagent({ agent: "name", ... })` 按精确名称直接调用。 |

---

发现过程仍会先解析优先级，再进行可见性过滤。如果项目本地的隐藏 agent 与可见的全局或角色包 agent 同名，隐藏的项目 agent 会胜出，较低优先级的 agent 不会出现在 `subagents_list` 中。

### `session-mode`

选择子代理会话的启动方式：

- `standalone` — 默认的全新会话，不建立到调用方的 lineage 链接
- `lineage-only` — 全新的空白子会话，带 `parentSession` 链接，但不从调用方复制任何轮次
- `fork` 会在触发它的用户轮次之前，从调用方的活动对话分支创建一个链接的子会话。它排除已放弃的分支，并维持被保留的 compaction 条目与 lineage 条目之间的关联。

`lineage-only` 适合这样的场景：你希望会话发现和 fork lineage UX 之后能显示这种关系，但**不**希望子代理继承父代理的轮次。

工具调用中的 `fork: true` 强制使用 `fork` 模式；`fork: false` 强制使用 `standalone` 模式。省略 `fork` 时继承 agent frontmatter 中的 `session-mode`。

```yaml
---
name: planner
session-mode: lineage-only
---
```

### `auto-exit`

设为 `true` 时，agent 会话会在 Pi 的 `agent_settled` 事件上关闭，除非该事件报告运行被中止（`agent_settled.aborted`），或最新助手消息带有 `stopReason: "aborted"`。无需显式调用 `subagent_done`。

**行为：**

- 底层 `agent_end` 事件不会关闭会话，因为 Pi 仍可能重试、压缩后重试，或处理排队的后续任务。
- 在 `agent_settled` 之后，正常停止或错误停止会退出，而被中止的运行会保持打开。Pi 可能将工具调用期间按下的 Escape 记录为 `stopReason: "error"`，因此 `agent_settled.aborted` 也会让会话保持打开。
- 当子代理自己启动的子代理仍有结果、求助请求或取消尚未投递给它时，正常停止不会退出。投递会以 steer 方式向子代理注入新一轮；当最后一条结果投递完成且该轮正常 settle 后，子代理便会退出。未启动任何子代理的子代理不受影响；已 settle 的错误仍会退出并上报；持久专家从不会阻止退出。因此，子代理无需调用 `subagent_done` 来收集其子代理的结果。
- 用户输入不会永久禁用 auto-exit；最近一次已 settle 的助手轮次的停止原因决定会话是否退出。
- 注入到 agent 任务中的 modeHint 会相应调整：自主 agent 会看到“Complete your task autonomously.”，而不是调用 `subagent_done` 的说明

**何时使用：**

- ✅ 自主角色，例如侦察、实现或审查角色，会运行至完成
- ❌ 交互式角色，或由用户驱动会话的 `interactive: true` fork

```yaml
---
name: scout
auto-exit: true
---
```

没有 `auto-exit` 的子代理只能通过 `subagent_done` 关闭。当子代理正常结束一轮但没有调用它时，3 秒后会询问该子代理其任务是否完成。如果子代理有自己的子代理正在工作、有排队消息或编辑器中有草稿，则会跳过该询问；并且对于由其他事件启动的每次运行，最多只询问一次，因此回答自己正在等待的子代理不会再次被询问，直到有新输入到达。持久专家不会被询问。

### `interactive`

控制状态转换（`stalled`、`recovered`）是否通过 steer 消息唤醒父会话。

**默认值：** `auto-exit` 的反值。自主 agent（`auto-exit: true`）是非交互式的，在停滞/恢复时 ping 父会话；没有 `auto-exit` 的命名 agent 是交互式的，保持安静。裸启动没有 agent 定义，默认采用自主 auto-exit 行为；只有调用传入 `interactive: true` 时才会变为交互式。

**为什么存在：** 交互式 agent 可能运行数分钟或数小时，期间用户会在子代理的 pane 中思考、输入和阅读。子代理快照仍会更新 widget，但对于用户驱动的会话，停滞/恢复监督消息很少需要唤醒父会话。跳过 steer 可以让父会话保持安静，直到子代理真正完成。

**何时覆盖：**

- 对不会自动退出但仍希望收到停滞 ping 的 agent 设置 `interactive: false`
- 对更愿意亲自查看的自主 agent 设置 `interactive: true`

```yaml
---
name: planner
# interactive defaults to true because auto-exit is not set
---
```

或在每次启动时：

```typescript
subagent({ name: "Scout", agent: "scout", interactive: true, task: "..." });
```

---

## Tool Access Control

如果没有限制性的 `tools` 允许列表或启动策略，子代理可以继续启动子代理。请通过 frontmatter 控制：

### `spawning: false`

拒绝所有子代理生命周期工具（`subagent`、`subagent_interrupt`、`subagent_cancel`、`subagent_send`、`subagent_stop`、`subagents_list`、`subagent_resume`）：

```yaml
---
name: worker
spawning: false
---
```

### `self-spawn: true`

默认情况下，由命名角色启动的子代理不能启动同一角色的另一个子代理：`subagent` 调用会返回 `self-spawn blocked` 消息，告知它自行完成工作。该默认值适合单一职责角色。一个确实需要把工作拆分给多个并行同级子代理的通用 worker 角色可以选择启用：

```yaml
---
name: worker
self-spawn: true
---
```

宿主会在启动时记录该声明，因此子代理无需再次查找自己的定义。注意：

- 当该键缺失或为 `false` 时，默认值保持不变。
- `spawning: false` 会移除所有启动工具，因此优先于 `self-spawn: true`。
- 同级子代理不会从父代理继承许可：每个子代理只有在其自身角色声明了该许可时才会获得。宿主会在每次启动时显式设置 `PI_SUBAGENT_SELF_SPAWN`，包括恢复和 `/worktree` 交接（仅当全新启动一个选择启用的命名角色时为 `1`，否则为 `0`），因此 pane shell 中残留的值无法启用它。
- **深度限制。** 自启动受宿主强制执行的委派深度限制约束，该限制适用于每次启动，无论角色是什么。顶层父代理为深度 0，每次启动加一；默认最大值为深度 1，因此子代理都是叶子。达到限制的会话会收到来自 `subagent`、`subagent_resume` 和 `/subagent` 的拒绝，因此选择启用的不可信角色无法无界递归。`/worktree` 交接保持父代理的深度，因此在达到限制时仍允许，只有在深度未知时才会被拒绝。可通过 [`config.json`](configuration.zh-CN.md#delegation-depth-limit) 中的 `spawning.maxDepth` 更改该限制。该限制计算的是深度而非广度：一个会话仍可启动多个子代理，因此应在角色提示中约束拆分范围。
- 默认阻止是角色设计层面的默认值，不是递归边界：角色 A 仍可启动角色 B，角色 B 又可启动角色 A。真正限制该链条的是深度限制。若要完全停止委派，请使用 `spawning: false` 或 `deny-tools`。

### `deny-tools`

对 `pi-rex-agents` 注册的工具进行细粒度控制：

```yaml
---
name: focused-agent
deny-tools: subagent
---
```

### Recommended Configuration

| 角色形态 | `spawning` | 理由 |
| --- | --- | --- |
| 叶子角色（侦察、实现、审查、QA） | `false` | 执行单一且有边界的职责，不再委派。 |
| 在多个同级子代理间拆分工作的并行 worker | `true` 配合 `self-spawn: true` | 启动同一角色的同级子代理；在角色提示中限制拆分范围。 |
| 协调器 | `true` | 委派有边界的子代理；`auto-exit: true` 的协调器在其子代理尚未完成时保持打开，并在最后一次投递之后的那次 settle 完成后退出。仅当协调器应在两波任务之间无未完成事项时仍保持打开，才设置 `auto-exit: false`，然后调用 `subagent_done`。 |
| 交互式协作者 | *（默认）* | 在用户驱动会话期间，可以委派用于补齐事实缺口的工作。 |

每个角色包都会记录其附带角色的设置。

---

## Role Folders

`cwd` 参数允许子代理在具有自身配置的特定目录中启动：

```
project/
├── agents/
│   ├── game-designer/
│   │   └── CLAUDE.md          ← "You are a game designer..."
│   ├── sre/
│   │   ├── CLAUDE.md          ← "You are an SRE specialist..."
│   │   └── .pi/skills/        ← SRE-specific skills
│   └── narrative/
│       └── CLAUDE.md          ← "You are a narrative designer..."
```

```typescript
subagent({ name: "Game Designer", cwd: "agents/game-designer", task: "Design the combat system" });
subagent({ name: "SRE", cwd: "agents/sre", task: "Review deployment pipeline" });
```

在 agent frontmatter 中设置默认 `cwd`。项目目录请使用绝对路径；frontmatter 中的相对路径会从 Pi 的 agent 配置目录解析：

```yaml
---
name: game-designer
cwd: /absolute/path/to/project/agents/game-designer
spawning: false
---
```
