// v1.8.0：提示词注入开关。
//
// 为什么独立成文件：core.js / index.js / rules.js 都要读它，而 hooks-deny.js 的
// 模块本身不 import core.js（避免循环依赖），这里沿用同一套「不 import core」约定，
// 由 core.js 在需要时回调本模块。
//
// 默认关闭：注入是可选能力。关闭时宿主完全不读 prompt-inject.md，注入段为空，
// 人设回到 deployment 默认；打开时才按既有链路挂载全文。这样用户可以在设置页
// 自己决定要不要注入，也避免一段带花括号的正文把整轮对话弄崩。
import fs from "node:fs";
import path from "node:path";

const SETTINGS_FILE = "inject-switch.json";

export function injectSwitchPath(dshHome) {
  return path.join(String(dshHome || ""), "dsh-purge", SETTINGS_FILE);
}

/** 坏文件 / 缺文件按 config 默认值、再按内置默认（关闭）处理，绝不因配置问题连带注入。 */
export function loadInjectSwitch(dshHome, configValue) {
  try {
    const fp = injectSwitchPath(dshHome);
    if (fs.existsSync(fp)) {
      const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (parsed && typeof parsed.injectEnabled === "boolean") {
        return { injectEnabled: parsed.injectEnabled };
      }
    }
  } catch {
    // 读不到就退回 config 默认值，不抛。
  }
  return { injectEnabled: configValue === true };
}

/** 本地原子写：tmp → fsync → rename，Win32 上 rename 可直接覆盖已存在文件。 */
function atomicWriteFileSync(fp, content, encoding = "utf8") {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, content, encoding);
    try { fs.fsyncSync(fd); } catch { /* FS 不支持 fsync 时忽略 */ }
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, fp);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

export function saveInjectSwitch(dshHome, patch, configValue) {
  const fp = injectSwitchPath(dshHome);
  const current = loadInjectSwitch(dshHome, configValue);
  const next = {
    injectEnabled: typeof patch?.injectEnabled === "boolean"
      ? patch.injectEnabled
      : current.injectEnabled,
  };
  atomicWriteFileSync(fp, `${JSON.stringify(next, null, 2)}\n`);
  return { ok: true, ...next, path: fp };
}
