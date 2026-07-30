# Art-QA checklist — systemic defects found in the wave-A spot-check (proof0/sheet.png)

Apply during the verify/fix wave to EVERY head/body, plus the per-part style-guide rules
(docs/ART-STYLE-CHIBI.md, esp. §7 kemono bands).

1. **Hair region migration.** Heads that bake hair must put hair shapes on `region-hair`
   (declared as tintRegion `hair`), NOT `region-accent`. Observed: human head's hair used
   `accent`, which recolors the BODY's belly patch to hair-brown when composed (one region
   = one color character-wide). Accent must stay the "lighter tint of fur" family:
   inner-ear, belly, inner-muzzle. Check every head that bakes hair.
2. **No baked mouths on heads.** The pack's expression system (10 presets) + the 5-step
   viseme strip put mouths in the `mouth` slot (required, default smile). A baked smile
   under a swapped mouth part = double mouth. Strip baked mouth curves from all heads;
   KEEP baked noses/nostrils. (Baked fangs/tusks that attach to the jaw line are OK only
   if they sit clear of the mouth-part zone (512,~440) — else move to the mouth/feature part.)
3. **No spiky triangles.** Fluff/fur tufts must be rounded (Q-curves), never sharp
   triangles — observed on bugbear's mane tufts reading as horns/spikes. Soften every
   spike (style guide: "ban straight lines"; soften even spiky species).
4. **Face visibility.** Signature features must not swallow the face: beard/mane/hood
   keeps ≥ half the face disc visible (observed: dwarf beard covering the whole body reads
   as a robe — shrink to a chin-frame beard).
5. **Contrast discipline.** accent = lighter tint of the fur hue (soften toward white);
   detail = the darker pop. If accent renders DARKER than fur on the composed proof,
   fix the palette.
6. **Eye zone.** Eyes are drawn by eye parts at centers (446,~350)/(578,~350), iris
   rx≈48-56 ry≈62-74 — heads must keep that whole area plain fur (no markings/hairline
   intrusions below y≈280 between x≈380-650).

## Specific head reworks found in proof1 (predators sheet)

- **head_owlbear_01** — the owl "facial disc" drawn as a thin accent RING renders as a
  hollow picture-frame circle around an empty face. Rework: solid lighter-accent disc
  (or two overlapping heart-lobes) BEHIND the eye zone, feather-tip scallops at the rim,
  tiny beak below eye line; keep bear ears.
- **head_sphinx_01** — nemes headdress reads as a granny bonnet + detached blue egg blob
  on the chest. Rework: headdress flaps as two clean side panels with rounded stripe
  bands, gold brow band arc, lion-cub face dominant; drop the blue chest shape entirely.
- **head_tiger_01** — baked cream fangs sit at the mouth zone (512,~440) → double-mouth
  once mouth parts land. Remove baked fangs (fang variants belong to mouth parts).

## From proof3 (fiends sheet)

- **head_medusa_01** — snakelets render as plain green knobs (flower-crown-alien look).
  Rework: 5-6 chunky S-curved snakes with distinct rounded heads + eye dots + tiny
  tongue forks, varied heights.
- **horns_tiefling_01** (feature) — spiral horns render as donut circles with holes,
  reading as pierced ears. Rework: solid curled ram-horn silhouettes (comma/ammonite
  shape, no enclosed hole), one each side above y≈260.
- **head_succubus_01** — side hair panels drape as straight slabs (elephant-ear look).
  Rework: taper + curve the panels inward; consider `hair` region for them.
- **head_hellhound_01** — flame ear-tufts read as horns; composed with tail_bushy it
  reads squirrel. Soften flames into rounded ember tufts INSIDE the ear silhouette;
  add tag suggesting tail_feline/tail_spade pairing instead of bushy.

## From proof4 (reptiles/sky/smallfolk sheet)

- **head_dragon_01** — cheek frills render elephant-ear-sized and the snout curl reads
  as a trunk: the whole head reads ELEPHANT. Rework: shrink cheek frills ≤60px lobes,
  distinct rounded horns on the crown, compact rounded snout with nostril puffs, small
  back-frill. This is the marquee monster — make it unmistakably dragon.
- **feature_antlers_01** — invisible when composed over head_deer_01 (color too close /
  hidden behind ears). Rework: taller 3-point rounded antlers in a distinct detail
  color, anchored at y≈120-230, clearing the ears.
- **head_treant_01** — leaf canopy reads as a green beanie, bark plates don't read.
  Rework: 3-5 overlapping rounded canopy lobes with leaf-vein dots + visible rounded
  bark seams/knot on the face.
- **head_owl_01** (minor) — facial-disc rings read as goggles; acceptable owl-ish, but
  soften: merge into a single figure-8 lighter-accent disc behind the eye zone.
- **head_equine_01** (minor) — nostril ovals too large/close → pig-snout read; shrink
  and space them.
- **Cross-part accent harmony** — purple-capped heads (fungus) recolor body_plant's
  leaf collar purple (region collision). Plant/leaf shapes on bodies should use detail
  not accent where the head is likely to own accent (general rule 1/5 applies).

## From proofall (full 92-head render w/ default faces) — new minor items

- **head_avian_01 + head_griffon_01** — beak doesn't read (faces look bear/cat-like).
  Give both a small but VISIBLE accent-colored beak overlapping the nose position.
- **head_badger_01** — forehead stripes are two dots; extend into two clear rounded
  stripes from crown toward (not into) the eye zone; badger reads panda otherwise.
- **head_balor_01** — round horn discs read as mouse ears; reshape into curled ram
  horns with visible curl tips.
- **head_boar_01** — snout disc doesn't read; enlarge slightly + add two nostril dots
  + tiny up-tusk nubs clear of the mouth zone.
- **head_lion_01** — mane default near-black; repalette to warm mid-brown pastel.
- **head_ogre_01 / head_orc_01 / head_rodent_01** — baked teeth/underbite sit in the
  mouth-part zone → double-mouth with mouth parts. Move tusks/teeth to flank the zone
  (x<440 or x>584) or lift the baked jaw detail; do not delete the signature.
- **head_zombie_01** (minor) — stitch patch at cheek reads as a black mole; make it a
  clear two-line cross-stitch in region-line.
- Systemic sweep per lane: heads must keep the mouth-part zone (x 402-622, y 410-475)
  free of baked strokes except noses at y≤405; strip leftover baked smiles.

## From proof5 (constructs/giants sheet) — group is strong overall

- **head_kraken_01** (minor) — side tentacle curls read as droopy ears; add 1-2 more
  visible curls crossing the mantle base + sucker dots so it reads octopus.
- **head_elemental_01** (minor) — swirl crown is subtle; enlarge the swirl curl and add
  2-3 floating droplet/spark motes so the elemental read survives at 64px.

## From proof2 (undead sheet)

- **head_vampire_01** — high-collar side shapes hang low and read as droopy ears; baked
  fangs sit in the mouth zone (remove; a fang-smile mouth part covers this). Raise/flare
  the collar behind the head silhouette. Its dark-purple accent also collides with the
  body belly patch (QA rule 1/5 — consider `hair` region for the widow's-peak hair).
