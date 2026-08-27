import { DEFAULT_SMOOTHING, OPEN_RMS_REFERENCE, frameRms, nextOpenness, rmsToOpenness, smoothOpenness } from './openness';

/** The vendored amplitude→openness math (byte-faithful to hugmesh-matrix-ui vn/voice/openness.ts). */
describe('lip-sync openness math', () => {
  it('an empty or silent frame is silence', () => {
    expect(frameRms(new Float32Array(0))).toBe(0);
    expect(frameRms(new Float32Array(64))).toBe(0);
    expect(frameRms(new Uint8Array(64).fill(128))).toBe(0);
  });

  it('float and byte frames of the same signal agree', () => {
    const f = new Float32Array(8).fill(0.5);
    const b = new Uint8Array(8).fill(128 + 64);
    expect(frameRms(f)).toBeCloseTo(0.5, 6);
    expect(frameRms(b)).toBeCloseTo(0.5, 6);
  });

  it('maps RMS to openness against the reference and clamps', () => {
    expect(rmsToOpenness(0)).toBe(0);
    expect(rmsToOpenness(OPEN_RMS_REFERENCE / 2)).toBeCloseTo(0.5, 6);
    expect(rmsToOpenness(OPEN_RMS_REFERENCE * 3)).toBe(1);
    expect(rmsToOpenness(0.1, -1)).toBeCloseTo(0.1 / OPEN_RMS_REFERENCE, 6);   // bad reference → default
    expect(rmsToOpenness(Number.NaN)).toBe(0);
  });

  it('smooths as an EMA and the full step composes the three', () => {
    expect(smoothOpenness(0, 1)).toBeCloseTo(DEFAULT_SMOOTHING, 6);
    expect(smoothOpenness(0, 1, 1)).toBe(1);
    expect(smoothOpenness(0.5, 0.5, 0)).toBe(0.5);
    const loud = new Float32Array(16).fill(OPEN_RMS_REFERENCE * 2);
    expect(nextOpenness(0, loud)).toBeCloseTo(DEFAULT_SMOOTHING, 6);
    expect(nextOpenness(0, loud, { smoothing: 1 })).toBe(1);
  });
});
