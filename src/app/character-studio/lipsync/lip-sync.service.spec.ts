import { TestBed } from '@angular/core/testing';
import { LipSyncService } from './lip-sync.service';
import { MicDeps } from '../services/mic-openness.service';
import { OPEN_RMS_REFERENCE } from './openness';
import { VISEME_MIN_HOLD_MS } from './viseme';

describe('LipSyncService', () => {
  let svc: LipSyncService;
  let clock: number;

  function deps(level: { value: number }) {
    const ticks: Array<() => void> = [];
    const d: MicDeps = {
      stream: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream),
      context: () => ({
        createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
        createAnalyser: () => ({ fftSize: 0, getFloatTimeDomainData: (b: Float32Array) => b.fill(level.value) }),
        close: () => Promise.resolve(),
      } as unknown as AudioContext),
      schedule: (cb) => { ticks.push(cb); return ticks.length; },
      cancel: () => undefined,
    };
    return { d, tick: () => ticks.shift()?.() };
  }

  beforeEach(() => {
    svc = TestBed.inject(LipSyncService);
    clock = 0;
    svc.now = () => clock;
  });

  afterEach(() => svc.stopMic());

  it('previews a frame by hand while no mic is live', () => {
    expect(svc.viseme()).toBe('closed');
    svc.previewViseme('open');
    expect(svc.viseme()).toBe('open');
    expect(svc.micLive()).toBeFalse();
  });

  it('the mic wins while live, then the preview returns', async () => {
    svc.previewViseme('half');
    const level = { value: OPEN_RMS_REFERENCE * 10 };
    const f = deps(level);
    expect(await svc.startMic(f.d)).toBeTrue();
    expect(svc.micLive()).toBeTrue();
    expect(svc.viseme()).toBe('closed');            // silence until a frame arrives
    for (let i = 0; i < 12; i++) { clock += VISEME_MIN_HOLD_MS; f.tick(); TestBed.flushEffects(); }
    expect(svc.openness()).toBeGreaterThan(0.9);
    expect(svc.viseme()).toBe('open');
    svc.stopMic();
    expect(svc.micLive()).toBeFalse();
    expect(svc.openness()).toBe(0);
    expect(svc.viseme()).toBe('half');              // the hand-picked preview again
  });

  it('reports a refused permission in words and stays off', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const d: MicDeps = { ...deps({ value: 0 }).d, stream: () => Promise.reject(err) };
    expect(await svc.startMic(d)).toBeFalse();
    expect(svc.micLive()).toBeFalse();
    expect(svc.micError()).toContain('permission');
  });
});
