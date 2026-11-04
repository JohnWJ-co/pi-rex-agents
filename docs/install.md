# 安装与冲突处理

## 前提

- 在 **Rex block 内**运行 Pi（`REX_SESSION`、`REX_BLOCK` 都存在）。
- Pi 1.5+，`pi-herdr-agents` 3.7.2。
- 本目录已执行 `npm install`，`node_modules/pi-herdr-agents` 存在。

## 方式一：临时加载（推荐先验收）

```bash
cd /Users/qiangwenjun/Documents/project/pi-rex-agents
pi --no-extensions -e "$PWD/src/extension.ts"
```

`--no-extensions` 会关闭自动发现，只加载显式 `-e` 的扩展。这是最稳妥的首次验证方式。

## 方式二：安装为 Pi 包

在仓库目录执行：

```bash
npm install
pi install ./ -l --approve   # 写入当前项目的 .pi/settings.json
# 或
pi install ./                # 写入个人 ~/.pi/agent/settings.json
```

之后 `pi list` 应能看到本包。包通过 `package.json` 的 `pi.extensions` 字段声明入口：

```json
{
  "pi": {
    "extensions": ["./src/extension.ts"]
  }
}
```

## 必须处理工具名冲突

`pi-rex-agents` 复用了上游工具名（`subagent`、`worktree_list` 等）。Pi 无法同时注册两个同名工具，因此 **不要同时加载 `pi-herdr-agents` 和 `pi-rex-agents`**。

二选一：

1. **Rex 场景**：用 `pi config` 禁用 `pi-herdr-agents`，保留 `pi-rex-agents`；或
2. **临时验收**：使用上面的 `--no-extensions -e ...`，绕过自动发现。

检查当前安装了哪些包：

```bash
pi list
```

如果两个包都出现在列表里，请用 `pi config` 关闭其中一个，或用：

```bash
pi remove pi-herdr-agents
```

（只在确定不再需要 Herdr 场景时执行。）

## 运行环境自检

```bash
npm run doctor
```

它会检查 Rex/Pi CLI、入口文件和 `pi list` 中是否同时存在两个包；同时存在时以非零码退出。

## 验证

进入 Rex 的交互式 Pi 后：

```text
/subagent list
/worktree list
```

应看到命令正常执行。`/subagent list` 为空是正常的：本仓库没有定义角色，裸 `subagent` 调用仍可使用。

## 运行测试

```bash
npm run check       # typecheck + host message check + P0
npm run p1          # 普通子代理
npm run p1:worktree # worktree 隔离
npm run p1:persistent
npm run p2          # cancel / interrupt / resume
```

`p1`、`p2` 必须在 Rex block 内运行；`p0` 也需要 Rex 环境。
