import { Injectable, signal } from '@angular/core';
import {
  PackIndex,
  PackIndexEntry,
  PartManifest,
  SlotDef,
  PartDef,
  ExpressionPreset,
} from '../models/vn-manifest';
import { resolveAssetsBase } from './assets-base';

/**
 * Loads the character-studio asset library: the top-level `assets/vn/manifest.json`
 * pack index, then a selected pack's `pack.json` ({@link PartManifest}). Uses the
 * browser `fetch` (no HttpClient provider needed — matches the B0 hand-written
 * fetch convention). The asset base is resolved ABSOLUTELY from this module's own
 * URL — see {@link AssetManifestService.assetsBase}.
 *
 * B0 PR-2 scope: load + expose slots/parts. The PixiJS rig that composes them
 * (PR-3+) consumes {@link activePack}.
 */
@Injectable({ providedIn: 'root' })
export class AssetManifestService {
  /** Absolute base URL for the VN assets — see {@link resolveAssetsBase} for why
   *  a bare relative string cannot be used under the host shell. Shared with
   *  {@link SvgRigService}/{@link PixiRigService}, which load the PARTS this
   *  index points at and must resolve them the same way. */
  private readonly assetsBase = resolveAssetsBase();

  /** The currently-loaded pack, or null until {@link loadActivePack} resolves. */
  readonly activePack = signal<PartManifest | null>(null);
  /** The index's ENABLED pack entries (drives the pack picker); set by {@link loadIndex}. */
  readonly packEntries = signal<PackIndexEntry[]>([]);
  /** Non-null after a failed load (surfaced in the UI's aria-live region). */
  readonly error = signal<string | null>(null);

  /** Fetch the pack index and cache its enabled entries in {@link packEntries}. */
  async loadIndex(): Promise<PackIndex> {
    const res = await fetch(`${this.assetsBase}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`manifest.json ${res.status}`);
    }
    const index = (await res.json()) as PackIndex;
    this.packEntries.set(index.packs.filter(p => p.enabled));
    return index;
  }

  /**
   * Load the first ENABLED pack from the index (the B0 default: base-anthro-v1)
   * and cache it in {@link activePack}. Returns the parsed manifest. Kept for
   * backward compat with the initial studio load; {@link loadPack} switches packs.
   */
  async loadActivePack(): Promise<PartManifest> {
    this.error.set(null);
    try {
      const index = await this.loadIndex();
      const entry = index.packs.find(p => p.enabled);
      if (!entry) {
        throw new Error('no enabled pack in manifest.json');
      }
      return await this.fetchPack(entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error.set(`Failed to load character assets: ${msg}`);
      throw e;
    }
  }

  /**
   * Load an ENABLED pack by id (pack-picker selection) and cache it in
   * {@link activePack}. Falls back to fetching the index when {@link packEntries}
   * has not been populated yet. Unknown/disabled ids reject and surface in
   * {@link error}, leaving the current pack untouched.
   */
  async loadPack(packId: string): Promise<PartManifest> {
    this.error.set(null);
    try {
      const entry =
        this.packEntries().find(p => p.packId === packId) ??
        (await this.loadIndex()).packs.find(p => p.enabled && p.packId === packId);
      if (!entry) {
        throw new Error(`no enabled pack "${packId}" in manifest.json`);
      }
      return await this.fetchPack(entry);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error.set(`Failed to load character assets: ${msg}`);
      throw e;
    }
  }

  /** Fetch an index entry's `pack.json` and cache it as the {@link activePack}. */
  private async fetchPack(entry: PackIndexEntry): Promise<PartManifest> {
    const res = await fetch(`${this.assetsBase}${entry.path}`, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`${entry.path} ${res.status}`);
    }
    const pack = (await res.json()) as PartManifest;
    this.activePack.set(pack);
    return pack;
  }

  /**
   * Load a pack's OPTIONAL expression presets (EXPRESSION-PREVIEW slice). Returns
   * an empty list for packs that ship no `expressions` index — so existing packs
   * are unaffected. A single failed preset is skipped (logged) rather than failing
   * the whole studio load; the base character still renders. Paths are resolved
   * relative to the pack root (`packs/<packId>/`), matching {@link SvgRigService}.
   */
  async loadExpressions(pack: PartManifest): Promise<ExpressionPreset[]> {
    const refs = pack.expressions ?? [];
    if (refs.length === 0) {
      return [];
    }
    const base = `${this.assetsBase}packs/${pack.packId}/`;
    const presets = await Promise.all(
      refs.map(async ref => {
        try {
          const res = await fetch(`${base}${ref.path}`, { cache: 'no-cache' });
          if (!res.ok) {
            throw new Error(`${ref.path} ${res.status}`);
          }
          return (await res.json()) as ExpressionPreset;
        } catch (e) {
          console.warn(`character-studio: skipped expression "${ref.id}":`, e);
          return null;
        }
      }),
    );
    return presets.filter((p): p is ExpressionPreset => p !== null);
  }

  /** Slots of the active pack in render (z) order; empty until loaded. */
  slots(): SlotDef[] {
    const pack = this.activePack();
    if (!pack) {
      return [];
    }
    return [...pack.slots].sort((a, b) => a.zOrder - b.zOrder);
  }

  /** Candidate parts for a slot in the active pack. */
  partsForSlot(slot: string): PartDef[] {
    return this.activePack()?.slots.find(s => s.slot === slot)?.parts ?? [];
  }
}
