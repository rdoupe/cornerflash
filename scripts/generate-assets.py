"""
Generate Capacitor icon and splash screen source assets for CornerFlash.
Output: assets/ directory at project root (1024x1024 icons, 2732x2732 splash)
Requires: Pillow (pip install pillow)
"""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = PROJECT_ROOT / "assets"
ASSETS_DIR.mkdir(exist_ok=True)

# Brand colors
BG = (3, 9, 18)          # #030712 (gray-950)
ORANGE = (249, 115, 22)  # #f97316 (orange-500)
WHITE = (255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def get_font(size):
    """Try to load a bold system font, fall back to default."""
    font_candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]
    for path in font_candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_cf_logo(draw, cx, cy, text_size, color=ORANGE):
    """Draw centered 'CF' text."""
    font = get_font(text_size)
    text = "CF"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), text, fill=color, font=font)


def draw_tagline(draw, cx, cy, text_size, color=WHITE):
    font = get_font(text_size)
    text = "CornerFlash"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), text, fill=color, font=font)


def draw_subtitle(draw, cx, cy, text_size, color=(100, 116, 139)):
    font = get_font(text_size)
    text = "Learn the corners"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, cy), text, fill=color, font=font)


# --- icon.png (1024x1024, dark bg + CF) ---
print("Generating icon.png...")
img = Image.new("RGB", (1024, 1024), BG)
draw = ImageDraw.Draw(img)
# Orange rounded rect background for the logo mark
margin = 180
draw.rounded_rectangle([margin, margin, 1024 - margin, 1024 - margin],
                        radius=80, fill=(20, 30, 50))
draw_cf_logo(draw, 512, 512, 380)
img.save(ASSETS_DIR / "icon.png")
print("  -> assets/icon.png")

# --- icon-background.png (1024x1024, solid dark fill) ---
print("Generating icon-background.png...")
img = Image.new("RGB", (1024, 1024), BG)
img.save(ASSETS_DIR / "icon-background.png")
print("  -> assets/icon-background.png")

# --- icon-foreground.png (1024x1024, transparent bg + CF centered) ---
print("Generating icon-foreground.png...")
img = Image.new("RGBA", (1024, 1024), TRANSPARENT)
draw = ImageDraw.Draw(img)
# Adaptive icon safe zone: center 66% = ~336px inset each side
safe_margin = 160
draw.rounded_rectangle([safe_margin, safe_margin, 1024 - safe_margin, 1024 - safe_margin],
                        radius=60, fill=(20, 30, 50, 230))
draw_cf_logo(draw, 512, 512, 320, color=ORANGE)
img.save(ASSETS_DIR / "icon-foreground.png")
print("  -> assets/icon-foreground.png")

# --- splash.png (2732x2732, dark bg + wordmark) ---
print("Generating splash.png...")
img = Image.new("RGB", (2732, 2732), BG)
draw = ImageDraw.Draw(img)
cx, cy = 1366, 1366

# Orange accent bar
bar_h = 8
bar_w = 400
draw.rectangle([cx - bar_w // 2, cy - 320, cx + bar_w // 2, cy - 320 + bar_h], fill=ORANGE)

# "CF" monogram
draw_cf_logo(draw, cx, cy - 160, 500)

# "CornerFlash" wordmark
draw_tagline(draw, cx, cy + 120, 180, color=WHITE)

# Subtitle
draw_subtitle(draw, cx, cy + 350, 90, color=(71, 85, 105))

img.save(ASSETS_DIR / "splash.png")
print("  -> assets/splash.png")

print("\nAll assets generated in assets/")
print("Next: npx capacitor-assets generate --android")
