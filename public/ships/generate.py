#!/usr/bin/env python
"""Generate white top-down ship silhouettes for public/ships/.

Each ship is drawn as white polygons on a transparent background, nose pointing
+X (right) to match the engine's rotation convention (angle 0 == facing right,
transform.width == front-to-back length along X). Shapes are authored in a unit
box [0,1]x[0,1] (x=0 tail, x=1 nose, y=0.5 centreline) then scaled to a texture
whose pixel aspect ratio matches each type's width:height so it is not distorted
when the game does setScale(transform.width/tex.width, transform.height/tex.height).
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

PX_PER_UNIT = 4      # texture resolution: 4 device px per game unit
SS = 8               # supersample factor for anti-aliasing

# width:height in game units (from SHIP_TYPE_DEFS) -> texture px size
SIZES = {
    "skiff":          (10, 5),
    "gunner":         (12, 8),
    "missile-frigate":(16, 10),
    "railgun-lancer": (18, 6),
    "detonator":      (12, 12),
    "bulwark":        (20, 16),
    "wasp":           (8, 6),
    "scatter-gun":    (14, 10),
    "stormcaller":    (14, 12),
    "carrier":        (24, 18),
}

def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

def mirror_y(poly):
    """Reflect a polygon across the y=0.5 centreline."""
    return [(x, 1.0 - y) for (x, y) in poly]

# Each entry: list of polygons (unit coords) unioned into a white silhouette.
def shapes(name):
    if name == "skiff":
        # Lean arrowhead dart with a notched tail.
        return [[(1.0, 0.5), (0.12, 0.06), (0.34, 0.5), (0.12, 0.94)]]

    if name == "wasp":
        # Tiny interceptor: needle fuselage + long swept-back delta wings.
        fus = [(1.0, 0.5), (0.25, 0.40), (0.25, 0.60)]
        wing = [(0.58, 0.5), (0.0, 0.04), (0.12, 0.5), (0.0, 0.96)]
        return [fus, wing]

    if name == "gunner":
        # Corvette with twin forward gun barrels and short swept wings.
        body = [(0.82, 0.5), (0.5, 0.30), (0.08, 0.40), (0.08, 0.60), (0.5, 0.70)]
        wing_t = [(0.55, 0.42), (0.0, 0.14), (0.28, 0.5)]
        wing_b = mirror_y(wing_t)
        barrel_t = [(0.55, 0.34), (1.0, 0.40), (1.0, 0.46), (0.55, 0.42)]
        barrel_b = mirror_y(barrel_t)
        return [body, wing_t, wing_b, barrel_t, barrel_b]

    if name == "missile-frigate":
        # Blunt hexagonal hull flanked by two boxy missile racks.
        hull = [(1.0, 0.5), (0.72, 0.30), (0.10, 0.34), (0.04, 0.5),
                (0.10, 0.66), (0.72, 0.70)]
        pod_t = rect(0.18, 0.06, 0.62, 0.30)
        pod_b = rect(0.18, 0.70, 0.62, 0.94)
        return [hull, pod_t, pod_b]

    if name == "railgun-lancer":
        # Very long slim needle with a small rear block (the coil/breech).
        needle = [(1.0, 0.5), (0.16, 0.38), (0.0, 0.5), (0.16, 0.62)]
        breech = rect(0.0, 0.26, 0.22, 0.74)
        return [needle, breech]

    if name == "detonator":
        # Radially symmetric spiky mine (no clear front - it is a kamikaze bomb).
        import math
        cx, cy = 0.5, 0.5
        spikes = 8
        r_out, r_in = 0.48, 0.26
        pts = []
        for i in range(spikes * 2):
            r = r_out if i % 2 == 0 else r_in
            a = math.pi * i / spikes
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        return [pts]

    if name == "bulwark":
        # Chunky armoured wall: broad blunt hull + a thick frontal shield plate.
        hull = [(0.88, 0.5), (0.78, 0.16), (0.22, 0.08), (0.05, 0.5),
                (0.22, 0.92), (0.78, 0.84)]
        plate = rect(0.80, 0.18, 0.98, 0.82)
        return [hull, plate]

    if name == "scatter-gun":
        # Shotgun: broad flat muzzle at the front, tapering to a point at the tail.
        body = [(0.98, 0.14), (0.98, 0.86), (0.35, 0.66), (0.04, 0.5), (0.35, 0.34)]
        return [body]

    if name == "stormcaller":
        # Angular emitter with a forward trident of prongs (arc caster).
        body = [(0.52, 0.16), (0.52, 0.84), (0.06, 0.66), (0.06, 0.34)]
        prong_m = [(0.5, 0.44), (1.0, 0.5), (0.5, 0.56)]
        prong_t = [(0.5, 0.26), (0.96, 0.12), (0.56, 0.42)]
        prong_b = mirror_y(prong_t)
        return [body, prong_m, prong_t, prong_b]

    if name == "carrier":
        # Big blocky mothership: rounded rectangle with a V hangar mouth at the bow.
        hull = [(0.14, 0.08), (0.86, 0.08), (1.0, 0.38), (0.72, 0.5), (1.0, 0.62),
                (0.86, 0.92), (0.14, 0.92), (0.04, 0.5)]
        return [hull]

    raise ValueError(name)

def render(name, wu, hu):
    w, h = wu * PX_PER_UNIT, hu * PX_PER_UNIT
    mask = Image.new("L", (w * SS, h * SS), 0)
    d = ImageDraw.Draw(mask)
    for poly in shapes(name):
        pts = [(x * (w * SS - 1), y * (h * SS - 1)) for (x, y) in poly]
        d.polygon(pts, fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)
    img = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    img.putalpha(mask)
    # White RGB everywhere so faction tint (setTint multiply) reads true.
    img.paste((255, 255, 255), (0, 0), mask)
    img.putalpha(mask)
    path = os.path.join(OUT, name + ".png")
    img.save(path)
    return path, (w, h)

for name, (wu, hu) in SIZES.items():
    path, size = render(name, wu, hu)
    print(f"{name:16s} {size[0]:3d}x{size[1]:3d}  {path}")

# Build a magnified contact sheet on a dark bg so shapes are easy to eyeball.
pad, cols = 16, 5
cells = list(SIZES.keys())
mag = 3
tw = max(w for (w, h) in [(wu*PX_PER_UNIT, hu*PX_PER_UNIT) for wu, hu in SIZES.values()]) * mag
th = tw
rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGBA", (cols*(tw+pad)+pad, rows*(th+pad)+pad), (24, 28, 36, 255))
for i, name in enumerate(cells):
    im = Image.open(os.path.join(OUT, name + ".png")).convert("RGBA")
    im = im.resize((im.width*mag, im.height*mag), Image.NEAREST)
    r, c = divmod(i, cols)
    x = pad + c*(tw+pad) + (tw-im.width)//2
    y = pad + r*(th+pad) + (th-im.height)//2
    sheet.alpha_composite(im, (x, y))
sheet.save(os.path.join(OUT, "_contact_sheet.png"))
print("contact sheet ->", os.path.join(OUT, "_contact_sheet.png"))
