# T0 原样入库内核 + 上游 Harness 工具（行为不变）

## 目标
本仓库不再依赖 npm 包 `upstream-package`，内核源码进入本仓库，行为与 fork 前完全一致。这是之后所有任务的对照基线。

## 来源
`/path/to/upstream-package`，基线 commit `e1e7d72`（版本 3.7.2）。复制前先执行 `git -C <src> status` 确认工作区干净且 HEAD 为 `e1e7d72`；不一致就停下，记录到 STATUS.md。

## 步骤
1. **完整复制**上游在 `e1e7d72` 被 git 跟踪的所有文件（`git -C <src> ls-files`），保持相对路径；只排除 `.git/`、`node_modules/`。本仓库已有的同名文件处理方式：`package.json`、`tsconfig.json`、`README.md`、`.gitignore` 保留本仓库版本并按下面的步骤合并；上游 `LICENSE` 改名为 `LICENSE-upstream-package`；上游 `AGENTS.md` 原样复制（T1 重写）。
2. 原因（T0 第一次阻断的教训）：上游测试直接引用了 `scripts/tool-docs.ts`、`examples/role-pack/`、`docs/roles.md`、`plugins/sidebar/`、`.github/workflows/*.yml`、`CHANGELOG.md`、`RELEASING.md` 等文件，少复制任何一个都会让 typecheck 失败，或者让 `test/test.ts` 整个文件无法加载。**T0 不做任何删除**，删除统一在 T2/T6 中和对应测试一起进行。
3. 新增 `docs/UPSTREAM.md`：基线仓库、commit、版本、MIT 许可原文（复制上游 LICENSE 为 `LICENSE-upstream-package`），以及"本仓库是 hard fork，不追上游"的说明。
4. `package.json`：删除 `upstream-package` 依赖；按上游 package.json 补齐 peer/dev 依赖（`@earendil-works/pi-ai`、`@earendil-works/pi-tui`、`@sinclair/typebox`、`@biomejs/biome`、`oxlint`、`@oxlint/plugins`、`typescript@5.9.3`）；加入上游的 `test`、`test:integration`、`lint`、`format`、`format:check`、`docs:tools`、`docs:tools:check` 脚本（路径不变）。保留现有 `p0/p1/p2/doctor/check` 脚本。
5. `src/*.ts` 中所有 `upstream-package/...` import 改为相对路径（`../maestro/...`、`../pi-extension/...`），其余一行不改。
6. tsconfig：合并上游 tsconfig 的 include 与 strict 设置，让 `maestro/ pi-extension/ test/ scripts/ src/ .pi/skills/` 都被检查。
7. `npm install`。

## 门禁
- `npm run typecheck` 通过。
- `docs/p4/baseline/test-gate.sh` 输出 OK（它自己运行 `npm test`，检查测试总数 ≥ 1452；如有超出基线的失败最多重跑 2 次，只有 3 次都失败的才算回归）。
  - 基线来源：上游 `e1e7d72` 的干净 clone + `npm ci` 在本机实测 1452 tests / 18 fail（`docs/p4/baseline/inherited-failures.txt`，主要是 macOS `/private/var` 路径断言）；`flaky.txt` 是完整套件并行时偶发超时的测试；`expected-identity.txt` 是 package.json/README 换成本仓库身份后预期失败的测试。
  - 不要在上游 checkout 里 `npm install` 或跑测试来对照（会修改上游目录），基线已经固化。
  - 单次运行中超出基线的失败不算回归：该套件有大量 3s/8s 墙钟截止断言，负载下会随机超时（T0 第二次阻断的教训）。只有 test-gate.sh 最终报"失败"才是门禁失败。
- `npm run lint`、`npm run format:check` 通过（或记录继承问题）。
- `bun src/smoke-extension.ts` 通过（它应该加载到本地内核副本）。
- `grep -rn "from \"upstream-package" src` 为空。

## 不做
不删除任何 LegacyHost 代码，不改任何行为，不改文案。

## 提交
`P4.T0: vendor upstream-package 3.7.2 kernel and harness`
