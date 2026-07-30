import { Injectable } from '@angular/core';
import { PartManifest, TintRegion } from '../models/vn-manifest';
import { VnCharacter } from '../models/vn-character';

/**
 * The SVG-DOM compositor (v2). Composes a character's chosen part SVGs into ONE
 * `<svg>` document string: each part is inlined as a z-ordered `<g>` layer, and
 * the composite root `<style>` provides BOTH the recolor rules
 * (`.region-fur{fill:var(--region-fur)}`) AND the per-region values
 * (`:root{--region-fur:#…}`). So a part needs only `class="region-fur"` on its
 * shapes — true multi-region recolor, and user-drawn parts can omit `<style>`
 * (which the sanitizer strips). Rendered via `<img src=data:image/svg+xml…>`.
 *
 * Pack part SVGs are PACK-AUTHORED (trusted). USER-DRAWN parts ({@link
 * VnCharacter.userParts}) carry CLIENT-sanitized inline SVG in-session; persisting
 * them re-sanitizes server-side (SANITIZE→MODERATE→STORE, v2 §0/§2).
 */
/**
 * A CSS class name safe to interpolate into a `.<cls>{…}` selector and a
 * `--<cls>` custom-property name: identifier charset only, so a value cannot
 * close the rule/selector or inject a new one (no `}`, `<`, `;`, whitespace).
 */
const SAFE_SVG_CLASS = /^[A-Za-z0-9_-]+$/;

/**
 * A CSS hex colour safe to interpolate as a `--<cls>:<value>` declaration value:
 * `#` + 3..8 hex digits ONLY, so a value cannot terminate the declaration or
 * inject `url(...)` / `expression(...)` / a new rule (no `}`, `<`, `;`, `(`).
 */
const SAFE_HEX = /^#[0-9a-fA-F]{3,8}$/;

@Injectable({ providedIn: 'root' })
export class SvgRigService {
  private readonly assetsBase = 'assets/vn/';
  private readonly cache = new Map<string, string>();

  /**
   * Build the composite SVG document string for a character.
   *
   * `expressionSlots` is the active expression's slot→partId overrides (from
   * {@link CharacterStateService.activeExpressionSlots}). For each expression slot
   * (eyes/brows/mouth) it SWAPS in the override part instead of the base partId —
   * PREVIEW ONLY, the {@link VnCharacter} is never mutated. The palette/tint is
   * preserved: the override part carries the same tint regions, recolored by the
   * same `palette[region]`. A USER-DRAWN part in a slot still wins (the user's own
   * art is never replaced by an expression). An empty/absent map renders the base
   * character unchanged, so packs without expressions are unaffected.
   */
  async compose(
    def: VnCharacter,
    pack: PartManifest,
    expressionSlots: Record<string, string> = {},
  ): Promise<string> {
    const slots = [...pack.slots].sort((a, b) => a.zOrder - b.zOrder);
    const layers: string[] = [];
    const vars = new Map<string, string>();

    const addRegions = (regions: TintRegion[] | undefined) => {
      for (const tr of regions ?? []) {
        // The class becomes both a `.<cls>` selector and a `--<cls>` property
        // name; an unsafe identifier could break out of the rule, so skip it
        // (an un-selectable class recolors nothing — safe to drop).
        if (!SAFE_SVG_CLASS.test(tr.svgClass)) {
          continue;
        }
        // The colour becomes a `--<cls>:<value>` declaration value. Prefer the
        // user palette, fall back to the part default, and reject anything that
        // is not a bare hex colour (so a value can't terminate the declaration
        // or inject `url(...)`/`expression(...)`/a new rule). If neither is a
        // valid hex, drop the region rather than emit an injectable value.
        const candidate = def.palette[tr.region] ?? tr.defaultPalette;
        const safeHex = SAFE_HEX.test(candidate)
          ? candidate
          : SAFE_HEX.test(tr.defaultPalette)
            ? tr.defaultPalette
            : null;
        if (safeHex === null) {
          continue;
        }
        vars.set(tr.svgClass, safeHex);
      }
    };

    for (const slot of slots) {
      const userPart = def.userParts?.[slot.slot];
      if (userPart) {
        // A user-drawn part wins over any expression swap.
        layers.push(`<g>${this.svgInner(userPart.svgInline)}</g>`);
        addRegions(userPart.tintRegions);
        continue;
      }
      // Expression override (if this is an expression slot) else the base partId.
      const partId = expressionSlots[slot.slot] ?? def.slots[slot.slot];
      if (!partId) {
        continue;
      }
      const part = slot.parts.find(p => p.id === partId);
      if (!part) {
        continue;
      }
      const inner = await this.partFile(`${this.assetsBase}packs/${def.packId}/${part.file}`);
      layers.push(`<g>${inner}</g>`);
      addRegions(part.tintRegions);
    }

    const varDecls = [...vars].map(([cls, hex]) => `--${cls}:${hex}`).join(';');
    const ruleDecls = [...vars.keys()].map(cls => `.${cls}{fill:var(--${cls})}`).join('');
    const w = pack.canvas.width;
    const h = pack.canvas.height;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
      `<style>:root{${varDecls}}${ruleDecls}</style>${layers.join('')}</svg>`
    );
  }

  /** Compose to a data: URL ready for an <img src> / canvas rasterization. */
  async composeDataUrl(
    def: VnCharacter,
    pack: PartManifest,
    expressionSlots: Record<string, string> = {},
  ): Promise<string> {
    const svg = await this.compose(def, pack, expressionSlots);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /** Fetch a pack part SVG and return its `<svg>` inner markup (cached). */
  private async partFile(url: string): Promise<string> {
    const hit = this.cache.get(url);
    if (hit !== undefined) {
      return hit;
    }
    const text = await (await fetch(url, { cache: 'force-cache' })).text();
    const inner = this.svgInner(text);
    this.cache.set(url, inner);
    return inner;
  }

  /** Extract the inner markup of an `<svg>…</svg>` string. */
  private svgInner(text: string): string {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    return root && root.nodeName.toLowerCase() === 'svg' ? root.innerHTML : '';
  }
}
