# T6 命名、路径、文档、打包收尾

## 步骤
1. 改名：`PI_HERDR_AGENTS_SESSION` → `PI_REX_AGENTS_SESSION`；`Symbol.for("pi-herdr-agents/…")` → `pi-rex-agents/…`；错误码 `PIHA_*` → `PIRA_*`；配置目录 `herdr-agents` → `rex-agents`（`config-path.ts`）；`skills/pi-herdr-agents/` → 合并到 `skills/pi-rex-agents/SKILL.md`。
2. `package.json`：版本 `0.4.0`，description，`files` 字段（只打包运行时所需文件），`pi.skills`。
3. README 重写：安装、配置（`~/.pi/agent/rex-agents/config.json` 中的 `panes.maxPerTab` 默认 2、1..8，`panes.mode`）、回传契约（引用 `docs/p4/plan.md` 中的表格）、已知限制（删除已经解决的 2 和 4）、旧配置不迁移的说明。
4. `docs/install.md`：保留"不要同时加载未过滤的 pi-herdr-agents"的提示（两者工具名相同），`doctor` 保留这项检查。
5. `docs/tools.md`、`docs/configuration.md` 等复制来的文档做全文 Rex 化；`docs/p0..p2-*` 历史记录保留，并在开头标注"历史记录"。
6. AGENTS.md 代码地图、CONTEXT.md、验证技能最终同步。
7. 改写 `test/package-manifest.test.js` 及 `expected-identity.txt` 中的测试，使其断言 pi-rex-agents 的身份和打包内容，完成后清空 `expected-identity.txt`；`inherited-failures.txt` 中的 macOS 路径断言问题顺手修复（修复后从基线移除）。
8. 打包检查：`npm pack --dry-run` 的内容只包括运行时文件、README、LICENSE、`config.json.example`、`skills/pi-rex-agents`；不包括 test、docs/p4、`.pi`、lab 产物。

## 门禁（全部）
`npm run typecheck`、`npm test`（`check-failures.sh` 输出 OK，且 `expected-identity.txt` 为空）、`npm run lint`、`npm run format:check`、`npm run docs:tools:check`、`npm run test:integration:rex`、`npm pack --dry-run`、`git diff --check`、大小规则（`find pi-extension/subagents -type f -size +32k` 为空），以及根目录不能有空目录。

## 交付
在 STATUS.md 写最终报告：每个门禁的结果、真实模型冒烟结果、遗留问题、建议的合并方式（把 `p4-kernel` 合并回 master 之前需要用户确认；**不要自行合并或推送**）。

## 提交
`P4.T6: rename to pi-rex-agents namespaces, docs and packaging`
