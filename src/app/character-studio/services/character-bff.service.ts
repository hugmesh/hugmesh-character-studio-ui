import { Injectable, inject } from '@angular/core';
import { SessionService } from './session.service';
import { VnCharacter } from '../models/vn-character';

/** Result of an avatar export — the refreshed profile's mxc:// avatar URL. */
export interface AvatarResult {
  avatarUrl: string;
}

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

  /** Load the active character definition for re-edit (null if none). */
  async loadActive(): Promise<VnCharacter | null> {
    const res = await fetch(`${this.base}/vn-character/active`, {
      credentials: this.session.credentials,
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`loadActive ${res.status}`);
    }
    return (await res.json()) as VnCharacter;
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
}
