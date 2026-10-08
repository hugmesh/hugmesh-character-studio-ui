# Chibi Art Style Guide — character-studio packs

*Part of [hugmesh-character-studio-ui](../README.md).*

The house style for real (non-placeholder) part art: **super-chibi, cutesy, flat-vector**.
It comes from published drawing guides (sources at the bottom), mapped onto this
repo's 1024×1024 part canvas so every part composes with every other.

## 1. Proportions (super-chibi, ~2 heads tall)

The published guides say: head-to-body between 1:2 and 1:4, with **1:2 ("super chibi")
reading best at token/avatar sizes**. The head is round and about twice as big as the body.
The body is a simple jellybean/oval. Limbs are stubby, about half natural length. Hands
and feet are small, round and mitten-like (2 finger-joints max). **No straight lines:
everything is soft and curvy.** Big forehead, baby-fat cheeks.

Mapped to our canvas (matches the shipped menagerie/anime geometry so packs stay
cross-consistent):

| Element | Canvas placement |
|---|---|
| Head (face disc) | circle r ≈ 200–210 at (512, 330); cheek bulges allowed to r+25 |
| Ears / horns / gills | spring from y ≈ 130–260; exaggerate — huge or tiny both read cute |
| Eyes | centers (446, 340) and (578, 340); tall iris ellipse rx ≈ 40–52, ry ≈ 52–66 |
| Eye highlights | hardcoded `#ffffff`: one big circle r ≈ 14–18 upper-left + one small r ≈ 5–7 lower-right |
| Blush | hardcoded `#f2a0b3` at `opacity="0.55"`: ellipses ~rx36 ry20 at (390, 412) & (634, 412) |
| Nose / muzzle | tiny: oval nose ≤ r14 at (512, ~400); beast muzzle ellipse ≤ rx90 ry60 at (512, 415) |
| Mouth | small curve at (512, ~440), width ≤ 200; smiles are wide-q curves, never straight |
| Body (jellybean) | y 436–890, torso width ≤ 380 centered on x 512; head overlaps the top (no neck) |
| Arms | stubby rounded stubs from y ≈ 520, length ≤ 190, round caps, slight outward curve |
| Feet / paws | ellipses ~rx70 ry60 at (414, 780) & (610, 780) or rounded rects at y ≈ 842 |
| Tail / wings | separate slot parts; anchor behind body silhouette (tail y ≈ 560–760, wings y ≈ 300–620) |

**Three-feature rule:** give each species at most **three signature features** and
exaggerate them (ears, horns, tusks, gills, mane, frill, snout, beard…). Everything
else stays generic-cute. You must be able to recognize a species by its silhouette.

## 2. Line & shape language

- Flat fills, **no gradients**, no filters, no masks/defs — plain `path/circle/ellipse/rect` only.
- Outline-accent style: fills carry the form. Use `region-line` strokes ONLY for
  mouths, eyelid/lash accents, and small interior seams. `stroke-width="14"`,
  `stroke-linecap="round"` (matches shipped packs).
- Round every corner: `rx` on rects, `Q` curves on paths. If a species is
  spiky (dragon frill, hedgehog), soften each spike tip into a curve.
- Keep each part ≤ 30 shapes and **≤ 8 KB on disk** (the validator enforces the 8 KB cap;
  parts inline into one composed SVG document).

## 3. Color: pastel flat palette per part

Use 3–6 colors per part through the tint-region system. The shipped conventions:

| Region class | Role | Example pastel default |
|---|---|---|
| `region-fur` | primary body/head color | `#f2b8c6`, `#a8d8b9`, `#bcd9f2`, `#e8d3a9` |
| `region-accent` | secondary: belly, inner-ear, muzzle patch, hair | lighter tint of fur, e.g. `#fbe3ea` |
| `region-detail` | tertiary: pads, horns, nose, freckles, claws | mid-dark, e.g. `#8a5a44` |
| `region-iris` | iris fill (eyes parts only) | saturated candy color, e.g. `#3a78c2` |
| `region-line` | mouth/eyelid strokes | dark warm neutral, e.g. `#5a4450` |

**Clothing/accessory parts** must NOT put their main mass on `fur/accent/detail`. The
composed head/body owns those, and one region is one color character-wide, so a garment
on `detail` turns the hair dark. Garments declare their own regions: `cloth`/`region-cloth`
(main garment mass, pastel default) and, optionally, `clothtrim`/`region-clothtrim` (trim).
Keep `iris` for a single saturated pop and `region-line` for seams and strings. (`cloth`
is a 2D-pack region; the 3D forge maps it to the outfit material when outfits land.)

Rules: **defaults must be pastel** (soften every hue toward white; reserve one saturated
accent, usually the iris, as the pop color). Hardcoded fills are allowed only for
`#ffffff` eye highlights and `#f2a0b3` blush. Declare every `class="region-*"` you use in
the part's `<style>` as `fill:var(--region-X,#default)` (or stroke for
`region-line`) AND list it in the part's `tintRegions` in pack.json. The CI validator
asserts that the class binds.

## 4. Faces (where the cute lives)

- **Eyes enormous, low on the face, lots of forehead.** Use tall rounded-rectangle/oval
  irises, with a flat-ish bottom lid on happy variants. Half-close the top lid for "dangerous"
  species (dragons, fiends); they stay cute.
- Mouth tiny. Default is a closed wide smile (`q` curve). A tiny single fang is cute on
  predators and vampires.
- Blush always, on every head, including skeletons/robots/oozes (paint it as a plate
  blush or LED blush there). It is the style signature.
- Brows are their own slot parts: short thick rounded strokes.

## 5. SVG part template

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <style>.region-fur{fill:var(--region-fur,#f2b8c6)}.region-accent{fill:var(--region-accent,#fbe3ea)}.region-detail{fill:var(--region-detail,#8a5a44)}.region-line{fill:none;stroke:var(--region-line,#5a4450);stroke-width:14;stroke-linecap:round}</style>
  <!-- Species (SRD 5.1) head: construction note — which 3 features are exaggerated -->
  …shapes back-to-front…
</svg>
```

Layer order inside a part: back elements (far ear, tail base) → main mass → accent
patches → detail → line accents. No `<g>`, no `transform` on the root, no text.

## 6. Slot / z-order map (this pack family)

`backdrop 0 → tail 10 → wings 15 → body 20 → markings 30 → clothing 40 → head 60 →
ears 70 → feature 80 → brows 90 → eyes 100 → mouth 110 → hair 120 → accessory 130`.
Heads carry `headArchetype`; features and eyes narrow with `compatibleHeads`.

## 7. Cross-medium parity with the 3D character forge (kemono alignment)

The 3D avatar pipeline (character-forge `games/character-forge/scripts/proportions.gd` in `hugmesh-games`, Char3DConfig §2) derives its
face construction from the same research. The 2D packs follow the SAME numeric
bands, so a character's token and its 3D avatar read as the same character:

| Kemono/JRPG band (3D constant) | 2D mapping on the r≈200 face disc |
|---|---|
| plush muzzle 15–25% head depth, wide-rounded, never a cone (`muzzleDepthRatio 0.22`) | muzzle ellipse ≤ rx90 ry60, wide and shallow, tapering into the cheeks — never pointed |
| eyes 0.28–0.35 face width each, iris fills ~0.9 (`eyeWidthRatio 0.33`, `irisFill 0.9`) | iris rx 48–56, ry 62–74 at centers (446, ~350) / (578, ~350) — aperture barely larger than iris, one big + one small white highlight. `srd-taxonomy-v1` uses this band (`eyes_round_01`: rx 52, ry 68, tilt 6°); follow it where it differs from §1 |
| eyes LOW on the face (`eyeLineRatio 0.60` from crown) | eye centers at y ≈ 345–365 (below the disc midline at 330), big forehead above |
| slight inward eye tilt (`eyeTiltDeg 7`) | tilt iris ellipses ~5–7° inward (tops lean toward center) |
| **upper-lid angle is THE expression driver** (`upperLidAngleDeg 13` neutral droop) | eye parts ship as lid-angle variants: neutral = soft 10–15° droop line, happy = flat/closed-arc lid, sleepy = heavy lid, angry = inward-slanted lid; expressions swap the lid, not the whole face |
| tiny nose AT the eye line (`noseAtEyeLine`) | nose dot/oval between the eyes at y ≈ 380–400, not far below |
| ears large/high/rounded-triangular, inner-ear separate region | ears spring y 130–260, inner-ear shape = `region-accent` |
| limbs taper, mitt hands, digitigrade legs | beast bodies: bent-haunch hind legs + mitten paws; humanoids: stubby straight |
| color blocks: base coat / inner-muzzle+belly / socks+gloves / inner-ear / tail-tip / hair tuft / iris | `region-fur` = base coat; `region-accent` = inner-muzzle, belly, inner-ear; `region-detail` = socks/paws, tail tip, claws; `region-iris` = iris; hair = `region-hair` where a head bakes hair |
| 60/30/10 color blocking (JRPG) | ~60% fur, ~30% accent, ~10% detail per composed character |

**Palette contract:** Char3DConfig `materials` uses the SAME region names as the SVG
palette, 1:1 (`fur, accent, detail, line, iris, skin, hair`). 2D parts use `fur` for the
primary mass on every archetype. On humanoids fur IS the skin; legacy palettes bind by
region name and must keep working. A head that bakes hair declares a sixth region,
`hair`/`region-hair`, so the 3D mapper and the palette editor pick it up.

**Expression roster:** the canonical 10-expression vocabulary (StickerExpression twin,
also the 3D preset list) is `neutral happy sad angry surprised embarrassed thinking wink
sleepy smug`. `srd-taxonomy-v1` ships all 10 as expression presets (cap 16) overriding
`eyes/brows/mouth`; the other packs ship four (neutral, happy, sad, angry).
Mouth parts also include a **5-step openness strip**
(`mouth_talk_0..4`: closed → small → mid → open → wide, tagged `viseme`) matching the 3D
lip-sync module's `MOUTH_FRAMES := 5` fallback, so amplitude-driven talking (VN stage
amplitude mouth, Chat3D openness channel, JRPG mouth-strip) can animate the same art.
The studio's "Talk" panel does not read this strip yet: it cycles three frames
(closed / half / open) and opens the chosen mouth by a transform, since no pack
sets `viseme` / `visemeOf`.

**Legal posture (from the 3D legal inventory):** commercial kemono/fursuit sources
(BOOTH VN3 packs, Cults3D heads, TheRPGslayer bases) are STYLE-REFERENCE-ONLY. Never
trace, copy, or vectorize them. Everything in these packs is original art; SRD-derived
names/types carry `source:"SRD 5.1"` + the pack-level CC-BY attribution string.

### Sources consulted (drawing guides)

- Clip Studio Tips — [How to draw chibi body ratio](https://tips.clip-studio.com/en-us/articles/4806) (1:2–1:4 ratios, half-length hands/feet, 2-joint fingers)
- Envato Tuts+ — [How to Draw Simple Cute Animals in Chibi Style](https://design.tutsplus.com/tutorials/how-to-draw-simple-cute-animals-in-chibi-style--cms-27467) (head ≈ 2× body, tiny muzzle, huge-or-tiny ears, shape-first construction)
- FIHEROE — [Detailed Guide to Drawing Chibi Characters](https://www.fiheroe.com/blogs/anime-drawing-all-things-animation/detailed-guide-to-drawing-chibi-characters-with-proportion-tips) (ban straight lines, baby-fat cheeks, big-forehead eye placement)
- DIY.org — [Design a Chibi Character Based on an Animal](https://www.diy.org/challenges/design-a-chibi-character-based-on-an-animal) (three-signature-feature rule)
- Medialoot — [Design a Kawaii character in Illustrator](https://medialoot.com/blog/tutorial-how-to-design-a-kawaii-squid-in-illustrator/) (blush offset under eyes, flat kawaii construction)
- getillustrations — [Flat Vector Illustration: A Complete Guide](https://getillustrations.com/blog/flat-vector-illustration-guide/) (3–6 colors: primary/secondary/neutral/accent; consistent stroke weight)
- Research from the platform's companion 3D character-forge project (kemono
  and JRPG-base proportion technique surveys, plus a legal-clearance review
  of reference sources) and its `proportions.gd` numeric bands. The shared
  cross-medium face spec in §7 traces back to that research, which in turn
  cites: fursonafy/fursuitcommissions anthro-proportion guides,
  vsquad/skyryedesign anime-head guides, and a survey of the kemono style
  (VN3/BOOTH ecosystem — style reference only, no asset reuse).
