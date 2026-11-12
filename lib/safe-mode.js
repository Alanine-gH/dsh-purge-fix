// v1.1.9：进程内共享的「安全模式」标志。
//
// 主插件 lib/index.js 的 apply() 由 cordis.patch.yml 的 config.safeMode 设置；
// 演练台 lib/redteam/index.js 的 apply() 读取它，决定是否把
// .agent-presets/redteam/ 落到 $DSH_HOME。两者是同一进程里的不同 Cordis 插件，
// 但 import 的是同一个模块实例，所以标志一致。
//
// 默认 true：即使某个入口被单独启用、或主插件还没 apply，也不会先写宿主。
let safe = true;

/** @param {boolean} enabled 传 false 才关闭安全模式。 */
export function setSafeMode(enabled) {
  safe = enabled !== false;
}

export function isSafeMode() {
  return safe;
}
