import { CURATED_COLORS, randomizeCharacter } from './randomize';
import { PartManifest } from '../models/vn-manifest';

/**
 * RANDOMIZER slice: {@link randomizeCharacter} must always fill REQUIRED slots,
 * respect the picker's head-archetype compatibility model (body/head first,
 * `compatibleHeads` everywhere else), and seed every tint region on the chosen
 * parts from {@link CURATED_COLORS}. The rng is injected, so every case here is
 * fully deterministic (seeded LCG or a constant).
 */
describe('randomizeCharacter', () => {
  /** Deterministic LCG in [0, 1) — same seed, same character. */
  const seededRng = (seed: number): (() => number) => {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  const tint = (region: string) => ({ region, svgClass: `region-${region}`, defaultPalette: '#000000' });

  /** Two archetypes (canid/felid); whiskers fit felids only, collar fits any. */
  const pack: PartManifest = {
    packId: 'test-pack-v1',
    version: '1',
    displayName: 'Test Pack',
    canvas: { width: 10, height: 10 },
    slots: [
      {
        slot: 'body',
        zOrder: 10,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'body-canid', displayName: 'Canid body', file: 'b1.svg', headArchetype: 'canid', tintRegions: [tint('fur'), tint('belly')] },
          { id: 'body-felid', displayName: 'Felid body', file: 'b2.svg', headArchetype: 'felid', tintRegions: [tint('fur'), tint('belly')] },
        ],
      },
      {
        slot: 'head',
        zOrder: 20,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'head-canid', displayName: 'Canid head', file: 'h1.svg', headArchetype: 'canid', tintRegions: [tint('fur')] },
          { id: 'head-felid', displayName: 'Felid head', file: 'h2.svg', headArchetype: 'felid', tintRegions: [tint('fur')] },
        ],
      },
      {
        slot: 'eyes',
        zOrder: 30,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'eyes-any', displayName: 'Any eyes', file: 'e1.svg', compatibleHeads: ['*'], tintRegions: [tint('iris')] },
          { id: 'eyes-plain', displayName: 'Plain eyes', file: 'e2.svg', tintRegions: [tint('iris')] },
          { id: 'eyes-canid', displayName: 'Canid eyes', file: 'e3.svg', compatibleHeads: ['canid'], tintRegions: [tint('iris')] },
        ],
      },
      {
        slot: 'collar',
        zOrder: 40,
        required: false,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'collar-any', displayName: 'Collar', file: 'c1.svg', compatibleHeads: ['*'], tintRegions: [tint('accent')] },
        ],
      },
      {
        slot: 'whiskers',
        zOrder: 50,
        required: false,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'whiskers-felid', displayName: 'Whiskers', file: 'w1.svg', compatibleHeads: ['felid'], tintRegions: [tint('line')] },
        ],
      },
    ],
  };

  const partById = (id: string) => {
    for (const s of pack.slots) {
      const p = s.parts.find(part => part.id === id);
      if (p) {
        return p;
      }
    }
    throw new Error(`unknown part ${id}`);
  };

  it('curates only valid #rrggbb colours (no dupes)', () => {
    expect(CURATED_COLORS.length).toBeGreaterThan(10);
    for (const hex of CURATED_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(CURATED_COLORS).size).toBe(CURATED_COLORS.length);
  });

  it('fills EVERY required slot with a part from that slot, across many seeds', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = randomizeCharacter(pack, seededRng(seed));
      for (const slot of pack.slots.filter(s => s.required)) {
        const chosen = c.slots[slot.slot];
        expect(chosen).withContext(`seed ${seed}, slot ${slot.slot}`).not.toBeNull();
        expect(slot.parts.some(p => p.id === chosen))
          .withContext(`seed ${seed}, slot ${slot.slot} got ${chosen}`)
          .toBeTrue();
      }
    }
  });

  it('respects head-archetype compatibility exactly like the part picker', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = randomizeCharacter(pack, seededRng(seed));
      // The established archetype: first chosen part carrying headArchetype
      // (pack.slots order) — the same scan PartPickerComponent.activeHead does.
      let head: string | null = null;
      for (const s of pack.slots) {
        const p = s.parts.find(part => part.id === c.slots[s.slot]);
        if (p?.headArchetype) {
          head = p.headArchetype;
          break;
        }
      }
      expect(head).withContext(`seed ${seed}`).not.toBeNull();
      for (const [slot, chosen] of Object.entries(c.slots)) {
        if (!chosen) {
          continue;
        }
        const p = partById(chosen);
        // body/head stay ONE archetype; features must admit it ('*' or absent = any).
        if (p.headArchetype) {
          expect(p.headArchetype).withContext(`seed ${seed}, slot ${slot}`).toBe(head!);
        } else if (p.compatibleHeads) {
          expect(p.compatibleHeads.includes('*') || p.compatibleHeads.includes(head!))
            .withContext(`seed ${seed}, slot ${slot} got ${chosen} for head ${head}`)
            .toBeTrue();
        }
      }
      // A canid never gets the felid-only whiskers.
      if (head === 'canid') {
        expect(c.slots['whiskers']).withContext(`seed ${seed}`).toBeNull();
      }
    }
  });

  it('seeds every tint region on the chosen parts (and only those) from the curated list', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = randomizeCharacter(pack, seededRng(seed));
      const expected = new Set<string>();
      for (const chosen of Object.values(c.slots)) {
        if (!chosen) {
          continue;
        }
        for (const tr of partById(chosen).tintRegions ?? []) {
          expected.add(tr.region);
        }
      }
      expect(new Set(Object.keys(c.palette))).withContext(`seed ${seed}`).toEqual(expected);
      for (const [region, hex] of Object.entries(c.palette)) {
        expect(hex).withContext(`seed ${seed}, region ${region}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(CURATED_COLORS).withContext(`seed ${seed}, region ${region}`).toContain(hex);
      }
    }
  });

  it('includes optional slots when rng is under the ~60% threshold, skips them when over', () => {
    // rng ≡ 0 → include optionals, always pick the first eligible part/colour.
    const low = randomizeCharacter(pack, () => 0);
    expect(low.slots).toEqual({
      body: 'body-canid',
      head: 'head-canid',
      eyes: 'eyes-any',
      collar: 'collar-any',
      whiskers: null, // include rolled, but no felid part fits a canid — stays empty
    });
    for (const hex of Object.values(low.palette)) {
      expect(hex).toBe(CURATED_COLORS[0]);
    }

    // rng ≡ 0.99 → optionals skipped (0.99 > 0.6), required still filled.
    const high = randomizeCharacter(pack, () => 0.99);
    expect(high.slots['collar']).toBeNull();
    expect(high.slots['whiskers']).toBeNull();
    expect(high.slots['body']).toBe('body-felid');
    expect(high.slots['head']).toBe('head-felid');
    expect(high.slots['eyes']).not.toBeNull();
  });

  it('falls back to an UNFILTERED pick when a required slot has zero compatible parts', () => {
    // A pack whose required "saddle" slot fits ONLY equines while the sole body
    // is canid: the archetype filter leaves zero candidates, and the guard must
    // fall back to picking from ALL of the slot's parts (never an empty
    // required slot, never an infinite retry).
    const hostile: PartManifest = {
      packId: 'hostile-pack-v1',
      version: '1',
      displayName: 'Hostile Pack',
      canvas: { width: 10, height: 10 },
      slots: [
        {
          slot: 'body',
          zOrder: 10,
          required: true,
          anchor: { x: 0, y: 0 },
          parts: [{ id: 'body-canid', displayName: 'Canid body', file: 'b.svg', headArchetype: 'canid' }],
        },
        {
          slot: 'saddle',
          zOrder: 20,
          required: true,
          anchor: { x: 0, y: 0 },
          parts: [{ id: 'saddle-equine', displayName: 'Saddle', file: 's.svg', compatibleHeads: ['equine'] }],
        },
      ],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const c = randomizeCharacter(hostile, seededRng(seed));
      expect(c.slots['body']).withContext(`seed ${seed}`).toBe('body-canid');
      expect(c.slots['saddle']).withContext(`seed ${seed}`).toBe('saddle-equine');
    }
  });

  it('returns a well-formed character for the pack', () => {
    const c = randomizeCharacter(pack, seededRng(7));
    expect(c.schemaVersion).toBe(1);
    expect(c.packId).toBe('test-pack-v1');
    expect(c.defaultExpression).toBe('neutral');
    expect(c.transform).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
