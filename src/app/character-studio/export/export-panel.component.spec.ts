import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExportPanelComponent } from './export-panel.component';
import { CharacterStateService } from '../services/character-state.service';
import { SvgRigService } from '../services/svg-rig.service';
import { CharacterBffService, AvatarResult } from '../services/character-bff.service';
import { PartManifest, ExpressionPreset } from '../models/vn-manifest';

/**
 * EXPORT slice — WYSIWYG fidelity + moderated-avatar status mapping.
 *
 * FIDELITY REGRESSION (would-have-caught the shipped HIGH bug): the live preview
 * composes WITH the active expression overrides (studio-canvas binds
 * `[expressionSlots]="state.activeExpressionSlots()"`), but the pre-fix export
 * composed WITHOUT them — so a non-default / previewed expression was visible on
 * screen yet dropped from the downloaded PNG and the uploaded avatar (what you saw
 * was not what you exported). These specs pin that both export paths now compose
 * with the SAME expression slots the preview uses.
 *
 * STATUS MAPPING: the export panel translates each avatar-write outcome from the
 * (off-stack) user-bff into a distinct aria-live message; asserted deterministically
 * here at the client boundary (the e2e @cluster scenarios cover the live round-trip).
 */
describe('ExportPanelComponent — export fidelity + status mapping', () => {
  let fixture: ComponentFixture<ExportPanelComponent>;
  let component: ExportPanelComponent;
  let state: CharacterStateService;
  let rig: SvgRigService;
  let bff: CharacterBffService;

  // A pack whose eyes slot has TWO parts, with an always-active "neutral"
  // expression that pins eyes to the SECOND part — so the preset overrides the
  // base default-eyes pick and activeExpressionSlots() is non-empty. That is the
  // exact condition under which the shipped bug diverged preview from export.
  const pack: PartManifest = {
    packId: 'test-pack',
    version: '1',
    displayName: 'Test',
    canvas: { width: 100, height: 100 },
    expressionSlots: ['eyes'],
    expressions: [{ id: 'neutral', path: 'expressions/neutral.json' }],
    slots: [
      {
        slot: 'body',
        zOrder: 0,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [{ id: 'body_0', displayName: 'Body', file: 'body.svg' }],
      },
      {
        slot: 'eyes',
        zOrder: 10,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'eyes_base', displayName: 'Base eyes', file: 'eyes_base.svg' },
          { id: 'eyes_neutral', displayName: 'Neutral eyes', file: 'eyes_neutral.svg' },
        ],
      },
    ],
  };
  const neutral: ExpressionPreset = { id: 'neutral', slots: { eyes: 'eyes_neutral' } };
  // A tiny valid SVG so the (unmocked) rasterizer can produce a blob when a test
  // needs composePng to succeed all the way to the BFF call.
  const STUB_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExportPanelComponent] }).compileComponents();
    state = TestBed.inject(CharacterStateService);
    rig = TestBed.inject(SvgRigService);
    bff = TestBed.inject(CharacterBffService);
    state.init(pack, undefined, [neutral]);
    fixture = TestBed.createComponent(ExportPanelComponent);
    fixture.componentRef.setInput('pack', pack);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('the always-active neutral preset overrides the base eyes pick (bug precondition)', () => {
    // The default character picks the FIRST eyes part…
    expect(state.character()!.slots['eyes']).toBe('eyes_base');
    // …but the active expression overrides eyes to the neutral-pinned part, so the
    // preview composes with eyes_neutral while the base pick stays eyes_base.
    expect(state.activeExpressionSlots()).toEqual({ eyes: 'eyes_neutral' });
  });

  it('download() composes with the active expression slots (WYSIWYG — would-have-caught)', async () => {
    // Reject after recording so we assert the compose CALL without depending on
    // the rasterizer; the pre-fix code called compose(def, pack) with NO third
    // arg, dropping the on-screen expression layers from the export.
    const composeSpy = spyOn(rig, 'compose').and.rejectWith(new Error('stop-before-raster'));
    await component.download();
    expect(composeSpy).toHaveBeenCalledOnceWith(state.character()!, pack, { eyes: 'eyes_neutral' });
  });

  it('setAsAvatar() composes with the active expression slots (WYSIWYG — would-have-caught)', async () => {
    const composeSpy = spyOn(rig, 'compose').and.rejectWith(new Error('stop-before-raster'));
    await component.setAsAvatar();
    expect(composeSpy).toHaveBeenCalledOnceWith(state.character()!, pack, { eyes: 'eyes_neutral' });
  });

  it('maps a successful avatar write to the success status', async () => {
    spyOn(rig, 'compose').and.resolveTo(STUB_SVG);
    const bffSpy = spyOn(bff, 'exportAvatar').and.resolveTo({ avatarUrl: 'mxc://home/new' } as AvatarResult);
    await component.setAsAvatar();
    expect(bffSpy).toHaveBeenCalledTimes(1);
    expect(component.status()).toBe('Set as your avatar.');
  });

  it('maps a 422 content-policy block to the blocked message', async () => {
    spyOn(rig, 'compose').and.resolveTo(STUB_SVG);
    spyOn(bff, 'exportAvatar').and.rejectWith(new Error('blocked-by-content-policy'));
    await component.setAsAvatar();
    expect(component.status()).toBe('Blocked by content policy — adjust your character and try again.');
  });

  it('maps a 401 to the sign-in message', async () => {
    spyOn(rig, 'compose').and.resolveTo(STUB_SVG);
    spyOn(bff, 'exportAvatar').and.rejectWith(new Error('exportAvatar 401'));
    await component.setAsAvatar();
    expect(component.status()).toBe('Sign in to set your avatar.');
  });

  it('maps an unexpected failure to the generic failure message', async () => {
    spyOn(rig, 'compose').and.resolveTo(STUB_SVG);
    spyOn(bff, 'exportAvatar').and.rejectWith(new Error('exportAvatar 500'));
    await component.setAsAvatar();
    expect(component.status()).toBe('Avatar export failed.');
  });
});
