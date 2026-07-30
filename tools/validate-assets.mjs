/**
 * Validate the VN asset library against the v2 part-manifest JSON Schema (SVG).
 * Run: `npm run validate:assets`. For every pack in manifest.json: schema-validate
 * pack.json, confirm each part SVG exists, and assert each tintRegion.svgClass
 * actually appears as a class in the part SVG (so recolor will bind). Exit non-zero
 * on any failure (CI gate).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

// ── HARD CAPS (overflow/limits hardening) ───────────────────────────────────
// Every part SVG is inlined into ONE composed document at render time, so
// unbounded assets become unbounded DOM/data-URL growth in the browser. These
// caps are generous — the largest shipped part is ~2.6 KB, the biggest slot
// (menagerie head) has 54 parts, the busiest pack has 12 slots — but they turn
// a runaway pack into a loud CI failure instead of a slow studio.
/** Max bytes for a single part SVG file (largest shipped: ~2.6 KB). */
const MAX_PART_SVG_BYTES = 8192;
/** Max parts per slot (largest shipped slot: 54 — the menagerie head). */
const MAX_PARTS_PER_SLOT = 100;
/** Max slots per pack (busiest shipped pack: 12). */
const MAX_SLOTS_PER_PACK = 24;
/** Max part id length (ids become data-testids + CSS-safe tokens). */
const MAX_PART_ID_LEN = 64;
/** Max displayName length (labels are ellipsized in the picker at ~48 chars). */
const MAX_DISPLAY_NAME_LEN = 48;
/** Max tint regions per part (most shipped: 4; each becomes a CSS var). */
const MAX_TINT_REGIONS_PER_PART = 6;
/** Max expression presets per pack (shipped: 4; each renders a toggle button). */
const MAX_EXPRESSIONS_PER_PACK = 16;

const __dirname = dirname(fileURLToPath(import.meta.url));
const VN = join(__dirname, '..', 'src', 'assets', 'vn');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(readJson(join(VN, 'schema', 'vn-part-manifest-v2.schema.json')));
// OPTIONAL — only used for packs that ship an `expressions` index.
const validateExpression = ajv.compile(readJson(join(VN, 'schema', 'vn-expression-v1.schema.json')));

let failures = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); failures++; };

const index = readJson(join(VN, 'manifest.json'));
if (!Array.isArray(index.packs) || index.packs.length === 0) {
  fail('manifest.json has no packs');
}

for (const entry of index.packs ?? []) {
  const packPath = join(VN, entry.path);
  if (!existsSync(packPath)) { fail(`pack file missing: ${entry.path}`); continue; }
  const pack = readJson(packPath);
  console.log(`• pack ${entry.packId} (${entry.path})`);

  if (!validate(pack)) {
    for (const e of validate.errors ?? []) {
      fail(`schema ${e.instancePath || '/'} ${e.message}`);
    }
    continue;
  }
  console.log('  ✓ schema valid');

  const packDir = dirname(packPath);
  let hasSrd = false;
  if (pack.slots.length > MAX_SLOTS_PER_PACK) {
    fail(`pack has ${pack.slots.length} slots — cap is ${MAX_SLOTS_PER_PACK} (every slot renders a picker fieldset)`);
  }
  for (const slot of pack.slots) {
    if (slot.parts.length > MAX_PARTS_PER_SLOT) {
      fail(`${slot.slot}: ${slot.parts.length} parts — cap is ${MAX_PARTS_PER_SLOT} per slot (every part renders a picker button)`);
    }
    for (const part of slot.parts) {
      if (part.id.length > MAX_PART_ID_LEN) {
        fail(`${slot.slot}/${part.id.slice(0, 24)}…: part id is ${part.id.length} chars — cap is ${MAX_PART_ID_LEN}`);
      }
      if (part.displayName.length > MAX_DISPLAY_NAME_LEN) {
        fail(`${slot.slot}/${part.id}: displayName is ${part.displayName.length} chars — cap is ${MAX_DISPLAY_NAME_LEN}`);
      }
      if ((part.tintRegions ?? []).length > MAX_TINT_REGIONS_PER_PART) {
        fail(`${slot.slot}/${part.id}: ${part.tintRegions.length} tintRegions — cap is ${MAX_TINT_REGIONS_PER_PART} per part`);
      }
      if (typeof part.source === 'string' && /SRD/i.test(part.source)) { hasSrd = true; }
      const partPath = join(packDir, part.file);
      if (!existsSync(partPath)) { fail(`${slot.slot}/${part.id}: missing file ${part.file}`); continue; }
      const bytes = statSync(partPath).size;
      if (bytes > MAX_PART_SVG_BYTES) {
        fail(`${slot.slot}/${part.id}: ${part.file} is ${bytes} bytes — cap is ${MAX_PART_SVG_BYTES} (parts are inlined into ONE composed SVG)`);
      }
      const svg = readFileSync(partPath, 'utf8');
      for (const tr of part.tintRegions ?? []) {
        // the svgClass must appear as a class= token so the recolor var binds
        const re = new RegExp(`class\\s*=\\s*["'][^"']*\\b${tr.svgClass}\\b`);
        if (!re.test(svg)) {
          fail(`${slot.slot}/${part.id}: svgClass "${tr.svgClass}" (region "${tr.region}") not found in ${part.file}`);
        }
      }
    }
  }
  console.log('  ✓ all parts exist + tint svgClasses present');

  // CC-BY: any pack shipping SRD-sourced parts MUST carry the verbatim SRD 5.1
  // attribution (CATALOG-DND-SRD.md §"Required attribution string" / ATTRIBUTION.txt).
  if (hasSrd) {
    const NEEDLE =
      'System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC';
    if (typeof pack.attribution !== 'string' || !pack.attribution.includes(NEEDLE)) {
      fail(`pack carries SRD-sourced parts but its "attribution" is missing/incomplete (must include the verbatim SRD 5.1 CC-BY string)`);
    } else {
      console.log('  ✓ SRD attribution present');
    }
  }

  // OPTIONAL expressions (EXPRESSION-PREVIEW slice). A pack without an
  // `expressions` index is untouched — existing packs stay valid. When present,
  // each preset file must schema-validate and reference real parts in slots the
  // pack actually declares (and, if `expressionSlots` is set, only those slots).
  if (Array.isArray(pack.expressions) && pack.expressions.length > 0) {
    if (pack.expressions.length > MAX_EXPRESSIONS_PER_PACK) {
      fail(`pack has ${pack.expressions.length} expressions — cap is ${MAX_EXPRESSIONS_PER_PACK} (every preset renders a toggle button)`);
    }
    const slotParts = new Map(
      pack.slots.map((s) => [s.slot, new Set(s.parts.map((p) => p.id))]),
    );
    const allowedSlots = Array.isArray(pack.expressionSlots)
      ? new Set(pack.expressionSlots)
      : null;
    for (const ex of pack.expressions) {
      const exPath = join(packDir, ex.path);
      if (!existsSync(exPath)) { fail(`expression "${ex.id}": missing file ${ex.path}`); continue; }
      const preset = readJson(exPath);
      if (!validateExpression(preset)) {
        for (const e of validateExpression.errors ?? []) {
          fail(`expression "${ex.id}" schema ${e.instancePath || '/'} ${e.message}`);
        }
        continue;
      }
      if (preset.id !== ex.id) {
        fail(`expression "${ex.id}": file id "${preset.id}" does not match index id`);
      }
      for (const [slot, partId] of Object.entries(preset.slots)) {
        if (allowedSlots && !allowedSlots.has(slot)) {
          fail(`expression "${ex.id}": slot "${slot}" is not in the pack's expressionSlots`);
          continue;
        }
        const parts = slotParts.get(slot);
        if (!parts) { fail(`expression "${ex.id}": unknown slot "${slot}"`); continue; }
        if (!parts.has(partId)) {
          fail(`expression "${ex.id}": slot "${slot}" override partId "${partId}" not found in pack`);
        }
      }
    }
    console.log(`  ✓ ${pack.expressions.length} expression(s) valid`);
  }
}

if (failures > 0) {
  console.error(`\nFAILED: ${failures} problem(s).`);
  process.exit(1);
}
console.log('\nOK: all packs valid.');
