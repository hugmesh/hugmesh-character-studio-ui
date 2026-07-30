/**
 * Preview↔export FIDELITY step (WYSIWYG). OFFLINE — the download path is fully
 * in-browser (compose → offscreen-canvas raster → download), so no backend.
 *
 * WOULD-HAVE-CAUGHT the shipped HIGH bug. The live preview composes WITH the
 * active expression overrides (studio-canvas binds
 * `[expressionSlots]="state.activeExpressionSlots()"`); the pre-fix export
 * composed WITHOUT them, so a previewed expression (e.g. "happy") was visible on
 * screen yet DROPPED from the downloaded PNG. This step decodes the real
 * downloaded PNG and the current preview through the SAME 512px canvas
 * rasterisation and asserts they are byte-identical — post-fix they match; the
 * pre-fix export (base/neutral parts instead of the previewed happy parts) would
 * produce a different image and fail here. Deterministic: both images run through
 * one Image→512-canvas→toDataURL pipeline in the same browser, so identical pixels
 * ⇒ identical data URL (PNG is lossless; a re-encode of identical pixels is
 * identical).
 */

import { expect } from '@playwright/test';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Then } from '../support/fixtures';
import { studioState } from './_registry';
import { canvasSrc } from '../../tests/helpers/studio';

/** Short, stable digest of a rasterised-PNG data URL — so a mismatch reports two
 *  16-char hashes instead of diffing two multi-megabyte base64 strings. */
const digest = (dataUrl: string): string => createHash('sha256').update(dataUrl).digest('hex').slice(0, 16);

Then('the downloaded PNG matches the current preview', async ({ page }) => {
  const dl = studioState.lastDownload;
  expect(dl, 'a download event should have been captured by the export step').not.toBeNull();
  const path = await dl!.path();
  expect(path, 'the download should resolve to a local file path').toBeTruthy();
  const pngBase64 = fs.readFileSync(path!).toString('base64');

  const previewSrc = await canvasSrc(page);
  expect(previewSrc ?? '', 'the preview must carry a composed SVG data URL').toContain(
    'data:image/svg+xml',
  );

  // Rasterise BOTH the current preview SVG and the downloaded PNG onto an
  // identical 512px canvas (the export size) and compare the encoded result. The
  // downloaded PNG holds the pixels the app rendered from the EXPORT SVG; the
  // preview data URL is the ON-SCREEN SVG. If export dropped the expression
  // layers, the two rasterisations differ.
  const [previewPng, downloadPng] = await page.evaluate(
    async ({ svgUrl, b64 }) => {
      const raster = (src: string): Promise<string> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.width = 512;
          img.height = 512;
          // Bound the decode so a wedged image (never firing load/error) fails
          // fast and readably instead of stalling the whole test to its timeout.
          const guard = setTimeout(() => reject(new Error('rasterisation timed out')), 10_000);
          img.onload = () => {
            clearTimeout(guard);
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 512;
            const ctx = c.getContext('2d');
            if (!ctx) {
              reject(new Error('2D canvas context unavailable'));
              return;
            }
            ctx.clearRect(0, 0, 512, 512);
            ctx.drawImage(img, 0, 0, 512, 512);
            resolve(c.toDataURL('image/png'));
          };
          img.onerror = () => {
            clearTimeout(guard);
            reject(new Error('rasterisation image failed to load'));
          };
          img.decoding = 'sync';
          img.src = src;
        });
      const preview = await raster(svgUrl);
      const download = await raster(`data:image/png;base64,${b64}`);
      return [preview, download];
    },
    { svgUrl: previewSrc as string, b64: pngBase64 },
  );

  // Compare compact digests (identical pixels ⇒ identical PNG data URL ⇒ identical
  // hash). A drift in the exported expression layers changes the downloaded hash
  // while the preview hash stays put, so this fails loudly AND readably.
  expect(
    digest(downloadPng),
    'the downloaded PNG must be pixel-identical to the on-screen preview (WYSIWYG)',
  ).toBe(digest(previewPng));
});
