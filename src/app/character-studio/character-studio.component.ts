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
 * {@link AUTOSAVE_DEBOUNCE_MS} debounce, flushed on destroy. Writes are
 * serialized — never two PUTs on the wire at once, see
 * {@link CharacterStudioComponent.saveNow}. Exactly one character is saved, so
 * browsing to another pack suspends the autosave instead of replacing it — see
 * {@link CharacterStudioComponent.browsingOtherPack}.
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
   * The autosave write chain while one is running, else null — the in-flight
   * guard. Every save goes through {@link saveNow}, which serializes on this so
   * at most ONE PUT is ever on the wire. See the hazard note there.
   */
  private saving: Promise<void> | null = null;
  /**
   * Set when a save is asked for while one is already on the wire: the running
   * chain makes one more pass afterwards, re-reading the state, so a burst of
   * requests COALESCES into a single follow-up write of the newest definition
   * rather than a second concurrent one.
   */
  private resaveQueued = false;
  /**
   * Definitions PINNED for the chain to write as-is, in the order they were
   * pinned — the flush path's queue ({@link flushPendingSave}).
   *
   * The ordinary autosave wants the opposite of this: a follow-up pass that
   * RE-READS the state, so a burst collapses to the newest definition. But a
   * flush runs immediately before the state is replaced wholesale (a pack
   * switch re-seeds it, {@link onPackChange}), so by the time a re-reading pass
   * ran, the definition the flush meant to save would be gone and a stranger
   * would be in its place. Anything flushed is therefore captured at REQUEST
   * time and written verbatim.
   */
  private readonly queuedDefinitions: VnCharacter[] = [];

  /**
   * The pack the user-bff's saved character belongs to — null while nothing is
   * saved (no save on init, or the GET failed). The studio persists exactly ONE
   * character, so any other open pack is being BROWSED: see
   * {@link browsingOtherPack}.
   */
  private readonly persistedPackId = signal<string | null>(null);
  /**
   * The character last shown for each pack this session, so flipping through the
   * picker is a look and not a loss: switching away stashes what you had,
   * switching back restores it (the saved character included). Session-scoped —
   * only the one character in {@link persistedPackId}'s pack is persisted.
   */
  private readonly drafts = new Map<string, VnCharacter>();

  /**
   * True while the open pack is NOT the one holding the saved character. The
   * autosave is suspended for the duration: the pack picker is also the only way
   * to *look* at another art set, and one look must never overwrite (destroy)
   * the saved character. Ending the browse is explicit —
   * {@link keepThisCharacter}.
   */
  readonly browsingOtherPack = computed<boolean>(() => {
    const open = this.pack()?.packId;
    const saved = this.persistedPackId();
    return !!open && saved !== null && saved !== open;
  });

  /** Display name of the pack the save lives in (falls back to its id). */
  readonly savedPackLabel = computed<string>(() => {
    const saved = this.persistedPackId();
    if (!saved) {
      return '';
    }
    return this.packEntries().find(e => e.packId === saved)?.displayName ?? saved;
  });

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
    // A pack being BROWSED is excluded: writing it would replace the saved
    // character (which lives in another pack) with this one, and nothing holds
    // a copy to put back — so browsing waits for keepThisCharacter().
    effect(() => {
      const def = this.state.character();
      if (
        !def ||
        this.lastPersisted === null ||
        this.browsingOtherPack() ||
        JSON.stringify(def) === this.lastPersisted
      ) {
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

  /**
   * Save the current definition, ONE write at a time (the autosave timer's
   * target, and the explicit-keep action's).
   *
   * OVERLAP — not concurrency cost — is the hazard this guard exists for.
   * {@link putCurrentDefinition} records `lastPersisted` from the value it
   * captured when it ISSUED its PUT, so two writes in flight at once are two
   * writes racing to be the one that writes it LAST. Completion order is not
   * issue order: the newer request routinely answers first (a warmer
   * connection, a retried TCP segment on the older one, plain server jitter),
   * and then the older one lands and overwrites `lastPersisted` with the OLDER
   * definition. From that moment the studio believes the bff holds text it does
   * not hold — and the very next edit BACK to that older definition, an undo,
   * matches the dirty check and is dropped without a write. The edit is gone,
   * permanently, with the indicator still reading "Saved."
   *
   * So: while a write is on the wire, a new save request does not start a
   * second one — it asks the running chain for one more pass
   * ({@link resaveQueued}), which re-reads the state when it runs. The bff
   * therefore sees the writes in the order they were made, a burst collapses to
   * the newest definition, and `lastPersisted` always ends as the definition of
   * the request that answered last, which is now also the newest.
   *
   * ONE WRITE IS ENOUGH TO LOSE AN UNDO, though, so serializing is only half of
   * it. With a single PUT of Y open and `lastPersisted` still X, an undo back to
   * X matches the autosave effect's dirty check and arms no timer; the write
   * then lands, `lastPersisted` becomes Y, and nothing is left watching — the
   * screen shows X, the bff holds Y, the indicator reads "Saved." The chain's
   * post-write re-check in {@link runSaveChain} is what closes that half, and it
   * is the half that survives serializing (which makes one PUT the only shape
   * there is).
   *
   * `pinned` is for the one caller that cannot let the chain re-read: the
   * flush before a pack switch, whose definition is about to be replaced on
   * screen. See {@link queuedDefinitions}.
   *
   * Returns the chain, so a caller that awaits gets "everything queued is
   * written", not just "the write that happened to be open".
   */
  private saveNow(pinned?: VnCharacter): Promise<void> {
    if (pinned) {
      this.queuedDefinitions.push(pinned);
    }
    if (this.saving !== null) {
      this.resaveQueued = true;
      return this.saving;
    }
    // Claim the wire synchronously, before the first PUT is issued, so that a
    // save requested from inside the chain's own turn still coalesces rather
    // than opening a second write. (No current caller arrives from there — they
    // all come from a timer, a lifecycle hook or a click — so nothing today
    // exercises the ordering; it is written this way because the cost of a
    // future caller that does is the overlap this whole guard exists to stop.)
    let done!: () => void;
    const chain = new Promise<void>(resolve => (done = resolve));
    this.saving = chain;
    void this.runSaveChain().then(done, done);
    return chain;
  }

  /**
   * Write, then write again for whatever the user did while that write was on
   * the wire — until nothing more is queued. A pass writes a PINNED definition
   * if one is waiting ({@link queuedDefinitions}), else re-reads the state, so
   * the last edit wins and no intermediate definition is written twice.
   */
  private async runSaveChain(): Promise<void> {
    try {
      do {
        this.resaveQueued = false;
        const wrote = await this.putCurrentDefinition(this.queuedDefinitions.shift());
        // The state can move WHILE a PUT is open, and one such move is invisible
        // to the autosave effect: an edit BACK to the definition the bff held
        // before this write — an undo — still matches `lastPersisted` (which the
        // write has not updated yet), so the effect returns without arming a
        // timer, and the signal will not change again to give it a second
        // chance. Nothing else is left watching. So the chain re-checks against
        // the value the write just recorded, and takes one more pass if the
        // screen and the bff have parted. Only after a SUCCESSFUL write: a
        // failed one leaves `lastPersisted` deliberately stale, and re-arming on
        // that would spin the loop instead of waiting for the next edit.
        if (wrote && this.liveStateIsDirty()) {
          this.resaveQueued = true;
        }
      } while (this.resaveQueued || this.queuedDefinitions.length > 0);
    } finally {
      // Release the wire in the same synchronous step as the loop's exit test,
      // so a save request cannot set `resaveQueued` on a chain that has stopped
      // reading it. (As with the claim in `saveNow`, no current caller can hit
      // that window — it is closed by construction rather than by a spec.)
      this.saving = null;
    }
  }

  /**
   * Does the definition on screen still differ from what the bff was last known
   * to hold? The chain's re-check.
   *
   * It asks exactly the questions {@link putCurrentDefinition} asks before it
   * writes, which is what keeps the loop finite: `true` here means the next pass
   * has a definition to send, that pass records it in `lastPersisted`, and the
   * check that follows is then false unless the user edited again — so the loop
   * runs once per edit, never once per turn.
   */
  private liveStateIsDirty(): boolean {
    const def = this.state.character();
    if (!def || this.lastPersisted === null || !this.writable(def)) {
      return false;
    }
    return JSON.stringify(def) !== this.lastPersisted;
  }

  /**
   * May this definition be written? The browse rule, asked of the DEFINITION
   * rather than of the open pack: the studio persists exactly one character, so
   * a definition from a pack other than the one holding the save would replace
   * it — that is the browse the autosave is suspended for.
   *
   * Asking it of the definition (not `browsingOtherPack()`, which reads the pack
   * on SCREEN) is what lets a pinned flush still land: its definition belongs to
   * the pack the save lives in even though the user has already moved on to
   * another one. For every non-pinned caller the two are the same question, the
   * definition's pack being the open pack.
   */
  private writable(def: VnCharacter): boolean {
    const saved = this.persistedPackId();
    return saved === null || saved === def.packId;
  }

  /**
   * One PUT of `pinned`, or of whatever the state holds RIGHT NOW, if it is
   * dirty. Never rejects — a failed write is reported and left for the next edit
   * to retry. Returns whether the bff actually took a definition, which is what
   * makes the chain's re-check safe to arm on.
   */
  private async putCurrentDefinition(pinned?: VnCharacter): Promise<boolean> {
    const def = pinned ?? this.state.character();
    if (!def || !this.writable(def)) {
      return false;
    }
    const serialized = JSON.stringify(def);
    if (serialized === this.lastPersisted) {
      return false;
    }
    try {
      await this.characterBff.saveDefinition(def);
      this.lastPersisted = serialized;
      // This pack now owns the save — switching away is a browse from here on.
      this.persistedPackId.set(def.packId);
      this.saveState.set('saved');
      return true;
    } catch {
      // Keep lastPersisted stale so the next edit retries; the aria-live
      // indicator says the edits are local-only rather than silently lying.
      this.saveState.set('error');
      return false;
    }
  }

  /**
   * Write a debounced-but-not-yet-fired save NOW. Called on navigation away and
   * before a pack switch: a timer armed for the pack being left would otherwise
   * fire with the next pack's character on screen — where the write would
   * (correctly) be refused, silently dropping the edit that armed it.
   *
   * The definition is CAPTURED HERE, not read when the write runs. "Now" is only
   * as immediate as the wire allows: if a PUT is already open, this save waits
   * behind it, and by the time it runs {@link onPackChange} has re-seeded the
   * state with the next pack's character. A pass that re-read the state would
   * then write (or, more often, refuse to write) a definition the user never
   * asked to save, and the edit that armed the timer would be gone — which is
   * exactly the loss the flush exists to prevent, just moved behind a slow save.
   */
  private flushPendingSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.saveNow(this.state.character() ?? undefined);
    }
  }

  /** Flush a pending (debounced, not-yet-fired) save on navigation away. */
  ngOnDestroy(): void {
    this.flushPendingSave();
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
      // The live edits are taking the slot over, so THIS pack owns the save from
      // here — not `saved.packId`, which would make browsingOtherPack() true and
      // gate the very autosave that is meant to land them.
      this.persistedPackId.set(pack.packId);
      return;
    }
    if (saved.packId !== pack.packId) {
      // The save lives in another pack — re-open that one, like onPackChange.
      try {
        pack = await this.assets.loadPack(saved.packId);
        expressions = await this.assets.loadExpressions(pack);
        this.pack.set(pack);
      } catch {
        // Its pack is gone/disabled: keep the seeded default, and leave
        // persistedPackId null — that saved character can no longer be loaded or
        // rendered, so the fresh default takes over the slot rather than being
        // locked out of saving forever.
        return;
      }
    }
    this.state.init(pack, saved, expressions);
    this.lastPersisted = JSON.stringify(this.state.character());
    // The restored character's pack now holds the one save: any OTHER pack the
    // picker opens from here is a browse (see browsingOtherPack).
    this.persistedPackId.set(saved.packId);
    this.status.set(
      `Loaded ${pack.slots.length} slot(s) from “${pack.displayName}”. Restored your saved character.`,
    );
  }

  /**
   * Switch to another enabled pack (pack-picker selection): load its manifest +
   * expressions and show that pack's character — the one you were last editing
   * there this session, else the pack's default. Selecting the current pack is a
   * no-op (the picker never emits it, and we guard again here).
   *
   * The picker doubles as the only way to *look* at another art set, so a switch
   * is deliberately non-destructive: the character being left is stashed (coming
   * back restores it, {@link drafts}) and the autosave stays suspended while the
   * open pack is not the one holding the save ({@link browsingOtherPack}).
   * Persisting the browsed character is an explicit act —
   * {@link keepThisCharacter}. The earlier behaviour — re-seed the default and
   * let the autosave PUT it — meant one click on the picker overwrote the saved
   * character with an untitled default, unrecoverably.
   */
  async onPackChange(packId: string): Promise<void> {
    const current = this.pack();
    if (current?.packId === packId) {
      return;
    }
    // Land any pending edit as the pack it was made in, before the re-seed.
    this.flushPendingSave();
    try {
      const pack = await this.assets.loadPack(packId);
      const expressions = await this.assets.loadExpressions(pack);
      const leaving = this.state.character();
      if (current && leaving) {
        this.drafts.set(current.packId, leaving);
      }
      this.pack.set(pack);
      this.state.init(pack, this.drafts.get(packId), expressions);
      if (this.persistedPackId() === null) {
        // Nothing is saved, so nothing is at risk and browsingOtherPack() stays
        // false — but this re-seed is not an edit either: re-baseline the dirty
        // check so the switch itself writes nothing. A real edit here still
        // autosaves, and claims the slot for this pack.
        this.lastPersisted = JSON.stringify(this.state.character());
      }
      this.status.set(`Loaded ${pack.slots.length} slot(s) from “${pack.displayName}”.`);
    } catch {
      this.status.set('');
    }
  }

  /**
   * Keep the character on screen as THE saved one, replacing the save that lives
   * in another pack. The explicit opt-in that ends a browse (offered in the
   * header while {@link browsingOtherPack}); the pack picker itself never does
   * this, because a user flipping through art sets has not asked to throw their
   * character away.
   */
  keepThisCharacter(): void {
    const def = this.state.character();
    if (!def) {
      return;
    }
    this.persistedPackId.set(def.packId);
    void this.saveNow();
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
