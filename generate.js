// generate.js: rerun whenever the Bifrost library gets new variables, styles or
// components, or after editing anything in src/.
// Usage: node generate.js <variables.json> <outDir> [textstyles.json] [components.json]
//
// Reads the JSON exports from the Figma console snippets (see README) and writes:
//  - manifest.json: "Open palette", "Fix variables" (bind exact review matches
//    without a window) and "Alias 0-29" (run alias 0-29 without a window)
//  - code.js: VARIABLE_MAP (slug -> token/component) + VARIABLE_VALUES (values per
//    mode) + UI_HTML (src/ui.html with the Bifrost tokens as CSS variables and
//    src/parse.js inlined) + src/parse.js + src/runtime.js
//
// Classification: COLOR variables (except Light/ and Dark/ ones) -> fill AND stroke, FLOAT "Spacing/..." -> padding AND gap,
// FLOAT "Border radius/..." -> radius, text styles -> textstyle, components -> component.

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

// The standard headings get clean names ("H1") so "h1" in the prompt matches them
// exactly, ahead of the same-sized Font Awesome icon styles.
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

// ---------- Classification ----------

// Light/... and Dark/... colors are the per-mode values behind the Mode
// collection's tokens. Those tokens already switch with the parent's variable
// mode, so applying a light- or dark-specific color directly is never wanted.
const MODE_SPECIFIC = /^(Light|Dark)\//;
const colorVars = variables.filter((v) => v.resolvedType === "COLOR" && !MODE_SPECIFIC.test(v.name));
const spacingVars = variables.filter(
  (v) => v.resolvedType === "FLOAT" && v.name.startsWith("Spacing/")
);
const radiusVars = variables.filter(
  (v) => v.resolvedType === "FLOAT" && v.name.startsWith("Border radius/")
);
const variablesById = new Map(variables.map((v) => [v.id, v]));

// A variable's value in one of its modes, following aliases into other
// collections (which use their default mode, so theme colors are Teal).
// Null for exports made before !vars included values.
function valueIn(v, mode) {
  let value = v.values ? (mode in v.values ? v.values[mode] : v.values[v.defaultMode]) : null;
  for (let depth = 0; value && value.alias && depth < 10; depth++) {
    const target = variablesById.get(value.alias);
    value = target && target.values ? target.values[target.defaultMode] : null;
  }
  return value === undefined ? null : value;
}

// A spacing or radius token's number, so "r 12" finds Radius M. These are the
// same in every mode.
function defaultNumber(v) {
  const value = valueIn(v, v.defaultMode);
  return typeof value === "number" ? value : undefined;
}

const KINDS = {
  fill: colorVars.map((v) => ({ slug: uniqueSlug("fill", v.name), name: v.name, id: v.id, key: v.key, group: v.collection })),
  stroke: colorVars.map((v) => ({ slug: uniqueSlug("stroke", v.name), name: v.name, id: v.id, key: v.key, group: v.collection })),
  padding: spacingVars.map((v) => ({
    slug: uniqueSlug("pad", v.name),
    name: stripPrefix(v.name, "Spacing/"),
    id: v.id,
    key: v.key,
    px: defaultNumber(v),
  })),
  gap: spacingVars.map((v) => ({
    slug: uniqueSlug("gap", v.name),
    name: stripPrefix(v.name, "Spacing/"),
    id: v.id,
    key: v.key,
    px: defaultNumber(v),
  })),
  radius: radiusVars.map((v) => ({
    slug: uniqueSlug("radius", v.name),
    name: stripPrefix(v.name, "Border radius/"),
    id: v.id,
    key: v.key,
    px: defaultNumber(v),
  })),
  textstyle: textStyles.map((s) => ({
    slug: uniqueSlug("text", s.name),
    name: textStyleLabel(s.name),
    id: s.id,
    key: s.key,
    value: s.fontSize,
  })),
  component: components.map((c) => {
    const name = componentLabel(c);
    return { slug: uniqueSlug("comp", name), name, id: c.id, key: c.key, isSet: c.isSet, group: c.page };
  }),
};

// ---------- manifest.json ----------

// Open palette comes first so "bif" → Enter in the Actions menu still opens it.
// Alias N runs the alias named N without a window: the companion app presses
// them for numpad digits (0-9) and recorded shortcuts. Menus can't change at
// runtime, so the count is fixed; Figma.aliasCount in the companion must match.
// The commands share the plugin id, and with it the aliases in clientStorage.
const ALIAS_COMMANDS = 30;
const manifest = {
  name: "Bifrost",
  id: "bifrost-fill-shortcuts",
  api: "1.0.0",
  main: "code.js",
  editorType: ["figma"],
  menu: [
    { name: "Open palette", command: "open" },
    { name: "Fix variables", command: "fix" },
    { separator: true },
    {
      name: "Aliases",
      menu: Array.from({ length: ALIAS_COMMANDS }, (_, n) => ({ name: "Alias " + n, command: "alias-" + n })),
    },
  ],
};

// ---------- code.js ----------

// Flat lookup: slug -> { id, key, name, kind, type, isSet?, group?, value?, px? }. group is
// the top level in the Options tree: a fill's collection, a component's page. value
// is a text style's font size; variables get theirs from VARIABLE_VALUES. px is a
// spacing or radius number for value search ("r 12").
const TYPE_BY_KIND = { textstyle: "style", component: "component" };
const flatMap = {};
for (const [kind, entries] of Object.entries(KINDS)) {
  for (const e of entries) {
    flatMap[e.slug] = { id: e.id, key: e.key, name: e.name, kind, type: TYPE_BY_KIND[kind] || "variable" };
    if (e.isSet) flatMap[e.slug].isSet = true;
    if (e.group) flatMap[e.slug].group = e.group;
    if (e.value) flatMap[e.slug].value = e.value;
    if (e.px !== undefined) flatMap[e.slug].px = e.px;
  }
}

// The value shown next to each variable option, per mode, so the palette can
// show what the selected layer would get (resolveValue in parse.js). Includes
// every variable an option's aliases lead to, like the Light/ and Dark/ colors.
// A variable with a single mode (all primitives) is stored as just its value.
// Empty for exports made before !vars included values.
const valueTable = {};
const pending = Object.values(flatMap).filter((e) => e.type === "variable").map((e) => e.id);
while (pending.length) {
  const v = variablesById.get(pending.pop());
  if (!v || !v.values || valueTable[v.id]) continue;
  const values = Object.values(v.values);
  const single = values.length === 1 && !(values[0] && values[0].alias);
  valueTable[v.id] = single ? values[0] : { collection: v.collection, defaultMode: v.defaultMode, values: v.values };
  for (const value of values) if (value && value.alias) pending.push(value.alias);
}

// ---------- Palette styles ----------

// The Mode collection as CSS variables, so the palette is styled with Bifrost
// itself: colors for Light in :root and for Dark in html.figma-dark (set by
// themeColors), plus spacing, radius and shadow sizes. bfc-* colors keep their
// token name (--bfc-base-1); others get their path (--spacing-m,
// --border-radius-s, --effect-variables-shadows-blur-m).
function bifrostCss() {
  const light = [];
  const dark = [];
  for (const v of variables.filter((x) => x.collection === "Mode")) {
    const last = v.name.split("/").pop();
    const name = "--" + (last.startsWith("bfc-") ? last : slugify("", v.name).slice(1));
    const css = (value) => (typeof value === "number" ? value + "px" : value);
    const l = valueIn(v, "Light");
    const d = valueIn(v, "Dark");
    if (l === null || typeof l === "object") continue;
    light.push(`${name}: ${css(l)};`);
    if (d !== null && d !== l) dark.push(`${name}: ${css(d)};`);
  }
  return `:root { ${light.join(" ")} }\n  html.figma-dark { ${dark.join(" ")} }`;
}

const readSrc = (file) => fs.readFileSync(path.join(__dirname, "src", file), "utf8");

// The palette parses as you type, so the window gets its own copy of parse.js.
const uiHtml = readSrc("ui.html")
  .replace("/*BIFROST_CSS*/", () => bifrostCss())
  .replace("/*PARSE_JS*/", () => readSrc("parse.js"));

const codeJs = [
  "// code.js: GENERATED by generate.js from the JSON exports and src/. Edit those and",
  "// regenerate instead of editing this file by hand.",
  "",
  `const VARIABLE_MAP = ${JSON.stringify(flatMap, null, 2)};`,
  "",
  `const VARIABLE_VALUES = ${JSON.stringify(valueTable)};`,
  "",
  `const UI_HTML = ${JSON.stringify(uiHtml)};`,
  "",
  readSrc("parse.js"),
  readSrc("runtime.js"),
].join("\n");

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "code.js"), codeJs);

const counts = Object.entries(KINDS).map(([k, entries]) => `${k}: ${entries.length}`).join(", ");
console.log(`Wrote manifest.json and code.js. Count per kind: ${counts}`);
