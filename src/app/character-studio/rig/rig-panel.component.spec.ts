import { TestBed } from '@angular/core/testing';
import { RigPanelComponent } from './rig-panel.component';
import { CharacterStateService } from '../services/character-state.service';
import { PartGeometryService } from '../services/part-geometry.service';
import { SvgRigService } from '../services/svg-rig.service';
import { PartManifest } from '../models/vn-manifest';
import { buildDefaultCharacter } from '../models/vn-character';
import { FEATURE_TARGETS } from './rig-fit';

describe('RigPanelComponent', () => {
  const pack: PartManifest = {
    packId: 'p', version: '1', displayName: 'P', canvas: { width: 1000, height: 1000 },
    slots: [
      { slot: 'head', zOrder: 1, required: true, anchor: { x: 0.5, y: 0.5 }, parts: [{ id: 'h', displayName: 'H', file: 'h.svg' }] },
      { slot: 'eyes', zOrder: 2, required: false, anchor: { x: 0.5, y: 0.45 }, parts: [{ id: 'e', displayName: 'E', file: 'e.svg' }] },
      { slot: 'tail', zOrder: 0, required: false, anchor: { x: 0.5, y: 0.9 }, parts: [{ id: 't', displayName: 'T', file: 't.svg' }] },
    ],
  };

  function create() {
    const fixture = TestBed.createComponent(RigPanelComponent);
    fixture.componentRef.setInput('pack', pack);
    const state = TestBed.inject(CharacterStateService);
    const def = buildDefaultCharacter(pack);
    def.slots = { head: 'h', eyes: 'e', tail: null };
    state.init(pack, def, []);
    fixture.detectChanges();
    return { fixture, state, el: fixture.nativeElement as HTMLElement };
  }

  it('lists only slots that draw something, in z order', () => {
    const { el } = create();
    const ids = Array.from(el.querySelectorAll('details[data-testid^="cs-rig-"]')).map(d => d.getAttribute('data-testid'));
    expect(ids).toEqual(['cs-rig-head', 'cs-rig-eyes']);
  });

  it('a slider edit lands as a clamped transform; reset removes it', () => {
    const { el, state, fixture } = create();
    const dx = el.querySelector('[data-testid="cs-rig-eyes-dx"]') as HTMLInputElement;
    dx.value = '12';
    dx.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(state.slotTransform('eyes')).toEqual({ dx: 12, dy: 0, scale: 1, rot: 0 });
    expect(el.querySelector('[data-testid="cs-rig-eyes"]')?.classList).toContain('adjusted');
    (el.querySelector('[data-testid="cs-rig-eyes-reset"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(state.slotTransform('eyes')).toBeNull();
  });

  it('"Fit the face" measures head and features and applies the proposed nudges', async () => {
    const { fixture, state } = create();
    spyOn(TestBed.inject(SvgRigService), 'partMarkup').and.resolveTo('<rect/>');
    spyOn(TestBed.inject(PartGeometryService), 'bboxOf').and.callFake((key: string) =>
      Promise.resolve(key.endsWith(':h') ? { x: 250, y: 100, w: 500, h: 600 } : { x: 200, y: 300, w: 100, h: 50 }));
    const n = await fixture.componentInstance.fitFace();
    expect(n).toBe(1);
    const eyes = state.slotTransform('eyes')!;
    expect(eyes.dx).toBe(500 - 250);                                  // head centre 500, eyes centre 250
    expect(eyes.dy).toBe(100 + 600 * FEATURE_TARGETS['eyes'] - 325);
  });
});
