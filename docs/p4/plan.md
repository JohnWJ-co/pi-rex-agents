# 计划4：内核入库、Rex 原生化、移植 Harness

> 取代计划2（patch-package 方案）和计划3（未经实测）。实测证据见 [rex-facts.md](rex-facts.md)，下文以 F1–F10 引用。
> 开发地点：`/Users/qiangwenjun/Documents/project/pi-rex-agents-p4`（分支 `p4-kernel`）。**不要修改主 checkout**（F10）。

## 目标

1. 把 `pi-herdr-agents@3.7.2`（`e1e7d72`，MIT）hard fork 进本仓库，Rex 是唯一的 surface，删除所有补丁层：`rex-host-api` 代理、`placement` ALS、`rex-wording` / `host-message` / `wording-check`，也不引入 patch-package。
2. 把上游的工程 Harness 移植成 Rex 版：AGENTS.md、`.pi/skills` 验证技能、确定性 fake provider 集成测试、conformance、工具 schema 契约、重构 pin、大小规则、doctor。
3. 按实测事实重定回传契约和状态。

## 回传契约（依据实测）

| 通道 | 用途 | 依据 |
|---|---|---|
| `<sessionFile>.result.json` / `.result.<taskId>.json`（子代理 tmp+rename） | **结果正文** | F5（屏幕不可靠），F7（扩展可写） |
| `<sessionFile>.exit` sidecar | **完成提交点**（沿用内核） | F2（OSC 不能当提交点） |
| `<sessionFile>.exitcode`（启动脚本写 `$?`） | 崩溃兜底，替代 `__SUBAGENT_DONE__` 屏幕哨兵 | F3、F5 |
| session JSONL `findLastAssistantSummary` | result 文件缺失时的回退 | 内核现状 |
| `fs.watch` | 父进程唤醒（沿用） | F6 |
| OSC 7501 根记录（Pi 原生，`--name` 带身份） | 状态：working/blocked/done/error/idle | F1 |
| OSC 7501 `id=pira` 子记录（子代理扩展写，≤2048 字节） | 补充 taskId/generation/result 路径，可观测性 | F2、F7 |
| 文件 inbox + `fs.watch`（兜底轮询） | 父→持久化子代理的后续任务 | F9 |
| `rex send`（bracketed paste）+ `send-key` | 交互式输入、Escape 中断 | F4 |
| block 消失 | 兜底（沿用） | F2/F3 |

明确不做：屏幕抓取作为结果；`rex events` 作为投递路径（时延没有优势，F6）；扩展写根记录（F1）。
后续可选优化（不在本计划内）：子代理以 block 程序身份启动并读取 `child_exited`（F3）；supervision 改订阅 `rex events`（F6）；子代理 `--tui-mode regular`（F5）。

## Harness（从上游移植，改成 Rex）

- `AGENTS.md`：仓库说明、代码地图、文档同步规则、验证门禁、提交前检查（以上游为蓝本，Herdr → Rex，删去 role-pack / release 相关内容）。
- `CONTEXT.md`：领域术语表（Surface provider = Rex）。
- `.pi/skills/verify-pi-rex-agents/`：按变更类型列门禁；`scripts/lab.ts`（Rex lab：`doctor/up/drive/down`）；`scripts/pin.ts`（重构行为 pin）；大小规则（`pi-extension/subagents` 下单文件 < 32KB）；变异证明。
- `.pi/skills/run-integration-tests/`：在 Rex lab 中跑确定性集成套件，以及 postflight 清理检查。
- `test/integration/`：`fake-provider.ts` 原样复用（本地脚本化 provider，不需要密钥）；`harness.ts` 改为 Rex lab 版本；Rex 下的 lifecycle/placement/cancel/persistent 用例。
- 契约：`test/fixtures/tool-schema/{current,released}.json` + `scripts/update-tool-docs.ts`；`harness-adapter.conformance.ts` 加上 SurfaceProvider conformance，对 fake 和 Rex lab 各跑一遍。
- 质量：保留 biome format、oxlint + `tools/oxlint/anti-slop` 规则、`tsc --strict`。
- Rex lab 必须满足 F8：短 socket 路径，用 `REX_SERVER=<lab>` 启动服务器，RexCli 显式传 `-S`，自检确认在 lab 中。

## 配置

- 路径：`~/.pi/agent/rex-agents/config.json`（内核自带的 `config.json` 机制，不另读 `settings.json`）。
- `panes.mode`：`"split" | "tab"`，默认 `"split"`（删除 `grouped`）。`panes.maxPerTab`：默认 **2**，只接受 1..8 的整数；非法值走内核现有的报错路径。`/reload` 生效。
- split 计数归内核 placement reservation 负责，按"父 block 所在 window 中仍然存活的本父进程子 block"计数，`/reload` 后计数不归零。

## 任务拆分（按顺序执行，每个任务一个或多个提交）

| 任务 | 内容 | 主要门禁 |
|---|---|---|
| [T0](tasks/T0-vendor-baseline.md) | 原样入库内核 + 上游 Harness 工具，行为不变 | typecheck、`npm test` 全绿 |
| [T1](tasks/T1-rex-harness.md) | Rex lab、Rex 集成 harness、AGENTS.md、验证技能、doctor | lab 自检、1 条端到端冒烟 |
| [T2](tasks/T2-rex-surface.md) | Rex provider 入内核，删除 Herdr/sidebar/Windows | conformance（fake + lab）、集成套件 |
| [T3](tasks/T3-placement-config.md) | placement 原生参数、maxPerTab=2、split 计数下沉 | schema 契约、placement 集成用例 |
| [T4](tasks/T4-wording-entry.md) | 源头文案、删除替换层、入口切换、宿主提示 | no-foreign-host、pin 对比 |
| [T5](tasks/T5-return-contract.md) | result 文件、`.exitcode`、`--name`、OSC 子记录、inbox fs.watch | 回传单测、集成套件、真实模型冒烟 |
| [T6](tasks/T6-finalize.md) | 命名/路径/文档/打包收尾 | 全部门禁、`npm pack --dry-run` |

进度记录在 [STATUS.md](STATUS.md)。任何门禁失败：停止，在 STATUS.md 写明失败的命令、输出摘要和判断，不要跳过或弱化门禁。

## 边界

- Hard fork 之后不再自动获得上游修复；`docs/UPSTREAM.md` 记录基线，需要时手动 cherry-pick。
- result 文件只由正常结束的子代理写；handoff/fork、崩溃、取消路径回退到 JSONL 或 `.exitcode`。
- OSC 是 best-effort，只影响可观测性。
- 旧的 `herdr-agents/config.json` 不会迁移（在 README 中说明）。
- 删除 Windows 支持（Rex 只在 macOS/Linux 上运行）。
