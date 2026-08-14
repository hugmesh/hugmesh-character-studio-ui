/**
 * Where this remote's own `assets/vn/` tree lives, as an ABSOLUTE URL.
 *
 * THE TRAP: a bare relative string like `'assets/vn/'` is resolved by `fetch()`
 * (and by PixiJS's loader, and by `new Image().src`) against the DOCUMENT's URL —
 * NOT against the Angular app's base href. Standalone that is harmless, because
 * the document already sits inside the remote. Federated into the host shell the
 * document is the SHELL, at /character-studio with no trailing slash, so
 * `assets/vn/manifest.json` resolves to `/assets/vn/manifest.json` at the shell
 * root and 404s. That is exactly the "Failed to load character assets:
 * manifest.json 404" the operator hit, and it is why the studio rendered only
 * when opened directly at the remote's own address.
 *
 * `import.meta.url` is the URL of the very chunk this module is bundled into,
 * which is served from the remote's own mount in BOTH cases (/character-studio/…
 * federated, / standalone) — so anchoring on it needs no hardcoded mount path and
 * no build-time base href. `document.baseURI` is the fallback for a non-ESM or
 * test context.
 *
 * Every consumer of the asset tree MUST anchor here. Fixing only the manifest
 * loader left `SvgRigService` and `PixiRigService` still on the bare string, so
 * the index loaded and then every PART image 404'd under the shell — the same
 * bug, one layer down. One helper, one place to be right.
 */
export function resolveAssetsBase(): string {
  const anchor = typeof import.meta?.url === 'string'
    ? import.meta.url
    : (typeof document !== 'undefined' ? document.baseURI : '/');
  try {
    // Chunks are emitted beside index.html, so the module's directory IS the
    // app root; new URL() normalises it into an absolute href.
    return new URL('assets/vn/', anchor).href;
  } catch {
    return 'assets/vn/';
  }
}
