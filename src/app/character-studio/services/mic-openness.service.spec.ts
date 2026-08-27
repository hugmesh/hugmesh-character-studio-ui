import { TestBed } from '@angular/core/testing';
import { MicDeps, MicOpennessService } from './mic-openness.service';
import { OPEN_RMS_REFERENCE } from '../lipsync/openness';

/** A fake Web-Audio graph: what the analyser "hears" is whatever the test writes. */
function fakeDeps(level: { value: number }) {
  const stopped: string[] = [];
  const ticks: Array<() => void> = [];
  const track = { stop: () => stopped.push('track') };
  const source = { connect: () => undefined, disconnect: () => stopped.push('source') };
  const analyser = {
    fftSize: 0,
    getFloatTimeDomainData: (buf: Float32Array) => buf.fill(level.value),
  };
  const ctx = {
    createMediaStreamSource: () => source,
    createAnalyser: () => analyser,
    close: () => { stopped.push('ctx'); return Promise.resolve(); },
  };
  const deps: MicDeps = {
    stream: () => Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream),
    context: () => ctx as unknown as AudioContext,
    schedule: (cb) => { ticks.push(cb); return ticks.length; },
    cancel: () => { stopped.push('raf'); },
  };
  return { deps, stopped, tick: () => { const cb = ticks.shift(); cb?.(); }, analyser };
}

describe('MicOpennessService', () => {
  it('drives openness from the analyser frames and stops cleanly', async () => {
    const level = { value: 0 };
    const f = fakeDeps(level);
    const svc = TestBed.inject(MicOpennessService);
    const drive = await svc.start(f.deps);
    expect(f.analyser.fftSize).toBe(1024);
    expect(drive.openness()).toBe(0);
    level.value = OPEN_RMS_REFERENCE * 4;   // loud
    f.tick();
    const first = drive.openness();
    expect(first).toBeGreaterThan(0);
    f.tick();
    expect(drive.openness()).toBeGreaterThan(first);   // easing toward 1
    drive.stop();
    expect(drive.openness()).toBe(0);
    expect(f.stopped).toEqual(['raf', 'source', 'track', 'ctx']);
    f.tick();                                           // a late frame is ignored
    expect(drive.openness()).toBe(0);
  });

  it('propagates a refused permission as a rejection', async () => {
    const svc = TestBed.inject(MicOpennessService);
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const deps: MicDeps = { ...fakeDeps({ value: 0 }).deps, stream: () => Promise.reject(err) };
    await expectAsync(svc.start(deps)).toBeRejectedWith(err);
  });
});
