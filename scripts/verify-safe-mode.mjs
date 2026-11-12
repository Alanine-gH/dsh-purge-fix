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

check('patch: 演练台三行默认 disabled（不留悬空预设引用）', () => {
  const ids = ['dsh-purge-redteam', 'dsh-purge-redteam-store', 'dsh-purge-redteam-ui']
  for (const id of ids) {
    const re = new RegExp(`- id:\\s*${id}\\b[\\s\\S]*?(?=\\n\\s*- id:|\\n\\s*$)`)
    const block = patchCode.match(re)
    assert(block, `找不到 ${id}`)
    assert(/disabled:\s*true/.test(block[0]), `${id} 没有 disabled: true`)
  }
  return 'all redteam rows disabled'
})

check('patch: 无重复 id', () => {
  const ids = [...patchCode.matchAll(/^\s*- id:\s*([^\s]+)/gm)].map((m) => m[1])
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  assert(dup.length === 0, `重复 id: ${[...new Set(dup)].join(', ')}`)
  return `${ids.length} unique ids`
})

check('package.json: 版本 1.1.9 / 仓库指向 Alanine-gH', () => {
  const pkg = JSON.parse(read('package.json'))
  assert(pkg.version === '1.1.9', `version=${pkg.version}`)
  assert(!read('package.json').includes('ZXEB/dsh-purge'), '仍指向已失效的 ZXEB 仓库')
  assert(String(pkg.repository?.url).includes('Alanine-gH/dsh-purge'), 'repository 不对')
  assert(String(pkg.dsh?.install?.tarball).includes('Alanine-gH/dsh-purge'), 'tarball 不对')
  return `${pkg.name}@${pkg.version}`
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
const ctx = {
  get(name) {
    if (name === 'commands') return { register: (s) => reg.commands.push(s) }
    if (name === 'tools') return { register: (s) => reg.tools.push(s) }
    if (name === 'webServer') return webServer
    return undefined
  },
  on(event, handler, opts) { reg.events.push({ event, opts }); return () => {} },
  effect(fn) { reg.effects += 1; try { fn() } catch {} return () => {} },
  inject(names, cb) { reg.injects.push(names); try { cb({ webServer, effect: ctx.effect, get: ctx.get }) } catch (e) { reg.injectError = String(e) } return () => {} },
  logger,
  systemPrompt: { section: () => () => {} },
  tools: { register: (s) => reg.tools.push(s) },
}
let applyError = null
try { mod.apply(ctx, {}) } catch (e) { applyError = String(e && e.stack || e) }
const after = snap(tmpHome)

// 演练台四个入口在安全模式下必须全部空转
const redteam = {}
for (const f of ['index','store','ui','tools']) {
  const m = await import(pathToFileURL(path.join(ROOT, 'lib/redteam/'+f+'.js')).href)
  let err = null
  try { m.apply(ctx, {}) } catch (e) { err = String(e && e.message || e) }
  redteam[f] = err
}
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

check('apply(): DSH_HOME 零写入（不写 prompt-inject.md / .agent-presets / 备份）', () => {
  const added = probe.filesAfter.filter((f) => !probe.filesBefore.includes(f))
  // 允许插件内部日志写到 os.tmpdir() 之外；这里只校验 DSH_HOME
  assert(added.length === 0, `DSH_HOME 新增文件: ${added.join(', ')}`)
  return `${added.length} files written`
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
