#!/usr/bin/env python
import sys
import json
from pathlib import Path
from difflib import SequenceMatcher

PROJECT_ROOT = Path(__file__).resolve().parent
FRAMES_DIR = PROJECT_ROOT / "frames"
TRACK_DATA = PROJECT_ROOT / "public" / "data" / "nordschleife.json"
MATCHES_FILE = PROJECT_ROOT / "scripts" / "corner_matches.json"
TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Logging function
def log(msg):
    print(msg, flush=True)
    with open(PROJECT_ROOT / "debug_match.log", "a") as f:
        f.write(msg + "\n")

log("=== Starting debug match ===")

# Load corners
with open(TRACK_DATA, "r", encoding="utf-8") as f:
    corners = json.load(f)
corner_names = {c["name"].lower(): c for c in corners}
log(f"Loaded {len(corner_names)} corner names")

# Load existing matches
if MATCHES_FILE.exists():
    with open(MATCHES_FILE, "r", encoding="utf-8") as f:
        matches = json.load(f)
else:
    matches = {}
log(f"Existing matches: {len(matches)}")

# Get frames
frames = sorted(FRAMES_DIR.glob("*.jpg"))
log(f"Found {len(frames)} frames")

# Test OCR on first 5 frames
import pytesseract
from PIL import Image
pytesseract.pytesseract.tesseract_cmd = TESSERACT

for i, frame in enumerate(frames[:5]):
    try:
        img = Image.open(frame)
        text = pytesseract.image_to_string(img).strip()
        log(f"Frame {i}: {frame.name} -> '{text[:60]}'")
    except Exception as e:
        log(f"Frame {i}: ERROR - {e}")

log("=== Debug match complete ===")
