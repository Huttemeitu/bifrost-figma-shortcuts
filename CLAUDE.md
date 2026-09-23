# Bifrost Figma Shortcuts Plugin

A Figma plugin that binds Bifrost design tokens (fill colors, spacing, radius, text styles) to selected objects via menu commands, so they can be bound to macOS keyboard shortcuts (and from there, a Stream Deck).

Full context and setup steps are in `README.md` (written in Norwegian, matches the rest of the repo). This file is for working on the plugin itself.

## Architecture: this is a generator, not a hand-written app

Nothing here has a build step. Figma runs `code.js` directly. But `code.js` and `manifest.json` are meant to be *generated*, not edited by hand, from two data sources:

```
bifrost-variables.json + bifrost-text-styles.json
        │  node generate.js
        ▼
manifest.json + code.js
        │  node gen-scripts.js
        ▼
setup-shortcut-placeholders.sh + undo-shortcuts.sh
```

- `bifrost-variables.json` / `bifrost-text-styles.json`: raw exports pulled from Figma's plugin console (see README step 4 for the exact console snippets).
- `generate.js`: classifies variables (COLOR → fill, `Spacing/*` → padding + gap, `Border radius/*` → radius) and text styles, then emits `manifest.json` (menu structure) and `code.js` (a `VARIABLE_MAP` slug → `{id, key, name, kind, type}` lookup, plus the runtime logic that applies each kind to the current selection).
- `gen-scripts.js`: reads `manifest.json`'s menu list and emits the two `.sh` files, one placeholder row per menu command.

## Generator is authoritative (as of 2026-09-22)

`generate.js`'s `codeJs` template now includes the padding/radius field-picker popup (`FIELD_SETS`, `buildPickerHtml`, `promptFieldChoice`, `applyFieldsToSelection`, `applyPaddingOrRadius`, and the `withSelectionGuard(variable, nodes, fn)` signature). Running `node generate.js bifrost-variables.json . bifrost-text-styles.json` reproduces the current `code.js` byte-for-byte (verified by diffing generator output against the committed file).

**When adding runtime features to `code.js` by hand again, port them into `generate.js`'s template string in the same change** (or immediately after), so the two don't drift apart again. Verify with a diff against fresh generator output before committing, the same check used here.

## File map

| File | Role |
|---|---|
| `manifest.json` | Figma plugin manifest, defines every menu command (generated) |
| `code.js` | Plugin runtime logic, run directly by Figma (generated + hand-edited, see above) |
| `bifrost-variables.json` | Raw variable export from Figma (colors, spacing, radius) |
| `bifrost-text-styles.json` | Raw text style export from Figma |
| `generate.js` | Produces `manifest.json` + `code.js` from the two JSON files above |
| `gen-scripts.js` | Produces the two `.sh` files from `manifest.json` |
| `setup-shortcut-placeholders.sh` | Adds empty placeholder rows to macOS System Settings so shortcuts can be bound |
| `undo-shortcuts.sh` | Deletes selected rows permanently (destructive by default, comment out lines with `#` to keep them) |

No `package.json`, no `node_modules`, no test suite. Node is only used to run the two generator scripts locally.

## Working with the macOS shortcut scripts

These write directly to Figma's preferences plist (`~/Library/Preferences/com.figma.Desktop.plist` via `defaults`/`PlistBuddy`). Treat them as destructive:

- Always fully quit System Settings (Cmd+Q) before running either script. If it's open, it caches old state and overwrites the script's changes on quit.
- Both scripts take an automatic backup first (`~/figma-shortcuts-backup-<timestamp>.plist`). Restore with `defaults import com.figma.Desktop <backup-file>`.
- Menu command *names* can't contain `:` (PlistBuddy's path separator, also breaks macOS's own shortcut matching). `generate.js` uses `" - "` instead.
- `setup-shortcut-placeholders.sh` is idempotent (uses PlistBuddy `Add`, which fails harmlessly if the row exists), so it never clobbers a shortcut you've already bound.
- `undo-shortcuts.sh` deletes every row in its list unless commented out with `#`. Currently a subset of `Text - ...` rows are commented out on purpose (curated placeholder set), don't uncomment them without checking why they were excluded.
- Bundle ID is assumed to be `com.figma.Desktop`. Verify with `osascript -e 'id of app "Figma"'` if things stop matching.

## Deploying to Figma

Figma runs the plugin from a local folder registered via **Plugins → Development → New Plugin**, not from this repo directly. After changing `code.js`/`manifest.json`, copy them into that registered folder and re-run the plugin once from Figma to confirm it still resolves variables (variables are looked up by global `key` first, so this usually works unchanged across files/libraries using the same published Bifrost library).

## Conventions

- All user-facing text (menu names, `figma.notify` messages, popup HTML) and code comments are in Norwegian, matching the existing style. Keep new additions consistent.
- Comments in `code.js` explain non-obvious *why* (e.g. the selection-snapshot comment in `applyPaddingOrRadius`), not what the code does.
