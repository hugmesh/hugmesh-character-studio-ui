/**
 * Step definitions for the character-studio BDD suite. Each step is a thin
 * presentation layer over the helpers in `tests/helpers/studio.ts` so the
 * selectors + interaction logic live in ONE place.
 *
 * NON-VACUOUS. The assertions observe REAL app state, so a step fails if the app
 * is not driving the DOM: canvas steps compare the composed-SVG data URL on the
 * preview <img> before/after an edit (it must differ, restore, or persist); draw
 * steps count committed `<path>` elements on the surface; export asserts a real
 * download event with a `.png` filename. None of these pass against a blank page.
 *
 * OFFLINE vs @cluster. Everything here runs OFFLINE against `ng serve
 * character-studio` (static asset packs + in-browser SVG→PNG). Only the two
 * @cluster steps — set-as-avatar and AI generate — reach the off-stack
 * character-bff / character-ai; those scenarios are excluded from generation
 * unless E2E_LIVE=1.
 */

import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { studioState } from './_registry';
import {
  TESTIDS,
  partPick,
  partNone,
  palette,
  expression,
  gotoStudio,
  canvasSrc,
  expectCanvasChanged,
  expectCanvasRestored,
  pickPart,
  pickNone,
  setColor,
  drawStroke,
} from '../../tests/helpers/studio';

// ─── Given ──────────────────────────────────────────────────────────

Given('the character studio is loaded', async ({ page }) => {
  await gotoStudio(page);
});

// ─── When — canvas note / picker / palette ──────────────────────────

When('I note the current canvas', async ({ page }) => {
  const src = await canvasSrc(page);
  expect(src, 'canvas should have a composed src before it is noted').toBeTruthy();
  studioState.notedCanvasSrc = src as string;
});

When('I pick part {string} for slot {string}', async ({ page }, partId: string, slot: string) => {
  await pickPart(page, slot, partId);
});

When('I clear the {string} slot with None', async ({ page }, slot: string) => {
  await pickNone(page, slot);
});

When('I set the {string} colour to {string}', async ({ page }, region: string, hex: string) => {
  await setColor(page, region, hex);
});

// ─── When — draw surface ────────────────────────────────────────────

When('I draw a stroke on the drawing surface', async ({ page }) => {
  await drawStroke(page);
});

When('I undo the last stroke', async ({ page }) => {
  await page.locator(TESTIDS.drawUndo).click();
});

When('I clear the drawing', async ({ page }) => {
  await page.locator(TESTIDS.drawClear).click();
});

When('I apply the drawing to the character', async ({ page }) => {
  await page.locator(TESTIDS.drawApply).click();
});

When('I remove my drawing from the slot', async ({ page }) => {
  await page.locator(TESTIDS.drawRemove).click();
});

// ─── When — export ──────────────────────────────────────────────────

When('I download the character PNG', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.locator(TESTIDS.exportDownload).click();
  studioState.lastDownload = await downloadPromise;
});

// ─── When — expression preview ──────────────────────────────────────

When('I preview the {string} expression', async ({ page }, id: string) => {
  await page.locator(expression(id)).click();
});

// ─── When — @cluster (off-stack) ────────────────────────────────────

When('I set the character as my avatar', async ({ page }) => {
  await page.locator(TESTIDS.setAvatar).click();
});

When('I describe my character as {string}', async ({ page }, text: string) => {
  await page.locator(TESTIDS.aiPrompt).fill(text);
});

When('I generate a character', async ({ page }) => {
  await page.locator(TESTIDS.aiGenerate).click();
});

// ─── Then — canvas ──────────────────────────────────────────────────

Then('the canvas renders a composed character', async ({ page }) => {
  const src = await canvasSrc(page);
  expect(src ?? '').toContain('data:image/svg+xml');
  // A composed document carries at least one z-ordered <g> layer.
  expect(decodeURIComponent(src ?? '')).toContain('<g>');
});

Then('the canvas layer changes', async ({ page }) => {
  await expectCanvasChanged(page, studioState.notedCanvasSrc);
});

Then('the canvas is unchanged', async ({ page }) => {
  await expectCanvasRestored(page, studioState.notedCanvasSrc);
});

Then('the canvas returns to the noted state', async ({ page }) => {
  await expectCanvasRestored(page, studioState.notedCanvasSrc);
});

Then('the validity note reads {string}', async ({ page }, text: string) => {
  await expect(page.locator(TESTIDS.validity)).toHaveText(text);
});

// ─── Then — picker ──────────────────────────────────────────────────

Then('part {string} is selected in slot {string}', async ({ page }, partId: string, slot: string) => {
  await expect(page.locator(partPick(slot, partId))).toHaveAttribute('aria-pressed', 'true');
});

Then('part {string} is not selected in slot {string}', async ({ page }, partId: string, slot: string) => {
  await expect(page.locator(partPick(slot, partId))).toHaveAttribute('aria-pressed', 'false');
});

Then('the {string} slot shows None selected', async ({ page }, slot: string) => {
  await expect(page.locator(partNone(slot))).toHaveAttribute('aria-pressed', 'true');
});

// ─── Then — palette ─────────────────────────────────────────────────

Then('the {string} colour input shows {string}', async ({ page }, region: string, hex: string) => {
  await expect(page.locator(palette(region))).toHaveValue(hex);
});

// ─── Then — draw ────────────────────────────────────────────────────

Then('the drawing surface has {int} stroke(s)', async ({ page }, count: number) => {
  await expect(page.locator(TESTIDS.drawInk)).toHaveCount(count);
});

Then('the drawing surface is empty', async ({ page }) => {
  await expect(page.locator(TESTIDS.drawInk)).toHaveCount(0);
});

Then('the draw status reads {string}', async ({ page }, text: string) => {
  await expect(page.locator(TESTIDS.drawStatus)).toHaveText(text);
});

Then('the draw status mentions {string}', async ({ page }, fragment: string) => {
  await expect(page.locator(TESTIDS.drawStatus)).toContainText(fragment);
});

// ─── Then — export ──────────────────────────────────────────────────

Then('a PNG file is downloaded', async () => {
  const dl = studioState.lastDownload;
  expect(dl, 'a download event should have been captured').not.toBeNull();
  expect(dl!.suggestedFilename()).toMatch(/\.png$/);
});

Then('the export status reads {string}', async ({ page }, text: string) => {
  await expect(page.locator(TESTIDS.exportStatus)).toHaveText(text);
});

// ─── Then — credits / attribution ───────────────────────────────────

Then('the credits show {string}', async ({ page }, fragment: string) => {
  await expect(page.locator(TESTIDS.credits)).toContainText(fragment);
});

Then('no credits section is shown', async ({ page }) => {
  await expect(page.locator(TESTIDS.credits)).toHaveCount(0);
});

// ─── Then — expression ──────────────────────────────────────────────

Then('the {string} expression is active', async ({ page }, id: string) => {
  await expect(page.locator(expression(id))).toHaveAttribute('aria-pressed', 'true');
});

// ─── Then — @cluster (off-stack) ────────────────────────────────────

Then('the AI status reports a suggestion was applied', async ({ page }) => {
  await expect(page.locator(TESTIDS.aiStatus)).toContainText(/starting point/i);
});

Then('the avatar export reports success', async ({ page }) => {
  await expect(page.locator(TESTIDS.exportStatus)).toHaveText('Set as your avatar.');
});
