import { Injectable, inject } from '@angular/core';
import { SessionService } from './session.service';
import { PartManifest } from '../models/vn-manifest';

/** A character suggestion: chosen parts + palette (+ the inferred head archetype). */
export interface CharacterSuggestion {
  slots?: Record<string, string | null>;
  palette?: Record<string, string>;
  headArchetype?: string;
}

/**
 * AI-assisted "describe → character" (B0 §8a). When the admin/mod-enabled edge-AI
 * endpoint is present it asks the on-prem Ollama seam via the BFF; otherwise it
 * falls back to a LOCAL keyword heuristic so the feature degrades gracefully with
 * no edge node (dark-by-default). Proposals are constrained to the active pack's
 * parts; the user always adjusts afterward.
 */
@Injectable({ providedIn: 'root' })
export class CharacterAiService {
  private readonly session = inject(SessionService);

  private static readonly ARCHETYPE_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['synth', ['protogen', 'primagen', 'synth', 'robot', 'cyborg', 'android', 'mech']],
    ['canid', ['wolf', 'fox', 'dog', 'canine', 'jackal', 'husky', 'coyote', 'gnoll']],
    ['felid', ['cat', 'feline', 'lion', 'tiger', 'panther', 'leopard', 'cheetah']],
    ['reptile', ['dragon', 'reptile', 'lizard', 'draco', 'kobold', 'snake', 'naga', 'dragonborn']],
    ['avian', ['bird', 'avian', 'owl', 'hawk', 'gryphon', 'griffon', 'phoenix', 'harpy']],
    ['equine', ['horse', 'equine', 'pony', 'unicorn', 'pegasus', 'kelpie']],
    ['bovid_cervid', ['deer', 'stag', 'goat', 'satyr', 'antelope', 'cow', 'bovine']],
    ['ursine_musteline', ['bear', 'otter', 'ferret', 'badger', 'panda']],
    ['lagomorph_rodent', ['rabbit', 'bunny', 'mouse', 'rat', 'squirrel']],
    ['humanoid', ['human', 'elf', 'orc', 'tiefling', 'dwarf', 'gnome', 'halfling']],
  ];

  private static readonly COLOR_HEX: Readonly<Record<string, string>> = {
    red: '#c0392b', crimson: '#a01818', blue: '#2e6fc0', cyan: '#00b8c4', teal: '#1f8f8f',
    green: '#3a8c4a', black: '#222222', white: '#eeeeee', brown: '#8a6d4a', tan: '#c9a06a',
    gold: '#c8a13a', yellow: '#d6b53a', purple: '#7a3fa0', violet: '#6a3fd0', pink: '#d46aa0',
    orange: '#d2691e', gray: '#888888', grey: '#888888', silver: '#b8bcc0',
  };

  /** Suggest a character from free text — edge-AI when enabled, else local heuristic. */
  async suggest(prompt: string, pack: PartManifest): Promise<CharacterSuggestion> {
    try {
      const res = await fetch('/bff/user/vn-character/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: this.session.credentials,
        body: JSON.stringify({ text: prompt }),
      });
      if (res.ok) {
        return (await res.json()) as CharacterSuggestion;
      }
    } catch {
      /* edge-AI unavailable — fall through to the local heuristic */
    }
    return this.localSuggest(prompt, pack);
  }

  /** Keyword heuristic: infer a head archetype + a primary colour, map to pack parts. */
  private localSuggest(prompt: string, pack: PartManifest): CharacterSuggestion {
    const p = prompt.toLowerCase();

    let head: string | undefined;
    for (const [arch, kws] of CharacterAiService.ARCHETYPE_KEYWORDS) {
      if (kws.some(k => p.includes(k))) {
        head = arch;
        break;
      }
    }

    const slots: Record<string, string | null> = {};
    for (const s of pack.slots) {
      const match = head ? s.parts.find(pt => pt.headArchetype === head) : undefined;
      slots[s.slot] = (match ?? s.parts[0])?.id ?? null;
    }

    const palette: Record<string, string> = {};
    const colorHit = Object.keys(CharacterAiService.COLOR_HEX).find(name => p.includes(name));
    if (colorHit) {
      palette['fur'] = CharacterAiService.COLOR_HEX[colorHit];
    }
    const eyeMatch = p.match(/(\w+)\s+eyes/);
    if (eyeMatch && CharacterAiService.COLOR_HEX[eyeMatch[1]]) {
      palette['iris'] = CharacterAiService.COLOR_HEX[eyeMatch[1]];
    }

    return { slots, palette, headArchetype: head };
  }
}
