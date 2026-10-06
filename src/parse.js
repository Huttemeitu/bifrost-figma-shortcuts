// --- Prompt syntax parser ---
// Pure (no figma API): it runs both in the plugin code and inside the palette
// window (inlined by generate.js), and test/parse.test.js loads it into a vm.

const KIND_LABEL = { padding: "Padding", gap: "Gap", radius: "Radius", fill: "Fill", stroke: "Border", textstyle: "Text", component: "Insert" };
const SIDE_LABEL = {
  ALL: "", H: " horizontal", V: " vertical", T: " top", B: " bottom", L: " left", R: " right",
  TL: " top-left", TR: " top-right", BL: " bottom-left", BR: " bottom-right",
};

// Op key -> [kind, side]. Sides map to fields via FIELD_SETS in runtime.js.
const SIDE_OPS = {
  p: ["padding", "ALL"], ph: ["padding", "H"], pv: ["padding", "V"],
  pt: ["padding", "T"], pb: ["padding", "B"], pl: ["padding", "L"], pr: ["padding", "R"],
  g: ["gap", "ALL"],
  r: ["radius", "ALL"], rt: ["radius", "T"], rb: ["radius", "B"], rl: ["radius", "L"], rr: ["radius", "R"],
  rtl: ["radius", "TL"], rtr: ["radius", "TR"], rbl: ["radius", "BL"], rbr: ["radius", "BR"],
};
const FUZZY_OPS = { f: "fill", bg: "fill", b: "stroke", t: "textstyle" };

// Ops that are a single word with no value or token behind them (no slug).
const WORD_OPS = {
  frame: { kind: "frame", label: "Insert frame" },
  alh: { kind: "autolayout", value: "HORIZONTAL", label: "Auto layout horizontal" },
  alv: { kind: "autolayout", value: "VERTICAL", label: "Auto layout vertical" },
};


// What a bare word like "button" or "brand" searches, in tie-break order. Not
// stroke: it has the same names as fill, so a bare color name means fill.
const SEARCH_KINDS = ["component", "textstyle", "fill"];

// Palette groups. `prefix` turns input typed inside a group into full syntax
// ("m" in Padding is "pm", "brand" in Fill is "f brand").
const GROUPS = [
  { kind: "padding", label: "Padding", key: "p", prefix: "p" },
  { kind: "gap", label: "Gap", key: "g", prefix: "g" },
  { kind: "radius", label: "Radius", key: "r", prefix: "r" },
  { kind: "fill", label: "Fill", key: "f", prefix: "f " },
  { kind: "stroke", label: "Border", key: "b", prefix: "b " },
  { kind: "textstyle", label: "Text", key: "t", prefix: "t " },
  { kind: "component", label: "Component", key: "+", prefix: "+" },
  { kind: "layout", label: "Layout", key: "al", prefix: "al" },
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
      [["ph l", "pv s"], "Padding horizontal or vertical"],
      [["pt m", "pb m", "pl m", "pr m"], "Padding on one side"],
      [["gs"], "Gap S"],
      [["rl", "r full"], "Radius on all corners"],
      [["rt m", "rtl s"], "Radius on two corners or one corner"],
    ],
  },
  {
    title: "Colors and text",
    rows: [
      [["f brand", "fbase1", "bg base-1"], "Fill, matched by color name (dashes optional)"],
      [["b base-dimmed-3", "bbrand"], "Border, 1px on all sides, matched by color name"],
      [["h1", "h3", "t regular"], "Text style: changes selected text, or inserts a new text layer"],
    ],
  },
  {
    title: "Frames and auto layout",
    rows: [
      [["frame"], "Insert a frame; ops after it apply to the new frame"],
      [["alh", "alv"], "Auto layout horizontal or vertical"],
      [["frame alh pm rm"], "Build a styled frame in one go"],
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

// Dashes and other separators are optional when comparing with the last segment
// ("base3" matches "bfc-base-3").
// 0 = a path segment equals the query, 1 = last segment starts with it,
// 2 = contains it, or every query word starts a word in the name, in any order
// ("icon button" -> "Button (icon only)", but not "box rm" -> "Checkbox-indeteRMinate"),
// 3 = subsequence within one path segment, starting at a word start ("btn" ->
// "Button", but not "modal" -> "M/Open sans/semibold itALic"), -1 = no match.
function matchScore(name, q) {
  const n = name.toLowerCase();
  const segs = n.split("/");
  const last = segs[segs.length - 1].replace(/^bfc-/, "");
  const compact = (s) => s.replace(/[^a-z0-9]/g, "");
  if (segs.includes(q) || (compact(q) && compact(last) === compact(q))) return 0;
  if (last.startsWith(q) || compact(last).startsWith(compact(q))) return 1;
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

  const isKeyword = (w) => Boolean(SIDE_OPS[w] || FUZZY_OPS[w] || WORD_OPS[w] || w.startsWith("+") || aliases[w]);
  const wordOp = (w) => Object.assign({ key: w }, WORD_OPS[w]);
  const bestScore = (kinds, q) =>
    kinds.flatMap(byKind).reduce((best, e) => {
      const s = matchScore(e.name, q);
      return s >= 0 && (best < 0 || s < best) ? s : best;
    }, -1);
  const isStrongName = (w) => {
    const s = bestScore(SEARCH_KINDS, w);
    return s >= 0 && s <= 2;
  };

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

      if (WORD_OPS[w]) {
        ops.push(wordOp(w));
        continue;
      }
      // Typing a word op ("fr", "al"): offer it before other readings like f + "r".
      const wordCompletions = isLast ? Object.keys(WORD_OPS).filter((k) => k.startsWith(w)) : [];
      if (wordCompletions.length) return { primary: null, alternatives: wordCompletions.map((k) => ops.concat(wordOp(k))) };

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

      // Glued form: "pm", "phl", "rtlm". If several ops fit, the shortest wins
      // ("pl" is Padding L) and the others become alternatives.
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

      // Glued fuzzy op: "fbase3", "bbrand", "tregular". Only when the whole word
      // isn't a good name match itself, so "brand", "button" and "tag" stay searches.
      const gluedKey = Object.keys(FUZZY_OPS)
        .filter((k) => w.startsWith(k) && w.length > k.length)
        .sort((a, b) => b.length - a.length)
        .find((k) => fuzzy([FUZZY_OPS[k]], w.slice(k.length), 1).length);
      if (gluedKey && !isStrongName(w)) {
        const kind = FUZZY_OPS[gluedKey];
        const q = w.slice(gluedKey.length);
        if (isLast) return fuzzySlot(ops, [kind], q);
        ops.push(nameOp(fuzzy([kind], q, 1)[0]));
        continue;
      }

      // Anything else is a name search over components, text styles and colors.
      // The longest run of words that matches a name wins, as long as what
      // follows still parses: "basic input pm" is Basic input · Padding M, and
      // "box rm" is Box · Radius M because no name matches "box rm".
      if (search) {
        // A name never runs into an op keyword, a +component or an alias, so
        // "button b brand" is Button · Border, not a search for "button b".
        let end = i + 1;
        while (end < words.length && !isKeyword(words[end].toLowerCase())) end++;
        for (let j = end; j > i + 1; j--) {
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

  // The shortest readable built-in input for these ops ("pm gs", "p none",
  // "fbase3"), or null if some op has none (components and most text styles are
  // searched by name, and a color only gets one if its compact name is unique).
  // Values longer than 3 characters get a space. Cached: the Fill group asks
  // for hundreds at once.
  const shorthandCache = new Map();
  const COLOR_KEYS = { fill: "f", stroke: "b" };
  function shorthand(ops) {
    const cacheKey = ops.map((o) => (o.slug || o.key) + ":" + (o.side || "")).join(",");
    if (!shorthandCache.has(cacheKey)) shorthandCache.set(cacheKey, computeShorthand(ops));
    return shorthandCache.get(cacheKey);
  }
  // "fbase3" for Base/bfc-base-3: the key plus the compact last segment, if that
  // gives exactly this color when parsed. Checked from a per-kind index instead
  // of a full parse per row, which took close to a second for all fills.
  const compactLast = (name) => name.toLowerCase().split("/").pop().replace(/^bfc-/, "").replace(/[^a-z0-9]/g, "");
  const colorIndex = {};
  function colorShorthand(kind, entry) {
    if (!colorIndex[kind]) {
      const counts = {};
      const segs = new Set();
      for (const e of byKind(kind)) {
        counts[compactLast(e.name)] = (counts[compactLast(e.name)] || 0) + 1;
        for (const seg of e.name.toLowerCase().split("/")) segs.add(seg);
      }
      colorIndex[kind] = { counts, segs };
    }
    const c = compactLast(entry.name);
    const { counts, segs } = colorIndex[kind];
    // Another color with the same compact name, or "b" + "g..." reading as "bg" (fill).
    if (!c || counts[c] !== 1 || (kind === "stroke" && c.startsWith("g"))) return null;
    const word = COLOR_KEYS[kind] + c;
    // A path segment equal to it ("brand" in Pop/Brand) makes ranking decide: parse to be sure.
    if (segs.has(c)) {
      const r = parse(word).primary;
      return r && r.length === 1 && r[0].slug === entry.slug ? word : null;
    }
    return isStrongName(word) ? null : word;
  }

  function computeShorthand(ops) {
    const parts = [];
    for (const op of ops) {
      if (WORD_OPS[op.key]) {
        parts.push(op.key);
        continue;
      }
      if (!bySlug[op.slug]) return null;
      const name = bySlug[op.slug].name.toLowerCase();
      if (op.key) {
        const glued = parse(op.key + name).primary;
        const ok = name.length <= 3 && glued && glued.length === 1 && glued[0].slug === op.slug && glued[0].side === op.side;
        parts.push(ok ? op.key + name : op.key + " " + name);
      } else if (op.kind === "textstyle" && /^h[1-5]$/.test(name)) {
        parts.push(name);
      } else if (COLOR_KEYS[op.kind]) {
        const word = colorShorthand(op.kind, bySlug[op.slug]);
        if (!word) return null;
        parts.push(word);
      } else {
        return null;
      }
    }
    return parts.join(" ");
  }

  // Every entry of a kind as a one-op list (all sides/corners for spacing and radius).
  function list(kind) {
    if (kind === "layout") return Object.keys(WORD_OPS).map((k) => [wordOp(k)]);
    const key = { padding: "p", gap: "g", radius: "r" }[kind];
    return byKind(kind).map((e) => [key ? sideOp(key, e) : nameOp(e)]);
  }

  return { parse, shorthand, list };
}

// The Options tree: kinds, then the entry's group (a fill's collection, a
// component's page), then its name path. A group with a single child is merged
// into it, so there are no one-item levels to click through. Every node has
// `slugs`: all leaf slugs below it, for toggling a whole group at once.
function buildOptionTree(entries) {
  const root = { id: "", label: "All options", children: [] };
  const groupNode = (parent, label) => {
    let node = parent.children.find((c) => c.children && c.label === label);
    if (!node) parent.children.push((node = { id: parent.id + "/" + label, label, children: [] }));
    return node;
  };
  for (const g of GROUPS) {
    const kindNode = { id: g.kind, label: g.label, children: [] };
    for (const e of entries) {
      if (e.kind !== g.kind) continue;
      let parts = e.name.split("/");
      if (e.kind === "component") parts = [e.name.startsWith(e.group + "/") ? e.name.slice(e.group.length + 1) : e.name];
      if (e.group) parts = [e.group].concat(parts);
      let node = kindNode;
      for (const seg of parts.slice(0, -1)) node = groupNode(node, seg);
      node.children.push({ id: e.slug, label: parts[parts.length - 1], slug: e.slug });
    }
    if (kindNode.children.length) root.children.push(kindNode);
  }
  const finish = (node, isKind) => {
    if (!node.children) {
      node.slugs = [node.slug];
      return node;
    }
    node.children = node.children.map((c) => finish(c, false));
    if (!isKind && node.children.length === 1) {
      const only = node.children[0];
      const label = only.label === node.label ? node.label : node.label + "/" + only.label;
      return Object.assign({}, only, { label });
    }
    node.slugs = node.children.flatMap((c) => c.slugs);
    return node;
  };
  root.children = root.children.map((c) => finish(c, true));
  root.slugs = root.children.flatMap((c) => c.slugs);
  return root;
}

// --- Availability: which ops can do something to which layers ---
// Layers are described by capabilities (nodeCaps in runtime.js): which properties
// an op needs for it to have a visible effect. The palette hides ops that would
// do nothing, and the plugin applies an op only to layers that support it, so
// both sides must use opSupports and checkOps below.

// Capabilities of layers created by inserts. A component's instance is assumed
// to be auto layout: what's inside isn't known until it's imported.
const INSERTED_CAPS = {
  frame: { fills: true, strokes: true, radius: true, corners: true, autoLayout: false, canAutoLayout: true, text: false },
  component: { fills: true, strokes: true, radius: true, corners: true, autoLayout: true, canAutoLayout: false, text: false },
  textstyle: { fills: true, strokes: true, radius: false, corners: false, autoLayout: false, canAutoLayout: false, text: true },
};

function opNeed(op) {
  if (op.kind === "padding" || op.kind === "gap") return "autoLayout";
  if (op.kind === "radius") return op.side === "ALL" ? "radius" : "corners";
  if (op.kind === "fill") return "fills";
  if (op.kind === "stroke") return "strokes";
  if (op.kind === "autolayout") return "canAutoLayout";
  if (op.kind === "textstyle") return "text";
  return null;
}

const NEED_MESSAGE = {
  autoLayout: "needs an auto-layout frame. Add alh or alv first",
  radius: "needs a frame or shape with corner radius",
  corners: "needs a frame or rectangle with individual corners",
  fills: "needs a layer that can have a fill",
  strokes: "needs a layer that can have a border",
  canAutoLayout: "needs a frame (instances get auto layout from their component)",
};

function opSupports(caps, op) {
  const need = opNeed(op);
  return !need || Boolean(caps[need]);
}

// Walks the ops in order against the selected layers' capabilities, the same way
// applyOps applies them: inserts (frame, component, and a text style when no
// text is selected) replace the targets with the new layer, and alh/alv make
// frames auto layout. Returns { modes } ("insert" or "apply" per op), or
// { error, index } for the first op that would do nothing.
function checkOps(ops, selection) {
  let targets = selection;
  const modes = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const inserts = op.kind === "frame" || op.kind === "component" || (op.kind === "textstyle" && !targets.some((t) => t.text));
    if (inserts) {
      targets = [INSERTED_CAPS[op.kind]];
      modes.push("insert");
      continue;
    }
    if (!targets.some((t) => opSupports(t, op))) {
      const error = targets.length ? opLabel(op, "apply") + " " + NEED_MESSAGE[opNeed(op)] : "Select a layer first";
      return { error, index: i };
    }
    if (op.kind === "autolayout") targets = targets.map((t) => (t.canAutoLayout ? Object.assign({}, t, { autoLayout: true }) : t));
    modes.push("apply");
  }
  return { modes };
}

// A text style inserts a new text layer when no text is selected.
function opLabel(op, mode) {
  return op.kind === "textstyle" && mode === "insert" ? "Insert text " + op.label.replace(/^Text /, "") : op.label;
}
function describeOpsIn(ops, modes) {
  return ops.map((op, i) => opLabel(op, modes && modes[i])).join(" · ");
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

// The Numpad N menu commands run the alias named N without the palette.
function aliasOps(entries, aliases, name) {
  if (!aliases[name]) return { error: 'No alias "' + name + '". Add one with =' + name + " in the palette" };
  const r = createParser(entries, aliases).parse(name);
  if (!r.primary) return { error: "Alias " + name + ": " + (r.error || "incomplete") };
  return { ops: r.primary };
}

function describeOps(ops) {
  return ops.map((o) => o.label).join(" · ");
}
