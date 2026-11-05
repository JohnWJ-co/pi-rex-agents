# Rex 通信机制实测记录（2026-11-06）

环境：Rex `0.0.1793741575-g1b6654`（api_revision 10），Pi `v1.5.0`，测试模型 `CBAPI/cn:deepseek-v4.1-flash`。
所有结论都来自真实 Rex 会话中的实验；编号 F1–F10 供计划和任务卡引用。

## F1 Pi 原生上报 OSC 7501（根记录）

- Pi 交互模式内置 `ProgramStatusReporter`（`dist/modes/interactive/program-status-reporter.js`）。
- 状态序列：启动 `idle` → 一轮运行 `working` → 结束 `done`（失败 `error`，对话框 `blocked` + `kind`，中断 `idle`）。
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

- 持久化子代理的后续任务通过文件 inbox 传递：子代理扩展每 1000ms 轮询一次，再 `pi.sendUserMessage`（`maestro/adapters/pi/child/subagent-done.ts`）。中断走 `sendKeys Escape`。
- 推论：在 Rex 下可以直接使用；把轮询改成 `fs.watch` + 兜底轮询，可以消除 README 已知限制 4 里的 2 秒 settle 窗口。

## F10 开发环境

- 用户日常使用的 pi 通过 `~/.pi/agent/settings.json` 加载 `../../Documents/project/pi-rex-agents`（主 checkout 源码）。
- 推论：内核改造必须在独立的 worktree（`../pi-rex-agents-p4`，分支 `p4-kernel`）中进行，避免把半成品加载进正在使用的 pi 及其子代理。
