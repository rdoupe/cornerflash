"""
Generate German pronunciation audio for CornerFlash corner names.

Uses edge-tts (Microsoft Edge neural TTS — free, no API key needed).

Install:
    pip install edge-tts

Usage:
    python scripts/generate_audio.py [track]

    track defaults to 'nordschleife'

Output:
    public/audio/{track}/{corner_id}.mp3
"""

import asyncio
import json
import os
import sys

VOICE = "de-DE-KatjaNeural"  # Female German neural voice (clear, natural)

async def generate(track: str):
    try:
        import edge_tts
    except ImportError:
        print("ERROR: edge-tts not installed. Run: pip install edge-tts")
        sys.exit(1)

    data_path = os.path.join("public", "data", f"{track}.json")
    if not os.path.exists(data_path):
        print(f"ERROR: {data_path} not found")
        sys.exit(1)

    with open(data_path, encoding="utf-8") as f:
        corners = json.load(f)

    out_dir = os.path.join("public", "audio", track)
    os.makedirs(out_dir, exist_ok=True)

    print(f"Generating {len(corners)} audio files -> {out_dir}/")
    print(f"Voice: {VOICE}\n")

    for corner in corners:
        cid = corner["id"]
        name = corner["name"]
        dest = os.path.join(out_dir, f"{cid}.mp3")

        if os.path.exists(dest):
            print(f"  [skip] {cid} (exists)")
            continue

        try:
            communicate = edge_tts.Communicate(name, VOICE)
            await communicate.save(dest)
            print(f"  [OK]   {cid}: {name}")
        except Exception as e:
            print(f"  [ERR]  {cid}: {e}")

    print(f"\nDone. {len(corners)} corners processed.")

if __name__ == "__main__":
    track = sys.argv[1] if len(sys.argv) > 1 else "nordschleife"
    asyncio.run(generate(track))
