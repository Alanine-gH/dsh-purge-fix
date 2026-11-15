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

// 安全模式下演练台（/redteam/api）允许的「只读查询」op 白名单。
//
// 背景：安全模式的设计目标是「启用插件但不碰宿主」。演练台的后端
// （store + ui）本身只读写插件私有数据目录 $DSH_HOME/redteam/，不修改
// dsh 本体；真正会碰宿主的只有 .agent-presets 预设部署（redteam/index.js，
// 安全模式仍然不装）。所以安全模式下可以让演练台照常浏览，但要挡住一切
// 会「改数据 / 探测网络 / 触发攻击 / 更新插件」的写类 op。
//
// 采用白名单而非黑名单：未知 op 一律按只读拒绝，避免漏掉新的写 op。
export const SAFE_READONLY_OPS = Object.freeze(new Set([
  // 初始化 / 靶标切换（只切换「当前指针」，不建库、不攻击）
  'bootstrap', 'openEngagement', 'activateEngagement',
  // 快照与资产测绘
  'snapshot', 'assets', 'asset', 'graph', 'attackGraph', 'stats',
  // 漏洞 / 凭据 / 访问 / 会话 / webshell / 隧道 / 截图
  'vulns', 'vulnStats', 'credentials', 'access', 'sessions',
  'webshells', 'tunnels', 'shots', 'shotData',
  // Web / 域名 / 证据 / 攻击链 / 报告
  'domains', 'web', 'httpEvidence', 'chain', 'report',
  // 得分 / 目标 / 阶段 / 时间线
  'scores', 'scoreChain', 'scoreReport', 'activeTests', 'testStats',
  'consoleDigest', 'stages', 'reportTargets', 'discoveryTimeline',
  // 攻击文件与提示词（只读浏览）
  'attackFiles', 'readAttackFile', 'prompts',
  // 知识库 / POC / 模板（只读检索）
  'pocSearch', 'pocList', 'pocGet', 'pocStats', 'templateSearch', 'templateStats',
  // 技能库（只读）
  'skillCatalog', 'skillRead',
  // 环境适配 / 平台摘要（只读查询）
  'platformConfigGet', 'platformEnvAdaptStatus',
  // 智能体并发状态（只读）
  'agentsStatus',
  // 版本 / 更新检查（只读，不 apply）
  'version', 'updateCheck',
]));

/** 安全模式下该 op 是否属于「只读查询」，允许放行。 */
export function isSafeReadOnlyOp(op) {
  return typeof op === 'string' && SAFE_READONLY_OPS.has(op.trim());
}
