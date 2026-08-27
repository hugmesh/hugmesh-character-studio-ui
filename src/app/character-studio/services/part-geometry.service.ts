import { Injectable } from '@angular/core';
import { Box } from '../rig/rig-fit';

/**
 * Measures where a part's ART actually is on the pack canvas — its alpha
 * bounding box — by rasterising the part alone and scanning pixels. Packs draw
 * every layer full-canvas with a (0.5, 0.5) anchor, so the anchor says nothing
 * about where the mouth sits; this does. Results are cached per key. Returns
 * null when the environment cannot rasterise (no canvas, tainted, empty art),
 * and every caller falls back to the slot anchor.
 */
@Injectable({ providedIn: 'root' })
export class PartGeometryService {
  private readonly cache = new Map<string, Promise<Box | null>>();
  /** Longest raster edge — accuracy of ~4 canvas px on a 1024 pack, fast. */
  static readonly RASTER_MAX = 256;

  bboxOf(key: string, svgInner: string, canvas: { width: number; height: number }): Promise<Box | null> {
    let hit = this.cache.get(key);
    if (!hit) {
      hit = this.measure(svgInner, canvas).catch(() => null);
      this.cache.set(key, hit);
    }
    return hit;
  }

  private async measure(svgInner: string, canvas: { width: number; height: number }): Promise<Box | null> {
    if (typeof document === 'undefined' || !canvas.width || !canvas.height) {
      return null;
    }
    const scale = PartGeometryService.RASTER_MAX / Math.max(canvas.width, canvas.height);
    const rw = Math.max(1, Math.round(canvas.width * scale));
    const rh = Math.max(1, Math.round(canvas.height * scale));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.width} ${canvas.height}"` +
      ` width="${rw}" height="${rh}">${svgInner}</svg>`;
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const c = document.createElement('canvas');
    c.width = rw;
    c.height = rh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    ctx.drawImage(img, 0, 0, rw, rh);
    const data = ctx.getImageData(0, 0, rw, rh).data;
    let minX = rw, minY = rh, maxX = -1, maxY = -1;
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        if (data[(y * rw + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) {
      return null;
    }
    return {
      x: minX / scale,
      y: minY / scale,
      w: (maxX - minX + 1) / scale,
      h: (maxY - minY + 1) / scale,
    };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('part did not rasterise'));
    img.src = src;
  });
}
