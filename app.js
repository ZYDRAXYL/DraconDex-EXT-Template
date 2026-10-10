'use strict';
/* DraconDex extension template — shared logic for both entries.
 *
 * index.html loads this as a standalone window ("เปิดใช้งาน" in Setting →
 * Plugin → Plugins); panel.html loads the same file in the DraconDex 5 side
 * panel. One file, two hosts: everything host-specific is behind IS_PANEL.
 *
 * The whole capability surface an extension gets is `window.pluginApi`:
 *
 *   table.getSchema(name)          -> { columns: [{name,type}, ...] }
 *   table.query(name, filter?)     -> rows, newest id first; filter is an
 *                                     equality match on declared columns only
 *   table.insert(name, row)        -> { id }
 *   table.update(name, id, row)    -> { changes }
 *   table.delete(name, id)         -> { changes }
 *   net.fetch(url, init)           -> only to permissions.net origins
 *   net.stream(url, init, handlers)-> SSE; resolves to abort()
 *   oauth.authorize(opts)          -> PKCE code via the system browser
 *   panel.send / panel.onMessage / panel.close   (panel host only)
 *
 * There is NO window.api, no Node, no filesystem, no raw SQL. That is
 * structural — the plugin window is handed a different preload entirely
 * (DraconDex-EXE electron/preload-plugin.js) — not a runtime check you can
 * talk your way past. See docs/PLUGINS.md §2.4 in DraconDex-APP for what this
 * sandbox does and does not protect against. */

const api = window.pluginApi || window.extApi; // extApi is the pre-v4.2.0 alias
const IS_PANEL = document.body.classList.contains('panel');

const $ = (sel) => document.querySelector(sel);

/* Text from the tables is text, never markup. Building DOM nodes and assigning
 * .textContent is what keeps it that way; there is deliberately no innerHTML
 * anywhere in this file. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function setStatus(msg) {
  const box = $('#status');
  if (box) box.textContent = msg;
}

/* Every pluginApi call crosses IPC and rejects on the main side for a real
 * reason — an undeclared column, a table this extension does not own. Swallow
 * nothing: surface it, because during development that message IS the bug
 * report. */
async function guard(label, fn) {
  try {
    return await fn();
  } catch (err) {
    setStatus(`${label} failed: ${err?.message || err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// kv — the reason this table exists
// ---------------------------------------------------------------------------
// DraconDex 5 keeps a side panel alive across page changes, but closing it
// (its ×, panel.close(), opening another plugin's panel) or quitting the app
// destroys the page — and on a 4.x host every pane re-render reloaded it.
// Module variables survive none of that. Anything worth keeping goes through a
// table and is read back on load, so the draft box round-trips through `kv`
// instead of living in a closure.
async function kvGet(key) {
  const rows = await guard('read setting', () => api.table.query('kv', { k: key }));
  return rows && rows.length ? rows[0].v : null;
}

async function kvSet(key, value) {
  const rows = await guard('read setting', () => api.table.query('kv', { k: key }));
  if (rows && rows.length) return guard('save setting', () => api.table.update('kv', rows[0].id, { v: value }));
  return guard('save setting', () => api.table.insert('kv', { k: key, v: value }));
}

// ---------------------------------------------------------------------------
// Module context — gated on permissions.context: ["module"]
// ---------------------------------------------------------------------------
// The host answers `getContext` with { moduleId, moduleName, kind } for the
// module currently open, or null. IDENTITY ONLY — never the module's content.
// Without "module" in permissions.context the host replies null every time,
// which is the correct thing to design around rather than assume away.
//
// Since DraconDex 5 the host ALSO sends `context` unasked whenever the user
// moves to another page while the panel is open. So the listener is installed
// once and kept; reading context once at boot would show the wrong module
// after the first navigation.
let current = null; // the last context the host sent; null in a window

function showContext() {
  const box = $('#context');
  if (box) {
    box.textContent = current
      ? `${current.moduleName} · ${current.kind}`
      : 'No module open, or context permission not granted.';
  }
  const heading = $('#notes-heading');
  if (heading) heading.textContent = current ? `Notes — ${current.moduleName}` : 'Notes (no module)';
}

function wireContext() {
  if (!IS_PANEL) return;
  const off = api.panel.onMessage((msg) => {
    if (msg?.type !== 'context') return;
    current = msg.context || null;
    showContext();
    renderNotes();
  });
  window.addEventListener('beforeunload', off);
  // A push only happens on a CHANGE — ask once for the page already open.
  api.panel.send({ type: 'getContext' });
}

// ---------------------------------------------------------------------------
// notes — ordinary CRUD against this extension's own table
// ---------------------------------------------------------------------------
// In the panel, notes are scoped to the open module through an ordinary
// equality filter on a declared column. The window shows them all.
async function renderNotes() {
  const list = $('#notes');
  if (!list) return;
  const filter = IS_PANEL ? { module_id: current ? String(current.moduleId) : '' } : undefined;
  const rows = await guard('load notes', () => api.table.query('notes', filter));
  list.replaceChildren();
  if (!rows || !rows.length) {
    list.append(el('li', 'empty', 'No notes yet — add one above.'));
    return;
  }
  for (const row of rows) {
    const li = el('li', row.pinned ? 'pinned' : null);
    li.append(el('div', 'title', row.title || '(untitled)'));
    if (row.body) li.append(el('div', 'body', row.body));

    const meta = el('div', 'meta');
    const where = !IS_PANEL && row.module_name ? ` · ${row.module_name}` : '';
    meta.append(el('span', 'muted', `${(row.created_at || '').slice(0, 10)}${where}`));

    const pin = el('button', 'ghost', row.pinned ? 'Unpin' : 'Pin');
    pin.addEventListener('click', async () => {
      await guard('pin note', () => api.table.update('notes', row.id, { pinned: row.pinned ? 0 : 1 }));
      renderNotes();
    });

    const del = el('button', 'link', 'Delete');
    del.addEventListener('click', async () => {
      await guard('delete note', () => api.table.delete('notes', row.id));
      renderNotes();
    });

    meta.append(pin, del);
    li.append(meta);
    list.append(li);
  }
}

async function addNote() {
  const titleInput = $('#title');
  const bodyInput = $('#body');
  const title = titleInput.value.trim();
  if (!title) { setStatus('A note needs a title.'); return; }

  // `created_at` is declared TEXT: SQLite has no date type here, and the
  // manifest only offers TEXT/INTEGER/REAL. ISO-8601 sorts lexicographically,
  // so storing the string costs nothing and stays comparable. module_id is
  // TEXT too — an id from the host is an opaque key, never arithmetic.
  const res = await guard('add note', () => api.table.insert('notes', {
    title,
    body: bodyInput.value.trim(),
    created_at: new Date().toISOString(),
    pinned: 0,
    module_id: IS_PANEL && current ? String(current.moduleId) : '',
    module_name: IS_PANEL && current ? current.moduleName : '',
  }));
  if (!res) return;

  titleInput.value = '';
  bodyInput.value = '';
  await kvSet('draft', '');
  setStatus(`Saved note #${res.id}.`);
  renderNotes();
}

// ---------------------------------------------------------------------------
// net — declared origins only
// ---------------------------------------------------------------------------
// This template declares NO permissions.net, on purpose: an extension should
// ship with the smallest grant that works, and the install preview shows every
// origin you list to the user before they accept. To call out, add the ORIGIN
// (scheme + host + port, no path) to permissions.net in dracondex-plugin.json:
//
//   "permissions": { "net": ["https://api.example.com"] }
//
// A rejected origin still fails here — the main process re-checks on every
// call, so editing the manifest after install changes nothing until reinstall.
async function probeNet() {
  const url = $('#net-url')?.value.trim();
  if (!url) return;
  setStatus('Requesting…');
  const res = await guard('net.fetch', () => api.net.fetch(url, { method: 'GET' }));
  if (!res) return;
  setStatus(res.ok
    ? `HTTP ${res.status} · ${String(res.body || '').length} bytes${res.truncated ? ' (truncated)' : ''}`
    : `Blocked or failed: ${res.code || res.status} ${res.error || ''}`.trim());
}

// ---------------------------------------------------------------------------
async function main() {
  if (!api) {
    // Opening these files in a normal browser lands here. Say so plainly
    // rather than throwing a stack trace nobody can act on.
    document.body.replaceChildren(el('p', 'hint',
      'window.pluginApi is missing. This page only runs inside DraconDex — install the repo through Setting → Plugin → Plugins.'));
    return;
  }

  // Frameless window: our own close button. The panel has none — the side
  // panel's header closes it (or call api.panel.close() from your own UI).
  $('#close-window')?.addEventListener('click', () => window.close());
  $('#add')?.addEventListener('click', addNote);
  $('#probe')?.addEventListener('click', probeNet);

  // Restore the draft the last session left behind, then keep saving it. This
  // is the persistence lesson made concrete — delete it and the box empties
  // itself every time the panel is closed and reopened.
  const draft = await kvGet('draft');
  if (draft && $('#body')) $('#body').value = draft;
  $('#body')?.addEventListener('input', (e) => kvSet('draft', e.target.value));

  wireContext();
  await renderNotes();
  setStatus(IS_PANEL ? 'Panel ready.' : 'Window ready.');
}

main();
