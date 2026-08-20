/**
 * TypeScript model for the character-studio asset library — v2 (SVG-driven).
 * Parts are inline SVG; each recolorable region is a `<path>`/`<g>` carrying a
 * stable CSS class ({@link TintRegion.svgClass}) recolored by a CSS custom
 * property — replacing the v1 PNG + R-channel mask. Validated by
 * `assets/vn/schema/vn-part-manifest-v2.schema.json` (`npm run validate:assets`).
 */

/** Normalised 0..1 anchor relative to the pack canvas. */
export interface Anchor {
  x: number;
  y: number;
}

/** Pixel offset from a slot's anchor at compose time. */
export interface Offset {
  x: number;
  y: number;
}

/**
 * A recolourable region of a part. {@link svgClass} is the CSS class on the
 * region's element(s) inside the part SVG; the compositor sets a CSS custom
 * property `--<svgClass>` from `palette[region]`, so `.region-fur{fill:var(--region-fur)}`
 * recolors true — and multiple regions recolor independently (the v1 single-region
 * limitation is gone).
 */
export interface TintRegion {
  region: string;
  svgClass: string;
  defaultPalette: string;
}

/** Part category — drives picker grouping + the head↔feature compatibility model. */
export type PartCategory =
  | 'base'
  | 'head'
  | 'eyes'
  | 'hair'
  | 'clothing'
  | 'feature'
  | 'accessory';

/** A single selectable part within a slot (one body, one pair of eyes, ...). */
export interface PartDef {
  id: string;
  displayName: string;
  /** Path to the part SVG, relative to the pack root. */
  file: string;
  tintRegions?: TintRegion[];
  anchorOverride?: Anchor | null;
  offset?: Offset;
  // --- taxonomy / head↔feature compatibility (v2) ---
  category?: PartCategory;
  /** For base/head parts: the head archetype (canid, felid, avian, synth, ...). */
  headArchetype?: string;
  /** For feature parts: head archetypes this feature may attach to ('*' = any). */
  compatibleHeads?: string[];
  /** partIds/slot constraints that must hold for this part to apply. */
  requires?: string[];
  /** Provenance — pack-authored vs user-drawn (audited; user SVG is sanitized). */
  origin?: 'pack' | 'user-drawn';
  /**
   * Content provenance for licensed source material used only as a design label
   * (e.g. `"SRD 5.1"` for D&D SRD-named bases — art is original/placeholder).
   * Packs carrying any `source` MUST set the pack-level {@link PartManifest.attribution}.
   * See docs/CATALOG-DND-SRD.md and ATTRIBUTION.txt.
   */
  source?: string;
  /** Free-form catalog tags (e.g. `["race", "draconic"]`) for grouping/search. */
  tags?: string[];
}

/** One z-ordered layer slot (body, head, eyes, ...) and its candidate parts. */
export interface SlotDef {
  slot: string;
  /** Lower renders behind. */
  zOrder: number;
  required: boolean;
  anchor: Anchor;
  parts: PartDef[];
}

/** A coherent art set — the parsed `pack.json`. */
export interface PartManifest {
  packId: string;
  version: string;
  displayName: string;
  licenseSpdx?: string;
  /**
   * Verbatim attribution string required for any pack carrying SRD-sourced parts
   * (see {@link PartDef.source}); enforced by `npm run validate:assets`
   * (`tools/validate-assets.mjs`) and mirrored in ATTRIBUTION.txt.
   * docs/CATALOG-DND-SRD.md requires it on all three surfaces — `pack.json`,
   * ATTRIBUTION.txt, and an in-app "Credits" view; the last is the `cs-credits`
   * section of `character-studio.component.html`, rendered to the end user
   * whenever the active pack carries one.
   */
  attribution?: string;
  canvas: { width: number; height: number };
  slots: SlotDef[];
  /**
   * OPTIONAL — slots an expression may override (e.g. `["eyes","brows","mouth"]`).
   * Packs without expressions omit this; an expression swap is scoped to these.
   */
  expressionSlots?: string[];
  /** OPTIONAL — index of expression presets (see {@link ExpressionRef}). */
  expressions?: ExpressionRef[];
}

/**
 * OPTIONAL index entry for an expression preset on a pack (EXPRESSION-PREVIEW
 * slice). The {@link path} is the `expressions/<id>.json` file (relative to the
 * pack root) naming slot→partId overrides; loaded lazily, validated by
 * `vn-expression-v1.schema.json`. Packs without expressions omit this entirely.
 */
export interface ExpressionRef {
  id: string;
  /** Path to the expression preset JSON, relative to the pack root. */
  path: string;
}

/**
 * A loaded expression preset (parsed `expressions/<id>.json`). Names the partId
 * to swap into each expression slot (eyes/brows/mouth) at compose — preview-only,
 * so the base character's chosen parts are never mutated. Palette/tint is
 * preserved because the override parts carry the same tint regions.
 */
export interface ExpressionPreset {
  id: string;
  displayName?: string;
  /** expression slot → partId override (must exist as a part in that slot). */
  slots: Record<string, string>;
}

/** One entry in the top-level `manifest.json` pack index. */
export interface PackIndexEntry {
  packId: string;
  /** OPTIONAL human label for pickers; fall back to {@link packId} when absent. */
  displayName?: string;
  /** Path to the pack's `pack.json`, relative to the `assets/vn/` root. */
  path: string;
  enabled: boolean;
}

/** The parsed top-level `assets/vn/manifest.json`. */
export interface PackIndex {
  schemaVersion: number;
  packs: PackIndexEntry[];
}
