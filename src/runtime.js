// --- Runtime ---
// Running the plugin opens the palette window (UI_HTML). Parsing happens inside
// the window for instant feedback; this side applies ops and owns storage.
//
// UI -> code: ready | apply {ops, keepOpen} | saveAlias {name, expansion} |
//             deleteAlias {name} | clearRecents | import {json} | vars | close
// code -> UI: init {entries, aliases, recents, selection} | selection {selection} |
//             state {aliases, recents, error, notice}

const ENTRIES = Object.keys(VARIABLE_MAP).map((slug) => Object.assign({ slug }, VARIABLE_MAP[slug]));
const MAX_RECENTS = 8;

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

// Aliases ({ name: expansion }) and recents ([{ ops, label }]) live in clientStorage:
// per user and per machine, not synced. The help view can export/import aliases.
const state = { aliases: {}, recents: [] };
const stateReady = Promise.all([
  figma.clientStorage.getAsync("aliases"),
  figma.clientStorage.getAsync("recents"),
]).then(([aliases, recents]) => {
  state.aliases = aliases || {};
  state.recents = recents || [];
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
function placeInstance(instance, anchor) {
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

// Returns how many nodes the op touched.
async function applyOp(op, target, nodes) {
  if (op.kind === "component") {
    const instance = target.createInstance();
    placeInstance(instance, nodes[0]);
    figma.currentPage.selection = [instance];
    return 1;
  }
  let touched = 0;
  for (const node of nodes) {
    if (op.kind === "fill") {
      if (!("fills" in node) || node.fills === figma.mixed) continue;
      const fills = clone(node.fills);
      const base = fills.length > 0 && fills[0].type === "SOLID" ? fills[0] : { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
      fills[0] = figma.variables.setBoundVariableForPaint(base, "color", target);
      node.fills = fills;
      touched++;
    } else if (op.kind === "textstyle") {
      if (node.type !== "TEXT") continue;
      await node.setTextStyleIdAsync(target.id);
      touched++;
    } else {
      let hit = bindFields(node, FIELD_SETS[op.kind][op.side], target);
      // Some nodes have a uniform cornerRadius but no individual corners
      if (!hit && op.kind === "radius" && op.side === "ALL") hit = bindFields(node, ["cornerRadius"], target);
      if (hit) touched++;
    }
  }
  return touched;
}

// Applies ops in order and returns a one-line summary. Ops after a component
// insert apply to the new instance.
async function applyOps(ops) {
  let nodes = [...figma.currentPage.selection];
  const label = describeOps(ops);
  // Figma's own running indicator only shows the plugin name. Say what's
  // happening, but only if resolving is slow (e.g. first import from a library).
  let loading = null;
  const timer = setTimeout(() => {
    loading = figma.notify(label + "…", { timeout: Infinity });
  }, 400);
  const skipped = [];
  try {
    for (const op of ops) {
      const entry = VARIABLE_MAP[op.slug];
      const target = entry ? await RESOLVE_FN[entry.type](entry) : null;
      if (!target) {
        skipped.push(op.label + " (not in an enabled library)");
        continue;
      }
      if ((await applyOp(op, target, nodes)) === 0) skipped.push(op.label);
      if (op.kind === "component") nodes = [...figma.currentPage.selection];
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

// Accepts { "aliases": { "name": "expansion" } } as produced by Export. Valid
// aliases are merged in; invalid ones are reported and skipped.
async function importAliases(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return "Not valid JSON";
  }
  const incoming = data && typeof data.aliases === "object" ? data.aliases : null;
  if (!incoming) return 'Expected { "aliases": { "name": "expansion" } }';
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

function selectionInfo() {
  const sel = figma.currentPage.selection;
  return {
    count: sel.length,
    hasText: sel.some((n) => n.type === "TEXT"),
    hasAutoLayout: sel.some((n) => "layoutMode" in n && n.layoutMode !== "NONE"),
  };
}

function postState(error, notice) {
  figma.ui.postMessage({ type: "state", aliases: state.aliases, recents: state.recents, error: error || null, notice: notice || null });
}

async function handleMessage(msg) {
  await stateReady;
  if (msg.type === "ready") {
    figma.ui.postMessage({
      type: "init",
      entries: ENTRIES.map((e) => ({ slug: e.slug, kind: e.kind, name: e.name })),
      aliases: state.aliases,
      recents: state.recents,
      selection: selectionInfo(),
    });
  } else if (msg.type === "apply") {
    const result = await applyOps(msg.ops);
    if (msg.keepOpen) return postState(result.failed ? result.message : null, result.failed ? null : result.message);
    figma.notify(result.message, { error: result.failed });
    figma.closePlugin();
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
  } else if (msg.type === "import") {
    const error = await importAliases(msg.json);
    postState(error, error ? null : "Imported aliases");
  } else if (msg.type === "vars") {
    await listVariables();
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
}

figma.showUI(UI_HTML, { width: 440, height: 480, themeColors: true, title: "Bifrost" });
figma.ui.onmessage = (msg) =>
  handleMessage(msg).catch((e) => {
    console.error(e);
    postState("Error: " + e.message);
  });
figma.on("selectionchange", () => figma.ui.postMessage({ type: "selection", selection: selectionInfo() }));

// ---------- Debug / export helper ----------

async function listVariables() {
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
  figma.notify("Logged " + result.length + " variables to the console");
  figma.closePlugin();
}
