# art-pipeline — how the chibi art pass was built (and how to run another)

Nobody edits the `srd-taxonomy-v1` v2 pack by hand. The fragment JSONs in
this directory are the source of truth, and `pack.json` is generated from them.

- `*.json` (every file here except `assemble.json`) — per-artist fragment manifests. Each
  art lane has one file, with an `agent` key and a `parts` list of `{slot, part}`
  entries. The faces lane also carries the `expressions`/`expressionSlots` index.
- `assemble.py` — merges the fragments into the pack's `pack.json`. It builds the slot
  table and folds palette variants into the tags of a base entry, which keeps each
  slot under the 100-part cap. It screens out WotC names, keeps legacy ids, and checks
  that each fragment's tint classes match its SVG. It also checks **species coverage**:
  every name in the `SPECIES` list hard-coded in `assemble.py` must be an entry id,
  display name or tag. Keep that list by hand in step with `docs/CATALOG-DND-SRD.md`. Run:
  `python3 assemble.py` (dry-run) / `python3 assemble.py --write`. A dry run on a
  clean tree prints `parts: 195 across 11 slots; 0 errors; 0 species uncovered`.
- `compose_proof.py` — composes fragment parts into flattened proof SVG/PNG sheets
  (`python3 compose_proof.py OUTDIR head_dragon_01 body_x:head_y:acc_z ...`); needs
  `rsvg-convert` + PIL. Every art agent ran this render-and-LOOK loop.
- `AGENT-BRIEF.md` / `QA-CHECKLIST.md` — the working brief and the visual-QA
  findings from the 2026-07 art pass. They are history. The `<workdir>/chibi-art/...`
  paths inside are placeholders from that session. The rules still hold.

`assemble.py` reads the repo root from `CHIBI_WT` (default: two levels above this
directory). `compose_proof.py` reads the pack directory from `CHIBI_PACK` (default:
`src/assets/vn/packs/srd-taxonomy-v1`). Both read fragments from this directory.
The binding style rules live in `docs/ART-STYLE-CHIBI.md`.
