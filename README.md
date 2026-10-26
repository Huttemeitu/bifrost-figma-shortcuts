# Bifrost for Figma

A keyboard-first Figma plugin for applying Bifrost design tokens (fill and
border colors, padding, gap, radius, text styles) to the selection and inserting Bifrost
components, from a small command palette. With the optional **Bifrost Figma
Companion** app, a keyboard shortcut opens the palette, and ⌃⌥ + a key or a single
numpad key applies a command of your choice.

It covers 796 colors (as fill or border), 12 spacing values (padding and gap), 7 radius
values, 68 text styles, 86 components and the breakpoint template.

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
book icon), then turn on the Bifrost variables library and Bifrost Components
(and Breakpoints template, if you insert the breakpoint template). Without them,
commands fail with "not in an enabled library".

### 4. Try it

1. Select a frame.
2. Open the Actions menu (⌘K, ⌘/ or ⌘, depending on your keyboard layout),
   type `bif` and press Enter. The Bifrost palette opens.
3. Type `alh p m r m` and press Enter: the frame gets horizontal auto layout,
   padding M and radius M.
4. Type `?` in the palette for the full guide. [Using the palette](#using-the-palette)
   below has the same in short.

### 5. Optional: shortcuts and numpad keys

With **Bifrost Figma Companion** running, **⌃⌥Space** in Figma opens the palette (no
Actions menu needed), and any alias can have a key: give `btn` the key `b`
in the palette and **⌃⌥B** runs it; a digit key also works on the numpad.
Every letter and digit works except h, t and v, which Figma uses for ⌃⌥H,
⌃⌥T and ⌃⌥V. The ⌃⌥ keys are off until you turn on **⌃⌥ + key runs
aliases** in the app's menu, since window managers like Rectangle and Magnet
use ⌃⌥ too (move theirs first, or leave it off and use the numpad). If you'd
rather pick your own shortcut, record one in the app.
You can start typing right after the shortcut: the app holds the keys until
the palette is open and types them into it (Esc drops them).

1. In Finder, open the repo folder, go to `companion/dist/` and copy
   **Bifrost Figma Companion.app** to **Applications**.
2. Open it from Applications. It has no window; the Bifrost logo appears in
   the menu bar.
3. macOS asks to give it **Accessibility** access. Click **Open System
   Settings** and turn on Bifrost Figma Companion (needs an admin password). If you
   missed the prompt: menu bar icon › **Grant Accessibility access…**. The
   icon turns from grey to normal within a couple of seconds.
4. Press ⌃⌥Space in Figma to check that the palette opens. To use another
   shortcut: menu bar icon › **Open palette**, then press the new one (it
   needs ⌘, ⌃ or ⌥).
5. Choose what each key does with aliases. In the palette, type `?` and open
   the **Aliases** tab. Name `btn`, Does `button p m` and key `b` makes ⌃⌥B
   insert a Button with padding M; name `layout`, Does `alh p m g s` and key
   `1` makes ⌃⌥1 and numpad 1 add auto layout with padding M and gap S. Any
   command that works in the palette works as an alias. Giving a key that
   another alias has moves it. For ⌃⌥, turn on menu bar icon › **⌃⌥ + key
   runs aliases**.
6. To give any alias a shortcut of your choice: in the palette's Aliases tab,
   click **Copy as JSON**, then menu bar icon › **Aliases (advanced)** › **Import aliases
   from clipboard**. Your aliases are listed there with their keys; click one
   and press the shortcut. Import again after adding, renaming or deleting
   aliases with a recorded shortcut.
7. Optional: menu bar icon › **Launch at login**.

To use the same keys as a teammate, have them copy their aliases (palette ›
`?` › **Aliases** › **Copy as JSON**) and paste them in with **Import…** in
the same place. Imported aliases are added to the ones you have.

### Updating

```bash
cd ~/Code/bifrost-figma-shortcuts && git pull
```

- **Plugin:** nothing else to do. The next time you open the palette it runs
  the new version.
- **Companion app:** only if `git pull` lists changes in `companion/dist/`.
  Quit it (menu bar icon › Quit), copy the new app over the old one in
  Applications, and open it. macOS treats it as a new app: in **System
  Settings › Privacy & Security › Accessibility**, remove the old entry with
  `−` and turn the new one on. Until 0.4.0 the app was called **Bifrost
  Numpad**: delete that one from Applications (and turn off its **Launch at
  login** first, if you use it). Your shortcuts carry over, and a shortcut
  for Fix variables now opens Review variables. Since 0.5.0, an alias's key is set in the
  palette; aliases named `0`–`9` or with a letter keep that key, so the
  numpad works as before. Aliases named `10`–`29` have no numbered command
  anymore: import your aliases (step 5.6) and their recorded shortcuts work
  again.

### Troubleshooting

| Problem | Fix |
|---|---|
| "not in an enabled library" | Enable the Bifrost libraries in this file (step 3) |
| "font … isn't available" | Install that font on your Mac (text styles need their font locally) |
| ⌃⌥ + a key does nothing | Turn on **⌃⌥ + key runs aliases** in the app's menu, and check that the alias has that key (`?` › Aliases) |
| The shortcut or a numpad key does nothing | Check the menu bar icon: dimmed means paused (turn on **Enabled**) or no Accessibility access (step 5.3) |
| Nothing happens, and the menu bar icon flashes a warning sign | The plugin isn't installed, or was imported from a folder that moved (step 2) |
| Toast: `No alias on ⌃⌥3` | Give an alias the key `3` in the palette's Aliases tab (`?` › Aliases) |
| Toast: `No alias in slot 4`, a recorded shortcut runs the wrong alias, or the app's menu says "no slot" | Aliases changed since the last import: Copy as JSON and import again (step 5.6) |
| Numpad types digits instead | You're in a text field (W/H, layer name, a text layer); that's on purpose. Click the canvas first |
| Text typed right after the shortcut is lost, and the icon flashes a warning sign | The palette took over 3 s to open, so the held keys were dropped instead of reaching Figma as shortcuts. Type again |
| A shortcut also does something else in Figma | Record another one (step 5.4 or 5.6); the app takes it over while Figma is in front |
| macOS says the app "can't be opened" or "is damaged" | The repo was downloaded as a zip. Delete it and use `git clone` (step 1) |

## Using the palette

1. Open the Actions menu (⌘K, ⌘/ or ⌘, depending on your keyboard layout).
2. Type `bif` and press Enter. The Bifrost palette opens.
3. Either type a command and press Enter (each part you type gets a box once
   it's recognized, and the `✓` row shows how your input was understood), or open a group (Padding, Gap, Radius, Fill, Text, Component)
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
| Tab | Open a group, or copy a row's shorthand to the input to chain more (`p m`, Tab, `g s`) |
| → | Open the focused group (at the end of what you typed; never applies) |
| Esc / Backspace / ← | Leave a group (Backspace and ← with nothing typed); Esc on an empty palette closes it |


| Type | Does |
|---|---|
| `p m` or `p 12` | Padding M on all sides (a size can be its name or its value) |
| `ph l`, `pv s` | Padding horizontal / vertical |
| `pt m`, `pb m`, `pl m`, `pr m` | Padding on one side |
| `g s`, `g auto` | Gap S, or auto (space between). On a grid, `g s` sets both grid gaps |
| `gc s`, `gr m` | Grid column / row gap; only offered when the frame has grid layout |
| `r l`, `r full` | Radius on all corners |
| `rt m`, `rtl s`, `rbr m` | Radius on two corners / one corner |
| `f brand`, `f base3`, `f base-1` | Fill, fuzzy match on the color name (dashes optional) |
| `f`, `b` on text, an icon or a bordered layer | Colors allowed on the background behind the selection come first; others are marked ⚠ (hover it for the reason: not allowed here, or too little contrast in Light or Dark), but can still be applied |
| `f` on a frame or rectangle | Background colors come first; text-only colors (`bfc-base-c-*`, the `fade-c` colors) are marked ⚠ not a background color |
| Enter on "N colors break the color rules" | Shows or hides the colors marked ⚠ (folded away by default; the color you typed exactly is always shown) |
| `b brand`, `b basedimmed3`, `b base-dimmed-3` | Border: that color, always 1px on all sides |
| `h1` … `h5`, `t regular` | Text style on the selected text, or on all text inside a selected frame; with no text in the selection it inserts a text layer ("Header H5", or "icons" for an icon style) colored `bfc-base-c-1` |
| `icon m`, `icon h3 solid` | Icon styles (Font Awesome), found by size and variant like text styles; only the ones turned on in the Options tab |
| `h1 This is a heading`, `icon m solid star` | Text after a text or icon style is its content: replaces the selected text's content, or goes in a new text (inside a selected frame). For icons it's the icon name. It ends at the next command: `h1 Welcome f brand` |
| `regular`, `italic`, `l`, `link` with styled text or an icon selected | The selection's own style with only that part changed comes first: M Semibold + `regular` → M Regular, Icon H3 Solid + `reg` → Icon H3 Regular |
| `h3`, `solid`, `duo` with an icon selected | Font Awesome icons first: the icon in another size (same variant) or another variant (same size). With an icon selected, the empty palette lists these on top |
| `frame` | Insert a frame (placed like components, see below), filled with `bfc-base-3` |
| `alh`, `alv` | Auto layout horizontal / vertical on the selected frames |
| `frame alh p m r m b base-dimmed3` | Build a styled auto-layout frame in one go |
| `frame alh button button` | Everything inserted after `frame` goes inside it (it gets auto layout if it has none), and the frame hugs its contents |
| `post-it`, `post-it Check the spacing` | Insert a post-it note (design files have no FigJam stickies): a 240×240 `bfc-warning` section, so Figma never puts it inside a frame you drop it on. It always goes in the middle of the view. Its text is ready for typing: "Note" is selected, so typing replaces it; text after `post-it` is its content, with the cursor after it |
| `fill`, `fillv`, `fillhv` | Fill the width, height or both; only for layers inside an auto layout (also one you just inserted into it: `button fill`) |
| `hug`, `hugv`, `hughv` | Hug the content; on auto-layout frames and text (a frame without auto layout gets it) |
| `fixed 320`, `fixedv 48`, `fixedhv 100` | A fixed size in px for the width, height or both |
| `button`, `btn`, `basic input`, `brand` | Search components, text styles and colors by name |
| `p m g s r l` | Several at once |
| `button p m` | Insert a Button and give it padding M |
| `?` | Help, aliases and recents |

The rule: a property (`p`, `pl`, `rtl`, `f`, …) is always followed by a space
and its value. So `rl l` is Radius left L and `r l` is Radius L, never a
guess. The old glued form (`pm`) shows where the space goes, and aliases saved
in it are rewritten with spaces the next time the plugin runs.

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
  `frame`), plus anything that follows them, like `button p m`. The palette
  updates live when the selection changes.
- **Boxes in the input:** every recognized part gets a box: a property with
  its value (`rl l`), a name (`basic input`), an alias (`cta`). A dashed box
  is still waiting for its value. If something isn't boxed, it isn't
  understood yet.
- **Window size:** drag the bottom-right corner to resize. The size is
  remembered for next time.
- **Padding and gap add auto layout** to a frame that doesn't have it, so
  `p m` or `g s` works on any frame. The direction follows the children like Shift+A: side
  by side becomes horizontal, anything else vertical. The row says "(adds
  auto layout)" when this happens. Use `alh`/`alv` first to choose yourself.
  New auto layout always starts with padding M (12px), Bifrost's default,
  instead of Figma's; a padding in the same command replaces it.
- **Frames** (`frame`) are placed the same way as components and become the
  selection, so everything after `frame` applies to the new frame. Adding auto
  layout (`alh`/`alv`) to a frame with children makes it hug them, like
  Shift+A; an empty frame keeps its size. Instances are left alone.
- **Components** insert the default variant. With an auto-layout frame
  selected the instance is added as its last child, with anything else
  selected it's added right after it, and with nothing selected it lands in
  the center of the viewport. The new instance gets selected, and anything
  after the component in the same command applies to it.
- **The breakpoint template** (`breakpoint`, or Component › Breakpoints)
  first asks which service it's for: Enter or → lists the services (type to
  filter), and the chosen service's logo goes in every TopBar and its name
  instead of "Name of project". "No service", on top, keeps the template's
  own logo and text. Services you never use can be turned off under Options ›
  Component › Breakpoints › Services. Then it asks for a page title: type one
  and press Enter to put it in every header, the last breadcrumb, a
  selected sidebar item and the "Frame name" label, or press Enter right away to skip it. It's inserted
  as a section (detached, without the "(detach og konverter …)" note), named
  after the page title, else the service (or Breakpoints Template), on the
  page where it doesn't cover anything: in the middle of the view if there's
  room, otherwise to the right of everything. Recents remember the service
  and the title.
- **Aliases** are saved in the help view's Aliases tab (`?` › Aliases). Names
  can be words or numbers (`1` → `p m g s`), and they work anywhere a command
  can start, so `cta r l` works if `cta` is an alias. They never
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

### Reviewing variables

**Review variables in the selection** (on the empty palette, or type
`review`) checks the selection and everything inside it for padding, gap,
radius, fill and border values set by hand instead of with a variable, and
for text without a text style.
- Text, icon and border colors are checked against the color behind them
  (the nearest parent with a fill), using Bifrost's pairing rules:
  `bfc-neutral-hc` text on `bfc-alert` gets an allowed replacement
  (`bfc-alert-c`), and hovering its ⚠ shows why and the contrast in
  Light and Dark. Fills on frames and rectangles are checked as
  backgrounds: a frame bound to `bfc-base-c-1` is "not a background color".
  Both are listed under **Against the color rules**. Proposals for colors
  set by hand only use colors allowed there.
- Unstyled text gets the text style that matches its font: the same family,
  weight and size, or else the closest (an Inter 12 text becomes
  `S Regular`, an unstyled icon its icon style). Body text is
  preferred over links; text with mixed fonts or sizes is left alone.

- Every value gets one proposal: **Exact matches** like `Padding 12px → M`,
  and **Nearest value** for values off the scale (`Padding 11px → M`; a tie
  goes to the larger size, so 3px becomes XS 4px).
- All proposals start checked. **Space** (or a click) unchecks the focused
  one, **Tab** (or a click on the header) its whole section. **Enter** applies
  the focused row (checked or not), or what an Accept row on top says
  (only the checked exact matches or nearest values); **Shift+Enter**
  applies everything checked. Unchecked proposals are never applied and stay
  unchecked while you edit. Each apply is one undo step. The footer says
  how many layers failed to bind (details in the console) and how many new
  findings the fix uncovered, e.g. text that can be checked against the
  color rules once its background is a token.
- Colors are matched against the Mode tokens (Light/Dark) in the layer's
  modes; theme, effect and primitive tokens are never proposed. Many tokens
  share a hex (white is nine), so the layer's role decides: text gets content
  colors (`bfc-base-c-*`), everything else background colors, Base before
  Pop. White frame → `bfc-base-3`, teal text → `bfc-base-c-brand`. Text is
  only ever proposed a content or Pop color, never a Base background color.
- A layer the plugin can't read is listed in red and skipped; the rest of
  the review still works.
- Inside an instance only its overrides count (padding you changed on that
  Button, say). What it inherits comes from the main component, so fix it
  there.
- Skipped: zeros, and gaps set to Auto (space-between).
- The list follows the selection and your edits, and typing filters it.
- A preview above the list shows the focused row: the layers it covers,
  zoomed to fit (up to 4x), with padding as tinted bands on the sides it
  applies to, gap as strips between the children, radius on the corners,
  colors as an outline, and a label like `Padding 11px → M`. Fix all zooms
  out to show everything; places in other selected frames are counted in
  the corner. The preview is an exported image, so it changes nothing in
  the file: no undo steps, nothing visible to others.

**Plugins › Bifrost › Review variables** opens the palette straight in the
review. Give it a shortcut in Bifrost Figma Companion (menu bar icon ›
**Review variables**).

### Stream Deck

Use a text or multi-action key that types the whole sequence, e.g.
⌘K → `bif` → Enter → `p m g s` → Enter.

## Bifrost Figma Companion

The plugin has menu commands under **Plugins › Development › Bifrost** that
run an alias directly, without opening the palette: **Aliases › Key a** to
**Key 9** run the alias given that key, **Companion slots › Slot 0–29** the
alias the plugin put in that slot. If the alias is missing or can't apply to
the selection, a toast says why. Figma plugin menus are fixed in the
manifest, so commands can't be named after your aliases. Instead, every alias
gets a slot, and Copy as JSON tells the app which. A slot number isn't the
alias's name: alias `1` runs from **Key 1**, and **Slot 1** is whichever
alias got slot 1.

**Bifrost Figma Companion** (`companion/`, set up in [step 5](#5-optional-shortcuts-and-numpad-keys))
is a small menu bar app that presses those commands for you: **Key q** for
⌃⌥Q, **Key 3** for ⌃⌥3 or numpad 3, the alias's slot for a shortcut
recorded on it, and **Open palette** or **Review variables** for their
shortcuts. What an alias does is set in the palette; the app only stores
which keys run which alias, and the imported names and slots.

- It only acts while Figma is the frontmost app. Other apps never see a
  difference.
- Shortcuts (the palette's default is ⌃⌥Space) work anywhere in Figma, also
  while you edit text. Click a command in the app's menu to record one; it
  needs ⌘, ⌃ or ⌥ so plain typing can't trigger it. ⌫ in the record window
  removes the shortcut, Esc cancels. A shortcut runs one command: recording
  it again moves it. A recorded ⌃⌥ shortcut wins over the alias on that key.
- Numpad digits only count without modifiers. Top-row digits and ⌘/⌥/⌃/⇧
  combos are untouched, and while you type in a field (W/H, layer name, a
  text layer) the numpad types digits as usual.
- The menu bar icon flashes highlighted when a key runs, and a warning sign if the
  command couldn't be found in Figma's menu. It's dimmed while paused or without
  Accessibility access.
- Its menu has **Enabled** (a pause for all keys; every launch starts
  enabled), the shortcuts (Open palette, Review variables, and Aliases with one
  row per alias command), **Launch at login** and **Quit**.

## Maintaining the plugin

### Releasing a new version of the companion app

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
   node generate.js bifrost-variables.json . bifrost-text-styles.json bifrost-components.json bifrost-color-rules.json bifrost-templates.json
   ```
   `bifrost-color-rules.json` is written by hand from the Variables file's
   Color systems page (which colors may be text, icon or border on which
   background); update it when that page changes.

   `bifrost-templates.json` holds the breakpoint template and its services.
   When logos are added, open the Breakpoints template file, paste this and
   save the output as `bifrost-templates.json` (`name` is the plugin's name
   for it, `page` its group in the palette):
   ```js
   (async () => {
     const template = await figma.getNodeByIdAsync("4529:13435");
     const topBar = template.findOne((n) => n.type === "INSTANCE" && Object.keys(n.componentProperties).some((k) => k.startsWith("Logo#")));
     const prop = Object.entries(topBar.componentProperties).find(([k]) => k.startsWith("Logo#"))[1];
     const logos = [];
     for (const p of prop.preferredValues) {
       const c = p.type === "COMPONENT_SET" ? await figma.importComponentSetByKeyAsync(p.key) : await figma.importComponentByKeyAsync(p.key);
       const name = c.name.trim();
       if (!logos.some((l) => l.name === name)) logos.push({ name, key: p.key, isSet: p.type === "COMPONENT_SET" });
     }
     console.log(JSON.stringify([{ name: "Breakpoints Template", id: template.id, key: template.key, isSet: false, page: "Breakpoints", logos }], null, 2));
   })();
   ```
   The services are the TopBar's preferred logos (its Logo property); a
   logo with variants uses its default variant.

### Files

| File | What it is |
|---|---|
| `manifest.json` | Plugin manifest (generated) |
| `code.js` | Plugin code run by Figma (generated, don't edit) |
| `src/parse.js` | Command syntax parser (pure, tested; also runs inside the palette) |
| `src/runtime.js` | Resolving and applying tokens, recents, aliases, palette messages |
| `src/ui.html` | The palette window and its help view |
| `generate.js` | Builds `manifest.json` + `code.js` from the JSON exports and `src/` |
| `bifrost-*.json` | Exports of variables, text styles and components from Figma, plus the hand-written color rules and templates |
| `test/parse.test.js` | Parser tests: `node --test test/` |
| `companion/` | Bifrost Figma Companion menu bar app (Swift package, `build.sh`) |
