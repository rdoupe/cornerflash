#!/usr/bin/env python
import sys
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
TRACK_DATA = PROJECT_ROOT / "public" / "data" / "nordschleife.json"
FRAMES_DIR = PROJECT_ROOT / "frames"
MATCHES_FILE = PROJECT_ROOT / "scripts" / "corner_matches.json"

print(f"Project root: {PROJECT_ROOT}", file=sys.stderr)
print(f"Track data: {TRACK_DATA}, exists: {TRACK_DATA.exists()}", file=sys.stderr)
print(f"Frames dir: {FRAMES_DIR}, exists: {FRAMES_DIR.exists()}", file=sys.stderr)

if TRACK_DATA.exists():
    with open(TRACK_DATA, "r", encoding="utf-8") as f:
        corners = json.load(f)
    print(f"Loaded {len(corners)} corners", file=sys.stderr)
else:
    print("Track data file not found!", file=sys.stderr)
    sys.exit(1)

if FRAMES_DIR.exists():
    frames = list(FRAMES_DIR.glob("*.jpg"))
    print(f"Found {len(frames)} frames", file=sys.stderr)
else:
    print("Frames directory not found!", file=sys.stderr)
    sys.exit(1)

print("Testing OCR on first frame...", file=sys.stderr)
if frames:
    try:
        import pytesseract
        from PIL import Image
        pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

        img = Image.open(frames[0])
        text = pytesseract.image_to_string(img)
        print(f"OCR on {frames[0].name}: {text[:100]}", file=sys.stderr)
    except Exception as e:
        print(f"OCR error: {e}", file=sys.stderr)

print("Test complete", file=sys.stderr)
