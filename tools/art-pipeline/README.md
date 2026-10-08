# art-pipeline — how the chibi art pass was built (and how to run another)

The `srd-taxonomy-v1` v2 pack is **assembled, not hand-edited**: the fragment JSONs in
this directory are the source of truth, and `pack.json` is generated from them.

- `*.json` (every file here except `assemble.json`) — per-artist fragment manifests: one
  file per art lane, each with an `agent` key and a `parts` list of `{slot, part}`
  entries (and, for the faces lane, the `expressions`/`expressionSlots` index).
- `assemble.py` — merges fragments into the pack's `pack.json`: slot table, alias-fold
  (palette variants folded into base-entry tags to respect the 100-parts/slot cap),
  WotC-exclusion screen, legacy-id preservation, fragment↔SVG tint-class cross-check,
  and the **species-coverage check** (every name in the `SPECIES` list hard-coded in
  `assemble.py` must be an entry id, display name or tag; the list is kept by hand to
  match `docs/CATALOG-DND-SRD.md`). Run:
  `python3 assemble.py` (dry-run) / `python3 assemble.py --write`.
- `compose_proof.py` — composes fragment parts into flattened proof SVG/PNG sheets
  (`python3 compose_proof.py OUTDIR head_dragon_01 body_x:head_y:acc_z ...`); needs
  `rsvg-convert` + PIL. This is the render-and-LOOK loop every art agent ran.
- `AGENT-BRIEF.md` / `QA-CHECKLIST.md` — the working brief and the accumulated visual-QA
  findings from the 2026-07 art pass (historical; the `<workdir>/chibi-art/...` paths inside
  are placeholders from that session, the rules are not).

`assemble.py` takes the repo root as `CHIBI_WT` (default: two levels above this
directory); `compose_proof.py` takes the pack directory as `CHIBI_PACK` (default:
`src/assets/vn/packs/srd-taxonomy-v1`). Fragments are always read from this directory.
The binding style rules live in `docs/ART-STYLE-CHIBI.md`.
