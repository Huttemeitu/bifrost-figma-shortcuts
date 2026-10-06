// --- Runtime ---
// "Open palette" opens the palette window (UI_HTML). Parsing happens inside the
// window for instant feedback; this side applies ops and owns storage.
// "Numpad N" runs alias N headless (runAlias).
//
// UI -> code: ready | apply {ops, keepOpen} | saveAlias {name, expansion} |
//             deleteAlias {name} | clearRecents | setHidden {hidden} | import {json} |
//             resize {width, height, save} | vars | close
// code -> UI: init {entries, values, aliases, recents, hidden, selection} | selection {selection} |
//             (selection = {count, nodes: distinct nodeCaps of the selected layers,
//              modes: {collection name: mode name} of the first selected layer})
//             state {aliases, recents, hidden, error, notice}

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
  gap: { ALL: ["itemSpacing", "counterAxisSpacing"] },
};

// Aliases ({ name: expansion }), recents ([{ ops, label }]) and hidden options
// (slugs the user turned off in the Options tab) live in clientStorage: per user
// and per machine, not synced. The help view can export/import aliases and hidden.
const state = { aliases: {}, recents: [], hidden: [], size: DEFAULT_SIZE };
const stateReady = Promise.all([
  figma.clientStorage.getAsync("aliases"),
  figma.clientStorage.getAsync("recents"),
  figma.clientStorage.getAsync("hidden"),
  figma.clientStorage.getAsync("size"),
]).then(([aliases, recents, hidden, size]) => {
  state.aliases = aliases || {};
  state.recents = recents || [];
  state.size = size || DEFAULT_SIZE;
  // Drop slugs that are no longer generated (e.g. after a library update), so
  // the "N hidden" count stays right.
  state.hidden = (hidden || []).filter((slug) => VARIABLE_MAP[slug]);
});

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
function setAutoLayout(node, direction) {
  const adding = node.layoutMode === "NONE";
  node.layoutMode = direction;
  if (adding && node.children.length) {
    node.primaryAxisSizingMode = "AUTO";
    node.counterAxisSizingMode = "AUTO";
  }
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
    // Instances get their auto layout from the main component.
    canAutoLayout: "layoutMode" in node && node.type !== "INSTANCE",
    text: node.type === "TEXT",
  };
}

// Text styles can only be applied once their font is loaded. Throws a readable
// error if the font isn't available on this machine.
async function loadStyleFont(style) {
  try {
    await figma.loadFontAsync(style.fontName);
  } catch (e) {
    throw new Error("font " + style.fontName.family + " " + style.fontName.style + " isn't available");
  }
}

// H1-H5 get "Header H5" as their text, other styles "Text".
async function insertText(style, anchor) {
  const text = figma.createText();
  await figma.loadFontAsync(text.fontName);
  await loadStyleFont(style);
  text.characters = /^H[1-5]$/.test(style.name) ? "Header " + style.name : "Text";
  await text.setTextStyleIdAsync(style.id);
  placeNode(text, anchor);
  figma.currentPage.selection = [text];
}

// Returns how many layers the op touched. mode comes from checkOps: "insert"
// creates a layer (frame, component, or text when no text is selected).
async function applyOp(op, target, nodes, mode) {
  if (op.kind === "frame") {
    const frame = figma.createFrame();
    frame.name = "Frame";
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
    await insertText(target, nodes[0]);
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
      setAutoLayout(node, op.value);
    } else if (op.kind === "padding" || op.kind === "gap") {
      if (node.layoutMode === "NONE") setAutoLayout(node, guessDirection(node));
      bindFields(node, FIELD_SETS[op.kind][op.side], target);
    } else if (op.kind === "textstyle") {
      await node.setTextStyleIdAsync(target.id);
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
  // Figma's own running indicator only shows the plugin name. Say what's
  // happening, but only if resolving is slow (e.g. first import from a library).
  let loading = null;
  const timer = setTimeout(() => {
    loading = figma.notify(label + "…", { timeout: Infinity });
  }, 400);
  const skipped = [];
  try {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      // Word ops (frame, alh, alv) have no token to resolve.
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
      if (check.modes[i] === "insert") nodes = [...figma.currentPage.selection];
    }
    await remember(ops, label);
  } catch (e) {
    console.error(e);
    skipped.push("error: " + e.message);
  } finally {
    clearTimeout(timer);
    if (loading) loading.cancel();
  }
  return { message: skipped.length ? "Skipped: " + skipped.join(", ") : "✓ " + label, failed: skipped.length === ops.length };
}

async function remember(ops, label) {
  state.recents = [{ ops, label }].concat(state.recents.filter((r) => r.label !== label)).slice(0, MAX_RECENTS);
  await figma.clientStorage.setAsync("recents", state.recents);
}

// ---------- Aliases ----------

async function setAlias(name, expansion) {
  if (expansion) state.aliases[name] = expansion;
  else delete state.aliases[name];
  await figma.clientStorage.setAsync("aliases", state.aliases);
}

// Accepts { "aliases": { "name": "expansion" }, "hidden": [slugs] } as produced by
// Copy as JSON. Valid aliases are merged in, invalid ones are reported and
// skipped. hidden replaces the current choice; unknown slugs are dropped.
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
  for (const name of Object.keys(incoming)) {
    const err = aliasError(ENTRIES, name, String(incoming[name]));
    if (err) rejected.push(name + " (" + err + ")");
    else state.aliases[name] = String(incoming[name]);
  }
  await figma.clientStorage.setAsync("aliases", state.aliases);
  return rejected.length ? "Skipped: " + rejected.join(", ") : null;
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
  return { count: sel.length, nodes: [...seen.values()], modes: await layerModes(sel[0]) };
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
  figma.ui.postMessage({ type: "state", aliases: state.aliases, recents: state.recents, hidden: state.hidden, error: error || null, notice: notice || null });
}

async function handleMessage(msg) {
  await stateReady;
  if (msg.type === "ready") {
    figma.ui.postMessage({
      type: "init",
      entries: ENTRIES.map((e) => ({ slug: e.slug, id: e.id, kind: e.kind, name: e.name, group: e.group, value: e.value })),
      values: VARIABLE_VALUES,
      aliases: state.aliases,
      recents: state.recents,
      hidden: state.hidden,
      selection: await selectionInfo(),
    });
  } else if (msg.type === "apply") {
    const result = await applyOps(msg.ops);
    if (msg.keepOpen) return postState(result.failed ? result.message : null, result.failed ? null : result.message);
    closeWith(result);
  } else if (msg.type === "saveAlias") {
    const name = String(msg.name || "").trim().toLowerCase();
    const expansion = String(msg.expansion || "").trim();
    const error = aliasError(ENTRIES, name, expansion);
    if (!error) await setAlias(name, expansion);
    postState(error, error ? null : "Saved alias " + name);
  } else if (msg.type === "deleteAlias") {
    await setAlias(msg.name, "");
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

// Numpad N runs alias N with no window, so a key bound to the menu item applies
// it directly. This is what the numpad companion app triggers.
async function runAlias(name) {
  const found = aliasOps(ENTRIES, state.aliases, name);
  closeWith(found.error ? { message: found.error, failed: true } : await applyOps(found.ops));
}

// Opened after storage is read, so the window starts at the size it had last time.
stateReady.then(() => {
  const numpad = /^numpad-(\d)$/.exec(figma.command);
  if (numpad) return runAlias(numpad[1]);
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
