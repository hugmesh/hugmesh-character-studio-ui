/**
 * @cluster (LIVE) step definitions — the avatar cross-surface write with REAL
 * Casdoor sessions, its cross-user isolation, and the edge-AI seam round-trip.
 * Everything here needs the off-stack character-bff / character-ai, so it lives in
 * @cluster features: the config GENERATES them (so `--list` proves they parse) and
 * the fixtures.ts Before hook SKIPS them unless E2E_LIVE=1.
 *
 * HONEST WRITES. The avatar write drives the REAL studio UI on the user's own
 * cookie-backed page (compose → PNG → `POST /bff/user/profile/avatar`, A3
 * moderation server-side) and the outcome is proven by RE-READING the platform
 * profile (`GET /bff/user/profile` → avatarUrl) — never by the studio's own status
 * text alone. VICTIM-FIRST ISOLATION: every avatarUrl compared across users is a
 * REAL server-returned value captured in-scenario; bob's write must leave alice's
 * avatarUrl untouched, and the two users' avatarUrls must differ (they compose
 * deliberately-distinct fur colours so the assertion holds under both a
 * content-addressed and a per-subject URL scheme).
 */

import { expect, Page } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { pageRegistry, ctxRegistry, avatarState, responseState } from './_registry';
import { login, newE2eContext, readOwnAvatarUrl } from '../../tests/helpers/session';
import { TESTIDS, gotoStudio, setColor } from '../../tests/helpers/studio';

function pageOf(username: string): Page {
  const page = pageRegistry.get(username);
  if (!page) {
    throw new Error(`No page registered for "${username}" — add a session step first.`);
  }
  return page;
}

// ─── real sessions (own context per user) ───────────────────────────

Given('{string} is signed in with a real session', async ({ browser, user }, username: string) => {
  const u = user(username);
  const ctx = await newE2eContext(browser);
  const page = await ctx.newPage();
  await login(page, u);
  ctxRegistry.set(u.username, ctx);
  pageRegistry.set(u.username, page);
});

Given('{string} has the character studio open', async ({ user }, username: string) => {
  await gotoStudio(pageOf(user(username).username));
});

// ─── avatar write + profile read-back ───────────────────────────────

When('{string} notes their current profile avatar', async ({ user }, username: string) => {
  const key = user(username).username;
  avatarState.noted.set(key, await readOwnAvatarUrl(pageOf(key)));
});

When(
  '{string} recolours their {string} region to {string}',
  async ({ user }, username: string, region: string, hex: string) => {
    await setColor(pageOf(user(username).username), region, hex);
  },
);

When('{string} sets the character as their avatar', async ({ user }, username: string) => {
  await pageOf(user(username).username).locator(TESTIDS.setAvatar).click();
});

Then('{string} sees the avatar set successfully', async ({ user }, username: string) => {
  // The studio maps ONLY a 2xx avatar write to this exact text (401→sign-in,
  // 422→blocked, other→failed), so it is a real success oracle for the client leg.
  await expect(pageOf(user(username).username).locator(TESTIDS.exportStatus)).toHaveText(
    'Set as your avatar.',
    { timeout: 30_000 },
  );
});

Then("{string}'s profile avatar changed from the noted value", async ({ user }, username: string) => {
  const key = user(username).username;
  expect(avatarState.noted.has(key), `"${username}" never noted a baseline avatar in this scenario`).toBe(
    true,
  );
  const now = await readOwnAvatarUrl(pageOf(key));
  expect(now, 'a successful avatar write must yield a non-empty avatarUrl').toBeTruthy();
  expect(now, "the profile avatarUrl must differ from the pre-write baseline").not.toBe(
    avatarState.noted.get(key),
  );
  // Record the post-write value for the cross-user isolation oracles.
  avatarState.written.set(key, now);
});

Then("{string}'s profile avatar is unchanged since their write", async ({ user }, username: string) => {
  // The load-bearing isolation oracle: after the OTHER user wrote, re-read this
  // user and prove their avatarUrl is still exactly what their own write produced
  // — the other user's write did not clobber it.
  const key = user(username).username;
  const written = avatarState.written.get(key);
  expect(written, `"${username}" has no recorded post-write avatar — run their write step first`).toBeTruthy();
  expect(await readOwnAvatarUrl(pageOf(key))).toBe(written);
});

Then("{string}'s profile avatar differs from {string}'s", async ({ user }, a: string, b: string) => {
  const av = avatarState.written.get(user(a).username);
  const bv = avatarState.written.get(user(b).username);
  expect(av, `"${a}" has no recorded post-write avatar`).toBeTruthy();
  expect(bv, `"${b}" has no recorded post-write avatar`).toBeTruthy();
  expect(av, 'two users must not share an avatarUrl after distinct writes').not.toBe(bv);
});

// ─── edge-AI seam round-trip proof (tightens ai-assist.feature) ──────

When('I generate a character through the edge-AI seam', async ({ page }) => {
  // Capture the REAL seam response in flight. The service silently falls back to
  // the local heuristic on any non-ok, producing the SAME "starting point" status
  // — so only asserting the response status can prove the edge-AI path is live and
  // a dead seam (401/404/5xx) is not masquerading as success.
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/bff/user/vn-character/suggest') && r.request().method() === 'POST',
      { timeout: 15_000 },
    ),
    page.locator(TESTIDS.aiGenerate).click(),
  ]);
  responseState.lastStatus = resp.status();
});

Then('the edge-AI suggest endpoint responded 200', async () => {
  expect(
    responseState.lastStatus,
    'the edge-AI seam must answer 200 — a fallback to the local heuristic would hide a dead seam',
  ).toBe(200);
});
