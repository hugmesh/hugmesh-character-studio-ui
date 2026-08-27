import { Component, inject } from '@angular/core';
import { LipSyncService } from './lip-sync.service';
import { VISEMES, Viseme } from './viseme';

/**
 * The "Talk" controls: start/stop the microphone lip-sync, see the loudness it
 * hears, or pick a mouth frame by hand to preview how the character talks.
 * The canvas reads {@link LipSyncService.viseme}; this panel only drives it.
 */
@Component({
  selector: 'hug-lip-sync-panel',
  standalone: true,
  imports: [],
  templateUrl: './lip-sync-panel.component.html',
  styleUrl: './lip-sync-panel.component.scss',
})
export class LipSyncPanelComponent {
  protected readonly lipsync = inject(LipSyncService);
  readonly visemes = VISEMES;

  labelOf(v: Viseme): string {
    return v === 'closed' ? 'Closed' : v === 'half' ? 'Half open' : 'Open';
  }

  async toggleMic(): Promise<void> {
    if (this.lipsync.micLive()) {
      this.lipsync.stopMic();
    } else {
      await this.lipsync.startMic();
    }
  }

  pick(v: Viseme): void {
    this.lipsync.previewViseme(v);
  }
}
