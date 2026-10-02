# Bifrost Shortcuts for Figma

In short: a Figma plugin that binds Bifrost design tokens (colors, spacing,
radius, text styles) to selected objects, and inserts Bifrost components, via
its own menu commands. Those commands can be bound to regular macOS keyboard
shortcuts (and from there a Stream Deck, since it just sends keystrokes).

The plugin currently has 1006 menu commands: 814 fill colors, 12 padding
variables, 12 gap variables, 7 radius variables, 68 text styles, 86
components, plus 6 "Search - ..." commands (one per category, so you don't
have to scroll a long shortcut list) and one "List variables (JSON)" command
for debugging.

## Files

| File | What it is |
|---|---|
| `manifest.json` | The Figma plugin manifest; defines every menu command |
| `code.js` | The plugin logic (run directly by Figma, no build step) |
| `bifrost-variables.json` | Raw export of Bifrost variables (colors, spacing, radius) from Figma |
| `bifrost-text-styles.json` | Raw export of Bifrost text styles from Figma |
| `bifrost-components.json` | Filtered export of Bifrost components from the Components library |
| `generate.js` | Generates `manifest.json` + `code.js` from the three JSON files above |
| `gen-scripts.js` | Generates `setup-shortcut-placeholders.sh` + `undo-shortcuts.sh` from `manifest.json` |
| `setup-shortcut-placeholders.sh` | Adds the menu commands as empty rows in macOS System Settings, ready to be bound (hand-curated list) |
| `undo-shortcuts.sh` | Permanently deletes selected rows (everything is active by default, see the warning below) |

## Step 1: Check whether you can use the files as they are

If you have access to **the same published Bifrost library** in Figma
(likely, since it's an internal design system), you can probably use
`manifest.json` and `code.js` **unchanged**. Variables, styles and components
are identified by a global `key` that's the same no matter which file or
person uses them, so you don't need to run `generate.js` again.

Just do Step 2 and see if it works. Regenerate first (Step 4) if it doesn't,
or if you want to add or remove tokens.

## Step 2: Register the plugin in Figma

1. Figma desktop app → **Plugins → Development → New Plugin...**
2. Pick any template and save it in its own local folder.
3. Overwrite the two generated files (`manifest.json`, `code.js`) in that
   folder with the files from here.
4. Run the plugin once from **Plugins → Development → Bifrost Shortcuts** in
   a file where the Bifrost library is enabled, to confirm that tokens
   actually resolve (try one of the `Fill - ...` commands on a selected
   object).

## Step 3: Bind keyboard shortcuts

1. Confirm Figma's bundle id (normally the same for everyone, but check):
   ```bash
   osascript -e 'id of app "Figma"'
   ```
   If it differs from `com.figma.Desktop`, change the `BUNDLE_ID` variable at
   the top of both `.sh` files (and in `gen-scripts.js` if you regenerate them).
2. **Fully quit System Settings** (Cmd+Q). This is critical, see "Pitfalls"
   below.
3. Run:
   ```bash
   chmod +x setup-shortcut-placeholders.sh
   bash setup-shortcut-placeholders.sh
   ```
4. Open **System Settings → Keyboard → Keyboard Shortcuts → App Shortcuts → Figma**.
   You should see one row per active menu command, with an empty key combination.
5. Double-click the row you want a shortcut for and press the key combination.

## Step 4: Regenerate when the Bifrost library changes (or you use another library)

1. Open the file where the variables and text styles are defined.
2. Run the plugin's `List variables (JSON)` command, or paste this into the
   plugin console (**Plugins → Development → Open Console**):
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
3. For text styles (not variables), paste this instead:
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
   Save as `bifrost-text-styles.json`.
4. For components, open the Bifrost **Components** file (where the components
   are defined, not a file that uses the library) and paste:
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
   internal parts. Save as `bifrost-components.json`.
5. Run (Node.js must be installed, no other dependencies needed):
   ```bash
   node generate.js bifrost-variables.json . bifrost-text-styles.json bifrost-components.json
   ```
   The last two files are optional. Don't run `gen-scripts.js` straight into
   the repo: it overwrites the hand-curated list in
   `setup-shortcut-placeholders.sh` (see `CLAUDE.md`).
6. Run the plugin once in Figma to confirm the new `code.js` works, and run
   `setup-shortcut-placeholders.sh` again (Step 3.2 to 3.3) to add
   placeholders for any new commands.

## Components

`Component - ...` inserts an instance of the component (the default variant
for component sets) and selects it:

- Auto-layout frame selected: the instance is added as its last child.
- Anything else selected: the instance is added right after the selected object.
- Nothing selected: the instance is placed in the center of the viewport.

The Bifrost Components library must be published and enabled in the file
you're working in.

## Pitfalls (learned the hard way)

- **Always fully quit System Settings before running `setup-shortcut-placeholders.sh` or `undo-shortcuts.sh`.**
  If it has been open, it caches an old state and writes it back to disk
  when it quits, overwriting what the script just did.
- **Menu names can't contain `:`**. It's PlistBuddy's path separator, and it
  also seems to break macOS's own shortcut matching. `generate.js` uses
  `" - "` instead.
- **Don't try to "unassign" a shortcut back to empty in the UI**
  (double-click + Delete); it doesn't work reliably. Use `undo-shortcuts.sh`
  (deletes the row completely) and then run `setup-shortcut-placeholders.sh`
  again (adds it back empty).
- `undo-shortcuts.sh` deletes **every** row in its list unless you comment
  out the lines you want to keep with `#` first. It can't be undone beyond
  the backup it takes.
- Both `.sh` scripts automatically take a full backup of Figma's preferences
  first (`~/figma-shortcuts-backup-<timestamp>-<pid>.plist`). Use
  `defaults import com.figma.Desktop <backup-file>` to roll back if something
  goes wrong.
