---
name: extension-api
description: The `window.pluginApi` runtime surface available to a DraconDex extension — table CRUD and what its filters can and cannot express, `net.fetch`/`net.stream` and their limits, the PKCE OAuth helper, and the panel↔host message protocol — plus what is deliberately absent (no window.api, no Node, no fs, no raw SQL) and the panel-reload rule that forces state into a table. Use when writing or debugging extension code, when a table call throws "not an owned table" or "unknown column", when a panel loses its state or never receives context, when adding a network or OAuth call, or when asked "เขียนโค้ดปลั๊กอินยังไง", "pluginApi ใช้ยังไง", "why does my panel reset".
---

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

`net.stream` resolves to an `abort()`. Call it when the user navigates away or
the panel closes; a panel that reloads mid-stream otherwise leaves it running.

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

Only meaningful when the page is running as a docked panel. Detect it rather
than assuming — this template uses `document.body.classList.contains('panel')`.

```js
const off = api.panel.onMessage((msg) => {
  if (msg?.type === 'context') { /* msg.context or null */ }
});
api.panel.send({ type: 'getContext' });
api.panel.close();
```

`getContext` answers `{ moduleId, moduleName, kind }` or `null`. It is `null`
when no module is open **and** when `permissions.context` does not include
`"module"` — so handle `null` either way. It is identity only; module content
never crosses this channel.

`onMessage` returns an unsubscribe. Call it on `beforeunload`: the panel
reloads often, and a listener per load is a leak per load.

## The panel-reload rule

**A docked panel is reloaded from scratch every time the main window re-renders
its pane.** Renaming a tag or adding an attribute is enough — the dock is
redrawn whole. Module-scope variables, timers and in-flight requests do not
survive it.

So: anything the user would be annoyed to lose goes into a table on change and
is read back on load. `app.js` does this for the draft textarea through the
`kv` table, and that is the pattern to copy, not decoration.

A standalone window does not have this problem, which is exactly why a bug like
this only shows up once someone docks the panel.

## Rendering

Table rows and network responses are text, not markup. Build nodes and assign
`.textContent`. There is no `innerHTML` in this repo and both HTML entries ship
a CSP (`default-src 'none'; script-src 'self'`) that blocks inline script, a
CDN and a remote font — only files listed in the manifest's `files` are
downloaded, so remote anything is an unreviewable fetch on every launch.

## Debugging

You cannot run an extension from this repo; it only runs installed. The loop
is: `npm run validate`, push, reinstall from the branch, open DevTools on the
extension window. To exercise the real app around it, that is a DraconDex-EXE
session with the `run-dracondex` skill.

If `api` is undefined the page is open in a plain browser — say that, rather
than throwing a stack trace nobody can act on.
