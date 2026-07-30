import { expect, Page } from '@playwright/test';

/**
 * The data-testid contract the character-studio templates expose. Centralised so
 * a template rename localises to one place (mirrors login-ui's SELECTORS). Dynamic
 * ids (per slot / per part / per region / per expression) are built by the helpers
 * below from the active pack's real ids (base-anthro-v1).
 */
export const TESTIDS = {
  studio: '[data-testid="cs-studio"]',
  status: '[data-testid="cs-status"]',
  packSelect: '[data-testid="cs-pack-select"]',
  surprise: '[data-testid="cs-surprise"]',
  hybridToggle: '[data-testid="cs-hybrid-toggle"]',
  slotFieldsets: 'fieldset[data-testid^="cs-slot-"]',
  error: '[data-testid="cs-error"]',
  validity: '[data-testid="cs-validity"]',
  canvas: '[data-testid="cs-canvas"]',
  drawSurface: '[data-testid="cs-draw-surface"]',
  drawInk: '[data-testid="cs-draw-ink"]',
  drawUndo: '[data-testid="cs-draw-undo"]',
  drawClear: '[data-testid="cs-draw-clear"]',
  drawApply: '[data-testid="cs-draw-apply"]',
  drawRemove: '[data-testid="cs-draw-remove"]',
  drawSlot: '[data-testid="cs-draw-slot"]',
  drawRegion: '[data-testid="cs-draw-region"]',
  drawStatus: '[data-testid="cs-draw-status"]',
  exportDownload: '[data-testid="cs-export-download"]',
  setAvatar: '[data-testid="cs-set-avatar"]',
  exportStatus: '[data-testid="cs-export-status"]',
  aiPrompt: '[data-testid="cs-ai-prompt"]',
  aiGenerate: '[data-testid="cs-ai-generate"]',
  aiStatus: '[data-testid="cs-ai-status"]',
  credits: '[data-testid="cs-credits"]',
} as const;

export const partPick = (slot: string, partId: string): string =>
  `[data-testid="cs-part-pick-${slot}-${partId}"]`;
export const partNone = (slot: string): string => `[data-testid="cs-part-none-${slot}"]`;
export const palette = (region: string): string => `[data-testid="cs-palette-${region}"]`;
export const expression = (id: string): string => `[data-testid="cs-expression-${id}"]`;
export const partFilter = (slot: string): string => `[data-testid="cs-part-filter-${slot}"]`;
export const slotFieldset = (slot: string): string => `[data-testid="cs-slot-${slot}"]`;

/**
 * Navigate to the standalone studio and wait until it is composed and interactive:
 * the studio grid is visible AND the canvas has a real composed data: URL (the
 * SVG-DOM rig resolves the pack asynchronously, so `domcontentloaded` alone is too
 * early). Returns nothing; callers read state via the helpers below.
 */
export async function gotoStudio(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(TESTIDS.studio)).toBeVisible({ timeout: 30_000 });
  // The canvas src is set by an async effect (rig.composeDataUrl). Wait for the
  // composed SVG data URL so the FIRST captured src is never the empty pre-compose
  // value — otherwise a "canvas changed" assertion could pass spuriously.
  await expect
    .poll(async () => (await canvasSrc(page)) ?? '', { timeout: 30_000 })
    .toContain('data:image/svg+xml');
}

/** The current composed-SVG data URL on the preview <img> (null before first compose). */
export async function canvasSrc(page: Page): Promise<string | null> {
  return page.locator(TESTIDS.canvas).getAttribute('src');
}

/**
 * Assert the canvas re-composed to a DIFFERENT SVG than `prev` (i.e. the edit
 * actually changed the rendered document). Polls because the rig recomposes in an
 * async effect after the state signal updates.
 */
export async function expectCanvasChanged(page: Page, prev: string): Promise<void> {
  await expect
    .poll(async () => canvasSrc(page), {
      timeout: 15_000,
      message: 'expected the canvas SVG data URL to change after the edit',
    })
    .not.toBe(prev);
}

/**
 * Assert the canvas re-composed back to EXACTLY `expected` (a deterministic
 * restore — e.g. undo of a palette/pick, or expression→neutral returning to the
 * base look). Polls to allow the async recompose to settle.
 */
export async function expectCanvasRestored(page: Page, expected: string): Promise<void> {
  await expect
    .poll(async () => canvasSrc(page), {
      timeout: 15_000,
      message: 'expected the canvas SVG data URL to return to the noted state',
    })
    .toBe(expected);
}

/** Pick a specific part for a slot (part-picker toggle button). */
export async function pickPart(page: Page, slot: string, partId: string): Promise<void> {
  await page.locator(partPick(slot, partId)).click();
}

/** Clear an optional slot via its "None" button. */
export async function pickNone(page: Page, slot: string): Promise<void> {
  await page.locator(partNone(slot)).click();
}

/**
 * Set a palette region's colour. `input[type=color]` cannot be driven with
 * `fill()`, so we set `.value` and dispatch a bubbling `input` event — exactly the
 * event the template binds `(input)="onColor(...)"` to.
 */
export async function setColor(page: Page, region: string, hex: string): Promise<void> {
  await page.locator(palette(region)).evaluate((el, value) => {
    const input = el as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, hex);
}

/**
 * Switch the studio to another pack via the header <select> and wait until the
 * NEW pack is fully rendered. The slot-fieldset count is the deterministic
 * "pack switched" marker (each pack declares a distinct set of slots and the
 * picker renders one fieldset per slot); waiting on the status text alone races
 * because the old pack's status matches the same "Loaded …" shape.
 */
export async function switchPack(page: Page, packId: string, slotCount: number): Promise<void> {
  await page.locator(TESTIDS.packSelect).selectOption(packId);
  await expect(page.locator(TESTIDS.slotFieldsets)).toHaveCount(slotCount, { timeout: 30_000 });
  // The new pack recomposes asynchronously — wait for a composed data URL.
  await expect
    .poll(async () => (await canvasSrc(page)) ?? '', { timeout: 30_000 })
    .toContain('data:image/svg+xml');
}

/**
 * The offered part count per slot (the picker's LIVE, compatibility-filtered
 * lists — "None" buttons excluded). One DOM evaluation so the counts are a
 * consistent snapshot even while Angular re-renders.
 */
export async function offeredPartCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const counts: Record<string, number> = {};
    for (const fs of document.querySelectorAll('fieldset[data-testid^="cs-slot-"]')) {
      const slot = fs.getAttribute('data-testid')!.replace('cs-slot-', '');
      counts[slot] = fs.querySelectorAll('button[data-testid^="cs-part-pick-"]').length;
    }
    return counts;
  });
}

/**
 * {@link offeredPartCounts} narrowed to REQUIRED slots (legend without
 * "(optional)"). An OPTIONAL slot may legitimately offer zero parts under the
 * compatibility filter — srd-taxonomy's "feature" slot ships only avian/
 * humanoid-compatible parts, so a canid default head empties it until hybrid
 * mode — but a required slot with nothing to pick would soft-lock the pack.
 */
export async function requiredOfferedPartCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const counts: Record<string, number> = {};
    for (const fs of document.querySelectorAll('fieldset[data-testid^="cs-slot-"]')) {
      const legend = fs.querySelector('legend')?.textContent ?? '';
      if (legend.includes('(optional)')) {
        continue;
      }
      const slot = fs.getAttribute('data-testid')!.replace('cs-slot-', '');
      counts[slot] = fs.querySelectorAll('button[data-testid^="cs-part-pick-"]').length;
    }
    return counts;
  });
}

/**
 * PROGRAMMATIC single-axis sweep: click the FIRST or LAST offered part of every
 * slot, in the picker's (z-)order, asserting each click actually presses its
 * button. The lists are re-queried per slot because an earlier pick (a new body
 * archetype) legitimately re-filters later slots — exactly what a user sees.
 */
export async function pickEdgePartInEverySlot(page: Page, edge: 'first' | 'last'): Promise<void> {
  const fieldsets = page.locator(TESTIDS.slotFieldsets);
  const slots = await fieldsets.count();
  expect(slots, 'the picker should render at least one slot fieldset').toBeGreaterThan(0);
  for (let i = 0; i < slots; i++) {
    const buttons = fieldsets.nth(i).locator('button[data-testid^="cs-part-pick-"]');
    const n = await buttons.count();
    expect(n, `slot #${i} should offer at least one part`).toBeGreaterThan(0);
    const target = edge === 'first' ? buttons.first() : buttons.nth(n - 1);
    await target.scrollIntoViewIfNeeded();
    await target.click();
    await expect(target).toHaveAttribute('aria-pressed', 'true');
  }
}

/**
 * Assert every REQUIRED slot (legend without "(optional)") has exactly one
 * pressed part button — the randomizer/sweep "still a valid character" check.
 */
export async function expectRequiredSlotsPressed(page: Page): Promise<void> {
  const fieldsets = page.locator(TESTIDS.slotFieldsets);
  const slots = await fieldsets.count();
  for (let i = 0; i < slots; i++) {
    const fs = fieldsets.nth(i);
    const legend = (await fs.locator('legend').textContent()) ?? '';
    if (legend.includes('(optional)')) {
      continue;
    }
    await expect(
      fs.locator('button[data-testid^="cs-part-pick-"][aria-pressed="true"]'),
      `required slot "${legend.trim()}" should have exactly one selected part`,
    ).toHaveCount(1);
  }
}

/** How many committed strokes the drawing surface currently holds. */
export async function inkCount(page: Page): Promise<number> {
  return page.locator(TESTIDS.drawInk).count();
}

/**
 * Draw one freehand stroke on the SVG surface with a real pointer drag. Chromium
 * synthesises pointer events from mouse actions, so the component's
 * pointerdown→pointermove→pointerup handlers fire and commit one path on up. The
 * multi-segment move gives perfect-freehand enough points to emit a non-empty `d`.
 */
export async function drawStroke(page: Page): Promise<void> {
  // page.mouse dispatches at ABSOLUTE viewport coordinates and does NOT auto-scroll
  // (unlike locator.click()), so the surface — which sits well below the fold in the
  // single-column studio layout — must be scrolled into view first, or every pointer
  // event lands outside the viewport and no stroke ever commits.
  const surface = page.locator(TESTIDS.drawSurface);
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) {
    throw new Error('drawing surface has no bounding box (not rendered?)');
  }
  const before = await inkCount(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 40, cy - 30);
  await page.mouse.down();
  await page.mouse.move(cx - 10, cy + 10, { steps: 4 });
  await page.mouse.move(cx + 30, cy - 5, { steps: 4 });
  await page.mouse.move(cx + 50, cy + 25, { steps: 4 });
  await page.mouse.up();
  // A stroke MUST have committed — otherwise later undo/clear assertions are vacuous.
  await expect
    .poll(async () => inkCount(page), {
      timeout: 10_000,
      message: 'expected the pointer drag to commit one stroke on the drawing surface',
    })
    .toBe(before + 1);
}
