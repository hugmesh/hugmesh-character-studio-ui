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
 *    destroyed the saved one on a single picker click — the specs mid-file pin
 *    that it cannot come back;
 *  - autosave PUTs never OVERLAP. Two writes in flight at once could answer in
 *    either order, and the older one answering last made the studio believe an
 *    older definition was stored than the one the bff held — which silently
 *    swallowed the user's next undo. The specs at the foot of this file hold
 *    the writes open and answer them newest-first to pin that.
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

  /** A saved definition living in the OTHER pack (packB), for the cross-pack paths. */
  const savedB: VnCharacter = {
    schemaVersion: 1,
    packId: 'pack-b',
    name: 'Saved elsewhere',
    slots: { body: 'bodyb_0' },
    palette: { fur: '#654321' },
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

  // ── the STALL case (not the same as a failure) ────────────────────────────
  // A GET that REJECTS is covered by the spec above. A GET that never settles —
  // a gateway holding the socket open without answering, a wedged r2dbc pool
  // upstream — is not an error, so the `catch` never runs. Before the fix the
  // studio's `pack` signal was only written AFTER that await, and the whole UI
  // is gated on `@if (pack(); as p)`, so the studio stayed on
  // "Loading character assets…" forever with no recovery (the pack picker that
  // could re-seed it lives inside the very gate that never opened).

  it('opens the studio on the pack default when the restore GET never settles (stall, not failure)', fakeAsync(() => {
    loadActiveSpy.and.returnValue(new Promise<VnCharacter | null>(() => {})); // never settles
    const component = create();
    tick(60_000); // …and it is STILL outstanding a minute later
    fixture.detectChanges();
    expect(component.pack()!.packId).toBe('pack-a');
    expect(state.character()!.slots['body']).toBe('body_0');
    expect(component.status()).toContain('Loaded 1 slot(s)');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="cs-studio-header"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="cs-studio"]')).not.toBeNull();
  }));

  it('keeps the autosave armed while a stalled restore GET is still in flight', fakeAsync(() => {
    loadActiveSpy.and.returnValue(new Promise<VnCharacter | null>(() => {}));
    const component = create();
    editAndSettle(() => state.setSlot('body', 'body_1'));
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((saveSpy.calls.mostRecent().args[0] as VnCharacter).slots['body']).toBe('body_1');
    expect(component.saveState()).toBe('saved');
  }));

  it('does not clobber edits made while a slow restore GET was still in flight', fakeAsync(() => {
    let land!: (v: VnCharacter | null) => void;
    loadActiveSpy.and.returnValue(new Promise<VnCharacter | null>(res => (land = res)));
    create();
    state.setPalette('fur', '#00ff00'); // the user starts editing the seeded default…
    fixture.detectChanges();
    land(savedA); // …and only then does the saved definition arrive (fur #123456)
    flushMicrotasks();
    fixture.detectChanges();
    expect(state.character()!.palette['fur']).toBe('#00ff00'); // live edit survives
    expect(state.character()!.name).toBe('Untitled'); // …not overwritten by the save
    tick(AUTOSAVE_DEBOUNCE_MS);
    flushMicrotasks();
    expect(saveSpy).toHaveBeenCalledTimes(1); // …and is what gets persisted
    expect((saveSpy.calls.mostRecent().args[0] as VnCharacter).palette['fur']).toBe('#00ff00');
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

  it('lets live edits save in their OWN pack when the late restore belongs to another pack', fakeAsync(() => {
    // The stall-tolerant init (#21) seeds pack-a and arms the autosave before the
    // GET lands. If the arriving save's pack were taken as the one that "owns"
    // the slot, browsingOtherPack() would be true for the pack on screen and the
    // gate added here would swallow the user's live edit — the same silent loss
    // this panel exists to close, arriving from the other direction.
    let land!: (v: VnCharacter | null) => void;
    loadActiveSpy.and.returnValue(new Promise<VnCharacter | null>(res => (land = res)));
    const component = create();
    state.setPalette('fur', '#00ff00'); // the user edits pack-a's seeded default…
    fixture.detectChanges();
    land(savedB); // …and the save that finally arrives lives in pack-b
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.pack()!.packId).toBe('pack-a'); // the live edit keeps the screen
    expect(fixture.nativeElement.querySelector('[data-testid="cs-browsing"]')).toBeNull();
    tick(AUTOSAVE_DEBOUNCE_MS);
    flushMicrotasks();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const put = saveSpy.calls.mostRecent().args[0] as VnCharacter;
    expect(put.packId).toBe('pack-a');
    expect(put.palette['fur']).toBe('#00ff00');
  }));

  // ── overlapping autosave PUTs (regression, panel finding on merged PR #20) ──
  // `saveNow` awaited its PUT and only then wrote `lastPersisted` — from the
  // definition it had captured when it ISSUED that PUT. Nothing stopped a second
  // save starting while the first was still on the wire (the debounce only
  // spaces out when saves are STARTED; it says nothing about when they finish,
  // and a save slower than 800 ms is ordinary on a mesh link). Two writes in
  // flight are two writes racing to be the one that records `lastPersisted`
  // LAST, and completion order is not issue order.
  //
  // When the OLDER write answered last it left `lastPersisted` holding the OLDER
  // definition while the bff held the newer one. The studio then believed the
  // bff held text it did not hold, so the user's very next edit BACK to that
  // older definition — an undo — matched the dirty check and was dropped without
  // a write: gone permanently, with the indicator still reading "Saved."
  //
  // These two specs pin the fix from both sides: at most one PUT on the wire,
  // and — landing whatever IS open newest-first, the completion order that
  // produced the bug — a following undo still reaches the bff.

  interface PendingPut {
    def: VnCharacter;
    /** Answer this PUT (resolve the promise `saveDefinition` returned). */
    settle: () => void;
  }

  /** Make every autosave PUT hang until the spec answers it, and collect them
   *  in issue order. */
  function deferSaves(): PendingPut[] {
    const pending: PendingPut[] = [];
    saveSpy.and.callFake(
      (def: VnCharacter) => new Promise<void>(resolve => pending.push({ def, settle: resolve })));
    return pending;
  }

  /** Answer every PUT that is currently open, NEWEST FIRST — the out-of-order
   *  completion the bug turned on — and keep going while the component issues
   *  more (serialized writes arrive one at a time, so this drains the chain). */
  function landOpenWritesNewestFirst(pending: PendingPut[]): void {
    for (let pass = 0; pending.length > 0 && pass < 10; pass++) {
      for (const put of pending.splice(0).reverse()) {
        put.settle();
      }
      flushMicrotasks();
    }
  }

  /** The colour of each definition the bff was asked to store, in issue order. */
  function savedColours(): (string | undefined)[] {
    return saveSpy.calls.all().map(c => (c.args[0] as VnCharacter).palette['fur']);
  }

  it('never puts two autosave writes on the wire at once', fakeAsync(() => {
    const pending = deferSaves();
    create();

    state.setPalette('fur', '#ff0000'); // first edit…
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS); // …its PUT goes out, and the bff does not answer
    expect(pending.length).toBe(1);

    state.setPalette('fur', '#00ff00'); // a second edit, while that PUT is open
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS);
    flushMicrotasks();
    expect(pending.length).toBe(1); // coalesced behind the open write, not raced

    pending[0].settle(); // the first write finally answers…
    flushMicrotasks();
    expect(pending.length).toBe(2); // …and only THEN does the second go out
    expect(pending[1].def.palette['fur']).toBe('#00ff00'); // with the newest edit

    pending[1].settle();
    flushMicrotasks();
    expect(saveSpy).toHaveBeenCalledTimes(2); // no third, redundant write
  }));

  it('keeps the NEWEST definition persisted when overlapping PUTs answer out of order, so the undo after them still writes', fakeAsync(() => {
    const pending = deferSaves();
    const component = create();

    state.setPalette('fur', '#ff0000'); // edit A → PUT, unanswered
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS);
    state.setPalette('fur', '#00ff00'); // edit B, while A is still on the wire
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS);
    flushMicrotasks();

    // Answer newest-first. On the old code both PUTs were open, so A landed LAST
    // and left the studio believing '#ff0000' was stored.
    landOpenWritesNewestFirst(pending);
    expect(savedColours().pop()).toBe('#00ff00'); // the bff's last write is edit B
    expect(component.saveState()).toBe('saved');

    // THE UNDO. Back to edit A's colour — which is NOT what the bff holds, so it
    // must be written. The old code's dirty check matched and swallowed it.
    const before = saveSpy.calls.count();
    editAndSettle(() => state.setPalette('fur', '#ff0000'));
    expect(saveSpy.calls.count()).toBe(before + 1);
    expect((saveSpy.calls.mostRecent().args[0] as VnCharacter).palette['fur']).toBe('#ff0000');

    landOpenWritesNewestFirst(pending);
    expect(savedColours().pop()).toBe('#ff0000');
  }));

  it('flushing on destroy while a write is open still lands the pending edit', fakeAsync(() => {
    const pending = deferSaves();
    create();

    state.setPalette('fur', '#ff0000');
    fixture.detectChanges();
    tick(AUTOSAVE_DEBOUNCE_MS); // PUT out, unanswered
    state.setPalette('fur', '#00ff00'); // one more edit…
    fixture.detectChanges();
    fixture.destroy(); // …and navigation away beats its debounce
    flushMicrotasks();
    expect(pending.length).toBe(1); // the flush queues behind the open write…

    landOpenWritesNewestFirst(pending);
    expect(savedColours().pop()).toBe('#00ff00'); // …and the door edit still lands
    // The flush is not a licence to race: the bff saw the two definitions in the
    // order they were made, so nothing after this believes the older one is stored.
    expect(savedColours()).toEqual(['#ff0000', '#00ff00']);
  }));
});
