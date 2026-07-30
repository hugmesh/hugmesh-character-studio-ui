import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { CharacterStateService } from '../services/character-state.service';
import { PartDef, PartManifest, SlotDef } from '../models/vn-manifest';

/**
 * A slot whose part count reaches this many gets a client-side text filter
 * input (menagerie's head slot alone ships 54 parts — scanning that many
 * buttons unaided is not reasonable). Small slots stay uncluttered.
 */
const FILTER_MIN_PARTS = 9;

/**
 * LIMIT: filter queries are clamped to this many chars at the input boundary
 * (also mirrored by `maxlength`) — a part displayName is capped at 48 chars by
 * the asset validator, so a longer query can never match anything anyway.
 */
const MAX_FILTER_LEN = 48;

/** Debounce for filter keystrokes — long enough to coalesce, short enough to feel live. */
const FILTER_DEBOUNCE_MS = 150;

/**
 * Lists the candidate parts per slot (B0 §3.2) and lets the user choose one;
 * a selection calls {@link CharacterStateService.setSlot}, which re-composes the
 * canvas. Non-required slots offer a "None" option. Each part is a toggle button
 * with `aria-pressed` reflecting the current selection. Large slots (see
 * {@link FILTER_MIN_PARTS}) get a debounced, aria-labelled text filter, and every
 * slot's button list scrolls internally past a bounded height (see the SCSS).
 */
@Component({
  selector: 'hug-part-picker',
  standalone: true,
  imports: [],
  templateUrl: './part-picker.component.html',
  styleUrl: './part-picker.component.scss',
})
export class PartPickerComponent implements OnDestroy {
  readonly pack = input.required<PartManifest>();

  private readonly state = inject(CharacterStateService);
  readonly character = this.state.character;

  protected readonly filterMinParts = FILTER_MIN_PARTS;
  protected readonly maxFilterLen = MAX_FILTER_LEN;

  /** Committed (debounced) filter query per slot; reset on every pack switch. */
  private readonly filters = signal<Record<string, string>>({});
  private readonly filterTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // A new pack means new slots — stale queries would silently hide parts.
    effect(() => {
      this.pack();
      this.filters.set({});
    });
  }

  ngOnDestroy(): void {
    for (const t of this.filterTimers.values()) {
      clearTimeout(t);
    }
    this.filterTimers.clear();
  }

  /** Slots in render (z) order. */
  readonly slots = computed<SlotDef[]>(() =>
    [...this.pack().slots].sort((a, b) => a.zOrder - b.zOrder),
  );

  /** The chosen base/head archetype (drives feature compatibility filtering). */
  readonly activeHead = computed<string | null>(() => {
    const c = this.character();
    if (!c) {
      return null;
    }
    for (const s of this.pack().slots) {
      const p = s.parts.find(part => part.id === c.slots[s.slot]);
      if (p?.headArchetype) {
        return p.headArchetype;
      }
    }
    return null;
  });

  /**
   * Hybrid mode bypasses the head-archetype compatibility filter so ANY part
   * can be mixed onto ANY species (dragon wings on a rabbit, a kobold tail on
   * a moth). OFF preserves the curated per-species filtering.
   */
  readonly hybridMode = signal(false);

  toggleHybrid(): void {
    this.hybridMode.update(on => !on);
  }

  /**
   * Candidate parts for a slot, FILTERED to the chosen head archetype: a part
   * with no {@link PartDef.compatibleHeads} (or '*') fits any head; otherwise it
   * shows only when it lists the active head. Head/base parts (which declare
   * headArchetype, not compatibleHeads) are never filtered out. In
   * {@link hybridMode} the filter is bypassed and every part is offered.
   */
  partsFor(slot: SlotDef): PartDef[] {
    if (this.hybridMode()) {
      return slot.parts;
    }
    const head = this.activeHead();
    return slot.parts.filter(
      p =>
        !p.compatibleHeads ||
        p.compatibleHeads.includes('*') ||
        (head != null && p.compatibleHeads.includes(head)),
    );
  }

  /**
   * {@link partsFor} narrowed by the slot's committed filter query
   * (case-insensitive substring on displayName or id). An empty query — the
   * default, and every slot below {@link FILTER_MIN_PARTS} — filters nothing.
   */
  visiblePartsFor(slot: SlotDef): PartDef[] {
    const parts = this.partsFor(slot);
    const q = this.filterOf(slot.slot).toLowerCase();
    if (!q) {
      return parts;
    }
    return parts.filter(
      p => p.displayName.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }

  /** The committed filter query for a slot ('' when unfiltered). */
  filterOf(slot: string): string {
    return this.filters()[slot] ?? '';
  }

  /**
   * Debounced filter keystroke: clamp at the input boundary (see
   * {@link MAX_FILTER_LEN}) and commit after {@link FILTER_DEBOUNCE_MS} of quiet
   * so a fast typist re-filters the 54-part head slot once, not per keystroke.
   */
  onFilterInput(slot: string, ev: Event): void {
    const raw = (ev.target as HTMLInputElement).value;
    const query = raw.slice(0, MAX_FILTER_LEN).trim();
    const pending = this.filterTimers.get(slot);
    if (pending) {
      clearTimeout(pending);
    }
    this.filterTimers.set(
      slot,
      setTimeout(() => {
        this.filterTimers.delete(slot);
        this.filters.update(f => ({ ...f, [slot]: query }));
      }, FILTER_DEBOUNCE_MS),
    );
  }

  /** The currently-selected partId for a slot (or null). */
  selected(slot: string): string | null {
    return this.character()?.slots[slot] ?? null;
  }

  pick(slot: string, partId: string | null): void {
    this.state.setSlot(slot, partId);
  }
}
