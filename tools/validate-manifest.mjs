#!/usr/bin/env node
// Validate dracondex-plugin.json the way DraconDex itself does, before you
// push — because the app validates AFTER resolving your repo over the network,
// so the alternative feedback loop is "commit, push, paste the link, read a
// toast".
//
//   node tools/validate-manifest.mjs
//   node tools/validate-manifest.mjs path/to/dracondex-plugin.json
//
// The rules below are a deliberate re-statement of
// electron/src/db/plugin-manifest.js in DraconDex-EXE (v4.17.0). They are NOT
// imported from it — this repo has no dependency on the app — so if the app
// ever tightens a limit, this file is the thing that goes stale. When a real
// install rejects a manifest this script passed, believe the app and fix the
// constants here.
//
// It also checks two things the app cannot: that every path in `files` exists
// in this working tree, and that nothing runtime-looking was left out of it.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const PLUGIN_ID_RE = /^[a-z0-9_]{1,20}$/;
const PLUGIN_TABLE_RE = /^[a-z0-9_]{1,20}$/;
const PLUGIN_COLUMN_RE = /^[a-z][a-z0-9_]{0,29}$/;
const PANEL_ID_RE = /^[a-z0-9_-]{1,24}$/;
const COL_TYPES = new Set(['TEXT', 'INTEGER', 'REAL']);
const RESERVED_COLS = new Set(['id', 'rowid', 'oid', '_rowid_']);
const CONTEXT_KINDS = new Set(['module']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const MAX_TABLES = 10;
const MAX_COLS = 25;
const MAX_FILES = 30;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PANELS = 5;
const MAX_PANEL_TITLE = 40;
const MAX_PANEL_ICON = 8;
const MAX_NET_ORIGINS = 10;
const MAX_DEPENDENCIES = 5;
const MAX_NAME = 80;
const MAX_VERSION = 40;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// Same shape rule the app applies: an https:// origin and nothing else, or an
// http:// loopback origin that names an explicit port. A path or query in the
// allowlist is rejected so the runtime check can stay an `origin ===` compare —
// prefix-matching a full URL would let api.example.com.evil.test satisfy
// https://api.example.com/safe.
function normalizeNetOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  let u;
  try { u = new URL(value); } catch { return null; }
  const loopback = LOOPBACK_HOSTS.has(u.hostname) && u.port !== '';
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && loopback))) return null;
  if (u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  return u.origin;
}

function checkTables(tables) {
  if (tables == null) return;
  if (!Array.isArray(tables)) return err('"tables" must be an array');
  if (tables.length > MAX_TABLES) err(`too many tables: ${tables.length} > ${MAX_TABLES}`);
  const seen = new Set();
  for (const t of tables) {
    const name = String(t?.name ?? '');
    if (!PLUGIN_TABLE_RE.test(name)) { err(`invalid table name: ${JSON.stringify(t?.name)} (lowercase a-z 0-9 _, 1-20 chars)`); continue; }
    if (seen.has(name)) err(`duplicate table name: ${name}`);
    seen.add(name);

    const cols = Array.isArray(t.columns) ? t.columns : [];
    if (!cols.length || cols.length > MAX_COLS) err(`table "${name}" must have 1-${MAX_COLS} columns, has ${cols.length}`);
    const seenCols = new Set();
    for (const c of cols) {
      const cname = String(c?.name ?? '');
      if (!PLUGIN_COLUMN_RE.test(cname)) { err(`table "${name}": invalid column name ${JSON.stringify(c?.name)} (must start a-z, then a-z 0-9 _, max 30)`); continue; }
      if (RESERVED_COLS.has(cname.toLowerCase())) err(`table "${name}": "${cname}" is reserved — every row already has an "id"`);
      if (!COL_TYPES.has(String(c?.type ?? '').toUpperCase())) err(`table "${name}".${cname}: type must be TEXT, INTEGER or REAL (got ${JSON.stringify(c?.type)})`);
      if (seenCols.has(cname)) err(`table "${name}": duplicate column ${cname}`);
      seenCols.add(cname);
    }
  }
}

function checkPanels(panels, files) {
  if (panels == null) return;
  if (!Array.isArray(panels)) return err('"panels" must be an array');
  if (panels.length > MAX_PANELS) err(`too many panels: ${panels.length} > ${MAX_PANELS}`);
  const seen = new Set();
  for (const p of panels) {
    const id = String(p?.id ?? '');
    if (!PANEL_ID_RE.test(id)) { err(`invalid panel id: ${JSON.stringify(p?.id)}`); continue; }
    if (seen.has(id)) err(`duplicate panel id: ${id}`);
    seen.add(id);
    if (!p.title || typeof p.title !== 'string' || p.title.length > MAX_PANEL_TITLE) err(`panel "${id}": title required, max ${MAX_PANEL_TITLE} chars`);
    if (p.icon != null && (typeof p.icon !== 'string' || p.icon.length > MAX_PANEL_ICON)) err(`panel "${id}": icon max ${MAX_PANEL_ICON} UTF-16 units`);
    if (!p.entry || typeof p.entry !== 'string' || !/\.html?$/i.test(p.entry)) { err(`panel "${id}": needs an .html "entry"`); continue; }
    // The app downloads only what "files" lists, so a panel entry outside it
    // could never be loaded — it is rejected at install, not at first open.
    if (!files.includes(p.entry)) err(`panel "${id}": entry "${p.entry}" is not in "files"`);
  }
}

function checkPermissions(permissions) {
  if (permissions == null) return;
  if (typeof permissions !== 'object' || Array.isArray(permissions)) return err('"permissions" must be an object');
  const { net, context } = permissions;
  if (net != null) {
    if (!Array.isArray(net)) return err('"permissions.net" must be an array');
    if (net.length > MAX_NET_ORIGINS) err(`too many net origins: ${net.length} > ${MAX_NET_ORIGINS}`);
    for (const o of net) {
      if (!normalizeNetOrigin(o)) err(`invalid net origin: ${JSON.stringify(o)} — https:// origin with no path, or http:// loopback WITH a port`);
    }
    if (net.length) warn(`declares ${net.length} network origin(s) — every one is shown to the user in the install preview, so drop any you do not actually call`);
  }
  if (context != null) {
    if (!Array.isArray(context)) return err('"permissions.context" must be an array');
    for (const k of context) if (!CONTEXT_KINDS.has(k)) err(`unknown context permission: ${JSON.stringify(k)} (only "module")`);
  }
}

function checkDependencies(dependencies) {
  if (dependencies == null) return;
  if (!Array.isArray(dependencies)) return err('"dependencies" must be an array');
  if (dependencies.length > MAX_DEPENDENCIES) err(`too many dependencies: ${dependencies.length} > ${MAX_DEPENDENCIES}`);
  const seen = new Set();
  for (const d of dependencies) {
    if (typeof d !== 'string' || !d.trim()) { err(`invalid dependency: ${JSON.stringify(d)}`); continue; }
    // Loose shape check only; the app's parseRepoUrl is the authority and
    // accepts more forms than are worth reimplementing here.
    const key = d.trim().toLowerCase().replace(/\.git$/, '');
    if (seen.has(key)) err(`duplicate dependency: ${d}`);
    seen.add(key);
  }
}

// Files listed in the manifest must exist here, and files that look like part
// of the runtime must be listed. The second half is the one that actually
// bites: a stylesheet left out of "files" is not downloaded, and the extension
// loads unstyled with no error anywhere.
const RUNTIME_EXT = /\.(html?|js|mjs|css|svg|png|jpe?g|gif|webp|json|woff2?)$/i;
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.claude', 'tools', 'docs']);
const IGNORED_FILES = new Set(['dracondex-plugin.json', 'dracondex-extension.json', 'package.json', 'package-lock.json']);

function walk(dir, root, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, root, out);
    else out.push(relative(root, p).split(sep).join('/'));
  }
  return out;
}

function checkFilesOnDisk(files, root) {
  let total = 0;
  for (const f of files) {
    const p = join(root, f);
    if (!existsSync(p)) { err(`"files" lists ${f}, which does not exist in this repo`); continue; }
    const size = statSync(p).size;
    total += size;
    if (size > MAX_FILE_BYTES) err(`${f} is ${(size / 1048576).toFixed(2)}MB — the per-file limit is 2MB`);
  }
  const present = walk(root, root);
  for (const p of present) {
    if (files.includes(p) || IGNORED_FILES.has(p)) continue;
    if (RUNTIME_EXT.test(p)) warn(`${p} looks like a runtime file but is not in "files" — it will NOT be downloaded`);
  }
  if (!existsSync(join(root, '.dracondex'))) {
    warn('no .dracondex marker at the repo root — the app will not offer this repo in its "install from @ZYDRAXYL" list (pasting the link still works)');
  }
  return total;
}

function main() {
  const arg = process.argv[2];
  const manifestPath = resolve(arg || 'dracondex-plugin.json');
  const root = resolve(manifestPath, '..');

  if (!existsSync(manifestPath)) {
    console.error(`no manifest at ${manifestPath}`);
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error(`${manifestPath} is not valid JSON: ${e.message}`);
    process.exit(2);
  }

  const { id, name, version, entry, files, tables, panels, permissions, dependencies } = manifest;

  if (!PLUGIN_ID_RE.test(String(id ?? ''))) err(`invalid "id": ${JSON.stringify(id)} — lowercase a-z 0-9 _ only, 1-20 chars`);
  if (id === 'ext_template') warn('"id" is still ext_template — change it before publishing, or this extension collides with every other copy of the template');
  if (!name || typeof name !== 'string' || name.length > MAX_NAME) err(`invalid "name" (required, max ${MAX_NAME} chars)`);
  if (version != null && (typeof version !== 'string' || version.length > MAX_VERSION)) err(`invalid "version" (string, max ${MAX_VERSION} chars)`);
  if (!entry || typeof entry !== 'string') err('invalid or missing "entry"');

  const fileList = Array.isArray(files) ? files : [];
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) {
    err(`"files" must be a non-empty array of at most ${MAX_FILES} paths`);
  }
  for (const f of fileList) {
    if (typeof f !== 'string' || !f || f.includes('..') || f.startsWith('/') || f.includes('\\')) {
      err(`unsafe file path: ${JSON.stringify(f)} — repo-relative, forward slashes, no ".."`);
    }
  }
  if (entry && !fileList.includes(entry)) err(`"entry" (${entry}) must also be listed in "files"`);

  checkTables(tables);
  checkPanels(panels, fileList);
  checkPermissions(permissions);
  checkDependencies(dependencies);
  const total = errors.length ? 0 : checkFilesOnDisk(fileList.filter((f) => typeof f === 'string'), root);

  for (const w of warnings) console.log(`warn   ${w}`);
  for (const e of errors) console.log(`ERROR  ${e}`);

  if (errors.length) {
    console.log(`\n${errors.length} error(s) — DraconDex would refuse to install this.`);
    process.exit(1);
  }
  console.log(`\nok — ${fileList.length} file(s), ${(total / 1024).toFixed(1)}KB total, ${(tables?.length ?? 0)} table(s), ${(panels?.length ?? 0)} panel(s)${warnings.length ? `, ${warnings.length} warning(s)` : ''}.`);
}

main();
