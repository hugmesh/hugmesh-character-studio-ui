import { Component, inject, input, signal } from '@angular/core';
import { CharacterStateService } from '../services/character-state.service';
import { SvgRigService } from '../services/svg-rig.service';
import { CharacterBffService, PlatformResult } from '../services/character-bff.service';
import { svgToPngBlob } from '../util/svg-export.util';
import { PartManifest } from '../models/vn-manifest';

/**
 * Export panel (B0 §4): renders the composed character to PNG and either
 * downloads it or sets it as the user's Matrix avatar. "Set as avatar" runs the
 * server-side A3 moderation gate — a blocked image returns 422 and is surfaced in
 * the `aria-live` region. Disabled until all required slots are filled.
 */
@Component({
  selector: 'hug-export-panel',
  standalone: true,
  imports: [],
  templateUrl: './export-panel.component.html',
  styleUrl: './export-panel.component.scss',
})
export class ExportPanelComponent {
  readonly pack = input.required<PartManifest>();

  protected readonly state = inject(CharacterStateService);
  private readonly rig = inject(SvgRigService);
  private readonly bff = inject(CharacterBffService);

  readonly status = signal('');
  readonly busy = signal(false);

  private async composePng(): Promise<Blob> {
    const def = this.state.character();
    if (!def) {
      throw new Error('no character');
    }
    // WYSIWYG: compose with the SAME active expression overrides the live preview
    // uses — studio-canvas binds [expressionSlots]="state.activeExpressionSlots()".
    // Omitting them here (the pre-fix bug) made the download / uploaded avatar drop
    // the on-screen expression layers, so what the user saw was NOT what they
    // exported. Passing them makes the exported PNG byte-identical to the preview.
    const svg = await this.rig.compose(def, this.pack(), this.state.activeExpressionSlots());
    return svgToPngBlob(svg, 512);
  }

  async download(): Promise<void> {
    this.busy.set(true);
    this.status.set('Rendering…');
    try {
      const blob = await this.composePng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.state.character()?.name || 'character'}.png`;
      a.click();
      URL.revokeObjectURL(url);
      this.status.set('Downloaded PNG.');
    } catch {
      this.status.set('Render failed.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Per-platform outcomes of the last "use everywhere" run (empty until one). */
  readonly platformResults = signal<PlatformResult[]>([]);

  /**
   * Apply this character as the avatar on EVERY platform the account can set:
   * this mesh's profile, Matrix and Mastodon. Each leg reports independently, so
   * a platform the user has no role for reads as "skipped", never as a failure,
   * and one platform breaking never hides the others.
   */
  async useEverywhere(): Promise<void> {
    this.busy.set(true);
    this.platformResults.set([]);
    this.status.set('Applying across platforms…');
    try {
      const blob = await this.composePng();
      const results = await this.bff.applyEverywhere(blob);
      this.platformResults.set(results);
      const applied = results.filter(r => r.outcome === 'applied').length;
      const failed = results.filter(r => r.outcome === 'failed').length;
      this.status.set(
        failed === 0
          ? `Applied on ${applied} platform${applied === 1 ? '' : 's'}.`
          : `Applied on ${applied}; ${failed} failed — see below.`);
    } catch {
      this.status.set('Render failed.');
    } finally {
      this.busy.set(false);
    }
  }

  async setAsAvatar(): Promise<void> {
    this.busy.set(true);
    this.status.set('Uploading + moderating…');
    try {
      const blob = await this.composePng();
      await this.bff.exportAvatar(blob);
      this.status.set('Set as your mesh avatar.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'blocked-by-content-policy') {
        this.status.set('Blocked by content policy — adjust your character and try again.');
      } else if (msg.includes('401')) {
        this.status.set('Sign in to set your avatar.');
      } else {
        this.status.set('Avatar export failed.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
