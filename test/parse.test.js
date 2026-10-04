// Run: node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "parse.js"), "utf8"), ctx);

const entry = (kind, name) => ({ slug: kind + "-" + name.toLowerCase().replace(/\W+/g, "-"), kind, name });
const ENTRIES = [
  ...["None", "S", "M", "L", "XL"].flatMap((n) => [entry("padding", n), entry("gap", n)]),
  ...["S", "M", "L", "Full"].map((n) => entry("radius", n)),
  ...["Pop/Brand/bfc-brand", "Pop/Brand/bfc-brand-hc", "Base/bfc-base-c-brand", "Base/bfc-base-1", "Base/bfc-base-dimmed-3"].flatMap((n) => [entry("fill", n), entry("stroke", n)]),
  ...["H1", "S/Font Awesome/Solid", "S/Open Sans/Regular/Text"].map((n) => entry("textstyle", n)),
  ...["Button", "Button (icon only)", "Radio-button", "Box", "Checkbox-indeterminate", "Input/Basic input"].map((n) => entry("component", n)),
];

const labels = (ops) => ops && Array.from(ops, (o) => o.label);
const parse = (q, aliases = {}) => ctx.createParser(ENTRIES, aliases).parse(q);

test("glued and spaced values mean the same thing", () => {
  assert.deepEqual(labels(parse("pm").primary), ["Padding M"]);
  assert.deepEqual(labels(parse("p m").primary), ["Padding M"]);
  assert.deepEqual(labels(parse("rfull").primary), ["Radius Full"]);
});

test("ambiguous glued input prefers the shortest op and offers the other reading", () => {
  const pl = parse("pl");
  assert.deepEqual(labels(pl.primary), ["Padding L"]);
  assert.ok(pl.alternatives.some((ops) => ops[0].label === "Padding left M"));
  assert.deepEqual(labels(parse("pxl").primary), ["Padding XL"]);
  assert.deepEqual(labels(parse("phl").primary), ["Padding horizontal L"]);
  assert.deepEqual(labels(parse("ph l").primary), ["Padding horizontal L"]);
  assert.deepEqual(labels(parse("pl m").primary), ["Padding left M"]);
});

test("several ops chain, and a component consumes the rest of the input", () => {
  assert.deepEqual(labels(parse("pm gs rl").primary), ["Padding M", "Gap S", "Radius L"]);
  assert.deepEqual(labels(parse("pm +btn").primary), ["Padding M", "Insert Button"]);
  assert.deepEqual(labels(parse("+button (icon").primary), ["Insert Button (icon only)"]);
});

test("fuzzy matches rank exact path segments first and icon fonts last", () => {
  assert.deepEqual(labels(parse("f brand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.deepEqual(labels(parse("bg base-1 pm").primary), ["Fill Base/bfc-base-1", "Padding M"]);
  assert.deepEqual(labels(parse("t s").primary), ["Text S/Open Sans/Regular/Text"]);
  assert.deepEqual(labels(parse("h1").primary), ["Text H1"]);
});

test("aliases expand where an op starts and complete while typing", () => {
  const aliases = { cta: "f brand pm", 1: "gs rl" };
  assert.deepEqual(labels(parse("cta rl", aliases).primary), ["Fill Pop/Brand/bfc-brand", "Padding M", "Radius L"]);
  assert.deepEqual(labels(parse("ct", aliases).alternatives[0]), ["Fill Pop/Brand/bfc-brand", "Padding M"]);
  assert.deepEqual(labels(parse("pm 1", aliases).primary), ["Padding M", "Gap S", "Radius L"]);
});

test("aliases never replace a value", () => {
  const aliases = { m: "rl", brand: "gs" };
  assert.deepEqual(labels(parse("p m", aliases).primary), ["Padding M"]);
  assert.deepEqual(labels(parse("f brand", aliases).primary), ["Fill Pop/Brand/bfc-brand"]);
});

test("alias names may shadow name search but not op syntax", () => {
  assert.equal(ctx.aliasError(ENTRIES, "cta", "f brand"), null);
  assert.equal(ctx.aliasError(ENTRIES, "1", "pm gs"), null);
  assert.match(ctx.aliasError(ENTRIES, "pm", "gs"), /built-in/);
  assert.match(ctx.aliasError(ENTRIES, "h1", "gs"), /built-in/);
  assert.match(ctx.aliasError(ENTRIES, "p", "gs"), /built-in/);
  assert.match(ctx.aliasError(ENTRIES, "x", "zz"), /No matches/);
});

test("shorthand is the shortest input that gives the same ops", () => {
  const p = ctx.createParser(ENTRIES, {});
  assert.equal(p.shorthand(p.parse("p m gs").primary), "pm gs");
  assert.equal(p.shorthand(p.parse("ph l").primary), "phl");
  assert.equal(p.shorthand(p.parse("r full").primary), "r full");
  assert.equal(p.shorthand(p.parse("h1").primary), "h1");
  assert.equal(p.shorthand(p.parse("f brand").primary), "fbrand");
  assert.equal(p.shorthand(p.parse("b base-dimmed-3").primary), "bbasedimmed3");
  assert.equal(p.shorthand([{ slug: "gone", kind: "padding", key: "p", side: "ALL" }]), null);
});

test("b sets a border color, and bare color names stay fills", () => {
  assert.deepEqual(labels(parse("b base-dimmed-3").primary), ["Border Base/bfc-base-dimmed-3"]);
  assert.deepEqual(labels(parse("b brand pm").primary), ["Border Pop/Brand/bfc-brand", "Padding M"]);
  assert.deepEqual(labels(parse("button b brand").primary), ["Insert Button", "Border Pop/Brand/bfc-brand"]);
  assert.deepEqual(labels(parse("brand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.match(ctx.aliasError(ENTRIES, "b", "pm"), /built-in/);
});

test("f, b and t also take a glued value, unless the whole word is a name", () => {
  assert.deepEqual(labels(parse("fbase1").primary), ["Fill Base/bfc-base-1"]);
  assert.deepEqual(labels(parse("bbase-dimmed-3 pm").primary), ["Border Base/bfc-base-dimmed-3", "Padding M"]);
  assert.deepEqual(labels(parse("fbrand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.deepEqual(labels(parse("brand").primary), ["Fill Pop/Brand/bfc-brand"]);
  assert.deepEqual(labels(parse("button").primary), ["Insert Button"]);
  assert.equal(ctx.aliasError(ENTRIES, "brand", "pm"), null);
});

test("frame and auto layout are word ops that chain like inserts", () => {
  assert.deepEqual(labels(parse("frame alh pm rm bbase-dimmed3").primary), [
    "Insert frame", "Auto layout horizontal", "Padding M", "Radius M", "Border Base/bfc-base-dimmed-3",
  ]);
  assert.deepEqual(Array.from(parse("fr").alternatives, labels), [["Insert frame"]]);
  assert.deepEqual(Array.from(parse("al").alternatives, labels), [["Auto layout horizontal"], ["Auto layout vertical"]]);
  const p = ctx.createParser(ENTRIES, {});
  assert.equal(p.shorthand(p.parse("frame alh pm").primary), "frame alh pm");
  assert.deepEqual(Array.from(p.list("layout"), (ops) => p.shorthand(ops)), ["frame", "alh", "alv"]);
  assert.match(ctx.aliasError(ENTRIES, "frame", "pm"), /built-in/);
});

test("bare words search components, text styles and colors by name", () => {
  assert.deepEqual(labels(parse("button").primary), ["Insert Button"]);
  assert.deepEqual(labels(parse("icon button").primary), ["Insert Button (icon only)"]);
  assert.deepEqual(labels(parse("brand pm").primary), ["Fill Pop/Brand/bfc-brand", "Padding M"]);
  assert.deepEqual(labels(parse("button pm").primary), ["Insert Button", "Padding M"]);
  assert.deepEqual(labels(parse("box rm").primary), ["Insert Box", "Radius M"]);
  assert.deepEqual(labels(parse("basic input pm").primary), ["Insert Input/Basic input", "Padding M"]);
});

test("incomplete input has no primary, unknown words are errors", () => {
  const p = parse("p");
  assert.equal(p.primary, null);
  assert.equal(p.alternatives.length, 5);
  assert.match(parse("pm zz gs").error, /No matches for "zz"/);
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
        if (ex.startsWith("=")) continue;
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

  // Padding and gap need auto layout, also when it's added earlier in the same command
  assert.match(check("pm", [frame]).error, /Padding M needs an auto-layout frame/);
  assert.deepEqual(modes("alh pm gs", [frame]), ["apply", "apply", "apply"]);
  assert.deepEqual(modes("pm", [autoFrame]), ["apply"]);
  assert.deepEqual(modes("frame alh pm rm", []), ["insert", "apply", "apply", "apply"]);
  assert.match(check("frame pm", []).error, /auto-layout/);

  // Text styles change selected text, otherwise insert a text layer
  assert.deepEqual(modes("h1", [text]), ["apply"]);
  assert.deepEqual(modes("h1", [frame]), ["insert"]);
  assert.deepEqual(modes("h1", []), ["insert"]);
  assert.match(check("h1 rm", []).error, /Radius M needs/);
  assert.equal(ctx.describeOpsIn(parse("h1").primary, ["insert"]), "Insert text H1");

  // Nothing selected: only inserts can start a command
  assert.equal(check("f brand", []).error, "Select a layer first");
  assert.deepEqual(modes("button pm b brand", []), ["insert", "apply", "apply"]);

  // Auto layout and radius sides
  assert.match(check("alh", [instance]).error, /needs a frame/);
  assert.match(check("rtl s", [caps({ corners: false })]).error, /individual corners/);
  assert.deepEqual(modes("r s", [caps({ corners: false })]), ["apply"]);

  // Mixed selection: available if any layer supports it
  assert.deepEqual(modes("pm", [frame, autoFrame]), ["apply"]);
});
