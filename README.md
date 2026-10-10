# DraconDex-EXT-Template

Template repo for a **DraconDex 5 in-app extension** — a small web app that
DraconDex downloads from a git repo and runs either in its own window or in the
main window's side panel, with its own database tables and nothing else.

> เทมเพลตสำหรับเขียน "ปลั๊กอิน/ส่วนขยาย" ของ DraconDex — กด **Use this
> template** บน GitHub, แก้ `dracondex-plugin.json`, แล้ววางลิงก์ repo ลงใน
> **Setting → Plugin → Plugins** ของแอป เอกสารฉบับเต็ม (ภาษาไทย) อยู่ที่
> `docs/PLUGINS.md` ใน DraconDex-APP · เขียนสำหรับ DraconDex 5 (ใช้ได้กับ 4.3+)

Extension and plugin are the same thing. The feature shipped in v4.0.0 as
"Github Extensions" and was renamed to **Plugin** in v4.2.0; the old names
(`dracondex-extension.json`, `window.extApi`) still work and always will.

---

## Quick start

1. **Use this template** on GitHub (or fork it).
2. Edit `dracondex-plugin.json`:
   - `id` — lowercase `a-z0-9_`, max 20 chars. **Change it.** It namespaces
     your tables (`plg_<id>_<table>`), so two extensions sharing an id collide.
   - `name`, `version` — shown in the install preview.
   - `tables` — the tables you get. Columns are `TEXT`/`INTEGER`/`REAL` only.
   - `panels` — drop this if you only want a standalone window.
3. `npm run validate` — runs **the app's own** `validateManifest()` (vendored
   from DraconDex-EXE, see below) before you push, and tells you if a file is
   missing from `files`.
4. Commit and push to `main`.
5. In DraconDex: **Setting → Plugin → Plugins**, paste the repo link, read the
   preview, confirm.

The `extension-scaffold` skill (`.claude/skills/`) walks through all of this,
including which files only matter inside the DraconDex project and can go.

Keep the `.dracondex` file at the repo root. The app checks only that it
exists; it is what makes your repo show up in the in-app "install from
@ZYDRAXYL" list. It is never fetched at install time.

## What is in here

| File | Why |
|---|---|
| `dracondex-plugin.json` | The manifest. The only file the app reads to decide what to install. |
| `.dracondex` | Marker — opts the repo into the in-app recommendation list. |
| `index.html` | Standalone-window entry (`entry` in the manifest). Frameless — draws its own title bar. |
| `panel.html` | Side-panel entry, declared under `panels[]`. The host draws its header. |
| `app.js` | Shared logic for both — table CRUD, live module context, the net probe. |
| `style.css` | DraconDex 5's `daylight`/`midnight` palette, following the OS light/dark preference. |
| `tools/validate-manifest.mjs` | Offline manifest check that runs the app's own rules. |
| `tools/plugin-manifest.cjs` | Those rules: a byte-identical copy of DraconDex-EXE's `plugin-manifest.js`. Do not edit. |
| `tools/plugin-contract.mjs` + `plugin-contract.lock.json` | Which DraconDex release the copy came from; checks it, moves the pin. |
| `.claude/` | Skills and agents for working on this with Claude Code. |
| `chain/`, `tools/chain-*.mjs` | DraconDex project tooling — only meaningful in this template repo; delete in your copy. |

None of that is in the manifest's `files` list, so none of it is downloaded into
the app. Only the four runtime files are.

## Which DraconDex it targets

`plugin-contract.lock.json` pins the DraconDex-EXE release whose rules
`npm run validate` enforces (v5.1.0 today). When a newer DraconDex ships:

```bash
npm run contract:upstream                           # did the rules or the API move?
node tools/plugin-contract.mjs --vendor --ref v5.2.0  # move the pin
npm run validate
```

## What DraconDex 5 changed

- Panels open in the **side panel** beside the page (the Module Inspector dock
  is gone). The button is on the page's address row; the side panel draws the
  header and close button and is 220–640px wide.
- A panel is **not reloaded when the page re-renders** any more. It stays open
  across pages and is destroyed when closed.
- While it is open, the host **pushes a new `context`** on every page change.
  The panel here re-filters its notes to the module now open.
- The manifest did not change.

## The API you get

`window.pluginApi` (alias `window.extApi`) is the whole surface:

```js
await pluginApi.table.getSchema('notes')            // { columns: [...] }
await pluginApi.table.query('notes', { pinned: 1 }) // rows, newest id first
await pluginApi.table.insert('notes', { title })    // { id }
await pluginApi.table.update('notes', id, { body }) // { changes }
await pluginApi.table.delete('notes', id)           // { changes }

await pluginApi.net.fetch(url, { method, headers, body })
await pluginApi.net.stream(url, init, { onChunk, onEnd })   // -> abort()
await pluginApi.oauth.authorize({ authorizeUrl, clientId, scope })

pluginApi.panel.send({ type: 'getContext' })   // panel host only
pluginApi.panel.onMessage(cb)                  // -> unsubscribe; 'context' also arrives on every page change
pluginApi.panel.close()
```

There is **no** `window.api`, no Node, no filesystem, no raw SQL. The extension
window is given a different preload than the app window, so this is structural,
not a check that can be bypassed.

`query` filters are equality-only and limited to columns you declared. Rows
always carry an `id` the app maintains — you cannot declare a column called
`id`, `rowid`, `oid` or `_rowid_`.

## Three things that catch people out

**A panel is destroyed when it closes.** DraconDex 5 keeps it alive across page
changes, but the side panel's ×, opening another plugin's panel, or quitting
the app ends it (and on a 4.x host every pane re-render reloaded it).
Module-scope variables do not survive that. Persist anything worth keeping to a
table and read it back on load; the `kv` table and the autosaved draft box in
`app.js` exist to show this.

**Only paths in `files` are downloaded.** A stylesheet you forgot to list is
not fetched, and the extension loads unstyled with no error. `npm run validate`
warns about this.

**`permissions.net` is a real grant, not a formality.** Requests run in the
main process, which is exactly what lets you read a cross-origin response CORS
would otherwise withhold. Every origin you list is shown to the user before
they accept, and it is compared as an *origin* — no paths, no wildcards.
`http://` is refused except on loopback with an explicit port
(`http://localhost:11434`), for local model servers. This template declares no
network access at all; add the origin only when you actually call it.

## Security, stated plainly

Installed code is trusted the moment it is installed. There is no review, no
signing, and the install preview only reports what the manifest declares — it
does not inspect what the code does. The extension runs in a separate window
with its own preload and its own tables, and it cannot reach the app's data or
another extension's tables. It is not an OS-level sandbox: the app runs with
`--no-sandbox` process-wide for portable-build reasons, so `sandbox: true` on
the extension window is close to a no-op today.

Extension tables are plain SQLite with no encryption anywhere in the app. If
your extension stores an API key or token, tell your users that in your README.

Full write-up: `docs/PLUGINS.md` in **DraconDex-APP**, §2.4 especially.

## Working on this with Claude Code

`CLAUDE.md` and `.claude/` carry the contract. In this template repo the
`.claude/` files and the `tools/` scripts are mirrored from DraconDex-APP (edit
them there); in your copy they are yours — the `extension-scaffold` skill says
which to keep.

## License

MIT — see `LICENSE`. Extensions made from this template are yours; relicense
freely.
