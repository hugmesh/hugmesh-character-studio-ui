# Chibi art agent brief — srd-taxonomy-v1 → v2 chibi art pass

You are one of several artists filling the `srd-taxonomy-v1` pack of
`<workdir>/chibi-art/studio` (an Angular character-studio repo) with REAL
chibi-cutesy SVG part art per the SRD 5.1 catalog. Placeholders exist today; you replace
and extend them.

## Read these FIRST (in this order)

1. `<workdir>/chibi-art/studio/docs/ART-STYLE-CHIBI.md` — the binding style
   guide: proportions table, canvas geometry envelope, palette, template. FOLLOW IT EXACTLY.
2. `<workdir>/chibi-art/studio/docs/CATALOG-DND-SRD.md` — the species spec +
   the EXCLUSIONS list (never ship excluded WotC creatures).
3. Reference idiom — open 3 shipped examples and imitate their construction quality:
   - `src/assets/vn/packs/menagerie-v1/parts/head/head_axolotl_01.svg`
   - `src/assets/vn/packs/menagerie-v1/parts/body/body_amphibian_01.svg` (or any body there)
   - `src/assets/vn/packs/menagerie-v1/parts/eyes/eyes_sparkle_01.svg`
   (paths relative to the studio worktree root above)

## Where to write

- SVG files: `src/assets/vn/packs/srd-taxonomy-v1/parts/<slot>/<part_id>.svg`
  (slot dirs: backdrop, tail, wings, body, clothing, head, feature, brows, eyes, mouth, accessory — create if missing)
- Fragment manifest: `<workdir>/chibi-art/fragments/<your-key>.json`:

```json
{ "agent": "<your-key>",
  "parts": [
    { "slot": "head",
      "part": { "id": "head_dwarf_01", "displayName": "Dwarf", "file": "parts/head/head_dwarf_01.svg",
        "category": "head", "headArchetype": "humanoid",
        "tintRegions": [ {"region": "fur", "svgClass": "region-fur", "defaultPalette": "#f2c9a8"} ],
        "source": "SRD 5.1", "tags": ["race"] } } ] }
```

Field rules (schema-enforced): `id` `[a-zA-Z0-9_-]+` ≤64 chars, naming `<slot>_<species>_01`;
`displayName` ≤48 chars (the species name, e.g. "Hill Giant"); `category` one of
base|head|eyes|clothing|feature|accessory (bodies = `base`, tails/wings/horns/etc = `feature`,
brows/mouth parts = `feature` category too, backdrops = `accessory`); heads carry
`headArchetype` (canid|felid|avian|reptile|equine|bovid_cervid|ursine_musteline|synth|humanoid|lagomorph_rodent|plant);
non-head parts that only fit some archetypes carry `compatibleHeads` (e.g. `["humanoid"]`,
`["*"]` for universal); every part carries `"source": "SRD 5.1"` and helpful `tags`.
≤6 tintRegions per part; every `svgClass` listed MUST appear as a `class=` token in the SVG
(CI-enforced) and every `region-*` class used in the SVG must be listed. Use ONLY the five
region names from the style guide: fur, accent, detail, iris, line.

## Hard rules (CI/validator/security — violations fail the build)

- viewBox exactly `0 0 1024 1024`; elements ONLY `path/circle/ellipse/rect` + the single
  `<style>` block from the template; NO `g/defs/use/image/text/gradient/filter/mask/transform/script`.
- Each SVG ≤ 8000 bytes. Aim 1–3 KB. ≤30 shapes.
- `defaultPalette` = 6-digit hex like `#a8d8b9` (pastel!).
- After writing EACH file run: `python3 -c "import xml.etree.ElementTree as t;t.parse('<file>')"`
  and check the byte size. Fix before moving on.
- Do NOT touch `pack.json`, `manifest.json`, other packs, or anything outside your part
  files + your one fragment JSON. Do NOT run npm/builds/git. No external network tools.
- KEEP EXISTING IDS: if your list marks an id `(replace)`, the file already exists as a
  placeholder — overwrite the SVG at the SAME filename/id (persisted characters reference
  these ids). Keep its region `fur` in tintRegions (you may ADD regions).

## Quality bar (this is an ART task — the whole point)

Every head: face disc + baby-fat cheeks, HUGE low-set eyes-area left clear (eyes are a
separate slot drawn at (446,340)/(578,340) — your head must leave that zone plain fur),
tiny nose/muzzle, mandatory blush ellipses, 3 exaggerated signature features, soft curves
only. Every body: jellybean torso + stubby arms + round feet in the envelope. Think like
a sticker artist: would this read as ADORABLE at 64×64? Spend your effort on shape
quality — vary silhouettes, don't clone one template across species. Add a one-line
`<!-- comment -->` naming the species + its 3 signature features.

Your final message: a terse list of files written + any species you had to skip and why.
