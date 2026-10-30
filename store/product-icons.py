#!/usr/bin/env python3
"""Renders the icons of the one-time products for the Play Console.

    python3 store/product-icons.py

Output: store/output/products/<productId>.png, 1024x1024 32-bit PNG. The Play Developer API has no icon field for
one-time products, so these are uploaded by hand: Play Console -> Monetise -> Products -> One-time products ->
product -> Icon (store/PLAY-CONSOLE.md, step 5). Google's rules: 512-1080 px square, 32-bit PNG, the artwork
centred in about half the canvas, a plain background. The artwork is the app's own Lucide icons (ISC), read from
node_modules so they stay the ones the app shows, on the brand blue of the feature graphic; rsvg-convert renders
the SVG (scripts/make-icons.py uses it too).
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "node_modules/lucide-react-native/dist/esm/icons")
OUTPUT = os.path.join(ROOT, "store/output/products")

# product id -> the Lucide icon the app uses for it (Full access: the key of Me > Full access; the fresh tutor:
# the sparkle of the new-tutor card; pay it forward: a gift)
PRODUCTS = {"eszett_full_access": "key-round", "eszett_fresh_tutor": "sparkles", "eszett_gift": "gift"}
SIZE = 1024
ARTWORK = 520  # the icon's 24-unit grid is scaled to this many pixels, centred


def lucide_nodes(name):
    """The SVG elements of a Lucide icon from its ESM module: [tag, attributes] pairs."""
    path = os.path.join(ICONS, f"{name}.mjs")
    with open(path, encoding="utf-8") as f:
        source = f.read()
    # the node array ends where the next top-level key (aliases) or the object's closing brace begins
    match = re.search(r"node:\s*(\[.*?\])\s*(?:,\s*\n\s*\w+:|\n\s*\};)", source, re.S)
    if not match:
        sys.exit(f"cannot read the icon data of {name}")
    # the module is JS: unquoted keys and trailing commas -> JSON
    text = re.sub(r"(\w+):", r'"\1":', match.group(1))
    text = re.sub(r",\s*([\]}])", r"\1", text)
    nodes = json.loads(text)
    return [(tag, {k: v for k, v in attrs.items() if k != "key"}) for tag, attrs in nodes]


def svg(name):
    nodes = lucide_nodes(name)
    scale = ARTWORK / 24
    offset = (SIZE - ARTWORK) / 2
    def element(tag, attrs):
        attributes = " ".join('%s="%s"' % (k, v) for k, v in attrs.items())
        return "<%s %s/>" % (tag, attributes)

    shapes = "".join(element(tag, attrs) for tag, attrs in nodes)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <defs>
    <radialGradient id="g" cx="78%" cy="22%" r="90%">
      <stop offset="0" stop-color="#5f7bff"/>
      <stop offset="1" stop-color="#2442c6"/>
    </radialGradient>
  </defs>
  <rect width="{SIZE}" height="{SIZE}" fill="url(#g)"/>
  <g transform="translate({offset} {offset}) scale({scale})" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    {shapes}
  </g>
</svg>
"""


def main():
    os.makedirs(OUTPUT, exist_ok=True)
    for product, icon in PRODUCTS.items():
        svg_path = os.path.join(OUTPUT, f"{product}.svg")
        png_path = os.path.join(OUTPUT, f"{product}.png")
        with open(svg_path, "w", encoding="utf-8") as f:
            f.write(svg(icon))
        subprocess.run(["rsvg-convert", "-w", str(SIZE), "-h", str(SIZE), "-o", png_path, svg_path], check=True)
        os.remove(svg_path)
        print(f"{product}.png ({icon})")


if __name__ == "__main__":
    main()
