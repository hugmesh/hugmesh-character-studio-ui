/**
 * COMBINATION-COVERAGE backstop for the SVG compositor ("all combinations",
 * made tractable). E2E cannot afford to click every part of every pack, so this
 * node-side harness re-implements SvgRigService.compose() minimally against the
 * REAL pack.json + part SVG files and asserts, for EVERY enabled pack:
 *
 *   (a) EXHAUSTIVE single-axis sweep — every part of every slot composed at
 *       least once (swapped into the pack's default character);
 *   (b) SEEDED pseudo-random multi-axis sweep — {@link RANDOM_SWEEP_PER_PACK}
 *       full characters per pack (fixed seed ⇒ fully deterministic), half
 *       archetype-respecting (mirroring util/randomize.ts, incl. its
 *       zero-candidate fallback) and half HYBRID (compatibleHeads bypassed,
 *       cross-archetype picks — dragon wings on a rabbit);
 *   (c) EXPRESSION matrix — every expression preset against every part choice
 *       of every expression slot (eyes/brows/mouth);
 *   (d) BOUNDARY combos — first part everywhere, last part everywhere, and
 *       "none" (every optional slot empty).
 *
 * Each composition must yield a WELL-FORMED SVG: XML-parseable, exactly one
 * root-level <style> (part-authored <style>s are allowed but only nested inside
 * a layer <g> — the compositor's wrapping contract), only expected SVG elements,
 * every fallback-less var(--x) declared in the root :root block, and a sane
 * viewBox matching pack.canvas. Runs headless-free (pure node) — wire it next
 * to `npm run validate:assets` in CI: `npm run compose:sweep`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VN = join(__dirname, '..', 'src', 'assets', 'vn');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * Random characters composed per pack in sweep (b). 300 is deliberately far
 * beyond what hand-written cases could cover while still running in seconds;
 * it also BOUNDS the sweep (no unbounded loop if a pack ships more parts).
 */
const RANDOM_SWEEP_PER_PACK = 300;
/** Fixed LCG seed — the sweep is deterministic run-to-run (same as randomize.spec.ts). */
const SWEEP_SEED = 0xc0ffee;

/** Mirrors SvgRigService.SAFE_SVG_CLASS / SAFE_HEX (keep in sync). */
const SAFE_SVG_CLASS = /^[A-Za-z0-9_-]+$/;
const SAFE_HEX = /^#[0-9a-fA-F]{3,8}$/;

/** Element names a composed document may contain (superset of the shipped art). */
const ALLOWED_ELEMENTS = new Set([
  'svg', 'style', 'g', 'defs', 'title', 'desc',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
]);

/** Same LCG as randomize.spec.ts — seeded, uniform-ish in [0, 1). */
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let failures = 0;
let compositions = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); failures++; };

// ── minimal strict XML parser (well-formedness + element tree) ─────────────
// Node ships no DOMParser; this ~60-line recursive parser accepts the XML
// subset a composed SVG can contain (elements, attributes, text, comments) and
// throws on anything malformed — unclosed tags, bad nesting, unquoted attrs.
function parseXml(input) {
  let i = 0;
  const s = input;
  const err = (msg) => { throw new Error(`${msg} at offset ${i}`); };
  const skipMisc = () => {
    for (;;) {
      if (s.startsWith('<!--', i)) {
        const end = s.indexOf('-->', i + 4);
        if (end < 0) err('unterminated comment');
        i = end + 3;
      } else if (s.startsWith('<?', i)) {
        const end = s.indexOf('?>', i + 2);
        if (end < 0) err('unterminated processing instruction');
        i = end + 2;
      } else {
        return;
      }
    }
  };
  const parseName = () => {
    const m = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(s.slice(i));
    if (!m) err('expected a name');
    i += m[0].length;
    return m[0];
  };
  const parseElement = () => {
    if (s[i] !== '<') err('expected "<"');
    i++;
    const name = parseName();
    const node = { name, attrs: {}, children: [] };
    for (;;) {
      while (/\s/.test(s[i])) i++;
      if (s.startsWith('/>', i)) { i += 2; return node; }
      if (s[i] === '>') { i++; break; }
      const attr = parseName();
      while (/\s/.test(s[i])) i++;
      if (s[i] !== '=') err(`attribute "${attr}" missing "="`);
      i++;
      while (/\s/.test(s[i])) i++;
      const quote = s[i];
      if (quote !== '"' && quote !== "'") err(`attribute "${attr}" value not quoted`);
      const end = s.indexOf(quote, i + 1);
      if (end < 0) err(`attribute "${attr}" value unterminated`);
      node.attrs[attr] = s.slice(i + 1, end);
      i = end + 1;
    }
    // children until </name>
    for (;;) {
      if (i >= s.length) err(`unclosed element <${name}>`);
      if (s.startsWith('</', i)) {
        i += 2;
        const closing = parseName();
        if (closing !== name) err(`mismatched </${closing}> (open <${name}>)`);
        while (/\s/.test(s[i])) i++;
        if (s[i] !== '>') err('malformed closing tag');
        i++;
        return node;
      }
      if (s.startsWith('<!--', i)) { skipMisc(); continue; }
      if (s[i] === '<') { node.children.push(parseElement()); continue; }
      // text run (style CSS, whitespace); a bare '<'/'&' error surfaces above
      const next = s.indexOf('<', i);
      if (next < 0) err(`unclosed element <${name}>`);
      node.children.push({ text: s.slice(i, next) });
      i = next;
    }
  };
  skipMisc();
  const root = parseElement();
  skipMisc();
  while (i < s.length && /\s/.test(s[i])) i++;
  if (i < s.length) err('trailing content after the root element');
  return root;
}

// ── minimal node-side mirror of SvgRigService.compose() ────────────────────
const partInnerCache = new Map();

/** Extract the inner markup of an <svg>…</svg> file (rig: DOMParser innerHTML). */
function svgInner(text, file) {
  const open = /<svg\b[^>]*>/.exec(text);
  const closeIdx = text.lastIndexOf('</svg>');
  if (!open || closeIdx < 0) throw new Error(`${file}: not an <svg> document`);
  return text.slice(open.index + open[0].length, closeIdx);
}

function partFile(packDir, file) {
  const p = join(packDir, file);
  let inner = partInnerCache.get(p);
  if (inner === undefined) {
    inner = svgInner(readFileSync(p, 'utf8'), file);
    partInnerCache.set(p, inner);
  }
  return inner;
}

/** Mirrors SvgRigService.compose (no user parts node-side). Keep in sync. */
function compose(def, pack, packDir, expressionSlots = {}) {
  const slots = [...pack.slots].sort((a, b) => a.zOrder - b.zOrder);
  const layers = [];
  const vars = new Map();
  for (const slot of slots) {
    const partId = expressionSlots[slot.slot] ?? def.slots[slot.slot];
    if (!partId) continue;
    const part = slot.parts.find((p) => p.id === partId);
    if (!part) continue;
    layers.push(`<g>${partFile(packDir, part.file)}</g>`);
    for (const tr of part.tintRegions ?? []) {
      if (!SAFE_SVG_CLASS.test(tr.svgClass)) continue;
      const candidate = def.palette[tr.region] ?? tr.defaultPalette;
      const safeHex = SAFE_HEX.test(candidate)
        ? candidate
        : SAFE_HEX.test(tr.defaultPalette) ? tr.defaultPalette : null;
      if (safeHex === null) continue;
      vars.set(tr.svgClass, safeHex);
    }
  }
  const varDecls = [...vars].map(([cls, hex]) => `--${cls}:${hex}`).join(';');
  const ruleDecls = [...vars.keys()].map((cls) => `.${cls}{fill:var(--${cls})}`).join('');
  const w = pack.canvas.width;
  const h = pack.canvas.height;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<style>:root{${varDecls}}${ruleDecls}</style>${layers.join('')}</svg>`
  );
}

/** Mirrors models/vn-character.ts buildDefaultCharacter. */
function defaultCharacter(pack) {
  const slots = {};
  const palette = {};
  for (const s of pack.slots) {
    const first = s.parts[0];
    slots[s.slot] = first ? first.id : null;
    for (const tr of first?.tintRegions ?? []) {
      if (!(tr.region in palette)) palette[tr.region] = tr.defaultPalette;
    }
  }
  return { packId: pack.packId, slots, palette };
}

/**
 * Mirrors util/randomize.ts randomizeCharacter (incl. the required-slot
 * zero-candidate FALLBACK to an unfiltered pick). `hybrid` bypasses the
 * compatibleHeads filter entirely — the picker's hybrid mode — producing
 * cross-archetype combinations the curated filter would never emit.
 */
function randomCharacter(pack, rng, hybrid) {
  const CURATED = ['#8b5a2b', '#ff4f79', '#00bcd4', '#ffdbac', '#090806', '#76ff03'];
  const slots = {};
  const palette = {};
  let head = null;
  const establishes = (slot) => slot.parts.some((p) => !!p.headArchetype);
  const ordered = [...pack.slots.filter(establishes), ...pack.slots.filter((s) => !establishes(s))];
  const pickFrom = (items) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
  for (const slot of ordered) {
    let candidates = hybrid
      ? slot.parts
      : slot.parts.filter(
          (p) => !p.compatibleHeads || p.compatibleHeads.includes('*') ||
            (head != null && p.compatibleHeads.includes(head)),
        );
    if (!hybrid && head != null) {
      const matching = candidates.filter((p) => p.headArchetype === head);
      if (matching.length > 0) candidates = matching;
    }
    if (slot.required && candidates.length === 0) candidates = slot.parts; // fallback guard
    const include = slot.required || rng() < 0.6;
    const part = include && candidates.length > 0 ? pickFrom(candidates) : null;
    slots[slot.slot] = part ? part.id : null;
    if (!part) continue;
    if (head == null && part.headArchetype) head = part.headArchetype;
    for (const tr of part.tintRegions ?? []) {
      if (!(tr.region in palette)) palette[tr.region] = pickFrom(CURATED);
    }
  }
  return { packId: pack.packId, slots, palette };
}

// ── per-composition assertions ──────────────────────────────────────────────
function walk(node, visit) {
  if (node.name) {
    visit(node);
    for (const c of node.children) walk(c, visit);
  }
}

function assertComposition(svg, pack, label) {
  compositions++;
  let root;
  try {
    root = parseXml(svg);
  } catch (e) {
    fail(`${label}: composed SVG is not well-formed XML — ${e.message}`);
    return;
  }
  if (root.name !== 'svg') {
    fail(`${label}: root element is <${root.name}>, expected <svg>`);
    return;
  }
  // canvas-bounds sanity: viewBox matches pack.canvas and is a sane size
  const expectViewBox = `0 0 ${pack.canvas.width} ${pack.canvas.height}`;
  if (root.attrs.viewBox !== expectViewBox) {
    fail(`${label}: viewBox "${root.attrs.viewBox}" ≠ "${expectViewBox}"`);
  }
  if (!(pack.canvas.width > 0 && pack.canvas.height > 0 &&
        pack.canvas.width <= 4096 && pack.canvas.height <= 4096)) {
    fail(`${label}: pack canvas ${pack.canvas.width}x${pack.canvas.height} out of sane bounds (0, 4096]`);
  }
  // exactly ONE root-level <style>; part-authored styles only nested in a <g>
  const rootStyles = root.children.filter((c) => c.name === 'style');
  if (rootStyles.length !== 1) {
    fail(`${label}: ${rootStyles.length} root-level <style> elements, expected exactly 1`);
  }
  const layerGs = root.children.filter((c) => c.name === 'g');
  if (root.children.filter((c) => c.name).length !== rootStyles.length + layerGs.length) {
    fail(`${label}: unexpected non-<style>/non-<g> direct child of the composite root`);
  }
  // only expected elements anywhere in the document
  walk(root, (n) => {
    if (!ALLOWED_ELEMENTS.has(n.name)) fail(`${label}: unexpected element <${n.name}>`);
  });
  // every fallback-less var(--x) must be declared in the root :root{} block
  const rootCss = (rootStyles[0]?.children ?? []).map((c) => c.text ?? '').join('');
  const declared = new Set([...rootCss.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
  for (const m of svg.matchAll(/var\(\s*--([A-Za-z0-9_-]+)\s*\)/g)) {
    if (!declared.has(m[1])) {
      fail(`${label}: var(--${m[1]}) has no fallback and no :root declaration`);
    }
  }
}

// ── the sweeps ──────────────────────────────────────────────────────────────
const index = readJson(join(VN, 'manifest.json'));
for (const entry of (index.packs ?? []).filter((p) => p.enabled)) {
  const packPath = join(VN, entry.path);
  const packDir = dirname(packPath);
  const pack = readJson(packPath);
  console.log(`• pack ${pack.packId}`);
  const before = failures;

  // (a) exhaustive single-axis: every part of every slot at least once
  let partCount = 0;
  for (const slot of pack.slots) {
    for (const part of slot.parts) {
      const def = defaultCharacter(pack);
      def.slots[slot.slot] = part.id;
      assertComposition(compose(def, pack, packDir), pack, `${slot.slot}/${part.id}`);
      partCount++;
    }
  }
  console.log(`  ✓ (a) exhaustive: ${partCount} part(s) composed across ${pack.slots.length} slot(s)`);

  // (b) seeded random sweep — half curated-filtered, half hybrid (cross-archetype)
  const rng = seededRng(SWEEP_SEED);
  const requiredSlots = pack.slots.filter((s) => s.required).map((s) => s.slot);
  for (let n = 0; n < RANDOM_SWEEP_PER_PACK; n++) {
    const hybrid = n >= RANDOM_SWEEP_PER_PACK / 2;
    const def = randomCharacter(pack, rng, hybrid);
    for (const slot of requiredSlots) {
      if (!def.slots[slot]) fail(`random #${n}${hybrid ? ' (hybrid)' : ''}: required slot "${slot}" empty`);
    }
    assertComposition(compose(def, pack, packDir), pack, `random #${n}${hybrid ? ' (hybrid)' : ''}`);
  }
  console.log(`  ✓ (b) seeded random sweep: ${RANDOM_SWEEP_PER_PACK} characters (seed 0x${SWEEP_SEED.toString(16)})`);

  // (c) every expression preset × every part choice of every expression slot
  let exprCombos = 0;
  const exprSlotNames = pack.expressionSlots ?? [];
  for (const ref of pack.expressions ?? []) {
    const preset = readJson(join(packDir, ref.path));
    for (const slotName of exprSlotNames) {
      const slot = pack.slots.find((s) => s.slot === slotName);
      if (!slot) continue;
      for (const part of slot.parts) {
        const def = defaultCharacter(pack);
        def.slots[slotName] = part.id;
        assertComposition(
          compose(def, pack, packDir, preset.slots),
          pack,
          `expression ${ref.id} × ${slotName}/${part.id}`,
        );
        exprCombos++;
      }
    }
  }
  console.log(`  ✓ (c) expression matrix: ${exprCombos} combination(s)`);

  // (d) boundary combos: first-everywhere, last-everywhere, none (optionals empty)
  const boundary = (picker) => {
    const def = defaultCharacter(pack);
    for (const s of pack.slots) def.slots[s.slot] = picker(s);
    return def;
  };
  assertComposition(compose(boundary((s) => s.parts[0]?.id ?? null), pack, packDir), pack, 'boundary/first');
  assertComposition(compose(boundary((s) => s.parts[s.parts.length - 1]?.id ?? null), pack, packDir), pack, 'boundary/last');
  assertComposition(
    compose(boundary((s) => (s.required ? s.parts[0]?.id ?? null : null)), pack, packDir),
    pack,
    'boundary/none',
  );
  console.log('  ✓ (d) boundary combos: first / last / none');

  if (failures === before) console.log('  ✓ all compositions well-formed');
}

console.log(`\n${compositions} composition(s) checked.`);
if (failures > 0) {
  console.error(`FAILED: ${failures} problem(s).`);
  process.exit(1);
}
console.log('OK: every combination composed to well-formed SVG.');
