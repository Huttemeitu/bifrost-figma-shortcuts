// generate.js: rerun whenever the Bifrost library gets new variables, styles or
// components, or after editing anything in src/.
// Usage: node generate.js <variables.json> <outDir> [textstyles.json] [components.json]
//
// Reads the JSON exports from the Figma console snippets (see README) and writes:
//  - manifest.json: "Open palette" plus "Numpad 0-9" (run alias 0-9 without a window)
//  - code.js: VARIABLE_MAP (slug -> token/component) + UI_HTML (src/ui.html with
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

const KINDS = {
  fill: colorVars.map((v) => ({ slug: uniqueSlug("fill", v.name), name: v.name, id: v.id, key: v.key, group: v.collection })),
  stroke: colorVars.map((v) => ({ slug: uniqueSlug("stroke", v.name), name: v.name, id: v.id, key: v.key, group: v.collection })),
  padding: spacingVars.map((v) => ({
    slug: uniqueSlug("pad", v.name),
    name: stripPrefix(v.name, "Spacing/"),
    id: v.id,
    key: v.key,
  })),
  gap: spacingVars.map((v) => ({
    slug: uniqueSlug("gap", v.name),
    name: stripPrefix(v.name, "Spacing/"),
    id: v.id,
    key: v.key,
  })),
  radius: radiusVars.map((v) => ({
    slug: uniqueSlug("radius", v.name),
    name: stripPrefix(v.name, "Border radius/"),
    id: v.id,
    key: v.key,
  })),
  textstyle: textStyles.map((s) => ({
    slug: uniqueSlug("text", s.name),
    name: textStyleLabel(s.name),
    id: s.id,
    key: s.key,
  })),
  component: components.map((c) => {
    const name = componentLabel(c);
    return { slug: uniqueSlug("comp", name), name, id: c.id, key: c.key, isSet: c.isSet, group: c.page };
  }),
};

// ---------- manifest.json ----------

// Open palette comes first so "bif" → Enter in the Actions menu still opens it.
// The Numpad commands share the plugin id, and with it the aliases in clientStorage.
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const manifest = {
  name: "Bifrost",
  id: "bifrost-fill-shortcuts",
  api: "1.0.0",
  main: "code.js",
  editorType: ["figma"],
  menu: [
    { name: "Open palette", command: "open" },
    { separator: true },
    { name: "Numpad", menu: digits.map((d) => ({ name: "Numpad " + d, command: "numpad-" + d })) },
  ],
};

// ---------- code.js ----------

// Flat lookup: slug -> { id, key, name, kind, type, isSet?, group? }. group is the
// top level in the Options tree: a fill's collection, a component's page.
const TYPE_BY_KIND = { textstyle: "style", component: "component" };
const flatMap = {};
for (const [kind, entries] of Object.entries(KINDS)) {
  for (const e of entries) {
    flatMap[e.slug] = { id: e.id, key: e.key, name: e.name, kind, type: TYPE_BY_KIND[kind] || "variable" };
    if (e.isSet) flatMap[e.slug].isSet = true;
    if (e.group) flatMap[e.slug].group = e.group;
  }
}

const readSrc = (file) => fs.readFileSync(path.join(__dirname, "src", file), "utf8");

// The palette parses as you type, so the window gets its own copy of parse.js.
const uiHtml = readSrc("ui.html").replace("/*PARSE_JS*/", () => readSrc("parse.js"));

const codeJs = [
  "// code.js: GENERATED by generate.js from the JSON exports and src/. Edit those and",
  "// regenerate instead of editing this file by hand.",
  "",
  `const VARIABLE_MAP = ${JSON.stringify(flatMap, null, 2)};`,
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
