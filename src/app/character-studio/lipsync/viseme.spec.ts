import { VISEME_HYSTERESIS, VISEME_MIN_HOLD_MS, VISEME_THRESHOLDS, VisemeCadence, quantizeOpenness } from './viseme';

/** The VN talk loop: three drawn frames, hysteresis so a threshold cannot flicker, a hold so it reads as speech. */
describe('lip-sync visemes', () => {
  it('quantizes openness into closed / half / open at the rising thresholds', () => {
    expect(quantizeOpenness(0)).toBe('closed');
    expect(quantizeOpenness(VISEME_THRESHOLDS.half - 0.01)).toBe('closed');
    expect(quantizeOpenness(VISEME_THRESHOLDS.half)).toBe('half');
    expect(quantizeOpenness(VISEME_THRESHOLDS.open - 0.01)).toBe('half');
    expect(quantizeOpenness(VISEME_THRESHOLDS.open)).toBe('open');
    expect(quantizeOpenness(1)).toBe('open');
  });

  it('treats NaN / negative / >1 as silence or full open, never a crash', () => {
    expect(quantizeOpenness(Number.NaN)).toBe('closed');
    expect(quantizeOpenness(-3)).toBe('closed');
    expect(quantizeOpenness(42)).toBe('open');
  });

  it('holds a frame across the hysteresis band on the way down', () => {
    const justUnderOpen = VISEME_THRESHOLDS.open - VISEME_HYSTERESIS / 2;
    // rising from half: not yet open
    expect(quantizeOpenness(justUnderOpen, 'half')).toBe('half');
    // falling from open: still open — the same value, a different frame
    expect(quantizeOpenness(justUnderOpen, 'open')).toBe('open');
    const justUnderHalf = VISEME_THRESHOLDS.half - VISEME_HYSTERESIS / 2;
    expect(quantizeOpenness(justUnderHalf, 'closed')).toBe('closed');
    expect(quantizeOpenness(justUnderHalf, 'half')).toBe('half');
  });

  it('cadence changes frame only after the minimum hold', () => {
    const c = new VisemeCadence();
    expect(c.step(1, 0)).toBe('open');            // first change is immediate
    expect(c.step(0, 10)).toBe('open');           // too soon: held
    expect(c.step(0, VISEME_MIN_HOLD_MS)).toBe('closed');
    c.reset();
    expect(c.viseme).toBe('closed');
  });
});
