import { autoFitTransforms, boxCenter, FEATURE_TARGETS } from './rig-fit';

describe('rig auto-fit', () => {
  const head = { x: 200, y: 100, w: 400, h: 400 };   // centre x = 400

  it('centres each measured feature on the head and lands it at its target height', () => {
    const eyes = { x: 300, y: 200, w: 100, h: 40 };   // centre (350, 220)
    const out = autoFitTransforms(head, { eyes });
    expect(Object.keys(out)).toEqual(['eyes']);
    expect(out['eyes'].dx).toBe(50);                                        // 400 - 350
    expect(out['eyes'].dy).toBe(100 + 400 * FEATURE_TARGETS['eyes'] - 220); // target y - centre y
    expect(out['eyes'].scale).toBe(1);
    expect(out['eyes'].rot).toBe(0);
  });

  it('is sparse — a feature already in place gets no entry — and rounds to half a pixel', () => {
    const mouthY = 100 + 400 * FEATURE_TARGETS['mouth'];
    const mouth = { x: 350, y: mouthY - 10, w: 100, h: 20 };   // already centred
    expect(autoFitTransforms(head, { mouth })).toEqual({});
    const off = { x: 350.3, y: mouthY - 10, w: 100, h: 20 };
    expect(autoFitTransforms(head, { mouth: off })['mouth'].dx).toBe(-0.5);
  });

  it('keeps the scale and rotation the user set, and clamps the nudge', () => {
    const brows = { x: 0, y: 0, w: 10, h: 10 };
    const out = autoFitTransforms(head, { brows }, { brows: { dx: 0, dy: 0, scale: 1.5, rot: 10 } });
    expect(out['brows'].scale).toBe(1.5);
    expect(out['brows'].rot).toBe(10);
    expect(out['brows'].dx).toBeLessThanOrEqual(256);
  });

  it('ignores slots with no measured box and unknown slots', () => {
    expect(autoFitTransforms(head, { tail: { x: 0, y: 0, w: 1, h: 1 } })).toEqual({});
    expect(boxCenter({ x: 0, y: 0, w: 2, h: 4 })).toEqual({ x: 1, y: 2 });
  });
});
