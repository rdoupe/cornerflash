#!/usr/bin/env node
/**
 * fetch-gps.js
 *
 * Queries the Overpass API for circuit geometry, then for each corner whose
 * `gps` field is null, finds the nearest point on the circuit polyline and
 * writes back the gps coordinates and heading.
 *
 * Usage:
 *   node scripts/fetch-gps.js --track nordschleife
 *   node scripts/fetch-gps.js --track spa
 *
 * Requires Node 18+ (uses native fetch). No npm dependencies needed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const trackIndex = args.indexOf('--track');
if (trackIndex === -1 || !args[trackIndex + 1]) {
  console.error('Usage: node scripts/fetch-gps.js --track <nordschleife|spa>');
  process.exit(1);
}
const trackId = args[trackIndex + 1].toLowerCase();

const TRACK_QUERIES = {
  nordschleife: `[out:json][timeout:60];
way["name"="Nürburgring Nordschleife"];
out geom;`,
  spa: `[out:json][timeout:60];
way["name"="Circuit de Spa-Francorchamps"];
out geom;`,
};

if (!TRACK_QUERIES[trackId]) {
  console.error(`Unknown track "${trackId}". Valid options: nordschleife, spa`);
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
// Haversine distance (returns metres)
// ---------------------------------------------------------------------------

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------------------------
// Find the index of the closest point on a polyline to (lat, lng)
// ---------------------------------------------------------------------------

function nearestPointIndex(polyline, lat, lng) {
  let minDist = Infinity;
  let minIdx  = 0;
  for (let i = 0; i < polyline.length; i++) {
    const dist = haversine(lat, lng, polyline[i].lat, polyline[i].lon);
    if (dist < minDist) {
      minDist = dist;
      minIdx  = i;
    }
  }
  return minIdx;
}

// ---------------------------------------------------------------------------
// Calculate heading (bearing) in degrees [0, 360) from two consecutive points
// Uses the formula specified in the project brief.
// ---------------------------------------------------------------------------

function calcHeading(pt1, pt2) {
  const rawDeg = Math.atan2(pt2.lon - pt1.lon, pt2.lat - pt1.lat) * (180 / Math.PI);
  return (rawDeg + 360) % 360;
}

// ---------------------------------------------------------------------------
// Overpass query
// ---------------------------------------------------------------------------

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

async function fetchOverpass(query) {
  console.log('Querying Overpass API...');
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) {
    throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Extract and stitch polyline from Overpass response
// The circuit may be split across multiple way elements. We concatenate all
// geometry node arrays into one ordered polyline.
// ---------------------------------------------------------------------------

function extractPolyline(overpassData) {
  const ways = overpassData.elements.filter((el) => el.type === 'way' && el.geometry);
  if (ways.length === 0) {
    throw new Error('No ways with geometry found in Overpass response.');
  }

  if (ways.length === 1) {
    console.log(`Found 1 way with ${ways[0].geometry.length} nodes.`);
    return ways[0].geometry; // array of {lat, lon}
  }

  // Multiple ways: stitch them in order by matching endpoints.
  // Simple greedy chain-building.
  console.log(`Found ${ways.length} ways — stitching into a single polyline.`);

  const segments = ways.map((w) => w.geometry.slice()); // shallow copy each
  const chain = segments.shift(); // start with first segment

  while (segments.length > 0) {
    const chainTail = chain[chain.length - 1];
    let bestIdx  = -1;
    let bestReverse = false;
    let bestDist = Infinity;

    for (let i = 0; i < segments.length; i++) {
      const head = segments[i][0];
      const tail = segments[i][segments[i].length - 1];
      const dHead = haversine(chainTail.lat, chainTail.lon, head.lat, head.lon);
      const dTail = haversine(chainTail.lat, chainTail.lon, tail.lat, tail.lon);
      if (dHead < bestDist) { bestDist = dHead; bestIdx = i; bestReverse = false; }
      if (dTail < bestDist) { bestDist = dTail; bestIdx = i; bestReverse = true;  }
    }

    const seg = segments.splice(bestIdx, 1)[0];
    if (bestReverse) seg.reverse();
    // Skip the first point of the next segment if it's essentially the same as chain tail.
    const startAt = bestDist < 1 ? 1 : 0;
    chain.push(...seg.slice(startAt));
  }

  console.log(`Stitched polyline has ${chain.length} nodes.`);
  return chain;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dataFilePath = resolveDataPath(trackId);
  console.log(`Reading: ${dataFilePath}`);
  const corners = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));

  const nullCount = corners.filter((c) => c.gps === null).length;
  console.log(`Corners with null GPS: ${nullCount} / ${corners.length}`);

  if (nullCount === 0) {
    console.log('All corners already have GPS coordinates. Nothing to do.');
    return;
  }

  // Fetch circuit geometry
  const overpassData = await fetchOverpass(TRACK_QUERIES[trackId]);
  const polyline = extractPolyline(overpassData);

  if (polyline.length < 2) {
    throw new Error('Polyline has fewer than 2 points — cannot calculate headings.');
  }

  // For each corner missing GPS, find the nearest polyline point.
  let updatedCount = 0;
  for (const corner of corners) {
    if (corner.gps !== null) continue; // already populated — skip

    // We don't have a reference coordinate to start from, so we can't assign
    // GPS automatically to corners that have never been geolocated. Instead,
    // this script is designed to be run AFTER a human has set at least a rough
    // gps on each corner, or the corner names have been matched to OSM node tags.
    //
    // As a fallback: distribute corners evenly around the polyline in lap order.
    // This is a placeholder that will be obviously wrong — it gives a starting
    // point for human verification.
    const totalCorners = corners.length;
    const lapFraction  = (corner.order - 1) / totalCorners;
    const polyIdx      = Math.round(lapFraction * (polyline.length - 1));
    const pt           = polyline[polyIdx];
    const nextPt       = polyline[Math.min(polyIdx + 1, polyline.length - 1)];

    corner.gps     = { lat: pt.lat, lng: pt.lon };
    corner.heading = parseFloat(calcHeading(pt, nextPt).toFixed(1));
    corner.verified = false; // human must verify
    updatedCount++;
  }

  console.log(`Updated ${updatedCount} corner(s) with estimated GPS from polyline.`);
  console.log('WARNING: GPS positions are evenly distributed along the circuit polyline.');
  console.log('         They are placeholders — each entry needs human verification.');

  fs.writeFileSync(dataFilePath, JSON.stringify(corners, null, 2) + '\n', 'utf8');
  console.log(`Written: ${dataFilePath}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
