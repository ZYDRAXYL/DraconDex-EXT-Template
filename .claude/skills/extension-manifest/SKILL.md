---
name: extension-manifest
description: Author, change and validate `dracondex-plugin.json` — the manifest that is the ONLY thing DraconDex reads to decide what an extension installs. Covers every field and its exact limit (id, files, tables and column types, panels, permissions.net and .context, dependencies), the rules that silently break an install rather than erroring (a file missing from `files`, an entry not listed, a renamed id orphaning tables), and how to check it offline before pushing. Use when adding or changing a table/column/panel/permission, when an install is refused or a page loads blank or unstyled, before any push that touches the manifest, or when asked "แก้ manifest", "เพิ่มตาราง", "เพิ่ม panel", "ขอสิทธิ์ net", "why won't it install".
---

<!-- mirrored-from-app: do not edit here -->
> **Mirrored file — edit this in `ZYDRAXYL/DraconDex-APP`, not here.**
> `tools/mirror-claude.mjs` regenerates it and any local edit is lost on the
> next mirror. ดูสัญญาของ chain ที่ `chain/README.md`

# The manifest

`dracondex-plugin.json` at the repo root. DraconDex reads this and nothing
else — it never scans the repo, never follows an import, never guesses.

Run this before any push that touches it:

```bash
npm run validate
```

That runs **the app's own** `validateManifest()` offline: `tools/plugin-manifest.cjs`
is a byte-identical copy of `electron/src/db/plugin-manifest.js` from
DraconDex-EXE, pinned in `plugin-contract.lock.json`. Never edit it —
`node tools/plugin-contract.mjs` fails on a hand-edited copy, and
`--vendor --ref vX.Y.Z` is how the pin moves (`--upstream` tells you whether
EXE has moved past it). Because it is the app's function, it stops at the
first error, exactly like an install would.

On top of that it checks what the app cannot see from a URL: every path in
`files` exists here and fits 2MB, nothing runtime-looking was left out of
`files`, the `.dracondex` marker, and a few page-level rules that fail silently
(markup built from strings, remote resources, inline `style=""` under a strict
CSP).

## The failure modes worth knowing first

These are silent — no error, no toast, nothing in a log:

| Symptom | Cause |
|---|---|
| Page loads unstyled / a script is missing | the file is not in `files`, so it was never downloaded |
| Panel button never appears | no page is open (it lives on the page's address row), or a dependency is missing (launch-blocked plugins get no button) |
| Data "disappeared" after an update | `id` changed, so `plg_<id>_<table>` renamed; old tables are orphaned, not migrated |
| `net.fetch` returns `{ok:false}` | origin not in `permissions.net`, or the manifest was edited without reinstalling |
| Context is always `null` | `permissions.context` missing `"module"` |

The last one generalises: **the manifest is read at install time.** Editing it
in the repo changes nothing about an already-installed copy. Reinstall.

## Fields

```json
{
  "id": "my_ext",
  "name": "My Extension",
  "version": "1.0.0",
  "entry": "index.html",
  "files": ["index.html", "panel.html", "app.js", "style.css"],
  "tables": [
    { "name": "notes", "columns": [
      { "name": "title", "type": "TEXT" },
      { "name": "pinned", "type": "INTEGER" }
    ]}
  ],
  "panels": [
    { "id": "notes", "title": "My Notes", "icon": "🧩", "entry": "panel.html" }
  ],
  "permissions": { "net": ["https://api.example.com"], "context": ["module"] },
  "dependencies": ["https://github.com/ZYDRAXYL/DraconDex-PGI-AINative"]
}
```

`tables`, `panels`, `permissions` and `dependencies` are all optional. A
manifest with just `id`/`name`/`entry`/`files` is valid.

### id — decide once
`^[a-z0-9_]{1,20}$`. It namespaces the tables as `plg_<id>_<name>`, which is
why changing it later abandons the user's data rather than moving it. Two
extensions sharing an id collide. Changing it is a migration, not a rename —
if you must, the extension has to copy rows across itself before the old tables
are dropped, and there is no API that reaches the old tables once the id moved.
In practice: don't.

### files — the download list
1–30 repo-relative paths, forward slashes, no `..`, no leading `/`, 2MB each.
Subdirectories are fine and preserved on disk. `entry` and every
`panels[].entry` must also appear here.

Keep it to runtime. README, CLAUDE.md, `.claude/`, `tools/`, `chain/`,
`package.json`, `plugin-contract.lock.json` belong out of it — each entry is another fetch on install.

### tables — columns are TEXT, INTEGER, REAL
Max 10 tables, names `^[a-z0-9_]{1,20}$`. Max 25 columns, names
`^[a-z][a-z0-9_]{0,29}$`. `id`, `rowid`, `oid`, `_rowid_` are reserved — every
row already carries an `id` the app maintains.

No `BLOB`, no `DEFAULT`, no `CHECK`, no foreign keys, no indexes: the manifest
does not accept them, deliberately, because each one is SQL composed from
untrusted text. Dates go in as ISO-8601 `TEXT`, which sorts correctly as a
string. Booleans go in as `INTEGER` 0/1.

Adding a table or column to the manifest creates it **on the next install**,
not on the next launch. There is no migration system; an installed copy keeps
the schema it was installed with.

### panels — the DraconDex 5 side panel
Max 5. `id` `^[a-z0-9_-]{1,24}$` and unique; `title` ≤40 chars; `icon`
optional, ≤8 UTF-16 units (one emoji); `entry` an `.html` file that is also in
`files`. The manifest shape is unchanged from v4.3.0 — only where it shows up
moved.

Each panel is a button on the page's address row (so: while a page is open)
and opens in the **side panel** beside the page, 220–640px wide. The host
draws the header — `icon`, `title` and a × — so the page should not draw its
own. It **stays open across page changes** and is destroyed when closed; see
the `extension-api` skill for the lifetime and the `context` push. (On 4.x
hosts it replaced the Inspector dock and reloaded on every re-render.)

### permissions.net — a real grant, not a formality
Max 10. Each entry is a bare **origin**: scheme + host + optional port. No
path, no query, no fragment, no wildcard, no credentials. `https://` only, with
one exception: `http://` on `localhost`, `127.0.0.1` or `[::1]` **with an
explicit port** (`http://localhost:11434`), for a local model server. A bare
`http://localhost` is refused — it would grant port 80 rather than one service.

The reason paths are banned: the runtime check is `origin ===`. A prefix match
on a full URL would let `https://api.example.com.evil.test` satisfy
`https://api.example.com/safe`.

Requests run in the **main process**, which is exactly what lets you read a
cross-origin response CORS would withhold. That is an increase in capability,
so every origin is shown to the user in the install preview. Add one when code
calls it; never "just in case".

What this does *not* constrain: once an origin is approved, the extension can
send anything there, including its own table contents. The allowlist limits the
destination, not the payload. If that matters for what you are building, say so
in the extension's README.

### permissions.context — identity only
`["module"]` is the only accepted value. It lets a **panel** ask the host for
`{ moduleId, moduleName, kind }` of the module currently open — and, since
v5, be told again whenever the user moves to another page. Never content.
Without it the host answers `null`, so handle `null` regardless — no module
open produces `null` too.

### dependencies — other extensions, one level
Max 5 repo URLs, any form the install box accepts (`owner/repo`, a full link, a
`/tree/branch` link). Duplicates by repo are rejected; depending on your own id
is rejected.

Resolved **one level only** — a dependency's own `dependencies` are recorded
but never auto-installed, so no chain and no cycle. Since v4.9.0 a failed
dependency no longer blocks your install; it blocks **launch**, and the user
gets a Download button for the missing one.

## Checklist for a manifest change

1. Edit `dracondex-plugin.json`.
2. `npm run validate` — fix the ERROR (there is at most one: it is the app's
   own verdict), run again, read every warn.
3. New runtime file? It is in `files`, or it does not exist.
4. New table/column/panel/permission? Existing installs need a reinstall to see
   it. Say so when reporting the change.
5. Commit, push, reinstall from the branch, confirm in the preview card that
   the app sees what you intended.
