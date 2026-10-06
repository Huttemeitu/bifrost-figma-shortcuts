# Bifrost Figma Plugin

A keyboard-first Figma plugin: running it opens a command palette window where typed commands (`pm gs rl`, `f brand`, `b base-dimmed-3`, `h1`, `button`, `frame alh pm`) or browsable groups apply Bifrost tokens (fill, border, padding, gap, radius, text styles) and auto layout to the selection, or insert frames and Bifrost components.

User-facing usage and the Figma export snippets are in `README.md`. This file is for working on the plugin itself.

## Architecture: a generator plus plain source files

Figma runs `code.js` directly, with no build step on its side. `code.js` and `manifest.json` are **generated**; never edit them by hand.

```
bifrost-variables.json + bifrost-text-styles.json + bifrost-components.json
src/ui.html + src/parse.js + src/runtime.js
        │  node generate.js bifrost-variables.json . bifrost-text-styles.json bifrost-components.json
        ▼
manifest.json + code.js
```

- `generate.js` classifies the exports (COLOR → fill AND stroke, `Spacing/*` → padding + gap, `Border radius/*` → radius, text styles, components) into `VARIABLE_MAP` (slug → `{id, key, name, kind, type, isSet?, group?}`; `group` is a fill's variable collection or a component's page, the first level of the Options tree), then writes `code.js` = `VARIABLE_MAP` + `UI_HTML` + `src/parse.js` + `src/runtime.js`, concatenated as one classic script (no modules; later files use globals from earlier ones). `UI_HTML` is `src/ui.html` as a JSON string with `src/parse.js` inlined at `/*PARSE_JS*/`, because the palette parses as you type.
- `src/parse.js` is pure: no `figma` API and no DOM. It runs in three places (plugin sandbox, palette iframe, Node tests via `vm`), so it must stay that way. Top-level `function` declarations are what the test can reach.
- Colors named `Light/...` or `Dark/...` (the Theme collection) are skipped (`MODE_SPECIFIC`): they're the per-mode values behind the Mode collection's tokens, which already follow the parent's variable mode. The user never wants a mode-specific color applied directly.
- Display names are decided in the generator: `textStyleLabel` turns `H1/Satoshi/Text` into `H1`, `componentLabel` prefixes the page name (`Modal/Image`) unless the name already starts with it.

After any change to `src/` or `generate.js`, regenerate and check:

```bash
node generate.js bifrost-variables.json . bifrost-text-styles.json bifrost-components.json
node --check code.js && node --test test/
```

## Runtime model

- The manifest menu is `Open palette` (first, so `bif` → Enter still opens it) and a `Numpad` submenu with `Numpad 0`…`Numpad 9` (`figma.command` `numpad-N`). Those run alias `N` headless via `runAlias` → `aliasOps` (in `parse.js`) → `applyOps`, then notify and close. They exist for the numpad companion app (see below); aliases stay the single place where keys are assigned.
- `Open palette` waits for `clientStorage`, then calls `figma.showUI(UI_HTML, { themeColors: true, ...state.size })` (default 520×600) and the palette takes over. The corner `#grip` in `ui.html` sends `resize {width, height}` once per animation frame while dragging and `save: true` on release; `runtime.js` clamps to `MIN_SIZE`, calls `figma.ui.resize` and stores the size. It replaced Figma's native parameter list (2026-10-02) because that list can't show a right-hand column or open nested groups.
- Message protocol is documented at the top of `runtime.js`. The UI parses locally (instant) and sends `apply {ops, keepOpen}`; the plugin side applies, then either closes (Enter) or replies with `state` (Shift+Enter). Ops carry slugs and labels, so the plugin side never re-parses.
- The palette needs keyboard focus on open (`window.focus()` + `q.focus()`). Not yet verified in Figma whether that works without a click.
- `selectionchange` is forwarded as `selection {count, hasText, hasAutoLayout}`; the UI re-renders live and orders groups by it.
- Palette navigation (in `ui.html`): Enter applies/opens, Tab opens a group or copies the row's `shorthand` into the input for chaining, Esc/Backspace leave a group. Inside a group, input is prefixed with `GROUPS[].prefix` ("m" in Padding parses as "pm").
- Right-hand keys per row = `parser.shorthand(ops)` + user aliases whose expansion produces the same label (`aliasIndex`).
- Look: a "Glass look" layer at the end of `ui.html`'s `<style>` overrides the base styles (soft brand-colored radial glows on the body, translucent `backdrop-filter` surfaces, `--glass-*` variables with an `html.figma-dark` variant set by `themeColors`). Real see-through to the canvas isn't possible: Figma draws an opaque window around the iframe. Small controls use `--glass-edge` because white edges vanish on light glass. The focused palette row is shown by one `#hl` element inside `#list` that glides to the row (`placeHighlight`); it's re-created on every render, so it's placed without animation there and animated in `setActive`.
- The ✓ marks the focused action row (what Enter applies), not the parse result. Re-renders from `state`/`selection` messages call `render(true)`, which keeps focus on the same row (matched by `rowId`) so Shift+Enter doesn't jump back to the top.
- "Run last plugin" (⌘⌥P) isn't usable, so **recents are the repeat mechanism**: `remember()` stores the last 8 commands in `clientStorage`; the palette shows the first 3 runnable ones on top, so Enter right after opening repeats.
- Aliases (`{name: expansion}`, names may be digits like `1`) live in `clientStorage` (per user and machine, not synced; hence Export/Import in the help window). `aliasError` rejects names that are built-in syntax.
- Hidden options (`hidden`: array of slugs, set in the Options tab) also live in `clientStorage`. The UI builds its palette parser from entries minus hidden ones, so they vanish from search, groups and counts; aliases, recents and alias validation still use all entries. `setHidden` is fire-and-forget (the UI already updated). Backup JSON is `{ aliases, hidden }`.
- The Options tree comes from `buildOptionTree` (pure, in `parse.js`, tested): kind › group › name path, with one-child levels merged ("Pop/Brand", "Primitives/Teal"). Every node carries `slugs` for whole-group toggles. The filter matches paths below the current node and lists a matching group once instead of its children.
- **Availability is one shared rule** (`parse.js`): `nodeCaps(node)` in `runtime.js` describes a layer (`fills`, `strokes`, `radius`, `corners`, `autoLayout`, `canAutoLayout`, `text`), `opNeed`/`opSupports` say what each op needs, and `checkOps(ops, caps[])` walks a command in order: inserts replace the targets with `INSERTED_CAPS`, `alh`/`alv` make frames auto layout, and the first op no target supports returns `{ error, index }`. The palette offers only ops that pass (rows, groups, recents, aliases), with the error as the explanation; `applyOps` runs the same check first and applies each op only to layers where `opSupports` is true. Never add an op without an `opNeed` rule, or it'll be offered where it does nothing. The selection message sends distinct `nodeCaps` (`selection.nodes`).
- Text styles have two modes, decided by `checkOps`: with text in the targets they change it ("Text H5"), otherwise they insert a text layer ("Insert text H5", content "Header H5" for H1-H5, else "Text") via `insertText`, which loads the default and the style's font. `describeOpsIn(ops, modes)` gives the mode-aware labels; `describeOps` (static) is still used for recents and alias matching.
- Inserts (component, frame, text style in insert mode) create a layer: `applyOps` switches its targets to it afterwards, so later ops apply to it (`button pm`, `frame alh h5`). All are placed by `placeNode` (inside a selected auto-layout frame, else after the selection, else viewport center). A component's instance is assumed to be auto layout in `INSERTED_CAPS`, since its contents aren't known before import.
- `WORD_OPS` (`frame`, `alh`, `alv`) are ops with no token: no `slug`, so `applyOps` skips resolving for them, `shorthand` is the word itself, and the palette's Layout group lists them (`list("layout")`, `count.layout` set by hand in `ui.html`). `setAutoLayout` hugs children only when adding auto layout to a frame that has some; empty frames keep their size; instances are skipped.
- The loading toast only appears if resolving takes over 400 ms (first import from a library). Figma's own "Running Bifrost" indicator can't be controlled.

## Parser rules (src/parse.js)

- `SIDE_OPS` maps op keys (`p`, `px`, `rtl`, ...) to `[kind, side]`; sides map to node fields via `FIELD_SETS` in `runtime.js`.
- Glued values (`pm`) and two-word values (`p m`) are equivalent. Horizontal/vertical are `h`/`v` (`ph l`, `pv s`), not x/y, because `pxl` collided with Padding XL. For ambiguous glued input the **shortest op wins** (`pl` = Padding L, `rl` = Radius L) and the other readings become alternatives. Two-word form wins when the second word is a valid value (`pl m` = Padding left M).
- Glued fuzzy ops (`fbase3`, `bbrand`, `tregular`) are read as op + query only when the whole word isn't a strong name match (`isStrongName`, score ≤ 2), so `brand`, `button`, `tag` stay name searches. `matchScore` ignores separators when comparing with the last segment (`base3` = `bfc-base-3`).
- `shorthand` for colors is the key plus the compact last segment (`fbase3`), only if that parses back to exactly this color. It's computed from a per-kind index (`colorShorthand`), with a real parse only when a path segment collides; a full parse per row took ~850 ms for the Fill group. Results are cached per parser.
- Aliases expand inside the parse loop, only where an op can start (never in a value position), one level deep (`aliasEnd`).
- Word ops are matched before everything else except aliases, `+` and fuzzy-op keys; while typing one ("fr", "al"), only its completions are offered.
- `f`/`bg`/`b`/`t` take one fuzzy word; `+` consumes the rest of the input as a component name. `b` is stroke (label "Border"): `applyOp` binds the color to the first stroke paint and always sets `strokeWeight = 1` (all sides). Stroke isn't in `SEARCH_KINDS`, so a bare color name means fill.
- A name-search run stops before op keywords, `+component`s and aliases (`isKeyword`), so `button b brand` is Button · Border rather than a search for "button b" (every query word only has to start a word in the name, and "b" starts "button").
- Any other word starts a name search over `SEARCH_KINDS` (components, text styles, colors). The **longest run of words that matches a name wins, as long as the words after it still parse**: `basic input pm` = Basic input · Padding M, `box rm` = Box · Radius M (nothing matches "box rm"), `icon button` = one name. While typing the last word, op and alias completions come before name matches.
- Fuzzy ranking (`matchScore`): exact path segment, last-segment prefix, substring or every query word starting a word in the name (any order), then subsequence within one path segment starting at a word start; ties go to non-Font-Awesome names, then kind order, then shorter names. Keep the "word start" rules: looser matching made `box rm` hit "Checkbox-indete**rm**inate". Text-style ranking is known to be weak (`t open` picks Italic before Regular).
- `aliasError` checks names against op syntax only (`createParser(..., { search: false })`), so aliases may shadow name search (`cta`) but not ops (`p`, `pm`, `h1`).
- `SYNTAX` is the help view's Guide tab: sections of `[examples[], meaning]`. Every example is a clickable chip that prefills the palette, so each must parse (enforced by the "every help example parses" test). Keep it in sync with `parse()` and the README table.

## Adding a new kind (e.g. stroke color, effect style)

1. Classify it in `generate.js` (`KINDS`) and map its `type` in `TYPE_BY_KIND` if it isn't a variable.
2. Make sure `RESOLVE_FN` in `runtime.js` can resolve that type.
3. Add a `KIND_LABEL`, an op (in `SIDE_OPS` or `FUZZY_OPS`), a `GROUPS` entry (this also adds it to the Options tree) and a `SYNTAX` row in `parse.js`, and a placeholder in `ui.html`.
4. Handle it in `applyOp` in `runtime.js` (return how many nodes it touched).
5. Add a parser test case, and update the README table and counts.

## File map

| File | Role |
|---|---|
| `manifest.json`, `code.js` | Generated plugin, run by Figma |
| `generate.js` | Builds both from the JSON exports and `src/` |
| `src/parse.js` | Prompt syntax parser (pure) |
| `src/runtime.js` | Resolvers, `applyOp`, recents, aliases, palette messages, `!vars` |
| `src/ui.html` | Palette window (groups, typed commands, key column) and help view (`?`): Guide / Options / Aliases / Recent tabs, ←/→ to switch while a tab has focus, Esc back. Options is the hide/show tree (↑↓, Space, Enter/→ in, ←/Backspace out, `/` to filter). The alias form validates live with `aliasError` before saving; clicking an alias row loads it for editing |
| `bifrost-variables.json`, `bifrost-text-styles.json` | Exports from the Bifrost variables file |
| `bifrost-components.json` | Filtered export from the Bifrost Components file (public, non-demo, Bifrost section only) |
| `test/parse.test.js` | Focused parser tests, `node --test test/` |
| `companion/` | Bifrost Numpad, the macOS menu bar app (Swift package, no dependencies) |

No `package.json` and no dependencies; Node is only used to generate and test.

## Numpad companion app (companion/)

Swift 6 package, macOS 14+, AppKit only. `companion/build.sh` builds a universal `build/Bifrost Numpad.app` (`Info.plist` is copied in, `LSUIElement`), signed ad hoc or with `SIGN_IDENTITY`. `--release` also copies it to `dist/`, which is **committed**: designers install by copying it from a git checkout, with no build tools. That works without notarization only because git doesn't set the quarantine flag (a browser zip download does). Only update `dist/` on a real release (bump the version), since every new binary loses the Accessibility grant.

- `KeyTap.swift`: a `CGEventTap` (needs Accessibility). While Figma is frontmost it swallows the palette shortcut (also while typing) and numpad digits (keypad key codes, no ⌘⌥⌃⇧, only when `!figma.isTyping`); the matching keyUp is swallowed too. While `recorder` is set it swallows every key and captures the next one with ⌘/⌃/⌥ (Esc cancels); recording goes through the tap so it also catches combos a window never receives. The menu press is dispatched off the callback so a slow press can't time out the tap. `CGEvent` isn't Sendable, so the callback copies fields into `Key` before `MainActor.assumeIsolated`.
- `Shortcut.swift`: key code + ⌘⌃⌥⇧ flags, saved as JSON in `UserDefaults` (`paletteShortcut`; missing = default ⌃⌥Space, JSON `null` = removed). `description` translates the key code with the current keyboard layout (`UCKeyTranslate`), so Norwegian keys show correctly.
- `Figma.swift`: `isTyping` = the focused AX element is a text role. Works without `AXManualAccessibility` (verified 2026-10-06), so the app never changes Figma's settings. `run(command)` finds the item (`Open palette`, `Numpad N`) below a menu titled `Bifrost` (dev and org-published paths differ), caches it per Figma pid and searches again if a press fails.
- `main.swift`: status item and menu (Enabled, palette shortcut record/remove, launch at login), and the record panel (only an explanation; closing it cancels). Icon: SF Symbol `square.grid.3x3`, flashes `.fill` on success, `exclamationmark.triangle` on failure, `appearsDisabled` when paused or without permission. Enabled is deliberately not persisted. Launch at login uses `SMAppService.mainApp`. Without permission it polls `AXIsProcessTrusted` every 2 s and starts the tap when granted.
- Ad hoc signatures change per build, so macOS forgets the Accessibility grant after every rebuild.
- Before relying on the committed app more widely, check with security: skipping Gatekeeper via git is a gray area. The long-term route is Developer ID + notarization + MDM.

## History

Until 2026-10-02 the plugin had ~1000 menu commands bound to keys through macOS System Settings (plist scripts, curated placeholder lists). That was removed in favor of the prompt, and the user's placeholder rows were deleted from `com.figma.Desktop.plist`. The old setup is in git history if it's ever needed. The throwaway prototype of the prompt lives on the local branch `prototype/prompt`.

## Deploying to Figma

The plugin is registered via **Plugins → Development → Import plugin from manifest…** pointing at this repo's `manifest.json`, so regenerating is enough. Resolvers try the local `id` first, then import by global `key`; the Bifrost libraries must be enabled in the target file.

## Conventions

- Everything is in English: suggestions, `figma.notify` messages, help UI, code comments, docs.
- Comments explain non-obvious *why*, not what the code does.
