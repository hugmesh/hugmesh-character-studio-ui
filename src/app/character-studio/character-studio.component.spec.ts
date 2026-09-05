import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { AUTOSAVE_DEBOUNCE_MS, CharacterStudioComponent } from './character-studio.component';
import { AssetManifestService } from './services/asset-manifest.service';
import { CharacterBffService } from './services/character-bff.service';
import { CharacterStateService } from './services/character-state.service';
import { SvgRigService } from './services/svg-rig.service';
import { PartManifest } from './models/vn-manifest';
import { VnCharacter } from './models/vn-character';

/**
 * PERSISTENCE WIRING (issue #1 — would-have-caught): `CharacterBffService.
 * saveDefinition`/`.loadActive` were fully implemented but nothing called them,
 * so `ngOnInit` always seeded the pack default (`init(pack, undefined, …)`) and
 * no in-progress edit ever reached the user-bff. These specs pin the round trip
 * at the component boundary:
 *
 *  - init restores a previously-saved definition (including reopening the
 *    pack the save belongs to) and falls back to the default when there is no
 *    save or the bff is unreachable — WITHOUT phantom-saving what it just
 *    loaded/seeded;
 *  - edits are debounce-autosaved (a burst collapses into one PUT), a failed
 *    PUT is reported and retried on the next edit, and a pending save is
 *    flushed on destroy (the navigate-away case the issue describes);
 *  - BROWSING another pack in the picker writes NOTHING, is reversible in the
 *    session, and only an explicit "keep this one" moves the save to it. The
 *    first cut of this wiring PUT the browsed pack's default character, which
 *    destroyed the saved one on a single picker click — the specs at the foot
 *    of this file pin that it cannot come back.
 *
 * The BFF and asset services are spied at their promise boundary — the e2e
 * @cluster scenarios own the live HTTP round trip.
 */
describe('CharacterStudioComponent — character persistence wiring', () => {
  let fixture: ComponentFixture<CharacterStudioComponent>;
  let assets: AssetManifestService;
  let bff: CharacterBffService;
  let state: CharacterStateService;
  let loadActiveSpy: jasmine.Spy;
  let loadPackSpy: jasmine.Spy;
  let saveSpy: jasmine.Spy;

  const packA: PartManifest = {
    packId: 'pack-a',
    version: '1',
    displayName: 'Pack A',
    canvas: { width: 100, height: 100 },
    slots: [
      {
        slot: 'body',
        zOrder: 0,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'body_0', displayName: 'Body 0', file: 'body0.svg' },
          { id: 'body_1', displayName: 'Body 1', file: 'body1.svg' },
        ],
      },
    ],
  };

  const packB: PartManifest = {
    packId: 'pack-b',
    version: '1',
    displayName: 'Pack B',
    canvas: { width: 100, height: 100 },
    slots: [
      {
        slot: 'body',
        zOrder: 0,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [{ id: 'bodyb_0', displayName: 'B body', file: 'bodyb0.svg' }],
      },
    ],
  };

  /** A saved definition for packA that differs from packA's default (body_0). */
  const savedA: VnCharacter = {
    schemaVersion: 1,
    packId: 'pack-a',
    name: 'Saved',
    slots: { body: 'body_1' },
    palette: { fur: '#123456' },
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    defaultExpression: 'neutral',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CharacterStudioComponent] }).compileComponents();
    assets = TestBed.inject(AssetManifestService);
    bff = TestBed.inject(CharacterBffService);
    state = TestBed.inject(CharacterStateService);
    const rig = TestBed.inject(SvgRigService);
    // Keep the (fully rendered) canvas/rig children off the network.
    spyOn(rig, 'composeDataUrl').and.resolveTo('data:image/svg+xml,');
    spyOn(rig, 'partMarkup').and.resolveTo('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    spyOn(assets, 'loadActivePack').and.resolveTo(packA);
    // Dispatch by id: the browse specs switch away AND back, so 'pack-a'
  // must resolve to packA rather than to whatever the last switch loaded.
  loadPackSpy = spyOn(assets, 'loadPack').and.callFake((packId: string) =>
    Promise.resolve(packId === 'pack-a' ? packA : packB));
    spyOn(assets, 'loadExpressions').and.resolveTo([]);
    loadActiveSpy = spyOn(bff, 'loadActive').and.resolveTo(null);
    saveSpy = spyOn(bff, 'saveDefinition').and.resolveTo();
  });

  /** Create the component and settle the async init chain (inside fakeAsync). */
  function create(): CharacterStudioComponent {
    fixture = TestBed.createComponent(CharacterStudioComponent);
    fixture.detectChanges(); // kicks off ngOnInit
    flushMicrotasks(); // settle loadActivePack → loadActive → loadExpressions
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Pick another pack in the header, settling the load chain AND the debounce
   *  window after it — so "did the browse write?" is answered, not just deferred. */
  function switchPack(component: CharacterStudioComponent, packId: string): void {
    void component.onPackChange(packId);
    flushMicrotasks(); // loadPack → loadExpressions
    fixture.detectChanges(); // run the autosave effect over the re-seeded state
    tick(AUTOSAVE_DEBOUNCE_MS * 2);
    flushMicrotasks();
    fixture.detectChanges();
  }

  /** One state edit, then run the debounce out and settle the PUT. */
  function editAndSettle(edit: () => void): void {
    edit();
    fixture.detectChanges(); // flush the autosave effect (arms the timer)
    tick(AUTOSAVE_DEBOUNCE_MS);
    flushMicrotasks();
  }

  it('seeds the pack default when no save exists — and does NOT phantom-save it', fakeAsync(() => {
    create();
    expect(loadActiveSpy).toHaveBeenCalledTimes(1);
    expect(state.character()!.slots['body']).toBe('body_0');
    tick(AUTOSAVE_DEBOUNCE_MS * 2);
    flushMicrotasks();
    expect(saveSpy).not.toHaveBeenCalled();
  }));

  it('restores the saved definition into the state on init (would-have-caught: init passed undefined)', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    expect(state.character()).toEqual(savedA);
    expect(component.status()).toContain('Restored your saved character');
    // What was loaded is already persisted — restoring must not re-PUT it.
    tick(AUTOSAVE_DEBOUNCE_MS * 2);
    flushMicrotasks();
    expect(saveSpy).not.toHaveBeenCalled();
  }));

  it('reopens the pack the saved definition belongs to when it is not the default pack', fakeAsync(() => {
    const savedB: VnCharacter = { ...savedA, packId: 'pack-b', slots: { body: 'bodyb_0' } };
    loadActiveSpy.and.resolveTo(savedB);
    const component = create();
    expect(loadPackSpy).toHaveBeenCalledOnceWith('pack-b');
    expect(component.pack()!.packId).toBe('pack-b');
    expect(state.character()).toEqual(savedB);
  }));

  it('falls back to the default character when the saved pack cannot be loaded', fakeAsync(() => {
    loadActiveSpy.and.resolveTo({ ...savedA, packId: 'gone-pack' });
    loadPackSpy.and.rejectWith(new Error('pack.json 404'));
    const component = create();
    expect(component.pack()!.packId).toBe('pack-a');
    expect(state.character()!.slots['body']).toBe('body_0');
  }));

  it('still opens the studio (default character) when loadActive rejects — signed-out/standalone case', fakeAsync(() => {
    loadActiveSpy.and.rejectWith(new Error('loadActive 401'));
    const component = create();
    expect(component.pack()!.packId).toBe('pack-a');
    expect(state.character()!.slots['body']).toBe('body_0');
    expect(component.status()).toContain('Loaded 1 slot(s)');
  }));

  it('autosaves an edit after the debounce, collapsing a burst into ONE PUT of the latest definition', fakeAsync(() => {
    const component = create();
    state.setSlot('body', 'body_1');
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS / 2); // mid-debounce…
    state.setPalette('fur', '#ff0000'); // …another edit resets the timer
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS / 2);
    expect(saveSpy).not.toHaveBeenCalled(); // still within the re-armed debounce
    tick(AUTOSAVE_DEBOUNCE_MS / 2);
    flushMicrotasks();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const putDef = saveSpy.calls.mostRecent().args[0] as VnCharacter;
    expect(putDef.slots['body']).toBe('body_1'); // the accumulated burst…
    expect(putDef.palette['fur']).toBe('#ff0000'); // …not just the first edit
    expect(component.saveState()).toBe('saved');
    fixture.detectChanges();
    const indicator = fixture.nativeElement.querySelector('[data-testid="cs-autosave"]') as HTMLElement;
    expect(indicator.textContent).toContain('Saved.');
  }));

  it('does not PUT a net-zero burst (edits that end back at the persisted definition)', fakeAsync(() => {
    create();
    state.setSlot('body', 'body_1');
    fixture.detectChanges();
    state.setSlot('body', 'body_0'); // back to what is already persisted
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS * 2);
    flushMicrotasks();
    expect(saveSpy).not.toHaveBeenCalled();
  }));

  it('does not re-PUT when the definition is unchanged (same value re-picked)', fakeAsync(() => {
    create();
    editAndSettle(() => state.setSlot('body', 'body_1'));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    editAndSettle(() => state.setSlot('body', 'body_1')); // new object, identical content
    expect(saveSpy).toHaveBeenCalledTimes(1);
  }));

  it('reports a failed autosave honestly and retries on the next edit', fakeAsync(() => {
    saveSpy.and.rejectWith(new Error('saveDefinition 500'));
    const component = create();
    editAndSettle(() => state.setSlot('body', 'body_1'));
    expect(component.saveState()).toBe('error');
    fixture.detectChanges();
    const indicator = fixture.nativeElement.querySelector('[data-testid="cs-autosave"]') as HTMLElement;
    expect(indicator.textContent).toContain('Autosave failed');
    // The next edit retries (lastPersisted stayed stale, so the state is dirty).
    saveSpy.and.resolveTo();
    editAndSettle(() => state.setPalette('fur', '#00ff00'));
    expect(saveSpy).toHaveBeenCalledTimes(2);
    const putDef = saveSpy.calls.mostRecent().args[0] as VnCharacter;
    expect(putDef.slots['body']).toBe('body_1'); // the failed edit rides along
    expect(component.saveState()).toBe('saved');
  }));

  it('flushes a pending debounced save on destroy (navigate away right after an edit)', fakeAsync(() => {
    create();
    state.setSlot('body', 'body_1');
    fixture.detectChanges(); // arms the debounce timer…
    fixture.destroy(); // …and navigation-away lands before it fires
    flushMicrotasks();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((saveSpy.calls.mostRecent().args[0] as VnCharacter).slots['body']).toBe('body_1');
  }));

  // ── browsing another pack must not destroy the save (regression, PR #20) ────
  // The pack picker is the ONLY way to LOOK at another art set. Before this
  // fix, `onPackChange` re-seeded the pack default and the autosave effect PUT
  // it 800 ms later: one click on the picker silently replaced the saved
  // character with `name:"Untitled"` + that pack's default slots, and switching
  // back could not restore it (the studio held no prior copy). These specs pin
  // the three properties that make a browse a browse: it writes nothing, it is
  // reversible in-session, and adopting the browsed character is EXPLICIT.

  it('does NOT overwrite the saved character when the picker merely browses another pack', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    switchPack(component, 'pack-b');
    expect(component.pack()!.packId).toBe('pack-b'); // the look happened…
    expect(saveSpy).not.toHaveBeenCalled(); // …and cost nothing
  }));

  it('keeps edits made while browsing off the wire (the save still belongs to the other pack)', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    switchPack(component, 'pack-b');
    editAndSettle(() => state.setPalette('fur', '#ff0000'));
    expect(saveSpy).not.toHaveBeenCalled();
  }));

  it('restores the saved character when the browse switches back', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    switchPack(component, 'pack-b');
    switchPack(component, 'pack-a');
    expect(component.pack()!.packId).toBe('pack-a');
    expect(state.character()).toEqual(savedA); // not the pack default
    expect(saveSpy).not.toHaveBeenCalled();
  }));

  it('restores an in-session browse draft when returning to the browsed pack', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    switchPack(component, 'pack-b');
    state.setPalette('fur', '#ff0000');
    fixture.detectChanges();
    switchPack(component, 'pack-a');
    switchPack(component, 'pack-b');
    expect(state.character()!.palette['fur']).toBe('#ff0000'); // the look is kept
    expect(saveSpy).not.toHaveBeenCalled();
  }));

  it('says so in the header while browsing, and stops saying it back on the saved pack', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    expect(fixture.nativeElement.querySelector('[data-testid="cs-browsing"]')).toBeNull();
    switchPack(component, 'pack-b');
    const notice = fixture.nativeElement.querySelector('[data-testid="cs-browsing"]') as HTMLElement;
    expect(notice).not.toBeNull();
    expect(notice.textContent).toContain('pack-a'); // names where the save lives
    switchPack(component, 'pack-a');
    expect(fixture.nativeElement.querySelector('[data-testid="cs-browsing"]')).toBeNull();
  }));

  it('persists the browsed pack ONLY after the explicit "keep this one" action', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    switchPack(component, 'pack-b');
    state.setPalette('fur', '#00ff00');
    fixture.detectChanges();
    expect(saveSpy).not.toHaveBeenCalled();

    (fixture.nativeElement.querySelector('[data-testid="cs-keep-here"]') as HTMLButtonElement).click();
    flushMicrotasks();
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS);
    flushMicrotasks();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const put = saveSpy.calls.mostRecent().args[0] as VnCharacter;
    expect(put.packId).toBe('pack-b');
    expect(put.palette['fur']).toBe('#00ff00');
    expect(component.saveState()).toBe('saved');

    // The browse is over: this pack now owns the save, so edits autosave again.
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="cs-browsing"]')).toBeNull();
    editAndSettle(() => state.setPalette('fur', '#0000ff'));
    expect(saveSpy).toHaveBeenCalledTimes(2);
  }));

  it('lands a pending edit as the pack it was made in when the switch beats the debounce', fakeAsync(() => {
    loadActiveSpy.and.resolveTo(savedA);
    const component = create();
    state.setPalette('fur', '#ff0000'); // arms the debounce on pack-a…
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS / 2); // …and the switch beats it
    switchPack(component, 'pack-b');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const put = saveSpy.calls.mostRecent().args[0] as VnCharacter;
    expect(put.packId).toBe('pack-a'); // the edit's own pack, never pack-b's default
    expect(put.palette['fur']).toBe('#ff0000');
    editAndSettle(() => state.setPalette('fur', '#00ff00')); // browsing still writes nothing
    expect(saveSpy).toHaveBeenCalledTimes(1);
  }));

  it('writes nothing for a pack switch when there is no save yet — but a later edit saves in the new pack', fakeAsync(() => {
    const component = create(); // loadActive -> null
    switchPack(component, 'pack-b');
    expect(saveSpy).not.toHaveBeenCalled(); // the re-seeded default is not an edit
    editAndSettle(() => state.setPalette('fur', '#ff0000'));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const put = saveSpy.calls.mostRecent().args[0] as VnCharacter;
    expect(put.packId).toBe('pack-b');
    expect(put.palette['fur']).toBe('#ff0000');
    // That first save claims the slot: browsing on from here is gated as well.
    switchPack(component, 'pack-a');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('[data-testid="cs-browsing"]')).not.toBeNull();
  }));
});
