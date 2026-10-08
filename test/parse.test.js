// Run: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "parse.js"), "utf8"), ctx);

const entry = (kind, name, px) => ({ slug: kind + "-" + name.toLowerCase().replace(/\W+/g, "-"), kind, name, px });
const PX = { None: 0, S: 8, M: 12, L: 16, XL: 24, Full: 9999 };
const ENTRIES = [
  ...["None", "S", "M", "L", "XL"].flatMap((n) => [entry("padding", n, PX[n]), entry("gap", n, PX[n])]),
  ...["S", "M", "L", "Full"].map((n) => entry("radius", n, PX[n])),
  ...["Pop/Brand/bfc-brand", "Pop/Brand/bfc-brand-hc", "Base/bfc-base-c-brand", "Base/bfc-base-1", "Base/bfc-base-dimmed-3"].flatMap((n) => [entry("fill", n), entry("stroke", n)]),
  ...["H1", "S/Font Awesome/Solid", "S/Open Sans/Regular/Text"].map((n) => entry("textstyle", n)),
  ...["Button", "Button (icon only)", "Radio-button", "Box", "Checkbox-indeterminate", "Input/Basic input"].map((n) => entry("component", n)),
];

const labels = (ops) => ops && Array.from(ops, (o) => o.label);
const parse = (q, aliases = {}) => ctx.createParser(ENTRIES, aliases).parse(q);

test("a property and its value are separate words, so sides are never guessed", () => {
  assert.deepEqual(labels(parse("p m").primary), ["Padding M"]);
  assert.deepEqual(labels(parse("r full").primary), ["Radius Full"]);
  assert.deepEqual(labels(parse("ph l").primary), ["Padding horizontal L"]);
  assert.deepEqual(labels(parse("pl m").primary), ["Padding left M"]);
  assert.deepEqual(labels(parse("rtl s").primary), ["Radius top-left S"]);
  const pl = parse("pl");
  assert.equal(pl.primary, null);
  assert.ok(pl.alternatives.every((ops) => ops[0].label.startsWith("Padding left")));
  assert.deepEqual(Array.from(parse("p x").alternatives, labels), [["Padding XL"]]);
  assert.match(parse("p q").error, /Padding has no size "q"/);
});

test("a size can be typed as its value", () => {
  assert.deepEqual(labels(parse("r 12").primary), ["Radius M"]);
  assert.deepEqual(labels(parse("p 12px g 8").primary), ["Padding M", "Gap S"]);
  assert.deepEqual(labels(parse("rtl 16").primary), ["Radius top-left L"]);
  assert.deepEqual(Array.from(parse("p 1").alternatives, labels), [["Padding M"], ["Padding L"]]);
  assert.match(parse("p 13").error, /Padding has no size "13"/);
});

test("the old glued form says where the space goes", () => {
  assert.match(parse("pm").error, /"p m"/);
  assert.match(parse("p m rtll").error, /"rtl l"/);
  assert.match(parse("fbase1 p m").error, /"f base1"/);
  assert.deepEqual(labels(parse("brand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.deepEqual(labels(parse("button").primary), ["Insert Button"]);
});

test("glued aliases are rewritten with spaces", () => {
  assert.equal(ctx.respaceAlias(ENTRIES, "pm gs rl"), "p m g s r l");
  assert.equal(ctx.respaceAlias(ENTRIES, "fbrand button pm"), "f brand button p m");
  assert.equal(ctx.respaceAlias(ENTRIES, "f brand p m"), "f brand p m");
  assert.equal(ctx.respaceAlias(ENTRIES, "zz"), null);
});

test("several ops chain", () => {
  assert.deepEqual(labels(parse("p m g s r l").primary), ["Padding M", "Gap S", "Radius L"]);
  assert.deepEqual(labels(parse("p m btn").primary), ["Padding M", "Insert Button"]);
});

test("ops know which typed words they came from, so the palette can box them", () => {
  const spans = (ops) => Array.from(ops, (o) => Array.from(o.at));
  assert.deepEqual(spans(parse("rl l  p m").primary), [[0, 2], [2, 4]]);
  assert.deepEqual(spans(parse("f brand basic input").primary), [[0, 2], [2, 4]]);
  assert.deepEqual(spans(parse("cta r l", { cta: "f brand p m" }).primary), [[0, 1], [0, 1], [1, 3]]);
  assert.deepEqual(spans(parse("p m rl").alternatives[0]), [[0, 2], [2, 3]]);
});

test("fuzzy matches rank exact path segments first and icon fonts last", () => {
  assert.deepEqual(labels(parse("f brand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.deepEqual(labels(parse("f base-1 p m").primary), ["Fill Base/bfc-base-1", "Padding M"]);
  assert.deepEqual(labels(parse("t s").primary), ["Text S/Open Sans/Regular/Text"]);
  assert.deepEqual(labels(parse("h1").primary), ["Text H1"]);
});

test("aliases expand where an op starts and complete while typing", () => {
  const aliases = { cta: "f brand p m", 1: "g s r l" };
  assert.deepEqual(labels(parse("cta r l", aliases).primary), ["Fill Pop/Brand/bfc-brand", "Padding M", "Radius L"]);
  assert.deepEqual(labels(parse("ct", aliases).alternatives[0]), ["Fill Pop/Brand/bfc-brand", "Padding M"]);
  assert.deepEqual(labels(parse("p m 1", aliases).primary), ["Padding M", "Gap S", "Radius L"]);
});

test("aliases never replace a value", () => {
  const aliases = { m: "r l", brand: "g s" };
  assert.deepEqual(labels(parse("p m", aliases).primary), ["Padding M"]);
  assert.deepEqual(labels(parse("f brand", aliases).primary), ["Fill Pop/Brand/bfc-brand"]);
});

test("alias names may shadow name search but not op syntax", () => {
  assert.equal(ctx.aliasError(ENTRIES, "cta", "f brand"), null);
  assert.equal(ctx.aliasError(ENTRIES, "1", "p m g s"), null);
  assert.match(ctx.aliasError(ENTRIES, "rl", "g s"), /built-in/);
  assert.match(ctx.aliasError(ENTRIES, "h1", "g s"), /built-in/);
  assert.match(ctx.aliasError(ENTRIES, "p", "g s"), /built-in/);
  assert.match(ctx.aliasError(ENTRIES, "x", "pm"), /"p m"/);
  assert.match(ctx.aliasError(ENTRIES, "x", "zz"), /No matches/);
});

test("shorthand is the shortest input that gives the same ops", () => {
  const p = ctx.createParser(ENTRIES, {});
  assert.equal(p.shorthand(p.parse("p m g s").primary), "p m g s");
  assert.equal(p.shorthand(p.parse("ph l").primary), "ph l");
  assert.equal(p.shorthand(p.parse("r full").primary), "r full");
  assert.equal(p.shorthand(p.parse("h1").primary), "h1");
  assert.equal(p.shorthand(p.parse("f brand").primary), "f brand");
  assert.equal(p.shorthand(p.parse("b base-dimmed-3").primary), "b basedimmed3");
  assert.equal(p.shorthand([{ slug: "gone", kind: "padding", key: "p", side: "ALL" }]), null);
});

test("b sets a border color, and bare color names stay fills", () => {
  assert.deepEqual(labels(parse("b base-dimmed-3").primary), ["Border Base/bfc-base-dimmed-3"]);
  assert.deepEqual(labels(parse("b brand p m").primary), ["Border Pop/Brand/bfc-brand", "Padding M"]);
  assert.deepEqual(labels(parse("button b brand").primary), ["Insert Button", "Border Pop/Brand/bfc-brand"]);
  assert.deepEqual(labels(parse("brand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.match(ctx.aliasError(ENTRIES, "b", "p m"), /built-in/);
  assert.equal(ctx.aliasError(ENTRIES, "brand", "p m"), null);
});

test("frame and auto layout are word ops that chain like inserts", () => {
  assert.deepEqual(labels(parse("frame alh p m r m b base-dimmed3").primary), [
    "Insert frame", "Auto layout horizontal", "Padding M", "Radius M", "Border Base/bfc-base-dimmed-3",
  ]);
  assert.deepEqual(Array.from(parse("fr").alternatives, labels), [["Insert frame"]]);
  assert.deepEqual(Array.from(parse("al").alternatives, labels), [["Auto layout horizontal"], ["Auto layout vertical"]]);
  const p = ctx.createParser(ENTRIES, {});
  assert.equal(p.shorthand(p.parse("frame alh p m").primary), "frame alh p m");
  assert.deepEqual(Array.from(p.list("layout"), (ops) => p.shorthand(ops)), ["frame", "alh", "alv"]);
  assert.match(ctx.aliasError(ENTRIES, "frame", "p m"), /built-in/);
});

test("bare words search components, text styles and colors by name", () => {
  assert.deepEqual(labels(parse("button").primary), ["Insert Button"]);
  assert.deepEqual(labels(parse("icon button").primary), ["Insert Button (icon only)"]);
  assert.deepEqual(labels(parse("brand p m").primary), ["Fill Pop/Brand/bfc-brand", "Padding M"]);
  assert.deepEqual(labels(parse("button p m").primary), ["Insert Button", "Padding M"]);
  assert.deepEqual(labels(parse("box r m").primary), ["Insert Box", "Radius M"]);
  assert.deepEqual(labels(parse("basic input p m").primary), ["Insert Input/Basic input", "Padding M"]);
  assert.deepEqual(labels(parse("button (icon").primary), ["Insert Button (icon only)"]);
});

test("a group's search option limits name search to its kinds", () => {
  const components = ctx.createParser(ENTRIES, {}, { search: ["component"] });
  assert.deepEqual(labels(parse("brand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.match(components.parse("brand").error, /No matches/);
  assert.deepEqual(labels(components.parse("button p m").primary), ["Insert Button", "Padding M"]);
});

test("incomplete input has no primary, unknown words are errors", () => {
  const p = parse("p");
  assert.equal(p.primary, null);
  assert.equal(p.alternatives.length, 5);
  assert.match(parse("p m zz g s").error, /No matches for "zz"/);
  assert.match(parse("f nope").error, /No fill matches/);
});

test("every help example parses", () => {
  const p = ctx.createParser(
    ENTRIES.concat(["XS", "Full"].map((n) => entry("radius", n)), ["H3", "M/Open Sans/Regular/Text"].map((n) => entry("textstyle", n))),
    {}
  );
  const sections = vm.runInContext("SYNTAX", ctx);
  assert.ok(sections.length > 0);
  for (const section of sections) {
    for (const [examples] of section.rows) {
      for (const ex of examples) {
        const r = p.parse(ex);
        assert.ok(!r.error && r.primary, ex + " → " + (r.error || "incomplete"));
      }
    }
  }
});

test("option tree groups by kind, group and path, and merges one-child levels", () => {
  const tree = ctx.buildOptionTree([
    { slug: "a", kind: "fill", name: "Pop/Brand/bfc-brand", group: "Mode" },
    { slug: "b", kind: "fill", name: "Pop/Brand/bfc-brand-hc", group: "Mode" },
    { slug: "c", kind: "fill", name: "Base/bfc-base-1", group: "Mode" },
    { slug: "d", kind: "fill", name: "Teal/10", group: "Primitives" },
    { slug: "e", kind: "fill", name: "Teal/20", group: "Primitives" },
    { slug: "f", kind: "component", name: "Button", group: "Button" },
    { slug: "g", kind: "component", name: "Button (icon only)", group: "Button" },
    { slug: "h", kind: "component", name: "Backdrop", group: "Backdrop" },
    { slug: "i", kind: "component", name: "Modal/Image", group: "Modal" },
  ]);
  const shape = (n) => (n.children ? { [n.label + " (" + n.slugs.length + ")"]: n.children.map(shape) } : n.label);
  assert.deepEqual(JSON.parse(JSON.stringify(shape(tree))), {
    "All options (9)": [
      { "Fill (5)": [{ "Mode (3)": [{ "Pop/Brand (2)": ["bfc-brand", "bfc-brand-hc"] }, "Base/bfc-base-1"] }, { "Primitives/Teal (2)": ["10", "20"] }] },
      { "Component (4)": [{ "Button (2)": ["Button", "Button (icon only)"] }, "Backdrop", "Modal/Image"] },
    ],
  });
});

test("checkOps only allows ops that would do something to the selection", () => {
  const caps = (extra) => Object.assign({ fills: true, strokes: true, radius: true, corners: true, autoLayout: false, canAutoLayout: true, text: false }, extra);
  const frame = caps({});
  const autoFrame = caps({ autoLayout: true });
  const text = caps({ radius: false, corners: false, canAutoLayout: false, text: true });
  const instance = caps({ autoLayout: true, canAutoLayout: false });
  const check = (q, selection) => ctx.checkOps(parse(q).primary, selection);
  const modes = (q, selection) => Array.from(check(q, selection).modes || []);

  // Padding and gap add auto layout to a frame without it, once.
  assert.deepEqual(modes("alh p m g s", [frame]), ["apply", "apply", "apply"]);
  assert.deepEqual(modes("g s p m", [frame]), ["autolayout", "apply"]);
  assert.deepEqual(modes("p m", [autoFrame]), ["apply"]);
  assert.deepEqual(modes("p m g s", [frame]), ["autolayout", "apply"]);
  assert.equal(ctx.describeOpsIn(parse("p m").primary, ["autolayout"]), "Padding M (adds auto layout)");
  assert.deepEqual(modes("frame p m r m", []), ["insert", "autolayout", "apply"]);
  assert.match(check("p m", [caps({ canAutoLayout: false })]).error, /Padding M needs a frame/);

  // Text styles change selected text, otherwise insert a text layer
  assert.deepEqual(modes("h1", [text]), ["apply"]);
  assert.deepEqual(modes("h1", [frame]), ["insert"]);
  assert.deepEqual(modes("h1", []), ["insert"]);
  assert.match(check("h1 r m", []).error, /Radius M needs/);
  assert.equal(ctx.describeOpsIn(parse("h1").primary, ["insert"]), "Insert text H1");

  // Nothing selected: only inserts can start a command
  assert.equal(check("f brand", []).error, "Select a layer first");
  assert.deepEqual(modes("button p m b brand", []), ["insert", "apply", "apply"]);

  // Auto layout and radius sides
  assert.match(check("alh", [instance]).error, /needs a frame/);
  assert.match(check("rtl s", [caps({ corners: false })]).error, /individual corners/);
  assert.deepEqual(modes("r s", [caps({ corners: false })]), ["apply"]);

  // Mixed selection: available if any layer supports it
  assert.deepEqual(modes("p m", [frame, autoFrame]), ["autolayout"]);
  assert.deepEqual(modes("g s", [instance]), ["apply"]);
  assert.match(check("g s", [text]).error, /Gap S needs a frame/);
});

test("aliasOps runs an alias by name, or says what's missing", () => {
  const aliases = { 1: "button p m", 2: "p" };
  assert.deepEqual(labels(ctx.aliasOps(ENTRIES, aliases, "1").ops), ["Insert Button", "Padding M"]);
  assert.match(ctx.aliasOps(ENTRIES, aliases, "2").error, /^Alias 2: /);
  assert.match(ctx.aliasOps(ENTRIES, aliases, "3").error, /No alias "3"/);
});

test("resolveValue follows aliases with the layer's mode per collection", () => {
  const table = {
    brand: { collection: "Mode", defaultMode: "Light", values: { Light: { alias: "themeBrand" }, Dark: "#FFFFFF" } },
    themeBrand: { collection: "Theme", defaultMode: "Teal", values: { Teal: { alias: "teal" }, Pink: "#BB006D" } },
    teal: "#007375",
    spacing: { collection: "Mode", defaultMode: "Light", values: { Light: 12, Dark: 12 } },
  };
  assert.equal(ctx.resolveValue(table, "brand", {}), "#007375");
  assert.equal(ctx.resolveValue(table, "brand", { Mode: "Dark" }), "#FFFFFF");
  assert.equal(ctx.resolveValue(table, "brand", { Theme: "Pink" }), "#BB006D");
  assert.equal(ctx.resolveValue(table, "brand", { Mode: "Unknown mode" }), "#007375");
  assert.equal(ctx.resolveValue(table, "missing", {}), null);
  assert.equal(ctx.formatValue(ctx.resolveValue(table, "spacing", undefined)), "12px");
  assert.equal(ctx.formatValue(ctx.resolveValue(table, "teal", {})), "#007375");
});

test("review proposes one token per value: the same or nearest size, the color for the layer's role", () => {
  const sizes = ENTRIES.filter((e) => e.kind === "padding");
  const size = (v) => {
    const r = ctx.reviewChoices(sizes, {}, "padding", v);
    return r.match + (r.exact ? "" : " (nearest)");
  };
  assert.equal(size(12), "padding-m");
  assert.equal(size(11), "padding-m (nearest)");
  assert.equal(size(10), "padding-m (nearest)");
  assert.equal(size(200), "padding-xl (nearest)");

  const color = (group, name, id) => ({ slug: name.split("/").pop(), kind: "fill", group, name, id });
  const colors = [
    color("Mode", "Pop/Brand/bfc-brand-hc", "white"),
    color("Mode", "Base/bfc-base-3", "white"),
    color("Mode", "Base/bfc-base-c-theme", "teal"),
    color("Mode", "Base/bfc-base-c-brand", "teal"),
    color("Mode", "Pop/Brand/bfc-brand", "brand"),
    color("Primitives", "Teal/570", "teal"),
  ];
  const table = {
    white: { collection: "Mode", defaultMode: "Light", values: { Light: "#FFFFFF", Dark: "#071627" } },
    teal: { collection: "Mode", defaultMode: "Light", values: { Light: "#007375", Dark: "#0DF2D7" } },
    brand: { collection: "Mode", defaultMode: "Light", values: { Light: { alias: "teal570" }, Dark: "#0DF2D7" } },
    teal570: "#007375",
  };
  const pick = (hex, role, modes = {}) => {
    const r = ctx.reviewChoices(colors, table, "fill", hex, modes, role);
    return r.match + (r.exact ? "" : " (nearest)");
  };
  assert.equal(pick("#FFFFFF", "shape"), "bfc-base-3");
  assert.equal(pick("#007375", "shape"), "bfc-brand");
  assert.equal(pick("#007375", "text"), "bfc-base-c-brand");
  assert.equal(pick("#017476", "shape"), "bfc-brand (nearest)");
  assert.equal(pick("#0DF2D7", "text", { Mode: "Dark" }), "bfc-base-c-brand");
  // Text never gets a Base background color, even an exact one.
  assert.equal(pick("#FFFFFF", "text"), "bfc-brand-hc");
  assert.ok(ctx.reviewChoices([color("Mode", "Pop/Alert/bfc-alert-c", "white"), color("Mode", "Pop/Neutral/bfc-neutral-hc", "white")], table, "fill", "#FFFFFF", {}, "text").match === "bfc-neutral-hc");
  assert.equal(pick("#FFFFFF", "shape"), "bfc-base-3");
});

test("gap auto spreads children out, and grid gaps only apply to grid frames", () => {
  const p = ctx.createParser(ENTRIES, {});
  assert.deepEqual(labels(parse("g auto p m").primary), ["Gap auto", "Padding M"]);
  assert.ok(parse("g a").alternatives.some((ops) => ops[0].label === "Gap auto"));
  assert.equal(p.shorthand(parse("g auto").primary), "g auto");
  assert.deepEqual(Array.from(p.list("gap"), (ops) => ops[0].label).slice(-1), ["Gap auto"]);
  assert.deepEqual(labels(parse("gc s gr 12").primary), ["Gap columns S", "Gap rows M"]);

  const frame = { fills: true, strokes: true, radius: true, corners: true, autoLayout: true, canAutoLayout: true, text: false, grid: false };
  const grid = Object.assign({}, frame, { grid: true });
  const check = (q, caps) => ctx.checkOps(parse(q).primary, [caps]);
  assert.match(check("gc s", frame).error, /Gap columns S needs a frame with grid layout/);
  assert.equal(check("gc s", grid).error, undefined);
  assert.equal(check("g s", grid).error, undefined);
  assert.match(check("g auto", grid).error, /without grid/);
  assert.deepEqual(Array.from(check("g auto", Object.assign({}, frame, { autoLayout: false })).modes), ["autolayout"]);
});
