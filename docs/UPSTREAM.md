# 上游基线

本仓库是 MIT 许可的 Pi 子代理执行内核的 hard fork，不自动追踪或吸收上游修复。需要引入上游改动时，必须经过人工审查并手动 cherry-pick 或移植。

- 基线版本：3.7.2
- 基线 commit：`e1e7d72834bfaff70ba39a7ec2ffd437b44c2134`
- 许可证：MIT，Copyright (c) 2026 HazAT
- 原始版权与许可全文见 [LICENSE](../LICENSE)

## 源码改动边界

源码中的 `pi-rex-agents extension` 注释标记表示**相对上游 3.7.2 的改动点**，不是运行时协议或功能开关。T6 将当前树中 113 处旧的边界标记统一改名，保留其边界用途。后续人工 cherry-pick 时，用这些标记定位本地扩展，再与上述固定 commit 对照审查；标记本身不保证补丁可以直接应用。

本包不依赖上游 npm 包，也不迁移其配置。历史设计记录中出现的 `LegacyHost` 指 fork 前的执行宿主，仅用于保留当时的决策背景，不代表当前运行时。

## MIT 许可证原文

MIT License

Copyright (c) 2026 HazAT

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
