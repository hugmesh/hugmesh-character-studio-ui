import { Injectable, computed, signal } from '@angular/core';
import { PartManifest, TintRegion, ExpressionPreset } from '../models/vn-manifest';
import { VnCharacter, UserPart, SlotBlend, SlotTransform, buildDefaultCharacter, clampSlotTransform, isIdentityTransform } from '../models/vn-character';

/**
 * The single source of truth for the character being edited (B0 §3.3). A signal
 * store the picker / palette / expression controls mutate and the canvas reads.
 * Mutations are immutable updates so the {@link character} signal fires a single
 * re-compose downstream. {@link isValid} is true once every required slot is filled.
 */
@Injectable({ providedIn: 'root' })
export class CharacterStateService {
  private readonly _pack = signal<PartManifest | null>(null);
  private readonly _character = signal<VnCharacter | null>(null);
  /** Loaded expression presets for the active pack, keyed by id (empty if none). */
  private readonly _expressions = signal<ReadonlyMap<string, ExpressionPreset>>(new Map());

  /** The live character definition (null until {@link init}). */
  readonly character = this._character.asReadonly();
  readonly pack = this._pack.asReadonly();
  readonly expressions = this._expressions.asReadonly();

  /** Expression preset ids available for the active pack, in pack order. */
  readonly expressionIds = computed<string[]>(() => {
    const pack = this._pack();
    if (!pack?.expressions?.length) {
      return [];
    }
    const loaded = this._expressions();
    return pack.expressions.map(e => e.id).filter(id => loaded.has(id));
  });

  /** The currently-previewed expression id (mirrors {@link VnCharacter.defaultExpression}). */
  readonly activeExpression = computed<string>(() => this._character()?.defaultExpression ?? 'neutral');

  /**
   * The slot→partId overrides for the active expression, applied at compose
   * ({@link SvgRigService.compose}). Empty when the pack ships no expressions or
   * the active id is unknown — so the base character renders unchanged. Preview
   * only: the base character's chosen parts are never mutated.
   */
  readonly activeExpressionSlots = computed<Record<string, string>>(() => {
    const preset = this._expressions().get(this.activeExpression());
    return preset?.slots ?? {};
  });

  /** All required slots present ⇒ ready to render/export. */
  readonly isValid = computed(() => {
    const c = this._character();
    const pack = this._pack();
    if (!c || !pack) {
      return false;
    }
    return pack.slots.filter(s => s.required).every(s => !!c.slots[s.slot]);
  });

  /**
   * Seed the store from a pack (default character unless one is supplied) and its
   * optional expression presets (empty list for packs without expressions).
   */
  init(pack: PartManifest, def?: VnCharacter, expressions: ExpressionPreset[] = []): void {
    this._pack.set(pack);
    this._character.set(def ?? buildDefaultCharacter(pack));
    this._expressions.set(new Map(expressions.map(e => [e.id, e])));
  }

  /** Choose (or clear, with null) the part in a slot. */
  setSlot(slot: string, partId: string | null): void {
    this._character.update(c => (c ? { ...c, slots: { ...c.slots, [slot]: partId } } : c));
  }

  /**
   * Set (or clear, with null) a slot's crossfade blend toward a second part in
   * that slot — the continuous body-type spectrum axis, layered by
   * {@link SvgRigService.compose}. Does not touch {@link VnCharacter.slots}: the
   * blend's `t=0` endpoint is always whatever {@link setSlot} last chose there.
   */
  setSlotBlend(slot: string, blend: SlotBlend | null): void {
    this._character.update(c => {
      if (!c) {
        return c;
      }
      const slotBlend = { ...(c.slotBlend ?? {}) };
      if (blend) {
        slotBlend[slot] = blend;
      } else {
        delete slotBlend[slot];
      }
      return { ...c, slotBlend };
    });
  }

  /** Set a tint region's colour (drives the palette-swap filter, PR-5). */
  /** One slot's rig transform, clamped; identity removes the entry (sparse). */
  setSlotTransform(slot: string, t: Partial<SlotTransform> | null): void {
    this._character.update(c => {
      if (!c) {
        return c;
      }
      const slotTransforms = { ...(c.slotTransforms ?? {}) };
      const clean = t ? clampSlotTransform(t) : null;
      if (clean && !isIdentityTransform(clean)) {
        slotTransforms[slot] = clean;
      } else {
        delete slotTransforms[slot];
      }
      const next: VnCharacter = { ...c, slotTransforms };
      if (Object.keys(slotTransforms).length === 0) {
        delete next.slotTransforms;
      }
      return next;
    });
  }

  slotTransform(slot: string): SlotTransform | null {
    return this._character()?.slotTransforms?.[slot] ?? null;
  }

  /** Merge auto-fit proposals over the current transforms (slot by slot). */
  applyTransforms(transforms: Record<string, SlotTransform>): void {
    for (const [slot, t] of Object.entries(transforms)) {
      this.setSlotTransform(slot, t);
    }
  }

  clearTransforms(): void {
    this._character.update(c => {
      if (!c?.slotTransforms) {
        return c;
      }
      const next = { ...c };
      delete next.slotTransforms;
      return next;
    });
  }

  setPalette(region: string, hex: string): void {
    this._character.update(c => (c ? { ...c, palette: { ...c.palette, [region]: hex } } : c));
  }

  /**
   * Set the active expression (PREVIEW ONLY until persisted). The expression's
   * slot overrides ({@link activeExpressionSlots}) are applied at compose — the
   * base character's chosen eyes/brows/mouth and palette are NOT mutated, so
   * switching back to "neutral" restores the original look. Unknown ids are
   * ignored unless 'neutral' (the always-valid baseline).
   */
  setExpression(id: string): void {
    if (id !== 'neutral' && !this._expressions().has(id)) {
      return;
    }
    this._character.update(c => (c ? { ...c, defaultExpression: id } : c));
  }

  /**
   * Apply a user-drawn part to a slot (takes precedence over the pack part). The
   * SVG must already be CLIENT-sanitized; persisting it re-sanitizes server-side.
   * Seeds the palette for the part's regions if unset.
   */
  addUserPart(slot: string, svgInline: string, tintRegions: TintRegion[]): void {
    const part: UserPart = { svgInline, tintRegions };
    this._character.update(c => {
      if (!c) {
        return c;
      }
      const palette = { ...c.palette };
      for (const tr of tintRegions) {
        if (!(tr.region in palette)) {
          palette[tr.region] = tr.defaultPalette;
        }
      }
      return { ...c, palette, userParts: { ...(c.userParts ?? {}), [slot]: part } };
    });
  }

  /**
   * Merge an AI / heuristic suggestion (chosen slots + palette) into the current
   * character. The user adjusts afterward — suggestions never auto-commit beyond
   * the live edit (B0 §8a). Unknown slots/regions are ignored by the renderer.
   */
  applySuggestion(s: { slots?: Record<string, string | null>; palette?: Record<string, string> }): void {
    this._character.update(c =>
      c
        ? {
            ...c,
            slots: { ...c.slots, ...(s.slots ?? {}) },
            palette: { ...c.palette, ...(s.palette ?? {}) },
          }
        : c,
    );
  }

  /**
   * Replace the WHOLE character definition (the "Surprise me" randomizer, or a
   * loaded save). Unlike {@link applySuggestion} nothing is merged — stale slots,
   * palette entries and user-drawn overrides from the previous character are
   * dropped. The pack and its expressions are untouched.
   */
  applyCharacter(def: VnCharacter): void {
    this._character.set(def);
  }

  /** Remove a user-drawn override, falling back to the pack part. */
  clearUserPart(slot: string): void {
    this._character.update(c => {
      if (!c?.userParts) {
        return c;
      }
      const userParts = { ...c.userParts };
      delete userParts[slot];
      return { ...c, userParts };
    });
  }

  /** Reset to the pack's default character. */
  reset(): void {
    const pack = this._pack();
    if (pack) {
      this._character.set(buildDefaultCharacter(pack));
    }
  }
}
