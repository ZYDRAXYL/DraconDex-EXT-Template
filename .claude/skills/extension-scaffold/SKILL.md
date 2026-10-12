---
name: extension-scaffold
description: Turn a copy of DraconDex-EXT-Template or DraconDex-PGI-Template into a real, named DraconDex extension — pick and apply an `id` everywhere it appears, replace the demo tables and panel with the real ones, strip the parts of the template that were only there to teach or that only mean something inside the DraconDex chain, and keep the pieces that exist for a reason (the .dracondex marker, the pinned plugin contract and validator, the kv-style persistence, the CSP, the no-innerHTML rule). Use right after copying a template, when starting a new extension from one, when the manifest still says `ext_template` or `example_plugin`, or when asked "เริ่มเขียนปลั๊กอินใหม่", "ตั้งชื่อ extension", "scaffold a new extension", "rename this template".
---

<!-- mirrored-from-app: do not edit here -->
> **Mirrored file — edit this in `ZYDRAXYL/DraconDex-APP`, not here.**
> `tools/mirror-claude.mjs` regenerates it and any local edit is lost on the
> next mirror. ดูสัญญาของ chain ที่ `chain/README.md`

# From template to extension

Run once, at the start. After this the repo is an extension, not a template.

Two templates, one platform:

| | `DraconDex-PGI-Template` | `DraconDex-EXT-Template` |
|---|---|---|
| demo id | `example_plugin` | `ext_template` |
| shape | one standalone window, one table | window **and** side panel, `notes` + `kv` |
| pick it when | you want the smallest thing that installs | you want a panel, module context, or the patterns spelled out |

Everything below applies to both; where a step names a file only EXT has, skip
it on PGI.

**Stop if you are in the template repo itself** (`git remote -v` says
`ZYDRAXYL/DraconDex-PGI-Template` or `-EXT-Template`). Those two are chain
repos; this skill is for a *copy*.

## 1. Choose the id first

`^[a-z0-9_]{1,20}$`. It becomes the prefix of every table
(`plg_<id>_<name>`), so **changing it later abandons the user's data** — the
old tables are orphaned, not migrated, and nothing in the API can still reach
them. This is the one decision in the repo that is expensive to revisit.

Pick something specific (`wordcount`, `timeline_ai`), not `plugin` or `test`.

## 2. Apply it

The demo id appears in exactly one place that matters — `dracondex-plugin.json`
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
npm run validate        # the "id is still …" warning should be gone
```

## 3. Replace the demo tables

`notes` and `kv` are demonstrations. Declare what you actually need — max 10
tables, 25 columns, types `TEXT`/`INTEGER`/`REAL` only, no reserved names
(`id`, `rowid`, `oid`, `_rowid_`).

**Keep a `kv`-shaped table if you ship a panel.** It is not filler: a
DraconDex 5 side panel survives page changes but is destroyed when the user
closes it or quits, and on a 4.x host it is reloaded on every pane re-render.
State that only lives in a variable is lost either way. The autosaved draft in
EXT's `app.js` is the worked example — delete the notes demo, keep that
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

The panel button lives on the page's address row, so it shows while a page is
open; the panel then stays open across pages and hears about each page change
through a `context` message (if it declared `permissions.context`). The host
draws its header and close button — do not draw your own in `panel.html`.

Adding a panel to a PGI copy: copy EXT's `panel.html` and the `IS_PANEL` /
`wireContext()` parts of its `app.js`, add the `panels` entry and the file to
`files`, and run `npm run validate`.

## 5. Remove the chain furniture

The templates sit at the tail of the DraconDex chain (`EXE > PGI, EXT`); your
copy does not. Delete what only means something there:

```bash
rm -rf chain/ tools/chain-lib.mjs tools/chain-survey.mjs tools/chain-propagate.mjs
rm -rf .claude/skills/chained-supporter .claude/skills/chained-updated \
       .claude/skills/multi-repository-architecture \
       .claude/agents/chained-supporter.md .claude/agents/chained-updated.md
```

The `extension-*` skills and `extension-reviewer` stay — they are about the
platform. Each carries a "mirrored from DraconDex-APP, do not edit here" note;
in your copy that note is no longer true, so delete it (the block between the
frontmatter and the first heading). They are yours now.

**Keep** the plugin contract: `tools/plugin-manifest.cjs` (the app's own
validator, byte-identical), `tools/validate-manifest.mjs`,
`tools/plugin-contract.mjs` and `plugin-contract.lock.json`. When a new
DraconDex release lands, `node tools/plugin-contract.mjs --upstream` says
whether the contract moved; `--vendor --ref vX.Y.Z` moves your pin.

## 6. Strip the teaching scaffolding

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
| the OS light/dark CSS | no app theme reaches an extension window; there is no variable to read. The palette is DraconDex 5's own `daylight`/`midnight` |
| the drawn title bar in `index.html` | plugin windows are frameless — without it the window cannot be moved or closed |
| `tools/plugin-manifest.cjs` + the lock | `npm run validate` is only as right as the copy it runs |
| `window.extApi` fallback | one line, keeps pre-v4.2.0 hosts working |

## 7. Declare permissions last, and only what you call

Start with none. Add an origin to `permissions.net` when a line of code
actually fetches it — every origin is shown to the user before they accept, and
letting the main process fetch on your behalf is a genuine capability, not a
convenience. Add `permissions.context: ["module"]` only if a panel reads the
open module's identity.

## 8. Ship

```bash
npm run validate
npm run contract       # the vendored contract is intact
node --check app.js
git commit && git push -u origin <branch>
```

Then install it in DraconDex from the pushed branch and confirm the preview
card shows the tables, panels and origins you meant. See the
`extension-publish` skill for the rest.
