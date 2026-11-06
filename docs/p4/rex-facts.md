# Rex 通信机制实测记录（2026-11-06）

环境：Rex `0.0.1793741575-g1b6654`（api_revision 10），Pi `v1.5.0`，测试模型 `CBAPI/cn:deepseek-v4.1-flash`。
所有结论都来自真实 Rex 会话中的实验；编号 F1–F13 供计划和任务卡引用。

## F1 Pi 原生上报 OSC 7501（根记录）

- Pi 交互模式内置 `ProgramStatusReporter`（`dist/modes/interactive/program-status-reporter.js`）。
- 状态序列：启动 `idle` → 一轮运行 `working` → 结束 `done`（失败 `error`，对话框 `blocked` + `kind`，中断 `idle`）。
- Harness 分开等待：`waitForPiReady` 只用于启动的 `idle`；一轮的 session 完成证据出现后，`waitForPiTurnSettled` 接受 `done` 或 `idle`，不接受 `working`、`blocked` 或 `error`。不能在每轮结束后继续等待 `idle`。
- 根记录 `msg` = **会话名**（`--name`），从不包含 prompt 或模型输出。实测 `--name sub-c` → `{"state":"done","app":"pi","msg":"sub-c"}`。
- 推论：子代理用 `--name <子代理名或 id>` 启动，父进程就能从根记录同时拿到状态和身份；**扩展不得写根记录**（会与 Pi 自己的 reporter 互相覆盖）。

## F2 OSC 记录的生命周期与限制

- 可以用 `id=` 建子记录，和根记录并存。实测根记录 `app=pi` 与 `id=subagent app=pira` 同时存在。
- `msg` 解码后上限 2048 字节：2048 保留，2049 整条丢弃；中文正常。
- 进程退出：`working` 记录被移除（事件 `program_status_removed reason=child_exited`），`done`/`error` 保留，`program_status` 返回的 `msg` 已经解码。
- block 关闭后记录随之消失（没有 `--keep-open` 时，程序退出会直接关闭 block）。
- 推论：OSC 只能作为可观测信号，不能当完成提交点，也不能承载结果正文。

## F3 进程退出码

- 程序直接作为 block 程序运行（`rex split -- cmd`）时，退出会发 `child_exited {"exit_code":N}` 事件。
- 带 `--keep-open` 时，`block call process` 的 `last_exit.exit_code` 可以查询（实测得到 7）；不带时 block 立即关闭。
- 现有 provider 的做法是先建 shell block，再 `rex send` 打字 `bash script`：pi 退出后 shell 仍在，**拿不到 `child_exited`**。
- 推论：不改变启动方式时，用脚本把 `$?` 写入 `<sessionFile>.exitcode` 来替代屏幕哨兵；"以程序身份启动 block"作为后续优化。

## F4 输入通道

- `rex send TEXT` 走 bracketed paste：多行文本留在输入框里，不会提前提交；随后 `send-key enter` 提交。
- Pi 忙碌时追加的消息会排队，当前一轮结束后执行。实测 `working` 期间发送的 `QUEUED-2` 被正确执行。
- `block.event` 也支持 `{"type":"paste","payload":{"text":...}}`。

## F5 屏幕捕获

- Pi 默认全屏（alternate screen）：要求输出 80 行，`rex capture` 只拿到 L30–L80 共 51 行；session JSONL 里是完整的 80 行。
- `--tui-mode regular` 在主屏幕运行，`capture` 拿到完整 80 行（scrollback 可用）。
- 推论：结果绝不能来自屏幕；`readScreen` 只用于诊断展示。

## F6 唤醒时延

- 同一个 Node 进程同时用 `fs.watch` 监听 result 文件、订阅 `rex events -s`：`subagent done` 事件比 `fs.watch rename` 早约 8ms，两者都在毫秒级。
- 推论：保留 `fs.watch` 作为唤醒路径；`rex events` 可选用来替代 supervision 的轮询（存活检查、状态），但不作为投递路径。

## F7 扩展写 /dev/tty

- 在 Pi TUI 进程内的扩展中 `openSync("/dev/tty")` 写 OSC，不会弄花屏幕；`agent_end` 的 `event.messages` 中最后一条 assistant 的 `content[type=text]` 就是最终文本，`ctx.sessionManager.getSessionFile()` 可用。tmp+rename 原子写 result.json 成功。

## F8 隔离 Rex lab

- `rex server run --listen unix://<dir>/s --state-dir <dir>/state --restore=false` 可以在没有任何客户端连接时独立运行；`rex -S unix://<dir>/s --autostart=false ...` 能在其中建 session、开 block。
- Unix socket 路径不能超过 104 字节：必须用 `mkdtemp(os.tmpdir())` 一类的短路径。
- **坑**：lab 中 block 的 `REX_SERVER` 继承自启动 lab 服务器的进程环境，实测指向主服务器。lab 必须用 `REX_SERVER=unix://<dir>/s` 启动服务器；RexCli 必须把 `REX_SERVER` 作为 `-S` 显式传入（且 `--autostart=false`）。harness 的第一项自检就是在 lab block 里执行 `rex whoami` 确认连的是 lab。

## F9 内核的父→子通道与宿主无关

- T5 之前，持久化子代理的后续任务通过文件 inbox 传递，子代理扩展每 1000ms 轮询一次，再 `pi.sendUserMessage`（`maestro/adapters/pi/child/subagent-done.ts`）；中断走 `sendKeys Escape`。
- T5 改为监听 inbox 所在目录的 `fs.watch`，保留 5 秒兜底轮询。真实集成在父端观察到 idle 后立即发送第二轮，不再增加 2 秒 settle 等待；根记录依次回到 working/done，两个 task 的 result 文件分别与投递内容一致。
- macOS watcher 启动可能有事件延迟。单测先在同目录写入匹配前缀的探针，要求 2 秒内收到回调，再写真正的 inbox，并仍要求 2 秒内唤醒；握手超时明确报告“watcher 未就绪”。消息断言放在回调外，避免被 drain 的错误处理吞掉。

## F10 开发环境

- 用户日常使用的 pi 通过 `~/.pi/agent/settings.json` 加载 `../../Documents/project/pi-rex-agents`（主 checkout 源码）。
- 推论：内核改造必须在独立的 worktree（`../pi-rex-agents-p4`，分支 `p4-kernel`）中进行，避免把半成品加载进正在使用的 pi 及其子代理。

## F11 `--tools` 白名单会过滤扩展工具的注册（2026-11-06 T2b 实测）

- 探针扩展在 `session_start` 中记录：`pi --tools read,bash` 时 `getAllTools()` 只返回 `read,bash`，billion-context 的 `compress`/`acp_status` 等不可见；`setActiveTools([...,"acp_status"])` 之后 active 仍是 `read,bash`。
- 不传 `--tools`：`getAllTools()` 42 个（含 compress、acp_status），active 31 个。
- `--tools read,bash,compress,decompress,search_context,acp_status`：这些工具都注册并激活，模型实际调用 `acp_status` 成功（输出 `ACTIVE SURFACE: pack=lean … host=billion-context-pi 0.1.83`）。
- 推论：子代理一侧没办法补回白名单外的工具，压缩工具必须由父进程写进 `--tools`。扩展代码改动后，父 pi 必须 `/reload` 才会生效（子代理通过 `-e` 每次重新加载）。

## F12 项目信任前的扩展加载与内核命名隔离（2026-11-06 T4）

- 监督的探针确认：Pi 在判定项目信任前，先按全局配置加载扩展，再按项目配置重新加载。项目过滤项只影响最终的扩展集合，不能阻止全局主 checkout 在同一进程内先执行一次；绝对 source 路径本身正确，Pi 按解析后的绝对路径去重。
- 上游内核使用 `globalThis[Symbol.for("pi-subagents/runtime")]`。Rex 若共用该槽，可能接管外来的 composition；只有 owner symbol 改名时，则会报 `Previous PiRunSession does not carry its owning composition.`。修正应隔离内核全局槽，保留 owner 校验，无需修改项目或全局配置。
- Rex runtime 使用 `pi-rex-agents/runtime`，widget/status timer 使用 `pi-rex-agents/widget-interval` / `pi-rex-agents/status-interval`。内核中不再使用 `pi-subagents/` Symbol；正常测试访问统一导入 `SUBAGENT_RUNTIME_KEY`，仅隔离回归保留旧键以模拟外来内核。
- 本轮默认配置 RPC `get_commands` 验证：无 `Failed to load extension`；`subagent`、`subagents-init`、`worktree` 各出现一次，`sourceInfo.path` 均为 P4 的 `pi-extension/subagents/index.ts`。单测同时确认旧槽中的外来 runtime、子登记表和计时器未被修改或接管。

## F13 结果文件、退出码与清理顺序（2026-11-06 T5）

- 子代理在 settle 时原子发布版本为 `v:1` 的结果文件：普通任务为 `<sessionFile>.result.json`，持久化任务为 `<sessionFile>.result.<taskId>.json`。正文取最后一条非空 assistant 文本；父端校验 subagentId、taskId 和 generation，文件缺失、解析失败或身份不符时回退到 session JSONL。真实集成同时验证结果与投递一致，以及删除结果文件后的 JSONL 回退。
- Pi 启动参数带 `--name <显示名>`，根 OSC 仍由 Pi 自己维护。扩展只写 `id=pira` 子记录，携带 task/generation/result 文件名；消息按 UTF-8 限制为 2048 字节。Rex provider 以根记录映射 working/blocked/done/error/idle，忽略补充子记录对根状态的影响。
- 持久化任务可以在显式 `subagent_done` 后排队进入同一低层 agent run；follow-up 有新的 `turn_start`，未必有新的 `agent_start`。任务身份在 turn_start 更新，既阻止旧 turn 完成新任务，也允许同一 run 的后续任务正常发布结果。新增回归先复现了第二轮缺少完成事件，再验证两种事件顺序均通过。
- 包装 shell 在 Pi 退出后用临时文件加 rename 发布 `<sessionFile>.exitcode`。任务生命周期在投递和清理 block 前等待进程退出证据；确认 Pi 已退出后，仍在既有 500ms 宽限内优先等待包装 shell 发布 `.exitcode`，宽限结束才回退到已有的语义 sidecar，避免关闭 block 抢在 shell 写入前。普通与持久化停止均覆盖这一顺序。屏幕内容不再参与完成判定，`readScreen` 仅用于诊断。
- 强杀集成从 Rex root owner 的后代中定位并杀死真正的 Pi，保留包装 shell；已验证没有 `.exit` 时仍写出 `.exitcode=137`，父端投递 error 并关闭子 block。强杀包装 shell 后只剩 idle zsh 的额外探测优化不属于本轮验证，也没有改变 SupervisionCoordinator 的批量 presence 缓存语义。
