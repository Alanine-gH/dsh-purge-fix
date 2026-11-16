/**
 * dsh-purge 1.1.9 回归自检：证明「安装 → 启用」不会改动宿主。
 *
 * 用法：node scripts/verify-safe-mode.mjs
 * 退出码 0 = 全部通过；非 0 = 有回归，CI 会拦下发布。
 *
 * 覆盖两类证据：
 *   1) 静态：cordis.patch.yml 不再覆盖 system-prompt、不再写 {{cwd}}、
 *      默认 safeMode:true、演练台行默认 disabled；package.json 版本/仓库地址。
 *   2) 动态：用 mock Cordis ctx 调用 apply()，断言安全模式下
 *      - 不抛异常（Cordis 装配流程不会被打断）
 *      - 不注册 system-prompt/assemble 等全局钩子
 *      - 不写任何宿主文件（DSH_HOME 指向临时目录，逐项比对快照）
 *      - /purge status 与 purge_status 是只读且返回安全模式说明
 *      - 演练台 apply 在安全模式下不落预设 / 不建库 / 不注册工具
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
let failed = 0

function check(name, fn) {
  try {
    const detail = fn()
    results.push({ name, ok: true, detail: detail || '' })
  } catch (e) {
    failed += 1
    results.push({ name, ok: false, detail: String(e && e.message ? e.message : e) })
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}
/** 去掉整行注释，只保留可执行 YAML 行，避免把注释里的历史说明当成实际配置。 */
function codeLines(yaml) {
  return yaml.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n')
}

// ── 静态 ─────────────────────────────────────────────────────────────────────
const patch = read('cordis.patch.yml')
const patchCode = codeLines(patch)

check('patch: 不覆盖宿主 system-prompt', () => {
  assert(!/^\s*- id:\s*system-prompt\s*$/m.test(patchCode),
    'cordis.patch.yml 仍在用 - id: system-prompt 覆盖宿主配置')
  return 'no system-prompt override'
})

check('patch: 无可执行 {{cwd}} / personaSuffix 模板变量', () => {
  assert(!patchCode.includes('{{cwd}}'), '可执行 YAML 里仍含 {{cwd}}')
  assert(!/personaSuffix\s*:/.test(patchCode), '仍在设置 personaSuffix')
  return 'no template variable injection'
})

check('patch: 默认 safeMode:true / injectEnabled:false / autoApplyOnStart:false', () => {
  assert(/safeMode:\s*true/.test(patchCode), '缺少 safeMode: true')
  assert(/injectEnabled:\s*false/.test(patchCode), '缺少 injectEnabled: false')
  assert(/autoApplyOnStart:\s*false/.test(patchCode), '缺少 autoApplyOnStart: false')
  return 'safe defaults present'
})

check('patch: 演练台自举行 disabled、store/ui 启用（安全模式只读可浏览）', () => {
  const row = (id) => {
    const re = new RegExp(`- id:\\s*${id}\\b[\\s\\S]*?(?=\\n\\s*- id:|\\n\\s*$)`)
    const block = patchCode.match(re)
    assert(block, `找不到 ${id}`)
    return block[0]
  }
  // 会碰宿主的自举行（落 .agent-presets）必须默认 disabled。
  assert(/disabled:\s*true/.test(row('dsh-purge-redteam')),
    'dsh-purge-redteam 应默认 disabled（它会落 .agent-presets 宿主文件）')
  // store / ui 只读写插件私有目录 + 只读端点，默认启用，演练台可只读浏览。
  assert(!/disabled:\s*true/.test(row('dsh-purge-redteam-store')),
    'dsh-purge-redteam-store 不应 disabled（安全模式下仍需 provide 只读 store）')
  assert(!/disabled:\s*true/.test(row('dsh-purge-redteam-ui')),
    'dsh-purge-redteam-ui 不应 disabled（安全模式下仍注册只读 /redteam/api）')
  return 'redteam row disabled; store/ui enabled'
})

check('patch: 无重复 id', () => {
  const ids = [...patchCode.matchAll(/^\s*- id:\s*([^\s]+)/gm)].map((m) => m[1])
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  assert(dup.length === 0, `重复 id: ${[...new Set(dup)].join(', ')}`)
  return `${ids.length} unique ids`
})

check('package.json: 包名 dsh-purge-fix / 版本 1.1.9 / 仓库指向 Alanine-gH', () => {
  const pkg = JSON.parse(read('package.json'))
  assert(pkg.name === 'dsh-purge-fix', `name=${pkg.name}`)
  assert(pkg.version === '1.1.9', `version=${pkg.version}`)
  assert(!read('package.json').includes('ZXEB/dsh-purge'), '仍指向已失效的 ZXEB 仓库')
  assert(String(pkg.repository?.url).includes('Alanine-gH/dsh-purge-fix'), 'repository 不对')
  assert(String(pkg.dsh?.install?.tarball).includes('Alanine-gH/dsh-purge-fix'), 'tarball 不对')
  return `${pkg.name}@${pkg.version}`
})

check('所有包解析点统一使用 dsh-purge-fix（Cordis / 客户端 / 预设）', () => {
  const names = [...patchCode.matchAll(/^\s*name:\s*'?([^'\s]+)'?\s*$/gm)].map((m) => m[1])
  const own = names.filter((n) => n.startsWith('dsh-purge'))
  assert(own.length === 4, `patch 里的自有插件行应为 4 条，实际 ${own.length}: ${own.join(', ')}`)
  assert(own.every((n) => n === 'dsh-purge-fix' || n.startsWith('dsh-purge-fix/')),
    `patch 仍引用旧包名: ${own.join(', ')}`)
  const client = read('client.js')
  assert(client.includes('id: "dsh-purge-fix"'), '客户端工厂 id 未同步改名')
  assert(/const name = "dsh-purge-fix"/.test(client), '客户端导出的插件名未同步改名')
  assert(client.includes('exports.name = name'), '客户端未导出插件名')
  assert(read('presets/redteam/agent.cordis.yml').includes('name: dsh-purge-fix/redteam/tools'),
    '演练台预设仍引用旧包名')
  return own.join(', ')
})

check('release-notes.md 首行 = # 1.1.9（CI 发布前置条件）', () => {
  const first = read('release-notes.md').split(/\r?\n/)[0].trim()
  assert(first === '# 1.1.9', `首行是 ${first}`)
  return first
})

check('源码: 无残留的 {{cwd}} 模板变量写入', () => {
  const files = ['lib/core.js', 'lib/identity.js', 'lib/index.js', 'cordis.patch.yml']
  for (const f of files) {
    const body = read(f)
    // 历史「针脚」是识别/清理宿主旧文本用的比较目标，不是写回组装结果的模板。
    // 判定：含 {{cwd}} 的字符串若出现在 === / includes / startsWith / test 比较里，
    // 或位于 LEGACY_CWD_TEXTS / 注释中，则允许；其余一律视为会写进 prompt 的模板。
    for (const m of body.matchAll(/["'`]([^"'`\n]*\{\{cwd\}\}[^"'`\n]*)["'`]/g)) {
      const line = body.slice(body.lastIndexOf('\n', m.index) + 1, body.indexOf('\n', m.index) + 1 || body.length)
      const isComment = /^\s*(#|\/\/|\*)/.test(line)
      const isNeedle = /(===|!==|includes\(|startsWith\(|endsWith\(|\.test\(|indexOf\()/.test(line)
        || /LEGACY_CWD_TEXTS|CWD_ONLY_SUFFIX/.test(body.slice(Math.max(0, m.index - 300), m.index))
      assert(isComment || isNeedle, `${f} 把 {{cwd}} 用作输出模板: ${line.trim().slice(0, 120)}`)
    }
  }
  return 'no emitted {{cwd}} templates'
})

// 演练台 405 回归：客户端是独立加载的浏览器模块，插件禁用/安全模式下仍会
// POST /redteam/api。客户端必须优雅降级，host 安全模式必须给只读应答。
check('演练台: 源码与产物客户端都含 404/405 离线降级', () => {
  for (const f of ['lib/redteam/client.js', 'client.js']) {
    const body = read(f)
    assert(/res\.status === 404 \|\| res\.status === 405/.test(body),
      `${f} 未拦截 404/405，界面仍会显示 "405 Method Not Allowed"`)
    assert(body.includes('drillUnavailable') && body.includes('drillOfflineUi'),
      `${f} 缺少离线标记或说明卡片`)
    assert(body.includes('markDrillOffline'), `${f} 缺少离线通知`)
  }
  return 'source + product both degrade'
})

check('演练台: 源码与产物 api() 实现一致（防止 build 回退）', () => {
  const pick = (f) => {
    const body = read(f)
    const a = body.indexOf('const DRILL_OFFLINE_MSG')
    const b = body.indexOf('let ui = {', a)
    assert(a > 0 && b > a, `${f} 找不到 api() 边界`)
    return body.slice(a, b).replace(/\r\n/g, '\n')
  }
  assert(pick('lib/redteam/client.js') === pick('client.js'),
    '源码与产物 api() 不一致；重新 build-client.mjs 会回退修复')
  return 'source/product in sync'
})

check('演练台: 安全模式在 ui.js 注册 /redteam/api 并带只读白名单闸', () => {
  const body = read('lib/redteam/ui.js')
  assert(body.includes("path: '/redteam/api'") || body.includes('path: "/redteam/api"'),
    'ui.js 未注册 /redteam/api')
  assert(body.includes('isSafeReadOnlyOp'), 'ui.js 缺少只读白名单校验')
  assert(body.includes('readOnly: true'), '响应缺少只读标记')
  // 只读闸必须在 op 分派之前拦截（出现在 handlePlatformOp/dispatchAsync 之前）
  const gateAt = body.indexOf('isSafeReadOnlyOp(request.op)')
  const dispatchAt = body.indexOf('dispatchAsync(store, request)')
  assert(gateAt > 0 && dispatchAt > 0 && gateAt < dispatchAt,
    '只读闸未在 op 分派之前生效')
  // 白名单本身在 safe-mode.js
  const mode = read('lib/safe-mode.js')
  assert(mode.includes('SAFE_READONLY_OPS') && mode.includes('isSafeReadOnlyOp'),
    'safe-mode.js 缺少只读 op 白名单')
  assert(!/'(probeSessions|updateApply|savePrompt|platformConfigSave)'/.test(mode),
    '白名单混入了写/探测 op')
  return 'read-only bridge + whitelist present'
})

check('演练台: 安全模式提供只读 drill-grant（不再卡「未授权」）', () => {
  const body = read('lib/index.js')
  assert(body.includes('"/dsh-purge/drill-grant"'), 'index.js 未注册只读 drill-grant 端点')
  const at = body.indexOf('"/dsh-purge/drill-grant"')
  const block = body.slice(at, at + 900)
  assert(block.includes('granted: true') && block.includes('readOnly: true'),
    'drill-grant 端点未返回只读授权')
  assert(!/writeDrillGrant|writeFile|mkdir/.test(block),
    'drill-grant 端点不应写盘（安全模式为纯内存只读授权）')
  return 'read-only drill-grant (granted, no disk write)'
})

check('安全模式状态: 只读探测 DSH_HOME / 官方客户端（不再显示「还没定位」）', () => {
  const body = read('lib/index.js')
  assert(body.includes('safeHostInfo'), 'index.js 缺少 safeHostInfo 只读探测')
  assert(body.includes('findDesktopAppExecutable({ discover: true })'),
    '未做官方客户端只读探测')
  assert(body.includes('asar_still_sealed'), '状态缺少 asar_still_sealed 字段')
  assert(body.includes('dsh_home: safeHostInfo.dshHome'), '状态未回填 dsh_home')
  // 只读探测绝不能解包 asar / 写文件
  const at = body.indexOf('const safeHostInfo')
  const block = body.slice(at, at + 1400)
  assert(!/extractAsar|openSealedDesktopHost|writeFile|mkdirSync/.test(block),
    'safeHostInfo 里出现了写操作/解包操作')
  return 'read-only host detection present'
})

check('客户端: 安全模式有只读提示条，应用/还原/卸载点击被拦截', () => {
  const code = read('client.js')
  assert(code.includes('"safe.banner"') && code.includes('"err.safeBlocked"'), '缺少安全模式文案')
  assert(code.includes('safeMode ? h("div"'), '缺少安全模式提示条渲染')
  assert(/if \(state && state\.safeMode\)/.test(code), 'doAction/doUninstall 缺少安全模式拦截')
  assert(code.includes('safeMode ? t("metric.safe.count")'), '待解开指标未切换为安全模式')
  assert(code.includes('disabled: busy || safeMode'), 'Hooks/注入开关未在安全模式禁用')
  return 'banner + click guards + disabled switches'
})

// ── 动态：mock Cordis ctx，真实调用 apply() ──────────────────────────────────
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-purge-verify-'))
const prevHome = process.env.DSH_HOME
process.env.DSH_HOME = tmpHome

// 真正的动态验证放在独立子进程里（需要 ESM 动态 import 与干净的模块状态）
const SCRIPT = `
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const ROOT = ${JSON.stringify(ROOT)}
const tmpHome = ${JSON.stringify(tmpHome)}
const snap = (dir) => {
  const out = []
  const walk = (d, rel='') => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      out.push(path.join(rel, e.name))
      if (e.isDirectory()) walk(path.join(d, e.name), path.join(rel, e.name))
    }
  }
  walk(dir); return out.sort()
}
const before = snap(tmpHome)
const mod = await import(pathToFileURL(path.join(ROOT, 'lib/index.js')).href)
const reg = { commands: [], tools: [], events: [], effects: 0, injects: [], routes: [] }
const webServer = { register(spec) { reg.routes.push(spec); return () => {} } }
const logger = { info(){}, warn(){}, error(){} }
const services = {}
const ctx = {
  get(name) {
    if (name === 'commands') return { register: (s) => reg.commands.push(s) }
    if (name === 'tools') return { register: (s) => reg.tools.push(s) }
    if (name === 'webServer') return webServer
    return services[name]
  },
  provide(name, value) { services[name] = value; Object.defineProperty(ctx, name, { value, configurable: true, enumerable: false }) },
  on(event, handler, opts) { reg.events.push({ event, opts }); return () => {} },
  effect(fn) { reg.effects += 1; try { fn() } catch {} return () => {} },
  inject(names, cb) { reg.injects.push(names); try { cb({ webServer, effect: ctx.effect, get: ctx.get }) } catch (e) { reg.injectError = String(e) } return () => {} },
  logger,
  systemPrompt: { section: () => () => {} },
  tools: { register: (s) => reg.tools.push(s) },
  webServer,
}
let applyError = null
try { mod.apply(ctx, {}) } catch (e) { applyError = String(e && e.stack || e) }
const after = snap(tmpHome)

// 演练台四个入口在安全模式下必须全部空转且不抛错
const redteam = {}
for (const f of ['index','store','ui','tools']) {
  const m = await import(pathToFileURL(path.join(ROOT, 'lib/redteam/'+f+'.js')).href)
  let err = null
  try { m.apply(ctx, {}) } catch (e) { err = String(e && e.message || e) }
  redteam[f] = err
}

// 演练台只读端点：真实调用 handler（ui.js 注册），验证只读白名单行为
const drillRoute = reg.routes.find((r) => r.path === '/redteam/api')
const callDrill = async (op) => {
  if (!drillRoute) return null
  const captured = {}
  const res = { writeHead(code, headers) { captured.code = code; captured.headers = headers }, end(body) { captured.body = body } }
  const payload = JSON.stringify(op === undefined ? {} : { op })
  const req = { method: 'POST', url: '/redteam/api', headers: {}, socket: { remoteAddress: '127.0.0.1' }, on(ev, cb) { if (ev === 'data') cb(Buffer.from(payload)); if (ev === 'end') cb() } }
  try {
    await drillRoute.handler(req, res)
    return { code: captured.code, body: captured.body ? JSON.parse(captured.body) : null }
  } catch (e) { return { error: String(e && e.message || e) } }
}
const drillResponse = await callDrill('__nonexistent_write_op__')
const drillRead = await callDrill('report')

// 清洗页写操作：安全模式下必须明确返回 ok:false（旧实现回 ok:true，
// 前端「应用」只显示「已完成」但什么都没发生）。
const purgeRoute = reg.routes.find((r) => r.kind === 'prefix' && r.path === '/dsh-purge')
const callPurge = async (method, url) => {
  if (!purgeRoute) return null
  const captured = {}
  const res = { writeHead(code, headers) { captured.code = code; captured.headers = headers }, end(body) { captured.body = body } }
  const req = { method, url, headers: {}, socket: { remoteAddress: '127.0.0.1' }, on() {} }
  try {
    await purgeRoute.handler(req, res)
    return { code: captured.code, body: captured.body ? JSON.parse(captured.body) : null }
  } catch (e) { return { error: String(e && e.message || e) } }
}
const applyPost = await callPurge('POST', '/dsh-purge/apply')
const statusGet = await callPurge('GET', '/dsh-purge/status')

const after2 = snap(tmpHome)

const status = reg.commands.find(c => c.name === 'purge')
const tool = reg.tools.find(t => t.name === 'purge_status')
const statusText = status ? await status.handler({ rawInput: '' }) : null
const toolText = tool ? await tool.execute() : null

console.log(JSON.stringify({
  applyError,
  events: reg.events.map(e => e.event),
  effects: reg.effects,
  injects: reg.injects,
  routes: reg.routes.map(r => r.path),
  commands: reg.commands.map(c => c.name),
  tools: reg.tools.map(t => t.name),
  filesBefore: before, filesAfter: after2,
  statusHasSafeMode: !!statusText && /safeMode=ON/.test(statusText.text || ''),
  toolHasSafeMode: !!toolText && /safeMode=ON/.test(toolText.text || ''),
  redteam,
  drillResponse,
  drillRead,
  applyPost,
  statusGet,
  injectError: reg.injectError || null,
}))
`

const tmpScript = path.join(tmpHome, 'probe.mjs')
fs.writeFileSync(tmpScript, SCRIPT, 'utf8')
const run = spawnSync(process.execPath, [tmpScript], {
  encoding: 'utf8', env: { ...process.env, DSH_HOME: tmpHome }, timeout: 30000,
})

check('动态探针: 子进程正常退出', () => {
  assert(run.status === 0, `exit=${run.status} stderr=${String(run.stderr).slice(0, 600)}`)
  return 'exit 0'
})

let probe = null
check('动态探针: 输出可解析', () => {
  const line = String(run.stdout).split(/\r?\n/).filter((l) => l.startsWith('{')).pop()
  assert(line, `无 JSON 输出: ${String(run.stdout).slice(0, 400)} / ${String(run.stderr).slice(0, 400)}`)
  probe = JSON.parse(line)
  return 'json ok'
})

check('apply(): 不抛异常（不会打断宿主装配）', () => {
  assert(probe.applyError === null, `apply 抛错: ${probe.applyError}`)
  return 'no throw'
})

check('apply(): 未注册 system-prompt/assemble 等全局钩子', () => {
  const forbidden = ['system-prompt/assemble', 'agent/pre-step', 'session/created', 'agent-preset/selected']
  const hit = probe.events.filter((e) => forbidden.includes(e))
  assert(hit.length === 0, `注册了侵入式钩子: ${hit.join(', ')}`)
  return `events=[${probe.events.join(',')}]`
})

check('apply(): 不写宿主配置（prompt-inject.md / .agent-presets / 备份）', () => {
  const added = probe.filesAfter.filter((f) => !probe.filesBefore.includes(f))
  // 安全模式允许插件把只读演练台的 SQLite 写到自己的数据目录 $DSH_HOME/redteam/，
  // 但绝不允许碰宿主配置：prompt-inject.md、.agent-presets、备份、settings 等。
  const hostLeaks = added.filter((f) => {
    const p = String(f).replace(/\\/g, '/')
    if (p === 'redteam' || p.startsWith('redteam/')) return false // 插件私有数据目录，允许
    return true
  })
  assert(hostLeaks.length === 0, `写了宿主文件: ${hostLeaks.join(', ')}`)
  return `${added.length} files (plugin-private only)`
})

check('apply(): 只暴露只读命令 / 工具 / 状态路由', () => {
  assert(probe.commands.includes('purge'), `commands=${probe.commands}`)
  assert(probe.tools.includes('purge_status'), `tools=${probe.tools}`)
  assert(!probe.tools.some((t) => ['purge_apply', 'purge_revert'].includes(t)), '仍暴露写工具')
  assert(probe.routes.some((r) => String(r).startsWith('/dsh-purge')), `routes=${probe.routes}`)
  return `commands=${probe.commands.join(',')} tools=${probe.tools.join(',')}`
})

check('status 文本明确标注安全模式只读', () => {
  assert(probe.statusHasSafeMode && probe.toolHasSafeMode,
    `statusHasSafeMode=${probe.statusHasSafeMode} toolHasSafeMode=${probe.toolHasSafeMode}`)
  return 'safe mode announced'
})

check('演练台 4 个入口在安全模式下全部空转且不抛错', () => {
  const errs = Object.entries(probe.redteam).filter(([, v]) => v !== null)
  assert(errs.length === 0, `抛错: ${JSON.stringify(errs)}`)
  assert(probe.injectError === null, `inject 回调抛错: ${probe.injectError}`)
  return 'all inert'
})

check('安全模式: POST /dsh-purge/apply 明确返回只读拦截（不再假装成功）', () => {
  const a = probe.applyPost
  assert(a && !a.error, `apply handler 抛错: ${a && a.error}`)
  assert(a.code === 200, `status=${a.code}（应为 200，避免前端显示网络错误）`)
  assert(a.body && a.body.ok === false, `写操作不应 ok:true: ${JSON.stringify(a.body)}`)
  assert(a.body.safeMode === true && a.body.readOnly === true && a.body.blocked === true,
    `缺少只读/拦截标记: ${JSON.stringify(a.body)}`)
  assert(/安全模式/.test(String(a.body.error || '')), `缺少可读拦截原因: ${JSON.stringify(a.body)}`)
  const st = probe.statusGet
  assert(st && st.code === 200 && st.body && st.body.ok === true && st.body.safeMode === true,
    `GET status 应继续可用: ${JSON.stringify(st && st.body)}`)
  return 'apply blocked with clear error; GET status still ok'
})

check('演练台: /redteam/api 安全模式返回只读拦截（写 op 拒绝、读 op 放行、不再 405）', () => {
  assert(probe.routes.includes('/redteam/api'), `routes=${probe.routes}`)
  const w = probe.drillResponse
  assert(w && !w.error, `写 op handler 抛错: ${w && w.error}`)
  assert(w.code === 200, `status=${w.code}（应为 200，避免界面显示 405）`)
  assert(w.body && w.body.safeMode === true && w.body.readOnly === true,
    `写 op 未被只读拦截: ${JSON.stringify(w.body)}`)
  assert(w.body.ok === false, `写 op 不应成功: ${JSON.stringify(w.body)}`)
  const r = probe.drillRead
  assert(r && !r.error, `读 op handler 抛错: ${r && r.error}`)
  assert(r.code === 200 && r.body && r.body.safeMode !== true,
    `读 op(report) 应放行到真实 store，实际: ${JSON.stringify(r && r.body)}`)
  return 'write blocked (readOnly), read allowed, no 405'
})

// ── 汇总 ─────────────────────────────────────────────────────────────────────
try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch {}
if (prevHome === undefined) delete process.env.DSH_HOME
else process.env.DSH_HOME = prevHome

const pad = Math.max(...results.map((r) => r.name.length))
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed) process.exit(1)
