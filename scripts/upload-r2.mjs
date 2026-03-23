/**
 * Bulk upload candidates_new/ to Cloudflare R2
 * Usage: node scripts/upload-r2.mjs
 */
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET = process.env.R2_BUCKET ?? 'cornerflash';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const LOCAL_DIR = 'public/candidates_new';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function exists(key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

const files = [];
for await (const f of walk(LOCAL_DIR)) files.push(f);
console.log(`Found ${files.length} files to upload\n`);

let done = 0, skipped = 0, errors = 0;
const CONCURRENCY = 8;

async function upload(localPath) {
  const key = relative(LOCAL_DIR, localPath).replace(/\\/g, '/');
  if (await exists(key)) {
    skipped++;
    return;
  }
  const body = await readFile(localPath);
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  done++;
  if (done % 50 === 0) console.log(`  ${done + skipped}/${files.length} (${done} uploaded, ${skipped} skipped)`);
}

// Process in batches
for (let i = 0; i < files.length; i += CONCURRENCY) {
  const batch = files.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(f => upload(f).catch(e => { errors++; console.error(`ERR ${f}: ${e.message}`); })));
}

// Also upload manifest.json
const manifestPath = `${LOCAL_DIR}/manifest.json`;
const manifestKey = 'manifest.json';
const manifestBody = await readFile(manifestPath);
await client.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: manifestKey,
  Body: manifestBody,
  ContentType: 'application/json',
  CacheControl: 'no-cache',
}));
console.log('\nUploaded manifest.json');

console.log(`\nDone! ${done} uploaded, ${skipped} skipped, ${errors} errors`);
