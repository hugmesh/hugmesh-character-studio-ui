import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { MicDeps, MicOpennessService, MouthDrive } from '../services/mic-openness.service';
import { Viseme, VisemeCadence } from './viseme';

/**
 * The studio's ONE lip-sync state: which mouth frame the canvas draws right now.
 *
 * Two drivers, one output. A microphone drive (explicit user action — it asks
 * for a permission) turns loudness into a {@link Viseme} through the VN cadence;
 * with no mic, {@link previewViseme} lets the user (and a test, and a capture)
 * pick a frame by hand. The mic always wins while it is live; stopping it
 * returns to the previewed frame, so the two never fight.
 */
@Injectable({ providedIn: 'root' })
export class LipSyncService {
  private readonly mic = inject(MicOpennessService);
  private readonly cadence = new VisemeCadence();
  private readonly drive = signal<MouthDrive | null>(null);
  private readonly preview = signal<Viseme>('closed');
  private readonly live = signal<Viseme>('closed');

  /** Smoothed loudness 0..1 from the mic; 0 while no mic is live. */
  readonly openness = computed<number>(() => this.drive()?.openness() ?? 0);
  /** True while the microphone drive is running. */
  readonly micLive = computed<boolean>(() => this.drive() !== null);
  /** Why the mic could not start (permission denied, no device); '' = fine. */
  readonly micError = signal('');
  /** The frame the canvas should draw. */
  readonly viseme = computed<Viseme>(() => (this.micLive() ? this.live() : this.preview()));

  /** The clock the cadence reads — overridable so a test can step time by hand. */
  now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  constructor() {
    effect(() => {
      const drive = this.drive();
      if (!drive) {
        return;
      }
      const openness = drive.openness();
      this.live.set(this.cadence.step(openness, this.now()));
    });
  }

  /** Hand-pick the frame shown while no mic is live (preview / capture / tests). */
  previewViseme(v: Viseme): void {
    this.preview.set(v);
  }

  async startMic(deps?: MicDeps): Promise<boolean> {
    if (this.drive()) {
      return true;
    }
    this.micError.set('');
    try {
      const drive = await this.mic.start(deps);
      this.cadence.reset();
      this.drive.set(drive);
      return true;
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      this.micError.set(
        name === 'NotAllowedError'
          ? 'Microphone permission was refused — allow it in the browser to lip-sync.'
          : name === 'NotFoundError'
            ? 'No microphone was found.'
            : 'The microphone could not be started.',
      );
      return false;
    }
  }

  stopMic(): void {
    const drive = this.drive();
    if (!drive) {
      return;
    }
    this.drive.set(null);
    drive.stop();
    this.cadence.reset();
    this.live.set('closed');
  }
}
