import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { AssetManifestService } from './services/asset-manifest.service';
import { CharacterBffService } from './services/character-bff.service';
import { CharacterStateService } from './services/character-state.service';
import { StudioCanvasComponent } from './canvas/studio-canvas.component';
import { PackPickerComponent } from './pack-picker/pack-picker.component';
import { PartPickerComponent } from './part-picker/part-picker.component';
import { PaletteComponent } from './palette/palette.component';
import { DrawComponent } from './draw/draw.component';
import { ExportPanelComponent } from './export/export-panel.component';
import { AiAssistComponent } from './ai-assist/ai-assist.component';
import { ExpressionPreviewComponent } from './expression-preview/expression-preview.component';
import { LipSyncPanelComponent } from './lipsync/lip-sync-panel.component';
import { LipSyncService } from './lipsync/lip-sync.service';
import { RigPanelComponent } from './rig/rig-panel.component';
import { Box } from './rig/rig-fit';
import { PartGeometryService } from './services/part-geometry.service';
import { MOUTH_SLOT, SvgRigService } from './services/svg-rig.service';
import { ExpressionPreset, PartManifest } from './models/vn-manifest';
import { VnCharacter } from './models/vn-character';
import { randomizeCharacter } from './util/randomize';

/**
 * Debounce for the autosave PUT. Long enough to collapse a drag/typing burst
 * into one write, short enough that "navigate away moments after an edit"
 * still catches the flush in {@link CharacterStudioComponent.ngOnDestroy}.
 * Exported so the spec can step a virtual clock past it.
 */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/** Autosave lifecycle surfaced in the aria-live indicator (`cs-autosave`). */
export type SaveState = 'idle' | 'saved' | 'error';

/**
 * Root of the VN character-studio creator (Phase B0). Loads the asset library
 * (PR-2), seeds the {@link CharacterStateService} (PR-4), and renders the live
 * SVG-DOM preview (via {@link StudioCanvasComponent}'s SvgRigService, v2) beside
 * the part picker (PR-4) — choosing a part re-composes the canvas. The studio
 * header offers the pack picker (switching the whole art set) and the
 * "Surprise me" randomizer. Errors surface in the `aria-live` region.
 *
 * Persistence (issue #1): on init the saved definition is restored via
 * {@link CharacterBffService.loadActive} (falling back to the pack default when
 * there is none, or when the bff is unreachable), and every subsequent edit is
 * autosaved via {@link CharacterBffService.saveDefinition} on a
 * {@link AUTOSAVE_DEBOUNCE_MS} debounce, flushed on destroy.
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
    LipSyncPanelComponent,
    RigPanelComponent,
  ],
  templateUrl: './character-studio.component.html',
  styleUrl: './character-studio.component.scss',
})
export class CharacterStudioComponent implements OnInit, OnDestroy {
  private readonly assets = inject(AssetManifestService);
  protected readonly state = inject(CharacterStateService);
  private readonly characterBff = inject(CharacterBffService);

  protected readonly lipsync = inject(LipSyncService);
  private readonly rig = inject(SvgRigService);
  private readonly geometry = inject(PartGeometryService);
  readonly status = signal('Loading character assets…');
  /**
   * The chosen mouth's measured bounds on the pack canvas — what the lip-sync
   * opens the mouth about. Re-measured whenever the mouth part (or the
   * expression's mouth override, or a user-drawn mouth) changes; null until
   * known, which the compositor treats as "use the slot anchor".
   */
  readonly mouthBox = signal<Box | null>(null);
  readonly pack = signal<PartManifest | null>(null);
  /** Enabled pack-index entries for the pack picker (set by the initial load). */
  readonly packEntries = this.assets.packEntries;
  /** Surfaced from the service for the aria-live error region. */
  readonly error = this.assets.error;

  /** Autosave outcome for the `cs-autosave` indicator ('idle' until a save runs). */
  readonly saveState = signal<SaveState>('idle');
  /**
   * JSON of the definition as last loaded from / written to the user-bff — the
   * autosave's dirty check. `null` until {@link ngOnInit} seeds the state, which
   * is also what keeps the seeding itself (and any state left over from a
   * previous studio instance) from triggering a write of an unedited character.
   */
  private lastPersisted: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

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

  constructor() {
    effect(() => {
      const pack = this.pack();
      const c = this.state.character();
      const mouthId = this.state.activeExpressionSlots()[MOUTH_SLOT] ?? c?.slots[MOUTH_SLOT];
      const user = c?.userParts?.[MOUTH_SLOT];
      if (!pack || !c || (!mouthId && !user)) {
        this.mouthBox.set(null);
        return;
      }
      void this.measureMouth(pack, mouthId ?? null, user?.svgInline ?? null).then(box => this.mouthBox.set(box));
    });

    // Debounced autosave (issue #1): every state mutation lands here via the
    // character signal; a burst of edits collapses into one PUT. Armed only
    // once ngOnInit has seeded the state (lastPersisted != null), and only when
    // the definition actually differs from what the user-bff already holds.
    effect(() => {
      const def = this.state.character();
      if (!def || this.lastPersisted === null || JSON.stringify(def) === this.lastPersisted) {
        return;
      }
      if (this.saveTimer !== null) {
        clearTimeout(this.saveTimer);
      }
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        void this.saveNow();
      }, AUTOSAVE_DEBOUNCE_MS);
    });
  }

  /** PUT the current definition if it is dirty (the autosave timer's target). */
  private async saveNow(): Promise<void> {
    const def = this.state.character();
    if (!def) {
      return;
    }
    const serialized = JSON.stringify(def);
    if (serialized === this.lastPersisted) {
      return;
    }
    try {
      await this.characterBff.saveDefinition(def);
      this.lastPersisted = serialized;
      this.saveState.set('saved');
    } catch {
      // Keep lastPersisted stale so the next edit retries; the aria-live
      // indicator says the edits are local-only rather than silently lying.
      this.saveState.set('error');
    }
  }

  /** Flush a pending (debounced, not-yet-fired) save on navigation away. */
  ngOnDestroy(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.saveNow();
    }
  }

  private async measureMouth(pack: PartManifest, partId: string | null, userSvg: string | null): Promise<Box | null> {
    if (userSvg) {
      return this.geometry.bboxOf(`user:${pack.packId}:${MOUTH_SLOT}:${userSvg.length}`, userSvg, pack.canvas);
    }
    const part = pack.slots.find(s => s.slot === MOUTH_SLOT)?.parts.find(p => p.id === partId);
    if (!part) {
      return null;
    }
    try {
      const markup = await this.rig.partMarkup(pack, part);
      return await this.geometry.bboxOf(`${pack.packId}:${part.id}`, markup, pack.canvas);
    } catch {
      return null;
    }
  }

  /**
   * Open the studio on the pack default FIRST, then restore the saved character
   * over it.
   *
   * ORDERING IS LOAD-BEARING. The whole studio is gated on `@if (pack(); as p)`
   * (character-studio.component.html), and `pack` had been written only AFTER
   * awaiting the user-bff GET. A GET that REJECTS is handled (the catch below);
   * a GET that never SETTLES — a gateway that accepts the socket and then does
   * not answer, a wedged upstream pool — is not an error, so no catch can see
   * it, and the studio stayed on "Loading character assets…" forever with no
   * user-driven recovery (the pack picker that could re-seed it lives inside the
   * very gate that never opened). Seeding before the await keeps studio
   * availability a property of OUR nginx serving the pack, not of the user-bff
   * being both healthy and responsive. {@link CharacterBffService.loadActive}
   * additionally bounds the GET so a stall degrades into the fallback below
   * instead of leaking a promise for the life of the page.
   */
  async ngOnInit(): Promise<void> {
    let pack: PartManifest;
    let expressions: ExpressionPreset[];
    try {
      pack = await this.assets.loadActivePack();
      // Optional expression presets (empty for packs without an `expressions` index).
      expressions = await this.assets.loadExpressions(pack);
    } catch {
      this.status.set('');
      return;
    }
    this.pack.set(pack);
    this.state.init(pack, undefined, expressions);
    this.status.set(`Loaded ${pack.slots.length} slot(s) from “${pack.displayName}”.`);
    // Arm the autosave against the seeded default NOW rather than after the GET:
    // the studio is interactive from this point, and edits made while a slow
    // restore is still in flight must not be silently dropped. The dirty check
    // in the autosave effect means seeding itself still never PUTs.
    const seeded = JSON.stringify(this.state.character());
    this.lastPersisted = seeded;

    // Restore the saved definition, if any (issue #1). A failed GET (signed
    // out, bff unreachable — the standalone/dev case) and a timed-out one both
    // land in the catch and leave the seeded default in place.
    let saved: VnCharacter | null = null;
    try {
      saved = await this.characterBff.loadActive();
    } catch {
      saved = null;
    }
    if (!saved) {
      return;
    }
    if (JSON.stringify(this.state.character()) !== seeded) {
      // The user already started editing while the GET was outstanding —
      // restoring over that would throw their live work away. Keep the edits and
      // let the autosave overwrite the (now stale) server copy instead: marking
      // the fetched definition as "persisted" is exactly what makes them dirty.
      this.lastPersisted = JSON.stringify(saved);
      return;
    }
    if (saved.packId !== pack.packId) {
      // The save lives in another pack — re-open that one, like onPackChange.
      try {
        pack = await this.assets.loadPack(saved.packId);
        expressions = await this.assets.loadExpressions(pack);
        this.pack.set(pack);
      } catch {
        return; // its pack is gone/disabled: keep the seeded default
      }
    }
    this.state.init(pack, saved, expressions);
    this.lastPersisted = JSON.stringify(this.state.character());
    this.status.set(
      `Loaded ${pack.slots.length} slot(s) from “${pack.displayName}”. Restored your saved character.`,
    );
  }

  /**
   * Switch to another enabled pack (pack-picker selection): load its manifest +
   * expressions and re-seed the character state with the pack's default
   * character — exactly like the initial load. Selecting the current pack is a
   * no-op (the picker never emits it, and we guard again here). The re-seeded
   * character differs from the persisted one, so the autosave effect persists
   * the switch — reopening the studio restores the pack you left it on.
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
