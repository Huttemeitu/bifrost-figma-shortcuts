// generate.js (v4) — kjør på nytt hver gang Bifrost-biblioteket får nye variabler/stiler.
// Bruk: node generate.js <variables.json> <outDir> [textstyles.json]
//
// Leser JSON-eksportene fra pluginens konsoll-script og skriver ut
// manifest.json + code.js med:
//  - COLOR-variabler -> "Fyll - <navn>"
//  - FLOAT "Spacing/..." -> "Padding - <navn>" OG "Gap - <navn>"
//  - FLOAT "Border radius/..." -> "Radius - <navn>"
//  - Text Styles (valgfritt, fra textstyles.json) -> "Text - <navn>"
//  - én "Søk - <kind>"-kommando pr kategori

const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2];
const outDir = process.argv[3] || ".";
const textStylesPath = process.argv[4];

if (!inputPath) {
  console.error("Bruk: node generate.js <variables.json> <outDir> [textstyles.json]");
  process.exit(1);
}

const variables = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const textStyles = textStylesPath ? JSON.parse(fs.readFileSync(textStylesPath, "utf8")) : [];

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

// ---------- Klassifisering ----------

const colorVars = variables.filter((v) => v.resolvedType === "COLOR");
const spacingVars = variables.filter(
  (v) => v.resolvedType === "FLOAT" && v.name.startsWith("Spacing/")
);
const radiusVars = variables.filter(
  (v) => v.resolvedType === "FLOAT" && v.name.startsWith("Border radius/")
);

const KINDS = {
  fill: {
    label: "Fyll",
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
      name: s.name,
      id: s.id,
      key: s.key,
    })),
  },
};

// ---------- manifest.json ----------

const menu = [
  { name: "List variabler (JSON)", command: "list-variables" },
];

for (const [kind, def] of Object.entries(KINDS)) {
  menu.push({
    name: `Søk - ${def.label}`,
    command: `search-${kind}`,
    parameters: [{ name: "Variabel", key: "variable", allowFreeform: false }],
  });
}
for (const [kind, def] of Object.entries(KINDS)) {
  for (const e of def.entries) {
    menu.push({ name: `${def.label} - ${e.name}`, command: e.slug });
  }
}

const manifest = {
  name: "Bifrost Fill Shortcuts",
  id: "bifrost-fill-shortcuts",
  api: "1.0.0",
  main: "code.js",
  editorType: ["figma"],
  menu,
};

// ---------- code.js ----------

// Flat oppslag: slug -> { id, key, name, kind, type }
const STYLE_KINDS = new Set(["textstyle"]);
const flatMap = {};
for (const [kind, def] of Object.entries(KINDS)) {
  for (const e of def.entries) {
    flatMap[e.slug] = {
      id: e.id,
      key: e.key,
      name: e.name,
      kind,
      type: STYLE_KINDS.has(kind) ? "style" : "variable",
    };
  }
}

const variableMapLiteral = JSON.stringify(flatMap, null, 2);

const codeJs = `// code.js — AUTO-GENERERT av generate.js. Kjør generate.js på nytt
// og lim inn hele filen igjen i stedet for å redigere VARIABLE_MAP manuelt.

const VARIABLE_MAP = ${variableMapLiteral};

// Figma Plugin API har ingen innebygd figma.clone() — vi lager vår egen.
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function resolveVariable(entry) {
  if (!entry) return null;
  try {
    const v = await figma.variables.getVariableByIdAsync(entry.id);
    if (v) return v;
  } catch (e) {
    console.log("Lokal id feilet for " + entry.name + ", prøver key", e);
  }
  try {
    return await figma.variables.importVariableByKeyAsync(entry.key);
  } catch (e) {
    console.error("Fant ikke variabel " + entry.name, e);
    return null;
  }
}

async function resolveStyle(entry) {
  if (!entry) return null;
  try {
    const s = await figma.getStyleByIdAsync(entry.id);
    if (s) return s;
  } catch (e) {
    console.log("Lokal id feilet for stil " + entry.name + ", prøver key", e);
  }
  try {
    return await figma.importStyleByKeyAsync(entry.key, "TEXT");
  } catch (e) {
    console.error("Fant ikke stil " + entry.name, e);
    return null;
  }
}

async function withSelectionGuard(variable, fn) {
  if (figma.currentPage.selection.length === 0) {
    figma.notify("Velg minst ett objekt først");
    figma.closePlugin();
    return;
  }
  if (!variable) {
    figma.notify("Fant ikke variabelen — se konsollen for detaljer");
    figma.closePlugin();
    return;
  }
  try {
    const touched = await fn(variable);
    figma.notify(touched === 0 ? "Ingen av de valgte objektene støtter dette feltet" : "Oppdatert: " + variable.name);
  } catch (e) {
    console.error("Feil under setBoundVariable:", e);
    figma.notify("Feil: " + e.message);
  } finally {
    figma.closePlugin();
  }
}

// --- FILL (paint-farge) ---
async function applyFill(variable) {
  await withSelectionGuard(variable, async () => {
    let touched = 0;
    for (const node of figma.currentPage.selection) {
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

// --- PADDING (alle 4 sider på auto-layout frames) ---
async function applyPadding(variable) {
  const fields = ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"];
  await withSelectionGuard(variable, async () => {
    let touched = 0;
    for (const node of figma.currentPage.selection) {
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

// --- GAP (avstand mellom barn i auto-layout) ---
async function applyGap(variable) {
  const fields = ["itemSpacing", "counterAxisSpacing"];
  await withSelectionGuard(variable, async () => {
    let touched = 0;
    for (const node of figma.currentPage.selection) {
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

// --- RADIUS (per hjørne hvis mulig, ellers ensartet cornerRadius) ---
async function applyRadius(variable) {
  const cornerFields = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
  await withSelectionGuard(variable, async () => {
    let touched = 0;
    for (const node of figma.currentPage.selection) {
      let hit = false;
      const hasCorners = cornerFields.every((f) => f in node);
      if (hasCorners) {
        for (const field of cornerFields) {
          try {
            node.setBoundVariable(field, variable);
            hit = true;
          } catch (e) {
            console.error(field, e);
          }
        }
      } else if ("cornerRadius" in node) {
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

// --- TEXT STYLE (hele stilen: familie, størrelse, vekt, linjehøyde, bokstavavstand) ---
async function applyTextStyle(style) {
  await withSelectionGuard(style, async () => {
    let touched = 0;
    for (const node of figma.currentPage.selection) {
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

const APPLY_FN = {
  fill: applyFill,
  padding: applyPadding,
  gap: applyGap,
  radius: applyRadius,
  textstyle: applyTextStyle,
};

async function runForSlug(slug) {
  const entry = VARIABLE_MAP[slug];
  if (!entry) {
    figma.notify("Ukjent variabel-slug: " + slug);
    figma.closePlugin();
    return;
  }
  const target = entry.type === "style" ? await resolveStyle(entry) : await resolveVariable(entry);
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
  figma.notify(\`Logget \${result.length} variabler til konsollen\`);
  figma.closePlugin();
}

const SEARCH_PREFIX = "search-";

if (figma.command === "list-variables") {
  listVariables();
} else if (figma.command.startsWith(SEARCH_PREFIX)) {
  const kind = figma.command.slice(SEARCH_PREFIX.length);
  figma.parameters.on("input", ({ query, result }) => {
    const q = (query || "").toLowerCase();
    const matches = Object.entries(VARIABLE_MAP)
      .filter(([, v]) => v.kind === kind && v.name.toLowerCase().includes(q))
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
  figma.notify("Ukjent kommando: " + figma.command);
  figma.closePlugin();
}
`;

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(outDir, "code.js"), codeJs);

const counts = Object.entries(KINDS).map(([k, d]) => `${k}: ${d.entries.length}`).join(", ");
console.log(`Skrev manifest.json (${menu.length} menypunkter) og code.js. Antall pr kind: ${counts}${textStylesPath ? "" : " (ingen textstyles.json oppgitt — kjør uten det, eller legg til senere)"}`);