import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Casdoor seed users for the character-studio avatar cross-surface write.
 *
 * The studio has NO role gates — every creative control is available to any
 * signed-in user (see avatar.feature's role-matrix note). The ONE identity-
 * relevant surface is `Set as avatar`: it POSTs the composed PNG to
 * `POST /bff/user/profile/avatar` (A3 moderation server-side) and the user's
 * platform-wide avatar (`GET /bff/user/profile` → avatarUrl) changes. That write
 * is keyed to the Casdoor SUBJECT, so the coverage that matters here is per-user
 * ISOLATION: `alice` and `bob` are two DISTINCT owners — bob's avatar write must
 * never clobber alice's, and each profile read returns only its own avatarUrl.
 *
 * These helpers are adapted verbatim in shape from the proven user-ui e2e harness
 * (tests/helpers/roles.ts): the browser holds only the HttpOnly `bff_` cookie
 * (no bearer since the native-login waves), and the non-secret `snap.session`
 * localStorage key is the ready signal. Everything here is exercised ONLY by
 * @cluster scenarios (a live Casdoor + host shell), which the config generates but
 * the fixtures.ts Before hook skips unless E2E_LIVE=1.
 */
export interface SeedUser {
  /** CLI-friendly username referenced from .feature lines. */
  username: string;
  /** env var the compose overlay routes the credential through. */
  passwordEnv: string;
  /** Identity provider — studio/host sessions are google- or discord-backed. */
  provider: 'google' | 'discord';
}

export const SEED_USERS: SeedUser[] = [
  // Two DISTINCT plain owners — the avatar cross-user isolation specs assert each
  // is scoped to its own profile subject.
  { username: 'alice', passwordEnv: 'E2E_ALICE_PASSWORD', provider: 'google' },
  { username: 'bob', passwordEnv: 'E2E_BOB_PASSWORD', provider: 'discord' },
];

const CREDENTIALS_FILENAME = '.e2e-credentials';

/**
 * Locate the run-state credentials file written by the seeder
 * (`tests/stack/e2e-password.sh` in hugmesh-generator). An explicit
 * `E2E_CREDENTIALS_FILE` path wins outright — existence is NOT checked here,
 * so a caller can still name that exact path in an error. Otherwise walk up
 * from `cwd` looking for a `.e2e-credentials` file, the same way `package.json`
 * or `.git` gets located, since Playwright's cwd is `e2e/` while the file is
 * conventionally written at the repo root. Returns `undefined` only when no
 * explicit path was given AND none was found walking up to the filesystem root.
 */
function findCredentialsFilePath(): string | undefined {
  const explicit = process.env['E2E_CREDENTIALS_FILE'];
  if (explicit) return resolve(explicit);

  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, CREDENTIALS_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Parse the seeder's run-state file: plain `KEY=value` lines, no quotes, no
 * `export` keyword (so it round-trips through both `set -a; . file; set +a`
 * and `docker compose --env-file`). Blank lines and `#`-comments are skipped;
 * a malformed line is ignored rather than throwing.
 */
function parseCredentialsFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return values;
}

/**
 * Load and parse the credentials file at `path`, if any. A missing file —
 * an explicit `E2E_CREDENTIALS_FILE` that hasn't been written yet, or simply
 * no `path` resolved at all — is expected pre-seed state, NOT an error: it
 * falls through to `undefined` so the caller raises ONE clear message rather
 * than an ENOENT stack trace. Any other read failure (e.g. a permissions
 * error) still propagates — that is a real, actionable environment problem.
 */
function loadCredentials(path: string | undefined): Record<string, string> | undefined {
  if (!path) return undefined;
  try {
    return parseCredentialsFile(readFileSync(path, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * Resolve a seed user's password. Precedence mirrors the mesh-wide contract
 * (per-user override -> shared override -> run-state file -> hard failure):
 *   1. `process.env[user.passwordEnv]` — explicit per-user override.
 *   2. `process.env.E2E_PASSWORD` — explicit shared override / same-run
 *      propagation from whichever process generated first.
 *   3. the run-state credentials file written by the seeder
 *      (`${E2E_CREDENTIALS_FILE}`, or a `.e2e-credentials` walked up from cwd).
 *   4. throws. There is no literal fallback: a guessable default defeats the
 *      entire point of random per-run passwords, so an unseeded run must fail
 *      loudly and name the fix (`make stack-seed`) instead of silently
 *      authenticating with a known value.
 */
export function passwordFor(user: SeedUser): string {
  const fromEnv = process.env[user.passwordEnv] || process.env['E2E_PASSWORD'];
  if (fromEnv) return fromEnv;

  const credentialsPath = findCredentialsFilePath();
  const fromFile = loadCredentials(credentialsPath);
  const filed = fromFile?.[user.passwordEnv] || fromFile?.['E2E_PASSWORD'];
  if (filed) return filed;

  const where = credentialsPath
    ? `checked ${credentialsPath}`
    : 'no .e2e-credentials file found walking up from cwd';
  throw new Error(
    `No e2e password resolved for '${user.username}': set $${user.passwordEnv} or $E2E_PASSWORD, ` +
      `or run \`make stack-seed\` to generate one and persist it to .e2e-credentials (${where}).`,
  );
}

/**
 * A fresh browser context that trusts the e2e self-signed cert AND pins the same
 * baseURL as the playwright config. `browser.newContext()` does NOT inherit
 * project-level `use` options, so a manually-opened context otherwise misses
 * `ignoreHTTPSErrors` and every HTTPS request (the native-federation manifest
 * fetch first) fails the cert check. The cross-user isolation matrix — two
 * identities live at once — MUST use this instead of `browser.newContext()`.
 */
export async function newE2eContext(browser: Browser): Promise<BrowserContext> {
  return await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: process.env.E2E_BASE_URL ?? 'https://host.docker.internal:8443',
  });
}

/**
 * Drive the federated login form and wait for `snap.session` in localStorage.
 *
 * @cluster-only — hits a LIVE Casdoor + host shell. The host renders the login
 * micro-frontend; on success SessionService writes `snap.session` and the gateway
 * sets the HttpOnly `bff_` cookie via Set-Cookie. We wait for the non-secret
 * `snap.session` key so a follow-up avatar write doesn't race the write — the
 * bearer no longer lives in the browser; every `/bff/**` call authenticates via
 * the cookie the login response set on this context. Selectors are the public
 * formControlName contract shared across the HugMesh login surfaces.
 */
export async function login(page: Page, user: SeedUser): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[formControlName="username"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.fill('input[formControlName="username"]', user.username);
  await page.fill('input[formControlName="password"]', passwordFor(user));
  await page.click('button.login-btn');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const raw = window.localStorage.getItem('snap.session');
      if (!raw) return false;
      try {
        return Boolean(JSON.parse(raw).id);
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 15_000 },
  );
}

/** Clear the session so a stale identity doesn't carry into the next check. */
export async function clearSession(page: Page): Promise<void> {
  await page.evaluate(() => window.localStorage.removeItem('snap.session'));
}

/**
 * Read the caller's OWN platform avatar via the same owner-scoped BFF endpoint the
 * user-ui profile surface uses (`GET /bff/user/profile` → `avatarUrl`), riding the
 * HttpOnly `bff_` cookie (`credentials: 'include'`). Returns `null` when the user
 * has never set an avatar (absent/null avatarUrl) — a legitimate pre-write
 * baseline. Throws on a non-200 so a broken read fails loudly rather than
 * masquerading as "no avatar".
 */
export async function readOwnAvatarUrl(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const r = await fetch('/bff/user/profile', { credentials: 'include' });
    if (!r.ok) {
      throw new Error(`GET /bff/user/profile → ${r.status}`);
    }
    const p = (await r.json()) as { avatarUrl?: string | null } | null;
    return p && typeof p === 'object' ? p.avatarUrl ?? null : null;
  });
}
