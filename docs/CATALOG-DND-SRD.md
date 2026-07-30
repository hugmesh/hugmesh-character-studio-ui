# Open-Source D&D Content Catalog — Character-Creator Base Library

*Part of [hugmesh-character-studio-ui](../README.md).*

**Source of all content below:** the **D&D System Reference Document 5.1 (SRD 5.1)**, released by Wizards of the Coast LLC under the **Creative Commons Attribution 4.0 International License (CC-BY-4.0)** on **January 27, 2023**. This release is irrevocable. (The same SRD was historically available under OGL 1.0a; CC-BY-4.0 is the cleaner, permanent basis this pack relies on.)

> **Scope:** this catalog is the *spec*. We use SRD names/types only as **design labels** for parts; we ship our own original SVG art. We do **not** copy SRD prose, stat blocks, or images. **Status:** the full-catalog art pass is complete — `srd-taxonomy-v1` v2 ships original chibi art per [`ART-STYLE-CHIBI.md`](ART-STYLE-CHIBI.md) for every species below (each is a part entry or a tag on one, enforced by the pack assembler's coverage check).

## Required attribution string (every SRD pack MUST carry this verbatim)

In the SRD pack's `pack.json` `attribution` field, an `ATTRIBUTION.txt`, and an in-app "Credits" view:

> **"This work includes material taken from the System Reference Document 5.1 (\"SRD 5.1\") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode."**

Per the SRD legal text: do **not** add any other attribution regarding Wizards beyond the statement above. "Compatible with fifth edition" / "5E compatible" is allowed.

---

## EXCLUSIONS — closed WotC Product Identity, NEVER ship these

Not in SRD 5.1; keep out of every pack, asset name, and head archetype:

- **beholder** (+ spectator, death tyrant), **mind flayer / illithid** (+ elder brain), **githyanki / githzerai**, **slaad** (all), **umber hulk**, **kuo-toa**, **yuan-ti**, **displacer beast**, **carrion crawler**
- **bullywug** — **NOT in SRD** (Monster Manual only) — *excluded despite often being listed with SRD humanoids*
- Named characters/settings (Strahd, Forgotten Realms / Greyhawk names not in SRD)
- Watch-list to exclude: intellect devourer, gas spore, grell, banderhobb, flumph, modron, neogi, nothic, quaggoth, gauth
- **Rule of thumb:** if it is not in the lists below, do not ship it.

---

## 1. CLASSES — 12 SRD classes → OUTFIT / THEME sets

All 12 are SRD 5.1. A class is **not a creature** — it maps to `category:clothing` / `category:accessory` parts overlaying any head/base. Default `compatibleHeads:["*"]`.

| Class | clothing (`category:clothing`) | accessory (`category:accessory`) |
|---|---|---|
| **Barbarian** | fur-pelt, hide-armor, bare-chest-straps | greataxe, bone-jewelry, war-paint |
| **Bard** | traveling-doublet, feathered-cloak, colorful-tunic | lute, rapier, feathered-cap |
| **Cleric** | chain-mail-robe, priest-vestments, tabard | mace, shield-holy-symbol, holy-symbol-amulet |
| **Druid** | leather-armor, living-cloak, bark-robe | wooden-staff, sickle, antler-circlet, belt-pouch-herbs |
| **Fighter** | plate-armor, chain-mail, surcoat | longsword, kite-shield, great-helm |
| **Monk** | simple-gi, sash-belt, wrapped-robe | quarterstaff, hand-wraps, prayer-beads |
| **Paladin** | ornate-plate, holy-tabard, heraldic-surcoat | longsword-glow, heater-shield-sigil, winged-helm |
| **Ranger** | hooded-leather, green-cloak, studded-leather | longbow, quiver, twin-shortswords |
| **Rogue** | dark-leather, hooded-cloak, fitted-tunic | dagger-pair, lockpicks, face-mask |
| **Sorcerer** | arcane-coat, silk-robe, ember-mantle | crystal-focus, glowing-runes-hands |
| **Warlock** | dark-mantle, tattered-robe, high-collar-coat | pact-tome, eldritch-rod, sigil-pendant |
| **Wizard** | long-robe, star-mantle, scholar-coat | pointed-hat, gnarled-staff, spellbook |

> Heavy armor (plate/chain) may need `compatibleHeads` narrowed if a torso silhouette is archetype-specific (e.g. avian/draconic). Shields/weapons/hats are `accessory` → mix across classes freely.

---

## 2. PLAYABLE RACES / CREATURES (SRD) → `base` / `head` parts

Nine SRD races. Each → `category:base` body + `category:head` with a `headArchetype`, plus signature `category:feature` parts.

| Race | headArchetype | signature feature parts |
|---|---|---|
| **Human** | `humanoid` | — |
| **Dwarf** | `humanoid` | thick-beard, stout-brow (Hill Dwarf) |
| **Elf** | `humanoid` | pointed-ears, angular-brow (High Elf) |
| **Half-Elf** | `humanoid` | pointed-ears (subtle) |
| **Halfling** | `humanoid` | rounded-ears, curly-hair (Lightfoot) |
| **Gnome** | `humanoid` | large-nose, pointed-ears-small (Rock Gnome) |
| **Half-Orc** | `humanoid` | lower-tusks, heavy-jaw, green-skin (tint) |
| **Tiefling** | `humanoid` | horns (`compatibleHeads:["humanoid"]`), tail-spaded, solid-eyes |
| **Dragonborn** | `reptile` (draconic) | draconic-snout, scales-tint, frill; eyes.reptilian |

> Tiefling = humanoid base + detachable horns/tail features (reuse onto other humanoid heads). Dragonborn reuses the **`reptile`** archetype shared with reptilian monsters / lizardfolk.

---

## 3. MONSTERS — SRD-OPEN ONLY, by head archetype

Verified against the SRD 5.1 monster-by-type index. `headArchetype` in parens.

- **Dragons (`reptile`):** chromatic Black/Blue/Green/Red/White + metallic Brass/Bronze/Copper/Gold/Silver (all tiers); kin: Wyvern, Pseudodragon, Dragon Turtle.
- **Giants (`humanoid`, oversized):** Hill/Stone/Frost/Fire/Cloud/Storm; Ettin (two-head), Ogre, Oni, Troll.
- **Elementals (`synth`/elemental-mass):** Air/Earth/Fire/Water; kin: Azer(`humanoid`), Djinni/Efreeti(`humanoid`), Salamander(`reptile`), Mephits(`synth`), Magmin, Gargoyle, Invisible Stalker, Xorn.
- **Fiends:** Hell Hound(`canid`), Nightmare(`equine`), Rakshasa(`felid`), Night Hag(`humanoid`). **Demons:** Balor, Dretch, Glabrezu, Nalfeshnee, Quasit(`humanoid`); Hezrou(`reptile` toad); Vrock(`avian`); Marilith(`reptile` serpentine). **Devils:** Imp, Lemure, Barbed/Bearded/Bone/Chain/Horned/Ice Devil, Pit Fiend, Erinyes(`humanoid`). **Shapechanger:** Succubus/Incubus(`humanoid`).
- **Undead:** Skeleton/Zombie/Ghoul/Ghast/Wight/Wraith/Specter/Shadow/Ghost/Lich/Vampire/Mummy (`humanoid`, decayed/spectral/skeletal); Will-o'-Wisp(`synth`); Minotaur Skeleton(`bovid_cervid`), Warhorse Skeleton(`equine`).
- **Constructs (`synth`):** Golems Clay/Flesh/Iron/Stone (Flesh→`humanoid` stitched), Animated Armor, Flying Sword, Rug of Smothering, Shield Guardian; Homunculus(`reptile`).
- **Fey:** Dryad(`plant`/`humanoid`), Satyr(`bovid_cervid`), Sprite(`humanoid`); Blink Dog(`canid`); Green/Sea Hag(`humanoid`).
- **Celestials:** Couatl(`reptile` feathered serpent); Deva/Planetar/Solar(`humanoid` winged); Pegasus/Unicorn(`equine`).
- **Beasts (by archetype):** canid(Wolf/Dire Wolf/Jackal/Mastiff), felid(Lion/Tiger/Panther/Saber-Tooth), avian(Eagle/Hawk/Owl/Raven/Vulture + Giant), reptile(Crocodile/Giant Lizard/Snakes/Plesiosaurus/Triceratops/T-Rex), ursine_musteline(Bears/Badger/Weasel), equine(Horses/Pony/Mule/Camel), bovid_cervid(Deer/Elk/Goat/Boar/Mammoth/Rhino), lagomorph_rodent(Rat/Giant Rat/Stirge).
- **Plants (`plant` — proposed new archetype, else `synth`):** Treant, Shambling Mound, Awakened Tree/Shrub, Shrieker, Violet Fungus.
- **Aberrations (SRD-OPEN = exactly):** Aboleth(`reptile`/piscine), Chuul(`synth`), Cloaker(`synth`), Gibbering Mouther(`synth`), Otyugh(`synth`). Grick is SRD but a **Monstrosity** (`synth`), not an Aberration. *(beholder/mind flayer/grell/intellect devourer EXCLUDED.)*
- **Oozes (`synth`, no head):** Gelatinous Cube, Gray Ooze, Ochre Jelly, Black Pudding.
- **Humanoid monsters:** Goblin/Hobgoblin/Bugbear(`humanoid` goblinoid), Kobold(`reptile`), Gnoll(`canid` hyena), Orc(`humanoid` tusked), Lizardfolk(`reptile`), Sahuagin(`reptile` piscine), **Troglodyte(`reptile`) — confirmed SRD**, Merfolk(`humanoid` piscine), Drow/Duergar/Svirfneblin/Grimlock(`humanoid`). **Lycanthropes:** Werewolf(`canid`)/Werebear(`ursine_musteline`)/Wereboar(`bovid_cervid`)/Wererat(`lagomorph_rodent`)/Weretiger(`felid`) = `humanoid` base + beast-head swap. *(bullywug/kuo-toa/yuan-ti EXCLUDED.)*
- **Monstrosities (SRD-open, iconic, safe):** Minotaur(`bovid_cervid`), Centaur(`equine`), Medusa(`humanoid`+snake-hair), Harpy(`avian`), Manticore(`felid`+`avian`), Owlbear(`avian`/`ursine_musteline`), Chimera(multi), Cockatrice(`avian`), Gorgon(`bovid_cervid`), Griffon/Hippogriff(`avian`/`equine`), Sphinxes(`felid`+`avian`), Doppelganger(`humanoid`), Drider(`humanoid`+spider), Naga(`reptile`), Tarrasque/Kraken/Roc/Purple Worm/Hydra(large `reptile`/`synth`).

---

## DATA-MODEL FOLD-IN — how these become `pack.json` parts

Each catalog entry → one part object:

```json
{ "id": "head.dragonborn", "category": "head", "headArchetype": "reptile",
  "displayName": "Dragonborn", "source": "SRD 5.1", "file": "parts/head/dragonborn.svg",
  "tags": ["race", "draconic"] }
```

Rules:
1. **Races / monster heads** → `category:"base"` (body) + `category:"head"`, each with a `headArchetype` (`canid|felid|avian|reptile|equine|bovid_cervid|ursine_musteline|synth|humanoid|lagomorph_rodent`, plus proposed **`plant`** — `headArchetype` is a free-form string so `plant` needs no model change).
2. **Signature features** (tiefling horns/tail, dragonborn snout/scales, half-orc tusks, satyr horns, medusa snake-hair) → `category:"feature"` with `compatibleHeads` set to the fitting archetypes (horns `["humanoid"]`, snout `["reptile"]`).
3. **Classes** → `category:"clothing"`/`"accessory"` with `compatibleHeads:["*"]` (narrow only for archetype-specific silhouettes).
4. **`eyes`:** `eyes.reptilian` (dragonborn/kobold/lizardfolk), `eyes.solid-glow` (tiefling/undead/fiends), `eyes.beast` (beasts).
5. **`headArchetype` reuse is the win:** dragonborn/kobold/lizardfolk/troglodyte/sahuagin/dragons share `reptile`; gnoll/werewolf/hell hound share `canid`. Build archetype art once, reskin via `tint`/`tags`.
6. **Every SRD part carries `"source":"SRD 5.1"`**; the SRD pack root carries the CC-BY attribution string. Anything that cannot cite SRD 5.1 must not enter the pack.
7. **Art status: shipped.** The v2 chibi pass covers the full catalog; this catalog remains the spec for any future additions.

Proposed enum additions (optional): `plant` (treant/shambling mound/dryad); consider `piscine`/`crustacean` for aboleth/sahuagin/chuul/merfolk, else fold into `reptile`/`synth`.

---

### Sources
- SRD 5.1 (CC) official PDF — media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf
- SRD — D&D Beyond (dndbeyond.com/srd) · 5thsrd.org Monsters-by-Type index · 5esrd.com Races
- Bullywug is MM-only (dandwiki.com/wiki/5e_SRD:Bullywug) — confirmed excluded
