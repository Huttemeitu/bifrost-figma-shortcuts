# Bifrost Figma Shortcuts Plugin

A Figma plugin that binds Bifrost design tokens (fill colors, spacing, radius, text styles) to selected objects, and inserts Bifrost components, via menu commands, so they can be bound to macOS keyboard shortcuts (and from there, a Stream Deck).

Full context and setup steps are in `README.md`. This file is for working on the plugin itself.

## Architecture: this is a generator, not a hand-written app

Nothing here has a build step. Figma runs `code.js` directly. But `code.js` and `manifest.json` are meant to be *generated*, not edited by hand, from three data sources:

```
bifrost-variables.json + bifrost-text-styles.json + bifrost-components.json
        │  node generate.js
        ▼
manifest.json + code.js
        │  node gen-scripts.js
        ▼
setup-shortcut-placeholders.sh + undo-shortcuts.sh
```

- `bifrost-variables.json` / `bifrost-text-styles.json` / `bifrost-components.json`: raw exports pulled from Figma's plugin console (see README step 4 for the exact console snippets). Components come from a different file (the Bifrost "Components" library) than variables and text styles.
- `generate.js`: classifies variables (COLOR → fill, `Spacing/*` → padding + gap, `Border radius/*` → radius) text styles and components, then emits `manifest.json` (menu structure) and `code.js` (a `VARIABLE_MAP` slug → `{id, key, name, kind, type, isSet?}` lookup, plus the runtime logic that applies each kind to the current selection).
- `gen-scripts.js`: reads `manifest.json`'s menu list and emits the two `.sh` files, one placeholder row per menu command.

## Generator is authoritative (as of 2026-09-22)

`generate.js`'s `codeJs` template now includes the padding/radius field-picker popup (`FIELD_SETS`, `buildPickerHtml`, `promptFieldChoice`, `applyFieldsToSelection`, `applyPaddingOrRadius`, and the `withSelectionGuard(variable, nodes, fn)` signature). Running `node generate.js bifrost-variables.json . bifrost-text-styles.json bifrost-components.json` reproduces the current `code.js` byte-for-byte (verified by diffing generator output against the committed file).

**When adding runtime features to `code.js` by hand again, port them into `generate.js`'s template string in the same change** (or immediately after), so the two don't drift apart again. Verify with a diff against fresh generator output before committing, the same check used here:

```bash
T=$(mktemp -d) && node generate.js bifrost-variables.json "$T" bifrost-text-styles.json bifrost-components.json \
  && diff "$T/code.js" code.js && diff "$T/manifest.json" manifest.json
```

The preferred workflow is the reverse: edit `generate.js`, then regenerate `code.js` + `manifest.json` into the repo root.

## Editing the `codeJs` template

`codeJs` in `generate.js` is one big template literal, so runtime code inside it needs escaping: write `\``, `\${`, and `\\` for anything that should end up literally in `code.js`. Plain `${...}` is evaluated at generation time (used only for `VARIABLE_MAP`). The picker HTML is a template nested inside that, which is why it has double-escaped backticks.

## Adding a new kind (e.g. stroke color, effect style)

A "kind" is a category of menu command. Touch points, all in `generate.js` unless noted:

1. Classify the source data and add an entry to `KINDS` (`label` becomes the menu prefix via `menuName`, which also replaces `:` with ` - `; slug prefix goes into `uniqueSlug`). A `Search - <label>` command is added automatically.
2. If it isn't a variable, map it in `TYPE_BY_KIND` and make sure `RESOLVE_FN` (in the template) has a resolver for that type. `resolveStyle` currently hardcodes `importStyleByKeyAsync(key, "TEXT")`, so non-text styles need that generalized.
3. Write an `applyX(target)` in the template and register it in `APPLY_FN`. For kinds that act on the selection, snapshot `figma.currentPage.selection` once and pass it to `withSelectionGuard(target, nodes, fn)`; `fn` returns how many nodes it touched.
4. Add the slug prefix to `PREFIXES` in `gen-scripts.js`, otherwise the `.sh` files skip the new commands (see the curation warning below before regenerating them).
5. Update the counts in `README.md`.

## Runtime model

Each menu command is a separate plugin run: Figma starts `code.js` fresh with `figma.command` set to the slug, the plugin does one thing, then calls `figma.closePlugin()`. No state survives between runs. Every code path must end in `closePlugin()` (directly or via `withSelectionGuard`), or the plugin hangs open. `Component - ...` is the exception to "acts on the selection": `insertComponent` doesn't require a selection, uses only the first selected node as an anchor (`placeInstance`: inside an auto-layout frame, else as next sibling, else viewport center), and selects the new instance. Component sets insert their `defaultVariant`. The padding/radius picker is the only UI; it resolves on click, number key, Enter/Esc, or window blur (all non-number exits mean "All").

`runForSlug` shows a command-specific `figma.notify` ("Inserting Button…", "Applying fill …") with `timeout: Infinity` while the token/component is resolved, and cancels it before applying (so it never overlaps the picker). Figma's own running indicator only shows the plugin name (`manifest.json` `name`: "Bifrost Shortcuts"); add a `LOADING_TEXT` entry for every new kind.

## File map

| File | Role |
|---|---|
| `manifest.json` | Figma plugin manifest, defines every menu command (generated) |
| `code.js` | Plugin runtime logic, run directly by Figma (generated) |
| `bifrost-variables.json` | Raw variable export from Figma (colors, spacing, radius) |
| `bifrost-text-styles.json` | Raw text style export from Figma |
| `bifrost-components.json` | Filtered component export from the Bifrost Components library (public, non-demo, Bifrost section only) |
| `generate.js` | Produces `manifest.json` + `code.js` from the three JSON files above |
| `gen-scripts.js` | Produces the two `.sh` files from `manifest.json` |
| `setup-shortcut-placeholders.sh` | Adds empty placeholder rows to macOS System Settings so shortcuts can be bound (hand-curated, see below) |
| `undo-shortcuts.sh` | Deletes selected rows permanently (destructive by default, comment out lines with `#` to keep them) |

No `package.json`, no `node_modules`, no test suite. Node is only used to run the two generator scripts locally.

## Working with the macOS shortcut scripts

These write directly to Figma's preferences plist (`~/Library/Preferences/com.figma.Desktop.plist` via `defaults`/`PlistBuddy`). Treat them as destructive:

- Always fully quit System Settings (Cmd+Q) before running either script. If it's open, it caches old state and overwrites the script's changes on quit.
- Both scripts take an automatic backup first (`~/figma-shortcuts-backup-<timestamp>-<pid>.plist`). Restore with `defaults import com.figma.Desktop <backup-file>`.
- Menu command *names* can't contain `:` (PlistBuddy's path separator, also breaks macOS's own shortcut matching). `generate.js` uses `" - "` instead.
- `setup-shortcut-placeholders.sh` is idempotent (uses PlistBuddy `Add`, which fails harmlessly if the row exists), so it never clobbers a shortcut you've already bound.
- `undo-shortcuts.sh` deletes every row in its list unless commented out with `#`. It currently has nothing commented out and matches `gen-scripts.js` output exactly.
- `setup-shortcut-placeholders.sh` is **hand-curated**: 746 `Fill - ...`, 60 `Text - ...` and 64 `Component - ...` rows are commented out on purpose, leaving 129 active placeholders. For components, only a core set of 22 everyday components (Button, Badge, Tag, form controls, Modal, Drawer, Tooltip, Icon S/M/L, etc.) is active. For text, only `Text - H1` to `Text - H5` (renamed from `H?/Satoshi/Text` by `textStyleLabel` in `generate.js`) and S/M/L Open Sans Regular are active. Don't uncomment them without asking why they were excluded.
- **Running `gen-scripts.js` overwrites both `.sh` files from scratch and wipes that curation.** If a new kind needs placeholders, generate into a temp dir and merge only the new rows into the committed files by hand.
- Bundle ID is assumed to be `com.figma.Desktop`. Verify with `osascript -e 'id of app "Figma"'` if things stop matching.

## Deploying to Figma

Figma runs the plugin from a local folder registered via **Plugins → Development → New Plugin**, not from this repo directly. After changing `code.js`/`manifest.json`, copy them into that registered folder and re-run the plugin once from Figma to confirm it still resolves variables. Resolvers try the local `id` first, then import by global `key`, so this usually works unchanged across files using the same published Bifrost library. Components must be published and the library enabled in the target file.

## Conventions

- Everything is in English: menu names, `figma.notify` messages, popup HTML, code comments, shell script output and docs. (The repo was switched from Norwegian on 2026-10-02.)
- Renaming menu items renames the macOS shortcut rows (keys in `NSUserKeyEquivalents` are the exact menu titles), so a bound shortcut silently stops working. Migrate bound rows to the new names whenever a menu label changes. Slugs (`command`) are derived from the source names, not the labels, so they're the stable id to map old names to new ones.
- Comments in `code.js` explain non-obvious *why* (e.g. the selection-snapshot comment in `applyPaddingOrRadius`), not what the code does.
