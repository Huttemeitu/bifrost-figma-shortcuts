# Bifrost for Figma

A keyboard-first Figma plugin for applying Bifrost design tokens (fill and
border colors, padding, gap, radius, text styles) to the selection and inserting Bifrost
components, from a small command palette. With the optional **Bifrost Numpad**
app, a keyboard shortcut opens the palette and a single numpad key applies a
command of your choice.

It covers 796 colors (as fill or border), 12 spacing values (padding and gap), 7 radius
values, 68 text styles and 86 components.

## Getting started

You need the Figma **desktop app** (development plugins don't run in the
browser) and access to this repo on GitHub.

### 1. Get the repo

Open Terminal and clone the repo to a folder you'll keep, e.g. `~/Code`:

```bash
mkdir -p ~/Code && cd ~/Code
git clone https://github.com/Huttemeitu/bifrost-figma-shortcuts.git
```

- The first time you run `git`, macOS may offer to install the Command Line
  Tools. Accept and run the command again.
- Use `git clone`, not **Download ZIP**: macOS blocks the numpad app in a
  downloaded zip, and with a clone, updating is one command.
- Figma remembers where the plugin is. If you move the folder later, import
  the plugin again (step 2).

### 2. Install the Figma plugin

1. In the Figma desktop app, open any design file.
2. **Plugins › Development › Import plugin from manifest…**
3. Pick `manifest.json` in the `bifrost-figma-shortcuts` folder.

If you imported an earlier version from another folder, remove that one first
(**Plugins › Development › Manage plugins in development**); both use the same
plugin id.

### 3. Enable the Bifrost libraries

The plugin applies tokens and components from the Bifrost libraries, so they
have to be enabled in the file you work in: **Assets panel › Libraries** (the
book icon), then turn on the Bifrost variables library and Bifrost Components.
Without them, commands fail with "not in an enabled library".

### 4. Try it

1. Select a frame.
2. Open the Actions menu (⌘K, ⌘/ or ⌘, depending on your keyboard layout),
   type `bif` and press Enter. The Bifrost palette opens.
3. Type `alh pm rm` and press Enter: the frame gets horizontal auto layout,
   padding M and radius M.
4. Type `?` in the palette for the full guide. [Using the palette](#using-the-palette)
   below has the same in short.

### 5. Optional: shortcut and numpad keys

With **Bifrost Numpad** running, **⌃⌥Space** in Figma opens the palette (no
Actions menu needed), and if your keyboard has a numpad, pressing numpad 1
runs your alias `1`, numpad 2 runs alias `2`, and so on. On a MacBook without
a numpad you get the shortcut.

1. In Finder, open the repo folder, go to `companion/dist/` and copy
   **Bifrost Numpad.app** to **Applications**.
2. Open it from Applications. It has no window; a small grid icon appears in
   the menu bar.
3. macOS asks to give it **Accessibility** access. Click **Open System
   Settings** and turn on Bifrost Numpad (needs an admin password). If you
   missed the prompt: menu bar icon › **Grant Accessibility access…**. The
   icon turns from grey to normal within a couple of seconds.
4. Press ⌃⌥Space in Figma to check that the palette opens. To use another
   shortcut: menu bar icon › **Record palette shortcut…**, then press the new
   one (it needs ⌘, ⌃ or ⌥).
5. Numpad only: choose what each key does by saving aliases named `0`–`9`.
   In the palette, type `?` and open the **Aliases** tab. Name `1` and Does
   `button pm` makes numpad 1 insert a Button with padding M; name `2` and
   Does `alh pm gs` makes numpad 2 add auto layout with padding M and gap S.
   Any command that works in the palette works as an alias.
6. Optional: menu bar icon › **Launch at login**.

To use the same keys as a teammate, have them copy their aliases (palette ›
`?` › **Aliases** › **Copy as JSON**) and paste them in with **Import…** in
the same place. Imported aliases are added to the ones you have.

### Updating

```bash
cd ~/Code/bifrost-figma-shortcuts && git pull
```

- **Plugin:** nothing else to do. The next time you open the palette it runs
  the new version.
- **Numpad app:** only if `git pull` lists changes in `companion/dist/`. Quit
  Bifrost Numpad (menu bar icon › Quit), copy the new app over the old one in
  Applications, and open it. macOS treats it as a new app: in **System
  Settings › Privacy & Security › Accessibility**, remove the old Bifrost
  Numpad entry with `−` and turn the new one on.

### Troubleshooting

| Problem | Fix |
|---|---|
| "not in an enabled library" | Enable the Bifrost libraries in this file (step 3) |
| "font … isn't available" | Install that font on your Mac (text styles need their font locally) |
| The shortcut or a numpad key does nothing | Check the menu bar icon: grey means paused (turn on **Enabled**) or no Accessibility access (step 5.3) |
| Nothing happens, and the menu bar icon flashes a warning sign | The plugin isn't installed, or was imported from a folder that moved (step 2) |
| Toast: `No alias "3"` | Save an alias named `3` in the palette's Aliases tab (`?` › Aliases) |
| Numpad types digits instead | You're in a text field (W/H, layer name, a text layer); that's on purpose. Click the canvas first |
| The shortcut also does something else in Figma | Record another one (step 5.4); the app takes it over while Figma is in front |
| macOS says the app "can't be opened" or "is damaged" | The repo was downloaded as a zip. Delete it and use `git clone` (step 1) |

## Using the palette

1. Open the Actions menu (⌘K, ⌘/ or ⌘, depending on your keyboard layout).
2. Type `bif` and press Enter. The Bifrost palette opens.
3. Either type a command and press Enter (the `✓` row shows how your input was
   understood), or open a group (Padding, Gap, Radius, Fill, Text, Component)
   with Tab or Enter to browse its actions.

Every row shows the token's value (`12px`, or a color swatch and its hex),
then its shorthand and your aliases on the right, so browsing a group also
teaches you what to type next time. Colors follow the selected layer's
variable modes: inside a Dark frame you see the dark value, in a Pink theme
the pink one. With nothing selected they show the defaults (Light, Teal).
The Options tab shows the same values.

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
| `fbrand`, `fbase3`, `f base-1` | Fill, fuzzy match on the color name (space and dashes optional) |
| `bbrand`, `bbasedimmed3`, `b base-dimmed-3` | Border: that color, always 1px on all sides |
| `h1` … `h5`, `t regular` | Text style on selected text; with no text selected it inserts a text layer ("Header H5") |
| `frame` | Insert a frame (placed like components, see below) |
| `alh`, `alv` | Auto layout horizontal / vertical on the selected frames |
| `frame alh pm rm bbase-dimmed3` | Build a styled auto-layout frame in one go |
| `button`, `btn`, `basic input`, `brand` | Search components, text styles and colors by name |
| `pm gs rl` | Several at once |
| `button pm` | Insert a Button and give it padding M |
| `?` | Help, aliases and recents |

Inside a group, leave out the group's key: in Padding, `m` is Padding M and
`h l` is Padding horizontal L.

Some details:

- **Only what works is offered:** the palette checks every command against
  what's selected, step by step, and hides what would do nothing. Auto
  layout, padding and gap need a frame (not an instance, unless it already
  has auto layout), fills and borders need a layer that can have them
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
- **Padding and gap add auto layout** to a frame that doesn't have it, so
  `pm` or `gs` works on any frame. The direction follows the children like Shift+A: side
  by side becomes horizontal, anything else vertical. The row says "(adds
  auto layout)" when this happens. Use `alh`/`alv` first to choose yourself.
- **Frames** (`frame`) are placed the same way as components and become the
  selection, so everything after `frame` applies to the new frame. Adding auto
  layout (`alh`/`alv`) to a frame with children makes it hug them, like
  Shift+A; an empty frame keeps its size. Instances are left alone.
- **Components** insert the default variant. With an auto-layout frame
  selected the instance is added as its last child, with anything else
  selected it's added right after it, and with nothing selected it lands in
  the center of the viewport. The new instance gets selected, and anything
  after the component in the same command applies to it.
- **Aliases** are saved in the help view's Aliases tab (`?` › Aliases). Names
  can be words or numbers (`1` → `pm gs`), and they work anywhere a command
  can start, so `cta rl` works if `cta` is an alias. They never
  replace a value, so an alias named `m` doesn't break `p m`.
  They're stored per user and per machine (Figma's `clientStorage`); use
  **Copy as JSON** / **Import…** in the Aliases tab to back them up or share
  them. The tab checks a new alias live and lets you click an existing one
  to edit it.
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

## Bifrost Numpad

The plugin has ten menu commands, **Plugins › Development › Bifrost › Numpad
› Numpad 0–9**. Each runs the alias with that name directly, without opening
the palette. If the alias is missing or can't apply to the selection, a toast
says why.

**Bifrost Numpad** (`companion/`, set up in [step 5](#5-optional-shortcut-and-numpad-keys))
is a small menu bar app that runs those commands when you press a numpad key,
and **Open palette** when you press the palette shortcut. Numpad keys are
assigned with aliases in the palette; the only setting in the app is the
palette shortcut.

- It only acts while Figma is the frontmost app. Other apps never see a
  difference.
- The palette shortcut (default ⌃⌥Space) works anywhere in Figma, also while
  you edit text. Record another one in the app's menu; it needs ⌘, ⌃ or ⌥ so
  plain typing can't trigger it. **Remove palette shortcut** turns it off.
- Numpad digits only count without modifiers. Top-row digits and ⌘/⌥/⌃/⇧
  combos are untouched, and while you type in a field (W/H, layer name, a
  text layer) the numpad types digits as usual.
- The menu bar icon flashes filled when a key runs, and a warning sign if the
  Numpad command couldn't be found. It's grey while paused or without
  Accessibility access.
- Its menu has **Enabled** (a pause for both; every launch starts enabled),
  the palette shortcut, **Launch at login** and **Quit**.

## Maintaining the plugin

### Releasing a new version of the numpad app

Needs Xcode. Bump `CFBundleShortVersionString` in `companion/Info.plist`, run
`companion/build.sh --release` and commit `companion/dist/`. Plain `build.sh`
builds to the ignored `companion/build/` for testing. Only update `dist/` for
real releases: every new build has to be granted Accessibility again on every
Mac.

### Regenerating when the Bifrost library changes

1. Open the file where the variables and text styles are defined.
2. Open **Plugins → Development → Open Console**, then type `!vars` in the
   palette and press Enter. It logs every variable with its value in each
   mode (references to other variables kept as `{ "alias": id }`), which the
   palette shows next to each option.
   Right-click the log → **Copy string contents** → save as `bifrost-variables.json`.
3. For text styles, paste this into the console and save as `bifrost-text-styles.json`:
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

### Files

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
| `companion/` | Bifrost Numpad menu bar app (Swift package, `build.sh`) |
