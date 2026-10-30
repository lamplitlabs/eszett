#!/usr/bin/env python3
"""Renders the Google Play graphics from the device captures and the metadata.

    python3 store/compose.py                 # every locale
    python3 store/compose.py --lang de-DE    # one locale

Input:  store/captures/NN-name.png      phone screenshots (1080x2400, `adb exec-out screencap -p`), in display order
        store/metadata/android/<locale>/screenshots.txt   one caption per capture, same order
        assets/images/icon.png          the app icon (1024x1024)
Output: store/output/<locale>/phone/NN.png   1080x1920 framed screenshots with the caption (Play: 9:16, 2:1 at most)
        store/output/<locale>/feature.png    1024x500 feature graphic with the title and short description
        store/output/icon.png                512x512 app icon

Fonts come from node_modules (@expo-google-fonts), colours from the app's theme; Pillow only (scripts/make-icons.py uses it too).
"""
import argparse
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAPTURES = os.path.join(ROOT, "store/captures")
METADATA = os.path.join(ROOT, "store/metadata/android")
OUTPUT = os.path.join(ROOT, "store/output")
ICON = os.path.join(ROOT, "assets/images/icon.png")

ROYAL = (36, 66, 198)
ROYAL_DARK = (24, 32, 51)
PAPER = (245, 246, 249)
INK = (24, 32, 51)
INK_SOFT = (86, 96, 118)
ON_ROYAL = (231, 235, 251)
RTL = {"ar"}
CJK = {"zh-CN"}


def font(pattern, size):
    files = glob.glob(os.path.join(ROOT, "node_modules/@expo-google-fonts", pattern))
    if not files:
        sys.exit(f"font not found: {pattern} (run npm ci)")
    return ImageFont.truetype(files[0], size)


def system_font(size, bold=False):
    """A fallback for scripts Vollkorn/Fira do not cover (Arabic, Chinese): the system's Noto/PingFang."""
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Supplemental/NotoSansArabic-Regular.ttf" if not bold else "/System/Library/Fonts/Supplemental/NotoSansArabic-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def shape(text, locale):
    """Pillow on this machine joins and orders Arabic correctly with the system font; nothing to do. Kept as the
    one place to add arabic_reshaper/python-bidi should another build render Arabic letter by letter."""
    return text


def wrap(draw, text, fnt, width, locale):
    """Greedy line wrap by rendered width; Chinese wraps by character."""
    if locale in CJK:
        words = list(text)
        joiner = ""
    else:
        words = text.split(" ")
        joiner = " "
    lines, line = [], ""
    for word in words:
        trial = word if not line else line + joiner + word
        if draw.textlength(trial, font=fnt) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def caption_font(locale, size):
    if locale in RTL or locale in CJK:
        return system_font(size, bold=True)
    return font("vollkorn/600SemiBold/*.ttf", size)


def body_font(locale, size, weight="400Regular"):
    if locale in RTL or locale in CJK:
        return system_font(size)
    return font(f"fira-sans/*/*{weight}.ttf", size)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def screenshot(capture, caption, locale, index, total):
    W, H = 1080, 1920
    # alternate the backdrop: royal for the first and every other one, paper otherwise
    dark = index % 2 == 0
    bg = ROYAL if dark else PAPER
    fg = (255, 255, 255) if dark else INK
    im = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(im)
    if dark:
        glow = Image.new("L", (W, H), 0)
        gd = ImageDraw.Draw(glow)
        for r in range(900, 0, -12):
            gd.ellipse([W // 2 - r, 1500 - r, W // 2 + r, 1500 + r], fill=int(60 * (1 - r / 900)))
        im.paste(Image.new("RGB", (W, H), (129, 151, 255)), (0, 0), glow)
    # caption
    size = 60
    fnt = caption_font(locale, size)
    text = shape(caption, locale)
    lines = wrap(draw, text, fnt, W - 160, locale)
    while len(lines) > 3 and size > 40:
        size -= 4
        fnt = caption_font(locale, size)
        lines = wrap(draw, text, fnt, W - 160, locale)
    y = 110
    for line in lines:
        w = draw.textlength(line, font=fnt)
        draw.text(((W - w) / 2, y), line, font=fnt, fill=fg)
        y += int(size * 1.2)
    # the phone: the capture scaled to fit below the caption, rounded, with a shadow
    shot = Image.open(capture).convert("RGB")
    top = y + 60
    avail_h = H - top + 140  # the bottom of the phone runs off the frame
    scale = min((W - 200) / shot.width, avail_h / shot.height)
    shot = shot.resize((int(shot.width * scale), int(shot.height * scale)), Image.LANCZOS)
    shot = rounded(shot, 56)
    x = (W - shot.width) // 2
    shadow = Image.new("RGBA", (shot.width + 120, shot.height + 120), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([60, 80, shot.width + 60, shot.height + 60], radius=56, fill=(0, 0, 0, 110 if dark else 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    im.paste(shadow, (x - 60, top - 60), shadow)
    im.paste(shot, (x, top), shot)
    return im


def feature(title, short, locale):
    W, H = 1024, 500
    im = Image.new("RGB", (W, H), ROYAL)
    draw = ImageDraw.Draw(im)
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    for r in range(520, 0, -8):
        gd.ellipse([840 - r, 250 - r, 840 + r, 250 + r], fill=int(70 * (1 - r / 520)))
    im.paste(Image.new("RGB", (W, H), (129, 151, 255)), (0, 0), glow)
    icon = Image.open(ICON).convert("RGBA").resize((220, 220), Image.LANCZOS)
    im.paste(rounded(icon, 52), (740, 140), rounded(icon, 52))
    title_text = shape(title, locale)
    short_text = shape(short, locale)
    size = 56
    fnt = caption_font(locale, size)
    lines = wrap(draw, title_text, fnt, 620, locale)
    while len(lines) > 2 and size > 36:
        size -= 4
        fnt = caption_font(locale, size)
        lines = wrap(draw, title_text, fnt, 620, locale)
    # right-to-left locales read from the right edge of the text column
    def x_of(line, f):
        return 700 - draw.textlength(line, font=f) if locale in RTL else 80

    y = 120
    for line in lines:
        draw.text((x_of(line, fnt), y), line, font=fnt, fill=(255, 255, 255))
        y += int(size * 1.2)
    y += 16
    fnt2 = body_font(locale, 26)
    for line in wrap(draw, short_text, fnt2, 620, locale)[:3]:
        draw.text((x_of(line, fnt2), y), line, font=fnt2, fill=ON_ROYAL)
        y += 36
    draw.text((80, 430), "eszett.lamplitlabs.com", font=body_font("en-US", 22), fill=(200, 210, 250))
    return im


def read(locale, name):
    path = os.path.join(METADATA, locale, name)
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", action="append", help="a Play locale such as de-DE (repeatable); default all with metadata")
    args = parser.parse_args()
    locales = args.lang or sorted(d for d in os.listdir(METADATA) if os.path.isdir(os.path.join(METADATA, d)))
    captures = sorted(glob.glob(os.path.join(CAPTURES, "*.png")))
    os.makedirs(OUTPUT, exist_ok=True)
    Image.open(ICON).convert("RGBA").resize((512, 512), Image.LANCZOS).convert("RGB").save(os.path.join(OUTPUT, "icon.png"), optimize=True)
    print("icon.png 512x512")
    for locale in locales:
        out = os.path.join(OUTPUT, locale)
        os.makedirs(os.path.join(out, "phone"), exist_ok=True)
        feature(read(locale, "title.txt"), read(locale, "short_description.txt"), locale).save(os.path.join(out, "feature.png"), optimize=True)
        captions = read(locale, "screenshots.txt").split("\n")
        if not captures:
            print(f"{locale}: feature.png; no captures in store/captures - screenshots skipped")
            continue
        if len(captions) < len(captures):
            sys.exit(f"{locale}: {len(captions)} captions for {len(captures)} captures")
        for i, capture in enumerate(captures):
            screenshot(capture, captions[i], locale, i, len(captures)).save(os.path.join(out, "phone", f"{i + 1:02d}.png"), optimize=True)
        print(f"{locale}: feature.png and {len(captures)} screenshots")


if __name__ == "__main__":
    main()
