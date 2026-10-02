// --- Prompt syntax parser ---
// Pure (no figma API): it runs both in the plugin code and inside the palette
// window (inlined by generate.js), and test/parse.test.js loads it into a vm.

const KIND_LABEL = { padding: "Padding", gap: "Gap", radius: "Radius", fill: "Fill", textstyle: "Text", component: "Insert" };
const SIDE_LABEL = {
  ALL: "", H: " horizontal", V: " vertical", T: " top", B: " bottom", L: " left", R: " right",
  TL: " top-left", TR: " top-right", BL: " bottom-left", BR: " bottom-right",
};

// Op key -> [kind, side]. Sides map to fields via FIELD_SETS in runtime.js.
const SIDE_OPS = {
  p: ["padding", "ALL"], px: ["padding", "H"], py: ["padding", "V"],
  pt: ["padding", "T"], pb: ["padding", "B"], pl: ["padding", "L"], pr: ["padding", "R"],
  g: ["gap", "ALL"],
  r: ["radius", "ALL"], rt: ["radius", "T"], rb: ["radius", "B"], rl: ["radius", "L"], rr: ["radius", "R"],
  rtl: ["radius", "TL"], rtr: ["radius", "TR"], rbl: ["radius", "BL"], rbr: ["radius", "BR"],
};
const FUZZY_OPS = { f: "fill", bg: "fill", t: "textstyle" };

// What a bare word like "button" or "brand" searches, in tie-break order.
const SEARCH_KINDS = ["component", "textstyle", "fill"];

// Palette groups. `prefix` turns input typed inside a group into full syntax
// ("m" in Padding is "pm", "brand" in Fill is "f brand").
const GROUPS = [
  { kind: "padding", label: "Padding", key: "p", prefix: "p" },
  { kind: "gap", label: "Gap", key: "g", prefix: "g" },
  { kind: "radius", label: "Radius", key: "r", prefix: "r" },
  { kind: "fill", label: "Fill", key: "f", prefix: "f " },
  { kind: "textstyle", label: "Text", key: "t", prefix: "t " },
  { kind: "component", label: "Component", key: "+", prefix: "+" },
];

const ALIAS_NAME = /^[a-z0-9][a-z0-9-]*$/;

// Icon font styles share sizes with real text styles; rank them last in fuzzy matches.
const DEMOTED = /\/font awesome\//i;

// The help view's Guide tab: sections of [examples, meaning]. Every example is
// clickable and must parse. Keep in sync with parse() and the README table.
const SYNTAX = [
  {
    title: "Spacing and radius",
    rows: [
      [["pm", "p m"], "Padding M on all sides"],
      [["px l", "py s"], "Padding horizontal or vertical"],
      [["pt m", "pb m", "pl m", "pr m"], "Padding on one side"],
      [["gs"], "Gap S"],
      [["rl", "r full"], "Radius on all corners"],
      [["rt m", "rtl s"], "Radius on two corners or one corner"],
    ],
  },
  {
    title: "Colors and text",
    rows: [
      [["f brand", "bg base-1"], "Fill, matched by color name"],
      [["h1", "h3", "t regular"], "Text style"],
    ],
  },
  {
    title: "Components",
    rows: [
      [["button", "basic input"], "Search components, text styles and colors by name"],
      [["+button"], "Insert a component; everything after + is its name"],
      [["box rm"], "Insert, then style the new instance"],
    ],
  },
  {
    title: "Combine and save",
    rows: [
      [["pm gs rl"], "Several at once"],
      [["=cta f brand"], "Save an alias; =cta on its own deletes it"],
    ],
  },
];

// 0 = a path segment equals the query, 1 = last segment starts with it,
// 2 = contains it, or every query word starts a word in the name, in any order
// ("icon button" -> "Button (icon only)", but not "box rm" -> "Checkbox-indeteRMinate"),
// 3 = subsequence within one path segment, starting at a word start ("btn" ->
// "Button", but not "modal" -> "M/Open sans/semibold itALic"), -1 = no match.
function matchScore(name, q) {
  const n = name.toLowerCase();
  const segs = n.split("/");
  if (segs.includes(q)) return 0;
  if (segs[segs.length - 1].replace(/^bfc-/, "").startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  const words = q.split(" ");
  const nameWords = n.split(/[^a-z0-9]+/);
  if (words.length > 1 && words.every((w) => nameWords.some((nw) => nw.startsWith(w)))) return 2;
  for (const seg of segs) {
    for (let start = 0; start < seg.length; start++) {
      if (seg[start] !== q[0] || (start > 0 && !/[\s(.-]/.test(seg[start - 1]))) continue;
      let i = 0;
      for (const ch of seg.slice(start)) if (ch === q[i]) i++;
      if (i === q.length) return 3;
    }
  }
  return -1;
}

// options.search = false turns off name search for bare words, leaving only
// op syntax (used to check alias names against built-in syntax).
// options.limit caps fuzzy matches per slot (default 12).
function createParser(entries, aliases, options) {
  const search = !options || options.search !== false;
  const limit = (options && options.limit) || 12;
  const bySlug = {};
  for (const e of entries) bySlug[e.slug] = e;
  const kindCache = {};
  const byKind = (kind) => kindCache[kind] || (kindCache[kind] = entries.filter((e) => e.kind === kind));
  const valueEntry = (kind, v) => byKind(kind).find((e) => e.name.toLowerCase() === v);

  function sideOp(key, entry) {
    const [kind, side] = SIDE_OPS[key];
    return { slug: entry.slug, kind, side, key, label: KIND_LABEL[kind] + SIDE_LABEL[side] + " " + entry.name };
  }
  function nameOp(entry) {
    return { slug: entry.slug, kind: entry.kind, label: KIND_LABEL[entry.kind] + " " + entry.name };
  }

  function fuzzy(kinds, q, limit) {
    return kinds
      .flatMap(byKind)
      .map((e) => [e, matchScore(e.name, q)])
      .filter(([, s]) => s >= 0)
      .sort(
        (a, b) =>
          a[1] - b[1] ||
          DEMOTED.test(a[0].name) - DEMOTED.test(b[0].name) ||
          kinds.indexOf(a[0].kind) - kinds.indexOf(b[0].kind) ||
          a[0].name.length - b[0].name.length
      )
      .slice(0, limit)
      .map(([e]) => e);
  }

  function fuzzySlot(ops, kinds, q) {
    const m = fuzzy(kinds, q, limit);
    if (!m.length) return { error: "No " + (kinds.length > 1 ? "" : KIND_LABEL[kinds[0]].toLowerCase() + " ") + 'matches "' + q + '"' };
    if (!q) return { primary: null, alternatives: m.map((e) => ops.concat(nameOp(e))) };
    return { primary: ops.concat(nameOp(m[0])), alternatives: m.slice(1).map((e) => ops.concat(nameOp(e))) };
  }

  // Returns { primary: ops | null, alternatives: ops[] } or { error }.
  // primary is how the whole input is understood; alternatives are other
  // readings or completions of the last word.
  function parse(query) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    const ops = [];
    // Aliases only expand where an op can start, never where a value is
    // expected, so an alias named "m" or "brand" can't break "p m" or "f brand".
    // Words that came from an alias (up to aliasEnd) aren't expanded again.
    let aliasEnd = -1;
    words: for (let i = 0; i < words.length; i++) {
      const alias = i > aliasEnd && aliases[words[i].toLowerCase()];
      if (alias) {
        const parts = alias.trim().split(/\s+/);
        words.splice(i, 1, ...parts);
        aliasEnd = i + parts.length - 1;
        i--;
        continue;
      }
      const w = words[i].toLowerCase();
      const isLast = i === words.length - 1;

      if (w.startsWith("+")) {
        const q = [w.slice(1)].concat(words.slice(i + 1)).join(" ").toLowerCase().trim();
        return fuzzySlot(ops, ["component"], q);
      }

      if (FUZZY_OPS[w]) {
        const kind = FUZZY_OPS[w];
        if (isLast) return fuzzySlot(ops, [kind], "");
        const q = words[++i].toLowerCase();
        if (i === words.length - 1) return fuzzySlot(ops, [kind], q);
        const best = fuzzy([kind], q, 1)[0];
        if (!best) return { error: "No " + KIND_LABEL[kind].toLowerCase() + ' matches "' + q + '"' };
        ops.push(nameOp(best));
        continue;
      }

      if (/^h[1-5]$/.test(w) && valueEntry("textstyle", w)) {
        ops.push(nameOp(valueEntry("textstyle", w)));
        continue;
      }

      // Two-word form: "pl m", "rtl s"
      const next = words[i + 1] && words[i + 1].toLowerCase();
      if (SIDE_OPS[w] && next !== undefined) {
        const e = valueEntry(SIDE_OPS[w][0], next);
        if (e) {
          ops.push(sideOp(w, e));
          i++;
          continue;
        }
        if (i + 1 === words.length - 1) {
          const opts = byKind(SIDE_OPS[w][0]).filter((x) => x.name.toLowerCase().startsWith(next));
          if (opts.length) return { primary: null, alternatives: opts.map((x) => ops.concat(sideOp(w, x))) };
        }
      }

      // Glued form: "pm", "pxl", "rtlm". The shortest op wins, so "pxl" is
      // Padding XL and "px l" is needed for Padding horizontal L.
      const readings = Object.keys(SIDE_OPS)
        .filter((k) => w.startsWith(k) && w.length > k.length)
        .map((k) => {
          const e = valueEntry(SIDE_OPS[k][0], w.slice(k.length));
          return e && sideOp(k, e);
        })
        .filter(Boolean)
        .sort((a, b) => a.key.length - b.key.length);
      if (readings.length) {
        if (!isLast) {
          ops.push(readings[0]);
          continue;
        }
        const sideValues = SIDE_OPS[w] ? byKind(SIDE_OPS[w][0]).map((x) => ops.concat(sideOp(w, x))) : [];
        return {
          primary: ops.concat(readings[0]),
          alternatives: readings.slice(1).map((x) => ops.concat(x)).concat(sideValues),
        };
      }

      if (isLast && SIDE_OPS[w]) {
        return { primary: null, alternatives: byKind(SIDE_OPS[w][0]).map((x) => ops.concat(sideOp(w, x))) };
      }

      // Anything else is a name search over components, text styles and colors.
      // The longest run of words that matches a name wins, as long as what
      // follows still parses: "basic input pm" is Basic input · Padding M, and
      // "box rm" is Box · Radius M because no name matches "box rm".
      if (search) {
        for (let j = words.length; j > i + 1; j--) {
          const name = words.slice(i, j).join(" ").toLowerCase();
          const match = fuzzy(SEARCH_KINDS, name, 1)[0];
          if (!match) continue;
          if (j === words.length) return fuzzySlot(ops, SEARCH_KINDS, name);
          if (parse(words.slice(j).join(" ")).error) continue;
          ops.push(nameOp(match));
          i = j - 1;
          continue words;
        }
      }
      const found = search && w.length >= 2 ? fuzzy(SEARCH_KINDS, w, limit) : [];
      if (!isLast && found.length) {
        ops.push(nameOp(found[0]));
        continue;
      }
      if (!isLast) return { error: 'No matches for "' + words[i] + '". Type ? for help' };

      // Still typing the last word: completions of ops and aliases come first,
      // then name matches.
      const partial = Object.keys(SIDE_OPS)
        .filter((k) => w.startsWith(k) && w.length > k.length)
        .flatMap((k) =>
          byKind(SIDE_OPS[k][0])
            .filter((x) => x.name.toLowerCase().startsWith(w.slice(k.length)))
            .map((x) => ops.concat(sideOp(k, x)))
        );
      const aliasOpts = Object.keys(aliases)
        .filter((a) => a.startsWith(w))
        .map((a) => parse(words.slice(0, i).concat(a).join(" ")).primary)
        .filter(Boolean);
      const named = found.map((e) => ops.concat(nameOp(e)));
      if (!partial.length && !aliasOpts.length && named.length) return { primary: named[0], alternatives: named.slice(1) };
      if (partial.length || aliasOpts.length) return { primary: null, alternatives: aliasOpts.concat(partial, named) };
      return { error: 'No matches for "' + words[i] + '". Type ? for help' };
    }
    return { primary: ops.length ? ops : null, alternatives: [] };
  }

  // The shortest readable built-in input for these ops ("pm gs", "p none"), or
  // null if some op has none (fills, most text styles and components are
  // searched by name). Values longer than 3 characters get a space.
  function shorthand(ops) {
    const parts = [];
    for (const op of ops) {
      const name = bySlug[op.slug] ? bySlug[op.slug].name.toLowerCase() : "";
      if (op.key) {
        const glued = parse(op.key + name).primary;
        const ok = name.length <= 3 && glued && glued.length === 1 && glued[0].slug === op.slug && glued[0].side === op.side;
        parts.push(ok ? op.key + name : op.key + " " + name);
      } else if (op.kind === "textstyle" && /^h[1-5]$/.test(name)) {
        parts.push(name);
      } else {
        return null;
      }
    }
    return parts.join(" ");
  }

  // Every entry of a kind as a one-op list (all sides/corners for spacing and radius).
  function list(kind) {
    const key = { padding: "p", gap: "g", radius: "r" }[kind];
    return byKind(kind).map((e) => [key ? sideOp(key, e) : nameOp(e)]);
  }

  return { parse, shorthand, list };
}

// True if the ops change the current selection's properties. Ops after a
// component insert apply to the new instance, so only a leading op counts.
function needsSelection(ops) {
  return ops.length > 0 && ops[0].kind !== "component";
}

// Returns an error message, or null if the alias can be saved.
function aliasError(entries, name, expansion) {
  if (!ALIAS_NAME.test(name)) return "Alias names are lowercase letters, digits and -, not starting with -";
  const r0 = createParser(entries, {}, { search: false }).parse(name);
  if (!r0.error) return '"' + name + '" is already built-in syntax';
  if (/[=?]/.test(expansion)) return "An alias can't contain = or ?";
  const r = createParser(entries, {}).parse(expansion);
  if (r.error) return r.error;
  if (!r.primary) return "Incomplete: " + expansion;
  return null;
}

function describeOps(ops) {
  return ops.map((o) => o.label).join(" · ");
}
