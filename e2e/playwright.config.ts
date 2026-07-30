import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// Standalone dev-shell URL. `ng serve character-studio` mounts CharacterStudioComponent
// at the app root (app.routes.ts → CHARACTER_STUDIO_ROUTES at path ''), so the whole
// studio is browsable at `/`. Overridable for a federated host via E2E_BASE_URL.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4200';

// Results root — repo-local `results/` by default so the offline gate
// (`bddgen` + `playwright test --list`) and a bare host both work.
const resultsDir = process.env.E2E_RESULTS_DIR ?? 'results';

// playwright-bdd compiles every .feature under features/ into generated specs
// below .features-gen/, wiring the World fixture from features/support/fixtures.ts
// (which also inlines the Before/AfterStep/After hooks) and the step definitions
// under features/steps/.
//
// DISCOVERABILITY — no generation-time tag filter. Every scenario, INCLUDING
// @cluster, is generated so it stays discoverable offline (`bddgen` +
// `playwright test --list`) per the platform e2e house law — a broken @cluster
// step definition then fails to compile at bddgen time instead of hiding until
// E2E_LIVE=1. @cluster scenarios need the off-stack character-bff / character-ai
// (the set-as-avatar cross-surface write + its cross-user isolation, the
// signed-out 401 path, and the AI edge-AI seam); they are SKIPPED AT RUNTIME
// unless E2E_LIVE=1 by the Before hook in features/support/fixtures.ts, so the
// default offline run lists them but never executes them. The fully offline
// creative tools (part-picker, palette, draw, PNG export→download, expression
// preview, canvas/export-fidelity, AI local-heuristic fallback) run untagged.
const bddTestDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: [
    'features/steps/**/*.ts',
    'features/support/**/*.ts',
  ],
});

export default defineConfig({
  // Single-worker / serial. A shared root-provided CharacterStateService store and
  // the module-global per-scenario registry make parallel scenarios contend; serial
  // keeps the canvas-diff assertions deterministic.
  fullyParallel: false,
  workers: 1,
  // One retry absorbs a rare dev-server / rasterisation flake without masking a
  // real regression — a deterministic failure fails twice.
  retries: 1,
  timeout: 180_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${resultsDir}/html`, open: 'never' }],
  ],
  outputDir: `${resultsDir}/artifacts`,
  use: {
    baseURL,
    // Accept a self-signed cert when pointed at an integration-test host.
    ignoreHTTPSErrors: true,
    // Per-step screenshot forced ON so the report carries the canvas state at
    // every transition (pick swap, recolour, stroke, undo, clear, export).
    screenshot: 'on',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      // Desktop project: everything EXCEPT the @responsive layout scenarios,
      // which only make sense on the emulated small viewports below. This
      // harness is pure BDD (no handwritten *.spec.ts) — tests/ carries
      // helpers only.
      name: 'bdd',
      testDir: bddTestDir,
      grepInvert: /@responsive/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROME_BIN
          ? { executablePath: process.env.PW_CHROME_BIN }
          : {},
      },
    },
    // VIEWPORT projects (mobile/tablet hardening): run ONLY the @responsive
    // feature. isMobile+hasTouch emulate a coarse pointer so the global
    // `@media (pointer: coarse)` 44px touch-target rule is actually in force.
    // The sticky stacked-preview scenario is @phone — the stacked layout only
    // engages below the 768px breakpoint, so tablets grepInvert it.
    {
      name: 'bdd-phone',
      testDir: bddTestDir,
      grep: /@responsive/,
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 740 },
        isMobile: true,
        hasTouch: true,
        launchOptions: process.env.PW_CHROME_BIN
          ? { executablePath: process.env.PW_CHROME_BIN }
          : {},
      },
    },
    {
      name: 'bdd-tablet',
      testDir: bddTestDir,
      grep: /@responsive/,
      grepInvert: /@phone/,
      use: {
        browserName: 'chromium',
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
        launchOptions: process.env.PW_CHROME_BIN
          ? { executablePath: process.env.PW_CHROME_BIN }
          : {},
      },
    },
    {
      name: 'bdd-tablet-landscape',
      testDir: bddTestDir,
      grep: /@responsive/,
      grepInvert: /@phone/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1024, height: 768 },
        isMobile: true,
        hasTouch: true,
        launchOptions: process.env.PW_CHROME_BIN
          ? { executablePath: process.env.PW_CHROME_BIN }
          : {},
      },
    },
  ],
});
