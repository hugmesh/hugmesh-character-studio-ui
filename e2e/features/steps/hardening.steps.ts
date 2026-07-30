/**
 * Step definitions for the HARDENING sweep features (packs / combinations /
 * randomizer / responsive). Same shape as studio.steps.ts: thin presentation
 * over tests/helpers/studio.ts, all assertions observing REAL app state.
 *
 * OFFLINE. Everything here runs against `ng serve character-studio` — the pack
 * switcher, part sweeps, hybrid toggle, randomizer and viewport checks are all
 * static-asset + in-browser behaviour, no backend. Nothing needs @cluster.
 *
 * PROGRAMMATIC SWEEPS. "All combinations" is made tractable per the harness
 * philosophy: the per-slot first/last sweep steps LOOP over the live slot
 * fieldsets instead of one hand-written scenario per part (the exhaustive
 * per-part × per-pack matrix lives in `npm run compose:sweep`, node-side).
 */

import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { studioState } from './_registry';
import {
  TESTIDS,
  partFilter,
  slotFieldset,
  canvasSrc,
  switchPack,
  offeredPartCounts,
  requiredOfferedPartCounts,
  pickEdgePartInEverySlot,
  expectRequiredSlotsPressed,
} from '../../tests/helpers/studio';

// ─── pack switching ─────────────────────────────────────────────────

When(
  'I switch to the {string} pack expecting {int} slots',
  async ({ page }, packId: string, slotCount: number) => {
    await switchPack(page, packId, slotCount);
  },
);

// REQUIRED slots only, on purpose: an optional slot may legitimately offer
// zero parts under the compatibility filter (srd-taxonomy's "feature" slot is
// avian/humanoid-only, so the canid default head empties it — hybrid mode
// reveals it; see the dedicated scenario). A required slot with nothing to
// pick, however, would soft-lock the pack.
Then('every required slot offers at least one part option', async ({ page }) => {
  const counts = await requiredOfferedPartCounts(page);
  expect(Object.keys(counts).length, 'at least one required slot fieldset should render').toBeGreaterThan(0);
  for (const [slot, n] of Object.entries(counts)) {
    expect(n, `required slot "${slot}" should offer at least one part`).toBeGreaterThan(0);
  }
});

Then('the {string} slot offers no parts', async ({ page }, slot: string) => {
  expect((await offeredPartCounts(page))[slot]).toBe(0);
});

Then(
  'the {string} slot offers at least {int} part(s)',
  async ({ page }, slot: string, min: number) => {
    await expect
      .poll(async () => (await offeredPartCounts(page))[slot], {
        timeout: 10_000,
        message: `expected slot "${slot}" to offer at least ${min} part(s)`,
      })
      .toBeGreaterThanOrEqual(min);
  },
);

Then('the pack select shows {string}', async ({ page }, packId: string) => {
  await expect(page.locator(TESTIDS.packSelect)).toHaveValue(packId);
});

// ─── per-slot first/last sweeps ─────────────────────────────────────

When('I pick the first offered part in every slot', async ({ page }) => {
  await pickEdgePartInEverySlot(page, 'first');
});

When('I pick the last offered part in every slot', async ({ page }) => {
  await pickEdgePartInEverySlot(page, 'last');
});

Then('every required slot has a selected part', async ({ page }) => {
  await expectRequiredSlotsPressed(page);
});

// ─── hybrid mode ────────────────────────────────────────────────────

When('I note the offered part counts per slot', async ({ page }) => {
  studioState.notedPartCounts = await offeredPartCounts(page);
});

When('I toggle hybrid mode', async ({ page }) => {
  const toggle = page.locator(TESTIDS.hybridToggle);
  const pressed = await toggle.getAttribute('aria-pressed');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');
});

Then('every slot offers at least as many parts as noted', async ({ page }) => {
  const noted = studioState.notedPartCounts;
  expect(noted, 'part counts should have been noted first').not.toBeNull();
  const now = await offeredPartCounts(page);
  expect(Object.keys(now).sort()).toEqual(Object.keys(noted!).sort());
  for (const [slot, n] of Object.entries(now)) {
    expect(n, `slot "${slot}" must not lose parts in hybrid mode`).toBeGreaterThanOrEqual(noted![slot]);
  }
});

Then('the total number of offered parts strictly increases', async ({ page }) => {
  const noted = studioState.notedPartCounts;
  expect(noted, 'part counts should have been noted first').not.toBeNull();
  const before = Object.values(noted!).reduce((a, b) => a + b, 0);
  const now = await offeredPartCounts(page);
  const after = Object.values(now).reduce((a, b) => a + b, 0);
  expect(after, 'hybrid mode should reveal archetype-filtered parts').toBeGreaterThan(before);
});

// ─── per-slot text filter ───────────────────────────────────────────

When('I filter the {string} slot parts with {string}', async ({ page }, slot: string, q: string) => {
  await page.locator(partFilter(slot)).fill(q);
  // the filter commits after a 150 ms debounce; the Then assertions poll
});

Then(
  'the {string} slot offers only parts whose label contains {string}',
  async ({ page }, slot: string, q: string) => {
    const buttons = page.locator(`${slotFieldset(slot)} button[data-testid^="cs-part-pick-"]`);
    // Poll until the debounced filter has narrowed the list to matches only.
    await expect
      .poll(
        async () => {
          const labels = await buttons.allTextContents();
          return labels.length > 0 && labels.every(l => l.toLowerCase().includes(q.toLowerCase()));
        },
        { timeout: 10_000, message: `expected only "${q}" parts in slot "${slot}"` },
      )
      .toBe(true);
  },
);

Then('clearing the {string} slot filter restores its parts', async ({ page }, slot: string) => {
  const noted = studioState.notedPartCounts;
  expect(noted, 'part counts should have been noted first').not.toBeNull();
  await page.locator(partFilter(slot)).fill('');
  await expect
    .poll(async () => (await offeredPartCounts(page))[slot], { timeout: 10_000 })
    .toBe(noted![slot]);
});

// ─── randomizer ─────────────────────────────────────────────────────

When('I surprise myself', async ({ page }) => {
  await page.locator(TESTIDS.surprise).click();
  // The status flips to the randomizer's message — proof the handler ran.
  await expect(page.locator(TESTIDS.status)).toContainText('Randomized');
});

// ─── responsive (@responsive / @phone projects) ─────────────────────

Then('the page has no horizontal scroll', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'document must not scroll horizontally').toBeLessThanOrEqual(0);
});

Then('the canvas preview fits inside the viewport width', async ({ page }) => {
  const box = await page.locator(TESTIDS.canvas).boundingBox();
  expect(box, 'the canvas should render').not.toBeNull();
  const width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
});

When('I scroll to the bottom of the page', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
});

Then('the canvas preview is still visible in the viewport', async ({ page }) => {
  const box = await page.locator(TESTIDS.canvas).boundingBox();
  expect(box, 'the canvas should render').not.toBeNull();
  const { height } = page.viewportSize()!;
  // sticky-top: the preview must remain inside the visible viewport band
  expect(box!.y + box!.height).toBeGreaterThan(0);
  expect(box!.y).toBeLessThan(height);
});

Then('the studio controls meet the 44 pixel touch-target minimum', async ({ page }) => {
  // The global coarse-pointer rule (`@media (pointer: coarse)`) must be active
  // under the emulated touch device — sample the key interactive controls.
  for (const selector of [TESTIDS.surprise, TESTIDS.hybridToggle, TESTIDS.packSelect]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} should render`).not.toBeNull();
    expect(box!.height, `${selector} touch target height`).toBeGreaterThanOrEqual(44);
  }
});
