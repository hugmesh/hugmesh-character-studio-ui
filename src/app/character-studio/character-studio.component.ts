import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AssetManifestService } from './services/asset-manifest.service';
import { CharacterStateService } from './services/character-state.service';
import { StudioCanvasComponent } from './canvas/studio-canvas.component';
import { PackPickerComponent } from './pack-picker/pack-picker.component';
import { PartPickerComponent } from './part-picker/part-picker.component';
import { PaletteComponent } from './palette/palette.component';
import { DrawComponent } from './draw/draw.component';
import { ExportPanelComponent } from './export/export-panel.component';
import { AiAssistComponent } from './ai-assist/ai-assist.component';
import { ExpressionPreviewComponent } from './expression-preview/expression-preview.component';
import { PartManifest } from './models/vn-manifest';
import { randomizeCharacter } from './util/randomize';

/**
 * Root of the VN character-studio creator (Phase B0). Loads the asset library
 * (PR-2), seeds the {@link CharacterStateService} (PR-4), and renders the live
 * SVG-DOM preview (via {@link StudioCanvasComponent}'s SvgRigService, v2) beside
 * the part picker (PR-4) — choosing a part re-composes the canvas. The studio
 * header offers the pack picker (switching the whole art set) and the
 * "Surprise me" randomizer. Errors surface in the `aria-live` region.
 */
@Component({
  selector: 'hug-character-studio',
  standalone: true,
  imports: [
    StudioCanvasComponent,
    PackPickerComponent,
    PartPickerComponent,
    PaletteComponent,
    DrawComponent,
    ExportPanelComponent,
    AiAssistComponent,
    ExpressionPreviewComponent,
  ],
  templateUrl: './character-studio.component.html',
  styleUrl: './character-studio.component.scss',
})
export class CharacterStudioComponent implements OnInit {
  private readonly assets = inject(AssetManifestService);
  protected readonly state = inject(CharacterStateService);

  readonly status = signal('Loading character assets…');
  readonly pack = signal<PartManifest | null>(null);
  /** Enabled pack-index entries for the pack picker (set by the initial load). */
  readonly packEntries = this.assets.packEntries;
  /** Surfaced from the service for the aria-live error region. */
  readonly error = this.assets.error;

  /**
   * Meaningful alt/aria-label for the preview <img>: names the pack and the
   * chosen head part so a screen-reader hears WHAT character is shown (not just
   * "Character preview"). Recomputes on pack switch and head pick.
   */
  readonly canvasAlt = computed<string>(() => {
    const pack = this.pack();
    if (!pack) {
      return 'Character preview';
    }
    const headId = this.state.character()?.slots['head'];
    const headPart = pack.slots
      .find(s => s.slot === 'head')
      ?.parts.find(p => p.id === headId);
    return headPart
      ? `Character preview: ${pack.displayName} — ${headPart.displayName} head`
      : `Character preview: ${pack.displayName}`;
  });

  async ngOnInit(): Promise<void> {
    try {
      const pack = await this.assets.loadActivePack();
      this.pack.set(pack);
      // Optional expression presets (empty for packs without an `expressions` index).
      const expressions = await this.assets.loadExpressions(pack);
      this.state.init(pack, undefined, expressions);
      this.status.set(`Loaded ${pack.slots.length} slot(s) from “${pack.displayName}”.`);
    } catch {
      this.status.set('');
    }
  }

  /**
   * Switch to another enabled pack (pack-picker selection): load its manifest +
   * expressions and re-seed the character state with the pack's default
   * character — exactly like the initial load. Selecting the current pack is a
   * no-op (the picker never emits it, and we guard again here).
   */
  async onPackChange(packId: string): Promise<void> {
    if (this.pack()?.packId === packId) {
      return;
    }
    try {
      const pack = await this.assets.loadPack(packId);
      const expressions = await this.assets.loadExpressions(pack);
      this.pack.set(pack);
      this.state.init(pack, undefined, expressions);
      this.status.set(`Loaded ${pack.slots.length} slot(s) from “${pack.displayName}”.`);
    } catch {
      this.status.set('');
    }
  }

  /** "Surprise me" — replace the character with a random-but-valid one. */
  surpriseMe(): void {
    const pack = this.pack();
    if (!pack) {
      return;
    }
    this.state.applyCharacter(randomizeCharacter(pack, Math.random));
    this.status.set('Randomized! Adjust anything below.');
  }
}
