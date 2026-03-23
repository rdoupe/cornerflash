#!/usr/bin/env python
"""Run match command with detailed logging."""
import sys
sys.path.insert(0, '/c/Users/ryand/Documents/Claude/Projects/CornerFlash')

import json
from pathlib import Path
from difflib import SequenceMatcher

PROJECT_ROOT = Path(__file__).resolve().parent
FRAMES_DIR = PROJECT_ROOT / "frames"
TRACK_DATA = PROJECT_ROOT / "public" / "data" / "nordschleife.json"
MATCHES_FILE = PROJECT_ROOT / "scripts" / "corner_matches.json"
TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def log(msg):
    print(msg, flush=True)
    with open(PROJECT_ROOT / "match_logged.log", "a") as f:
        f.write(msg + "\n")
        f.flush()

def ocr_frame(frame_path):
    """Run Tesseract OCR on a frame, return detected text."""
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = TESSERACT
        from PIL import Image
        img = Image.open(frame_path)
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception as e:
        return ""

def fuzzy_match(detected_text, corner_names, threshold=0.6):
    """Match detected text against known corner names."""
    detected_lower = detected_text.lower()
    best_match = None
    best_score = 0

    for name in corner_names:
        if name in detected_lower:
            return name, 1.0

        for line in detected_lower.split("\n"):
            line = line.strip()
            if not line:
                continue
            score = SequenceMatcher(None, name, line).ratio()
            if score > best_score and score >= threshold:
                best_score = score
                best_match = name

            words = line.split()
            for i in range(len(words)):
                for j in range(i + 1, min(i + 5, len(words) + 1)):
                    chunk = " ".join(words[i:j])
                    score = SequenceMatcher(None, name, chunk).ratio()
                    if score > best_score and score >= threshold:
                        best_score = score
                        best_match = chunk if score < 0.8 else name

    if best_match:
        return best_match, best_score
    return None, 0

# Main logic
log("=== Starting match with logging ===")

# Load corners
with open(TRACK_DATA, "r", encoding="utf-8") as f:
    corners = json.load(f)
corner_names = {c["name"].lower(): c for c in corners}
log(f"Loaded {len(corner_names)} corner names")

# Load existing matches
matches = {}

# Get frames
frames = sorted(FRAMES_DIR.glob("*.jpg"))
log(f"OCR-ing {len(frames)} frames against {len(corner_names)} corner names...")

matched_count = 0
for i, frame in enumerate(frames):
    if (i + 1) % 100 == 0:
        log(f"  Processed {i + 1}/{len(frames)}... (matched: {matched_count})")

    text = ocr_frame(frame)
    if not text:
        continue

    match_name, score = fuzzy_match(text, corner_names)
    if match_name and match_name in corner_names:
        corner = corner_names[match_name]
        corner_id = corner["id"]

        fname = frame.stem
        parts = fname.rsplit("_", 1)
        ts_str = parts[-1].replace("ms", "")
        video_stem = parts[0]
        ts_ms = int(ts_str)

        existing = matches.get(corner_id)
        if not existing or score > existing.get("score", 0):
            matches[corner_id] = {
                "corner_id": corner_id,
                "corner_name": corner["name"],
                "video_stem": video_stem,
                "timestamp_ms": ts_ms,
                "frame_file": frame.name,
                "score": score,
                "detected_text": text[:200],
            }
            matched_count += 1
            log(f"  [OK] Matched '{corner['name']}' (score={score:.2f}) from {frame.name}")

# Save matches
with open(MATCHES_FILE, "w", encoding="utf-8") as f:
    json.dump(matches, f, indent=2)

log(f"\nMatched {matched_count} corners. {len(corner_names) - len(matches)} unmatched.")

if len(corner_names) - len(matches) > 0:
    unmatched = set(corner_names.keys()) - {corner_names[m["corner_name"].lower()]["name"].lower()
                                              for m in matches.values()
                                              if m["corner_name"].lower() in corner_names}
    if unmatched:
        log(f"  Unmatched corners: {', '.join(sorted(unmatched))}")

log("=== Match complete ===")
