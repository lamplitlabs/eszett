#!/usr/bin/env python3
"""Builds the website's self-hosted fonts from the app's own font packages.

    python3 scripts/web-fonts.py

Reads Fira Sans and Vollkorn from node_modules/@expo-google-fonts (the faces the app bundles), subsets them to the
scripts the site uses (Latin incl. German, Turkish and Polish letters; Cyrillic for ru/uk; Arabic and Chinese pages
fall back to the system fonts the CSS names) and writes WOFF2 files to web/assets/fonts/ plus the @font-face
block to web/assets/fonts/fonts.css. Self-hosting keeps visitors' IP addresses away from Google (the 2022 LG München
ruling on Google Fonts), removes the render-blocking request, and lets the privacy policy drop the Google Fonts
section. Needs fontTools and brotli (pip install --user fonttools brotli).
"""
import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web/assets/fonts")
# family -> [(package glob, weight, style, file stem)]
FACES = {
    "Fira Sans": [
        ("fira-sans/400Regular/*.ttf", 400, "normal", "fira-sans-400"),
        ("fira-sans/500Medium/*.ttf", 500, "normal", "fira-sans-500"),
        ("fira-sans/600SemiBold/*.ttf", 600, "normal", "fira-sans-600"),
    ],
    "Vollkorn": [
        ("vollkorn/400Regular/*.ttf", 400, "normal", "vollkorn-400"),
        ("vollkorn/400Regular_Italic/*.ttf", 400, "italic", "vollkorn-400-italic"),
        ("vollkorn/600SemiBold/*.ttf", 600, "normal", "vollkorn-600"),
        ("vollkorn/700Bold/*.ttf", 700, "normal", "vollkorn-700"),
    ],
}
# Basic Latin, Latin-1, Latin Extended-A/B (ß, ö, ğ, ł, ș …), general punctuation, currency, Cyrillic incl. Ukrainian
UNICODES = "U+0000-00FF,U+0100-024F,U+0259,U+2000-206F,U+20A0-20CF,U+2122,U+2190-2199,U+2212,U+2713,U+0400-04FF,U+0500-052F"


def main():
    os.makedirs(OUT, exist_ok=True)
    css = ["/* Self-hosted fonts, built by scripts/web-fonts.py from the app's @expo-google-fonts packages (SIL OFL). */"]
    for family, faces in FACES.items():
        for pattern, weight, style, stem in faces:
            files = glob.glob(os.path.join(ROOT, "node_modules/@expo-google-fonts", pattern))
            if not files:
                sys.exit(f"font not found: {pattern} (run npm ci)")
            target = os.path.join(OUT, f"{stem}.woff2")
            subprocess.run([sys.executable, "-m", "fontTools.subset", files[0], f"--unicodes={UNICODES}", "--flavor=woff2",
                            "--layout-features=*", "--no-hinting", "--desubroutinize", f"--output-file={target}"], check=True)
            size = os.path.getsize(target) // 1024
            css.append(f"@font-face {{ font-family: '{family}'; font-style: {style}; font-weight: {weight}; font-display: swap; src: url('/assets/fonts/{stem}.woff2') format('woff2'); unicode-range: {UNICODES}; }}")
            print(f"{stem}.woff2 {size} KB")
    with open(os.path.join(OUT, "fonts.css"), "w", encoding="utf-8") as f:
        f.write("\n".join(css) + "\n")
    print("fonts.css")


if __name__ == "__main__":
    main()
