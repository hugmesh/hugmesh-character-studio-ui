import { Component, computed, inject, input } from '@angular/core';
import { CharacterStateService } from '../services/character-state.service';
import { PartManifest } from '../models/vn-manifest';

/**
 * One colour input per tint region present in the active pack (B0 §3.2).
 * Changing a colour calls {@link CharacterStateService.setPalette}, which
 * re-composes the canvas — applied via SvgRigService's independent per-region
 * recolor (CSS custom properties), so each tint region can be recoloured
 * separately (the v1 single-region limitation is gone; see vn-manifest.ts's
 * TintRegion doc).
 */
@Component({
  selector: 'hug-palette',
  standalone: true,
  imports: [],
  templateUrl: './palette.component.html',
  styleUrl: './palette.component.scss',
})
export class PaletteComponent {
  readonly pack = input.required<PartManifest>();

  private readonly state = inject(CharacterStateService);
  readonly character = this.state.character;

  /** Distinct tint regions across all parts in the pack. */
  readonly regions = computed<string[]>(() => {
    const set = new Set<string>();
    for (const slot of this.pack().slots) {
      for (const part of slot.parts) {
        for (const tr of part.tintRegions ?? []) {
          set.add(tr.region);
        }
      }
    }
    return [...set];
  });

  colorOf(region: string): string {
    return this.character()?.palette[region] ?? '#000000';
  }

  onColor(region: string, ev: Event): void {
    this.state.setPalette(region, (ev.target as HTMLInputElement).value);
  }
}
