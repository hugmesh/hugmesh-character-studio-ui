/**
 * playwright-bdd World + hook registration for the character-studio e2e suite.
 *
 * SINGLE ENTRY POINT for step imports. Every step file MUST import
 * `{ Given, When, Then }` from here (not from `playwright-bdd` directly) so all
 * hooks and step definitions bind to the SAME `test` instance the generated specs
 * consume.
 *
 * HOOK PLACEMENT (load-bearing). `createBdd(test)` returns hook factories
 * (`Before`, `After`, `AfterStep`, …) that must be registered against the very
 * same `test` instance the generated specs use. Splitting hook registrations
 * across independently-globbed files races on load order and hooks silently never
 * fire — so ALL hook registration lives here, in one support file.
 *
 * SEED-USER WORLD. The suite grows two real, cookie-backed identities (alice /
 * bob) for the avatar cross-surface write + its cross-user isolation. The `user`
 * fixture resolves a CLI-friendly username from the seed catalogue and throws on a
 * typo so a bad feature line fails loudly instead of running as nobody.
 *
 * SCREENSHOT CAPTURE (AfterStep). Every step appends a PATH-based PNG attachment
 * to the HTML report (Playwright's HTML reporter only persists path-based
 * attachments into html/data) so a reviewer can see the canvas at every
 * transition — the pick swap, the recolour, the stroke, the undo, the clear —
 * without re-running.
 *
 * REGISTRY RESET (Before/After). The module-global per-scenario registry
 * (features/steps/_registry.ts) is reset around every scenario so a noted canvas,
 * a captured download, or a per-user page/context never leaks into the next
 * scenario.
 *
 * @cluster — GENERATED, SKIPPED-AT-RUNTIME. Scenarios that need the off-stack
 * character-bff / character-ai (the set-as-avatar cross-surface write, its
 * cross-user isolation, the signed-out 401 path, the edge-AI seam) are tagged
 * @cluster. The playwright.config.ts no longer filters them out of GENERATION, so
 * they stay discoverable offline (`bddgen` + `playwright test --list`) per the
 * platform e2e house law — a broken @cluster step is caught at bddgen time. The
 * tagged Before hook below SKIPS them at runtime unless E2E_LIVE=1, so the default
 * offline run lists them without executing (no live stack required).
 */

import { test as base, createBdd } from 'playwright-bdd';
import { SEED_USERS, SeedUser } from '../../tests/helpers/session';
import { ctxRegistry, resetRegistry } from '../steps/_registry';

interface UserLookup {
  /** Resolve a seed user by username. Throws on miss so a typo in a feature
   *  file fails loudly instead of silently running as whoever the previous
   *  step happened to leave us as. */
  user(username: string): SeedUser;
}

export const test = base.extend<UserLookup>({
  user: async ({}, use) => {
    await use((username: string) => {
      const found = SEED_USERS.find((u) => u.username === username);
      if (!found) {
        throw new Error(
          `Unknown seed user: "${username}". Known: ${SEED_USERS.map((u) => u.username).join(', ')}`,
        );
      }
      return found;
    });
  },
});

export const { Given, When, Then, Step, Before, After, BeforeStep, AfterStep, BeforeAll, AfterAll } =
  createBdd(test);

let stepCounter = 0;

// @cluster scenarios reach the off-stack character-bff / character-ai. They are
// GENERATED (so `--list` proves they parse) but SKIPPED unless E2E_LIVE=1 — the
// default offline run never executes them against a stack that isn't there.
Before({ tags: '@cluster' }, async () => {
  test.skip(
    process.env.E2E_LIVE !== '1',
    '@cluster scenario needs a live stack (character-bff / character-ai). Set E2E_LIVE=1 to run it.',
  );
});

Before(async () => {
  stepCounter = 0;
  resetRegistry();
});

AfterStep(async ({ page, $step, $testInfo }) => {
  stepCounter += 1;
  try {
    const stepTitle = ($step as { title?: string })?.title ?? `step-${stepCounter}`;
    const safeName = `${String(stepCounter).padStart(2, '0')}-${stepTitle}`
      .replace(/[^a-z0-9_-]+/gi, '-')
      .slice(0, 80);
    const filePath = $testInfo.outputPath(`${safeName}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    await $testInfo.attach(`step ${safeName}`, { path: filePath, contentType: 'image/png' });
  } catch {
    // Page closed mid-step (context torn down) — drop silently.
  }
});

After(async () => {
  // Close the per-user contexts a cross-user scenario opened. Without this, the
  // leaked contexts carry their bff_ cookies into the next scenario and the next
  // login round-trip races over federation init / Casdoor cookies.
  for (const ctx of ctxRegistry.values()) {
    try {
      await ctx.close();
    } catch {
      /* already closed */
    }
  }
  resetRegistry();
  stepCounter = 0;
});
