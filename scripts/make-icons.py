#!/usr/bin/env python3
"""Regenerates the app icons in assets/images from the Eszett mark.

The mark is a Königsblau square (#2442C6, the app's `royal`) with the ß of Vollkorn Bold, the app's German
typeface, taken straight from the bundled TTF so the icon and the in-app mark (src/ui/Mark.tsx) share one outline.

  python3 -m venv .venv && .venv/bin/pip install fonttools pillow   # plus rsvg-convert (brew install librsvg)
  .venv/bin/python scripts/make-icons.py

Writes: icon.png (iOS and stores, 1024, no alpha, square corners: the platforms mask it), android-icon-foreground.png
and android-icon-monochrome.png (1024, the ß alone at 75 % so it clears the adaptive icon's 66 % safe zone), 
android-icon-background.png (the plain royal square), splash-icon.png (512, the rounded mark; app.json shows it
96 dp wide on paper or navy), favicon.png (96), and assets/brand/mark.svg (the outline for the RN component).
Then run `npx expo prebuild --platform android` to regenerate the launcher resources.
"""
import os, subprocess, sys, tempfile

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = f'{ROOT}/node_modules/@expo-google-fonts/vollkorn/700Bold/Vollkorn_700Bold.ttf'
OUT = f'{ROOT}/assets/images'
ROYAL = '#2442C6'


def eszett(height=64.0, cx=50.0, cy=51.0) -> tuple[str, str]:
    """The ß outline as (transform, path) in the 100-box: `height` units tall, centred on (cx, cy)."""
    f = TTFont(FONT)
    gs = f.getGlyphSet()
    name = f.getBestCmap()[ord('ß')]
    bounds = BoundsPen(gs); gs[name].draw(bounds)
    xmin, ymin, xmax, ymax = bounds.bounds
    s = height / (ymax - ymin)
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.1f}'); gs[name].draw(pen)
    return f'translate({cx - s * (xmin + xmax) / 2:.2f} {cy + s * (ymin + ymax) / 2:.2f}) scale({s:.4f} {-s:.4f})', pen.getCommands()


def svg(*, rx=22, background=True, scale=1.0) -> str:
    transform, d = eszett()
    letter = f'<g transform="{transform}"><path d="{d}" fill="#FFFFFF"/></g>'
    if scale != 1.0:
        letter = f'<g transform="translate(50 50) scale({scale}) translate(-50 -50)">{letter}</g>'
    bg = f'<rect width="100" height="100" rx="{rx}" fill="{ROYAL}"/>' if background else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{bg}{letter}</svg>'


def render(markup: str, px: int, path: str):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as t:
        t.write(markup); tmp = t.name
    subprocess.run(['rsvg-convert', '-w', str(px), '-h', str(px), '-o', path, tmp], check=True)
    os.unlink(tmp)


def main():
    render(svg(rx=0), 1024, f'{OUT}/icon.png')
    Image.open(f'{OUT}/icon.png').convert('RGB').save(f'{OUT}/icon.png')
    render(svg(background=False, scale=0.75), 1024, f'{OUT}/android-icon-foreground.png')
    render(svg(background=False, scale=0.75), 1024, f'{OUT}/android-icon-monochrome.png')
    Image.new('RGB', (1024, 1024), ROYAL).save(f'{OUT}/android-icon-background.png')
    render(svg(), 512, f'{OUT}/splash-icon.png')
    render(svg(), 96, f'{OUT}/favicon.png')
    with open(f'{ROOT}/assets/brand/mark.svg', 'w') as f:
        f.write('<!-- The Eszett mark: Koenigsblau square, the ß of Vollkorn Bold (scripts/make-icons.py regenerates assets/images from this outline). -->\n')
        f.write(svg() + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    sys.exit(main())
