import { AssetManifestService } from './asset-manifest.service';
import { PackIndex, PartManifest } from '../models/vn-manifest';

/**
 * PACK-PICKER slice: {@link AssetManifestService.loadIndex} exposes the index's
 * ENABLED entries via `packEntries`, and {@link AssetManifestService.loadPack}
 * fetches a chosen entry's pack.json into `activePack`. `loadActivePack` keeps
 * its first-enabled behaviour for the initial studio load (backward compat).
 * All network is stubbed via the global fetch — no real assets are touched.
 */
describe('AssetManifestService pack index + loadPack', () => {
  let svc: AssetManifestService;
  let fetchSpy: jasmine.Spy;

  const index: PackIndex = {
    schemaVersion: 1,
    packs: [
      { packId: 'base-anthro-v1', path: 'packs/base-anthro-v1/pack.json', enabled: true },
      { packId: 'legacy-v0', path: 'packs/legacy-v0/pack.json', enabled: false },
      {
        packId: 'anime-v1',
        displayName: 'Anime v1',
        path: 'packs/anime-v1/pack.json',
        enabled: true,
      },
      { packId: 'broken-v1', path: 'packs/broken-v1/missing.json', enabled: true },
    ],
  };

  const packFor = (packId: string): PartManifest => ({
    packId,
    version: '1',
    displayName: `Pack ${packId}`,
    canvas: { width: 10, height: 10 },
    slots: [],
  });

  const okJson = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200 });

  beforeEach(() => {
    svc = new AssetManifestService();
    fetchSpy = spyOn(window, 'fetch').and.callFake(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('manifest.json')) {
        return okJson(index);
      }
      const m = url.match(/packs\/([^/]+)\/pack\.json$/);
      if (m) {
        return okJson(packFor(m[1]));
      }
      return new Response('not found', { status: 404 });
    });
  });

  it('loadIndex populates packEntries with ONLY the enabled entries, in index order', async () => {
    await svc.loadIndex();
    expect(svc.packEntries().map(e => e.packId)).toEqual([
      'base-anthro-v1',
      'anime-v1',
      'broken-v1',
    ]);
  });

  it('loadPack fetches that entry\'s pack.json, caches activePack, and returns it', async () => {
    await svc.loadIndex();
    const pack = await svc.loadPack('anime-v1');
    expect(pack.packId).toBe('anime-v1');
    expect(svc.activePack()).toBe(pack);
    expect(svc.error()).toBeNull();
    // Asset URLs are ABSOLUTE since #11 (resolved from the module, not the
    // document), so assert on the tail — the stub above matches the same way.
    expect(fetchSpy).toHaveBeenCalledWith(
      jasmine.stringMatching(/(^|\/)assets\/vn\/packs\/anime-v1\/pack\.json$/),
      { cache: 'no-cache' },
    );
  });

  it('loadPack falls back to fetching the index when packEntries is not populated yet', async () => {
    expect(svc.packEntries()).toEqual([]);
    const pack = await svc.loadPack('anime-v1');
    expect(pack.packId).toBe('anime-v1');
    expect(svc.packEntries().length).toBe(3);
  });

  it('loadPack rejects an unknown or DISABLED packId and surfaces the error', async () => {
    for (const bad of ['no-such-pack', 'legacy-v0']) {
      await expectAsync(svc.loadPack(bad)).toBeRejected();
      expect(svc.error()).toContain(bad);
      // the active pack is left untouched
      expect(svc.activePack()).toBeNull();
    }
  });

  it('loadPack surfaces a failed pack.json fetch (non-2xx) in error()', async () => {
    await expectAsync(svc.loadPack('broken-v1')).toBeRejected();
    expect(svc.error()).toContain('404');
    expect(svc.activePack()).toBeNull();
  });

  it('loadActivePack still loads the FIRST enabled pack (backward compat) and seeds packEntries', async () => {
    const pack = await svc.loadActivePack();
    expect(pack.packId).toBe('base-anthro-v1');
    expect(svc.activePack()).toBe(pack);
    expect(svc.packEntries().map(e => e.packId)).toEqual([
      'base-anthro-v1',
      'anime-v1',
      'broken-v1',
    ]);
  });
});
