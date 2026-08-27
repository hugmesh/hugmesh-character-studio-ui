import { IDENTITY_TRANSFORM, SlotTransform, clampSlotTransform, isIdentityTransform } from '../models/vn-character';

/** An axis-aligned box in pack-canvas pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a face feature belongs on a head, as a fraction of the head's measured
 * height from its top. These are the placements the auto-fit proposes; the user
 * can still nudge every slot afterwards.
 */
export const FEATURE_TARGETS: Readonly<Record<string, number>> = {
  brows: 0.36,
  eyes: 0.46,
  feature: 0.56,
  mouth: 0.68,
};

export function boxCenter(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/**
 * Auto-fit: for every feature whose NATURAL bounds (measured with no transform)
 * are known, the nudge that centres it on the head horizontally and lands it at
 * its target height. Scale and rotation the user set are kept. The result is
 * SPARSE and rounded to half a pixel; a feature already in place gets no entry.
 */
export function autoFitTransforms(
  head: Box,
  features: Record<string, Box>,
  existing: Record<string, SlotTransform> = {},
): Record<string, SlotTransform> {
  const out: Record<string, SlotTransform> = {};
  const headCx = head.x + head.w / 2;
  for (const [slot, frac] of Object.entries(FEATURE_TARGETS)) {
    const box = features[slot];
    if (!box) {
      continue;
    }
    const c = boxCenter(box);
    const dx = Math.round((headCx - c.x) * 2) / 2;
    const dy = Math.round((head.y + head.h * frac - c.y) * 2) / 2;
    const keep = existing[slot] ?? IDENTITY_TRANSFORM;
    const t = clampSlotTransform({ dx, dy, scale: keep.scale, rot: keep.rot });
    if (!isIdentityTransform(t)) {
      out[slot] = t;
    }
  }
  return out;
}
