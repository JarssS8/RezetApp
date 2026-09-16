#!/usr/bin/env node
// Downloads every idea's Cecotec photo once and writes a small, resized JPEG
// to app/public/ideas/photos/<id>.jpg — the raw S3 originals can run up to
// 13 MB, which is what made the Ideas grid take up to a minute to load on
// mobile. Resumable: skips ids that already have a local file. Run after
// merge.mjs/normalize.mjs (needs cecotec-recipes.json), before split-ideas.mjs
// (which checks these files to fill in `photoUrl`).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SOURCE = path.join(ROOT, 'cecotec-recipes.json');
const OUT_DIR = path.join(ROOT, '..', '..', 'app', 'public', 'ideas', 'photos');
const CONCURRENCY = 8;
const WIDTH = 640;
const JPEG_QUALITY = 72;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBytes(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 404 || res.status === 403) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (err.fatal || attempt >= 3) throw err;
      await sleep(500 * attempt * attempt);
    }
  }
}

const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const recipes = data.recipes.filter((r) => r.photoUrl);

let ok = 0;
let skipped = 0;
let failed = 0;
const failedIds = [];

async function worker(queue) {
  for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
    const r = recipes[i];
    const out = path.join(OUT_DIR, `${r.id}.jpg`);
    if (fs.existsSync(out)) {
      skipped++;
      continue;
    }
    try {
      const bytes = await fetchBytes(r.photoUrl);
      await sharp(bytes)
        .rotate() // respeta EXIF orientation antes de recortar el ancho
        .resize({ width: WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(out);
      ok++;
    } catch (err) {
      failed++;
      failedIds.push(r.id);
      console.error(`  fallo ${r.id}: ${err.message}`);
    }
    if ((ok + failed) % 50 === 0) console.log(`  ${ok + failed}/${recipes.length - skipped}…`);
  }
}

console.log(`${recipes.length} ideas con foto — generando miniaturas en ${path.relative(process.cwd(), OUT_DIR)}/`);
const queue = recipes.map((_, i) => i);
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`\nhechas: ${ok} · ya existían: ${skipped} · fallidas: ${failed}`);
if (failedIds.length) console.log(`sin foto (url caída en origen): ${failedIds.join(', ')}`);
