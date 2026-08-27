import { Injectable, NgZone, Signal, inject, signal } from '@angular/core';
import { DEFAULT_FFT_SIZE, nextOpenness } from '../lipsync/openness';

/** A live mouth drive: the openness signal + the stop() the caller owes it. */
export interface MouthDrive {
  readonly openness: Signal<number>;
  stop(): void;
}

/** The browser pieces the drive needs, injectable so a test passes fakes. */
export interface MicDeps {
  stream(): Promise<MediaStream>;
  context(): AudioContext;
  schedule(cb: () => void): number;
  cancel(handle: number): void;
}

export function browserMicDeps(): MicDeps {
  return {
    stream: () => navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
    context: () => new AudioContext(),
    schedule: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
  };
}

/**
 * Microphone → openness. Explicit user action only (a permission prompt is a
 * consequence the user must have asked for). The analyser loop runs outside
 * Angular; the signal write is the only thing inside it.
 */
@Injectable({ providedIn: 'root' })
export class MicOpennessService {
  private readonly zone = inject(NgZone);

  async start(deps: MicDeps = browserMicDeps()): Promise<MouthDrive> {
    const stream = await deps.stream();
    const ctx = deps.context();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = DEFAULT_FFT_SIZE;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const openness = signal(0);
    let handle = 0;
    let live = true;
    let prev = 0;
    const tick = () => {
      if (!live) {
        return;
      }
      analyser.getFloatTimeDomainData(buffer);
      prev = nextOpenness(prev, buffer);
      this.zone.run(() => openness.set(prev));
      handle = deps.schedule(tick);
    };
    this.zone.runOutsideAngular(() => {
      handle = deps.schedule(tick);
    });
    return {
      openness: openness.asReadonly(),
      stop: () => {
        live = false;
        deps.cancel(handle);
        try {
          source.disconnect();
        } catch {
          /* already gone */
        }
        for (const t of stream.getTracks()) {
          t.stop();
        }
        void ctx.close?.();
        openness.set(0);
      },
    };
  }
}
