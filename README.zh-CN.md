<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">⚔️ dsh-purge-fix（中文文档）</h1>

<p align="center"><strong>v1.1.9 · 安全默认版 · npm 包名 <code>dsh-purge-fix</code></strong></p>

> 📦 **仓库与 npm 包名现为 `dsh-purge-fix`**（`Alanine-gH/dsh-purge-fix`）。
> 状态目录、HTTP 路由等内部标识保持不变。

> **中文完整文档已合并到 [`README.md`](README.md)。** 本文件保留仅为兼容旧链接与插件自更新时复制的文件清单。
>
> ⚠️ **1.1.9 起默认 `safeMode: true`：安装 → 启用不会改动宿主任何文件**，修复旧版一启用就报
> `unknown prompt variable`（cwd 模板变量）/ `ctx.agents.roots is not a function`、会话建不了、dsh 本体被改坏的问题。
> 只提供只读 `/purge status`、`purge_status` 与状态端点。完整能力需显式设 `safeMode: false`（与 0.2.2+ 不兼容，风险自负）。
>
> 👉 **第一次装 / 从旧版升级，直接看 [README.md 的「十三、最新版怎么用（v1.1.9）」](README.md#十三最新版怎么用v119)**：
> 清残留 → 仓库 tarball 安装 → 重启 → 验证宿主没被改 → 日常只读命令。
> 改动明细在 [附录](README.md#附录本次修改说明v119)。
>
> 其余内容见 **[README.md](README.md)**：环境要求、四种安装方式、安装验证清单、目录结构、
> 配置项、CLI 与聊天命令、更新 / 还原 / 卸载、FAQ、兼容性表、声明与署名。
>
> 英文文档：[`README.en.md`](README.en.md)。原版 README（原作者版本，已归档）：[`docs/upstream/`](docs/upstream/)。

```powershell
# 当前推荐：仓库 tarball（npm 上的 1.1.9 被自动审核 Blocked，暂不可用）
dsh plugin --profile desktop add https://github.com/Alanine-gH/dsh-purge-fix/archive/refs/heads/master.tar.gz

# Web 宿主把 desktop 换成 web；装完完全退出并重启宿主
```

> npm 审核通过后才会支持 `dsh plugin add dsh-purge-fix`；在那之前不要用包名安装。
