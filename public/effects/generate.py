#!/usr/bin/env python
"""Generate the pooled explosion sprite for public/effects/.

One warm top-down fireball, drawn so the *edge of the texture is the edge of the
blast*: the scene scales it so the full texture width == the detonator's blast
diameter, so a bright shock ring baked near the rim lands on the AoE boundary
while the hot core fills the middle.  Composited from EVFX Blast textures (the
soft radial glow, the 4-point flash, a smoke puff) over a procedural fire
gradient + shock ring, then colourised warm.  It is drawn additively on the dark
play area, so RGB carries the fire and alpha carries the falloff to transparent
at the rim.  See plans/05-assets.md.

Re-run to regenerate: `python public/effects/generate.py`.
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
# EVFX Blast MZ effect textures (Humble Bundle - see ASSETS.md).  Point this at your copy.
SRC = r"D:\Sprites\Humble Bundles\Game Creator - September 2024\Effects\evfxblast\EVFX Blast MZ Demo\effects\Texture"
N = 256  # output is NxN RGBA


def load_alpha(name, size=N):
    """An EVFX texture's shape as a 0..1 alpha field (they are white-on-transparent)."""
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGBA").resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32)[:, :, 3] / 255.0


def radial():
    """Distance-from-centre field r in [0, ~1.41], and r clamped to the unit disc."""
    ax = (np.arange(N, dtype=np.float32) - (N - 1) / 2) / ((N - 1) / 2)
    y, x = np.meshgrid(ax, ax, indexing="ij")
    return np.sqrt(x * x + y * y)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def main():
    r = radial()

    # Fire body: hottest at the core, falling to nothing right at the rim (r == 1) so the
    # sprite's footprint is exactly the blast disc.  A touch of the EVFX soft glow warms the falloff.
    core = np.clip(1.0 - smoothstep(0.0, 0.95, r), 0.0, 1.0) ** 1.4
    core = np.maximum(core, 0.55 * load_alpha("DCSD_Circle_G075"))

    # Shock ring: a bright thin band near the rim that marks where the AoE ends.
    ring = np.exp(-((r - 0.88) ** 2) / (2 * 0.045 ** 2))

    # Flash spikes + a little smoke break up the disc so it reads as an explosion, not a dot.
    flash = load_alpha("DCSD_Star4_T002")
    smoke = load_alpha("DCSD_Smoke001")

    intensity = np.clip(core + 0.9 * ring + 0.5 * flash, 0.0, 1.6)
    # Keep everything inside the blast disc; nothing spills past the radius.
    disc = 1.0 - smoothstep(0.97, 1.02, r)
    intensity *= disc

    # Warm colour ramp: white-hot core -> orange -> deep red at the rim, read off intensity.
    white = np.array([1.00, 0.97, 0.85])
    orange = np.array([1.00, 0.55, 0.12])
    red = np.array([0.75, 0.13, 0.05])
    t = np.clip(intensity / 1.2, 0.0, 1.0)[:, :, None]
    rgb = np.where(t > 0.6, white * (t - 0.6) / 0.4 + orange * (1 - (t - 0.6) / 0.4),
                   orange * (t / 0.6) + red * (1 - t / 0.6))
    # Dust the fireball with darker smoke so the hot parts have some structure.
    rgb = rgb * (1.0 - 0.35 * smoke[:, :, None] * disc[:, :, None])

    alpha = np.clip(intensity, 0.0, 1.0) * disc
    out = np.concatenate([np.clip(rgb, 0, 1), alpha[:, :, None]], axis=2)
    img = Image.fromarray((out * 255).astype(np.uint8), "RGBA")
    path = os.path.join(HERE, "explosion.png")
    img.save(path)
    print("wrote", path, img.size)


if __name__ == "__main__":
    main()
