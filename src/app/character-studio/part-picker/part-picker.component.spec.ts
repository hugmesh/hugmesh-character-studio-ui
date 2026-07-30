import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PartPickerComponent } from './part-picker.component';
import { CharacterStateService } from '../services/character-state.service';
import { PartManifest } from '../models/vn-manifest';
import { buildDefaultCharacter } from '../models/vn-character';

/**
 * PART-PICKER slice: the head-archetype compatibility filter and the HYBRID
 * MODE toggle that bypasses it (any part mixable onto any species).
 */
describe('PartPickerComponent', () => {
  /** Canid head chosen by default; whiskers fit felids only, collar fits any. */
  const pack: PartManifest = {
    packId: 'test-pack-v1',
    version: '1',
    displayName: 'Test Pack',
    canvas: { width: 10, height: 10 },
    slots: [
      {
        slot: 'head',
        zOrder: 60,
        required: true,
        anchor: { x: 0.5, y: 0.5 },
        parts: [
          { id: 'head-canid', displayName: 'Canid head', file: 'h1.svg', headArchetype: 'canid' },
          { id: 'head-felid', displayName: 'Felid head', file: 'h2.svg', headArchetype: 'felid' },
        ],
      },
      {
        slot: 'feature',
        zOrder: 80,
        required: false,
        anchor: { x: 0.5, y: 0.5 },
        parts: [
          { id: 'whiskers', displayName: 'Whiskers', file: 'f1.svg', compatibleHeads: ['felid'] },
          { id: 'collar', displayName: 'Collar', file: 'f2.svg', compatibleHeads: ['*'] },
        ],
      },
    ],
  };

  const create = () => {
    const fixture = TestBed.createComponent(PartPickerComponent);
    fixture.componentRef.setInput('pack', pack);
    TestBed.inject(CharacterStateService).init(pack, buildDefaultCharacter(pack), []);
    fixture.detectChanges();
    return fixture;
  };

  it('filters incompatible parts by the active head archetype', () => {
    const fixture = create();
    const featureSlot = fixture.componentInstance.slots().find(s => s.slot === 'feature')!;
    const offered = fixture.componentInstance.partsFor(featureSlot).map(p => p.id);
    // canid head is the default → felid-only whiskers hidden, universal collar shown
    expect(offered).toEqual(['collar']);
  });

  it('hybrid mode offers every part regardless of compatibility', () => {
    const fixture = create();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="cs-hybrid-toggle"]');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    const featureSlot = fixture.componentInstance.slots().find(s => s.slot === 'feature')!;
    expect(fixture.componentInstance.partsFor(featureSlot).map(p => p.id)).toEqual(['whiskers', 'collar']);

    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.partsFor(featureSlot).map(p => p.id)).toEqual(['collar']);
  });

  // ── per-slot text filter (large-slot hardening) ─────────────────────────

  /** 10-part head slot (≥ FILTER_MIN_PARTS ⇒ filter shown); 2-part eyes slot (no filter). */
  const bigPack: PartManifest = {
    packId: 'big-pack-v1',
    version: '1',
    displayName: 'Big Pack',
    canvas: { width: 10, height: 10 },
    slots: [
      {
        slot: 'head',
        zOrder: 60,
        required: true,
        anchor: { x: 0.5, y: 0.5 },
        parts: [
          ...Array.from({ length: 9 }, (_, n) => ({
            id: `head-wolf-${n}`,
            displayName: `Wolf ${n}`,
            file: `w${n}.svg`,
          })),
          { id: 'head-dragon', displayName: 'Dragon', file: 'd.svg' },
        ],
      },
      {
        slot: 'eyes',
        zOrder: 100,
        required: true,
        anchor: { x: 0.5, y: 0.5 },
        parts: [
          { id: 'eyes-a', displayName: 'Eyes A', file: 'ea.svg' },
          { id: 'eyes-b', displayName: 'Eyes B', file: 'eb.svg' },
        ],
      },
    ],
  };

  const createBig = () => {
    const fixture = TestBed.createComponent(PartPickerComponent);
    fixture.componentRef.setInput('pack', bigPack);
    TestBed.inject(CharacterStateService).init(bigPack, buildDefaultCharacter(bigPack), []);
    fixture.detectChanges();
    return fixture;
  };

  const typeFilter = (fixture: ReturnType<typeof createBig>, slot: string, value: string) => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      `[data-testid="cs-part-filter-${slot}"]`,
    );
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('renders a filter input only for slots at/above the size threshold', () => {
    const fixture = createBig();
    expect(fixture.nativeElement.querySelector('[data-testid="cs-part-filter-head"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="cs-part-filter-eyes"]')).toBeNull();
  });

  it('filters parts by displayName/id after the debounce, with a live result count', fakeAsync(() => {
    const fixture = createBig();
    typeFilter(fixture, 'head', 'dragon');
    // Before the debounce elapses nothing is filtered yet.
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-testid^="cs-part-pick-head-"]').length).toBe(10);
    tick(150);
    fixture.detectChanges();
    const shown = fixture.nativeElement.querySelectorAll('[data-testid^="cs-part-pick-head-"]');
    expect(shown.length).toBe(1);
    expect(shown[0].getAttribute('data-testid')).toBe('cs-part-pick-head-head-dragon');
    expect(
      fixture.nativeElement.querySelector('[data-testid="cs-part-filter-count-head"]').textContent,
    ).toContain('1 of 10');
  }));

  it('clamps the filter query at the input boundary and resets it on pack switch', fakeAsync(() => {
    const fixture = createBig();
    typeFilter(fixture, 'head', 'x'.repeat(200));
    tick(150);
    expect(fixture.componentInstance.filterOf('head').length).toBe(48);

    fixture.componentRef.setInput('pack', pack);
    fixture.detectChanges();
    expect(fixture.componentInstance.filterOf('head')).toBe('');
  }));
});
