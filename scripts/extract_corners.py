"""
extract_corners.py — Full pipeline to extract corner images from YouTube videos.

Usage (original playlist — overhead/map views):
    python scripts/extract_corners.py download          # Download playlist videos
    python scripts/extract_corners.py extract            # Extract frames every 2s
    python scripts/extract_corners.py match              # OCR frames, match to corners
    python scripts/extract_corners.py inpaint            # Remove text from matched frames
    python scripts/extract_corners.py refine <corner_id> [--shift +2|-2]
    python scripts/extract_corners.py candidates         # Generate candidate frames for dev picker
    python scripts/extract_corners.py apply              # Apply dev picker selections
    python scripts/extract_corners.py all                # Run full pipeline

Usage (new multi-view video — driver POV bottom view):
    python scripts/extract_corners.py new-download       # Download single video
    python scripts/extract_corners.py new-extract        # Extract frames every 1s (from t=1453s)
    python scripts/extract_corners.py new-match          # OCR, collect ALL label-visible frames
    python scripts/extract_corners.py new-candidates     # Crop bottom view → candidates_new/
    python scripts/extract_corners.py new-all            # Run full new pipeline
    python scripts/extract_corners.py new-scan-text             # Scan gaps for corner-name text → dev UI
    python scripts/extract_corners.py new-inspect [corner_id]   # Show OCR text in unmatched windows
    python scripts/extract_corners.py new-manual <corner_id> <start_s> <end_s>  # Force-match a window

The new pipeline crops the bottom BOTTOM_CROP_FRACTION of each frame (driver POV)
when saving candidates. OCR runs on the full frame to detect corner name labels.
"""

import sys
import os
import json
import subprocess
import re
import glob
from pathlib import Path
from difflib import SequenceMatcher

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
VIDEOS_DIR = PROJECT_ROOT / "videos"
FRAMES_DIR = PROJECT_ROOT / "frames"
OUTPUT_DIR = PROJECT_ROOT / "public" / "images" / "corners" / "nordschleife"
MATCHES_FILE = PROJECT_ROOT / "scripts" / "corner_matches.json"
TRACK_DATA = PROJECT_ROOT / "public" / "data" / "nordschleife.json"
PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLDgPIzXADRz4AjyqgocDeglVWF2MEezPU"

# ── New multi-view video (driver POV) ────────────────────────────────────────
NEW_VIDEO_URL = "https://www.youtube.com/watch?v=-lCR1_cDqTg"
NEW_VIDEO_START_S = 0              # Extract full video; t=1453s in the URL was a playback bookmark
NEW_VIDEOS_DIR = PROJECT_ROOT / "videos_new"
NEW_FRAMES_DIR = PROJECT_ROOT / "frames_new"
NEW_CANDIDATES_DIR = PROJECT_ROOT / "public" / "candidates_new"
NEW_MATCHES_FILE = PROJECT_ROOT / "scripts" / "corner_matches_new.json"
NEW_FRAME_INTERVAL = 1             # 1s — finer granularity to capture full label window

# Fraction of frame height where the driver POV view starts (from top).
# This video has two overhead views on top and one full-width driver view on
# the bottom. Adjust if the split is different once you've seen the video.
BOTTOM_CROP_FRACTION = 0.45        # take bottom 55% of frame height

# ─────────────────────────────────────────────────────────────────────────────

# Tool paths (winget installs don't always add to PATH)
PYTHON = r"C:\Users\ryand\AppData\Local\Programs\Python\Python312\python.exe"
FFMPEG = r"C:\Users\ryand\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin\ffmpeg.exe"
YTDLP = r"C:\Users\ryand\AppData\Local\Microsoft\WinGet\Packages\yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe\yt-dlp.exe"
TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Frame extraction interval in seconds (original playlist)
FRAME_INTERVAL = 2


def _configure_tesseract():
    """Set Tesseract path for pytesseract."""
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = TESSERACT


def load_corner_names():
    """Load corner names from track data JSON."""
    with open(TRACK_DATA, "r", encoding="utf-8") as f:
        corners = json.load(f)
    return {c["name"].lower(): c for c in corners}


def load_matches():
    """Load existing corner match metadata."""
    if MATCHES_FILE.exists():
        with open(MATCHES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_matches(matches):
    """Save corner match metadata."""
    with open(MATCHES_FILE, "w", encoding="utf-8") as f:
        json.dump(matches, f, indent=2)


# ── Step 1: Download ─────────────────────────────────────────────────────────

def cmd_download():
    """Download playlist videos using yt-dlp."""
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading playlist to {VIDEOS_DIR}...")
    subprocess.run([
        YTDLP,
        "--output", str(VIDEOS_DIR / "%(playlist_index)03d_%(id)s.%(ext)s"),
        "--format", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
        "--merge-output-format", "mp4",
        "--no-overwrites",
        PLAYLIST_URL,
    ], check=True)
    print("Download complete.")


# ── Step 2: Extract frames ───────────────────────────────────────────────────

def cmd_extract():
    """Extract frames from each video at FRAME_INTERVAL intervals."""
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    videos = sorted(f for f in VIDEOS_DIR.glob("*.mp4") if ".f140." not in f.name)
    if not videos:
        print("No videos found. Run 'download' first.")
        return

    for video in videos:
        # Normalize stem: 001_DVJPnTWvzPE.f298 → 001_DVJPnTWvzPE
        stem = video.stem.split(".")[0]
        out_pattern = str(FRAMES_DIR / f"{stem}_%06d.jpg")
        existing = list(FRAMES_DIR.glob(f"{stem}_*.jpg"))
        if existing:
            print(f"Frames already exist for {stem}, skipping. ({len(existing)} frames)")
            continue

        print(f"Extracting frames from {video.name} every {FRAME_INTERVAL}s...")
        subprocess.run([
            FFMPEG, "-i", str(video),
            "-vf", f"fps=1/{FRAME_INTERVAL}",
            "-q:v", "2",
            out_pattern,
        ], check=True, capture_output=True)
        # Rename to embed timestamp in filename
        frames = sorted(FRAMES_DIR.glob(f"{stem}_*.jpg"))
        for i, frame in enumerate(frames):
            ts_ms = i * FRAME_INTERVAL * 1000
            new_name = FRAMES_DIR / f"{stem}_{ts_ms:08d}ms.jpg"
            frame.rename(new_name)
        print(f"  Extracted {len(frames)} frames.")

    print("Frame extraction complete.")


# ── Step 3: OCR + match ──────────────────────────────────────────────────────

def ocr_frame(frame_path):
    """Run Tesseract OCR on a frame, return detected text."""
    try:
        import pytesseract
        _configure_tesseract()
        from PIL import Image
        img = Image.open(frame_path)
        # Get both text and bounding box data
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception as e:
        return ""


def ocr_frame_with_boxes(frame_path):
    """Run Tesseract OCR on a frame, return text and bounding boxes."""
    try:
        import pytesseract
        _configure_tesseract()
        from PIL import Image
        img = Image.open(frame_path)
        text = pytesseract.image_to_string(img).strip()
        # Get bounding box data for inpainting
        boxes = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        return text, boxes, img.size
    except Exception as e:
        return "", {}, (0, 0)


def fuzzy_match(detected_text, corner_names, threshold=0.6):
    """Match detected text against known corner names. Returns (corner_name, score) or None."""
    detected_lower = detected_text.lower()
    best_match = None
    best_score = 0

    for name in corner_names:
        # Direct substring check first
        if name in detected_lower:
            return name, 1.0

        # Fuzzy match each word group
        for line in detected_lower.split("\n"):
            line = line.strip()
            if not line:
                continue
            score = SequenceMatcher(None, name, line).ratio()
            if score > best_score and score >= threshold:
                best_score = score
                best_match = name

            # Also check substrings of the line
            words = line.split()
            for i in range(len(words)):
                for j in range(i + 1, min(i + 5, len(words) + 1)):
                    chunk = " ".join(words[i:j])
                    score = SequenceMatcher(None, name, chunk).ratio()
                    if score > best_score and score >= threshold:
                        best_score = score
                        best_match = name

    if best_match:
        return best_match, best_score
    return None, 0


def parse_frame_info(frame_path):
    """Extract video stem and timestamp from frame filename."""
    fname = Path(frame_path).stem
    parts = fname.rsplit("_", 1)
    ts_str = parts[-1].replace("ms", "")
    video_stem = parts[0]
    return video_stem, int(ts_str)


def has_speedo(frame_path):
    """Check if a frame has a speedometer (driving POV indicator).

    The speedo is a circular gauge at bottom-center showing gear (single digit)
    and speed (2-3 digit number). We crop the bottom-center region and look for
    this pattern via OCR.
    """
    try:
        import pytesseract
        _configure_tesseract()
        from PIL import Image
        img = Image.open(frame_path)
        w, h = img.size
        # Crop bottom-center strip where speedo lives (roughly center 40%, bottom 25%)
        left = int(w * 0.3)
        right = int(w * 0.7)
        top = int(h * 0.65)
        crop = img.crop((left, top, right, h))
        text = pytesseract.image_to_string(crop, config='--psm 6').strip()
        # Look for speed-like numbers (2-3 digits) which indicate the speedo
        speed_pattern = re.findall(r'\b\d{2,3}\b', text)
        # Also look for gear numbers (single digit 1-7)
        gear_pattern = re.findall(r'\b[1-7]\b', text)
        return len(speed_pattern) > 0 or len(gear_pattern) > 0
    except Exception:
        return False


def count_text_amount(frame_path):
    """Count total text characters in a frame. Lower = cleaner."""
    text = ocr_frame(frame_path)
    return len(text)


def find_clean_driving_frame(video_stem, timestamp_ms, all_frames_by_video):
    """Given a corner name match at timestamp_ms, scan nearby frames for the
    cleanest driving POV (has speedo, minimal overlays).

    Scans from T+4s to T+20s (after the explanation), looking for frames with
    a speedometer and minimal text.
    """
    frames = all_frames_by_video.get(video_stem, [])
    if not frames:
        return None, None

    # Scan window: +4s to +20s after the corner name appeared
    search_start = timestamp_ms + 4000
    search_end = timestamp_ms + 20000

    candidates = []
    for frame_path, ts in frames:
        if search_start <= ts <= search_end:
            candidates.append((frame_path, ts))

    if not candidates:
        # Fall back to +2s to +30s
        search_start = timestamp_ms + 2000
        search_end = timestamp_ms + 30000
        for frame_path, ts in frames:
            if search_start <= ts <= search_end:
                candidates.append((frame_path, ts))

    if not candidates:
        return None, None

    # Filter for frames with speedo (driving POV)
    speedo_frames = []
    for frame_path, ts in candidates:
        if has_speedo(frame_path):
            speedo_frames.append((frame_path, ts))

    if not speedo_frames:
        # No speedo found — fall back to candidate with least text
        speedo_frames = candidates

    # Among speedo frames, pick the one with the least text (cleanest)
    best_frame = None
    best_ts = None
    least_text = float('inf')
    for frame_path, ts in speedo_frames:
        text_len = count_text_amount(frame_path)
        if text_len < least_text:
            least_text = text_len
            best_frame = frame_path
            best_ts = ts

    return best_frame, best_ts


def cmd_match():
    """OCR all frames to find corner name timestamps. Saves to corner_matches.json.

    This only identifies WHERE each corner is mentioned in the videos.
    Use 'candidates' to generate candidate frames for the dev picker UI.
    """
    corner_names = load_corner_names()
    frames = sorted(FRAMES_DIR.glob("*.jpg"))

    if not frames:
        print("No frames found. Run 'extract' first.")
        return

    print(f"OCR-ing {len(frames)} frames to find corner name timestamps...", flush=True)

    # Find all timestamps where corner names appear
    corner_timestamps = {}  # corner_id -> [(video_stem, timestamp_ms, score, frame_file)]
    for i, frame in enumerate(frames):
        if (i + 1) % 100 == 0:
            print(f"  Scanned {i + 1}/{len(frames)}...", flush=True)

        text = ocr_frame(frame)
        if not text:
            continue

        match_name, score = fuzzy_match(text, corner_names)
        if match_name and match_name in corner_names:
            corner = corner_names[match_name]
            corner_id = corner["id"]
            video_stem, ts_ms = parse_frame_info(frame)

            if corner_id not in corner_timestamps:
                corner_timestamps[corner_id] = []
            corner_timestamps[corner_id].append({
                "video_stem": video_stem,
                "timestamp_ms": ts_ms,
                "score": score,
                "frame_file": frame.name,
            })

    # Build matches: store the best label timestamp + all timestamps for candidate generation
    matches = {}
    for corner_id, timestamps in corner_timestamps.items():
        # Find the corner data
        corner = None
        for name, c in corner_names.items():
            if c["id"] == corner_id:
                corner = c
                break
        if not corner:
            continue

        # Sort by score, take the best
        timestamps.sort(key=lambda x: -x["score"])
        best = timestamps[0]

        matches[corner_id] = {
            "corner_id": corner_id,
            "corner_name": corner["name"],
            "video_stem": best["video_stem"],
            "label_timestamp_ms": best["timestamp_ms"],
            "frame_file": best["frame_file"],
            "score": best["score"],
            # Store all label timestamps for candidate generation
            "all_label_timestamps": timestamps,
            # Will be set by dev picker
            "selected_frame": None,
            # Source metadata for future video sources
            "source": {
                "type": "youtube",
                "playlist": PLAYLIST_URL,
                "video_stem": best["video_stem"],
            },
        }
        print(f"  [OK] {corner['name']}: found at {best['timestamp_ms']}ms "
              f"(score={best['score']:.2f}, {len(timestamps)} references)", flush=True)

    save_matches(matches)
    all_ids = {c["id"] for c in corner_names.values()}
    matched_ids = set(matches.keys())
    unmatched = all_ids - matched_ids
    print(f"\nFound {len(matches)} corners. {len(unmatched)} unmatched.", flush=True)
    if unmatched:
        print(f"  Unmatched: {', '.join(sorted(unmatched))}", flush=True)
    print("\nRun 'candidates' next to generate candidate frames for the dev picker.",
          flush=True)


# ── Step 3b: Generate candidate frames ───────────────────────────────────────

CANDIDATES_DIR = PROJECT_ROOT / "public" / "candidates"

def cmd_candidates():
    """For each matched corner, copy candidate frames (T-4s to T+20s) to
    public/candidates/{corner_id}/ so the dev picker UI can display them.

    Also generates a candidates.json manifest for the UI.
    """
    import shutil

    matches = load_matches()
    if not matches:
        print("No matches found. Run 'match' first.")
        return

    # Index all frames by video stem
    frames = sorted(FRAMES_DIR.glob("*.jpg"))
    frames_by_video = {}
    for frame in frames:
        video_stem, ts = parse_frame_info(frame)
        if video_stem not in frames_by_video:
            frames_by_video[video_stem] = []
        frames_by_video[video_stem].append((frame, ts))
    for v in frames_by_video:
        frames_by_video[v].sort(key=lambda x: x[1])

    manifest = {}  # corner_id -> list of candidate filenames

    for corner_id, meta in matches.items():
        corner_dir = CANDIDATES_DIR / corner_id
        corner_dir.mkdir(parents=True, exist_ok=True)

        video_stem = meta["video_stem"]
        label_ts = meta["label_timestamp_ms"]
        video_frames = frames_by_video.get(video_stem, [])

        # Collect candidates from T-4s to T+20s
        search_start = label_ts - 4000
        search_end = label_ts + 20000
        candidates = []

        for frame_path, ts in video_frames:
            if search_start <= ts <= search_end:
                # Copy to candidates dir
                dest = corner_dir / frame_path.name
                if not dest.exists():
                    shutil.copy2(frame_path, dest)
                candidates.append({
                    "filename": frame_path.name,
                    "timestamp_ms": ts,
                    "offset_from_label": ts - label_ts,
                    "video_stem": video_stem,
                })

        manifest[corner_id] = {
            "corner_name": meta["corner_name"],
            "label_timestamp_ms": label_ts,
            "candidates": candidates,
            "selected": meta.get("selected_frame"),
            "source": meta.get("source", {}),
        }
        print(f"  {corner_id}: {len(candidates)} candidate frames", flush=True)

    # Write manifest for the dev picker UI
    manifest_path = CANDIDATES_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nCandidates written to {CANDIDATES_DIR}", flush=True)
    print(f"Manifest: {manifest_path}", flush=True)
    print(f"Open the app in dev mode to pick frames.", flush=True)


# ── Step 3c: Apply selection from dev picker ─────────────────────────────────

def cmd_apply_selection():
    """Read selections from manifest.json (set by dev picker UI) and copy
    selected frames to the final output directory, optionally inpainting."""
    import shutil

    manifest_path = CANDIDATES_DIR / "manifest.json"
    if not manifest_path.exists():
        print("No manifest found. Run 'candidates' first.")
        return

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    applied = 0

    for corner_id, data in manifest.items():
        selected = data.get("selected")
        if not selected:
            continue

        src = CANDIDATES_DIR / corner_id / selected
        if not src.exists():
            print(f"  [!!] {corner_id}: selected file {selected} not found")
            continue

        dest = OUTPUT_DIR / f"{corner_id}.jpg"
        shutil.copy2(src, dest)
        applied += 1
        print(f"  [OK] {corner_id} -> {selected}", flush=True)

    print(f"\nApplied {applied} selections to {OUTPUT_DIR}", flush=True)


# ── Step 4: Inpaint (remove text) ────────────────────────────────────────────

def cmd_inpaint():
    """Remove text overlays from matched frames using OpenCV inpainting."""
    import cv2
    import numpy as np

    matches = load_matches()
    if not matches:
        print("No matches found. Run 'match' first.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for corner_id, meta in matches.items():
        frame_path = FRAMES_DIR / meta["frame_file"]
        if not frame_path.exists():
            print(f"  Frame missing for {corner_id}: {meta['frame_file']}")
            continue

        out_path = OUTPUT_DIR / f"{corner_id}.jpg"
        print(f"  Inpainting {corner_id}...")

        # Get OCR bounding boxes
        _, boxes, img_size = ocr_frame_with_boxes(str(frame_path))

        # Read image with OpenCV
        img = cv2.imread(str(frame_path))
        if img is None:
            print(f"    Failed to read {frame_path}")
            continue

        h, w = img.shape[:2]

        # Create mask from OCR bounding boxes
        mask = np.zeros((h, w), dtype=np.uint8)
        if boxes and "text" in boxes:
            for i in range(len(boxes["text"])):
                # Only mask regions with actual text content
                txt = boxes["text"][i].strip()
                conf = int(boxes["conf"][i]) if boxes["conf"][i] != "-1" else -1
                if txt and conf > 30:
                    x = boxes["left"][i]
                    y = boxes["top"][i]
                    bw = boxes["width"][i]
                    bh = boxes["height"][i]
                    # Add padding around text
                    pad = 5
                    x1 = max(0, x - pad)
                    y1 = max(0, y - pad)
                    x2 = min(w, x + bw + pad)
                    y2 = min(h, y + bh + pad)
                    cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)

        # Check if mask has any white pixels
        if np.any(mask > 0):
            # Dilate mask slightly for better coverage
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
            mask = cv2.dilate(mask, kernel, iterations=1)
            # Inpaint
            result = cv2.inpaint(img, mask, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
        else:
            # No text detected, just copy
            result = img

        cv2.imwrite(str(out_path), result, [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f"    [OK] Saved {out_path.name}")

    print(f"\nInpainted images saved to {OUTPUT_DIR}")


# ── Step 5: Refine ───────────────────────────────────────────────────────────

def cmd_refine(corner_id, shift_seconds=0):
    """Re-extract a frame for a corner at an adjusted timestamp."""
    import cv2
    import numpy as np

    matches = load_matches()
    if corner_id not in matches:
        print(f"No match found for '{corner_id}'. Available: {', '.join(sorted(matches.keys()))}")
        return

    meta = matches[corner_id]
    video_stem = meta["video_stem"]
    old_ts = meta["timestamp_ms"]
    new_ts = max(0, old_ts + (shift_seconds * 1000))

    # Find the source video
    videos = list(VIDEOS_DIR.glob(f"{video_stem}.*"))
    if not videos:
        print(f"Source video not found for stem '{video_stem}'")
        return

    video_path = videos[0]
    print(f"Refining {corner_id}: {old_ts}ms → {new_ts}ms (shift {shift_seconds:+d}s)")

    # Extract single frame at new timestamp
    ts_seconds = new_ts / 1000.0
    frame_name = f"{video_stem}_{new_ts:08d}ms.jpg"
    frame_path = FRAMES_DIR / frame_name
    subprocess.run([
        FFMPEG, "-y",
        "-ss", f"{ts_seconds:.3f}",
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "2",
        str(frame_path),
    ], check=True, capture_output=True)

    # Update metadata
    meta["timestamp_ms"] = new_ts
    meta["frame_file"] = frame_name
    matches[corner_id] = meta
    save_matches(matches)

    # Re-inpaint this one frame
    _, boxes, _ = ocr_frame_with_boxes(str(frame_path))
    img = cv2.imread(str(frame_path))
    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    if boxes and "text" in boxes:
        for i in range(len(boxes["text"])):
            txt = boxes["text"][i].strip()
            conf = int(boxes["conf"][i]) if boxes["conf"][i] != "-1" else -1
            if txt and conf > 30:
                x, y = boxes["left"][i], boxes["top"][i]
                bw, bh = boxes["width"][i], boxes["height"][i]
                pad = 5
                cv2.rectangle(mask,
                              (max(0, x-pad), max(0, y-pad)),
                              (min(w, x+bw+pad), min(h, y+bh+pad)),
                              255, -1)
    if np.any(mask > 0):
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        mask = cv2.dilate(mask, kernel, iterations=1)
        result = cv2.inpaint(img, mask, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
    else:
        result = img

    out_path = OUTPUT_DIR / f"{corner_id}.jpg"
    cv2.imwrite(str(out_path), result, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(f"  [OK] Updated {out_path.name} (timestamp: {new_ts}ms)")


# ── New video pipeline ────────────────────────────────────────────────────────

def cmd_new_download():
    """Download the single multi-view driver-POV video."""
    NEW_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {NEW_VIDEO_URL} to {NEW_VIDEOS_DIR}...")
    subprocess.run([
        YTDLP,
        "--output", str(NEW_VIDEOS_DIR / "%(id)s.%(ext)s"),
        "--format", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
        "--merge-output-format", "mp4",
        "--no-overwrites",
        NEW_VIDEO_URL,
    ], check=True)
    print("Download complete.")


def cmd_new_extract():
    """Extract frames from the new video at NEW_FRAME_INTERVAL, starting at
    NEW_VIDEO_START_S to skip the pre-track intro.

    Frames are stored full-resolution (no crop yet) so OCR can see all text.
    Filenames encode the real video timestamp (offset from 0, not from start).
    """
    NEW_FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    videos = sorted(NEW_VIDEOS_DIR.glob("*.mp4"))
    if not videos:
        print("No video found in videos_new/. Run 'new-download' first.")
        return

    video = videos[0]
    stem = video.stem
    existing = list(NEW_FRAMES_DIR.glob(f"{stem}_*.jpg"))
    if existing:
        print(f"Frames already exist for {stem} ({len(existing)} frames). Delete frames_new/ to re-extract.")
        return

    print(f"Extracting frames from {video.name} every {NEW_FRAME_INTERVAL}s "
          f"starting at t={NEW_VIDEO_START_S}s...")
    out_pattern = str(NEW_FRAMES_DIR / f"{stem}_%06d.jpg")
    subprocess.run([
        FFMPEG, "-y",
        "-ss", str(NEW_VIDEO_START_S),
        "-i", str(video),
        "-vf", f"fps=1/{NEW_FRAME_INTERVAL}",
        "-q:v", "2",
        out_pattern,
    ], check=True, capture_output=True)

    # Rename to embed real video timestamp
    frames = sorted(NEW_FRAMES_DIR.glob(f"{stem}_*.jpg"))
    for i, frame in enumerate(frames):
        real_ts_ms = (NEW_VIDEO_START_S + i * NEW_FRAME_INTERVAL) * 1000
        new_name = NEW_FRAMES_DIR / f"{stem}_{real_ts_ms:08d}ms.jpg"
        frame.rename(new_name)
    print(f"Extracted {len(frames)} frames.")


def cmd_new_match():
    """OCR all new frames to find every timestamp where a corner label is visible.

    Unlike the original match which picks one best frame, this collects ALL
    frames where the label is detected — these are exactly the frames we want
    as candidates (they show the corner name on screen).

    Saves to corner_matches_new.json.
    """
    corner_names = load_corner_names()
    frames = sorted(NEW_FRAMES_DIR.glob("*.jpg"))

    if not frames:
        print("No frames found. Run 'new-extract' first.")
        return

    print(f"OCR-ing {len(frames)} frames...", flush=True)

    # corner_id -> list of {video_stem, timestamp_ms, score, frame_file}
    corner_label_frames = {}

    for i, frame in enumerate(frames):
        if (i + 1) % 50 == 0:
            print(f"  Scanned {i + 1}/{len(frames)}...", flush=True)

        text = ocr_frame(frame)
        if not text:
            continue

        match_name, score = fuzzy_match(text, corner_names)
        if not match_name or match_name not in corner_names:
            continue

        corner = corner_names[match_name]
        corner_id = corner["id"]
        video_stem, ts_ms = parse_frame_info(frame)

        if corner_id not in corner_label_frames:
            corner_label_frames[corner_id] = []
        corner_label_frames[corner_id].append({
            "video_stem": video_stem,
            "timestamp_ms": ts_ms,
            "score": score,
            "frame_file": frame.name,
        })

    # Index all frames by (video_stem, timestamp_ms) for gap-filling
    all_frames_index = {}  # (video_stem, ts_ms) -> frame_file
    for frame in frames:
        video_stem, ts_ms = parse_frame_info(frame)
        all_frames_index[(video_stem, ts_ms)] = frame.name

    # Build matches: fill gaps within each contiguous detection session.
    # OCR misses frames even when a label is on screen, so we include every
    # extracted frame between the first and last detection of each session.
    # Sessions are groups of detections where consecutive detections are within
    # SESSION_GAP_S of each other — this prevents false positives that are spread
    # across the whole video (e.g., a corner name visible on an always-on map label)
    # from inflating a corner to thousands of frames.
    FILL_BUFFER_S = 3   # extend each session window this many seconds beyond first/last detection
    SESSION_GAP_S = 60  # detections more than this many seconds apart start a new session
    matches = {}
    corner_map = {c["id"]: c for c in corner_names.values()}

    for corner_id, detected in corner_label_frames.items():
        corner = corner_map.get(corner_id)
        if not corner:
            continue
        detected.sort(key=lambda x: x["timestamp_ms"])
        video_stem = detected[0]["video_stem"]

        # Cluster detections into sessions
        sessions = []
        current_session = [detected[0]]
        for d in detected[1:]:
            gap_s = (d["timestamp_ms"] - current_session[-1]["timestamp_ms"]) / 1000
            if gap_s <= SESSION_GAP_S:
                current_session.append(d)
            else:
                sessions.append(current_session)
                current_session = [d]
        sessions.append(current_session)

        # Pick the largest session (most detections = most likely the real corner window)
        best_session = max(sessions, key=len)

        t_min = best_session[0]["timestamp_ms"] - FILL_BUFFER_S * 1000
        t_max = best_session[-1]["timestamp_ms"] + FILL_BUFFER_S * 1000

        if len(sessions) > 1:
            print(f"  [>] {corner['name']}: {len(sessions)} detection sessions, "
                  f"using largest ({len(best_session)} detections, "
                  f"{best_session[0]['timestamp_ms']//1000}s-{best_session[-1]['timestamp_ms']//1000}s)",
                  flush=True)

        # Collect every extracted frame in [t_min, t_max] for this video
        filled = []
        for (vstem, ts_ms), fname in sorted(all_frames_index.items()):
            if vstem == video_stem and t_min <= ts_ms <= t_max:
                filled.append({
                    "video_stem": vstem,
                    "timestamp_ms": ts_ms,
                    "score": 1.0,
                    "frame_file": fname,
                })

        if not filled:
            print(f"  [!!] {corner['name']}: no frames in session window, skipping", flush=True)
            continue

        matches[corner_id] = {
            "corner_id": corner_id,
            "corner_name": corner["name"],
            "label_frames": filled,
            "source": {
                "type": "youtube",
                "video_url": NEW_VIDEO_URL,
                "video_stem": video_stem,
                "start_offset_s": NEW_VIDEO_START_S,
            },
        }
        n_detected = len(detected)
        n_filled = len(filled)
        print(f"  [OK] {corner['name']}: {n_detected} detected -> {n_filled} frames "
              f"({filled[0]['timestamp_ms']//1000}s - {filled[-1]['timestamp_ms']//1000}s)",
              flush=True)

    with open(NEW_MATCHES_FILE, "w", encoding="utf-8") as f:
        json.dump(matches, f, indent=2)

    all_ids = {c["id"] for c in corner_names.values()}
    unmatched = all_ids - set(matches.keys())
    print(f"\nFound {len(matches)} corners. {len(unmatched)} unmatched.", flush=True)
    if unmatched:
        print(f"  Unmatched: {', '.join(sorted(unmatched))}", flush=True)
    print("\nRun 'new-candidates' to generate cropped candidate frames.", flush=True)


def cmd_new_candidates():
    """Crop the bottom driver-POV view from each label-visible frame and copy
    to public/candidates_new/{corner_id}/ for the dev picker UI.

    Also writes a candidates_new/manifest.json compatible with the existing
    dev picker component (same format as candidates/manifest.json).
    """
    import shutil
    from PIL import Image

    if not NEW_MATCHES_FILE.exists():
        print("No new matches found. Run 'new-match' first.")
        return

    with open(NEW_MATCHES_FILE, "r", encoding="utf-8") as f:
        matches = json.load(f)

    manifest = {}

    for corner_id, meta in matches.items():
        corner_dir = NEW_CANDIDATES_DIR / corner_id
        corner_dir.mkdir(parents=True, exist_ok=True)

        candidates = []
        for frame_info in meta["label_frames"]:
            src = NEW_FRAMES_DIR / frame_info["frame_file"]
            if not src.exists():
                continue

            # Crop to bottom driver-POV view
            img = Image.open(src)
            w, h = img.size
            top_px = int(h * BOTTOM_CROP_FRACTION)
            cropped = img.crop((0, top_px, w, h))

            # Save with same filename
            dest = corner_dir / frame_info["frame_file"]
            if not dest.exists():
                cropped.save(dest, "JPEG", quality=92)

            candidates.append({
                "filename": frame_info["frame_file"],
                "timestamp_ms": frame_info["timestamp_ms"],
                "offset_from_label": 0,   # these ARE the label frames
                "video_stem": frame_info["video_stem"],
            })

        manifest[corner_id] = {
            "corner_name": meta["corner_name"],
            "label_timestamp_ms": meta["label_frames"][0]["timestamp_ms"] if meta["label_frames"] else 0,
            "candidates": candidates,
            "selected": None,
            "source": meta.get("source", {}),
        }
        print(f"  {corner_id}: {len(candidates)} cropped candidates", flush=True)

    manifest_path = NEW_CANDIDATES_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\nCandidates written to {NEW_CANDIDATES_DIR}", flush=True)
    print(f"Open the app in dev mode -> 'Dev: Image Picker (New)' to select frames.", flush=True)


TEXT_CANDIDATES_DIR = PROJECT_ROOT / "public" / "text_candidates"

# Words that appear on the HUD / video overlay but are NOT corner names
TEXT_STOPWORDS = {
    'speed', 'kmh', 'km/h', 'km', 'charge', 'power', 'kwh', 'kw', 'battery',
    'lap', 'race', 'time', 'sector', 'gap', 'diff', 'pos', 'tyre', 'tyres',
    'the', 'a', 'an', 'in', 'at', 'to', 'of', 'and', 'or', 'is', 'it',
    'der', 'die', 'das', 'und', 'im', 'am', 'auf', 'bei', 'von', 'zu',
    'ee', 'mh', 'ah', 'oh', 'de', 'le', 'la', 'el', 'xe',
}


def is_corner_name_like(text):
    """Heuristic: does this text line look like a place/corner name?"""
    text = text.strip()
    if len(text) < 4 or len(text) > 50:
        return False
    # Needs to be mostly alphabetic
    alpha = sum(c.isalpha() or c in '- ' for c in text)
    if alpha < len(text) * 0.6:
        return False
    words = [w.strip('.,!?;:-') for w in text.split() if len(w.strip('.,!?;:-')) >= 2]
    if not words:
        return False
    content_words = [w for w in words if w.lower() not in TEXT_STOPWORDS and not w.isdigit()]
    if not content_words:
        return False
    # At least one word starts with a capital (proper noun)
    if not any(w[0].isupper() for w in content_words if w):
        return False
    return True


def cmd_new_scan_text():
    """Scan video frames in gap windows (between matched corners) for text that
    looks like corner names but wasn't matched automatically.

    Copies relevant frames to public/text_candidates/frames/ and writes a
    manifest (public/text_candidates/manifest.json) for the DevTextMatcher UI.

    Usage:
        python scripts/extract_corners.py new-scan-text
    """
    import shutil

    if not NEW_MATCHES_FILE.exists():
        print("No new matches found. Run 'new-match' first.")
        return

    with open(NEW_MATCHES_FILE) as f:
        matches = json.load(f)

    with open(TRACK_DATA) as f:
        corner_order = json.load(f)

    all_ids = [c["id"] for c in corner_order]
    corner_map = {c["id"]: c for c in corner_order}
    matched_ids = set(matches.keys())
    unmatched_ids = [cid for cid in all_ids if cid not in matched_ids]

    if not unmatched_ids:
        print("All corners are already matched.")
        return

    # Index frames by timestamp
    frames = sorted(NEW_FRAMES_DIR.glob("*.jpg"))
    if not frames:
        print("No frames in frames_new/. Run 'new-extract' first.")
        return

    frame_by_ts = {}
    video_stem_global = None
    for f in frames:
        vstem, ts = parse_frame_info(f)
        frame_by_ts[ts] = f
        if video_stem_global is None:
            video_stem_global = vstem
    all_ts = sorted(frame_by_ts.keys())

    # Build matched corner midpoints sorted by video timestamp
    matched_ts_by_id = {}
    for cid, meta in matches.items():
        lf = meta["label_frames"]
        if lf:
            matched_ts_by_id[cid] = (lf[0]["timestamp_ms"], lf[-1]["timestamp_ms"])

    # Find gap windows: stretches of video not covered by any matched corner
    # Build a sorted list of (start_ms, end_ms, corner_id) for matched corners
    covered = sorted(
        [(t[0], t[1], cid) for cid, t in matched_ts_by_id.items()],
        key=lambda x: x[0]
    )

    # Gap windows = spaces between covered regions
    gap_windows = []
    prev_end = all_ts[0]
    for t_start, t_end, cid in covered:
        if t_start - prev_end > 10_000:  # > 10s gap
            gap_windows.append({
                "start_ms": prev_end,
                "end_ms": t_start,
                "after_corner": None,
                "before_corner": cid,
            })
        prev_end = max(prev_end, t_end)
    if all_ts[-1] - prev_end > 10_000:
        gap_windows.append({
            "start_ms": prev_end,
            "end_ms": all_ts[-1],
            "after_corner": covered[-1][2] if covered else None,
            "before_corner": None,
        })

    # Fill in after_corner for each gap
    for i, gap in enumerate(gap_windows):
        if gap["after_corner"] is None and i > 0:
            gap["after_corner"] = gap_windows[i - 1].get("before_corner")

    print(f"Found {len(gap_windows)} gap windows, scanning for corner-name-like text...")

    frames_dir = TEXT_CANDIDATES_DIR / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    all_hits = []  # list of {time_s, lines, frame_file, gap_idx}

    for gap_idx, gap in enumerate(gap_windows):
        t0, t1 = gap["start_ms"], gap["end_ms"]
        span_s = (t1 - t0) // 1000
        after = gap.get("after_corner", "?")
        before = gap.get("before_corner", "?")
        print(f"\nGap {gap_idx}: {t0//1000}s – {t1//1000}s ({span_s}s)  "
              f"after={after}  before={before}")

        frames_in_gap = [(ts, frame_by_ts[ts]) for ts in all_ts if t0 <= ts <= t1]
        hits_this_gap = 0

        for ts, frame_path in frames_in_gap:
            text = ocr_frame(frame_path)
            if not text:
                continue

            # Extract corner-name-like lines
            corner_lines = []
            for line in text.split("\n"):
                line = line.strip()
                if is_corner_name_like(line):
                    corner_lines.append(line)

            if not corner_lines:
                continue

            # Copy frame to text_candidates/frames/
            dest_name = f"{ts//1000:05d}_{frame_path.name}"
            dest = frames_dir / dest_name
            if not dest.exists():
                shutil.copy2(frame_path, dest)

            all_hits.append({
                "time_s": ts // 1000,
                "lines": corner_lines,
                "frame_file": dest_name,
                "gap_idx": gap_idx,
            })
            hits_this_gap += 1

        print(f"  {hits_this_gap} frames with corner-name-like text")

    # Write manifest
    manifest = {
        "unmatched_corners": [
            {"id": cid, "name": corner_map[cid]["name"]} for cid in unmatched_ids
        ],
        "gap_windows": [
            {
                **gap,
                "start_ms": gap["start_ms"],
                "end_ms": gap["end_ms"],
            }
            for gap in gap_windows
        ],
        "hits": all_hits,
    }

    manifest_path = TEXT_CANDIDATES_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n{len(all_hits)} total text hits saved.")
    print(f"Manifest: {manifest_path}")
    print(f"Open the app -> 'Dev: Text Matcher' to assign corners.")


def ocr_label_region(frame_path):
    """OCR the full frame — corner name labels appear in the driver-POV section
    (bottom 55%), not the overhead views on top, so we need the full frame."""
    return ocr_frame(frame_path)


def cmd_new_scan_all():
    """Scan ALL frames in frames_new/ for any text in the label overlay region.

    No corner-name matching, no gap-window filtering — every frame that has
    any detectable text is saved (cropped to driver POV) in
    public/text_candidates/frames/ for manual assignment in the dev UI.

    Run after new-extract.  Then open the app -> Dev: Text Matcher.
    """
    import shutil
    from PIL import Image

    frames = sorted(NEW_FRAMES_DIR.glob("*.jpg"))
    if not frames:
        print("No frames in frames_new/. Run 'new-extract' first.")
        return

    print(f"Scanning {len(frames)} frames for label-region text...")

    TEXT_CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    frames_dir = TEXT_CANDIDATES_DIR / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    # Clear stale frames so old results don't bleed through
    for old in frames_dir.glob("*.jpg"):
        old.unlink()

    all_hits = []

    for i, frame_path in enumerate(frames):
        if i % 100 == 0:
            print(f"  {i}/{len(frames)}...", flush=True)

        text = ocr_label_region(frame_path)
        lines = [l.strip() for l in text.split("\n") if len(l.strip()) >= 3]
        if not lines:
            continue

        # Parse timestamp from filename: ..._XXXXXXXXMS.jpg
        try:
            ts_ms = int(frame_path.stem.split("_")[-1].rstrip("ms"))
        except ValueError:
            continue
        time_s = ts_ms // 1000

        # Crop full frame to driver POV view and save
        img = Image.open(frame_path)
        w, h = img.size
        top_px = int(h * BOTTOM_CROP_FRACTION)
        cropped = img.crop((0, top_px, w, h))

        dest_name = f"{time_s:05d}_{frame_path.name}"
        dest = frames_dir / dest_name
        cropped.save(dest, "JPEG", quality=85)

        all_hits.append({
            "time_s": time_s,
            "lines": lines,
            "frame_file": dest_name,
        })

    # Fuzzy-match each hit's OCR lines against known corner names
    print("Fuzzy-matching hits against corner names...")
    corner_names_map = load_corner_names()          # {lower_name: corner_dict}
    corner_name_keys = list(corner_names_map.keys())  # list of lowercase names
    suggestion_count = 0

    for hit in all_hits:
        best_cid = None
        best_score = 0.0
        for line in hit["lines"]:
            result = fuzzy_match(line, corner_name_keys, threshold=0.6)
            if result and result[1] > best_score:
                best_score = result[1]
                matched_key = result[0]
                best_cid = corner_names_map[matched_key]["id"]
        if best_cid and best_score >= 0.65:
            hit["suggested_corner_id"] = best_cid
            hit["suggestion_score"] = round(best_score, 3)
            suggestion_count += 1

    manifest = {
        "hits": all_hits,
        "gap_windows": [],
    }
    manifest_path = TEXT_CANDIDATES_DIR / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n{len(all_hits)} labeled frames saved ({suggestion_count} auto-suggested).")
    print("Open the app -> 'Dev: Text Matcher' to review and assign corners.")


# ── Dev: inspect unmatched corners ───────────────────────────────────────────

def cmd_new_inspect(target_corner_id=None):
    """Scan the time windows where unmatched corners should appear and dump all
    OCR text found there, with fuzzy-match scores vs the expected corner name.

    This helps identify what label text the video actually uses for corners that
    the automatic matcher missed (different spelling, umlaut encoding, etc.).

    Usage:
        python scripts/extract_corners.py new-inspect              # all unmatched
        python scripts/extract_corners.py new-inspect aremberg     # one corner
    """
    corner_names = load_corner_names()  # name.lower() -> corner dict
    corner_order = []
    with open(TRACK_DATA, "r", encoding="utf-8") as f:
        corner_order = json.load(f)  # preserves track order

    if not NEW_MATCHES_FILE.exists():
        print("No new matches found. Run 'new-match' first.")
        return

    with open(NEW_MATCHES_FILE, "r", encoding="utf-8") as f:
        matches = json.load(f)

    matched_ids = set(matches.keys())
    all_ids = [c["id"] for c in corner_order]
    unmatched_ids = [cid for cid in all_ids if cid not in matched_ids]

    if target_corner_id:
        if target_corner_id not in unmatched_ids:
            if target_corner_id in matched_ids:
                print(f"'{target_corner_id}' is already matched.")
            else:
                print(f"Unknown corner id '{target_corner_id}'.")
            return
        unmatched_ids = [target_corner_id]

    if not unmatched_ids:
        print("All corners are matched!")
        return

    # Build a timestamp map for matched corners: corner_id -> midpoint_ms
    matched_ts = {}
    for cid, meta in matches.items():
        lf = meta["label_frames"]
        if lf:
            mid = (lf[0]["timestamp_ms"] + lf[-1]["timestamp_ms"]) // 2
            matched_ts[cid] = mid

    # Index all new frames by timestamp
    frames = sorted(NEW_FRAMES_DIR.glob("*.jpg"))
    if not frames:
        print("No frames found in frames_new/. Run 'new-extract' first.")
        return
    frame_by_ts = {}
    video_stem_global = None
    for f in frames:
        vstem, ts = parse_frame_info(f)
        frame_by_ts[ts] = f
        if video_stem_global is None:
            video_stem_global = vstem
    all_ts_sorted = sorted(frame_by_ts.keys())

    # All matched timestamps sorted for video-timeline gap analysis
    matched_ts_sorted = sorted(matched_ts.values())

    # For each unmatched corner, find the expected time window.
    # Strategy: use track-order neighbours first; if that gives an inverted
    # window (video doesn't follow track order), fall back to finding the
    # largest unoccupied gap in the video timeline.
    for cid in unmatched_ids:
        pos = all_ids.index(cid)
        corner = corner_order[pos]

        # Find nearest matched predecessor and successor in track order
        prev_ts, next_ts = None, None
        prev_cid, next_cid = None, None
        for i in range(pos - 1, -1, -1):
            if all_ids[i] in matched_ts:
                prev_ts = matched_ts[all_ids[i]]
                prev_cid = all_ids[i]
                break
        for i in range(pos + 1, len(all_ids)):
            if all_ids[i] in matched_ts:
                next_ts = matched_ts[all_ids[i]]
                next_cid = all_ids[i]
                break

        # Build search window
        t_start = (prev_ts + 1000) if prev_ts is not None else all_ts_sorted[0]
        t_end   = (next_ts - 1000) if next_ts is not None else all_ts_sorted[-1]

        # Fallback: if window is inverted or empty, use the largest unoccupied
        # gap in the video timeline (i.e. the longest stretch with no matched corner)
        if t_start >= t_end:
            gaps = []
            bookends = [all_ts_sorted[0]] + matched_ts_sorted + [all_ts_sorted[-1]]
            for i in range(len(bookends) - 1):
                gaps.append((bookends[i], bookends[i + 1]))
            gaps.sort(key=lambda g: -(g[1] - g[0]))
            # Pick the gap that isn't already fully covered by matched corners
            # (simple heuristic: pick the largest gap overall)
            best_gap = gaps[0]
            t_start = best_gap[0] + 1000
            t_end   = best_gap[1] - 1000
            prev_cid = "(video-gap fallback)"
            next_cid = ""

        print(f"\n{'='*60}")
        print(f"  {corner['name']}  (id: {cid})")
        if prev_ts:
            print(f"  prev matched:  {prev_ts//1000}s  ({prev_cid})")
        if next_ts:
            print(f"  next matched:  {next_ts//1000}s  ({next_cid})")
        print(f"  scan window:   {t_start//1000}s – {t_end//1000}s  "
              f"({(t_end-t_start)//1000}s span, {sum(1 for ts in all_ts_sorted if t_start <= ts <= t_end)} frames)")
        print(f"{'='*60}")

        expected_name = corner["name"].lower()
        hits = []  # (ts, score, line, full_text)

        for ts in all_ts_sorted:
            if not (t_start <= ts <= t_end):
                continue
            frame_path = frame_by_ts[ts]
            text = ocr_frame(frame_path)
            if not text:
                continue

            # Check every line for any match to the expected name
            best_score = 0.0
            best_line = ""
            for line in text.split("\n"):
                line = line.strip()
                if not line:
                    continue
                # Direct substring
                if expected_name in line.lower():
                    best_score = 1.0
                    best_line = line
                    break
                score = SequenceMatcher(None, expected_name, line.lower()).ratio()
                if score > best_score:
                    best_score = score
                    best_line = line
                # Word chunks
                words = line.lower().split()
                for i in range(len(words)):
                    for j in range(i + 1, min(i + 5, len(words) + 1)):
                        chunk = " ".join(words[i:j])
                        s = SequenceMatcher(None, expected_name, chunk).ratio()
                        if s > best_score:
                            best_score = s
                            best_line = line

            if best_score >= 0.35:
                hits.append((ts, best_score, best_line, text.replace("\n", " | ")))

        if not hits:
            print("  (no OCR text found scoring >= 0.35 vs corner name)")
        else:
            # Sort by score desc, show top 20
            hits.sort(key=lambda x: -x[1])
            print(f"  Top OCR hits (score >= 0.35), best first:")
            for ts, score, line, full in hits[:20]:
                marker = "*** " if score >= 0.6 else "    "
                print(f"  {marker}t={ts//1000:4d}s  score={score:.2f}  line='{line}'")
                if score >= 0.5:
                    print(f"       full OCR: {full[:120]}")

    print(f"\nDone. Use 'new-manual <corner_id> <start_s> <end_s>' to force-match a window.")


def cmd_new_manual(corner_id, start_s, end_s):
    """Manually add a corner to the new matches file using a specific time window.

    Use after 'new-inspect' identifies the correct time range. The frames in
    [start_s, end_s] are added as label_frames and written to corner_matches_new.json.
    Then run 'new-candidates' to generate cropped images.

    Usage:
        python scripts/extract_corners.py new-manual aremberg 796 841
    """
    corner_names = load_corner_names()
    if corner_id not in corner_names:
        # Try by id directly from track data
        with open(TRACK_DATA) as f:
            corners = json.load(f)
        corner_map = {c["id"]: c for c in corners}
        if corner_id not in corner_map:
            print(f"Unknown corner id: '{corner_id}'")
            return
        corner = corner_map[corner_id]
    else:
        corner = corner_names[corner_id]

    frames = sorted(NEW_FRAMES_DIR.glob("*.jpg"))
    if not frames:
        print("No frames found. Run 'new-extract' first.")
        return

    t_start_ms = int(start_s) * 1000
    t_end_ms   = int(end_s)   * 1000
    video_stem_global = None

    label_frames = []
    for frame in frames:
        vstem, ts = parse_frame_info(frame)
        if video_stem_global is None:
            video_stem_global = vstem
        if t_start_ms <= ts <= t_end_ms:
            label_frames.append({
                "video_stem": vstem,
                "timestamp_ms": ts,
                "score": 1.0,
                "frame_file": frame.name,
            })

    if not label_frames:
        print(f"No frames found in {start_s}s – {end_s}s range.")
        return

    # Load existing matches and add/overwrite this corner
    existing = {}
    if NEW_MATCHES_FILE.exists():
        with open(NEW_MATCHES_FILE) as f:
            existing = json.load(f)

    corner_id_key = corner["id"]
    existing[corner_id_key] = {
        "corner_id": corner_id_key,
        "corner_name": corner["name"],
        "label_frames": label_frames,
        "source": {
            "type": "youtube",
            "video_url": NEW_VIDEO_URL,
            "video_stem": video_stem_global,
            "start_offset_s": NEW_VIDEO_START_S,
            "manual": True,
        },
    }

    with open(NEW_MATCHES_FILE, "w") as f:
        json.dump(existing, f, indent=2)

    print(f"[OK] Added '{corner['name']}' ({corner_id_key}): "
          f"{len(label_frames)} frames from {start_s}s to {end_s}s")
    print(f"Run 'new-candidates' to regenerate cropped images.")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    cmd = sys.argv[1]

    if cmd == "download":
        cmd_download()
    elif cmd == "extract":
        cmd_extract()
    elif cmd == "match":
        cmd_match()
    elif cmd == "inpaint":
        cmd_inpaint()
    elif cmd == "refine":
        if len(sys.argv) < 3:
            print("Usage: refine <corner_id> [--shift +N|-N]")
            return
        corner_id = sys.argv[2]
        shift = 0
        if "--shift" in sys.argv:
            idx = sys.argv.index("--shift")
            if idx + 1 < len(sys.argv):
                shift = int(sys.argv[idx + 1])
        cmd_refine(corner_id, shift)
    elif cmd == "candidates":
        cmd_candidates()
    elif cmd == "apply":
        cmd_apply_selection()
    elif cmd == "all":
        cmd_download()
        cmd_extract()
        cmd_match()
        cmd_candidates()
    # ── New multi-view video pipeline ─────────────────────────────────────────
    elif cmd == "new-download":
        cmd_new_download()
    elif cmd == "new-extract":
        cmd_new_extract()
    elif cmd == "new-match":
        cmd_new_match()
    elif cmd == "new-candidates":
        cmd_new_candidates()
    elif cmd == "new-all":
        cmd_new_download()
        cmd_new_extract()
        cmd_new_match()
        cmd_new_candidates()
    elif cmd == "new-scan-text":
        cmd_new_scan_text()
    elif cmd == "new-scan-all":
        cmd_new_scan_all()
    elif cmd == "new-inspect":
        target = sys.argv[2] if len(sys.argv) > 2 else None
        cmd_new_inspect(target)
    elif cmd == "new-manual":
        if len(sys.argv) < 5:
            print("Usage: new-manual <corner_id> <start_s> <end_s>")
        else:
            cmd_new_manual(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)


if __name__ == "__main__":
    main()
