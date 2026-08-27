import { TestBed } from '@angular/core/testing';
import { CharacterStateService } from './character-state.service';
import { PartManifest } from '../models/vn-manifest';
import { buildDefaultCharacter, clampSlotTransform, isIdentityTransform } from '../models/vn-character';

describe('CharacterStateService rig transforms', () => {
  const pack: PartManifest = {
    packId: 'p', version: '1', displayName: 'P', canvas: { width: 100, height: 100 },
    slots: [
      { slot: 'head', zOrder: 1, required: true, anchor: { x: 0.5, y: 0.5 }, parts: [{ id: 'h', displayName: 'H', file: 'h.svg' }] },
      { slot: 'mouth', zOrder: 2, required: false, anchor: { x: 0.5, y: 0.7 }, parts: [{ id: 'm', displayName: 'M', file: 'm.svg' }] },
    ],
  };
  let state: CharacterStateService;

  beforeEach(() => {
    state = TestBed.inject(CharacterStateService);
    state.init(pack, buildDefaultCharacter(pack), []);
  });

  it('stores a clamped transform and removes identity (sparse)', () => {
    state.setSlotTransform('mouth', { dx: 9999, dy: -3, scale: 0.01, rot: -400 });
    expect(state.slotTransform('mouth')).toEqual({ dx: 256, dy: -3, scale: 0.5, rot: -45 });
    state.setSlotTransform('mouth', { dx: 0, dy: 0, scale: 1, rot: 0 });
    expect(state.slotTransform('mouth')).toBeNull();
    expect(state.character()?.slotTransforms).toBeUndefined();
  });

  it('null and non-finite input never reach the character', () => {
    state.setSlotTransform('head', { dx: Number.NaN, dy: Number.POSITIVE_INFINITY, scale: undefined, rot: 5 });
    expect(state.slotTransform('head')).toEqual({ dx: 0, dy: 0, scale: 1, rot: 5 });
    state.setSlotTransform('head', null);
    expect(state.slotTransform('head')).toBeNull();
  });

  it('applyTransforms merges slot by slot and clearTransforms drops them all', () => {
    state.setSlotTransform('head', { dx: 1, dy: 0, scale: 1, rot: 0 });
    state.applyTransforms({ mouth: { dx: 0, dy: 2, scale: 1, rot: 0 } });
    expect(Object.keys(state.character()?.slotTransforms ?? {}).sort()).toEqual(['head', 'mouth']);
    state.clearTransforms();
    expect(state.character()?.slotTransforms).toBeUndefined();
  });

  it('model helpers agree with the service', () => {
    expect(isIdentityTransform(undefined)).toBeTrue();
    expect(isIdentityTransform({ dx: 0, dy: 0, scale: 1, rot: 0 })).toBeTrue();
    expect(clampSlotTransform(null)).toEqual({ dx: 0, dy: 0, scale: 1, rot: 0 });
  });
});
