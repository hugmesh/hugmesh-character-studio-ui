import { TestBed, fakeAsync, flush, flushMicrotasks, tick } from '@angular/core/testing';
import { BFF_LOAD_TIMEOUT_MS, CharacterBffService } from './character-bff.service';
import { VnCharacter } from '../models/vn-character';

/**
 * STALLED-BFF BOUNDING (would-have-caught): `loadActive` was a bare `await
 * fetch(...)` with no AbortSignal anywhere in the app, and the studio's first
 * render awaited it. A bff that REJECTS was handled; a bff that accepts the
 * socket and then never answers left the promise outstanding for the life of
 * the page — not an error, so no `catch` could ever see it. These specs pin the
 * ceiling at the service boundary: a stall must settle, as a rejection, and a
 * normal response must not leave the abort timer behind.
 *
 * The `fetch` stand-in below honours AbortSignal exactly like the real one:
 * it never settles on its own and rejects with the signal's reason when
 * aborted. So a spec here fails if the request is not given a signal at all,
 * as well as if the signal is never fired.
 */
describe('CharacterBffService — bounded restore GET', () => {
  let service: CharacterBffService;

  const def: VnCharacter = {
    schemaVersion: 1,
    packId: 'pack-a',
    name: 'Saved',
    slots: { body: 'body_1' },
    palette: {},
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    defaultExpression: 'neutral',
  };

  /** A fetch that never answers — the gateway-backpressure case. */
  function hangingFetch(): jasmine.Spy {
    return spyOn(window, 'fetch').and.callFake(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            return; // no signal ⇒ nothing can ever cancel this request
          }
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CharacterBffService);
  });

  it('aborts a GET that never answers, so a stalled bff surfaces as a rejection', fakeAsync(() => {
    const fetchSpy = hangingFetch();
    let outcome: 'pending' | 'resolved' | 'rejected' = 'pending';
    service.loadActive().then(
      () => (outcome = 'resolved'),
      () => (outcome = 'rejected'),
    );
    flushMicrotasks();
    tick(BFF_LOAD_TIMEOUT_MS - 1);
    flushMicrotasks();
    expect(outcome).withContext('must not give up before the ceiling').toBe('pending');
    tick(1);
    flushMicrotasks();
    expect(outcome).withContext('a stall must settle, not hang forever').toBe('rejected');
    const init = fetchSpy.calls.mostRecent().args[1] as RequestInit;
    expect(init.signal!.aborted).toBeTrue();
    expect(init.credentials).toBe('include'); // the bff_ cookie still rides along
  }));

  it('clears the abort timer once the GET answers (no timer left behind)', fakeAsync(() => {
    // A stub rather than a real `Response`: reading a real body settles off the
    // microtask queue, which fakeAsync's virtual clock cannot drive.
    spyOn(window, 'fetch').and.resolveTo(
      { ok: true, status: 200, json: () => Promise.resolve(def) } as unknown as Response,
    );
    let got: VnCharacter | null | undefined;
    void service.loadActive().then(v => (got = v));
    flushMicrotasks();
    expect(got).toEqual(def);
    // `flush()` drains what is still queued and returns the virtual time that
    // took: 0 iff the abort timer was cleared when the response landed (an
    // uncleared one would drag the clock all the way to the ceiling).
    expect(flush()).withContext('abort timer outlived the answered request').toBe(0);
  }));

  it('still reports "no save yet" as null on 404', fakeAsync(() => {
    spyOn(window, 'fetch').and.resolveTo(new Response(null, { status: 404 }));
    let got: VnCharacter | null | undefined = def;
    void service.loadActive().then(v => (got = v));
    flushMicrotasks();
    expect(got).toBeNull();
  }));
});
