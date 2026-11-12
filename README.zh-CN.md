<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">⚔️ dsh-purge（中文文档）</h1>

<p align="center"><strong>v1.1.9 · 安全默认版</strong></p>

> **中文完整文档已合并到 [`README.md`](README.md)。** 本文件保留仅为兼容旧链接与插件自更新时复制的文件清单。
>
> ⚠️ **1.1.9 起默认 `safeMode: true`：安装 → 启用不会改动宿主任何文件**，修复旧版一启用就报
> `unknown prompt variable`（cwd 模板变量）/ `ctx.agents.roots is not a function`、会话建不了、dsh 本体被改坏的问题。
> 只提供只读 `/purge status`、`purge_status` 与状态端点。完整能力需显式设 `safeMode: false`（与 0.2.2+ 不兼容，风险自负）。
>
> 请直接看 **[README.md](README.md)** —— 内含：
>
> - [〇、安全模式](#安全模式-safe-mode)（本次修复重点）
> - 环境要求（dsh 0.2.x / Node ≥ 18）
> - 四种安装方式：npm 包名、仓库 tarball、本地目录、Release 压缩包
> - 安装验证清单、目录结构、运行时文件、配置项、CLI 与聊天命令
> - 更新 / 还原 / 卸载、FAQ、兼容性表、声明与署名
>
> 英文文档：[`README.en.md`](README.en.md)。原版 README（原作者版本，已归档）：[`docs/upstream/`](docs/upstream/)。

```powershell
# 最短路径：npm 包名安装（1.1.9 已重新发布）
dsh plugin --profile desktop add dsh-purge

# 或从仓库 tarball
dsh plugin --profile desktop add https://github.com/Alanine-gH/dsh-purge/archive/refs/heads/master.tar.gz
```
