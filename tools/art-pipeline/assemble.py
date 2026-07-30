#!/usr/bin/env python3
"""Assemble srd-taxonomy-v1 pack.json v2 from agent fragment JSONs.

Merges fragments/<key>.json part lists into the pack's slot table, preserves the
SRD attribution, wires expressions (when the faces fragment provides them), and
runs pre-validator checks: id uniqueness, file existence, svgClass binding,
size caps, and catalog species coverage via ids/displayNames/tags.
"""
import json, re, sys, glob, os

WT = os.environ.get("CHIBI_WT") or os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PACK_DIR = os.path.join(WT, "src/assets/vn/packs/srd-taxonomy-v1")
PACK = os.path.join(PACK_DIR, "pack.json")
FRAG_DIR = os.path.dirname(os.path.abspath(__file__))

SLOT_ORDER = [
    ("backdrop", 0, False), ("tail", 10, False), ("wings", 15, False),
    ("body", 20, True), ("clothing", 40, False), ("head", 60, True),
    ("feature", 80, False), ("brows", 90, False), ("eyes", 100, True),
    ("mouth", 110, False), ("accessory", 130, False),
]
ANCHOR = {"x": 0.5, "y": 0.5}

# Catalog species that must be represented (entry id, displayName, or tags).
SPECIES = """human dwarf elf half-elf halfling gnome half-orc tiefling dragonborn
goblin hobgoblin bugbear kobold gnoll orc lizardfolk sahuagin troglodyte merfolk
drow duergar svirfneblin grimlock doppelganger
dragon wyvern pseudodragon giant ogre oni troll ettin
elemental azer salamander mephit magmin gargoyle xorn
hell-hound nightmare rakshasa night-hag balor dretch glabrezu nalfeshnee quasit
hezrou vrock marilith imp lemure devil pit-fiend erinyes succubus
skeleton zombie ghoul ghast wight wraith specter shadow ghost lich vampire mummy
will-o-wisp golem animated-armor flying-sword shield-guardian homunculus
dryad satyr sprite blink-dog hag couatl deva pegasus unicorn
wolf dire-wolf jackal mastiff lion tiger panther saber-tooth eagle hawk owl raven
vulture crocodile plesiosaurus triceratops t-rex bear badger weasel horse pony
mule camel deer elk goat boar mammoth rhino rat stirge
treant shambling-mound awakened-tree shrieker violet-fungus
aboleth chuul cloaker gibbering-mouther otyugh grick
gelatinous-cube gray-ooze ochre-jelly black-pudding
werewolf werebear wereboar wererat weretiger
minotaur centaur medusa harpy manticore owlbear chimera cockatrice gorgon
griffon hippogriff sphinx drider naga tarrasque kraken roc purple-worm hydra
spider""".split()

EXCLUDED = re.compile(
    r"beholder|illithid|mind.?flayer|githyanki|githzerai|slaad|umber.?hulk|"
    r"kuo.?toa|yuan.?ti|displacer|carrion.?crawler|bullywug|flumph|modron|"
    r"neogi|nothic|quaggoth|gauth|grell|intellect.?devourer|gas.?spore|banderhobb",
    re.I)

def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())

# Palette-alias entries folded into their base entry's tags to stay under the
# 100-parts-per-slot picker cap (validator). Coverage survives via tags; the
# iconic aliases (Metallic Dragon, elementals, Drow, Unicorn/Pegasus, Satyr,
# Gelatinous Cube, golem/giant variants) keep their own picker entries.
ALIAS_FOLD = {
    "head_hawk_01": "head_avian_01", "head_polarbear_01": "head_bear_01",
    "head_direwolf_01": "head_canid_01", "head_jackal_01": "head_canid_01",
    "head_mastiff_01": "head_canid_01", "head_mammoth_01": "head_deer_01",
    "head_rhino_01": "head_deer_01", "head_grimlock_01": "head_doppelganger_01",
    "head_duergar_01": "head_dwarf_01", "head_svirfneblin_01": "head_gnome_01",
    "head_camel_01": "head_equine_01", "head_pony_01": "head_equine_01",
    "head_nightmare_01": "head_equine_01", "head_vulture_01": "head_raven_01",
    "head_giant_rat_01": "head_rodent_01", "head_ghoul_01": "head_zombie_01",
}

def main():
    pack = json.load(open(PACK))
    frags = sorted(p for p in glob.glob(os.path.join(FRAG_DIR, "*.json"))
                   if not p.endswith("assemble.json"))
    slots = {name: [] for name, _, _ in SLOT_ORDER}
    seen, errors, expressions, expr_slots = {}, [], None, None
    fold_tags = {}

    for fp in frags:
        frag = json.load(open(fp))
        key = frag.get("agent", os.path.basename(fp))
        if frag.get("expressions"):
            expressions, expr_slots = frag["expressions"], frag.get("expressionSlots")
        for item in frag.get("parts", []):
            slot, part = item.get("slot"), item.get("part", {})
            pid = part.get("id", "?")
            if pid in ALIAS_FOLD:
                fold_tags.setdefault(ALIAS_FOLD[pid], []).extend(
                    [part.get("displayName", pid)] + part.get("tags", []))
                continue
            if slot not in slots:
                errors.append(f"{key}: unknown slot '{slot}' for {pid}"); continue
            if pid in seen:
                errors.append(f"{key}: duplicate id {pid} (also from {seen[pid]})"); continue
            seen[pid] = key
            if EXCLUDED.search(pid) or EXCLUDED.search(part.get("displayName", "")):
                errors.append(f"{key}: {pid} matches the WotC exclusion list"); continue
            f = os.path.join(PACK_DIR, part.get("file", ""))
            if not os.path.isfile(f):
                errors.append(f"{key}: {pid} missing file {part.get('file')}"); continue
            sz = os.path.getsize(f)
            if sz > 8192:
                errors.append(f"{key}: {pid} file {sz}B > 8192B cap")
            svg = open(f).read()
            declared = {tr["svgClass"] for tr in part.get("tintRegions", [])}
            used = set(re.findall(r'class="([^"]+)"', svg))
            used = {c for cs in used for c in cs.split()}
            for c in declared - used:
                errors.append(f"{key}: {pid} declares svgClass {c} not present in SVG")
            for c in used - declared:
                errors.append(f"{key}: {pid} SVG uses class {c} not declared in tintRegions")
            slots[slot].append(part)

    for name in slots:
        slots[name].sort(key=lambda p: p["id"])

    for parts_list in slots.values():
        for p in parts_list:
            if p["id"] in fold_tags:
                tags = p.setdefault("tags", [])
                for t in fold_tags[p["id"]]:
                    slug = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
                    if slug and slug not in tags:
                        tags.append(slug)
    for base in fold_tags:
        if base not in seen:
            errors.append(f"ALIAS_FOLD base {base} not present in any fragment")

    # Persisted characters reference part ids — every v1 id must survive the v2 pass.
    LEGACY = [
        "body_canid_01", "body_felid_01", "body_avian_01", "body_reptile_01",
        "body_synth_01", "body_humanoid_01", "body_dragonborn_01", "body_tiefling_01",
        "head_canid_01", "head_felid_01", "head_avian_01", "head_reptile_01",
        "head_synth_01", "head_humanoid_01", "head_dragonborn_01", "head_tiefling_01",
        "head_dwarf_01", "head_elf_01",
        "eyes_round_01", "eyes_visor_01", "eyes_reptilian_01",
        "muzzle_beak_01", "horns_tiefling_01",
    ]
    for lid in LEGACY:
        if lid not in seen:
            errors.append(f"LEGACY id {lid} not re-declared by any fragment")

    covered = set()
    for parts in slots.values():
        for p in parts:
            blob = " ".join([p["id"], p.get("displayName", "")] + p.get("tags", []))
            covered.add(norm(blob))
    coverage_blob = " ".join(covered)
    missing = [s for s in SPECIES if norm(s) not in coverage_blob]

    pack["version"] = "2.0.0"
    pack["displayName"] = "SRD Chibi — All Species"
    pack["slots"] = [
        {"slot": n, "zOrder": z, "required": req, "anchor": dict(ANCHOR), "parts": slots[n]}
        for n, z, req in SLOT_ORDER if slots[n]
    ]
    if expressions:
        pack["expressionSlots"] = expr_slots or ["eyes", "brows", "mouth"]
        pack["expressions"] = expressions

    for e in errors:
        print("ERROR:", e)
    if missing:
        print("COVERAGE MISSING:", ", ".join(missing))
    total = sum(len(v) for v in slots.values())
    print(f"parts: {total} across {sum(1 for v in slots.values() if v)} slots; "
          f"{len(errors)} errors; {len(missing)} species uncovered")
    if "--write" in sys.argv:
        json.dump(pack, open(PACK, "w"), indent=2)
        open(PACK, "a").write("\n")
        print("WROTE", PACK)

if __name__ == "__main__":
    main()
