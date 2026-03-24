/**
 * Apply CORS policy to Cloudflare R2 bucket for Android WebView support.
 * Adds https://localhost and capacitor://localhost as allowed origins.
 *
 * Usage:
 *   R2_ACCESS_KEY_ID=xxx R2_SECRET_ACCESS_KEY=yyy node scripts/set-r2-cors.mjs
 *   OR add R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY to .env and run:
 *   node -r dotenv/config scripts/set-r2-cors.mjs   (if dotenv installed)
 *   node scripts/set-r2-cors.mjs                     (if vars already in env)
 */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Try to load .env manually (no dotenv dependency required)
async function loadDotEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const content = await readFile(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not found, rely on actual env vars
  }
}

await loadDotEnv();

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'c5ebfded9f5bf47795fde8b98be73862';
const BUCKET = process.env.R2_BUCKET || 'cornerflash';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('\n❌  R2 credentials not found.\n');
  console.error('Add to your .env file:');
  console.error('  R2_ACCESS_KEY_ID=<your-key>');
  console.error('  R2_SECRET_ACCESS_KEY=<your-secret>');
  console.error('\nGet credentials: Cloudflare dashboard → R2 → Manage R2 API tokens');
  console.error('Required permissions: Object Read & Write (or Admin Read & Write)\n');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
});

const CORS_RULES = [
  {
    AllowedOrigins: [
      'https://localhost',
      'capacitor://localhost',
      'http://localhost',
      'https://cornerflash.vercel.app',
    ],
    AllowedMethods: ['GET', 'HEAD'],
    AllowedHeaders: ['*'],
    MaxAgeSeconds: 86400,
  },
];

// Show current config first
try {
  console.log('Current CORS config:');
  const current = await client.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log(JSON.stringify(current.CORSRules, null, 2));
} catch {
  console.log('(no existing CORS config)');
}

console.log('\nApplying new CORS policy...');
await client.send(new PutBucketCorsCommand({
  Bucket: BUCKET,
  CORSConfiguration: { CORSRules: CORS_RULES },
}));

console.log('✅  CORS policy applied successfully.');
console.log('\nAllowed origins:');
CORS_RULES[0].AllowedOrigins.forEach(o => console.log(`  • ${o}`));
