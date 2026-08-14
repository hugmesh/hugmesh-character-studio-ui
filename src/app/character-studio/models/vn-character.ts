import { PartManifest, TintRegion } from './vn-manifest';

/**
 * A user-drawn part overriding a slot (B0 drawable, v2 §2). `svgInline` is the
 * (client-sanitized) SVG markup — NOT a pack file. On persist it is re-sanitized
 * server-side and stored; in-session it renders directly.
 */
export interface UserPart {
  svgInline: string;
  tintRegions: TintRegion[];
}

/**
 * A continuous blend for one slot: crossfades the slot's chosen part
 * ({@link VnCharacter.slots}) toward a second part in the SAME slot, instead of
 * only ever picking one or the other. `t=0` renders the chosen part alone,
 * `t=1` renders {@link toId} alone; in between, both layer with complementary
 * opacity (see `SvgRigService.compose`). This is a continuous axis ACROSS a
 * roster of discrete hand-drawn parts (e.g. the body-type roster), not a
 * geometric morph — the parts are independent flat-vector art sharing a
 * common canvas/anchor, not a shared topology, so opacity crossfade is the
 * honest interpolation, not a shape blend.
 */
export interface SlotBlend {
  /** The other endpoint partId, in the same slot as the base choice. */
  toId: string;
  /** 0 = base part only, 1 = toId only, in between = both layered. */
  t: number;
}

/**
 * The canonical, replayable description of a character (v2). Persisted as
 * `vn_character.definition` (user-bff) later; here it drives the SVG-DOM rig.
 */
export interface VnCharacter {
  schemaVersion: number;
  packId: string;
  name: string;
  /** slot → chosen partId (or null for an empty slot). */
  slots: Record<string, string | null>;
  /** tint region → hex colour. */
  palette: Record<string, string>;
  transform: { scale: number; offsetX: number; offsetY: number };
  defaultExpression: string;
  /** slot → user-drawn override (takes precedence over the pack part). */
  userParts?: Record<string, UserPart>;
  /** slot → continuous blend toward a second part in that slot (see {@link SlotBlend}). */
  slotBlend?: Record<string, SlotBlend>;
}

/**
 * Build a sensible default character from a pack: the first part of every slot,
 * each tint region seeded with its part's `defaultPalette`.
 */
export function buildDefaultCharacter(pack: PartManifest): VnCharacter {
  const slots: Record<string, string | null> = {};
  const palette: Record<string, string> = {};
  for (const s of pack.slots) {
    const first = s.parts[0];
    slots[s.slot] = first ? first.id : null;
    for (const tr of first?.tintRegions ?? []) {
      if (!(tr.region in palette)) {
        palette[tr.region] = tr.defaultPalette;
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
