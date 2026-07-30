#!/usr/bin/env python3
"""Compose + rasterize proof PNGs from fragment JSONs (pre-assembly QA tool).

Usage:
  python3 compose_proof.py OUTDIR head_dragon_01 [head_kobold_01 ...]
  python3 compose_proof.py OUTDIR head_dragon_01:body_reptile_01:tail_draconic_01

Each argument is a head id (auto-picks a compatible body by archetype) or an
explicit colon-joined part-id stack (drawn bottom-up in the given order plus
default eyes/mouth if present). Writes OUTDIR/<first-id>.svg + .png (256px)
and OUTDIR/sheet.png contact sheet. Requires rsvg-convert + PIL.
"""
import json, re, os, sys, glob, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.environ.get("CHIBI_PACK") or os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "assets", "vn", "packs", "srd-taxonomy-v1"))

parts = {}
for fp in glob.glob(os.path.join(HERE, "*.json")):
    try:
        for item in json.load(open(fp)).get("parts", []):
            parts[item["part"]["id"]] = (item.get("slot"), item["part"])
    except Exception:
        pass

ARCH_BODY = {"canid": "body_canid_01", "felid": "body_felid_01", "avian": "body_avian_01",
             "reptile": "body_reptile_01", "equine": "body_equine_01", "bovid_cervid": "body_bovid_01",
             "ursine_musteline": "body_ursine_01", "lagomorph_rodent": "body_rodent_01",
             "synth": "body_synth_01", "humanoid": "body_humanoid_01", "plant": "body_plant_01"}

def inner(svg):
    svg = re.sub(r"<svg[^>]*>", "", svg)
    svg = re.sub(r"</svg>\s*$", "", svg.strip())
    return re.sub(r"<style>[\s\S]*?</style>", "", svg)

def compose(ids, out):
    pal, layers = {}, []
    for pid in ids:
        if pid not in parts:
            print(f"  ! unknown part {pid} (skipped)"); continue
        _, p = parts[pid]
        svg = open(os.path.join(PACK, p["file"])).read()
        for tr in p.get("tintRegions", []):
            pal[tr["svgClass"]] = tr["defaultPalette"]
        layers.append(inner(svg))
    rules = "".join(
        f".{c}{{fill:none;stroke:{h};stroke-width:14;stroke-linecap:round}}" if c == "region-line"
        else f".{c}{{fill:{h}}}" for c, h in pal.items())
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
           f"<style>{rules}</style>" + "".join(layers) + "</svg>")
    open(out, "w").write(doc)

def main():
    outdir, specs = sys.argv[1], sys.argv[2:]
    os.makedirs(outdir, exist_ok=True)
    pngs = []
    for spec in specs:
        ids = spec.split(":")
        if len(ids) == 1:
            head = ids[0]
            arch = parts.get(head, (None, {}))[1].get("headArchetype", "humanoid")
            stack = [ARCH_BODY.get(arch, "body_humanoid_01"), head]
        else:
            stack = ids
        for prefix, extra in (("eyes_", "eyes_round_01"), ("mouth_", "mouth_smile_01")):
            if extra in parts and not any(i.startswith(prefix) for i in stack):
                stack.append(extra)
        name = f"{len(pngs):02d}_" + "-".join(i.replace("_01", "") for i in spec.split(":")[:3])
        svg = os.path.join(outdir, f"{name}.svg")
        compose(stack, svg)
        png = svg[:-4] + ".png"
        subprocess.run(["rsvg-convert", "-w", "256", "-h", "256",
                        "--background-color", "#ffffff", svg, "-o", png], check=True)
        pngs.append(png)
    from PIL import Image
    cols = min(4, max(1, len(pngs)))
    rows = (len(pngs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 264, rows * 264), "#dddddd")
    for i, f in enumerate(pngs):
        sheet.paste(Image.open(f).convert("RGB"), (4 + (i % cols) * 264, 4 + (i // cols) * 264))
    sheet.save(os.path.join(outdir, "sheet.png"))
    print("sheet:", os.path.join(outdir, "sheet.png"))

if __name__ == "__main__":
    main()
