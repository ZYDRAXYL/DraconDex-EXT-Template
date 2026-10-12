---
name: extension-publish
description: Get a DraconDex extension installable and keep it that way — the `.dracondex` marker and how the in-app "install from @ZYDRAXYL" list actually decides what to show, which link shapes the install box accepts, what the preview card does and does not prove, what a version bump does to an installed copy (nothing, without a reinstall), and how to declare another extension as a dependency. Use before the first install, when a repo does not appear in the app's recommend list, when an install is refused with `no_manifest`/`unsupported_host`, when shipping an update, or when asked "ติดตั้งไม่ได้", "ไม่ขึ้นในรายการ", "ปล่อยเวอร์ชันใหม่ของปลั๊กอิน", "publish this extension".
---

<!-- mirrored-from-app: do not edit here -->
> **Mirrored file — edit this in `ZYDRAXYL/DraconDex-APP`, not here.**
> `tools/mirror-claude.mjs` regenerates it and any local edit is lost on the
> next mirror. ดูสัญญาของ chain ที่ `chain/README.md`

# Publishing an extension

There is no registry, no build and no release artifact. A pushed branch with a
valid manifest **is** the distribution.

## Before the first install

```bash
npm run validate
npm run contract
node --check app.js
```

Then push, paste the repo link into **Setting → Plugin → Plugins** (DraconDex 5
merged the old "Plugins" and "Plugin settings" pages into one), read the
preview, confirm.

## Which DraconDex it is for

`plugin-contract.lock.json` names the EXE release whose rules `npm run
validate` enforces. Before shipping against a newer app:

```bash
node tools/plugin-contract.mjs --upstream            # did the contract move?
node tools/plugin-contract.mjs --vendor --ref v5.2.0 # move the pin, re-validate
```

A `review electron/preload-plugin.js` line means the `pluginApi` surface itself
changed — read the diff in DraconDex-EXE before assuming your code still
works.

## The link box

Any of these resolve:

| Shape | Example |
|---|---|
| short | `acme/my-ext` (assumed GitHub) |
| https | `https://github.com/acme/my-ext`, with or without `.git` |
| ssh/scp | `git@github.com:acme/my-ext.git` |
| no scheme | `github.com/acme/my-ext` |
| branch | `https://github.com/acme/my-ext/tree/dev` (a branch may contain `/`) |
| GitLab | `https://gitlab.com/group/sub/my-ext`, `/-/tree/dev` |

**github.com and gitlab.com only.** Self-hosted GitLab, Bitbucket and anything
else are refused with `unsupported_host` — it is a host allowlist, not a
protocol check, so there is no workaround.

With no branch in the link the app tries `main`, then `master`. For manifest
filename it tries `dracondex-plugin.json`, then `dracondex-extension.json`.

Working on a feature branch? Paste the `/tree/<branch>` link — that is the
supported way to test before merging.

## Install errors, and what they mean

| Code | Cause |
|---|---|
| `no_manifest` | no manifest on any tried ref — wrong branch, or the file is not at the repo root |
| `unsupported_host` | not github.com or gitlab.com |
| `network` | the fetch failed — distinct from `no_manifest` on purpose, so "no internet" is never reported as "wrong repo" |
| a validation message | the manifest is wrong; `npm run validate` reproduces it offline |

If the repo is private, the raw fetch is unauthenticated and gets a 404 — which
surfaces as `no_manifest`. An extension repo has to be public.

## The recommend list

The app offers a default list of installable repos under **@ZYDRAXYL**. To
appear, a repo must:

- be **public** and **not archived**
- **not** be a GitHub template repo (`is_template`)
- **not** be named as one of the app's known template repos — it excludes
  `dracondex-pgi-template` and `dracondex-ext-template` by name, unconditionally
- carry a **`.dracondex` file at the repo root**

That last one is the opt-in, which is why the template ships it: a repo copied
from the template already qualifies. The app checks only that the file
**exists** — contents are never parsed, and it is never fetched during an
install. `dracondex-plugin.json` remains the only file that decides anything.

The whole list is advisory and fails closed per repo: a rate limit or a network
blip just drops a repo from it, silently, with no error toast. Not appearing is
never a reason to block on it — pasting the link always works.

This applies to the `ZYDRAXYL` account only. An extension published elsewhere
is installed by link, and that is a complete distribution story.

## What the preview card proves

That the manifest resolves, and what it declares: name, version, id,
host/owner/repo@ref, entry, the file list, the tables to be created, the panels
to be embedded, the network origins to be allowed, and any dependencies.

**It proves nothing about the code.** There is no review, no signing, no static
analysis. The preview is also not a trust boundary in the technical sense:
`pluginInstall(url)` re-resolves and re-validates from the URL alone and
ignores whatever the preview held, so a stale or tampered preview cannot widen
what gets installed.

Say this plainly in your own README if your extension stores a token or calls
out to a service. Extension tables are plain SQLite — there is no encrypted
store anywhere in this app.

## Shipping an update

Push to the branch users installed from. That is it — and it is also the catch:

**An installed copy does not update itself, and there is no update check for
extensions.** Bumping `version` changes what the *preview* shows, nothing else.
Until the user reinstalls, the old files and the **old schema** are what runs.
So a new table or column does not exist for anyone who installed before you
added it.

Which means: treat schema as append-only, and have code tolerate a table it
declared but an older install never created — `getSchema` rejecting with `not
an owned table` is the signal.

Uninstall is destructive and final: files **and tables** are deleted, with no
export step first.

## Dependencies

To have another extension installed alongside yours:

```json
"dependencies": ["https://github.com/ZYDRAXYL/DraconDex-PGI-AINative"]
```

Max 5, no duplicate repos, cannot name your own id. Any link shape above works.

The preview shows them in a separate **"ติดตั้งมาด้วย"** block with whether each
is already present, and one confirmation installs the missing ones before
yours.

Resolved **one level deep** — a dependency's own `dependencies` are recorded
but never auto-installed, so there is no chain and no cycle to detect.

Since v4.9.0 a dependency that fails does **not** block your install. It blocks
**launch**: the button is disabled, `plugin:launch` refuses with
`missing_dependency`, the panel button on the page's address row stays hidden, and the user gets a
Download button per missing dependency. Design for running without it only in
the sense of failing clearly — the app will not start you without it.

There is no runtime API to install an extension from inside a running one, by
design.
