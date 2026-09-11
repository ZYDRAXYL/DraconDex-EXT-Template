---
name: extension-scaffold
description: Turn this template into a real, named DraconDex extension — pick and apply an `id` everywhere it appears, replace the demo `notes`/`kv` tables and panel with the real ones, strip the parts of the template that were only there to teach, and keep the pieces that exist for a reason (the .dracondex marker, the kv-style persistence, the CSP, the no-innerHTML rule). Use right after copying the template, when starting a new extension from it, when the manifest still says `ext_template`, or when asked "เริ่มเขียนปลั๊กอินใหม่", "ตั้งชื่อ extension", "scaffold a new extension", "rename this template".
---

# From template to extension

Run once, at the start. After this the repo is an extension, not a template.

## 1. Choose the id first

`^[a-z0-9_]{1,20}$`. It becomes the prefix of every table
(`plg_<id>_<name>`), so **changing it later abandons the user's data** — the
old tables are orphaned, not migrated, and nothing in the API can still reach
them. This is the one decision in the repo that is expensive to revisit.

Pick something specific (`wordcount`, `timeline_ai`), not `plugin` or `test`.

## 2. Apply it

`ext_template` appears in exactly one place that matters — `dracondex-plugin.json`
— plus prose. Update:

- `dracondex-plugin.json`: `id`, `name`, `version` (start at `1.0.0`)
- `package.json`: `name`, `description`
- `README.md`: title, what it does, and — if it stores a token or calls out —
  say so there
- `index.html` / `panel.html`: `<title>`, the `<h1>`
- `CLAUDE.md`: the "What this is" opening. Keep everything below it; those are
  the app's rules, not the template's.

Then:

```bash
npm run validate        # the "still ext_template" warning should be gone
```

## 3. Replace the demo tables

`notes` and `kv` are demonstrations. Declare what you actually need — max 10
tables, 25 columns, types `TEXT`/`INTEGER`/`REAL` only, no reserved names
(`id`, `rowid`, `oid`, `_rowid_`).

**Keep a `kv`-shaped table if you ship a panel.** It is not filler: a docked
panel is reloaded from scratch on every pane re-render, so state that only
lives in a variable is lost every time the user edits a tag. The autosaved
draft in `app.js` is the worked example — delete the notes demo, keep that
pattern.

There is no migration system. Schema changes take effect on the next
**install**, not the next launch.

## 4. Decide the shape: window, panel, or both

The template ships both so you can see the difference.

- **Standalone window only** — delete `panels` from the manifest, delete
  `panel.html` (and its `files` entry), and delete `wireContext()` and the
  `IS_PANEL` branch from `app.js`. Also drop `permissions.context`: nothing
  reads it without a panel.
- **Panel only** — keep `entry` anyway. It is required, and it is what the
  "เปิดใช้งาน" button opens; pointing it at a page that explains the panel is
  a reasonable use of it.
- **Both** — keep the `IS_PANEL` split rather than forking the file. One
  behaviour, two hosts.

Remember the panel button only appears **while a module is open**, since the
panel takes over that module's Inspector dock.

## 5. Strip the teaching scaffolding

Remove once you have read them:

- the network probe UI in `index.html` (`#net-url`, `#probe`) and `probeNet()`
  in `app.js` — it exists to show a *refused* request
- the notes CRUD, if your extension is not note-shaped
- the long API comment block at the top of `app.js`

**Do not remove:**

| Keep | Because |
|---|---|
| `.dracondex` | the app's in-app recommend list checks for it; contents never read |
| the CSP `<meta>` in both entries | only files in `files` are downloaded; remote anything is unreviewable |
| `el()` / `.textContent` rendering | table and network content is text, never markup |
| `guard()` around API calls | every `pluginApi` call rejects, and the message is the bug report |
| the OS light/dark CSS | no app theme reaches an extension window; there is no variable to read |
| `window.extApi` fallback | one line, keeps pre-v4.2.0 hosts working |

## 6. Declare permissions last, and only what you call

Start with none. Add an origin to `permissions.net` when a line of code
actually fetches it — every origin is shown to the user before they accept, and
letting the main process fetch on your behalf is a genuine capability, not a
convenience. Add `permissions.context: ["module"]` only if a panel reads the
open module's identity.

## 7. Ship

```bash
npm run validate
node --check app.js
git commit && git push -u origin <branch>
```

Then install it in DraconDex from the pushed branch and confirm the preview
card shows the tables, panels and origins you meant. See the
`extension-publish` skill for the rest.
