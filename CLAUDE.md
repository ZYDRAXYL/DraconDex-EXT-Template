# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repo.

## What this is

**A template for one DraconDex 5 extension.** Not a library — a repo you copy
with "Use this template", rename, and grow into an extension of your own.

**This repo itself is in the DraconDex chain**, at the tail of all three
(`… > PGI, EXT`, `chain/chain.json`). Two edges arrive here and none leave:

| edge | carries | lands as |
|---|---|---|
| APP → EXT | `claude-tooling` | `.claude/`, `chain/`, `tools/chain-*.mjs`, `tools/validate-manifest.mjs`, `tools/plugin-contract.mjs` — **edit them in DraconDex-APP**, never here |
| EXE → EXT | `plugin-contract` | `tools/plugin-manifest.cjs` (byte-identical copy of EXE's `electron/src/db/plugin-manifest.js`) + `plugin-contract.lock.json` |

What this repo owns is the demo itself: the manifest, `index.html`,
`panel.html`, `app.js`, `style.css`, `.dracondex`, README and this file.

A *copy* of this template is not in the chain — the `extension-scaffold` skill
removes the chain furniture and keeps the contract.

Extension = plugin. The feature shipped as "Github Extensions" in v4.0.0 and
was renamed to **Plugin** in v4.2.0. Both names appear in the app, the docs and
this repo, and the old spellings (`dracondex-extension.json`, `window.extApi`)
still resolve. Don't "fix" one to the other.

An extension is a small web app that DraconDex downloads **file by file** from
a git repo and runs in a window of its own, with tables of its own and no
access to anything else.

## What DraconDex 5 changed for extensions

- **Panels open in the side panel**, not in place of the Module Inspector
  (the dock is gone, v5 Part 8). The button sits on the page's address row; the
  side panel draws the header (icon, title, ×) and is 220–640px wide.
- **A panel is no longer reloaded when the page re-renders.** Its webview is
  created once when opened, survives page changes, and is destroyed when the
  side panel closes or the app quits.
- **The host pushes `context` on every page change** while the panel is open —
  the listener stays installed for the page's life.
- Settings → Plugin → **Plugins** is one page (the old "Plugin settings" page
  merged into it).
- The manifest format did not change. Everything written for 4.3+ installs.

## The only thing the app reads

`dracondex-plugin.json`. Everything the app knows about this extension comes
from it — which files to download, which tables to create, which panels to
offer, which origins to allow. Nothing is discovered by scanning the repo.

Two consequences that cause most bugs here:

- **A file not in `files` does not exist.** It is not downloaded. The page
  loads with the stylesheet or script silently missing and no error anywhere.
- **The manifest is validated after a network round trip**, so a mistake costs
  a commit, a push and a paste. Run `npm run validate` first — always, before
  suggesting the user try an install.

## Layout

```
dracondex-plugin.json   THE MANIFEST — id, files, tables, panels, permissions
.dracondex              marker: opts the repo into the app's recommend list.
                        Existence only; contents are never read. Keep it.
index.html              standalone-window entry — draws its own frameless title bar
panel.html              side-panel entry (declared under panels[]) — no title bar, the host draws one
app.js                  shared logic for both entries
style.css               DraconDex 5 daylight/midnight palette, follows the OS (no app theme reaches here)
tools/validate-manifest.mjs   offline check running the app's OWN rules — `npm run validate`   (mirrored from APP)
tools/plugin-manifest.cjs     the app's rules: EXE plugin-manifest.js, byte-identical         (vendored from EXE)
tools/plugin-contract.mjs     checks the copy / moves the pin — `npm run contract`            (mirrored from APP)
plugin-contract.lock.json     which EXE release the copy came from
tools/chain-*.mjs, chain/     chain tooling                                                    (mirrored from APP)
.claude/skills/         extension-* + chain skills                                             (mirrored from APP)
.claude/agents/         extension-reviewer, chained-*                                          (mirrored from APP)
.github/workflows/validate.yml  contract + manifest + node --check on every push
```

`README.md`, `CLAUDE.md`, `.claude/`, `chain/`, `tools/`, `package.json` and
the lock are deliberately absent from `files`: they are repo furniture, not runtime, and
every entry in `files` is one more file the app fetches on install.

## The capability surface — all of it

```js
pluginApi.table.getSchema(name)            // { columns }
pluginApi.table.query(name, filter?)       // rows, ORDER BY id DESC
pluginApi.table.insert(name, row)          // { id }
pluginApi.table.update(name, id, row)      // { changes }
pluginApi.table.delete(name, id)           // { changes }
pluginApi.net.fetch(url, init)             // permissions.net origins only
pluginApi.net.stream(url, init, handlers)  // SSE; resolves to abort()
pluginApi.oauth.authorize(opts)            // PKCE via the system browser
pluginApi.panel.send / onMessage / close   // panel host only
```

`window.extApi` is the same object under its pre-v4.2.0 name.

**There is no `window.api`, no Node, no `fs`, no raw SQL, and no way to reach
the app's tables or another extension's.** Do not write code that probes for
them or works around their absence — the extension window is handed a different
preload file than the app window, so this is structural. Every
`pluginapi:table:*` call resolves the calling extension's identity from the
webContents, never from an argument, so passing someone else's id changes
nothing.

`filter` is equality-only, on declared columns. Every row has an `id` the app
owns; `id`, `rowid`, `oid` and `_rowid_` cannot be declared as columns.

## Rules that are not style preferences

- **Persist panel state to a table.** A v5 side panel survives page changes
  but is destroyed when it closes or the app quits (and a 4.x host reloaded it
  on every pane re-render). Module-scope variables survive none of that. This
  is why `kv` exists.
- **Keep listening for `context`.** v5 pushes a new one on every page change;
  reading it once at boot shows the wrong module after the first navigation.
- **The window draws its own title bar; the panel does not.** Plugin windows
  are frameless (no way to move or close without `.titlebar`); the side panel
  already has a header with a ×.
- **Never build DOM from a string containing table or network content.** Build
  nodes and set `.textContent`. There is no `innerHTML` in this repo; keep it
  that way.
- **Never add a network origin to `permissions.net` speculatively.** Each one
  is shown to the user before they accept, and giving the main process an
  origin to fetch on your behalf is a real capability — it defeats CORS on
  purpose. Add one when code actually calls it, not before.
- **No CDN, no remote font, no remote script, no inline `style=""`.** Only
  files in `files` are downloaded; anything remote is an unreviewable fetch on
  every launch. Both HTML entries set a CSP that forbids it — and
  `style-src 'self'` silently drops inline style attributes too.
- **Column types are `TEXT`, `INTEGER`, `REAL`.** No `BLOB`, no `DEFAULT`, no
  `CHECK`, no foreign keys — the manifest does not accept them. Store dates as
  ISO-8601 `TEXT`; it sorts correctly as a string.
- **Changing `id` renames every table** (`plg_<id>_<name>`). On an installed
  copy that means the old tables are orphaned, not migrated. Decide the `id`
  once, early.

## Limits, exactly

| Thing | Limit |
|---|---|
| `id` | `^[a-z0-9_]{1,20}$` |
| table name | `^[a-z0-9_]{1,20}$`, max 10 tables |
| column name | `^[a-z][a-z0-9_]{0,29}$`, max 25 per table |
| `files` | 1–30 paths, 2MB per file |
| `panels` | max 5; `id` `^[a-z0-9_-]{1,24}$`, title ≤40, icon ≤8 |
| `permissions.net` | max 10, `https://` origin only (no path/query) |
| `permissions.context` | `["module"]` — the only value |
| `dependencies` | max 5 repo URLs, resolved one level deep |
| `net` response | 8MB, 120s timeout, no cookie jar |

`permissions.net` allows one exception: `http://` on `localhost`/`127.0.0.1`/
`[::1]` **with an explicit port**, for local model servers. A bare
`http://localhost` is refused — it would mean port 80, not one named service.

## Working here

```bash
npm run validate        # the app's own validateManifest + files-on-disk; run before any push
npm run contract        # tools/plugin-manifest.cjs is still byte-identical to the pin
npm run contract:upstream   # has DraconDex-EXE moved its contract past the pin?
npm run check           # node --check app.js + contract + validate (what CI runs)
```

The validator stops at the **first** error, because it is the app's own
function and the app does too. Never hand-edit `tools/plugin-manifest.cjs` —
`npm run contract` fails on it. The pin moves with
`node tools/plugin-contract.mjs --vendor --ref vX.Y.Z`, or arrives as a
`chained-update` PR when EXE runs `chained-updated`.

There is no build step, no dependency, no test runner. `app.js` is plain ES in
a browser context — `node --check app.js` catches syntax errors, nothing more.

You cannot run the extension from this repo. It only runs inside DraconDex,
installed from a pushed branch. So: validate, push, then install. If you need
to verify behaviour in the real app, that is a DraconDex-EXE session with the
`run-dracondex` skill, not this one.

## Where the real documentation lives

`docs/PLUGINS.md` in **DraconDex-APP** (Thai) is the authority — the full
runtime, the install flow and §2.4, the honest account of what the sandbox does
and does not protect against. `docs/SYSTEMS.md` there summarises it, and
`docs/V5.md` §12.8 is why panels moved. This file restates only what you need to
write an extension; if the two ever disagree, the app's own
`electron/src/db/plugin-manifest.js` in **DraconDex-EXE** wins — and
`tools/plugin-manifest.cjs` here *is* that file.
