# T2b 子代理上下文压缩保障

## 背景（2026-11-06 实际事故）

T2 的实现子代理 rex-surface-build 跑了约 4.7 小时，上下文涨到 85 万 token（模型窗口 272k），全程 0 次压缩，烧掉 200 多美元。根因已在会话 jsonl 中核实：

- 用户安装的 `billion-context-pi` 在 `session_before_compact` 里返回 `{ cancel: true }`，禁掉了 Pi 原生的自动压缩，改由模型调用 `compress` 工具来压缩（`~/.pi/agent/npm/node_modules/billion-context-pi/dist/index.js:23908`）。
- 内核启动子代理时传入 `--tools 'read,bash,edit,write,ffgrep,fffind,caller_ping'`（`buildSubagentToolAllowlist`），白名单里没有 `compress`，子代理因此没有任何压缩手段。
- 模型在 198 轮里把压缩摘要写成正文再去调用工具，这部分占了全部输出 token 的 92%。

事实：
- `billion-context-pi` 在扩展加载时（不是 session_start）注册 `compress`、`decompress`、`search_context`、`acp_status`、`acp_cache`，可选注册 `acp_rule`。
- Pi **没有**名为 compress 的工具，它的原生压缩是自动触发的 auto-compaction，默认开启。没有安装 billion-context 时，不需要往白名单里加任何东西，原生压缩会照常工作。
- Pi 文档（`dist/core/extensions/types.d.ts:515`）说明：已注册的工具可以通过 `--tools`、`defaultTools` 或 `setActiveTools()` 激活。

## 目标

所有子代理（新启动、resume、handoff、persistent）从**第一轮起**就带有可用的压缩工具：
- 装了 billion-context：自动启用它的压缩工具，不受 `tools` 白名单影响。
- 没装：不添加工具，依赖 Pi 原生的 auto-compaction。

## 步骤

1. 新建 `maestro/adapters/pi/context-tools.ts`，内容是一个"常用压缩工具"注册表：
   ```ts
   export const CONTEXT_COMPRESSION_PROVIDERS = [
     { id: "billion-context", marker: "compress",
       tools: ["compress", "decompress", "search_context", "acp_status"] },
   ] as const;
   export function resolveContextTools(registered: Iterable<string>): string[]
   ```
   `resolveContextTools`：某个 provider 的 marker 工具已注册时，返回它 `tools` 中已注册的那些（`acp_rule` 已注册时也一并带上）。结果去重，顺序稳定。以后加新的压缩插件，只需要在注册表里加一行。
2. **子代理一侧（主路径，必须做）**：在 `maestro/adapters/pi/child/subagent-done.ts` 的 `session_start` 中，已有的 `pi.getAllTools()` 之后计算 `missing = resolveContextTools(全部已注册) − pi.getActiveTools()`；`missing` 非空时调用 `pi.setActiveTools([...active, ...missing])`。要求：
   - 不移除任何已有工具，也不加入注册表以外的工具。
   - 如果 `session_start` 时调用 `setActiveTools` 不生效（实测核对），改在第一次 `before_agent_start` 时做，并在 STATUS 里记录实测结论。
   - `denied` 工具（`parseDeniedTools`）优先：被显式禁用的压缩工具不要加回来。
3. **父进程一侧（可见性）**：`buildSubagentToolAllowlist(tools, autoExit, extraTools?)` 增加可选参数 `extraTools`。`launch.ts:774` 和 `launch-resume.ts:136` 传入 `resolveContextTools(父进程已注册的工具名)`，让启动脚本里的 `--tools` 直接带上这些工具。如果父进程的已注册工具列表在这两处很难拿到，可以跳过这一步，但要在 STATUS 里说明；第 2 步已经能保证正确。
4. 文档：在 `subagent` 工具 `tools` 参数的说明里写明"会自动附加已安装的上下文压缩工具（如 billion-context）"，然后运行 `npm run docs:tools`。这只是说明变化，不属于 breaking；在 `docs/configuration.md` 中补一段说明。

## 测试

- 单测 `test/maestro/context-tools.test.ts`：
  - 装了 billion-context → 得到 4 个工具；有 `acp_rule` 时 5 个。
  - 没装 → `[]`。
  - 只注册了 `decompress`、没有 marker → `[]`。
- 单测：子代理 `session_start` 用假的 `pi`（`getAllTools`/`getActiveTools`/`setActiveTools` 用 spy 记录调用）：
  - 白名单是 `read,bash`，且已注册 billion-context → `setActiveTools` 收到 `read,bash,…,compress,decompress,search_context,acp_status`。
  - 没装 → 不调用 `setActiveTools`。
  - `compress` 在 denied 中 → 不加回来。
- 单测：`buildSubagentToolAllowlist` 带 `extraTools` 时结果去重；不传 `tools`（返回 null）时仍然返回 null，因为不限定工具时子代理本来就能用所有工具。
- **真实验证（必须）**：在 Rex lab 或当前会话里，用 `CBAPI/cn:deepseek-v4.1-flash`（免费）启动一个 `tools: "read,bash"` 的子代理，让它调用一次 `acp_status` 并报告结果。从子代理的 session jsonl 中确认存在一次成功的 `acp_status` toolCall。测完清理 block。

## 门禁

typecheck、lint、format:check、`docs:tools:check`；`npm test` 用 `docs/p4/baseline/test-gate.sh` 判定；完成上面的真实验证。

## 提交

`P4.T2b: guarantee context-compression tools in every subagent`

## 执行约束（本任务及之后所有任务）

- 正在运行的 pi 从主 checkout 加载内核，T2b 的修复不会作用到它自己派出的子代理。在 P4 结束前，**不要派出实现类子代理**，代码修改都在主会话里完成。只读审查子代理可以用，但范围要小，跑超过 20 分钟就停掉。
- 修正类工作一律不要 resume 一个已经很大的会话。
