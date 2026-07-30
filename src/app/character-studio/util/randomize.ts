import { PartManifest, SlotDef } from '../models/vn-manifest';
import { VnCharacter } from '../models/vn-character';

/**
 * Curated palette the randomizer draws tint colours from — natural fur tones,
 * vivid accents, skin tones, and hair colours. All `#rrggbb` so every value
 * passes SvgRigService's SAFE_HEX check and the palette `<input type="color">`.
 */
export const CURATED_COLORS: readonly string[] = [
  // natural fur tones
  '#8b5a2b',
  '#a0522d',
  '#6b4423',
  '#d2b48c',
  '#b8860b',
  '#c0c0c0',
  '#f5f5dc',
  '#4a3728',
  '#2f2f2f',
  // vivid accents
  '#ff4f79',
  '#00bcd4',
  '#7c4dff',
  '#76ff03',
  '#ff9100',
  '#00e5a0',
  // skin tones
  '#ffdbac',
  '#f1c27d',
  '#e0ac69',
  '#c68642',
  '#8d5524',
  // hair colours
  '#090806',
  '#71635a',
  '#b7a69e',
  '#fff5e1',
  '#e6cea8',
  '#563d2d',
  '#dc4b3e',
];

/** Chance an OPTIONAL slot gets a part at all (else it stays empty). */
const OPTIONAL_PART_PROBABILITY = 0.6;

/** Uniform pick from a non-empty list (clamped so an rng returning 1 stays in range). */
function pickFrom<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** True when any of the slot's parts declares a head archetype (body/head slots). */
function establishesArchetype(slot: SlotDef): boolean {
  return slot.parts.some(p => !!p.headArchetype);
}

/**
 * Build a random-but-valid character from a pack ("Surprise me", B0 §3.2):
 *
 * - every REQUIRED slot gets a part; OPTIONAL slots get one with
 *   {@link OPTIONAL_PART_PROBABILITY}, else stay empty (null);
 * - head-archetype compatibility is respected exactly like
 *   {@link PartPickerComponent.partsFor}: the body/head slots (those whose parts
 *   declare `headArchetype`) are chosen FIRST — in manifest order, mirroring the
 *   picker's activeHead scan — to establish ONE archetype, and every other slot
 *   then draws only from parts whose `compatibleHeads` admits it ('*' or absent
 *   = fits any head);
 * - every tint region on the chosen parts is seeded with a colour from
 *   {@link CURATED_COLORS} (first part naming a region wins, as in
 *   buildDefaultCharacter).
 *
 * Pure: `rng` (a `() => number` in [0, 1), e.g. `Math.random`) is injected so
 * tests can seed it; the pack is never mutated.
 */
export function randomizeCharacter(pack: PartManifest, rng: () => number): VnCharacter {
  const slots: Record<string, string | null> = {};
  const palette: Record<string, string> = {};
  let head: string | null = null;

  // Body/head first (manifest order), then the feature slots.
  const ordered = [
    ...pack.slots.filter(establishesArchetype),
    ...pack.slots.filter(s => !establishesArchetype(s)),
  ];

  for (const slot of ordered) {
    // Same predicate as PartPickerComponent.partsFor.
    let candidates = slot.parts.filter(
      p =>
        !p.compatibleHeads ||
        p.compatibleHeads.includes('*') ||
        (head != null && p.compatibleHeads.includes(head)),
    );
    // Once the first pick establishes the archetype, keep the remaining
    // archetype-declaring slots (e.g. head after body) to that ONE archetype.
    if (head != null) {
      const matching = candidates.filter(p => p.headArchetype === head);
      if (matching.length > 0) {
        candidates = matching;
      }
    }
    // GUARD: a pack whose required slot has NO compatible part for the chosen
    // archetype (e.g. every part lists other heads) must still produce a valid
    // character — fall back to an UNFILTERED pick rather than leave the slot
    // empty (which would make the character unexportable forever).
    if (slot.required && candidates.length === 0) {
      candidates = slot.parts;
    }

    const include = slot.required || rng() < OPTIONAL_PART_PROBABILITY;
    const part = include && candidates.length > 0 ? pickFrom(candidates, rng) : null;
    slots[slot.slot] = part ? part.id : null;
    if (!part) {
      continue;
    }
    if (head == null && part.headArchetype) {
      head = part.headArchetype;
    }
    for (const tr of part.tintRegions ?? []) {
      if (!(tr.region in palette)) {
        palette[tr.region] = pickFrom(CURATED_COLORS, rng);
      }
    }
  }

  return {
    schemaVersion: 1,
    packId: pack.packId,
    name: 'Untitled',
    slots,
    palette,
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    defaultExpression: 'neutral',
  };
}
