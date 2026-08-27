import { Injectable } from '@angular/core';
import { PartDef, PartManifest, SlotDef, TintRegion } from '../models/vn-manifest';
import { SlotBlend, SlotTransform, VnCharacter, clampSlotTransform, isIdentityTransform } from '../models/vn-character';
import { VISEME_OPEN_SCALE, Viseme } from '../lipsync/viseme';
import { Box } from '../rig/rig-fit';

/** The slot whose layer lip-syncs. */
export const MOUTH_SLOT = 'mouth';

export interface ComposeOptions {
  /** The lip-sync frame to draw the mouth in; absent/'closed' = the art as authored. */
  viseme?: Viseme;
  /** The chosen mouth's measured bounds on the canvas (PartGeometryService); null = unknown. */
  mouthBox?: Box | null;
}

/** A finite number or 0 — nothing else ever reaches a transform attribute. */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function f(v: number): string {
  return String(Math.round(num(v) * 100) / 100);
}
import { resolveAssetsBase } from './assets-base';

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

/** Clamp a {@link SlotBlend.t} to a safe, finite [0,1] opacity fraction — it may
 * originate from a loaded/persisted character, so it is not trusted to already
 * be a well-formed number. */
function clampBlendT(t: number): number {
  return Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
}

@Injectable({ providedIn: 'root' })
export class SvgRigService {
  // Absolute, anchored on this chunk's own URL — a bare 'assets/vn/' resolves
  // against the SHELL's document when federated and 404s every part. See
  // ./assets-base.
  private readonly assetsBase = resolveAssetsBase();
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
   *
   * `def.slotBlend` (see {@link SlotBlend}) additionally crossfades a slot's part
   * toward a second part in the same slot — a continuous axis ACROSS a roster of
   * discrete hand-drawn parts (the body-type spectrum), rendered as two opacity-
   * complementary `<g>` layers rather than a geometric morph (the parts are
   * independent flat-vector art, not a shared topology). Ignored for a slot an
   * active expression is currently swapping.
   */
  async compose(
    def: VnCharacter,
    pack: PartManifest,
    expressionSlots: Record<string, string> = {},
    opts: ComposeOptions = {},
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
      // Every layer of this slot passes through the rig/viseme wrapper.
      let synthesizeViseme = false;
      const push = (markup: string) =>
        layers.push(this.wrapSlot(slot, markup, def, pack, opts, synthesizeViseme));
      const userPart = def.userParts?.[slot.slot];
      if (userPart) {
        synthesizeViseme = this.wantsViseme(slot, opts);
        push(`<g>${this.svgInner(userPart.svgInline)}</g>`);
        addRegions(userPart.tintRegions);
        continue;
      }
      const isExpressionSwap = slot.slot in expressionSlots;
      const partId = expressionSlots[slot.slot] ?? def.slots[slot.slot];
      if (!partId) {
        continue;
      }
      // A pack that draws its own talking frames: use the variant of the CHOSEN
      // mouth (or the expression's mouth) for this viseme, no transform needed.
      const variant = this.wantsViseme(slot, opts)
        ? slot.parts.find(p => p.visemeOf === partId && p.viseme === opts.viseme)
        : undefined;
      synthesizeViseme = this.wantsViseme(slot, opts) && !variant;
      const part = variant ?? slot.parts.find(p => p.id === partId);
      if (!part) {
        continue;
      }
      // A slot blend crossfades toward a second part in the same slot (the
      // body-type spectrum axis) — skipped during an expression swap, which
      // is its own preview-only override of this slot's part.
      const blend: SlotBlend | undefined = isExpressionSwap ? undefined : def.slotBlend?.[slot.slot];
      const toPart = blend && blend.toId !== partId ? slot.parts.find(p => p.id === blend.toId) : undefined;
      if (blend && toPart) {
        const t = clampBlendT(blend.t);
        if (t >= 1) {
          const inner = await this.partFile(`${this.assetsBase}packs/${def.packId}/${toPart.file}`);
          push(`<g>${inner}</g>`);
          addRegions(toPart.tintRegions);
          continue;
        }
        if (t > 0) {
          const [fromInner, toInner] = await Promise.all([
            this.partFile(`${this.assetsBase}packs/${def.packId}/${part.file}`),
            this.partFile(`${this.assetsBase}packs/${def.packId}/${toPart.file}`),
          ]);
          push(`<g style="opacity:${(1 - t).toFixed(4)}">${fromInner}</g>`);
          push(`<g style="opacity:${t.toFixed(4)}">${toInner}</g>`);
          addRegions(part.tintRegions);
          addRegions(toPart.tintRegions);
          continue;
        }
        // t clamped to 0 — falls through to the plain single-part render below.
      }
      const inner = await this.partFile(`${this.assetsBase}packs/${def.packId}/${part.file}`);
      push(`<g>${inner}</g>`);
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
    opts: ComposeOptions = {},
  ): Promise<string> {
    const svg = await this.compose(def, pack, expressionSlots, opts);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /** Fetch a pack part SVG and return its `<svg>` inner markup (cached). */
  /** The mouth slot lip-syncs when a non-closed viseme is asked for. */
  private wantsViseme(slot: SlotDef, opts: ComposeOptions): boolean {
    return slot.slot === MOUTH_SLOT && !!opts.viseme && opts.viseme !== 'closed';
  }

  /**
   * Fold the slot's rig transform and, for the mouth, the synthesized viseme
   * onto one layer. Every number is clamped/finite-checked before it reaches
   * an attribute, so a character cannot smuggle markup through a transform.
   *
   * The viseme opens the CHOSEN mouth about its own measured bounds
   * ({@link ComposeOptions.mouthBox}) — the art stays the user's, the emotion's
   * mouth override stays in effect, only the openness changes — and falls back
   * to a small box at the slot anchor when the bounds are unknown.
   */
  private wrapSlot(
    slot: SlotDef,
    markup: string,
    def: VnCharacter,
    pack: PartManifest,
    opts: ComposeOptions,
    synthesizeViseme: boolean,
  ): string {
    const w = num(pack.canvas.width), h = num(pack.canvas.height);
    let inner = markup;
    if (synthesizeViseme && opts.viseme && opts.viseme !== 'closed') {
      const sy = VISEME_OPEN_SCALE[opts.viseme];
      const box = opts.mouthBox ?? {
        x: num(slot.anchor.x) * w - w * 0.05,
        y: num(slot.anchor.y) * h - h * 0.02,
        w: w * 0.1,
        h: h * 0.04,
      };
      const cx = num(box.x) + num(box.w) / 2;
      const cy = num(box.y) + num(box.h) / 2;
      const drop = num(box.h) * 0.12 * (sy - 1);   // the jaw drops; the upper lip stays
      inner =
        `<g data-viseme="${opts.viseme}" transform="translate(0 ${f(drop)}) translate(${f(cx)} ${f(cy)})` +
        ` scale(1 ${f(sy)}) translate(${f(-cx)} ${f(-cy)})">${inner}</g>`;
    }
    const raw = def.slotTransforms?.[slot.slot];
    if (raw && !isIdentityTransform(raw)) {
      const t: SlotTransform = clampSlotTransform(raw);
      const px = num(slot.anchor.x) * w, py = num(slot.anchor.y) * h;
      inner =
        `<g data-rig="${slot.slot}" transform="translate(${f(t.dx)} ${f(t.dy)}) translate(${f(px)} ${f(py)})` +
        ` rotate(${f(t.rot)}) scale(${f(t.scale)}) translate(${f(-px)} ${f(-py)})">${inner}</g>`;
    }
    return inner;
  }

  /** A pack part's inner markup — what the geometry service rasterises. */
  async partMarkup(pack: PartManifest, part: PartDef): Promise<string> {
    return this.partFile(`${this.assetsBase}packs/${pack.packId}/${part.file}`);
  }

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
