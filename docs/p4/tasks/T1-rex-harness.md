# T1 Rex lab、Rex 集成 harness、AGENTS.md、验证技能

## 目标
在删除 Herdr 之前，先搭好 Rex 版的验证体系，让 T2–T6 每一步都有端到端门禁。

## 必读
`docs/p4/rex-facts.md` 中的 F3、F4、F8；上游 `.pi/skills/verify-pi-herdr-agents/SKILL.md`、`scripts/lab.ts`、`scripts/pin.ts`、`.pi/skills/run-integration-tests/SKILL.md`、`test/integration/harness.ts`、`test/integration/fake-provider.ts`。

## 步骤
1. `src/rex-cli.ts`：所有 rex 调用都显式带 `-S "$REX_SERVER"`（存在时）和 `--autostart=false`。补单测（argv 构造）。
2. 新增 `.pi/skills/verify-pi-rex-agents/scripts/lab.ts`（以上游 lab.ts 为蓝本），子命令如下：
   - `doctor`：rex/pi/node 版本、`REX_SESSION`/`REX_BLOCK`、扩展路径、确认没有正在运行的集成套件、lab 存活情况。
   - `up`：`mkdtemp(join(os.tmpdir(),"pira-lab-"))`（socket 路径必须 ≤104 字节），以 `REX_SERVER=unix://<dir>/s` 环境启动 `rex server run --listen unix://<dir>/s --state-dir <dir>/state --restore=false`，建 session，**在 lab block 中执行 `rex whoami --json`，确认 endpoint 是 lab socket**，否则失败。
   - `drive`：在 lab 中启动父 Pi（`--no-extensions -e <worktree>/src/extension.ts`，provider 指向 fake-provider），通过真实工具路径调用 `subagent`，收集投递的 `<subagent_report>`、子 session 文件、block 生命周期作为证据，写入 `<dir>/evidence.json`。
   - `down`：停止 lab 服务器，删除临时目录。
3. 新增 `test/integration/rex-harness.ts`：复用 `fake-provider.ts`，提供 lab 生命周期、在 lab 中启动父 Pi、等待文件/OSC 状态/block 条件的工具函数（禁止用固定 sleep 同步）。
4. 新增 `test/integration/rex-smoke.test.ts`：父 Pi 发起 1 个普通子代理 → 父进程收到报告 → 子 block 被清理。不需要 REX 环境时用 `skip` 并在输出中注明原因（skip 不算通过）。
5. 加 npm 脚本 `test:integration:rex`（`--test-concurrency=1`）。
6. 新写 `AGENTS.md`（以上游 AGENTS.md 为蓝本）：本包是什么（Rex 宿主的 Pi 子代理扩展，hard fork）、必读文档、代码地图（当前状态，后续任务同步更新）、文档同步规则、验证门禁、提交前检查。删除 role-pack/release/sidebar 相关内容。
7. 新写 `.pi/skills/verify-pi-rex-agents/SKILL.md` 与 `.pi/skills/run-integration-tests/SKILL.md`（Rex 版：preflight 检查 `REX_SESSION`，postflight 检查 `rex ls` 中没有残留的 `pira-lab-*`/`pi-integ-*`）。删除复制过来的 `verify-pi-herdr-agents`。
8. `scripts/pin.ts` 移到新技能目录，确认能对当前树产出 pin JSON。

## 门禁
- `lab.ts doctor`、`up`、`down` 都成功，并且 `up` 的 lab 自检通过（记录 whoami 输出摘要）。
- `npm run test:integration:rex` 中的冒烟用例真实通过（不是 skip）。
- `npm run typecheck`、`npm test` 仍然全绿。
- postflight：没有遗留的 lab 进程、临时目录或 session。

## 提交
`P4.T1: Rex lab, integration harness, AGENTS.md and verify skills`
