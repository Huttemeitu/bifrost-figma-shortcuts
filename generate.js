// generate.js: rerun whenever the Bifrost library gets new variables, styles or components.
// Usage: node generate.js <variables.json> <outDir> [textstyles.json] [components.json]
//
// Reads the JSON exports from the Figma console snippets (see README) and writes
// manifest.json + code.js with:
//  - COLOR variables -> "Fill - <name>"
//  - FLOAT "Spacing/..." -> "Padding - <name>" AND "Gap - <name>"
//  - FLOAT "Border radius/..." -> "Radius - <name>"
//  - Text styles (optional, from textstyles.json) -> "Text - <name>"
//  - Components (optional, from components.json) -> "Component - <name>"
//  - one "Search - <label>" command per kind

const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2];
const outDir = process.argv[3] || ".";
const textStylesPath = process.argv[4];
const componentsPath = process.argv[5];

if (!inputPath) {
  console.error("Usage: node generate.js <variables.json> <outDir> [textstyles.json] [components.json]");
  process.exit(1);
}

const variables = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const textStyles = textStylesPath ? JSON.parse(fs.readFileSync(textStylesPath, "utf8")) : [];
const components = componentsPath ? JSON.parse(fs.readFileSync(componentsPath, "utf8")) : [];

function slugify(prefix, name) {
  return (
    prefix +
    "-" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

const usedSlugs = new Set();
function uniqueSlug(prefix, name) {
  let base = slugify(prefix, name);
  let slug = base;
  let i = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${i++}`;
  usedSlugs.add(slug);
  return slug;
}

function stripPrefix(name, prefix) {
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

// The standard headings get clean names ("H1") so they're easy to find in Search
// and System Settings among the same-sized Font Awesome icon styles.
const HEADING_STYLE = /^(H[1-5])\/Satoshi\/Text$/;
function textStyleLabel(name) {
  const m = name.match(HEADING_STYLE);
  return m ? m[1] : name;
}

// Component names like "Image" or "Basic input" say little on their own, so they
// get the page name in front ("Modal/Image") unless they already start with it.
function componentLabel(c) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(c.name).startsWith(norm(c.page)) ? c.name : `${c.page}/${c.name}`;
}

// ":" is PlistBuddy's path separator and breaks macOS shortcut matching.
function menuName(label, name) {
  return `${label} - ${name.replace(/\s*:\s*/g, " - ")}`;
}

// ---------- Classification ----------

const colorVars = variables.filter((v) => v.resolvedType === "COLOR");
const spacingVars = variables.filter(
  (v) => v.resolvedType === "FLOAT" && v.name.startsWith("Spacing/")
);
const radiusVars = variables.filter(
  (v) => v.resolvedType === "FLOAT" && v.name.startsWith("Border radius/")
);

const KINDS = {
  fill: {
    label: "Fill",
    entries: colorVars.map((v) => ({
      slug: uniqueSlug("fill", v.name),
      name: v.name,
      id: v.id,
      key: v.key,
    })),
  },
  padding: {
    label: "Padding",
    entries: spacingVars.map((v) => ({
      slug: uniqueSlug("pad", v.name),
      name: stripPrefix(v.name, "Spacing/"),
      id: v.id,
      key: v.key,
    })),
  },
  gap: {
    label: "Gap",
    entries: spacingVars.map((v) => ({
      slug: uniqueSlug("gap", v.name),
      name: stripPrefix(v.name, "Spacing/"),
      id: v.id,
      key: v.key,
    })),
  },
  radius: {
    label: "Radius",
    entries: radiusVars.map((v) => ({
      slug: uniqueSlug("radius", v.name),
      name: stripPrefix(v.name, "Border radius/"),
      id: v.id,
      key: v.key,
    })),
  },
  textstyle: {
    label: "Text",
    entries: textStyles.map((s) => ({
      slug: uniqueSlug("text", s.name),
      name: textStyleLabel(s.name),
      id: s.id,
      key: s.key,
    })),
  },
  component: {
    label: "Component",
    entries: components.map((c) => {
      const name = componentLabel(c);
      return { slug: uniqueSlug("comp", name), name, id: c.id, key: c.key, isSet: c.isSet };
    }),
  },
};

// ---------- manifest.json ----------

const menu = [
  { name: "List variables (JSON)", command: "list-variables" },
];

for (const [kind, def] of Object.entries(KINDS)) {
  menu.push({
    name: `Search - ${def.label}`,
    command: `search-${kind}`,
    parameters: [{ name: "Variable", key: "variable", allowFreeform: false }],
  });
}
for (const [kind, def] of Object.entries(KINDS)) {
  for (const e of def.entries) {
    menu.push({ name: menuName(def.label, e.name), command: e.slug });
  }
}

const manifest = {
  name: "Bifrost Shortcuts",
  id: "bifrost-fill-shortcuts",
  api: "1.0.0",
  main: "code.js",
  editorType: ["figma"],
  menu,
};

// ---------- code.js ----------

// Flat lookup: slug -> { id, key, name, kind, type, isSet? }
const TYPE_BY_KIND = { textstyle: "style", component: "component" };
const flatMap = {};
for (const [kind, def] of Object.entries(KINDS)) {
  for (const e of def.entries) {
    flatMap[e.slug] = {
      id: e.id,
      key: e.key,
      name: e.name,
      kind,
      type: TYPE_BY_KIND[kind] || "variable",
    };
    if (e.isSet) flatMap[e.slug].isSet = true;
  }
}

const variableMapLiteral = JSON.stringify(flatMap, null, 2);

const codeJs = `// code.js: GENERATED by generate.js. Edit generate.js and regenerate
// instead of editing this file (or VARIABLE_MAP) by hand.

const VARIABLE_MAP = ${variableMapLiteral};

// The Figma Plugin API has no built-in figma.clone(), so we make our own.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function resolveVariable(entry) {
  if (!entry) return null;
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
  if (!entry) return null;
  try {
    const s = await figma.getStyleByIdAsync(entry.id);
    if (s) return s;
  } catch (e) {
    console.log("Local id failed for style " + entry.name + ", trying key", e);
  }
  try {
    return await figma.importStyleByKeyAsync(entry.key, "TEXT");
  } catch (e) {
    console.error("Style not found: " + entry.name, e);
    return null;
  }
}

// The local id is only trusted if the key matches: node ids aren't global, so the
// same id can point to an unrelated node in another file.
async function resolveComponent(entry) {
  if (!entry) return null;
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

async function withSelectionGuard(variable, nodes, fn) {
  if (nodes.length === 0) {
    figma.notify("Select at least one object first");
    figma.closePlugin();
    return;
  }
  if (!variable) {
    figma.notify("Variable not found. See the console for details");
    figma.closePlugin();
    return;
  }
  try {
    const touched = await fn(variable, nodes);
    figma.notify(touched === 0 ? "None of the selected objects support this field" : "Updated: " + variable.name);
  } catch (e) {
    console.error("Error during setBoundVariable:", e);
    figma.notify("Error: " + e.message);
  } finally {
    figma.closePlugin();
  }
}

// --- FILL (paint color) ---
async function applyFill(variable) {
  const nodes = [...figma.currentPage.selection];
  await withSelectionGuard(variable, nodes, async (variable, nodes) => {
    let touched = 0;
    for (const node of nodes) {
      if (!("fills" in node)) continue;
      const fills = clone(node.fills);
      const basePaint =
        fills.length > 0 && fills[0].type === "SOLID"
          ? fills[0]
          : { type: "SOLID", color: { r: 0, g: 0, b: 0 } };
      fills[0] = figma.variables.setBoundVariableForPaint(basePaint, "color", variable);
      node.fills = fills;
      touched++;
    }
    return touched;
  });
}

// --- FIELD PICKER (popup for Padding/Radius: which side/corner/pair to set) ---

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
};

function buildPickerHtml(kind, label, pxValue) {
  const isPadding = kind === "padding";
  const title = isPadding ? "Padding" : "Radius";
  const safeLabel = String(label || "").replace(/</g, "&lt;");
  const safePx = String(pxValue || "").replace(/</g, "&lt;");

  // --- Icons (original, simple line icons in the spirit of Figma's own
  // padding/radius icons; not Figma's actual assets, which we don't have
  // access to) ---
  const ICON = {
    padT: '<svg viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35"/><rect x="2" y="2" width="14" height="3.5" rx="1" fill="currentColor"/></svg>',
    padB: '<svg viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35"/><rect x="2" y="12.5" width="14" height="3.5" rx="1" fill="currentColor"/></svg>',
    padL: '<svg viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35"/><rect x="2" y="2" width="3.5" height="14" rx="1" fill="currentColor"/></svg>',
    padR: '<svg viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35"/><rect x="12.5" y="2" width="3.5" height="14" rx="1" fill="currentColor"/></svg>',
    padH: '<svg viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35"/><rect x="2" y="2" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="12.5" y="2" width="3.5" height="14" rx="1" fill="currentColor"/></svg>',
    padV: '<svg viewBox="0 0 18 18"><rect x="2" y="2" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35"/><rect x="2" y="2" width="14" height="3.5" rx="1" fill="currentColor"/><rect x="2" y="12.5" width="14" height="3.5" rx="1" fill="currentColor"/></svg>',
    padAll: '<svg viewBox="0 0 18 18"><rect x="2.5" y="2.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
    radTL: '<svg viewBox="0 0 18 18"><path d="M2,11 L2,7 A5,5 0 0 1 7,2 L11,2" fill="none" stroke="currentColor" stroke-width="1.15"/></svg>',
    radTR: '<svg viewBox="0 0 18 18"><path d="M7,2 L11,2 A5,5 0 0 1 16,7 L16,11" fill="none" stroke="currentColor" stroke-width="1.15"/></svg>',
    radBL: '<svg viewBox="0 0 18 18"><path d="M11,16 L7,16 A5,5 0 0 1 2,11 L2,7" fill="none" stroke="currentColor" stroke-width="1.15"/></svg>',
    radBR: '<svg viewBox="0 0 18 18"><path d="M16,7 L16,11 A5,5 0 0 1 11,16 L7,16" fill="none" stroke="currentColor" stroke-width="1.15"/></svg>',
    radT: '<svg viewBox="0 0 28 14"><path d="M1,11 L1,7 A6,6 0 0 1 7,1" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M21,1 A6,6 0 0 1 27,7 L27,11" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M7,1 L21,1" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/></svg>',
    radB: '<svg viewBox="0 0 28 14"><path d="M27,3 L27,7 A6,6 0 0 1 21,13" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M7,13 A6,6 0 0 1 1,7 L1,3" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M21,13 L7,13" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/></svg>',
    radL: '<svg viewBox="0 0 14 28"><path d="M1,7 A6,6 0 0 1 7,1 L11,1" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M11,27 L7,27 A6,6 0 0 1 1,21" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M1,7 L1,21" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/></svg>',
    radR: '<svg viewBox="0 0 14 28"><path d="M3,1 L7,1 A6,6 0 0 1 13,7" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M13,21 A6,6 0 0 1 7,27 L3,27" fill="none" stroke="currentColor" stroke-width="1.05"/><path d="M13,7 L13,21" fill="none" stroke="currentColor" stroke-width="1" opacity=".45"/></svg>',
    radAll: '<svg viewBox="0 0 18 18"><path d="M7,2 H11 A5,5 0 0 1 16,7 V11 A5,5 0 0 1 11,16 H7 A5,5 0 0 1 2,11 V7 A5,5 0 0 1 7,2 Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  };

  const paddingBody = \`
    <div class="frame">
      <div class="zone edge top" data-key="T">\${ICON.padT}<span><b>1</b>Top</span></div>
      <div class="zone edge bottom" data-key="B">\${ICON.padB}<span><b>2</b>Bottom</span></div>
      <div class="zone edge left" data-key="L">\${ICON.padL}<span><b>3</b>L</span></div>
      <div class="zone edge right" data-key="R">\${ICON.padR}<span><b>4</b>R</span></div>
      <div class="content" data-key="ALL">\${ICON.padAll}<span>All</span></div>
    </div>
    <div class="pairRow">
      <div class="zone pair" data-key="H">\${ICON.padH}<span><b>5</b>Horizontal</span></div>
      <div class="zone pair" data-key="V">\${ICON.padV}<span><b>6</b>Vertical</span></div>
    </div>\`;

  const radiusBody = \`
    <div class="radiusFrame">
      <div class="zone strip top" data-key="T">\${ICON.radT}<b class="numBadge">5</b></div>
      <div class="zone strip bottom" data-key="B">\${ICON.radB}<b class="numBadge">6</b></div>
      <div class="zone strip left" data-key="L">\${ICON.radL}<b class="numBadge">7</b></div>
      <div class="zone strip right" data-key="R">\${ICON.radR}<b class="numBadge">8</b></div>
      <div class="zone corner tl" data-key="TL">\${ICON.radTL}<b class="numBadge">1</b></div>
      <div class="zone corner tr" data-key="TR">\${ICON.radTR}<b class="numBadge">2</b></div>
      <div class="zone corner bl" data-key="BL">\${ICON.radBL}<b class="numBadge">3</b></div>
      <div class="zone corner br" data-key="BR">\${ICON.radBR}<b class="numBadge">4</b></div>
      <div class="content radiusAll" data-key="ALL">\${ICON.radAll}</div>
    </div>\`;

  return \`<!DOCTYPE html><html><head><style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin:0; padding:18px 18px 14px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:#ffffff; color:#1a1a1a;
    }
    svg { width:22px; height:22px; display:block; }
    .radiusFrame .corner svg, .radiusFrame .radiusAll svg { width:28px; height:28px; }
    .radiusFrame .strip.top svg, .radiusFrame .strip.bottom svg { width:80px; height:40px; }
    .radiusFrame .strip.left svg, .radiusFrame .strip.right svg { width:40px; height:80px; }
    .numBadge {
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      font-size:18px; font-weight:700; color:#7b61ff;
    }
    .zone:hover .numBadge { color:#4b2fd8; }
    .header { font-size:13px; font-weight:600; color:#444; margin-bottom:3px; }
    .valueRow { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:14px; }
    .value { font-size:11.5px; color:#7b61ff; font-weight:600;
              white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
    .pxValue { font-size:11px; color:#9a9aa2; font-weight:600; flex-shrink:0; }

    /* --- Padding-layout --- */
    .frame {
      position:relative; width:190px; height:140px; margin:0 auto;
      background:#f6f6f8; border:1.5px solid #d8d8de; border-radius:8px;
    }
    .content {
      position:absolute; top:30%; left:30%; width:40%; height:40%;
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
      background:#ffffff; border:1.5px dashed #c7c7cf; border-radius:5px;
      font-size:9.5px; color:#9a9aa2; cursor:pointer; user-select:none;
    }
    .content:hover { border-color:#7b61ff; color:#7b61ff; }
    .zone {
      position:absolute; display:flex; align-items:center; justify-content:center; gap:5px;
      font-size:10.5px; color:#55555f; cursor:pointer; user-select:none; line-height:1.3;
      background:#ececf2; border:1px solid #d8d8de; transition:background .12s, color .12s;
    }
    .zone span { display:flex; flex-direction:column; align-items:flex-start; }
    .zone:hover { background:#e2ddff; color:#4b2fd8; border-color:#a894ff; }
    .zone b { font-size:10.5px; color:#7b61ff; }
    .zone:hover b { color:#4b2fd8; }
    .edge.top    { top:0; left:20%; width:60%; height:28%; border-radius:6px 6px 0 0; }
    .edge.bottom { bottom:0; left:20%; width:60%; height:28%; border-radius:0 0 6px 6px; }
    .edge.left   { left:0; top:20%; width:22%; height:60%; border-radius:6px 0 0 6px; }
    .edge.right  { right:0; top:20%; width:22%; height:60%; border-radius:0 6px 6px 0; }
    .pairRow { display:flex; gap:8px; justify-content:center; margin-top:14px; }
    .zone.pair {
      position:static; flex:1; padding:9px 6px; border-radius:7px; min-width:0;
    }

    /* --- Radius layout: exact pixel math so everything lines up ---
       CORNER=64  GAP_BETWEEN_CORNERS=10  CORE=64*2+10=138
       STRIP=54   GAP_STRIP_TO_CORE=10    MARGIN=54+10=64
       TOTAL = 64*2 + 138 = 266 (square) */
    .radiusFrame { position:relative; width:266px; height:266px; margin:0 auto; }
    .radiusFrame .corner {
      width:64px; height:64px; border-radius:10px;
    }
    .radiusFrame .corner.tl { top:64px;  left:64px; }
    .radiusFrame .corner.tr { top:64px;  left:138px; }
    .radiusFrame .corner.bl { top:138px; left:64px; }
    .radiusFrame .corner.br { top:138px; left:138px; }
    .radiusFrame .strip {
      border-radius:8px; background:#f6f6f8;
    }
    .radiusFrame .strip.top    { top:0;   left:64px; width:138px; height:54px; }
    .radiusFrame .strip.bottom { top:212px; left:64px; width:138px; height:54px; }
    .radiusFrame .strip.left   { top:64px; left:0;   width:54px;  height:138px; }
    .radiusFrame .strip.right  { top:64px; left:212px; width:54px; height:138px; }
    .radiusAll {
      position:absolute; top:112px; left:112px; width:42px; height:42px;
      border-radius:9px; padding:0;
    }
    .hint {
      text-align:center; font-size:10px; color:#6b6b74; line-height:1.55;
      margin:16px auto 0; padding:10px 14px; background:#eceef2;
      border:1.5px solid #cfd0d8; border-radius:8px;
      max-width:180px; display:flex; align-items:center; justify-content:center;
    }
  </style></head><body>
    <div class="header">\${title}</div>
    <div class="valueRow">
      <div class="value">\${safeLabel}</div>
      \${safePx ? \`<div class="pxValue">\${safePx}</div>\` : ""}
    </div>
    \${isPadding ? paddingBody : radiusBody}
    <div class="hint">Number = pick field - Enter/Esc/click center = All</div>
    <script>
      document.querySelectorAll('[data-key]').forEach((el) => {
        el.addEventListener('click', (e) => { e.stopPropagation(); choose(el.getAttribute('data-key')); });
      });
      document.body.addEventListener('click', (e) => {
        if (!e.target.closest('[data-key]')) choose('ALL');
      });
      const NUM_TO_KEY = \${isPadding
        ? "{1:'T',2:'B',3:'L',4:'R',5:'H',6:'V'}"
        : "{1:'TL',2:'TR',3:'BL',4:'BR',5:'T',6:'B',7:'L',8:'R'}"};
      function choose(key) {
        parent.postMessage({ pluginMessage: { field: key } }, '*');
      }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') { choose('ALL'); return; }
        const key = NUM_TO_KEY[e.key];
        if (key) choose(key);
      });
      let resolved = false;
      const originalChoose = choose;
      choose = function (key) { resolved = true; originalChoose(key); };
      setTimeout(() => {
        window.addEventListener('blur', () => {
          if (!resolved) choose('ALL');
        });
      }, 1000);
      window.focus();
    </script>
  </body></html>\`;
}

function promptFieldChoice(kind, label, pxValue) {
  return new Promise((resolve) => {
    figma.showUI(buildPickerHtml(kind, label, pxValue), { width: kind === "padding" ? 260 : 310, height: kind === "padding" ? 310 : 410 });
    figma.ui.onmessage = (msg) => {
      figma.ui.close();
      resolve((msg && msg.field) || "ALL");
    };
  });
}

async function applyFieldsToSelection(variable, fields, nodes) {
  await withSelectionGuard(variable, nodes, async (variable, nodes) => {
    let touched = 0;
    for (const node of nodes) {
      let hit = false;
      for (const field of fields) {
        if (field in node) {
          try {
            node.setBoundVariable(field, variable);
            hit = true;
          } catch (e) {
            console.error(field, e);
          }
        }
      }
      // Radius fallback: node doesn't support individual corners, but has a uniform cornerRadius
      if (!hit && fields[0] && fields[0].endsWith("Radius") && "cornerRadius" in node) {
        try {
          node.setBoundVariable("cornerRadius", variable);
          hit = true;
        } catch (e) {
          console.error("cornerRadius", e);
        }
      }
      if (hit) touched++;
    }
    return touched;
  });
}

// --- GAP (spacing between auto-layout children; no picker, always every relevant field) ---
async function applyGap(variable) {
  const fields = ["itemSpacing", "counterAxisSpacing"];
  const nodes = [...figma.currentPage.selection];
  await withSelectionGuard(variable, nodes, async (variable, nodes) => {
    let touched = 0;
    for (const node of nodes) {
      let hit = false;
      for (const field of fields) {
        if (field in node) {
          try {
            node.setBoundVariable(field, variable);
            hit = true;
          } catch (e) {
            console.error(field, e);
          }
        }
      }
      if (hit) touched++;
    }
    return touched;
  });
}

// --- PADDING / RADIUS (shows the field picker, then sets the chosen fields) ---
function formatVariableValue(variable) {
  try {
    const values = Object.values(variable.valuesByMode || {});
    for (const v of values) {
      if (typeof v === "number") {
        const rounded = Math.round(v * 100) / 100;
        return rounded + "px";
      }
    }
  } catch (e) {
    console.error("Could not read variable value", e);
  }
  return "";
}

async function applyPaddingOrRadius(kind, variable) {
  // Important: snapshot the selected nodes BEFORE the popup is shown. If the
  // user clicks outside the plugin window (on the canvas) while the popup is
  // open, Figma's own selection can change (e.g. become empty) before we get
  // back here. The snapshot makes sure we still hit the right objects.
  const nodes = [...figma.currentPage.selection];
  if (nodes.length === 0) {
    figma.notify("Select at least one object first");
    figma.closePlugin();
    return;
  }
  if (!variable) {
    figma.notify("Variable not found. See the console for details");
    figma.closePlugin();
    return;
  }
  const choice = await promptFieldChoice(kind, variable.name, formatVariableValue(variable));
  const fields = FIELD_SETS[kind][choice] || FIELD_SETS[kind].ALL;
  await applyFieldsToSelection(variable, fields, nodes);
}

async function applyPadding(variable) {
  await applyPaddingOrRadius("padding", variable);
}

async function applyRadius(variable) {
  await applyPaddingOrRadius("radius", variable);
}

// --- TEXT STYLE (the whole style: family, size, weight, line height, letter spacing) ---
async function applyTextStyle(style) {
  const nodes = [...figma.currentPage.selection];
  await withSelectionGuard(style, nodes, async (style, nodes) => {
    let touched = 0;
    for (const node of nodes) {
      if (node.type !== "TEXT") continue;
      try {
        await node.setTextStyleIdAsync(style.id);
        touched++;
      } catch (e) {
        console.error("setTextStyleIdAsync", e);
      }
    }
    return touched;
  });
}

// --- COMPONENT (inserts an instance of the default variant; no selection required) ---

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

async function insertComponent(component) {
  if (!component) {
    figma.notify("Component not found. Is the Bifrost library enabled in this file?");
    figma.closePlugin();
    return;
  }
  try {
    const instance = component.createInstance();
    placeInstance(instance, figma.currentPage.selection[0]);
    figma.currentPage.selection = [instance];
    const set = component.parent && component.parent.type === "COMPONENT_SET" ? component.parent : null;
    figma.notify("Inserted: " + (set ? set.name : component.name));
  } catch (e) {
    console.error("Error while inserting component:", e);
    figma.notify("Error: " + e.message);
  } finally {
    figma.closePlugin();
  }
}

const APPLY_FN = {
  fill: applyFill,
  padding: applyPadding,
  gap: applyGap,
  radius: applyRadius,
  textstyle: applyTextStyle,
  component: insertComponent,
};

const RESOLVE_FN = {
  variable: resolveVariable,
  style: resolveStyle,
  component: resolveComponent,
};

const LOADING_TEXT = {
  fill: "Applying fill",
  padding: "Loading padding",
  gap: "Applying gap",
  radius: "Loading radius",
  textstyle: "Applying text style",
  component: "Inserting",
};

// Figma's own running indicator only shows the plugin name. The library
// import can take a moment (especially for components), so say what this
// command is doing until it's resolved.
async function runForSlug(slug) {
  const entry = VARIABLE_MAP[slug];
  if (!entry) {
    figma.notify("Unknown command slug: " + slug);
    figma.closePlugin();
    return;
  }
  const loading = figma.notify(LOADING_TEXT[entry.kind] + " " + entry.name + "…", { timeout: Infinity });
  const target = await RESOLVE_FN[entry.type](entry);
  loading.cancel();
  await APPLY_FN[entry.kind](target);
}

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
  figma.notify(\`Logged \${result.length} variables to the console\`);
  figma.closePlugin();
}

const SEARCH_PREFIX = "search-";

if (figma.command === "list-variables") {
  listVariables();
} else if (figma.command.startsWith(SEARCH_PREFIX)) {
  const kind = figma.command.slice(SEARCH_PREFIX.length);
  figma.parameters.on("input", ({ query, result }) => {
    const q = (query || "").toLowerCase();
    // Matches that start with the query first, then shortest name, so the most
    // basic tokens (e.g. "H1") don't fall outside the first 25.
    const rank = (name) => (name.toLowerCase().startsWith(q) ? 0 : 1);
    const matches = Object.entries(VARIABLE_MAP)
      .filter(([, v]) => v.kind === kind && v.name.toLowerCase().includes(q))
      .sort(([, a], [, b]) => rank(a.name) - rank(b.name) || a.name.length - b.name.length || a.name.localeCompare(b.name))
      .slice(0, 25)
      .map(([slug, v]) => ({ name: v.name, data: slug }));
    result.setSuggestions(matches);
  });

  figma.on("run", async (event) => {
    const slug = event.parameters && event.parameters.variable;
    if (!slug) {
      figma.closePlugin();
      return;
    }
    await runForSlug(slug);
  });
} else if (VARIABLE_MAP[figma.command]) {
  runForSlug(figma.command);
} else {
  figma.notify("Unknown command: " + figma.command);
  figma.closePlugin();
}`;

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(outDir, "code.js"), codeJs);

const counts = Object.entries(KINDS).map(([k, d]) => `${k}: ${d.entries.length}`).join(", ");
console.log(`Wrote manifest.json (${menu.length} menu items) and code.js. Count per kind: ${counts}`);