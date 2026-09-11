# DraconDex-EXT-Template

Template repo for a **DraconDex in-app extension** — a small web app that
DraconDex downloads from a git repo and runs either in its own window or docked
inside the main window, with its own database tables and nothing else.

> เทมเพลตสำหรับเขียน "ปลั๊กอิน/ส่วนขยาย" ของ DraconDex — กด **Use this
> template** บน GitHub, แก้ `dracondex-plugin.json`, แล้ววางลิงก์ repo ลงใน
> **การตั้งค่า → ปลั๊กอิน** ของแอป เอกสารฉบับเต็ม (ภาษาไทย) อยู่ที่
> `docs/PLUGINS.md` ใน DraconDex-APP

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
3. `npm run validate` — checks the manifest against the app's real rules before
   you push, and tells you if a file is missing from `files`.
4. Commit and push to `main`.
5. In DraconDex: **การตั้งค่า → ปลั๊กอิน**, paste the repo link, read the
   preview, confirm.

Keep the `.dracondex` file at the repo root. The app checks only that it
exists; it is what makes your repo show up in the in-app "install from
@ZYDRAXYL" list. It is never fetched at install time.

## What is in here

| File | Why |
|---|---|
| `dracondex-plugin.json` | The manifest. The only file the app reads to decide what to install. |
| `.dracondex` | Marker — opts the repo into the in-app recommendation list. |
| `index.html` | Standalone-window entry (`entry` in the manifest). |
| `panel.html` | Docked-panel entry, declared under `panels[]`. |
| `app.js` | Shared logic for both — table CRUD, panel context, the net probe. |
| `style.css` | Theme-neutral CSS that follows the OS light/dark preference. |
| `tools/validate-manifest.mjs` | Offline manifest check. |
| `.claude/` | Skills and an agent for working on this repo with Claude Code. |

`README.md`, `CLAUDE.md`, `.claude/`, `tools/` and `package.json` are **not** in
the manifest's `files` list, so they are never downloaded into the app. Only
the four runtime files are.

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
pluginApi.panel.onMessage(cb)                  // -> unsubscribe
pluginApi.panel.close()
```

There is **no** `window.api`, no Node, no filesystem, no raw SQL. The extension
window is given a different preload than the app window, so this is structural,
not a check that can be bypassed.

`query` filters are equality-only and limited to columns you declared. Rows
always carry an `id` the app maintains — you cannot declare a column called
`id`, `rowid`, `oid` or `_rowid_`.

## Three things that catch people out

**A docked panel is reloaded from scratch whenever the main window re-renders
its pane** — renaming a tag is enough. Module-scope variables do not survive
it. Persist anything worth keeping to a table and read it back on load; the
`kv` table and the autosaved draft box in `app.js` exist to show this.

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

`CLAUDE.md` and `.claude/` carry the contract. Unlike the chain repos, nothing
here is mirrored from DraconDex-APP — these files are authored in this repo and
are yours to edit after you use the template.

## License

MIT — see `LICENSE`. Extensions made from this template are yours; relicense
freely.
