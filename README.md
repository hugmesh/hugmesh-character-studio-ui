# hugmesh-character-studio-ui

A browser-based, layered-2D avatar creator for the HugMesh platform — pick a
species/class combination, recolor per region, add an expression, freehand-draw
extra flair, and export a finished avatar. Think Picrew or a Gaia Online
dress-up doll, but self-hosted and running the composition entirely
client-side (SVG-DOM, no server round-trip needed just to preview a look).

It's delivered as a native-federation **remote** (`character-studio`) that the
[`hugmesh-host-shell`](https://github.com/hugmesh/hugmesh-host-shell)
mounts at `/character-studio`. This is the platform's avatar-authoring
surface: the Matrix/Akkoma chat clients and the forum both consume the
characters it produces, via the
[`hugmesh-user-bff-api`](https://github.com/hugmesh/hugmesh-user-bff-api)
`/bff/user/**` avatar route, keyed to the signed-in user's token subject. The
character-definition and AI-suggest routes the client also calls are not served
by that BFF yet (see [Known limitations](#known-limitations)).

## Quick start

```bash
npm ci                            # install (Angular 22 + native-federation; npm only, no other lockfiles)
npm start                         # standalone dev server, http://localhost:4209
npm run build:character-studio    # production federation build -> dist/character-studio (+ remoteEntry.json)
```

## How it fits into the platform

This repo is a native-federation **remote only** — it has no host shell and no
dedicated backend of its own (only `hugmeshRemote(...)` is used; there's no
`hugmeshHost(...)` call anywhere in this repo — see `federation.config.js`).

- [`hugmesh-host-shell`](https://github.com/hugmesh/hugmesh-host-shell)
  loads this remote's exposed `./routes` module and mounts it at
  `/character-studio` (federation surface: `./routes` →
  `CHARACTER_STUDIO_ROUTES`, declared in `federation.config.js`).
- Reads/writes that need a backend go through the `/bff/user/**` surface
  (`CharacterBffService`, `CharacterAiService`), authenticated via the shared
  HttpOnly `bff_` session cookie — there is no browser-held bearer token. Only
  part of that surface exists in
  [`hugmesh-user-bff-api`](https://github.com/hugmesh/hugmesh-user-bff-api):
  `POST /bff/user/profile/avatar` is served; `GET`/`PUT /bff/user/vn-character`
  and `POST /bff/user/vn-character/suggest` are not (no repo on `origin/main`
  maps them).
- `federation-base.js` carries the same code as the copy in
  [`hugmesh-games`](https://github.com/hugmesh/hugmesh-games)
  (`frontend/federation-base.js`) and the other HugMesh native-federation
  remotes (only the header comments differ), so the shared-dependency/skip-list
  contract can't drift between the host shell and any remote.
- This remote has no role gates — it's a self-service tool, identical for
  every signed-in user — so the role×feature test matrices used elsewhere on
  the platform are deliberately not applicable here (see
  `e2e/features/avatar.feature`).

## Architecture

```mermaid
flowchart TB
    Host["hugmesh-host-shell<br/>loadRemoteModule('character-studio', './routes')"]
    Routes["CHARACTER_STUDIO_ROUTES<br/>character-studio.routes.ts"]
    Studio["CharacterStudioComponent"]
    Assets["AssetManifestService<br/>fetch manifest.json + pack.json"]
    State["CharacterStateService<br/>live VnCharacter signal"]
    Canvas["StudioCanvasComponent"]
    SvgRig["SvgRigService.compose<br/>SVG-DOM, CSS custom-property recolor"]
    Preview["live preview img, data: URL"]
    PartPicker["PartPickerComponent"]
    Palette["PaletteComponent"]
    ExprPreview["ExpressionPreviewComponent"]
    LipSync["LipSyncPanelComponent<br/>mic or hand-picked frame -> viseme"]
    RigPanel["RigPanelComponent<br/>per-layer offset, scale, tilt"]
    Draw["DrawComponent<br/>perfect-freehand + sanitizeSvgClient"]
    AiAssist["AiAssistComponent"]
    CharacterAi["CharacterAiService.suggest"]
    BffSuggest["POST /bff/user/vn-character/suggest<br/>not served by user-bff today"]
    LocalHeuristic["local keyword heuristic, fallback"]
    ExportPanel["ExportPanelComponent"]
    CharacterBff["CharacterBffService"]
    Moderation["Moderation pipeline<br/>sanitize -> moderate -> store"]
    PixiRig["PixiRigService, retained for a future GPU rig, not wired into this flow"]

    Host -->|mounts at /character-studio| Routes
    Routes --> Studio
    Studio --> Assets
    Assets --> State
    State --> Canvas
    Canvas --> SvgRig
    SvgRig --> Preview

    PartPicker --> State
    Palette --> State
    ExprPreview --> State
    RigPanel --> State
    LipSync --> Canvas
    Draw --> State

    AiAssist --> CharacterAi
    CharacterAi -->|suggestion endpoint| BffSuggest
    CharacterAi -.unavailable, falls back to.-> LocalHeuristic
    CharacterAi --> State

    ExportPanel --> SvgRig
    ExportPanel --> CharacterBff
    CharacterBff -->|POST /bff/user/profile/avatar| Moderation
    Moderation -->|422 if blocked, else avatarUrl| CharacterBff

    Canvas -.retained, not wired.-> PixiRig
```

The core creator flow: the asset library loads a pack
(`AssetManifestService`), `CharacterStateService` holds the live character and
drives a **live SVG-DOM preview** (`StudioCanvasComponent` + `SvgRigService` —
independent per-region recolor via CSS custom properties, not the PixiJS
path), with a part picker, a palette, a freehand draw/paint-in tool, an
expression preview (one toggle per expression preset the active pack ships),
a "Talk" panel (mouth frames driven by the microphone or picked by hand), a
"Rig" panel (offset, size and tilt per layer, plus "Fit the face"), an
optional "describe your character" AI-assist panel (calls a suggestion
endpoint, falling back to a local keyword heuristic when that endpoint is
unavailable), and an export panel that renders the composed character to PNG
and uploads it through the BFF's moderated avatar-export endpoint (a
moderation gate before storage; a blocked image surfaces as an HTTP 422).

`PixiRigService` (`src/app/character-studio/services/pixi-rig.service.ts`) is
retained in the codebase but not on the active render path. It's reserved for
a future GPU-accelerated live-render milestone, not the current SVG-driven
creator. Lip-sync already runs on the SVG path.

## Asset packs

Four packs ship in `src/assets/vn/packs/`, all listed enabled in
`src/assets/vn/manifest.json` (and confirmed against the actual part files on
disk):

| Pack | Slots | Part SVGs | Notes |
|---|---|---|---|
| `base-anthro-v1` | 5 | 14 | Original generic-anthro content, not SRD-derived. |
| `srd-taxonomy-v1` | 11 | 180 | "SRD Chibi — All Species": full D&D SRD 5.1 (CC-BY-4.0) catalog coverage in original chibi/kemono art (92 species heads, 10 expression presets, 5-step viseme mouths, 12 class outfit sets, token backdrops) — see [`docs/CATALOG-DND-SRD.md`](docs/CATALOG-DND-SRD.md), [`docs/ART-STYLE-CHIBI.md`](docs/ART-STYLE-CHIBI.md) and [`ATTRIBUTION.txt`](ATTRIBUTION.txt). The art is original; only the naming/category taxonomy is SRD-sourced. (`manifest.json` still labels it "Taxonomy + SRD Placeholders v1"; `pack.json` says "SRD Chibi — All Species".) |
| `menagerie-v1` | 12 | 189 | An "all creatures" pack: 54 heads including dragons, kobolds, dinosaurs, insects, amphibians, slimes, and robots, plus universal hybrid overlays (goo/metallic/stone/crystal). |
| `anime-v1` | 12 | 51 | A kemonomimi/anime pack (catgirl-style ears/tails, nine-tailed kitsune, etc). |

All four share one geometry canon. `srd-taxonomy-v1` carries a full chibi art
pass (style guide: [`docs/ART-STYLE-CHIBI.md`](docs/ART-STYLE-CHIBI.md),
authored to the same numeric face proportions as the platform's companion 3D
avatar project, for visual parity between a character's 2D token and its 3D
model); the other three packs remain earlier-generation flat vector art and
are candidates for the same treatment.

## Build & test

- `npm ci` — install (Angular 22 / native-federation; npm only).
- `npm run build:character-studio` — production federation build.
- `npm start` — standalone dev server on `:4209`.
- `npm test` — Karma/Jasmine unit tests (`ng test character-studio --watch=false
  --browsers=ChromeHeadlessCI`); 114 specs in 18 spec files, covering the
  services, panels (pack picker, part picker, export, lip-sync, rig), the
  compositor and the randomizer.
- `npm run validate:assets` / `npm run compose:sweep` — asset-library CI
  gates (see below).
- `e2e/` — a separate Playwright + playwright-bdd (Gherkin) package
  (`cd e2e && npm ci && npm run bdd:gen && npm test`). Pure-UI scenarios (part
  picker, palette, draw/undo/clear, export→download, expression preview,
  canvas render, responsive layout, credits/attribution, combination
  coverage) run fully offline against `ng serve character-studio` — no
  backend, no mocks. Sixteen `.feature` files ship in total; the five that
  touch the off-stack `character-bff`/`character-ai` (the "set as avatar"
  cross-surface write and its cross-user isolation, the edge-AI suggest seam
  and its fallback path) carry `@cluster`-tagged scenarios and are skipped
  unless `E2E_LIVE=1`.

### Asset-library CI gates

- `npm run validate:assets` schema-validates every pack, confirms every part
  SVG referenced in a manifest actually exists, asserts each
  `tintRegion.svgClass` actually appears in its part SVG (so recolor will
  bind), and enforces the asset size/shape caps (part SVG ≤ 8192 bytes, ≤ 100
  parts/slot, ≤ 24 slots/pack, part id ≤ 64 chars, displayName ≤ 48 chars,
  ≤ 6 tintRegions/part, ≤ 16 expressions/pack).
- `npm run compose:sweep` (run right after `validate:assets`) node-side
  re-composes, for every enabled pack, every part in every slot, a seeded
  300-character random sweep (half hybrid cross-archetype), every expression
  preset × every eyes/brows/mouth part, and first/last/none boundary combos —
  asserting each composition is well-formed SVG with sane canvas bounds. This
  is the exhaustive "every combination" check that clicking through the
  browser e2e can't afford to cover (see `tools/compose-sweep.mjs`).
- `tools/render-proof-sheet.mjs` renders flattened, literal-color proof sheets
  for a pack's heads, useful for eyeballing a whole species roster at once
  outside the browser.

## Container image

The production build is served as a static bundle behind
`nginx-unprivileged`:

```bash
docker build -t hugmesh-character-studio-ui .
docker run -p 8080:8080 hugmesh-character-studio-ui
```

The `Dockerfile` builds with `node:24-alpine` and serves from
`nginxinc/nginx-unprivileged:1.27-alpine` on port 8080; `nginx.conf`
long-caches hashed bundle files but always revalidates `remoteEntry.json`
(the manifest the host shell fetches to resolve this remote's exposed
modules). This image is only meaningful when the optional `character-studio`
mesh feature is enabled on a HugMesh deployment. The publish workflow
(`.github/workflows/release.yml`) is manual-only (`workflow_dispatch`) and
pushes to `ghcr.io/hugmesh/hugmesh-character-studio-ui`.

## Documentation

- [`docs/CATALOG-DND-SRD.md`](docs/CATALOG-DND-SRD.md) — the SRD 5.1
  (CC-BY-4.0) design-label catalog: which class/race/monster names are safe to
  ship as parts, the closed-Product-Identity exclusion list, and how a catalog
  entry folds into a `pack.json` part.
- [`docs/ART-STYLE-CHIBI.md`](docs/ART-STYLE-CHIBI.md) — the house art style
  guide for real (non-placeholder) part art: proportions, color/region
  conventions, the SVG part template, and the cross-medium parity contract
  with the platform's 3D avatar pipeline.
- [`ATTRIBUTION.txt`](ATTRIBUTION.txt) — the verbatim SRD 5.1 attribution
  string every SRD-sourced pack must carry.

## Status

### Implemented

- Native-federation remote scaffold, exposing `./routes` at `/character-studio`.
- Asset library loading (`AssetManifestService`) across the four enabled
  packs (see table above).
- A live SVG-DOM compositor (`SvgRigService`) with independent per-region CSS
  custom-property recolor, a part picker, a palette, a freehand draw/paint
  tool (client-sanitized via DOMPurify), a seedable "surprise me" randomizer,
  and a pack picker with a hybrid-mode toggle (bypasses `compatibleHeads`).
- Expression preview wired end-to-end as a preview-only slot-override swap —
  see `SvgRigService.compose`'s `expressionSlots` parameter. `srd-taxonomy-v1`
  ships 10 presets; the other three packs ship 4 (neutral, happy, sad, angry).
- A "Talk" panel: the mouth cycles closed / half / open from the microphone
  (on explicit user action) or a hand-picked frame (`lipsync/`,
  `MicOpennessService`). No shipped pack declares its own talking frames
  (`viseme` / `visemeOf` appear in no `pack.json`), so the chosen mouth is
  opened by a transform about its measured bounds.
- A "Rig" panel: per-layer offset, size and tilt (`VnCharacter.slotTransforms`,
  clamped) and a "Fit the face" button that centres each feature on the head.
- A "Body type blend" control in the part picker: a crossfade between two
  parts of the body slot (`VnCharacter.slotBlend`), an opacity blend, not a
  geometric morph.
- An AI-assist "describe your character" panel: calls a suggestion endpoint
  (`POST /bff/user/vn-character/suggest`) and falls back to a local keyword
  heuristic when that endpoint is unavailable. No service on `origin/main`
  answers that route, so today the local heuristic is the only path.
- PNG export plus a moderated avatar upload (`POST /bff/user/profile/avatar`,
  button "Set as my mesh avatar"); a blocked image surfaces as an HTTP 422.
- "Use everywhere": applies the same 512 px PNG to this mesh's profile, to
  Matrix and to Mastodon/Akkoma (through the `/bff/user/matrix` and
  `/bff/user/mastodon` proxies). Each platform reports on its own; a platform
  the account has no role for is listed as skipped, not failed. Wiki, tube and
  Owncast are left out because they have no per-user avatar.
- A "Go live as an avatar" link to the Owncast remote's avatar cam.
- Character persistence, client side (issue #1): the studio opens on the pack
  default and the saved `vn-character` definition is then restored over it via
  `CharacterBffService.loadActive` (reopening the pack it belongs to). The
  restore is strictly off the render path: rendering never waits on the
  user-bff, so no save, an unreachable bff, *or one that stalls* (the GET is
  bounded by `BFF_LOAD_TIMEOUT_MS`, 10 s) all leave you editing the pack default
  rather than a studio stuck on "Loading character assets…". Edits made while
  a slow restore is still in flight win over it. Every edit is
  debounce-autosaved via `CharacterBffService.saveDefinition`, with a pending
  save flushed on navigation away. An aria-live indicator (`cs-autosave`)
  reports "Saved." or an honest local-only failure. Exactly ONE character is
  saved, so the pack picker — which is also the only way to *look* at another
  art set — is non-destructive: while the open pack is not the one holding the
  save, the autosave is suspended, a header notice says so, the character you
  left is restored when you switch back, and moving the save to the browsed
  pack takes an explicit "Keep this one instead".
- A Playwright-bdd e2e harness (16 `.feature` files, offline-first, with
  `@cluster`-tagged scenarios for cases that need a live backend), a
  Karma/Jasmine unit suite (114 specs, `npm test`), and two
  asset-integrity CLI gates (`validate:assets`, `compose:sweep`).

### Known limitations
- **The character-definition and AI-suggest routes have no server.**
  `GET`/`PUT /bff/user/vn-character` and `POST /bff/user/vn-character/suggest`
  are called by the client, but `hugmesh-user-bff-api` on `origin/main`
  serves only `/bff/user/character/{avatar,parts,stickers}` and
  `/bff/user/profile/avatar`. Until a service maps them, a saved character is
  never restored and autosave reports "Autosave failed — your latest edits are
  only on this device."
- **`PixiRigService.setExpression`/`.setViseme` are stubs** (see the docblocks
  in `pixi-rig.service.ts`) — expected, since that GPU rig isn't on the active
  render path yet (reserved for a future milestone), not a regression.
- The studio renders a "Credits &amp; attribution" section whenever the
  active pack carries an `attribution` string (`character-studio.component.html`,
  `data-testid` `cs-credits`), covering all three required attribution
  surfaces: `pack.json`, `ATTRIBUTION.txt`, and in-app.
- **Art quality varies by pack**: `srd-taxonomy-v1` has the full chibi art
  pass (see `docs/ART-STYLE-CHIBI.md`); `base-anthro-v1`, `menagerie-v1` and
  `anime-v1` remain earlier-generation flat vector art — bringing them to the
  chibi style guide is content work, not a code gap.
- User-drawn parts (the freehand draw tool) are client-sanitized and
  session-local only; the studio does not call the BFF's
  `/bff/user/character/parts` route, so a drawn part is not saved
  (`svg-sanitize.client.ts` is documented as preview-only, not the security
  boundary).

## Contributing

Issues and pull requests are welcome. A few pointers specific to this repo:

- Run `npm run validate:assets` and `npm run compose:sweep` before opening a
  PR that touches `src/assets/vn/` — these are hard CI gates and will catch
  most asset-shape mistakes locally, before CI does.
- New part art should follow [`docs/ART-STYLE-CHIBI.md`](docs/ART-STYLE-CHIBI.md).
- New SRD-labeled parts (D&D race/class/monster names) should follow the
  scope and exclusion rules in [`docs/CATALOG-DND-SRD.md`](docs/CATALOG-DND-SRD.md)
  and must carry the attribution in [`ATTRIBUTION.txt`](ATTRIBUTION.txt).
- `npm test` and the e2e suite (`cd e2e && npm ci && npm run bdd:gen && npm test`)
  should pass before submitting.

See the other repositories under the
[hugmesh](https://github.com/hugmesh) GitHub organization for the
rest of the platform, including the host shell and the backend-for-frontend
services this remote talks to.

## License

MIT — see [LICENSE](LICENSE).
