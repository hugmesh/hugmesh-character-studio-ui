import { Component, computed, effect, inject, signal, input } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SvgRigService } from '../services/svg-rig.service';
import { PartManifest } from '../models/vn-manifest';
import { VnCharacter } from '../models/vn-character';
import { Viseme } from '../lipsync/viseme';
import { Box } from '../rig/rig-fit';

/**
 * Renders the composed character (v2 SVG-DOM compositor). Re-composes whenever
 * the {@link character} input changes (picker / palette updates) and shows the
 * result as an `<img>` (not inline SVG) — the secure render posture, and the same
 * source used for SVG→PNG avatar export. `role="img"` + aria-label so the
 * decorative preview is announced without blocking the text UI.
 *
 * The PixiJS rig (PixiRigService) is retained for the B2/B3 GPU live-render /
 * VTuber stages behind the same compose contract; the creator uses SVG-DOM.
 */
@Component({
  selector: 'hug-studio-canvas',
  standalone: true,
  imports: [],
  // The alt/aria-label carry the MEANINGFUL description the parent passes
  // (pack + chosen head part), so the preview is announced as what it shows.
  template: `<img class="rig" data-testid="cs-canvas" [src]="src()" [attr.aria-label]="ariaLabel()" role="img" [attr.alt]="ariaLabel()" />`,
  styleUrl: './studio-canvas.component.scss',
})
export class StudioCanvasComponent {
  readonly pack = input.required<PartManifest>();
  readonly character = input.required<VnCharacter>();
  readonly ariaLabel = input<string>('Character preview');
  /**
   * Active expression slot→partId overrides (preview only). Empty = render the
   * base character. Re-composes when it changes (expression button click).
   */
  readonly expressionSlots = input<Record<string, string>>({});
  /** Lip-sync frame; 'closed' draws the art as authored. */
  readonly viseme = input<Viseme>('closed');
  /** The chosen mouth's measured bounds (null = fall back to the slot anchor). */
  readonly mouthBox = input<Box | null>(null);

  private readonly rig = inject(SvgRigService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly url = signal<string>('');

  /** Sanitizer-trusted data: URL (the SVG is pack-authored / trusted). */
  readonly src = computed<SafeUrl>(() => this.sanitizer.bypassSecurityTrustUrl(this.url()));

  constructor() {
    effect(() => {
      const def = this.character();
      const pack = this.pack();
      const expr = this.expressionSlots();
      const opts = { viseme: this.viseme(), mouthBox: this.mouthBox() };
      void this.rig.composeDataUrl(def, pack, expr, opts).then(u => this.url.set(u));
    });
  }
}
