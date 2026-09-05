import { Injectable, inject } from '@angular/core';
import { SessionService } from './session.service';
import { VnCharacter } from '../models/vn-character';

/** Result of an avatar export — the refreshed profile's mxc:// avatar URL. */
export interface AvatarResult {
  avatarUrl: string;
}

/** One platform's outcome in a cross-platform apply. `skipped` is NOT a failure:
 *  it means the signed-in user lacks that platform's access role, which the
 *  gateway answers with 403 (MatrixProxyController / MastodonProxyController both
 *  gate on ROLE_MATRIX / ROLE_MASTODON). Reporting it separately keeps the UI
 *  honest — "not yours to set" must never read as "we tried and failed". */
export type PlatformOutcome = 'applied' | 'skipped' | 'failed';

export interface PlatformResult {
  /** Human label for the surface, e.g. 'This mesh', 'Matrix', 'Mastodon'. */
  platform: string;
  outcome: PlatformOutcome;
  /** Why, when the outcome is not `applied`. Shown verbatim to the operator. */
  detail?: string;
}

/**
 * Ceiling on the character-definition GET that the studio's first render waits
 * behind. A bff that REFUSES the connection already rejects promptly; one that
 * accepts the socket and then never answers (gateway backpressure, a wedged
 * upstream pool) would otherwise leave the promise outstanding for the life of
 * the page. Bounding it turns that stall into the ordinary — and already
 * handled — failure path, whose fallback is the pack default. Generous on
 * purpose: this is a stall detector, not a latency budget.
 *
 * Deliberately NOT applied to the write/upload calls: `saveDefinition` retries
 * on the next edit, and the avatar export runs a server-side moderation pass
 * that can legitimately take longer than any timeout worth setting here.
 *
 * Exported so the spec can step a virtual clock past it.
 */
export const BFF_LOAD_TIMEOUT_MS = 10_000;

/**
 * Hand-written fetch client for the user-bff (the org convention; no HttpClient).
 * Authenticates via the HttpOnly `bff_` cookie ({@link SessionService} credentials)
 * — no browser bearer. Covers the character-definition persistence (PUT/GET
 * vn-character) and the moderated avatar export
 * (`POST /bff/user/profile/avatar` — runs the A3 gate server-side, B0 §4).
 */
@Injectable({ providedIn: 'root' })
export class CharacterBffService {
  private readonly session = inject(SessionService);
  private readonly base = '/bff/user';

  /** Persist the active character definition (subject derived server-side). */
  async saveDefinition(def: VnCharacter): Promise<void> {
    const res = await fetch(`${this.base}/vn-character`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: this.session.credentials,
      body: JSON.stringify(def),
    });
    if (!res.ok) {
      throw new Error(`saveDefinition ${res.status}`);
    }
  }

  /**
   * Load the active character definition for re-edit (null if none).
   *
   * Bounded by {@link BFF_LOAD_TIMEOUT_MS}: the studio's restore-on-open waits
   * on this, so a bff that stalls rather than fails must still settle. The
   * caller treats the resulting rejection exactly like an unreachable bff.
   */
  async loadActive(): Promise<VnCharacter | null> {
    const res = await this.getBounded(`${this.base}/vn-character/active`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`loadActive ${res.status}`);
    }
    return (await res.json()) as VnCharacter;
  }

  /**
   * GET with a hard ceiling on how long it may stay unanswered. Uses an
   * AbortController driven by `setTimeout` rather than `AbortSignal.timeout()`
   * so the timer is cleared the moment the response lands (no timer left
   * pending behind a finished request) and so zone.js can drive it in the
   * specs' virtual clock.
   */
  private async getBounded(url: string, timeoutMs = BFF_LOAD_TIMEOUT_MS): Promise<Response> {
    const abort = new AbortController();
    const timer = setTimeout(
      () => abort.abort(new DOMException(`${url} did not answer within ${timeoutMs}ms`, 'TimeoutError')),
      timeoutMs,
    );
    try {
      return await fetch(url, { credentials: this.session.credentials, signal: abort.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Export the rendered character PNG as the user's avatar. Runs the A3
   * moderation gate server-side; a blocked image returns HTTP 422.
   */
  async exportAvatar(png: Blob): Promise<AvatarResult> {
    const form = new FormData();
    form.append('file', png, 'avatar.png');
    const res = await fetch(`${this.base}/profile/avatar`, {
      method: 'POST',
      credentials: this.session.credentials,
      body: form,
    });
    if (res.status === 422) {
      throw new Error('blocked-by-content-policy');
    }
    if (!res.ok) {
      throw new Error(`exportAvatar ${res.status}`);
    }
    return (await res.json()) as AvatarResult;
  }

  // ── cross-platform apply ────────────────────────────────────────────────────
  // The generators produce ONE image; the operator asked for it to land on every
  // platform that actually has an avatar, not just this mesh's profile. Each leg
  // below uses a mechanism verified against the RUNNING mesh, and each reports
  // independently: one platform failing (or not being the user's to set) never
  // hides the others' outcome.
  //
  // Platforms deliberately ABSENT here, because they have no avatar to set:
  // wiki (no user-presentation layer at all — only a raw author subject), tube
  // (a personal YouTube mirror; no local creator profiles) and owncast (upstream
  // has instance branding only, no per-user avatar). Claiming those would be a
  // lie in the results list.

  /** Set the avatar on every platform this user can. Never throws: the caller
   *  renders the per-platform list, so a partial success stays legible. */
  async applyEverywhere(png: Blob): Promise<PlatformResult[]> {
    const results: PlatformResult[] = [];

    // 1. This mesh's profile — the canonical setter both UIs already use.
    try {
      await this.exportAvatar(png);
      results.push({ platform: 'This mesh', outcome: 'applied' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push(
        msg === 'blocked-by-content-policy'
          ? { platform: 'This mesh', outcome: 'failed', detail: 'Blocked by the content policy.' }
          : { platform: 'This mesh', outcome: 'failed', detail: msg });
    }

    results.push(await this.applyToMatrix(png));
    results.push(await this.applyToMastodon(png));
    return results;
  }

  /** Matrix: upload the bytes to the homeserver media repo through the hsproxy,
   *  then point the profile at the returned mxc://. Two calls, both proxied — the
   *  browser never holds a homeserver token. */
  private async applyToMatrix(png: Blob): Promise<PlatformResult> {
    const hs = `${this.base}/matrix`;
    try {
      const who = await fetch(`${hs}/_matrix/client/v3/account/whoami`, {
        credentials: this.session.credentials,
      });
      if (who.status === 403 || who.status === 401) {
        return { platform: 'Matrix', outcome: 'skipped', detail: 'Your account does not have Matrix access.' };
      }
      if (!who.ok) {
        return { platform: 'Matrix', outcome: 'failed', detail: `whoami ${who.status}` };
      }
      const userId = (await who.json()).user_id as string;

      const up = await fetch(`${hs}/_matrix/media/v3/upload`, {
        method: 'POST',
        headers: { 'Content-Type': png.type || 'image/png' },
        credentials: this.session.credentials,
        body: png,
      });
      if (!up.ok) {
        return { platform: 'Matrix', outcome: 'failed', detail: `media upload ${up.status}` };
      }
      const contentUri = (await up.json()).content_uri as string;

      // The MXID rides RAW (@ and : unescaped): the hsproxy re-escapes '%', so a
      // percent-encoded segment arrives double-escaped and misses the route.
      const set = await fetch(
        `${hs}/_matrix/client/v3/profile/${userId}/avatar_url`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: this.session.credentials,
          body: JSON.stringify({ avatar_url: contentUri }),
        });
      return set.ok
        ? { platform: 'Matrix', outcome: 'applied' }
        : { platform: 'Matrix', outcome: 'failed', detail: `set avatar ${set.status}` };
    } catch (e) {
      return { platform: 'Matrix', outcome: 'failed', detail: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Mastodon (and Akkoma, which is API-compatible): one multipart PATCH. The
   *  proxy streams the body verbatim so the multipart boundary survives. */
  private async applyToMastodon(png: Blob): Promise<PlatformResult> {
    try {
      const form = new FormData();
      form.append('avatar', png, 'avatar.png');
      const res = await fetch(
        `${this.base}/mastodon/api/v1/accounts/update_credentials`,
        { method: 'PATCH', credentials: this.session.credentials, body: form });
      if (res.status === 403 || res.status === 401) {
        return { platform: 'Mastodon', outcome: 'skipped', detail: 'Your account does not have Mastodon access.' };
      }
      return res.ok
        ? { platform: 'Mastodon', outcome: 'applied' }
        : { platform: 'Mastodon', outcome: 'failed', detail: `update_credentials ${res.status}` };
    } catch (e) {
      return { platform: 'Mastodon', outcome: 'failed', detail: e instanceof Error ? e.message : String(e) };
    }
  }
}
