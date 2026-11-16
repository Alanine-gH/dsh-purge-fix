/**
 * v1.2.0 完整模式回归：默认 safeMode:false 时，apply() 不抛异常、
 * 注册预期命令/工具/钩子、写出 prompt-inject.md；并验证跨版本语义兼容补丁。
 *
 * 用法：node scripts/verify-full-mode.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as core from '../lib/core.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
let failed = 0
function check(name, fn) {
  try { results.push({ name, ok: true, detail: fn() || '' }) }
  catch (e) { failed += 1; results.push({ name, ok: false, detail: String(e && e.message ? e.message : e) }) }
}
function assert(cond, msg) { if (!cond) throw new Error(msg) }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }

// ── 静态：默认完整模式 ──────────────────────────────────────────────────────
check('patch: safeMode:false（默认完整模式）', () => {
  const yaml = read('cordis.patch.yml').split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n')
  assert(/safeMode:\s*false/.test(yaml), 'cordis.patch.yml 缺少 safeMode: false')
  assert(!/dsh-purge-redteam[\s\S]*?disabled:\s*true/.test(yaml), 'dsh-purge-redteam 仍被 disabled')
  return 'full default'
})

check('package.json: dshTarget 指向 0.2.2-rc.3', () => {
  const pkg = JSON.parse(read('package.json'))
  assert(String(pkg.dshTarget).includes('0.2.2'), `dshTarget=${pkg.dshTarget}`)
  return pkg.dshTarget
})

check('兼容补丁: 常量改名 / YAML 折叠仍能清洗身份句', () => {
  const intro = 'const FUTURE_AGENT_INTRO = "The following workspace instructions may be relevant to your work. Use them as guidance when applicable.";'
  const out = core.rewriteHostIntroConstants(intro)
  assert(out.includes('ACTIVE and MANDATORY'), '免责声明常量未被语义替换')
  assert(out.includes('FUTURE_AGENT_INTRO'), '常量名被破坏')
  const yaml = '              prefix: >-\n                You are a coding agent powered by the {{model}} model.\n'
  const y2 = core.rewritePresetIdentity(yaml)
  assert(y2.includes('prefix: ""'), '折叠身份 prefix 未被清空')
  const y3 = core.rewritePresetIdentity('personaPrefix: You are a helpful software engineer assistant.\n')
  assert(y3.includes('personaPrefix: ""'), 'personaPrefix 未被清空')
  return 'semantic fallback ok'
})

// ── 动态：mock Cordis ctx，默认 config 应进入完整模式 ────────────────────────
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-purge-full-verify-'))
process.env.DSH_HOME = home
const mod = await import(pathToFileURL(path.join(ROOT, 'lib/index.js')).href)
const reg = { commands: [], tools: [], events: [], effects: 0, injects: [], routes: [], errors: [] }
const webServer = { register(spec) { reg.routes.push(spec); return () => {} } }
const services = {
  commands: { register: (s) => reg.commands.push(s) },
  tools: { register: (s) => reg.tools.push(s) },
  webServer,
  sessions: { all: () => [], list: () => [] },
  permissionPresets: { set() {}, permissionState() { return null } },
  clientModules: { rebuilt() {} },
  agentPresets: { register: async () => () => {}, list: async () => [] },
  skills: { list: async () => [] },
}
const ctx = {
  get(n) { if (n === 'webServer') return webServer; return services[n] },
  provide(n, v) { services[n] = v },
  on(ev, h, o) { reg.events.push({ ev, o }); return () => {} },
  effect(fn) {
    reg.effects += 1
    try { const d = fn(); return typeof d === 'function' ? d : () => {} }
    catch (e) { reg.errors.push('effect:' + String(e && e.message || e)); return () => {} }
  },
  inject(names, cb) {
    reg.injects.push(names)
    try { cb({ webServer, effect: ctx.effect, get: ctx.get }) }
    catch (e) { reg.errors.push('inject:' + String(e && e.message || e)) }
    return () => {}
  },
  logger: { info() {}, warn() {}, error() {} },
  systemPrompt: { section() { return () => {} } },
  tools: { register: (s) => reg.tools.push(s) },
  webServer,
}
let applyError = null
try {
  // 不传 safeMode：应读取 DEFAULTS.safeMode=false
  mod.apply(ctx, { enabled: true, autoApplyOnStart: false, injectEnabled: false, stripMnemon: false, capabilityProtocol: false })
} catch (e) { applyError = String(e && e.stack || e) }

const files = (() => {
  const out = []
  const walk = (d, rel = '') => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      out.push(path.join(rel, e.name))
      if (e.isDirectory()) walk(path.join(d, e.name), path.join(rel, e.name))
    }
  }
  walk(home); return out
})()

check('full apply(): 默认配置不抛异常', () => {
  assert(applyError === null, `apply 抛错: ${applyError}`)
  assert(reg.errors.length === 0, `内部错误: ${reg.errors.join(' | ')}`)
  return 'no throw'
})

check('full apply(): 注册完整命令 / 工具 / assemble 钩子', () => {
  const cmds = reg.commands.map((c) => c.name)
  const tools = reg.tools.map((t) => t.name)
  assert(cmds.includes('purge') && cmds.includes('rules') && cmds.includes('skills'), `commands=${cmds}`)
  assert(tools.includes('purge_status') && tools.includes('purge_apply') && tools.includes('purge_revert'), `tools=${tools}`)
  assert(reg.events.some((e) => e.ev === 'system-prompt/assemble'), '缺少 system-prompt/assemble 钩子')
  return `commands=${cmds.join(',')} tools=${tools.join(',')}`
})

check('full apply(): 写出 prompt-inject.md（默认完整模式）', () => {
  assert(files.includes('prompt-inject.md'), `home files=${files.join(',')}`)
  return 'prompt-inject.md seeded'
})

try { fs.rmSync(home, { recursive: true, force: true }) } catch {}
const pad = Math.max(...results.map((r) => r.name.length))
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(pad)}  ${r.detail}`)
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
