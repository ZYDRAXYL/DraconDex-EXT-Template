---
name: extension-api
description: The `window.pluginApi` runtime surface available to a DraconDex extension — table CRUD and what its filters can and cannot express, `net.fetch`/`net.stream` and their limits, the PKCE OAuth helper, and the panel↔host message protocol — plus what is deliberately absent (no window.api, no Node, no fs, no raw SQL) and how a DraconDex 5 side panel lives and dies (opened once, survives page changes, context pushed on every page change, gone on close). Use when writing or debugging extension code, when a table call throws "not an owned table" or "unknown column", when a panel loses its state, shows a stale module, or never receives context, when adding a network or OAuth call, or when asked "เขียนโค้ดปลั๊กอินยังไง", "pluginApi ใช้ยังไง", "why does my panel reset".
---

<!-- mirrored-from-app: do not edit here -->
> **Mirrored file — edit this in `ZYDRAXYL/DraconDex-APP`, not here.**
> `tools/mirror-claude.mjs` regenerates it and any local edit is lost on the
> next mirror. ดูสัญญาของ chain ที่ `chain/README.md`

# `window.pluginApi`

The entire capability an installed extension gets. `window.extApi` is the same
object under its pre-v4.2.0 name and is kept indefinitely.

```js
const api = window.pluginApi || window.extApi;
```

Every call crosses IPC and **rejects** on failure — it does not return an error
object. Wrap them; the rejection message is the actual bug report.

## What is not there

No `window.api`. No `require`, no Node, no `fs`, no child process. No raw SQL
of any kind. No access to the app's tables or to another extension's.

This is structural, not a runtime check: the extension window is given
`preload-plugin.js` instead of the app's `preload.js`, and every
`pluginapi:table:*` handler resolves *which* extension is calling from the
webContents itself, never from an argument. Passing another extension's id
changes nothing. Do not write code that probes for these or tries to route
around them.

## table

```js
await api.table.getSchema('notes')             // { columns: [{name, type}] }
await api.table.query('notes')                 // all rows, ORDER BY id DESC
await api.table.query('notes', { pinned: 1 })  // equality filter
await api.table.insert('notes', { title: 'x' })    // { id }
await api.table.update('notes', id, { body: 'y' }) // { changes }
await api.table.delete('notes', id)                // { changes }
```

- Names are the **local** names from your manifest (`notes`), not the physical
  `plg_<id>_notes`.
- Every row carries an `id` the app maintains. You cannot declare one.
- Rows come back newest-first and that ordering is not configurable.

**`query` filters are equality-only, ANDed, on declared columns.** There is no
`LIKE`, no range, no `OR`, no `ORDER BY`, no `LIMIT`, no join, no aggregate.
For anything else, read the rows and filter in JS — and if that is too much
data to be reasonable, that is a signal the extension is storing more than an
extension should.

Two rejections you will meet:

| Message | Meaning |
|---|---|
| `not an owned table` | the name is not one of *your* manifest's tables (or the manifest changed without a reinstall) |
| `unknown column: x` | a key in the filter/row object is not a declared column — including a typo |

Values are bound as parameters. Names never are — that is why the character
classes in the manifest are as strict as they are.

## net

```js
const res = await api.net.fetch(url, { method, headers, body });
// { ok, status, statusText, headers, body, truncated }
// { ok:false, code:'network'|'redirect_blocked', error }

const abort = await api.net.stream(url, init, {
  onChunk: (text) => {},
  onEnd:   (res)  => {},   // { ok, status } | { ok:false, code, error }
});
```

Allowed only to origins in `permissions.net`, compared as origins. Beyond that:
`https` only (loopback `http` with an explicit port excepted); method in
`GET/POST/PUT/PATCH/DELETE/HEAD`; `Cookie`/`Host`/`Origin`/`Referer` headers
are stripped; `body` must be a **string**; 120s timeout; response capped at 8MB
and flagged `truncated` past it; a redirect leaving the allowlist is refused;
**no cookie jar** — nothing shares the app's Electron session.

`net.stream` resolves to an `abort()`. Call it when the user cancels or the page
unloads (`beforeunload`) — the main process otherwise keeps reading a response
nobody will receive.

## oauth

```js
const { code, redirectUri, verifier, state } = await api.oauth.authorize({
  authorizeUrl, clientId, scope, extraParams
});
```

The app opens the system browser and catches the redirect, because an extension
page cannot open a loopback listener. **You** exchange `code` + `verifier` for
a token with `net.fetch` — so the token endpoint's origin must be in
`permissions.net`, and a client secret never passes through the main process.

Store the result in your own table, and remember it is plain SQLite with no
encryption anywhere in this app. An extension that keeps a token should say so
in its README.

## panel

Only meaningful when the page is running as a panel. Detect it rather than
assuming — EXT's `app.js` uses `document.body.classList.contains('panel')`.

```js
const off = api.panel.onMessage((msg) => {
  if (msg?.type === 'context') { /* msg.context or null — may arrive at ANY time */ }
});
api.panel.send({ type: 'getContext' });
api.panel.close();
```

`getContext` answers `{ moduleId, moduleName, kind }` or `null`. It is `null`
when no module is open **and** when `permissions.context` does not include
`"module"` — so handle `null` either way. It is identity only; module content
never crosses this channel.

**Since DraconDex 5 the host also sends `context` unasked**, every time the
user moves to another page while the panel is open (`pushPluginContext` in
EXE). Register `onMessage` once at start-up and keep it for the life of the
page; treat every `context` message as "the user is now looking at this". A
panel that reads context once at boot shows the wrong module after the first
page change. Ask with `getContext` once at start-up too — a push only happens
on a *change*.

`onMessage` returns an unsubscribe; call it on `beforeunload`.

## How a panel lives and dies (DraconDex 5)

The Module Inspector dock is gone (v5 Part 8, APP `docs/V5.md` §12.8). A panel
opens in the **side panel** beside the page, from its button on the page's
address row (or the command palette):

- **Created once, when the user opens it.** The `<webview>` is built with
  `createElement` and never rebuilt by a page render — editing a tag, adding a
  block, switching module: none of them reload it any more.
- **It stays open across pages.** It is not scoped to the module it was opened
  on; the context push above is how it learns the page changed.
- **Closing it destroys it.** The side panel's × , `panel.close()`, opening a
  *different* plugin's panel (one at a time), uninstalling — the webview is
  removed, and the next open starts from scratch. Quitting the app does the
  same.
- Focus mode (Ctrl+Shift+F) hides the side panel without closing it.
- The side panel is **220–640px wide** (user-resizable, default 300). Design
  for 220.

So the old rule — "every pane re-render reloads the panel, persist on every
keystroke" — is gone, but the reason behind it is not: anything the user would
be annoyed to lose when they **close the panel or quit** still goes into a
table and is read back on load. EXT's `app.js` does this for the draft textarea
through its `kv` table; that is the pattern to copy.

On a **DraconDex 4.x** host the panel still replaces the Inspector dock and is
reloaded on every pane re-render. Code that persists eagerly works on both;
code that relies on v5's lifetime loses state on 4.x.

`net.stream` is the one thing still lost on close: the stream dies with the
webview. Write the user's message to a table *before* the request goes out and
the reply when the stream ends, so a close mid-stream loses at most the reply.

## Rendering

Table rows and network responses are text, not markup. Build nodes and assign
`.textContent`. There is no `innerHTML` in the templates and every HTML entry
ships a CSP (`default-src 'none'; script-src 'self'; style-src 'self'`) that
blocks inline script, inline `style=""` attributes, a CDN and a remote font — only files listed in the manifest's `files` are
downloaded, so remote anything is an unreviewable fetch on every launch.

## Debugging

You cannot run an extension from this repo; it only runs installed. The loop
is: `npm run validate` (the app's own `validateManifest`, vendored — see the
`extension-manifest` skill), push, reinstall from the branch, open DevTools on
the extension window. To exercise the real app around it, that is a DraconDex-EXE
session with the `run-dracondex` skill.

If `api` is undefined the page is open in a plain browser — say that, rather
than throwing a stack trace nobody can act on.
