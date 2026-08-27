/**
 * Visual-novel lip-sync: the mouth does not scale continuously with loudness,
 * it CYCLES through a few drawn frames — closed, half, open — the way a VN's
 * talking sprites do. This module turns the platform's amplitude contract
 * (openness 0..1, see openness.ts) into that frame, with hysteresis so noise
 * around a threshold cannot flicker, and a minimum hold so frames read as
 * speech rather than a meter.
 */
export type Viseme = 'closed' | 'half' | 'open';
export const VISEMES: readonly Viseme[] = ['closed', 'half', 'open'];

/** How much taller the CHOSEN mouth is drawn per frame when a pack ships no variants. */
export const VISEME_OPEN_SCALE: Readonly<Record<Viseme, number>> = { closed: 1, half: 1.35, open: 1.9 };
/** Openness at which a frame becomes half / open (rising edge). */
export const VISEME_THRESHOLDS = { half: 0.2, open: 0.55 } as const;
/** Falling edges sit this much lower, so a value hovering on a threshold holds its frame. */
export const VISEME_HYSTERESIS = 0.05;
/** A frame is held at least this long — roughly the 8–12 fps of a VN talk loop. */
export const VISEME_MIN_HOLD_MS = 90;

function clamp01(v: number): number {
  return !Number.isFinite(v) || v <= 0 ? 0 : v >= 1 ? 1 : v;
}

/** The frame for an openness, given the previous frame (hysteresis on the way down). */
export function quantizeOpenness(openness: number, prev: Viseme = 'closed'): Viseme {
  const o = clamp01(openness);
  const h = VISEME_HYSTERESIS;
  const openAt = prev === 'open' ? VISEME_THRESHOLDS.open - h : VISEME_THRESHOLDS.open;
  const halfAt = prev === 'closed' ? VISEME_THRESHOLDS.half : VISEME_THRESHOLDS.half - h;
  if (o >= openAt) return 'open';
  if (o >= halfAt) return 'half';
  return 'closed';
}

/** Frame selection with the VN cadence: a frame changes only after its minimum hold. */
export class VisemeCadence {
  private current: Viseme = 'closed';
  private since = Number.NEGATIVE_INFINITY;

  constructor(private readonly minHoldMs: number = VISEME_MIN_HOLD_MS) {}

  get viseme(): Viseme {
    return this.current;
  }

  step(openness: number, nowMs: number): Viseme {
    const next = quantizeOpenness(openness, this.current);
    if (next !== this.current && nowMs - this.since >= this.minHoldMs) {
      this.current = next;
      this.since = nowMs;
    }
    return this.current;
  }

  reset(): void {
    this.current = 'closed';
    this.since = Number.NEGATIVE_INFINITY;
  }
}
