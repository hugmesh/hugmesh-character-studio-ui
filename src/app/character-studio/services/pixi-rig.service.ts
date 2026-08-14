import { Injectable } from '@angular/core';
import { Application, Assets, Container, Sprite, Texture } from 'pixi.js';
import { PartManifest } from '../models/vn-manifest';
import { VnCharacter } from '../models/vn-character';
import { resolveAssetsBase } from './assets-base';

/**
 * The PixiJS (WebGL) rig engine (B0 §3.3). Composes a character's chosen parts
 * into a single layered {@link Container} in z-order. PR-3 scope: mount /
 * compose (stacked sprites) / destroy. The palette-swap tint filter (§1.4) and
 * expression/viseme swaps land in later steps; `setExpression`/`setViseme` are
 * stubbed so the call sites exist.
 *
 * Provided at the {@code hug-studio-canvas} component level (one rig per
 * canvas), NOT root — so a remounted canvas gets a fresh Application.
 */
@Injectable()
export class PixiRigService {
  private app: Application | null = null;
  private rig: Container | null = null;
  // Absolute, anchored on this chunk's own URL. PixiJS's Assets loader resolves
  // a relative string against the DOCUMENT, which under the host shell is the
  // shell itself — every texture 404s. See ./assets-base.
  private readonly assetsBase = resolveAssetsBase();

  /** Create the PixiJS Application bound to the given canvas (idempotent). */
  async mount(canvas: HTMLCanvasElement, width = 512, height = 512): Promise<void> {
    if (this.app) {
      return;
    }
    const app = new Application();
    await app.init({ canvas, width, height, backgroundAlpha: 0, antialias: true });
    this.app = app;
  }

  /**
   * (Re)compose the rig from the character definition + pack. Loads each chosen
   * part texture, stacks the sprites in slot z-order, and returns the sprite
   * count. Replaces any previous composition.
   */
  async compose(def: VnCharacter, pack: PartManifest): Promise<number> {
    const app = this.app;
    if (!app) {
      throw new Error('PixiRigService.compose called before mount');
    }
    if (this.rig) {
      app.stage.removeChild(this.rig);
      this.rig.destroy({ children: true });
      this.rig = null;
    }
    const rig = new Container();
    const slots = [...pack.slots].sort((a, b) => a.zOrder - b.zOrder);
    let count = 0;
    for (const slot of slots) {
      const partId = def.slots[slot.slot];
      if (!partId) {
        continue;
      }
      const part = slot.parts.find(p => p.id === partId);
      if (!part) {
        continue;
      }
      const url = `${this.assetsBase}packs/${def.packId}/${part.file}`;
      const tex: Texture = await Assets.load(url);
      const sprite = new Sprite(tex);
      // PR-5 tint: a single greyscale region tints true via Sprite.tint. The
      // MULTI-region mask-multiply palette-swap filter (B0 §1.4) is the
      // [needs spike] — parts with >1 tintRegion need a per-region masked pass;
      // until then only the first region's colour is applied.
      const region = part.tintRegions?.[0]?.region;
      const hex = region ? def.palette[region] : undefined;
      if (hex) {
        const n = parseInt(hex.replace('#', ''), 16);
        if (!Number.isNaN(n)) {
          sprite.tint = n;
        }
      }
      const anchor = part.anchorOverride ?? slot.anchor;
      sprite.anchor.set(anchor.x, anchor.y);
      // Place the sprite's pivot at the normalised anchor on the canvas (+offset).
      sprite.x = app.renderer.width * anchor.x + (part.offset?.x ?? 0);
      sprite.y = app.renderer.height * anchor.y + (part.offset?.y ?? 0);
      rig.addChild(sprite);
      count++;
    }
    app.stage.addChild(rig);
    this.rig = rig;
    return count;
  }

  /** Expression layer-set swap (B0 §1.5) — lands in a later step. */
  setExpression(_id: string): void {
    /* PR-6 */
  }

  /** Viseme mouth-shape swap for lipsync (B3) — organised now, played later. */
  setViseme(_key: string): void {
    /* B3 */
  }

  /** Tear down the Application + GPU resources (call on component destroy). */
  destroy(): void {
    this.rig = null;
    if (this.app) {
      this.app.destroy();
      this.app = null;
    }
  }
}
