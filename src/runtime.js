// --- Runtime ---
// "Open palette" opens the palette window (UI_HTML). Parsing happens inside the
// window for instant feedback; this side applies ops and owns storage.
// "Review variables" opens it in the review (init's `start`, so a shortcut can
// go straight there). "Key q" runs the alias on key q headless, "Slot N" the
// alias in slot N (runAlias).
//
// UI -> code: ready | apply {ops, keepOpen} | saveAlias {name, expansion, key} |
//             deleteAlias {name} | clearRecents | setHidden {hidden} | import {json} |
//             resize {width, height, save} | review | fixReview {fixes: [{key, slug}]} |
//             preview {keys, width, height} (show these review groups in the palette) |
//             vars | close
// code -> UI: init {entries, values, rules, aliasKeys, aliases, keys, slots, recents, hidden, start, selection} | selection {selection} |
//             (selection = {count, nodes: distinct nodeCaps of the selected layers,
//              modes: {collection name: mode name} of the first selected layer,
//              icon: {family, style, fontSize} when only Font Awesome icons are selected,
//              textStyle: slug of the text style all selected text uses, or null,
//              background: slug of the Bifrost color behind every selected layer, or null})
//             state {aliases, keys, slots, recents, hidden, error, notice} |
//             (keys = {key: alias name}, slots = {alias name: slot number}, for
//              Copy as JSON and the companion)
//             review {groups: [{key, kind, value, modes, role, layers, match, exact, background,
//                     pairing: {from, reason, detail} | null}], layers, errors} |
//             changed (the document changed; an open review scans again) |
//             preview {keys, imageId, image?, origin, focus, marks, elsewhere} or {keys, empty}

const ENTRIES = Object.keys(VARIABLE_MAP).map((slug) => Object.assign({ slug }, VARIABLE_MAP[slug]));
const MAX_RECENTS = 8;
const DEFAULT_SIZE = { width: 520, height: 600 };
const MIN_SIZE = { width: 380, height: 360 };

const FIELD_SETS = {
  padding: {
    T: ["paddingTop"],
    B: ["paddingBottom"],
    L: ["paddingLeft"],
    R: ["paddingRight"],
    H: ["paddingLeft", "paddingRight"],
    V: ["paddingTop", "paddingBottom"],
    ALL: ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"],
  },
  radius: {
    TL: ["topLeftRadius"],
    TR: ["topRightRadius"],
    BL: ["bottomLeftRadius"],
    BR: ["bottomRightRadius"],
    T: ["topLeftRadius", "topRightRadius"],
    B: ["bottomLeftRadius", "bottomRightRadius"],
    L: ["topLeftRadius", "bottomLeftRadius"],
    R: ["topRightRadius", "bottomRightRadius"],
    ALL: ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"],
  },
  gap: { ALL: ["itemSpacing", "counterAxisSpacing"], COL: ["gridColumnGap"], ROW: ["gridRowGap"] },
};

// Aliases ({ name: expansion }), their keys ({ key: name }) and slots (assignSlots), recents
// ([{ ops, label }]) and hidden options (slugs the user turned off in the
// Options tab) live in clientStorage: per user and per machine, not synced. The
// help view can export/import aliases and hidden.
const state = { aliases: {}, keys: {}, slots: { slots: [], next: 0 }, recents: [], hidden: [], size: DEFAULT_SIZE };
const stateReady = Promise.all([
  figma.clientStorage.getAsync("aliases"),
  figma.clientStorage.getAsync("keys"),
  figma.clientStorage.getAsync("slots"),
  figma.clientStorage.getAsync("recents"),
  figma.clientStorage.getAsync("hidden"),
  figma.clientStorage.getAsync("size"),
]).then(async ([aliases, keys, slots, recents, hidden, size]) => {
  state.aliases = respaceAliases(aliases || {});
  if (aliases && JSON.stringify(state.aliases) !== JSON.stringify(aliases)) figma.clientStorage.setAsync("aliases", state.aliases);
  // Before keys were their own field, alias 1 ran on numpad 1: such aliases
  // get that key once.
  if (!keys) {
    keys = {};
    for (const name of Object.keys(state.aliases)) if (ALIAS_KEYS.includes(name)) keys[name] = name;
    figma.clientStorage.setAsync("keys", keys);
  }
  state.keys = keys;
  state.slots = slots || state.slots;
  await updateSlots();
  state.recents = (recents || []).map(shortenRecent);
  state.size = size || DEFAULT_SIZE;
  // Drop slugs that are no longer generated (e.g. after a library update), so
  // the "N hidden" count stays right.
  state.hidden = (hidden || []).filter((slug) => VARIABLE_MAP[slug]);
});

// Old glued expansions ("pm gs") get spaces ("p m g s"); ones that can't be
// fixed are kept, so the Aliases tab still shows them with their error.
function respaceAliases(aliases) {
  const out = {};
  for (const name of Object.keys(aliases)) out[name] = respaceAlias(ENTRIES, String(aliases[name])) || String(aliases[name]);
  return out;
}

// The Figma Plugin API has no built-in figma.clone(), so we make our own.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---------- Resolving tokens ----------

async function resolveVariable(entry) {
  try {
    const v = await figma.variables.getVariableByIdAsync(entry.id);
    if (v) return v;
  } catch (e) {
    console.log("Local id failed for " + entry.name + ", trying key", e);
  }
  try {
    return await figma.variables.importVariableByKeyAsync(entry.key);
  } catch (e) {
    console.error("Variable not found: " + entry.name, e);
    return null;
  }
}

async function resolveStyle(entry) {
  try {
    const s = await figma.getStyleByIdAsync(entry.id);
    if (s) return s;
  } catch (e) {
    console.log("Local id failed for style " + entry.name + ", trying key", e);
  }
  try {
    return await figma.importStyleByKeyAsync(entry.key);
  } catch (e) {
    console.error("Style not found: " + entry.name, e);
    return null;
  }
}

// The local id is only trusted if the key matches: node ids aren't global, so the
// same id can point to an unrelated node in another file.
async function resolveComponent(entry) {
  try {
    const local = await figma.getNodeByIdAsync(entry.id);
    if (local && local.key === entry.key) return entry.isSet ? local.defaultVariant : local;
  } catch (e) {
    console.log("Local id failed for component " + entry.name + ", trying key", e);
  }
  try {
    if (entry.isSet) return (await figma.importComponentSetByKeyAsync(entry.key)).defaultVariant;
    return await figma.importComponentByKeyAsync(entry.key);
  } catch (e) {
    console.error("Component not found: " + entry.name, e);
    return null;
  }
}

const RESOLVE_FN = { variable: resolveVariable, style: resolveStyle, component: resolveComponent };

// ---------- Applying ops ----------

// Auto-layout frame selected: add as last child. Anything else selected: add
// right after it as a sibling. Nothing selected, or Figma refuses (e.g. inside
// an instance): center of the viewport.
function placeNode(instance, anchor) {
  try {
    if (anchor && anchor.type !== "INSTANCE" && "layoutMode" in anchor && anchor.layoutMode !== "NONE") {
      anchor.appendChild(instance);
      return;
    }
    const parent = anchor && anchor.parent;
    if (parent && "insertChild" in parent) {
      parent.insertChild(parent.children.indexOf(anchor) + 1, instance);
      if (!("layoutMode" in parent) || parent.layoutMode === "NONE") {
        instance.x = anchor.x + anchor.width + 16;
        instance.y = anchor.y;
      }
      return;
    }
  } catch (e) {
    console.log("Could not place next to the selection, using viewport center", e);
  }
  figma.currentPage.appendChild(instance);
  instance.x = figma.viewport.center.x - instance.width / 2;
  instance.y = figma.viewport.center.y - instance.height / 2;
}

function bindFields(node, fields, variable) {
  let hit = false;
  for (const field of fields) {
    if (!(field in node)) continue;
    try {
      node.setBoundVariable(field, variable);
      hit = true;
    } catch (e) {
      console.error(field, e);
    }
  }
  return hit;
}

// Binds the color variable to the first paint of node.fills or node.strokes,
// adding a solid paint if there is none. Text with several colors (mixed fills)
// gets one fill for all of it.
function bindPaint(node, prop, variable) {
  const paints = node[prop] === figma.mixed ? [] : clone(node[prop]);
  const base = paints.length > 0 && paints[0].type === "SOLID" ? paints[0] : { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
  paints[0] = figma.variables.setBoundVariableForPaint(base, "color", variable);
  node[prop] = paints;
}

// Adding auto layout to a frame with children makes it hug them, like Shift+A in
// Figma. An empty frame keeps its size, so "frame alh" doesn't collapse to 0x0.
// New auto layout gets Bifrost's padding M (12px) instead of Figma's default;
// switching the direction of an existing one leaves its padding alone.
async function setAutoLayout(node, direction) {
  const adding = node.layoutMode === "NONE";
  node.layoutMode = direction;
  if (adding && node.children.length) {
    node.primaryAxisSizingMode = "AUTO";
    node.counterAxisSizingMode = "AUTO";
  }
  if (!adding) return;
  const padding = ENTRIES.find((e) => e.kind === "padding" && e.name === "M");
  const variable = padding && (await resolveVariable(padding));
  if (variable) bindFields(node, FIELD_SETS.padding.ALL, variable);
}

// For padding or gap on a frame without auto layout: children spread out more
// sideways than downwards become a row, like Shift+A does. Otherwise a column.
function guessDirection(node) {
  const spread = (axis, size) => {
    const centers = node.children.map((c) => c[axis] + c[size] / 2);
    return Math.max(...centers) - Math.min(...centers);
  };
  return node.children.length > 1 && spread("x", "width") > spread("y", "height") ? "HORIZONTAL" : "VERTICAL";
}

// What each layer can take, for opSupports/checkOps in parse.js.
function nodeCaps(node) {
  return {
    fills: "fills" in node,
    strokes: "strokes" in node,
    radius: "cornerRadius" in node,
    corners: "topLeftRadius" in node,
    autoLayout: "layoutMode" in node && node.layoutMode !== "NONE",
    grid: "layoutMode" in node && node.layoutMode === "GRID",
    // Instances get their auto layout from the main component.
    canAutoLayout: "layoutMode" in node && node.type !== "INSTANCE",
    // Text, or a frame or group with text inside: text styles then apply to
    // all of it, like Figma's design panel. Otherwise they insert a new text.
    text: node.type === "TEXT" || ("findOne" in node && node.findOne((n) => n.type === "TEXT") !== null),
    // Free text ("h1 Hello") only rewrites a text layer itself.
    textLayer: node.type === "TEXT",
    // Its fill is a background (colorUse).
    surface: isSurface(node),
    // Fill only exists for children of an auto-layout frame.
    inAutoLayout: Boolean(node.parent && "layoutMode" in node.parent && node.parent.layoutMode !== "NONE"),
  };
}

// Fill, hug or a fixed size on a layer's width (H), height (V) or both.
// Figma only has these modes on auto-layout frames, their children and text;
// anything else just gets resized for a fixed size. Text needs its fonts
// loaded to change size, and a fixed width keeps growing in height.
async function applySizing(node, op) {
  if (node.type === "TEXT") {
    for (const font of node.getRangeAllFontNames(0, node.characters.length)) await figma.loadFontAsync(font).catch(() => {});
    if (op.value === "FIXED") node.textAutoResize = op.axes.includes("V") ? "NONE" : "HEIGHT";
  }
  for (const axis of op.axes) {
    const prop = axis === "H" ? "layoutSizingHorizontal" : "layoutSizingVertical";
    if (op.value !== "FIXED") {
      node[prop] = op.value;
      continue;
    }
    node.resize(axis === "H" ? op.size : node.width, axis === "V" ? op.size : node.height);
    const hasModes = node.type === "TEXT" || nodeCaps(node).inAutoLayout || nodeCaps(node).autoLayout;
    if (hasModes) node[prop] = "FIXED";
  }
}

// Text styles can only be applied once their font is loaded. Figma gives no
// fontName for some Bifrost styles (the Open Sans Regular and Italic ones,
// checked 2026-10-14: missing even with no variables bound), so then the font
// comes from the style's name, size/family/weight/usage. Throws a readable
// error if the font isn't available on this machine.
async function loadStyleFont(style) {
  const [, family, weight] = style.name.split("/");
  const font = style.fontName && style.fontName.family ? style.fontName : { family, style: weight };
  if (!font.family || !font.style) throw new Error(style.name + " has no font Figma can read");
  try {
    await figma.loadFontAsync(font);
  } catch (e) {
    throw new Error("font " + font.family + " " + font.style + " isn't available");
  }
}

// A text style goes to the layer if it's text, or to every text layer inside
// it. Figma can accept the call and still not apply the style (seen
// 2026-10-14 on a selected text layer, cause unknown), so the result is
// checked and reported instead of the command silently doing nothing.
// With content ("h1 This is a heading") only text layers themselves are
// changed, and get the new content too; text inside a frame is left alone.
async function applyTextStyle(node, style, content) {
  if (content !== undefined && node.type !== "TEXT") return;
  const texts = node.type === "TEXT" ? [node] : node.findAll((n) => n.type === "TEXT");
  const failed = [];
  for (const text of texts) {
    await text.setTextStyleIdAsync(style.id);
    // The style's font is loaded and now covers the whole layer.
    if (content !== undefined) text.characters = content;
    if (text.textStyleId !== style.id) {
      console.warn("Text style not applied", { layer: text.name, expected: style.id, actual: text.textStyleId, key: style.key, remote: style.remote });
      failed.push(text.name);
    }
  }
  if (failed.length) {
    throw new Error("Figma didn't apply " + style.name + " to " + failed.slice(0, 2).join(", ") + (failed.length > 2 ? " and " + (failed.length - 2) + " more" : ""));
  }
}

// New layers get Bifrost colors instead of Figma's defaults: frames
// Base/bfc-base-3 (not plain white), text Base/bfc-base-c-1 (not black).
// Left as Figma made it if the library isn't enabled.
async function bindDefaultFill(node, name) {
  const entry = ENTRIES.find((e) => e.kind === "fill" && e.name === name);
  const variable = entry && (await resolveVariable(entry));
  if (variable) bindPaint(node, "fills", variable);
}

// A new text layer with the given content, or by default "Header H5" for
// headings, "icons" for Font Awesome styles
// (the placeholder Bifrost puts in icon slots; the font draws it as an icon),
// otherwise "Text". Style names are size/family/weight/usage. Its color is
// the default text color (bindDefaultFill).
async function insertText(style, anchor, content) {
  const text = figma.createText();
  await figma.loadFontAsync(text.fontName);
  await loadStyleFont(style);
  const size = style.name.split("/")[0];
  text.characters = content || (/\/Font Awesome\//.test(style.name) ? "icons" : /^H[1-5]$/.test(size) ? "Header " + size : "Text");
  await text.setTextStyleIdAsync(style.id);
  await bindDefaultFill(text, "Base/bfc-base-c-1");
  placeNode(text, anchor);
  figma.currentPage.selection = [text];
}

// Gap auto is space-between. A gap token on such a frame switches it back to
// packed, or the token wouldn't show. Plain gap on a grid sets both grid gaps.
function applyGap(node, op, variable) {
  if (op.value === "auto") {
    node.primaryAxisAlignItems = "SPACE_BETWEEN";
    return;
  }
  if (op.side === "ALL" && node.layoutMode === "GRID") return bindFields(node, [...FIELD_SETS.gap.COL, ...FIELD_SETS.gap.ROW], variable);
  if (op.side === "ALL" && node.primaryAxisAlignItems === "SPACE_BETWEEN") node.primaryAxisAlignItems = "MIN";
  bindFields(node, FIELD_SETS.gap[op.side], variable);
}

// Returns how many layers the op touched. mode comes from checkOps: "insert"
// creates a layer (frame, component, or text when no text is selected).
async function applyOp(op, target, nodes, mode) {
  if (op.kind === "frame") {
    const frame = figma.createFrame();
    frame.name = "Frame";
    await bindDefaultFill(frame, "Base/bfc-base-3");
    placeNode(frame, nodes[0]);
    figma.currentPage.selection = [frame];
    return 1;
  }
  if (op.kind === "component") {
    const instance = target.createInstance();
    placeNode(instance, nodes[0]);
    figma.currentPage.selection = [instance];
    return 1;
  }
  if (op.kind === "textstyle" && mode === "insert") {
    await insertText(target, nodes[0], op.text);
    return 1;
  }
  if (op.kind === "textstyle") await loadStyleFont(target);
  let touched = 0;
  for (const node of nodes) {
    if (!opSupports(nodeCaps(node), op)) continue;
    if (op.kind === "fill") {
      bindPaint(node, "fills", target);
    } else if (op.kind === "stroke") {
      bindPaint(node, "strokes", target);
      // Borders always default to 1px on all sides, replacing per-side weights.
      if ("strokeWeight" in node) node.strokeWeight = 1;
    } else if (op.kind === "autolayout") {
      await setAutoLayout(node, op.value);
    } else if (op.kind === "gap") {
      if (node.layoutMode === "NONE") await setAutoLayout(node, guessDirection(node));
      applyGap(node, op, target);
    } else if (op.kind === "padding") {
      if (node.layoutMode === "NONE") await setAutoLayout(node, guessDirection(node));
      bindFields(node, FIELD_SETS[op.kind][op.side], target);
    } else if (op.kind === "textstyle") {
      await applyTextStyle(node, target, op.text);
    } else if (op.kind === "sizing") {
      if (op.value === "HUG" && node.layoutMode === "NONE") await setAutoLayout(node, guessDirection(node));
      await applySizing(node, op);
    } else if (op.kind === "radius" && op.side === "ALL" && !nodeCaps(node).corners) {
      // Shapes like stars and polygons only have one uniform radius
      bindFields(node, ["cornerRadius"], target);
    } else {
      bindFields(node, FIELD_SETS[op.kind][op.side], target);
    }
    touched++;
  }
  return touched;
}

async function applyOps(ops) {
  let nodes = [...figma.currentPage.selection];
  // The palette only offers ops that pass this check, but the selection may have
  // changed since. Never apply something that would partly do nothing.
  const check = checkOps(ops, nodes.map(nodeCaps));
  if (check.error) return { message: check.error, failed: true };
  const label = describeOpsIn(ops, check.modes);
  const done = slowNotice(label);
  const skipped = [];
  // Inserts after "frame" go inside that frame ("frame alh button button"),
  // which gets vertical auto layout if it has none yet. When the command is
  // done, each new frame with children hugs them on every axis no resizing
  // op set ("frame fixed 320 alh button" stays 320 wide).
  let container = null;
  const frames = [];
  const sized = new Set();
  try {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const inserting = check.modes[i] === "insert";
      if (inserting && container && !container.removed) {
        if (container.layoutMode === "NONE") await setAutoLayout(container, "VERTICAL");
        nodes = [container];
      }
      if (op.kind === "sizing") for (const node of nodes) for (const axis of op.axes) sized.add(node.id + axis);
      // Word ops (frame, alh, alv) and gap auto have no token to resolve.
      let target = null;
      if (op.slug) {
        const entry = VARIABLE_MAP[op.slug];
        if (!entry) {
          skipped.push(op.label + " (no longer in the plugin)");
          continue;
        }
        target = await RESOLVE_FN[entry.type](entry);
        if (!target) {
          skipped.push(op.label + " (not in an enabled library)");
          continue;
        }
      }
      if ((await applyOp(op, target, nodes, check.modes[i])) === 0) skipped.push(op.label);
      if (inserting) nodes = [...figma.currentPage.selection];
      if (op.kind === "frame") frames.push((container = nodes[0]));
    }
    for (const frame of frames) {
      if (frame.removed || !frame.children.length || frame.layoutMode === "NONE") continue;
      if (!sized.has(frame.id + "H")) frame.layoutSizingHorizontal = "HUG";
      if (!sized.has(frame.id + "V")) frame.layoutSizingVertical = "HUG";
    }
    await remember(ops, label);
  } catch (e) {
    console.error(e);
    skipped.push("error: " + e.message);
  } finally {
    done();
  }
  return { message: skipped.length ? "Skipped: " + skipped.join(", ") : "✓ " + label, failed: skipped.length === ops.length };
}

// Figma's own running indicator only shows the plugin name. Say what's
// happening, but only if it's slow (e.g. the first import from a library).
// Returns a function that ends it.
function slowNotice(label) {
  let loading = null;
  const timer = setTimeout(() => {
    loading = figma.notify(label + "…", { timeout: Infinity });
  }, 400);
  return () => {
    clearTimeout(timer);
    if (loading) loading.cancel();
  };
}

// Recents saved before display names (2026-10-14) have full token paths in
// their labels; shortened so they read and dedupe like new ones.
function shortenRecent(recent) {
  const shorten = (label, ops) =>
    ops.reduce((text, op) => (op.slug && VARIABLE_MAP[op.slug] ? text.replace(VARIABLE_MAP[op.slug].name, displayName(VARIABLE_MAP[op.slug])) : text), label);
  const ops = recent.ops.map((op) => Object.assign({}, op, { label: shorten(op.label, [op]) }));
  return { ops, label: shorten(recent.label, recent.ops) };
}

async function remember(ops, label) {
  state.recents = [{ ops, label }].concat(state.recents.filter((r) => r.label !== label)).slice(0, MAX_RECENTS);
  await figma.clientStorage.setAsync("recents", state.recents);
}

// ---------- Aliases ----------

// key is the alias's ⌃⌥ key ("" for none); taking a key from another alias
// moves it here.
async function setAlias(name, expansion, key) {
  if (expansion) state.aliases[name] = expansion;
  else delete state.aliases[name];
  for (const k of Object.keys(state.keys)) if (state.keys[k] === name || k === key) delete state.keys[k];
  if (expansion && key) state.keys[key] = name;
  await figma.clientStorage.setAsync("aliases", state.aliases);
  await figma.clientStorage.setAsync("keys", state.keys);
  await updateSlots();
}

async function updateSlots() {
  const slots = assignSlots(state.slots, Object.keys(state.aliases), ALIAS_SLOTS);
  if (JSON.stringify(slots) === JSON.stringify(state.slots)) return;
  state.slots = slots;
  await figma.clientStorage.setAsync("slots", slots);
}

function slotMap() {
  const out = {};
  state.slots.slots.forEach((name, n) => name && (out[name] = n));
  return out;
}

// Accepts { "aliases": { "name": "expansion" }, "hidden": [slugs] } as produced by
// Copy as JSON. Valid aliases are merged in, invalid ones are reported and
// skipped. hidden replaces the current choice; unknown slugs are dropped.
// keys are taken for imported aliases, unless the key is invalid. "slots" is
// for the companion and ignored: slots are given out per machine.
async function importBackup(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return "Not valid JSON";
  }
  const incoming = data && typeof data.aliases === "object" ? data.aliases : null;
  if (!incoming && !Array.isArray(data && data.hidden)) return 'Expected { "aliases": { ... }, "hidden": [ ... ] }';
  if (Array.isArray(data.hidden)) {
    state.hidden = data.hidden.filter((slug) => VARIABLE_MAP[slug]);
    await figma.clientStorage.setAsync("hidden", state.hidden);
  }
  if (!incoming) return null;
  const rejected = [];
  const respaced = respaceAliases(incoming);
  for (const name of Object.keys(respaced)) {
    const err = aliasError(ENTRIES, name, respaced[name]);
    if (err) rejected.push(name + " (" + err + ")");
    else state.aliases[name] = respaced[name];
  }
  const keys = data.keys && typeof data.keys === "object" ? data.keys : {};
  for (const key of Object.keys(keys)) if (ALIAS_KEYS.includes(key) && state.aliases[keys[key]]) state.keys[key] = keys[key];
  await figma.clientStorage.setAsync("aliases", state.aliases);
  await figma.clientStorage.setAsync("keys", state.keys);
  await updateSlots();
  return rejected.length ? "Skipped: " + rejected.join(", ") : null;
}

// ---------- Color pairing ----------

// The Bifrost fill entry a paint is bound to, or null (hex, or another
// library). Matched by variable key, since library variables have other ids
// in each file. Cached per variable id.
const paintEntries = new Map();
async function paintEntry(paint) {
  const id = paint && paint.boundVariables && paint.boundVariables.color && paint.boundVariables.color.id;
  if (!id) return null;
  if (!paintEntries.has(id)) {
    const variable = await figma.variables.getVariableByIdAsync(id).catch(() => null);
    paintEntries.set(id, (variable && ENTRIES.find((e) => e.kind === "fill" && e.key === variable.key)) || null);
  }
  return paintEntries.get(id);
}

// The color behind a layer: the top visible fill of its nearest parent that
// has one, as a Bifrost fill entry. null when that fill isn't one solid
// Bifrost token (a hex, another library, nothing with a fill) or can't be
// judged as one color: a gradient, an image, or a see-through solid, where
// the color under it shows. Siblings underneath aren't considered:
// overlapping layers are guesswork.
async function backgroundEntry(node) {
  for (let p = node.parent; p && p.type !== "PAGE" && p.type !== "DOCUMENT"; p = p.parent) {
    if (!("fills" in p) || p.fills === figma.mixed) continue;
    const top = [...p.fills].reverse().find((f) => f.visible !== false && (f.opacity === undefined || f.opacity > 0));
    if (top) return top.type === "SOLID" && (top.opacity === undefined || top.opacity === 1) ? paintEntry(top) : null;
  }
  return null;
}

// What a color is on a layer, for the pairing rules: a border, a text or icon
// fill, or a background (a fill on a frame or rectangle). Fills on other
// shapes (vectors, ellipses) can be either, so they're left alone (null).
function colorUse(node, prop) {
  if (prop === "strokes") return "border";
  if (isSurface(node)) return "background";
  if (node.type !== "TEXT") return null;
  return node.fontName && node.fontName !== figma.mixed && /^Font Awesome/.test(node.fontName.family) ? "icon" : "text";
}

function isSurface(node) {
  return "layoutMode" in node || node.type === "RECTANGLE";
}

// ---------- Variable review ----------

// The last scan, by group key, so fixReview gets layers and fields from here
// and the palette only sends keys.
let review = new Map();

// Padding, gap, radius, fill and stroke values in the selection (and everything
// inside it) that aren't bound to a variable, and text without a text style,
// grouped by kind, value (a text's font) and, for colors, the layer's modes
// (the same hex can be another token in Dark) and role (text gets content
// colors). Returns { groups, layers, errors }. Skipped: zeros (every plain
// frame has them) and gap with space-between, which Figma shows as Auto.
// Inside an instance only its overrides count, the values changed on that
// instance; the rest comes from the main component and is fixed there.
async function scanSelection() {
  const groups = new Map();
  const errors = [];
  let layers = 0;
  // role (fills only): "text" or "shape", since text gets content colors.
  // context (colors only): { background?, use, from? } where background is the
  // fill entry behind the layer (none for use "background") and from the
  // token a pairing problem is about.
  const add = (kind, value, modes, role, target, context) => {
    const where = context ? [context.background ? context.background.slug : "", context.use, context.from ? context.from.slug : ""].join(" ") : "";
    const key = [kind, value, role || "", modes ? JSON.stringify(modes) : "", where].join(" ");
    if (!groups.has(key)) groups.set(key, Object.assign({ key, kind, value, modes, role, targets: [] }, context));
    groups.get(key).targets.push(target);
    return groups.get(key);
  };
  // overrides: layer id -> overridden fields, for everything inside an instance.
  const scanNode = async (node, overrides) => {
    const counts = (field) => !overrides || (overrides.has(node.id) && overrides.get(node.id).has(field));
    const bound = node.boundVariables || {};
    const numbers = (kind, fields) => {
      for (const field of fields) {
        if (typeof node[field] === "number" && node[field] > 0 && !bound[field] && counts(field)) add(kind, node[field], null, null, { node, field });
      }
    };
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      numbers("padding", FIELD_SETS.padding.ALL);
      if (node.layoutMode === "GRID") numbers("gap", [...FIELD_SETS.gap.COL, ...FIELD_SETS.gap.ROW]);
      else if (node.primaryAxisAlignItems !== "SPACE_BETWEEN") numbers("gap", ["itemSpacing"]);
      if (node.layoutWrap === "WRAP") numbers("gap", ["counterAxisSpacing"]);
    }
    if ("topLeftRadius" in node) numbers("radius", FIELD_SETS.radius.ALL);
    else if ("cornerRadius" in node) numbers("radius", ["cornerRadius"]);
    // Text without a text style, by font: "Open Sans Regular 14px". Text with
    // several weights or sizes in one layer is left alone. Figma reports no
    // usable fontName for some Open Sans text (missing or figma.mixed even for
    // one run of text, like the styles it came from; seen 2026-10-14), so the
    // weight number and size carry the match and the family is used when
    // there is one.
    const textChanged = counts("textStyleId") || counts("fontName") || counts("fontSize");
    const uniform = node.fontSize !== figma.mixed && node.fontWeight !== figma.mixed;
    if (node.type === "TEXT" && node.textStyleId === "" && textChanged && uniform) {
      const name = node.fontName && node.fontName !== figma.mixed && node.fontName.family ? node.fontName : null;
      const font = { family: name && name.family, style: name && name.style, weight: node.fontWeight, size: node.fontSize };
      const value = (name ? name.family + " " + name.style : "weight " + font.weight) + " " + formatValue(font.size);
      add("textstyle", value, null, null, { node, textStyle: true }).font = font;
    }
    // Colors set by hand get a token; text, icon and border colors are also
    // checked against the background (Bifrost's pairing rules), bound or not,
    // and backgrounds against being a background color at all: a bound color
    // that isn't allowed there, or reads badly in Light or Dark, is a finding
    // of its own with an allowed replacement.
    let modes = null;
    let background;
    for (const [prop, kind] of [["fills", "fill"], ["strokes", "stroke"]]) {
      if (!(prop in node) || node[prop] === figma.mixed || (prop === "strokes" && node.strokeWeight === 0) || !counts(prop)) continue;
      const use = colorUse(node, prop);
      for (let index = 0; index < node[prop].length; index++) {
        const paint = node[prop][index];
        if (paint.type !== "SOLID" || paint.visible === false) continue;
        modes = modes || (await layerModes(node));
        if (use && use !== "background" && background === undefined) background = await backgroundEntry(node);
        const role = kind === "fill" ? (node.type === "TEXT" ? "text" : "shape") : null;
        const context = use === "background" ? { use } : use && background ? { background, use } : null;
        const bound = paint.boundVariables && paint.boundVariables.color;
        if (!bound) {
          const hex = exportValue(Object.assign({}, paint.color, { a: paint.opacity === undefined ? 1 : paint.opacity }));
          add(kind, hex, modes, role, { node, prop, index }, context);
          continue;
        }
        const judged = context && (use === "background" || colorKnown(COLOR_RULES, tokenName(background)));
        const from = judged && (await paintEntry(paint));
        const problem = from && pairingProblem(COLOR_RULES, VARIABLE_VALUES, from, context.background || null, use, modes);
        if (problem) add(kind, resolveValue(VARIABLE_VALUES, from.id, modes), modes, role, { node, prop, index }, Object.assign({ from, problem }, context));
      }
    }
  };
  // A layer that can't be read is reported and skipped, not the whole review.
  const visit = async (node, overrides) => {
    layers++;
    try {
      if (node.type === "INSTANCE") {
        overrides = new Map(overrides);
        for (const o of node.overrides || []) overrides.set(o.id, new Set([...(overrides.get(o.id) || []), ...o.overriddenFields]));
      }
      await scanNode(node, overrides);
    } catch (e) {
      console.error("Review skipped " + node.name, e);
      errors.push(node.name + ": " + e.message);
    }
    if ("children" in node) for (const child of node.children) await visit(child, overrides);
  };
  for (const node of figma.currentPage.selection) await visit(node, null);
  return { groups: [...groups.values()], layers, errors };
}

async function startReview() {
  const scan = await scanSelection();
  // Options turned off in the Options tab are never proposed, so the next
  // best token takes their place.
  const hidden = new Set(state.hidden);
  const offered = ENTRIES.filter((e) => !hidden.has(e.slug));
  for (const g of scan.groups) {
    // Only colors allowed for this use (on this background).
    const fits = g.use ? (e) => colorFit(COLOR_RULES, tokenName(e), g.background ? tokenName(g.background) : null, g.use) === "allowed" : null;
    Object.assign(g, g.font ? reviewTextStyle(offered, g.font) : reviewChoices(offered, VARIABLE_VALUES, g.kind, g.value, g.modes || {}, g.role, fits));
  }
  review = new Map(scan.groups.map((g) => [g.key, g]));
  sentImages = new Set();
  return {
    layers: scan.layers,
    errors: scan.errors,
    groups: scan.groups.map((g) => ({
      key: g.key, kind: g.kind, value: g.value, modes: g.modes, role: g.role, match: g.match, exact: g.exact,
      layers: new Set(g.targets.map((t) => t.node.id)).size,
      background: g.background ? displayName(g.background) : null,
      pairing: g.problem ? { from: displayName(g.from), reason: g.problem.reason, detail: g.problem.detail } : null,
    })),
  };
}

// Binds every place in each group to the chosen token, or sets the chosen
// text style on text layers: [{ key, slug }].
// One undo step for the whole fix.
async function fixReview(fixes) {
  const done = slowNotice("Binding variables");
  let bound = 0;
  let failed = 0;
  const skipped = [];
  try {
    for (const { key, slug } of fixes) {
      const group = review.get(key);
      const entry = VARIABLE_MAP[slug];
      if (!group || !entry) continue;
      // A variable to bind, or a text style (with its font loaded) to set.
      const target = await RESOLVE_FN[entry.type](entry);
      if (!target) {
        skipped.push(entry.name + " (not in an enabled library)");
        continue;
      }
      if (entry.type === "style") {
        try {
          await loadStyleFont(target);
        } catch (e) {
          skipped.push(entry.name + " (" + e.message + ")");
          continue;
        }
      }
      for (const t of group.targets) {
        if (t.node.removed) continue;
        try {
          if (t.textStyle) {
            await t.node.setTextStyleIdAsync(target.id);
          } else if (t.field) {
            t.node.setBoundVariable(t.field, target);
          } else {
            const paints = clone(t.node[t.prop]);
            paints[t.index] = figma.variables.setBoundVariableForPaint(paints[t.index], "color", target);
            t.node[t.prop] = paints;
          }
          bound++;
        } catch (e) {
          // Per layer, e.g. a field an instance won't let you override.
          console.error("Couldn't bind " + t.node.name, e);
          failed++;
        }
      }
      review.delete(key);
    }
  } finally {
    done();
  }
  figma.commitUndo();
  const message =
    (bound ? "✓ Bound " + bound + (bound === 1 ? " value" : " values") : "Nothing bound") +
    (failed ? " · " + failed + " failed (see console)" : "") +
    (skipped.length ? ". Skipped: " + skipped.join(", ") : "");
  return { message, failed: bound === 0 };
}

// ---------- Review preview ----------

// The focused review row is shown in the palette, not on the canvas: layers a
// plugin draws there end up in undo history (⌘Z brought them back) and are
// visible to everyone in the file. Exporting an image changes nothing. The
// plugin renders the closest layer that contains the row's places and sends
// the marks (padding bands, gap strips, radius corners, outlines) as canvas
// coordinates; the palette zooms to them and draws the marks on top.
let previewRun = 0;
// Images the palette already has, by imageId. A new scan starts over, since
// the layers may have changed.
let sentImages = new Set();

// width, height: the preview's size in the palette, to pick a sharp scale.
async function sendPreview(keys, width, height) {
  const run = ++previewRun;
  // Per layer: the fields and whether paints are involved, and its label lines.
  const places = new Map();
  for (const group of keys.map((key) => review.get(key)).filter(Boolean)) {
    const name = VARIABLE_MAP[group.match] ? displayName(VARIABLE_MAP[group.match]) : "?";
    for (const t of group.targets) {
      if (t.node.removed || !t.node.absoluteBoundingBox) continue;
      if (!places.has(t.node)) places.set(t.node, { fields: new Set(), paints: false, labels: new Set() });
      const what = places.get(t.node);
      if (t.field) what.fields.add(t.field);
      else what.paints = true;
      what.labels.add(reviewLabel(group) + " → " + name);
    }
  }
  if (!places.size) return figma.ui.postMessage({ type: "preview", keys, empty: true });
  const root = previewRoot([...places.keys()]);
  const shown = [...places.keys()].filter((n) => contains(root, n));
  const origin = root.absoluteBoundingBox;
  const focus = unionBox(shown.map((n) => n.absoluteBoundingBox));
  // Sharp at twice the zoom the palette will use (up to 4x), at most 4096 px,
  // in steps of √2 so moving between rows mostly reuses an image.
  const zoom = Math.min(width / focus.width, height / focus.height, 4);
  const wanted = Math.min(2 * zoom, 4096 / Math.max(origin.width, origin.height));
  const scale = Math.pow(2, Math.floor(Math.log2(wanted) * 2) / 2);
  const imageId = root.id + "@" + scale;
  let image = null;
  if (!sentImages.has(imageId)) {
    try {
      image = await root.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: scale }, useAbsoluteBounds: true });
    } catch (e) {
      console.error("Preview export failed for " + root.name, e);
    }
    if (run !== previewRun) return;
    if (image) sentImages.add(imageId);
  }
  figma.ui.postMessage({
    type: "preview",
    keys,
    imageId: sentImages.has(imageId) ? imageId : null,
    image,
    origin: plainBox(origin),
    focus,
    marks: shown.map((n) => previewMarks(n, places.get(n))),
    elsewhere: places.size - shown.length,
  });
}

// The deepest layer that contains all of them. Layers in different top-level
// frames have only the page in common, which can't be exported: then the
// first one's top-level frame is shown, and the rest count as elsewhere.
function previewRoot(nodes) {
  for (let n = nodes[0]; n && n.type !== "PAGE"; n = n.parent) {
    if (n.parent && n.parent.type === "PAGE") return n;
    if (nodes.every((other) => contains(n, other))) return n;
  }
  return nodes[0];
}

function contains(ancestor, node) {
  for (let n = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

const plainBox = (b) => ({ x: b.x, y: b.y, width: b.width, height: b.height });

function unionBox(boxes) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

const CORNERS = {
  topLeftRadius: [0, 0],
  topRightRadius: [1, 0],
  bottomLeftRadius: [0, 1],
  bottomRightRadius: [1, 1],
};

// What to draw for one layer, in canvas coordinates: tinted bands (padding,
// gap strips, radius corners), whether to outline it (colors, and gaps that
// can't be strips: grid, wrap rows, no children), and its label.
function previewMarks(node, { fields, paints, labels }) {
  const box = node.absoluteBoundingBox;
  const bands = [];
  const band = (x, y, width, height) => {
    if (width > 0 && height > 0) bands.push({ x, y, width, height });
  };
  const pad = (field) => (fields.has(field) ? node[field] : 0);
  band(box.x, box.y, box.width, pad("paddingTop"));
  band(box.x, box.y + box.height - pad("paddingBottom"), box.width, pad("paddingBottom"));
  band(box.x, box.y, pad("paddingLeft"), box.height);
  band(box.x + box.width - pad("paddingRight"), box.y, pad("paddingRight"), box.height);
  const strips = fields.has("itemSpacing") ? gapStrips(node) : [];
  for (const strip of strips) band(...strip);
  for (const [field, [right, bottom]] of Object.entries(CORNERS)) {
    if (!fields.has(field) && !fields.has("cornerRadius")) continue;
    const size = Math.min(node[field] || node.cornerRadius || 0, box.width / 2, box.height / 2);
    band(box.x + right * (box.width - size), box.y + bottom * (box.height - size), size, size);
  }
  const other = [...fields].some((f) => f === "counterAxisSpacing" || f.startsWith("grid"));
  // Fix all can put many changes on one layer; name two and count the rest.
  const lines = [...labels];
  return {
    box: plainBox(box),
    bands,
    outline: paints || other || (fields.has("itemSpacing") && !strips.length),
    label: lines.slice(0, 2).join("  ·  ") + (lines.length > 2 ? "  ·  +" + (lines.length - 2) + " more" : ""),
  };
}

// The spaces between a frame's children in the flow, as [x, y, width, height].
// A child that starts a new wrapped row has no strip before it.
function gapStrips(node) {
  const horizontal = node.layoutMode === "HORIZONTAL";
  const kids = node.children
    .filter((c) => c.visible && c.layoutPositioning !== "ABSOLUTE" && c.absoluteBoundingBox)
    .map((c) => c.absoluteBoundingBox);
  const strips = [];
  for (let i = 1; i < kids.length; i++) {
    const [a, b] = [kids[i - 1], kids[i]];
    const top = Math.min(a.y, b.y);
    const left = Math.min(a.x, b.x);
    if (horizontal && b.x > a.x + a.width) strips.push([a.x + a.width, top, b.x - a.x - a.width, Math.max(a.y + a.height, b.y + b.height) - top]);
    if (!horizontal && b.y > a.y + a.height) strips.push([left, a.y + a.height, Math.max(a.x + a.width, b.x + b.width) - left, b.y - a.y - a.height]);
  }
  return strips;
}

// ---------- Palette window ----------

// Distinct capabilities only: a selection of 500 rectangles is one entry.
async function selectionInfo() {
  const sel = figma.currentPage.selection;
  const seen = new Map();
  for (const node of sel) {
    const caps = nodeCaps(node);
    seen.set(JSON.stringify(caps), caps);
  }
  const texts = selectionTexts(sel);
  return {
    count: sel.length, nodes: [...seen.values()], modes: await layerModes(sel[0]), icon: selectionIcon(texts),
    textStyle: await selectionTextStyle(texts), background: await selectionBackground(sel),
  };
}

// The slug of the Bifrost color behind every selected layer, or null if they
// differ or it isn't known, so the palette can rank colors by what's allowed
// on it.
async function selectionBackground(sel) {
  const slugs = new Set();
  for (const node of sel) {
    const entry = await backgroundEntry(node);
    slugs.add(entry ? entry.slug : null);
  }
  const [slug] = slugs;
  return slugs.size === 1 ? slug : null;
}

// The text layers in the selection: selected ones, and those inside selected frames.
function selectionTexts(sel) {
  return sel.flatMap((n) => (n.type === "TEXT" ? [n] : "findAllWithCriteria" in n ? n.findAllWithCriteria({ types: ["TEXT"] }) : []));
}

// The slug of the Bifrost text style all selected text uses, or null, so the
// palette can offer the same style with one part changed ("regular" turns
// M/Open Sans/Semibold/Text into M/Open Sans/Regular/Text). Matched by key,
// since a library style has another id in each file.
const styleSlugs = new Map();
async function selectionTextStyle(texts) {
  const ids = new Set(texts.map((t) => t.textStyleId));
  const [id] = ids;
  if (ids.size !== 1 || typeof id !== "string" || !id) return null;
  if (!styleSlugs.has(id)) {
    const style = await figma.getStyleByIdAsync(id).catch(() => null);
    const entry = style && ENTRIES.find((e) => e.kind === "textstyle" && e.key === style.key);
    styleSlugs.set(id, entry ? entry.slug : null);
  }
  return styleSlugs.get(id);
}

// The selected icon, if every selected text is a Font Awesome icon (an icon
// text layer, or an icon component with one inside): its font and size, so
// the palette can offer the icon's other sizes and variants first.
function selectionIcon(texts) {
  // Some text has no fontName at all (see scanNode), so check before reading it.
  const isIcon = (t) => t.fontName && t.fontName !== figma.mixed && /^Font Awesome/.test(t.fontName.family);
  if (!texts.length || !texts.every(isIcon)) return null;
  const t = texts[0];
  return { family: t.fontName.family, style: t.fontName.style, fontSize: t.fontSize === figma.mixed ? null : t.fontSize };
}

// The variable modes a layer resolves to (its own or inherited from a parent),
// by collection and mode name. Names, not ids: in a file that uses Bifrost as a
// library, the collections have other ids than in the Variables file.
const collectionCache = new Map();
async function layerModes(node) {
  const modes = {};
  if (!node) return modes;
  for (const [collectionId, modeId] of Object.entries(node.resolvedVariableModes)) {
    if (!collectionCache.has(collectionId)) collectionCache.set(collectionId, await figma.variables.getVariableCollectionByIdAsync(collectionId));
    const collection = collectionCache.get(collectionId);
    const mode = collection && collection.modes.find((m) => m.modeId === modeId);
    if (mode) modes[collection.name] = mode.name;
  }
  return modes;
}

function postState(error, notice) {
  figma.ui.postMessage({ type: "state", aliases: state.aliases, keys: state.keys, slots: slotMap(), recents: state.recents, hidden: state.hidden, error: error || null, notice: notice || null });
}

async function handleMessage(msg) {
  await stateReady;
  if (msg.type === "ready") {
    figma.ui.postMessage({
      type: "init",
      entries: ENTRIES.map((e) => ({ slug: e.slug, id: e.id, kind: e.kind, name: e.name, group: e.group, value: e.value, px: e.px })),
      values: VARIABLE_VALUES,
      rules: COLOR_RULES,
      aliasKeys: ALIAS_KEYS,
      aliases: state.aliases,
      keys: state.keys,
      slots: slotMap(),
      recents: state.recents,
      hidden: state.hidden,
      start: figma.command === "review" ? "review" : null,
      selection: await selectionInfo(),
    });
  } else if (msg.type === "apply") {
    const result = await applyOps(msg.ops);
    if (msg.keepOpen) return postState(result.failed ? result.message : null, result.failed ? null : result.message);
    closeWith(result);
  } else if (msg.type === "saveAlias") {
    const name = String(msg.name || "").trim().toLowerCase();
    const expansion = String(msg.expansion || "").trim();
    const key = String(msg.key || "").trim().toLowerCase();
    const error = aliasError(ENTRIES, name, expansion) || (key && !ALIAS_KEYS.includes(key) ? "Keys are a letter or digit, not h, t or v" : null);
    if (!error) await setAlias(name, expansion, key);
    postState(error, error ? null : "Saved alias " + name);
  } else if (msg.type === "deleteAlias") {
    await setAlias(msg.name, "", "");
    postState(null, "Deleted alias " + msg.name);
  } else if (msg.type === "clearRecents") {
    state.recents = [];
    await figma.clientStorage.setAsync("recents", []);
    postState(null, "Cleared recents");
  } else if (msg.type === "setHidden") {
    // The UI already shows the change; just persist it.
    state.hidden = msg.hidden;
    await figma.clientStorage.setAsync("hidden", state.hidden);
  } else if (msg.type === "import") {
    const error = await importBackup(msg.json);
    postState(error, error ? null : "Imported");
  } else if (msg.type === "resize") {
    // The window's drag handle sends sizes while dragging and save on release.
    const width = Math.max(MIN_SIZE.width, Math.round(msg.width));
    const height = Math.max(MIN_SIZE.height, Math.round(msg.height));
    figma.ui.resize(width, height);
    if (msg.save) {
      state.size = { width, height };
      await figma.clientStorage.setAsync("size", state.size);
    }
  } else if (msg.type === "preview") {
    await sendPreview(msg.keys, msg.width, msg.height);
  } else if (msg.type === "review") {
    figma.ui.postMessage(Object.assign({ type: "review" }, await startReview()));
  } else if (msg.type === "fixReview") {
    // Fixes can uncover findings (a background that's now a token gets its
    // text checked against the color rules), so new rows are counted, or
    // they'd look like leftovers.
    const before = new Set(review.keys());
    const result = await fixReview(msg.fixes);
    const scan = await startReview();
    const fresh = scan.groups.filter((g) => !before.has(g.key)).length;
    const message = result.message + (fresh ? " · " + fresh + (fresh === 1 ? " new finding" : " new findings") : "");
    figma.ui.postMessage(Object.assign({ type: "review" }, scan));
    postState(result.failed ? message : null, result.failed ? null : message);
  } else if (msg.type === "vars") {
    await listVariables();
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
}

function closeWith(result) {
  figma.notify(result.message, { error: result.failed });
  figma.closePlugin();
}

// The alias commands run an alias with no window, so a key bound to the menu
// item applies it directly. This is what the companion app triggers.
async function runAlias(name) {
  const found = aliasOps(ENTRIES, state.aliases, name);
  closeWith(found.error ? { message: found.error, failed: true } : await applyOps(found.ops));
}

// Opened after storage is read, so the window starts at the size it had last time.
stateReady.then(() => {
  const key = /^key-(.)$/.exec(figma.command);
  if (key) {
    const name = state.keys[key[1]];
    if (name) return runAlias(name);
    return closeWith({ message: "No alias on ⌃⌥" + key[1].toUpperCase() + ". Give one that key in the palette: ? › Aliases", failed: true });
  }
  const slot = /^slot-(\d+)$/.exec(figma.command);
  if (slot) {
    const name = state.slots.slots[slot[1]];
    if (name) return runAlias(name);
    return closeWith({ message: "No alias in slot " + slot[1] + ". Import the aliases in the companion again", failed: true });
  }
  figma.showUI(UI_HTML, Object.assign({ themeColors: true, title: "Bifrost" }, state.size));
  figma.ui.onmessage = (msg) =>
    handleMessage(msg).catch((e) => {
      console.error(e);
      postState("Error: " + e.message);
    });
  // Reading modes is async, so a quick second selection change could finish
  // first; only the latest one is sent.
  let latest = 0;
  figma.on("selectionchange", async () => {
    const n = ++latest;
    const selection = await selectionInfo();
    if (n === latest) figma.ui.postMessage({ type: "selection", selection });
  });
  // Edits (also typing a value while the review is open) arrive in bursts
  // while dragging; tell the palette once things settle.
  let changeTimer = null;
  figma.on("documentchange", () => {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => figma.ui.postMessage({ type: "changed" }), 300);
  });
});

// ---------- Debug / export helper ----------

// A variable's raw value in one mode: "#RRGGBB" (plus alpha if not opaque),
// a number, or { alias: id } when it points to another variable. The palette
// resolves aliases with the selected layer's modes (resolveValue in parse.js).
function exportValue(value) {
  if (typeof value === "number") return value;
  if (value && value.type === "VARIABLE_ALIAS") return { alias: value.id };
  if (!value || !("r" in value)) return null;
  const hex = (n) => Math.round(n * 255).toString(16).padStart(2, "0").toUpperCase();
  return "#" + hex(value.r) + hex(value.g) + hex(value.b) + ("a" in value && value.a < 1 ? hex(value.a) : "");
}

async function listVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const result = [];
  for (const c of collections) {
    const defaultMode = c.modes.find((m) => m.modeId === c.defaultModeId).name;
    for (const id of c.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (!v) continue;
      const item = { collection: c.name, name: v.name, id: v.id, key: v.key, resolvedType: v.resolvedType };
      if (v.resolvedType === "COLOR" || v.resolvedType === "FLOAT") {
        item.defaultMode = defaultMode;
        item.values = Object.fromEntries(c.modes.map((m) => [m.name, exportValue(v.valuesByMode[m.modeId])]));
      }
      result.push(item);
    }
  }
  console.log(JSON.stringify(result, null, 2));
  figma.notify("Logged " + result.length + " variables to the console");
  figma.closePlugin();
}
