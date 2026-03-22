#!/usr/bin/env node
/**
 * download-images.js
 *
 * Downloads Google Street View Static API images for each corner in a track's
 * JSON data file. Skips corners where gps is null.
 *
 * Usage:
 *   node scripts/download-images.js --track nordschleife
 *   node scripts/download-images.js --track spa
 *   node scripts/download-images.js --track nordschleife --sample
 *   node scripts/download-images.js --track spa --sample
 *
 * Requirements:
 *   - Node 18+ (native fetch)
 *   - GOOGLE_MAPS_API_KEY environment variable set
 *   - Street View Static API enabled in Google Cloud Console
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Auto-load .env from project root (no dotenv dependency needed)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const match = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  });
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const trackIndex = args.indexOf('--track');
if (trackIndex === -1 || !args[trackIndex + 1]) {
  console.error('Usage: node scripts/download-images.js --track <nordschleife|spa> [--sample]');
  process.exit(1);
}
const trackId  = args[trackIndex + 1].toLowerCase();
const isSample = args.includes('--sample');

// ---------------------------------------------------------------------------
// Sample corner IDs per track
// ---------------------------------------------------------------------------

const SAMPLE_CORNERS = {
  nordschleife: ['schwedenkreuz', 'caracciola-karussell', 'flugplatz', 'pflanzgarten', 'aremberg'],
  spa:          ['eau-rouge', 'raidillon', 'pouhon', 'blanchimont', 'la-source'],
};

if (!SAMPLE_CORNERS[trackId]) {
  console.error(`Unknown track "${trackId}". Valid options: nordschleife, spa`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error('Error: GOOGLE_MAPS_API_KEY environment variable is not set.');
  console.error('Export it before running: export GOOGLE_MAPS_API_KEY=your_key_here');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// File resolution: prefer public/data, fall back to data/
// ---------------------------------------------------------------------------

function resolveDataPath(id) {
  const publicPath = path.join(__dirname, '..', 'public', 'data', `${id}.json`);
  const dataPath   = path.join(__dirname, '..', 'data', `${id}.json`);
  if (fs.existsSync(publicPath)) return publicPath;
  if (fs.existsSync(dataPath))   return dataPath;
  throw new Error(`Cannot find data file for track "${id}" in public/data/ or data/`);
}

// ---------------------------------------------------------------------------
// Street View URL builder
// ---------------------------------------------------------------------------

const STREET_VIEW_BASE = 'https://maps.googleapis.com/maps/api/streetview';

function buildStreetViewUrl(lat, lng, heading) {
  const params = new URLSearchParams({
    size:    '800x500',
    location: `${lat},${lng}`,
    heading:  String(heading ?? 0),
    pitch:    '5',
    fov:      '90',
    key:      API_KEY,
  });
  return `${STREET_VIEW_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Download a single image and save it
// ---------------------------------------------------------------------------

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  // Street View returns a 200 even when no imagery is available, but the
  // Content-Type will be image/jpeg for real images and occasionally
  // application/json for errors on some endpoints. Check content type.
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    const text = await res.text();
    throw new Error(`Unexpected content-type "${contentType}": ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

// ---------------------------------------------------------------------------
// Ensure directory exists (recursive mkdir)
// ---------------------------------------------------------------------------

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// ---------------------------------------------------------------------------
// Sleep helper (be polite to the API)
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dataFilePath = resolveDataPath(trackId);
  console.log(`Reading: ${dataFilePath}`);
  const corners = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));

  // Filter to sample if requested
  let targets = corners;
  if (isSample) {
    const sampleIds = new Set(SAMPLE_CORNERS[trackId]);
    targets = corners.filter((c) => sampleIds.has(c.id));
    console.log(`Sample mode: downloading ${targets.length} corners: ${[...sampleIds].join(', ')}`);
  }

  // Skip corners with no GPS
  const withGps    = targets.filter((c) => c.gps !== null);
  const withoutGps = targets.filter((c) => c.gps === null);

  if (withoutGps.length > 0) {
    console.log(`Skipping ${withoutGps.length} corner(s) with null GPS: ${withoutGps.map((c) => c.id).join(', ')}`);
  }

  if (withGps.length === 0) {
    console.log('No corners with GPS coordinates to download. Run fetch-gps.js first.');
    return;
  }

  // Output directory
  const outputDir = path.join(__dirname, '..', 'public', 'images', 'corners', trackId);
  ensureDir(outputDir);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Downloading ${withGps.length} image(s)...\n`);

  let successCount = 0;
  let failCount    = 0;

  for (let i = 0; i < withGps.length; i++) {
    const corner  = withGps[i];
    const destPath = path.join(outputDir, `${corner.id}.jpg`);
    const url      = buildStreetViewUrl(corner.gps.lat, corner.gps.lng, corner.heading);

    process.stdout.write(`[${i + 1}/${withGps.length}] ${corner.id} ... `);

    // Skip if file already exists (avoids re-downloading)
    if (fs.existsSync(destPath)) {
      console.log('already exists, skipping.');
      successCount++;
      continue;
    }

    try {
      const bytes = await downloadImage(url, destPath);
      console.log(`saved (${(bytes / 1024).toFixed(1)} KB)`);
      successCount++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failCount++;
    }

    // Polite delay between requests (100ms)
    if (i < withGps.length - 1) {
      await sleep(100);
    }
  }

  console.log(`\nDone. ${successCount} saved, ${failCount} failed.`);
  if (failCount > 0) {
    console.log('Check that the Street View Static API is enabled and the API key is valid.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
