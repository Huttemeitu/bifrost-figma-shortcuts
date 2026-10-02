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
  ...["Pop/Brand/bfc-brand", "Pop/Brand/bfc-brand-hc", "Base/bfc-base-c-brand", "Base/bfc-base-1"].map((n) => entry("fill", n)),
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
  assert.deepEqual(labels(parse("px l").primary), ["Padding horizontal L"]);
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
  assert.equal(p.shorthand(p.parse("px l").primary), "px l");
  assert.equal(p.shorthand(p.parse("r full").primary), "r full");
  assert.equal(p.shorthand(p.parse("h1").primary), "h1");
  assert.equal(p.shorthand(p.parse("f brand").primary), null);
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
