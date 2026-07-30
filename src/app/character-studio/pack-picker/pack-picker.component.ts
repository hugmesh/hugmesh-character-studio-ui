import { Component, input, output } from '@angular/core';
import { PackIndexEntry } from '../models/vn-manifest';

/**
 * Asset-pack picker for the studio header. Lists the index's ENABLED packs
 * ({@link AssetManifestService.packEntries}) in a labelled `<select>` — each
 * option shows the entry's displayName, falling back to its packId — and emits
 * the chosen packId. Re-selecting the current pack emits nothing, so the studio
 * never reloads a pack it already shows.
 */
@Component({
  selector: 'hug-pack-picker',
  standalone: true,
  imports: [],
  templateUrl: './pack-picker.component.html',
  styleUrl: './pack-picker.component.scss',
})
export class PackPickerComponent {
  /** Enabled pack-index entries, in index order. */
  readonly entries = input.required<PackIndexEntry[]>();
  /** The currently-loaded pack's id (its option renders selected). */
  readonly activePackId = input<string | null>(null);
  /** Fires the chosen packId — only when it differs from {@link activePackId}. */
  readonly packChange = output<string>();

  /** Human label for an entry (its displayName, else the packId). */
  labelOf(entry: PackIndexEntry): string {
    return entry.displayName ?? entry.packId;
  }

  onChange(ev: Event): void {
    const packId = (ev.target as HTMLSelectElement).value;
    if (packId && packId !== this.activePackId()) {
      this.packChange.emit(packId);
    }
  }
}
