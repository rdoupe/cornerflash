# Data Files

## Status

Both JSON files are **stubs** — corner names are best-effort from training knowledge
but all GPS coordinates are `null` and all entries are marked `verified: false`.

**Do not run the image download script until GPS coords are populated and names verified.**

---

## Before writing any code, complete these steps:

### Step 1 — Verify corner names

Cross-check both files against primary sources:

- **Spa**: https://www.formula1.com/en/racing/2024/belgium/circuit.html
  or https://en.wikipedia.org/wiki/Circuit_de_Spa-Francorchamps
  Note: circuit was modified post-2022. Confirm current layout names.

- **Nordschleife**: https://nring.info/nurburgring-nordschleife-corners/
  or https://oversteer48.com/nurburgring-corner-names/
  or https://en.wikipedia.org/wiki/N%C3%BCrburgring#Nordschleife
  The nordschleife.json currently has 29 sections — the full list should be
  ~42 named sections. Add any missing ones.

Once verified, set `"verified": true` on each entry.

### Step 2 — Populate GPS coordinates

Run `scripts/fetch-gps.js` (to be written) to query OpenStreetMap / Overpass API
for real circuit geometry and populate `gps` fields.

Do NOT use AI-estimated GPS — they will point Street View at the wrong location.

Overpass API queries:
- Spa: `way["name"="Circuit de Spa-Francorchamps"]`
- Nordschleife: `way["name"="Nürburgring Nordschleife"]`

### Step 3 — Calculate headings

Once GPS coords are populated, headings can be auto-calculated from
consecutive corner positions. `scripts/fetch-gps.js` should do this too.

### Step 4 — Download Street View images

Run `scripts/download-images.js` once with a Google Maps Static API key.
Images saved to `public/images/corners/{trackId}/{cornerId}.jpg`.
Requires "Street View Static API" enabled in Google Cloud Console.

### Step 5 — Spa images

Take screenshots in Assetto Corsa at the entry approach to each corner.
Save as `public/images/corners/spa/{cornerId}.jpg`.
Corner IDs are the `id` fields in spa.json (e.g. `eau-rouge.jpg`).

---

## JSON Schema

```json
{
  "id": "string — kebab-case, used as filename for image",
  "name": "string — official corner name",
  "order": "number — lap position, 1-based",
  "type": "hairpin | chicane | sweeper | medium | fast",
  "gps": { "lat": number, "lng": number } | null,
  "heading": "number — compass degrees driver faces approaching entry" | null,
  "verified": "boolean — false until name + GPS confirmed against primary source",
  "notes": "string — 1-2 sentence character description"
}
```
