import { BrowserContext, Download, Page } from '@playwright/test';

/**
 * Per-scenario module-global state for the character-studio BDD suite.
 *
 * playwright-bdd recreates the test/World for each scenario; the {@link Before} /
 * {@link After} hooks in `features/support/fixtures.ts` call {@link resetRegistry}
 * so each scenario starts clean. Cross-step values that cannot be threaded through
 * step params (the Playwright World is the first arg, but "the canvas as it looked
 * before the edit" must survive from a When to a Then) live here in module scope.
 */
export const studioState: {
  /** The canvas SVG data URL captured by a "When I note the current canvas" step. */
  notedCanvasSrc: string;
  /** The most recent download event captured by the export step (for filename assertions). */
  lastDownload: Download | null;
  /** slot → offered-part count captured by "I note the offered part counts" (hybrid diff). */
  notedPartCounts: Record<string, number> | null;
} = {
  notedCanvasSrc: '',
  lastDownload: null,
  notedPartCounts: null,
};

/**
 * Per-user pages/contexts for the @cluster avatar cross-user scenarios. Two real,
 * cookie-backed identities coexist in one scenario (each in its own context so the
 * bff_ cookies never share), keyed by username so steps reference a user by name
 * without threading a page/token through. Contexts are closed in the After hook.
 */
export const pageRegistry = new Map<string, Page>();
export const ctxRegistry = new Map<string, BrowserContext>();

/**
 * Avatar-write oracle state for the @cluster scenarios (username-keyed):
 *  - `noted`   — each user's avatarUrl BEFORE their own write (baseline; may be
 *                null when they have never set one).
 *  - `written` — each user's avatarUrl captured right AFTER their own write
 *                succeeded — the value the cross-user "differs from" and
 *                "unchanged by the other's write" oracles compare against.
 * A DENY/isolation assertion against a fabricated URL proves nothing, so every
 * value here is a REAL server-returned avatarUrl captured in-scenario.
 */
export const avatarState: {
  noted: Map<string, string | null>;
  written: Map<string, string | null>;
} = {
  noted: new Map(),
  written: new Map(),
};

/**
 * Last HTTP status captured by an API-style @cluster step (the edge-AI seam
 * round-trip proof reads this). Cleared on scenario teardown.
 */
export const responseState = { lastStatus: 0 };

/** Clear all per-scenario module state (Before + After). */
export function resetRegistry(): void {
  studioState.notedCanvasSrc = '';
  studioState.lastDownload = null;
  studioState.notedPartCounts = null;
  pageRegistry.clear();
  ctxRegistry.clear();
  avatarState.noted.clear();
  avatarState.written.clear();
  responseState.lastStatus = 0;
}
