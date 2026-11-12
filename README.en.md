<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">⚔️ dsh-purge-fix — DeepSeek Harness red-team / robustness plugin</h1>

<p align="center"><strong>v1.1.9 · Safe by default · npm name <code>dsh-purge-fix</code></strong></p>

> 📦 **The npm package is now ddsh-purge-fixd**: the old name ddsh-purged belongs to another npm account and cannot be published. The GitHub repository is still dAlanine-gH/dsh-purged; the d$DSH_HOMEd state directory, d/dsh-purge/*d HTTP routes and prompt section names are **unchanged internal identifiers** and need no edits when upgrading.

<p align="center">
  <em>Full source extracted from <code>YuJunZhiXue/dsh-purge</code> v1.1.71 (the original repo is gone). Original attribution terms still apply.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.9-1a73e8?style=flat" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT">
  <img src="https://img.shields.io/badge/dsh-0.2.x-blue" alt="dsh 0.2.x">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=fff" alt="Node.js">
</p>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a>
</p>

> ## ⚠️ v1.1.9: safe by default
>
> Older releases (1.8.0 and earlier) **broke the dsh host as soon as the plugin was enabled**:
> dunknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"d,
> dctx.agents.roots is not a functiond, failing session creation, unreadable history,
> and even a modified/corrupted dsh installation. The cause was a composition-level
> override of the host dsystem-promptd config with a dpersonaSuffixd containing a template
> variable, plus boot-time preset deployment, global hooks, and host-file patching that
> are incompatible with dsh 0.2.2+.
>
> **Since 1.1.9, dsafeMode: trued is the default: install → enable changes nothing on the host.**
> Only read-only d/purge statusd, dpurge_statusd, and a status HTTP endpoint are registered.
> See [Safe mode](#0-safe-mode) below.
>
> To opt into the full host-modifying behaviour, explicitly set
> ddsh-purge.config.safeMode: falsed in dcordis.patch.ymld and remove the ddisabledd
> flags on the ddsh-purge-redteam*d rows, then restart. **Not compatible with dsh 0.2.2+; use at your own risk.**
>
> ddsh-purge-fix@1.1.9d is published on npm again, so ddsh plugin add dsh-purge-fixd works;
> tarball / local directory / manual routes below also work.

---

## Contents

- [0. Safe mode](#0-safe-mode)
- [1. What this is](#1-what-this-is)
- [2. Feature overview](#2-feature-overview)
- [3. Requirements](#3-requirements)
- [4. Install](#4-install)
  - [4.0 Pick the right host](#40-pick-the-right-host)
  - [4.1 Route A: install from this repo's tarball (recommended)](#41-route-a-install-from-this-repos-tarball-recommended)
  - [4.2 Route B: install from a local directory (offline)](#42-route-b-install-from-a-local-directory-offline)
  - [4.3 Route C: manual install (fallback)](#43-route-c-manual-install-fallback)
  - [4.4 Route D: Release zip](#44-route-d-release-zip)
  - [4.5 When ddshd is not on PATH](#45-when-dsh-is-not-on-path)
  - [4.6 The three steps after install](#46-the-three-steps-after-install)
  - [4.7 Verification checklist](#47-verification-checklist)
- [5. Layout and runtime files](#5-layout-and-runtime-files)
- [6. Usage](#6-usage)
- [7. Config keys](#7-config-keys)
- [8. How it works](#8-how-it-works)
- [9. Update, restore, uninstall](#9-update-restore-uninstall)
- [10. FAQ](#10-faq)
- [11. Compatibility](#11-compatibility)
- [12. Notice, attribution, license](#12-notice-attribution-license)

---

<a id="0-safe-mode"></a>

## 0. Safe mode

**This is the default in 1.1.9 and the reason for this release.** Older versions broke the dsh host as soon as the plugin was enabled: dunknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"d, dctx.agents.roots is not a functiond, failed session creation, unreadable history, and in the worst case a modified dsh installation.

| Intrusion point | Old behaviour | 1.1.9 safe mode |
|---|---|---|
| dcordis.patch.ymld | d- id: system-promptd replaced the host's whole config with a d{{cwd}}d dpersonaSuffixd | **Removed**; host dsystem-promptd left untouched |
| Drill preset | dapply()d deployed d.agent-presets/redteam/d to d$DSH_HOMEd; disabling left a dangling reference | Three rows ddisabledd by default; all four redteam entry points inert |
| Prompt injection | Wrote dprompt-inject.mdd at boot; d{foo}d in body treated as unregistered variable | dinjectEnabled: falsed, no writes |
| Global hooks | Installed dsystem-prompt/assembled, dagent/pre-stepd, dsession/createdd, pinned ddanger-full-accessd | No global hooks |
| Host files | Unpacked dapp.asard, patched host files, injected shims, auto-restarted | Untouched; dautoApplyOnStart: falsed |
| Module load | dlib/redteam/tools.jsd threw at import time | Lazy resolution, degrades instead of throwing |

In safe mode only **read-only** surfaces are registered: d/purge statusd, d/purge helpd, the dpurge_statusd tool, and dGET /dsh-purge/statusd. dapply()d is fully wrapped in try/catch, so an init error can never bubble into Cordis assembly. dnode scripts/verify-safe-mode.mjsd runs 16 regression checks (static + a mock-Cordis dynamic probe) and is wired into CI.

**Opting into full behaviour** (modifies the host, use at your own risk): in your profile's dcordis.patch.ymld set ddsh-purge.config.safeMode: falsed and remove the ddisabledd flags on the three ddsh-purge-redteam*d rows, then fully quit and restart the host, then click **Apply**. This mode is not compatible with dsh 0.2.2+.

**Upgrading from an old version:** remove leftover dprompt-inject.mdd, d.agent-presets/redteam/d, ddsh-purge/d, dredteam/d under d$DSH_HOMEd, and any hand-written d- id: system-promptd override in the profile patch, before installing 1.1.9.

---

<a id="1-what-this-is"></a>

## 1. What this is

ddsh-purge-fixd is a red-team / robustness evaluation plugin for the **official DeepSeek Harness already installed on your own machine**. It does not change the model; it changes the **host layer**. Harness rewrites prompts, approval gates, sandbox policy and session migration at runtime, so "the model won't answer" is often a host-layer block rather than a model refusal. This plugin separates the two layers on your own install so you can evaluate which default policy is too tight.

| What you get | What it does |
|---|---|
| **dsh-purge dock** | A button beside the session title; right dock with two pages: **Clean** and **Drill** |
| **Clean** | Grouped patch status, Apply / Restore / Uninstall, prompt editor, multiple rule sets |
| **Drill** | Assets, skills and local environment pages after authorization (only for hosts you manage, offline targets, or a written authorized exercise) |
| **Host policy** | Default copy, permission policy, tool limits. Official capabilities stay |
| **Startup self-check** | Checks and reapplies on every start; no hand-editing after npm/pnpm overwrites dnode_modulesd |

Official **Web (ddsh webd)** and the official **desktop EXE** are both supported. Install and Apply them **separately**; never cross-apply.

No hardcoded drive letters: it looks at d$DSH_HOMEd, then d.dshd next to the dsh launcher, then d~/.dshd. It never patches the Harness source tree — only local d@deepseek-ai/*d package output and user-directory override files.

---

<a id="2-feature-overview"></a>

## 2. Feature overview

- **Patches (Clean)**: per-patch dapplied / pending / missing_filed status; applying repeatedly is idempotent.
- **Prompt injection**: by default injects the **encrypted prompt embedded in the plugin** (the text the prompt box shows), not a host file. You can override it with d$DSH_HOME/prompt-inject.mdd.
- **Rule sets**: multiple dAGENTS.mdd / dCLAUDE.mdd; enabling one writes it into d$DSH_HOMEd; deleting only removes it from the list.
- **Skills**: import a zip or folder into d$DSH_HOME/skills/<id>/SKILL.mdd for the current host; DSH loads it. Uninstalling the plugin never deletes your skills.
- **Own servers**: register one IP or full hostname per line into d$DSH_HOME/net-scope-allow.txtd; keys, passwords, ranges and wildcards are dropped on save.
- **Rewind**: "rewind once / rewind last turn" next to the input box, or d/rewindd in chat.
- **Drill console**: first entry needs the notice, a countdown, scrolling to the end and three checkboxes. Clean does not.
- **Auto retry / auto continue**: dautoRetryd / dautoContinued, counts configurable.

---

<a id="3-requirements"></a>

## 3. Requirements

| Item | Requirement |
|---|---|
| dsh | **0.2.x**; this package declares ddshTarget: 0.2.0-rc.2d (do not use 0.1.x) |
| Host | official desktop EXE (profile ddesktopd) or official ddsh webd (profile dwebd) |
| Node.js | **≥ 18**; Windows "no console flash" needs **≥ 22** |
| Package manager | dsh's bundled pnpm (used by ddsh plugind); nothing to install |
| Network | GitHub reachable for the first install; otherwise use Route B / Route C |

---

<a id="4-install"></a>

## 4. Install

### 4.0 Pick the right host

| What you run | profile | Notes |
|---|---|---|
| Official desktop EXE (DeepSeek Harness 0.2.0-rc.2) | ddesktopd | The profile exists only after the client has been started once. **Quit it fully** (tray → quit) before installing |
| Official ddsh webd | dwebd | Stop the running ddsh webd first |

Confirm which d$DSH_HOMEd your host actually uses (machines often have two d.dshd directories):

dddpowershell
$cands = @()
if ($env:DSH_HOME) { $cands += $env:DSH_HOME }
$cands += "$env:USERPROFILE\.dsh"
$cands += @("$env:APPDATA\DeepSeek Harness\dsh-home", "$env:LOCALAPPDATA\DeepSeek Harness\dsh-home")
$cands | Select-Object -Unique | Where-Object { $_ -and (Test-Path (Join-Path $_ "profiles")) }
ddd

dddsh
ls -d "${DSH_HOME:-$HOME/.dsh}"/profiles 2>/dev/null
ddd

Inside dprofiles/<web|desktop>/package.jsond, d"name"d must be ddsh-profile-webd or ddsh-profile-desktopd.

---

### 4.1 Route A: install from this repo's tarball (recommended)

dddpowershell
# Web host
dsh plugin --profile web add https://github.com/Alanine-gH/dsh-purge/archive/refs/heads/master.tar.gz

# Desktop host (quit the desktop client first)
dsh plugin --profile desktop add https://github.com/Alanine-gH/dsh-purge/archive/refs/heads/master.tar.gz
ddd

Same commands on macOS / Linux.

Afterwards the profile dpackage.jsond contains:

dddjson
"dsh-purge-fix": "https://github.com/Alanine-gH/dsh-purge/archive/refs/heads/master.tar.gz"
ddd

and ddsh.profile.bundlesd ends with d"dsh-purge-fix"d. **Both present = installed correctly.**

> drepository / homepage / bugs / dsh.installd in dpackage.jsond all point at dAlanine-gH/dsh-purged, so the in-panel "check for updates" and repo links use this repository instead of the dead one.

---

### 4.2 Route B: install from a local directory (offline)

dddpowershell
# the directory must contain package.json at its root
dsh plugin --profile desktop add D:\path\to\dsh-purge
ddd

dddsh
dsh plugin --profile web add /path/to/dsh-purge
# or, from inside the repo root:
dsh plugin --profile web add .
ddd

Copy the **whole tree** (dlib/ client.js docs/ presets/ skills/ bin/d). dclient.jsd is the built dock front end — without it you get the CLI but no panel.

---

### 4.3 Route C: manual install (fallback)

Only touch the profile of the host you actually run.

**Step 1 — put the plugin at d$DSH_HOME/plugins/dsh-purge-fixd**

The folder must be named ddsh-purge-fixd, and dpackage.jsond inside it must have d"name": "dsh-purge-fix"d.

dddsh
git clone https://github.com/Alanine-gH/dsh-purge.git "$DSH_HOME/plugins/dsh-purge-fix"
ddd

No git: download [master.tar.gz](https://github.com/Alanine-gH/dsh-purge/archive/refs/heads/master.tar.gz), rename ddsh-purge-masterd to ddsh-purge-fixd, drop it into dplugins/d.

**Step 2 — edit the profile dpackage.jsond (back it up first)**

Add exactly two things:

1. ddependenciesd: d"dsh-purge-fix": "file:../../plugins/dsh-purge-fix"d
2. append d"dsh-purge-fix"d to the **end** of ddsh.profile.bundlesd (skip if already present)

dddjson
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-purge-fix": "file:../../plugins/dsh-purge-fix"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-purge-fix"
      ]
    }
  }
}
ddd

JSON must stay valid. Keep the dfile:d path relative; do not touch dpatchReloadd, other plugins or versions.

**Step 3 — install dependencies in that profile directory only**

dddsh
cd "$DSH_HOME/profiles/web"    # or profiles/desktop
pnpm install
ddd

Success marker: dprofiles/<web|desktop>/node_modules/dsh-purge-fix/package.jsond exists.

**Step 4** — see [4.6](#46-the-three-steps-after-install).

---

### 4.4 Route D: Release zip

Pushing dmasterd makes GitHub Actions publish a Release whose asset is ddsh-purge-<version>.zipd. Unzip it, then either use Route B against the extracted directory or Route C.

---

### 4.5 When ddshd is not on PATH

The desktop build ships its own CLI, typically at:

ddd
<install dir>\resources\runtime\cli\bin\dsh.cmd
ddd

e.g. dD:\dsh\resources\runtime\cli\bin\dsh.cmdd. Arguments are identical:

dddpowershell
& "D:\dsh\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add D:\path\to\dsh-purge
ddd

---

### 4.6 The three steps after install

dddmermaid
flowchart LR
  A["Added to profile<br/>(route A/B/C/D)"] --> B["Quit the host fully<br/>and reopen it"]
  B --> C["dsh-purge beside the title →<br/>Clean → Apply"]
  C --> D["A successful Apply restarts once;<br/>then start a new chat"]
ddd

1. **Quit and reopen** that host (tray → quit for desktop; stop and restart ddsh webd).
2. On **that host**, click **dsh-purge** beside the session title → **Clean** → **Apply** (not the Settings page).
3. **A successful Apply restarts once** so patches load; an unfinished Apply does not restart.

> Web controls affect Web only; desktop controls affect the desktop app only.

---

### 4.7 Verification checklist

- [ ] profile dpackage.jsond has both ddependencies.dsh-purge-fixd and ddsh-purge-fixd in ddsh.profile.bundlesd
- [ ] dprofiles/<web|desktop>/node_modules/dsh-purge-fix/package.jsond exists
- [ ] the **dsh-purge** dock button appears beside the session title and opens
- [ ] d/purge statusd prints dDSH_HOMEd and the patch list, pointing at the host you actually run
- [ ] the model sees dpurge_statusd / dpurge_applyd / dpurge_revertd tools
- [ ] dnode <plugin>/bin/dsh-purge.js --statusd lists patch states

Optional packages that are missing show as dskippedd and do not block Apply.

---

<a id="5-layout-and-runtime-files"></a>

## 5. Layout and runtime files

| Path | Purpose |
|---|---|
| dbin/dsh-purge.jsd | CLI entry (d--status / --apply / --revert / --uninstall / --editd) |
| dlib/d | patch engine, path discovery, shim injection, update, uninstall, drill console (dlib/redteam/d) |
| dlib/asset-table.jsd | embedded encrypted prompt (generated by dscripts/embed-default-prompt.mjsd) |
| dclient.jsd | built dock front end (dscripts/build-client.mjsd) |
| dcordis.patch.ymld | bundle patch registering ddsh-purge-fixd, ddsh-purge/redteamd, dstored, duid |
| dpresets/redteam/d | red-team preset (dagent.cordis.ymld, danchor-gate.mjsd, dpreset.ymld) |
| dskills/redteam/d | bundled skills (recon, scanning, tunnels, credentials, lateral, reporting) |
| ddocs/d | banner, previews, authorization page, upstream licenses, ddocs/upstream/d original READMEs |
| dscripts/d | build / embed / patch scripts, dredteam-setup.shd |

Runtime under d$DSH_HOMEd (one per host): dprompt-inject.mdd, drules/d, dskills/d, dnet-scope-allow.txtd, dredteam/d, ddsh-purge/d (state: dapplied.jsond, doverride-state.jsond, dinstalled-revd, ddrill-grant.jsond).

---

<a id="6-usage"></a>

## 6. Usage

dddsh
dsh-purge --status | --apply | --revert | --uninstall | --edit | --help

/purge status | apply | revert | uninstall | edit | help
/rules list | use <id> | create <id> | delete <id> | reset | help
/skills list | import <zip-or-folder> | create <id> [desc] | delete <id> | help
/rewind

purge_status   purge_apply   purge_revert        # model tools
ddd

The **Clean** page lists patch status, prompt, own servers, rule sets and skills. The **Drill** page requires the first-entry authorization flow (notice → countdown → scroll → three checkboxes).

---

<a id="7-config-keys"></a>

## 7. Config keys

Edit the ddsh-purge-fixd entry in d$DSH_HOME/profiles/<web|desktop>/cordis.patch.ymld, then restart the host.

dddyaml
- insert:
    - id: dsh-purge
      name: 'dsh-purge-fix'
      inject: [systemPrompt, tools]
      config:
        enabled: true                 # master switch
        safeMode: true                # v1.1.9 default: read-only, enabling changes nothing. false enables host-modifying mode
        autoApplyOnStart: false       # reapply patches on startup
        autoUpdateOnStart: false      # check for updates on startup
        autoRevertOnMissing: false    # reserved
        injectOnce: false             # reserved
        stripMnemon: false            # v1.1.9 safe default
        verbose: false                # verbose console logging
        postPrompt: ""                # extra prompt section (empty by default)
        postPromptOrder: 5100         # must exceed the built-in global order
        autoRetry: false              # v1.1.9 safe default
        retryMax: 3
        autoContinue: false
        continueMax: 3
        continueText: "继续"
        capabilityProtocol: false     # v1.1.9 safe default
        hooksDenyBypass: false        # v1.1.9 safe default
        injectEnabled: false          # prompt injection off by default
    # Drill console is disabled by default in 1.1.9 (no orphan preset is deployed).
    - id: dsh-purge-redteam
      name: dsh-purge-fix/redteam
      disabled: true
    - id: dsh-purge-redteam-store
      name: dsh-purge-fix/redteam/store
      disabled: true
    - id: dsh-purge-redteam-ui
      name: dsh-purge-fix/redteam/ui
      disabled: true
ddd

The profile-level dcordis.patch.ymld (user patch layer) loads after built-in config, and later applies preserve your dinsertd entries.

---

<a id="8-how-it-works"></a>

## 8. How it works

Applying (startup self-check or the Apply button) backs each target file up as d<file>.dshpurge.bakd, replaces patch targets, injects the shim (ddsh.cmdd / ddsh.ps1d / ddshd) and the embedded encrypted prompt. Per-turn prompt source: non-empty dprompt-inject.mdd → checked local md in the workspace → embedded default; the workspace-baseline policy (dstrictd / dfallbackd / dalwaysd) then decides whether the DSH baseline section is kept. Skills never enter the injected section.

---

<a id="9-update-restore-uninstall"></a>

## 9. Update, restore, uninstall

dddpowershell
dsh plugin --profile desktop remove dsh-purge
dsh plugin --profile desktop add https://github.com/Alanine-gH/dsh-purge/archive/refs/heads/master.tar.gz
# quit → reopen → Clean → Apply
ddd

Restore keeps the plugin and returns the host to stock: ddsh-purge --revertd (or d/purge revertd). dprompt-inject.mdd is a user file and is kept. Uninstall restores first, then removes the injection file, rule store and the plugin: ddsh-purge --uninstalld (or d/purge uninstalld).

Publishing a new version: bump dpackage.jsond, put d# <version>d as the first line of drelease-notes.mdd, push dmasterd — Actions publishes the Release and zip.

---

<a id="10-faq"></a>

## 10. FAQ

1. **dadd dsh-purge-fixd returns 404** — the npm package is gone; use Route A/B/C.
2. **dpnpm was not foundd** — use dsh's bundled CLI (dresources\runtime\cli\bin\dsh.cmdd).
3. **dplugin command failedd** — read the printed dlogPathd; usually network, broken profile JSON, or a wrong dfile:d path.
4. **Version mismatch** — this package targets dsh d0.2.0-rc.2d. If you must cross versions: ddsh plugin --profile web allow-version dsh-purge-fix@1.1.9 --dsh-version <exact> --accept-riskd.
5. **dallowBuildsd prompt** — add the exact key pnpm prints to dprofiles/<p>/pnpm-workspace.yamld; tarball / local installs never trigger it.
6. **Desktop profile errors out** — start the desktop client once, quit it fully, retry.
7. **No dock button** — wrong host, host not restarted, missing ddsh-purge-fixd in ddsh.profile.bundlesd, or dclient.jsd not copied.
8. **Applied but nothing changed** — patches load after a restart, and injection enters a **new** session. Apply → let it restart → start a new chat.
9. **Everything dpendingd / dmissing_filed** — the host was upgraded or moved; unmatched patches are skipped, never blindly rewritten.
10. **dnode_modulesd overwritten** — set dautoApplyOnStart: trued, or click Apply again.
11. **Back to a stock Harness** — restore, then uninstall, then remove d$DSH_HOME/dsh-purge/d.
12. **Other machines / clients** — yes; the plugin only talks to the local d@deepseek-aid packages and d$DSH_HOMEd.

---

<a id="11-compatibility"></a>

## 11. Compatibility

| Plugin | dsh | Notes |
|---|---|---|
| **1.1.9** (this repo) | **0.2.x** (incl. 0.2.2-rc.2) | **Safe by default** — enabling does not modify the host; fixes enable-time crashes |
| 1.8.0 | 0.2.x | old maintenance build; **enabling triggers d{{cwd}}d / drootsd crashes, do not use** |
| 1.1.71 | 0.2.x (desktop 0.2.0-rc.2 / ddsh webd) | full extraction |
| 1.1.40+ | 0.2.x | same line upstream |
| ≤ 1.1.39 | 0.1.7 (incl. rc.1/rc.2) | older upstream line, not included here |

---

<a id="12-notice-attribution-license"></a>

## 12. Notice, attribution, license

**Attribution (original author's terms):** if you borrow this project's name, ideas, code or prompts, you must credit the author and name the source. Original: **dYuJunZhiXue/dsh-purged (author: 小杨)**. This repository is the v1.1.71 mirror rebuild: **dAlanine-gH/dsh-purged**.

**Scope**

1. No malware, backdoors, unauthorized pentest kits, ransomware, credential-stuffing scripts or attack payloads aimed at the public internet.
2. Patches and prompt injection only affect the **official DeepSeek Harness installed on your own machine** (d@deepseek-aid packages, local profile / d$DSH_HOMEd).
3. Apply / inject / revert / uninstall touch local files and local processes only; nothing scans, probes or sends traffic to public hosts. The update check contacts this plugin's own GitHub repository to compare versions.
4. Use only on a Harness you are entitled to administer, offline synthetic fixtures, authorized ranges or compliant labs.
5. Network ranges in mainland China, Hong Kong and Macau, and servers/domains resolving into them, are forbidden by default; the only exception is the single exact IP or full hostname you register in advance (Clean → Own servers → d$DSH_HOME/net-scope-allow.txtd). Keys, passwords, ranges, wildcards and verbal claims are not exceptions.
6. Do not use it to violate applicable law or the model provider's terms; no unauthorized intrusion, extortion, credential stuffing or malware distribution.
7. Provided as-is under MIT; users bear all responsibility for download, deployment, operation, modification, distribution and outputs.
8. Any illegal use terminates the license immediately and irrevocably.
9. Independent open-source research project; no affiliation with, or endorsement by, DeepSeek.

**License**: MIT — see [LICENSE](LICENSE) (original copyright line dCopyright (c) 2026 小杨d retained).

**Thanks**: original author 小杨 (dYuJunZhiXued), the [LINUX DO](https://linux.do) community, and the upstream projects listed in ddocs/redteam-upstream-*d.
