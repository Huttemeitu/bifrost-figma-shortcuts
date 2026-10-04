# Bifrost for Figma

A keyboard-first Figma plugin for applying Bifrost design tokens (fill and
border colors, padding, gap, radius, text styles) to the selection and inserting Bifrost
components, from a small command palette. No macOS shortcut setup needed.

It covers 796 colors (as fill or border), 12 spacing values (padding and gap), 7 radius
values, 68 text styles and 86 components.

## Using it

1. Open the Actions menu (⌘K, ⌘/ or ⌘, depending on your keyboard layout).
2. Type `bif` and press Enter. The Bifrost palette opens.
3. Either type a command and press Enter (the `✓` row shows how your input was
   understood), or open a group (Padding, Gap, Radius, Fill, Text, Component)
   with Tab or Enter to browse its actions.

Every row shows its shorthand and your aliases on the right, so browsing a
group also teaches you what to type next time.

| Key | Does |
|---|---|
| ↑ ↓ | Move between rows |
| Enter | Apply the row (or open a group) and close |
| Shift+Enter | Apply and keep the palette open |
| Tab | Open a group, or copy a row's shorthand to the input to chain more (`pm`, Tab, `gs`) |
| Esc / Backspace | Leave a group; Esc on an empty palette closes it |


| Type | Does |
|---|---|
| `pm` or `p m` | Padding M on all sides |
| `ph l`, `pv s` | Padding horizontal / vertical |
| `pt m`, `pb m`, `pl m`, `pr m` | Padding on one side |
| `gs` | Gap S |
| `rl`, `r full` | Radius on all corners |
| `rt m`, `rtl s`, `rbr m` | Radius on two corners / one corner |
| `f brand`, `fbase3`, `bg base-1` | Fill, fuzzy match on the color name (dashes optional) |
| `b base-dimmed-3`, `bbasedimmed3` | Border: that color, always 1px on all sides |
| `h1` … `h5`, `t regular` | Text style on selected text; with no text selected it inserts a text layer ("Header H5") |
| `frame` | Insert a frame (placed like components, see below) |
| `alh`, `alv` | Auto layout horizontal / vertical on the selected frames |
| `frame alh pm rm bbase-dimmed3` | Build a styled auto-layout frame in one go |
| `button`, `btn`, `basic input`, `brand` | Search components, text styles and colors by name |
| `+button`, `+icon button` | Insert a component (the rest of the input is its name) |
| `pm gs rl` | Several at once |
| `button pm` | Insert a Button and give it padding M |
| `=cta f brand` | Save the alias `cta` (`=cta` alone deletes it) |
| `?` | Help, aliases and recents |

Inside a group, leave out the group's key: in Padding, `m` is Padding M and
`h l` is Padding horizontal L.

Some details:

- **Only what works is offered:** the palette checks every command against
  what's selected, step by step, and hides what would do nothing. Padding and
  gap need an auto-layout frame (`alh pm` adds it first), auto layout needs a
  frame (not an instance), fills and borders need a layer that can have them
  (not a group), single corners need a frame or rectangle. If you type
  something that can't apply, it says why instead of doing nothing.
- **Repeat:** the last three commands are listed first on the empty palette,
  so Enter right after opening it repeats the last one on the new selection.
- **Nothing selected:** only inserts are offered (text styles, components,
  `frame`), plus anything that follows them, like `button pm`. The palette
  updates live when the selection changes.
- **Glued values:** `pm`, `phl` and `fbase3` work like `p m`, `ph l` and
  `f base3`. A glued `f`, `b` or `t` is only used when the whole word isn't
  itself a name, so `brand` and `button` stay searches while `fbrand` is a
  fill. `pl` is Padding L (`pl m` is Padding left M); the rows below show the
  other readings.
- **Window size:** drag the bottom-right corner to resize. The size is
  remembered for next time.
- **Frames** (`frame`) are placed the same way as components and become the
  selection, so everything after `frame` applies to the new frame. Adding auto
  layout (`alh`/`alv`) to a frame with children makes it hug them, like
  Shift+A; an empty frame keeps its size. Instances are left alone.
- **Components** insert the default variant. With an auto-layout frame
  selected the instance is added as its last child, with anything else
  selected it's added right after it, and with nothing selected it lands in
  the center of the viewport. The new instance gets selected, and anything
  after the component in the same command applies to it.
- **Aliases** can be words or numbers (`=1 pm gs`), and work anywhere a
  command can start, so `cta rl` works if `cta` is an alias. They never
  replace a value, so an alias named `m` doesn't break `p m`.
  They're stored per user and per machine (Figma's `clientStorage`); use
  **Copy as JSON** / **Import…** in the help view's Aliases tab (`?`) to back
  them up or share them. The Aliases tab also checks a new alias live and lets
  you click an existing one to edit it.
- The Bifrost libraries must be enabled in the file you're working in.

### Choosing which options show

Most libraries have far more tokens than you use. Open **Choose which options
show** on the palette's main page (or the Options tab in `?`) to hide them:

- Everything is a tree: Fill › Mode › Pop › Brand, Fill › Primitives › Teal,
  Component › Button, and so on. Fills are grouped by their variable
  collection first, so all 612 primitives can be hidden with one checkbox.
- Fill and Border are separate groups, so you can keep different colors for
  each (hide Primitives in both if you never use them).
- A group's checkbox hides or shows everything in it; open the group (Enter
  or →) to pick single values. ← or Backspace goes back up, Space toggles.
- The filter field finds matches across groups, e.g. `-hc` or `fade`, and
  hides or shows all of them at once.

Hidden options disappear from search, groups and counts in the palette.
Aliases and recents that use them keep working. The choice is saved per
machine and included in the help view's Copy as JSON backup.

### Stream Deck

Use a text or multi-action key that types the whole sequence, e.g.
⌘K → `bif` → Enter → `pm gs` → Enter.

## Setup

1. Figma desktop app → **Plugins → Development → Import plugin from manifest…**
2. Pick `manifest.json` in this repo. Figma runs the plugin straight from this
   folder, so there's nothing to copy after regenerating.

If you registered an earlier version of the plugin from another folder, remove
that one first (same plugin id).

## Regenerating when the Bifrost library changes

1. Open the file where the variables and text styles are defined.
2. Type `!vars` in the palette, or paste this into the plugin console
   (**Plugins → Development → Open Console**):
   ```js
   (async () => {
     const collections = await figma.variables.getLocalVariableCollectionsAsync();
     const result = [];
     for (const c of collections) {
       for (const id of c.variableIds) {
         const v = await figma.variables.getVariableByIdAsync(id);
         if (!v) continue;
         result.push({ collection: c.name, name: v.name, id: v.id, key: v.key, resolvedType: v.resolvedType });
       }
     }
     console.log(JSON.stringify(result, null, 2));
   })();
   ```
   Right-click the log → **Copy string contents** → save as `bifrost-variables.json`.
3. For text styles, paste this instead and save as `bifrost-text-styles.json`:
   ```js
   (async () => {
     const styles = await figma.getLocalTextStylesAsync();
     const result = styles.map((s) => ({
       name: s.name, id: s.id, key: s.key,
       fontSize: s.fontSize, fontFamily: s.fontName.family, fontStyle: s.fontName.style,
       lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
     }));
     console.log(JSON.stringify(result, null, 2));
   })();
   ```
4. For components, open the Bifrost **Components** file (where the components
   are defined, not a file that uses the library), paste this and save as
   `bifrost-components.json`:
   ```js
   (async () => {
     await figma.loadAllPagesAsync();
     const EXCLUDE = /demo|example|deprecated|do not use|template/i;
     let section = null;
     const result = [];
     for (const page of figma.root.children) {
       if (page.name.startsWith("⬇️")) { section = page.name.replace("⬇️", "").trim(); continue; }
       if (section !== "Bifrost library" || page.name.startsWith("Header (")) continue;
       for (const n of page.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
         if (n.type === "COMPONENT" && n.parent.type === "COMPONENT_SET") continue;
         if (/^[._]/.test(n.name) || EXCLUDE.test(n.name) || EXCLUDE.test(page.name)) continue;
         if (page.name === "DatePicker" && !n.name.startsWith("DatePicker (")) continue;
         result.push({ name: n.name, id: n.id, key: n.key, isSet: n.type === "COMPONENT_SET", page: page.name });
       }
     }
     console.log(JSON.stringify(result, null, 2));
   })();
   ```
   The filter only includes the Bifrost section (not Gjallarbru, Toolkit or
   Patterns), and skips private (`_`/`.`), demo, example, template and
   deprecated components, the experimental Header page and DatePicker's
   internal parts.
5. Regenerate (Node.js only, no dependencies):
   ```bash
   node generate.js bifrost-variables.json . bifrost-text-styles.json bifrost-components.json
   ```

## Files

| File | What it is |
|---|---|
| `manifest.json` | Plugin manifest (generated) |
| `code.js` | Plugin code run by Figma (generated, don't edit) |
| `src/parse.js` | Command syntax parser (pure, tested; also runs inside the palette) |
| `src/runtime.js` | Resolving and applying tokens, recents, aliases, palette messages |
| `src/ui.html` | The palette window and its help view |
| `generate.js` | Builds `manifest.json` + `code.js` from the JSON exports and `src/` |
| `bifrost-*.json` | Exports of variables, text styles and components from Figma |
| `test/parse.test.js` | Parser tests: `node --test test/` |
