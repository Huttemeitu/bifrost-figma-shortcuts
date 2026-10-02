# Bifrost Figma Plugin

A keyboard-first Figma plugin: running it opens a command palette window where typed commands (`pm gs rl`, `f brand`, `h1`, `button`) or browsable groups apply Bifrost tokens (fill, padding, gap, radius, text styles) to the selection or insert Bifrost components.

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

- `generate.js` classifies the exports (COLOR → fill, `Spacing/*` → padding + gap, `Border radius/*` → radius, text styles, components) into `VARIABLE_MAP` (slug → `{id, key, name, kind, type, isSet?}`), then writes `code.js` = `VARIABLE_MAP` + `UI_HTML` + `src/parse.js` + `src/runtime.js`, concatenated as one classic script (no modules; later files use globals from earlier ones). `UI_HTML` is `src/ui.html` as a JSON string with `src/parse.js` inlined at `/*PARSE_JS*/`, because the palette parses as you type.
- `src/parse.js` is pure: no `figma` API and no DOM. It runs in three places (plugin sandbox, palette iframe, Node tests via `vm`), so it must stay that way. Top-level `function` declarations are what the test can reach.
- Display names are decided in the generator: `textStyleLabel` turns `H1/Satoshi/Text` into `H1`, `componentLabel` prefixes the page name (`Modal/Image`) unless the name already starts with it.

After any change to `src/` or `generate.js`, regenerate and check:

```bash
node generate.js bifrost-variables.json . bifrost-text-styles.json bifrost-components.json
node --check code.js && node --test test/
```

## Runtime model

- The manifest has no menu and no parameters: running the plugin (Actions menu → `bif` → Enter) calls `figma.showUI(UI_HTML, { themeColors: true })` and the palette takes over. It replaced Figma's native parameter list (2026-10-02) because that list can't show a right-hand column or open nested groups.
- Message protocol is documented at the top of `runtime.js`. The UI parses locally (instant) and sends `apply {ops, keepOpen}`; the plugin side applies, then either closes (Enter) or replies with `state` (Shift+Enter). Ops carry slugs and labels, so the plugin side never re-parses.
- The palette needs keyboard focus on open (`window.focus()` + `q.focus()`). Not yet verified in Figma whether that works without a click.
- `selectionchange` is forwarded as `selection {count, hasText, hasAutoLayout}`; the UI re-renders live and orders groups by it.
- Palette navigation (in `ui.html`): Enter applies/opens, Tab opens a group or copies the row's `shorthand` into the input for chaining, Esc/Backspace leave a group. Inside a group, input is prefixed with `GROUPS[].prefix` ("m" in Padding parses as "pm").
- Right-hand keys per row = `parser.shorthand(ops)` + user aliases whose expansion produces the same label (`aliasIndex`).
- The ✓ marks the focused action row (what Enter applies), not the parse result. Re-renders from `state`/`selection` messages call `render(true)`, which keeps focus on the same row (matched by `rowId`) so Shift+Enter doesn't jump back to the top.
- "Run last plugin" (⌘⌥P) isn't usable, so **recents are the repeat mechanism**: `remember()` stores the last 8 commands in `clientStorage`; the palette shows the first 3 runnable ones on top, so Enter right after opening repeats.
- Aliases (`{name: expansion}`, names may be digits like `1`) live in `clientStorage` (per user and machine, not synced; hence Export/Import in the help window). `aliasError` rejects names that are built-in syntax.
- With nothing selected, the palette hides every row where `needsSelection(ops)` (first op isn't a component), including recents, aliases and every group except Component, and shows "Select at least one layer first" if nothing is left.
- `applyOps` switches its target nodes to the new instance after a component op, so ops after a component apply to it (`button pm`).
- The loading toast only appears if resolving takes over 400 ms (first import from a library). Figma's own "Running Bifrost" indicator can't be controlled.

## Parser rules (src/parse.js)

- `SIDE_OPS` maps op keys (`p`, `px`, `rtl`, ...) to `[kind, side]`; sides map to node fields via `FIELD_SETS` in `runtime.js`.
- Glued values (`pm`) and two-word values (`p m`) are equivalent. For ambiguous glued input the **shortest op wins** (`pxl` = Padding XL, `pl` = Padding L) and the other readings become alternatives. Two-word form wins when the second word is a valid value (`pl m` = Padding left M).
- Aliases expand inside the parse loop, only where an op can start (never in a value position), one level deep (`aliasEnd`).
- `f`/`bg`/`t` take one fuzzy word; `+` consumes the rest of the input as a component name.
- Any other word starts a name search over `SEARCH_KINDS` (components, text styles, colors). The **longest run of words that matches a name wins, as long as the words after it still parse**: `basic input pm` = Basic input · Padding M, `box rm` = Box · Radius M (nothing matches "box rm"), `icon button` = one name. While typing the last word, op and alias completions come before name matches.
- Fuzzy ranking (`matchScore`): exact path segment, last-segment prefix, substring or every query word starting a word in the name (any order), then subsequence within one path segment starting at a word start; ties go to non-Font-Awesome names, then kind order, then shorter names. Keep the "word start" rules: looser matching made `box rm` hit "Checkbox-indete**rm**inate". Text-style ranking is known to be weak (`t open` picks Italic before Regular).
- `aliasError` checks names against op syntax only (`createParser(..., { search: false })`), so aliases may shadow name search (`cta`) but not ops (`p`, `pm`, `h1`).
- `SYNTAX` is the help view's Guide tab: sections of `[examples[], meaning]`. Every example is a clickable chip that prefills the palette, so each must parse (enforced by the "every help example parses" test). Keep it in sync with `parse()` and the README table.

## Adding a new kind (e.g. stroke color, effect style)

1. Classify it in `generate.js` (`KINDS`) and map its `type` in `TYPE_BY_KIND` if it isn't a variable.
2. Make sure `RESOLVE_FN` in `runtime.js` can resolve that type.
3. Add a `KIND_LABEL`, an op (in `SIDE_OPS` or `FUZZY_OPS`), a `GROUPS` entry and a `SYNTAX` row in `parse.js`, and a placeholder in `ui.html`.
4. Handle it in `applyOp` in `runtime.js` (return how many nodes it touched).
5. Add a parser test case, and update the README table and counts.

## File map

| File | Role |
|---|---|
| `manifest.json`, `code.js` | Generated plugin, run by Figma |
| `generate.js` | Builds both from the JSON exports and `src/` |
| `src/parse.js` | Prompt syntax parser (pure) |
| `src/runtime.js` | Resolvers, `applyOp`, recents, aliases, palette messages, `!vars` |
| `src/ui.html` | Palette window (groups, typed commands, key column) and help view (`?`): Guide / Aliases / Recent tabs, ←/→ to switch, Esc back. The alias form validates live with `aliasError` before saving; clicking an alias row loads it for editing |
| `bifrost-variables.json`, `bifrost-text-styles.json` | Exports from the Bifrost variables file |
| `bifrost-components.json` | Filtered export from the Bifrost Components file (public, non-demo, Bifrost section only) |
| `test/parse.test.js` | Focused parser tests, `node --test test/` |

No `package.json` and no dependencies; Node is only used to generate and test.

## History

Until 2026-10-02 the plugin had ~1000 menu commands bound to keys through macOS System Settings (plist scripts, curated placeholder lists). That was removed in favor of the prompt, and the user's placeholder rows were deleted from `com.figma.Desktop.plist`. The old setup is in git history if it's ever needed. The throwaway prototype of the prompt lives on the local branch `prototype/prompt`.

## Deploying to Figma

The plugin is registered via **Plugins → Development → Import plugin from manifest…** pointing at this repo's `manifest.json`, so regenerating is enough. Resolvers try the local `id` first, then import by global `key`; the Bifrost libraries must be enabled in the target file.

## Conventions

- Everything is in English: suggestions, `figma.notify` messages, help UI, code comments, docs.
- Comments explain non-obvious *why*, not what the code does.
