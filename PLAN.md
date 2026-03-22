# CornerFlash — Project Plan

A spaced repetition learning app for memorizing racetrack corner names.
Primary use case: learning Spa-Francorchamps and Nürburgring Nordschleife
before driving them. Built for web first, then mobile.

---

## The Problem

The Nordschleife has 42 named sections covering 73 corners over 20.8km.
Spa has ~14 named corners. You're driving the Nordschleife this summer.
Passive watching of "learn the Ring" videos doesn't encode names reliably.
Active recall via spaced repetition does.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind | You know React; Vite is the current standard CRA replacement — it's just a fast dev server + bundler, nothing exotic |
| Storage (now) | localStorage | Zero setup, works offline immediately |
| Storage (later) | Supabase | Postgres + auth + REST API. Free tier. Swap in by changing one file. |
| Mobile | PWA first | Wraps the same React app, works offline, installs to home screen. No rewrite. |
| App Store (optional) | Capacitor | Wraps the PWA in a native shell if App Store distribution is ever needed. |

---

## Architecture Principles

### Storage Abstraction (critical)
All progress read/write goes through a single module — `src/storage.js`.
Today it wraps localStorage. Later it wraps Supabase. The rest of the app
never knows or cares which backend is active.

```js
// src/storage.js
export async function saveProgress(cornerId, trackId, smData) { ... }
export async function loadAllProgress(trackId) { ... }
export async function resetProgress(trackId) { ... }
```

### Data Model
Corner data lives in static JSON files in `public/data/`.
Progress/SRS state lives in storage (localStorage → Supabase).
Images live in `public/images/corners/{trackId}/{cornerId}.jpg`.

---

## SRS Algorithm: SM-2

SM-2 is the classic spaced repetition algorithm powering Anki.
~40 lines of code. Battle-tested since 1987.

After each flashcard, user rates 0–5:
- **0–2** (Again/Hard): card comes back in minutes/hours
- **3** (Good): interval stays or slightly increases
- **4–5** (Easy): interval multiplies by "easiness factor"

Each card stores:
```json
{
  "cornerId": "eau-rouge",
  "trackId": "spa",
  "interval": 6,
  "repetitions": 3,
  "easeFactor": 2.5,
  "nextReview": "2026-03-28T00:00:00Z"
}
```

Cards due today are surfaced for review. New cards are introduced at a
configurable rate (e.g. 5 new cards/day) to avoid overwhelming.

---

## Learning Modes

### 1. Study Mode (sequential)
Walk through all corners in lap order. See the corner name + notes.
No pressure — just absorbing before testing begins.
Use this first when starting a new track.

### 2. Flashcard Mode (SRS-driven)
The core learning loop:
- Show: driver's-perspective image of corner approach
- User thinks: "what corner is this?"
- Tap to reveal: corner name, lap position, character notes
- Rate: Again / Hard / Good / Easy
- SM-2 schedules next review

Also supports reverse: show corner name → recall position in lap / what it looks like.

### 3. Track Map Mode (future)
Interactive SVG track map. Tap a corner to see its name and drill it.
Pin corners you're struggling with.

---

## Data Pipeline

### Corner JSON Schema
```json
{
  "id": "eau-rouge",
  "name": "Eau Rouge",
  "order": 2,
  "type": "fast",
  "gps": { "lat": 50.4351, "lng": 5.9717 },
  "heading": 28,
  "verified": false,
  "notes": "High-speed left-hander at the bottom of the valley, leads immediately into Raidillon."
}
```

`verified: false` means GPS coords and/or name needs cross-checking against
a primary source before the Street View image download script is run.

### GPS Coordinate Strategy
**Do not use AI-estimated GPS.** Use OpenStreetMap / Overpass API instead.

Both circuits are fully mapped in OSM. The script `scripts/fetch-gps.js`
queries the Overpass API for the circuit track geometry (a GPS polyline),
then maps each named section to its position along that polyline.

Overpass query for Nordschleife:
```
[out:json];
way["name"="Nürburgring Nordschleife"];
out geom;
```

### Heading Calculation
Once we have consecutive GPS points, heading is calculated as:
```js
Math.atan2(lng2 - lng1, lat2 - lat1) * (180 / Math.PI)
```
This gives the bearing the driver faces approaching each corner entry.

### Street View Image Download
Run once. Never again. Script: `scripts/download-images.js`

For each corner:
```
GET https://maps.googleapis.com/maps/api/streetview
  ?size=800x500
  &location={lat},{lng}
  &heading={heading}
  &pitch=5
  &fov=90
  &key={GOOGLE_MAPS_API_KEY}
```

Output: `public/images/corners/{trackId}/{cornerId}.jpg`

Requires a Google Maps Static API key. Free up to 28,000 requests/month.
Run this script once → images become local static assets forever.
No API key needed at runtime.

### Spa Images
Your Assetto Corsa sim screenshots. Drive to the entry of each corner,
screenshot, save as `public/images/corners/spa/{cornerId}.jpg`.
Filenames must match corner IDs in `spa.json`.

---

## Build Phases

### Phase 1 — Data ✅ (in progress)
- [x] Define corner JSON schema
- [ ] Compile `spa.json` — corner names verified against primary sources
- [ ] Compile `nordschleife.json` — all 42 named sections verified
- [ ] Mark all entries `verified: false` until GPS + name confirmed
- [ ] Write `scripts/fetch-gps.js` — queries Overpass API, updates JSON with real coords
- [ ] Write `scripts/download-images.js` — bulk Street View image download

### Phase 2 — Web MVP (local)
- [ ] Scaffold: `npm create vite@latest cornerflash -- --template react`
- [ ] Add Tailwind: `npm install -D tailwindcss @tailwindcss/vite`
- [ ] Implement `src/storage.js` — localStorage abstraction
- [ ] Implement `src/sm2.js` — SM-2 algorithm (pure functions, no side effects)
- [ ] Build Study Mode — sequential walkthrough, corner name + notes
- [ ] Build Flashcard Mode — image → reveal → rate → next
- [ ] Build Progress View — per-track stats, due today, mastered, struggling
- [ ] Track selector — switch between Spa and Nordschleife

### Phase 3 — Supabase Integration
- [ ] Create Supabase project (free tier)
- [ ] Schema: `users`, `progress` tables
- [ ] Swap `src/storage.js` to use Supabase client
- [ ] Add auth (email/Google OAuth)
- [ ] Test cross-device sync

### Phase 4 — PWA / Mobile
- [ ] Add `vite-plugin-pwa`
- [ ] Configure service worker + cache strategy (cache-first for images)
- [ ] Add web manifest (name, icon, theme color)
- [ ] Test install on iOS and Android

### Phase 5 — Track Map
- [ ] Source or create SVG track maps for Spa and Nordschleife
- [ ] Overlay corner tap targets
- [ ] Link taps to flashcard drill for that corner

---

## File Structure (target)

```
cornerflash/
├── public/
│   ├── data/
│   │   ├── spa.json
│   │   └── nordschleife.json
│   └── images/
│       └── corners/
│           ├── spa/           ← your AC screenshots
│           └── nordschleife/  ← Street View downloads
├── scripts/
│   ├── fetch-gps.js           ← one-time: queries Overpass, writes GPS to JSON
│   └── download-images.js     ← one-time: downloads Street View images
├── src/
│   ├── storage.js             ← THE abstraction layer (swap localStorage ↔ Supabase here)
│   ├── sm2.js                 ← pure SM-2 algorithm
│   ├── components/
│   │   ├── StudyMode.jsx
│   │   ├── FlashcardMode.jsx
│   │   ├── ProgressView.jsx
│   │   └── TrackSelector.jsx
│   ├── App.jsx
│   └── main.jsx
├── PLAN.md                    ← this file
└── package.json
```

---

## Key Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Images hosted vs API | Static hosted | Offline PWA support; no API key at runtime; no rate limits; no future cost |
| Image source — Spa | Assetto Corsa screenshots | You sim race it; you own the screenshots; perfect driver POV |
| Image source — Nordschleife | Google Street View (downloaded once) | Full circuit coverage; real road; one-time API use |
| GPS source | OpenStreetMap / Overpass API | Real surveyed data; not AI estimates |
| Mobile | PWA first, Capacitor if needed | Reuses 100% of web code; no App Store friction for personal use |
| Backend | Supabase | Postgres-based; generous free tier; self-hostable; not Firebase |
| Cross-device sync | Yes (it's 2026) | localStorage for local dev; Supabase replaces it in Phase 3 |
| Learning method | SM-2 SRS + active recall | Decades of research; proven for vocabulary-scale memorization tasks |

---

## Open Questions / TODO Before Coding

1. **Verify Nordschleife section names** against nring.info or oversteer48.com
   before building — don't want to memorize wrong names before your drive.
2. **Current Spa layout** — circuit was modified post-2022. Confirm corner
   names reflect the current racing layout, not the pre-2022 one.
3. **Google Maps API key** — needed to run `download-images.js` once.
   Create at console.cloud.google.com. Enable "Street View Static API".
4. **Supabase project** — can be deferred to Phase 3 but create early
   to reserve a project name.
5. **Nordschleife direction** — confirm lap direction for heading calculations
   (clockwise when viewed from above, going east out of the pits).
