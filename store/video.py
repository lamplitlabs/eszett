#!/usr/bin/env python3
"""Builds the silent promo video for the store listing from the same captures and captions as the screenshots.

    python3 store/video.py                      # every locale with metadata, landscape (YouTube) and portrait (Shorts / social)
    python3 store/video.py --lang en-US --orientation landscape

Output: store/output/video/promo-<locale>-<orientation>.mp4 - H.264, 30 fps, about 32 seconds, no audio (nothing to
license, Play allows muted videos; YouTube adds nothing). The listing takes a YouTube URL: upload promo-en-US-landscape.mp4
(or the locale's) and put the link into metadata/android/<locale>/video.txt, then `node store/play-listing.mjs --apply --text-only`.

An intro card (mark, title, short description), one scene per capture (the framed phone on the brand backdrop, the
caption, a slow zoom), cross-fades, an outro card (the Play badge line and the website). Pillow renders the cards and
frames, ffmpeg does the motion (zoompan) and the fades (xfade).
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose  # noqa: E402  (the fonts, colours, wrap and the rounded phone frame)

ROOT = compose.ROOT
OUTPUT = os.path.join(ROOT, "store/output/video")
FPS = 30
INTRO, SCENE, OUTRO, FADE = 3.0, 3.6, 3.5, 0.7
ORIENTATIONS = {"landscape": (1920, 1080), "portrait": (1080, 1920)}


def backdrop(w, h, dark=True):
    im = Image.new("RGB", (w, h), compose.ROYAL if dark else compose.PAPER)
    if dark:
        glow = Image.new("L", (w, h), 0)
        gd = ImageDraw.Draw(glow)
        cx, cy, r0 = int(w * 0.72), int(h * 0.55), int(min(w, h) * 0.9)
        for r in range(r0, 0, -14):
            gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(60 * (1 - r / r0)))
        im.paste(Image.new("RGB", (w, h), (129, 151, 255)), (0, 0), glow)
    return im


def text_block(draw, lines, font, x, y, fill, align_right=False, right_edge=None, line_h=None):
    for line in lines:
        lw = draw.textlength(line, font=font)
        draw.text(((right_edge - lw) if align_right else x, y), line, font=font, fill=fill)
        y += line_h or int(font.size * 1.2)
    return y


def intro_card(locale, w, h):
    im = backdrop(w, h)
    d = ImageDraw.Draw(im)
    icon = Image.open(compose.ICON).convert("RGBA")
    size = int(min(w, h) * 0.24)
    icon = compose.rounded(icon.resize((size, size), Image.LANCZOS), size // 4)
    title = compose.read(locale, "title.txt")
    short = compose.read(locale, "short_description.txt")
    rtl = locale in compose.RTL
    if w > h:
        im.paste(icon, (int(w * 0.62), (h - size) // 2), icon)
        col_w = int(w * 0.46)
        x0, right = int(w * 0.08), int(w * 0.08) + col_w
        f1 = compose.caption_font(locale, 92)
        lines = compose.wrap(d, title, f1, col_w, locale)
        while len(lines) > 2 and f1.size > 56:
            f1 = compose.caption_font(locale, f1.size - 6)
            lines = compose.wrap(d, title, f1, col_w, locale)
        f2 = compose.body_font(locale, 40)
        lines2 = compose.wrap(d, short, f2, col_w, locale)[:3]
        total = len(lines) * int(f1.size * 1.2) + 30 + len(lines2) * 52
        y = (h - total) // 2
        y = text_block(d, lines, f1, x0, y, (255, 255, 255), rtl, right)
        text_block(d, lines2, f2, x0, y + 30, compose.ON_ROYAL, rtl, right, 52)
    else:
        im.paste(icon, ((w - size) // 2, int(h * 0.22)), icon)
        f1 = compose.caption_font(locale, 84)
        lines = compose.wrap(d, title, f1, w - 160, locale)
        f2 = compose.body_font(locale, 40)
        lines2 = compose.wrap(d, short, f2, w - 200, locale)[:3]
        y = int(h * 0.22) + size + 70
        for line in lines:
            d.text(((w - d.textlength(line, font=f1)) / 2, y), line, font=f1, fill=(255, 255, 255))
            y += int(f1.size * 1.2)
        y += 24
        for line in lines2:
            d.text(((w - d.textlength(line, font=f2)) / 2, y), line, font=f2, fill=compose.ON_ROYAL)
            y += 52
    return im


def outro_card(locale, w, h):
    im = backdrop(w, h)
    d = ImageDraw.Draw(im)
    icon = Image.open(compose.ICON).convert("RGBA")
    size = int(min(w, h) * 0.2)
    icon = compose.rounded(icon.resize((size, size), Image.LANCZOS), size // 4)
    im.paste(icon, ((w - size) // 2, int(h * 0.28) - size // 2), icon)
    f1 = compose.caption_font(locale, 72)
    f2 = compose.body_font(locale, 40)
    title = "Eszett"
    cta = compose.read(locale, "title.txt").split(":", 1)[-1].split("：", 1)[-1].strip()
    y = int(h * 0.28) + size // 2 + 50
    d.text(((w - d.textlength(title, font=f1)) / 2, y), title, font=f1, fill=(255, 255, 255))
    y += int(f1.size * 1.3)
    d.text(((w - d.textlength(cta, font=f2)) / 2, y), cta, font=f2, fill=compose.ON_ROYAL)
    y += 110
    site = "eszett.lamplitlabs.com"
    f3 = compose.body_font("en-US", 44, "500Medium")
    d.text(((w - d.textlength(site, font=f3)) / 2, y), site, font=f3, fill=(255, 255, 255))
    badge = "Google Play"
    f4 = compose.body_font("en-US", 30)
    d.text(((w - d.textlength(badge, font=f4)) / 2, y + 70), badge, font=f4, fill=(200, 210, 250))
    return im


def scene_card(capture, caption, locale, index, w, h):
    """The phone with its caption; landscape puts the caption beside the phone, portrait above it."""
    dark = index % 2 == 0
    im = backdrop(w, h, dark)
    d = ImageDraw.Draw(im)
    fg = (255, 255, 255) if dark else compose.INK
    shot = Image.open(capture).convert("RGB")
    rtl = locale in compose.RTL
    if w > h:
        ph = int(h * 0.92)
        shot = shot.resize((int(shot.width * ph / shot.height), ph), Image.LANCZOS)
        shot = compose.rounded(shot, 48)
        px = int(w * 0.58) if not rtl else int(w * 0.08)
        py = (h - shot.height) // 2
        shadow = Image.new("RGBA", (shot.width + 160, shot.height + 160), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([80, 100, shot.width + 80, shot.height + 80], radius=48, fill=(0, 0, 0, 120 if dark else 60))
        shadow = shadow.filter(ImageFilter.GaussianBlur(34))
        im.paste(shadow, (px - 80, py - 80), shadow)
        im.paste(shot, (px, py), shot)
        col_w = int(w * 0.42)
        x0 = int(w * 0.08) if not rtl else int(w * 0.08) + shot.width + int(w * 0.06)
        right = x0 + col_w
        f = compose.caption_font(locale, 78)
        lines = compose.wrap(d, caption, f, col_w, locale)
        while len(lines) > 3 and f.size > 48:
            f = compose.caption_font(locale, f.size - 6)
            lines = compose.wrap(d, caption, f, col_w, locale)
        y = (h - len(lines) * int(f.size * 1.2)) // 2
        text_block(d, lines, f, x0, y, fg, rtl, right)
    else:
        f = compose.caption_font(locale, 64)
        lines = compose.wrap(d, caption, f, w - 180, locale)
        while len(lines) > 3 and f.size > 44:
            f = compose.caption_font(locale, f.size - 4)
            lines = compose.wrap(d, caption, f, w - 180, locale)
        y = 130
        for line in lines:
            d.text(((w - d.textlength(line, font=f)) / 2, y), line, font=f, fill=fg)
            y += int(f.size * 1.2)
        top = y + 60
        scale = min((w - 220) / shot.width, (h - top + 160) / shot.height)
        shot = shot.resize((int(shot.width * scale), int(shot.height * scale)), Image.LANCZOS)
        shot = compose.rounded(shot, 56)
        x = (w - shot.width) // 2
        shadow = Image.new("RGBA", (shot.width + 160, shot.height + 160), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle([80, 100, shot.width + 80, shot.height + 80], radius=56, fill=(0, 0, 0, 120 if dark else 60))
        shadow = shadow.filter(ImageFilter.GaussianBlur(34))
        im.paste(shadow, (x - 80, top - 80), shadow)
        im.paste(shot, (x, top), shot)
    return im


def render(locale, orientation):
    w, h = ORIENTATIONS[orientation]
    captures = sorted(f for f in os.listdir(compose.CAPTURES) if f.endswith(".png"))
    if not captures:
        sys.exit("no captures in store/captures")
    captions = compose.read(locale, "screenshots.txt").split("\n")
    work = tempfile.mkdtemp(prefix="eszett-video-")
    cards = [(os.path.join(work, "00-intro.png"), INTRO, 1.0)]
    intro_card(locale, w, h).save(cards[0][0])
    for i, name in enumerate(captures):
        path = os.path.join(work, f"{i + 1:02d}.png")
        scene_card(os.path.join(compose.CAPTURES, name), captions[i], locale, i, w, h).save(path)
        cards.append((path, SCENE, 1.06))
    outro = os.path.join(work, "99-outro.png")
    outro_card(locale, w, h).save(outro)
    cards.append((outro, OUTRO, 1.0))

    # one clip per card: a slow push-in (zoompan on a 2x render keeps it smooth), then xfade them together
    inputs, filters = [], []
    for i, (path, secs, zoom) in enumerate(cards):
        inputs += ["-loop", "1", "-t", str(secs), "-i", path]
        frames = int(secs * FPS)
        z = f"min(zoom+{(zoom - 1) / frames:.6f},{zoom})" if zoom > 1 else "1"
        filters.append(f"[{i}:v]scale={w * 2}:{h * 2},zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={w}x{h}:fps={FPS},format=yuv420p[v{i}]")
    last = "v0"
    offset = 0.0
    for i in range(1, len(cards)):
        offset += cards[i - 1][1] - FADE
        out = f"x{i}" if i < len(cards) - 1 else "vout"
        filters.append(f"[{last}][v{i}]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{out}]")
        last = out
    os.makedirs(OUTPUT, exist_ok=True)
    target = os.path.join(OUTPUT, f"promo-{locale}-{orientation}.mp4")
    total = sum(c[1] for c in cards) - FADE * (len(cards) - 1)
    # -t trims the container to the real length: the looped inputs would otherwise pad the stream's duration
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters), "-map", "[vout]",
           "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", str(FPS), target]
    subprocess.run(cmd, check=True)
    shutil.rmtree(work, ignore_errors=True)
    print(f"{os.path.relpath(target, ROOT)}  {total:.1f}s  {os.path.getsize(target) // 1024} KB")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", action="append")
    parser.add_argument("--orientation", choices=list(ORIENTATIONS), action="append")
    args = parser.parse_args()
    locales = args.lang or sorted(d for d in os.listdir(compose.METADATA) if os.path.isdir(os.path.join(compose.METADATA, d)))
    for locale in locales:
        for orientation in args.orientation or list(ORIENTATIONS):
            render(locale, orientation)


if __name__ == "__main__":
    main()
