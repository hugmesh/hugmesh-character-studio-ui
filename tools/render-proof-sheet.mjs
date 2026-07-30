/**
 * Render per-head proof compositions for a pack: for every head part, compose
 * backdrop-less body+head+brows+eyes+mouth (matching archetype where narrowed)
 * into ONE flattened SVG with the palette RESOLVED to literal hexes (no CSS
 * custom properties), so any rasterizer — librsvg, ImageMagick, a browser —
 * renders it identically to the studio preview.
 *
 * Usage: node tools/render-proof-sheet.mjs <packId> <outDir>
 * Then e.g.: for f in out/*.svg; do rsvg-convert -w 256 "$f" -o "${f%.svg}.png"; done
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [packId = 'srd-taxonomy-v1', outDir = 'out/proof'] = process.argv.slice(2);
const __dirname = dirname(fileURLToPath(import.meta.url));
const packDir = join(__dirname, '..', 'src', 'assets', 'vn', 'packs', packId);
const pack = JSON.parse(readFileSync(join(packDir, 'pack.json'), 'utf8'));
mkdirSync(outDir, { recursive: true });

const bySlot = new Map(pack.slots.map((s) => [s.slot, s]));
const partsOf = (slot) => bySlot.get(slot)?.parts ?? [];

/** Strip the outer <svg> wrapper and any <style> block, keeping shape markup. */
const inner = (svg) =>
  svg
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .trim();

const load = (part) => readFileSync(join(packDir, part.file), 'utf8');

/** Pick the first slot part compatible with the head's archetype. */
function pickFor(slot, head) {
  const arch = head.headArchetype ?? 'humanoid';
  const parts = partsOf(slot);
  const ok = (p) => {
    const c = p.compatibleHeads;
    if (!c || c.includes('*')) return true;
    return c.includes(arch);
  };
  // canonical neutral face parts first (alphabetical order would compose everyone angry)
  const DEFAULTS = { eyes: 'eyes_round_01', brows: 'brows_neutral_01', mouth: 'mouth_smile_01' };
  const preferred = parts.find((p) => p.id === DEFAULTS[slot]);
  if (preferred && ok(preferred)) return preferred;
  // prefer an archetype-matching id (body_canid for canid), else first compatible
  return parts.find((p) => ok(p) && p.id.includes(arch.split('_')[0])) ?? parts.find(ok) ?? null;
}

for (const head of partsOf('head')) {
  const layers = [];
  const palette = new Map();
  const add = (part) => {
    if (!part) return;
    for (const tr of part.tintRegions ?? []) {
      palette.set(tr.region, { cls: tr.svgClass, hex: tr.defaultPalette });
    }
    layers.push(`<g data-part="${part.id}">${inner(load(part))}</g>`);
  };
  add(pickFor('body', head));
  add(head);
  add(pickFor('brows', head));
  add(pickFor('eyes', head));
  add(pickFor('mouth', head));

  const rules = [...palette.values()]
    .map(({ cls, hex }) =>
      cls === 'region-line'
        ? `.${cls}{fill:none;stroke:${hex};stroke-width:14;stroke-linecap:round}`
        : `.${cls}{fill:${hex}}`,
    )
    .join('');
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><style>${rules}</style>${layers.join('')}</svg>`;
  writeFileSync(join(outDir, `${head.id}.svg`), doc);
}
console.log(`wrote ${partsOf('head').length} proof SVGs to ${outDir}`);
