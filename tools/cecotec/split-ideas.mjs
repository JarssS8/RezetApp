#!/usr/bin/env node
// Splits out/cecotec-recipes.json into what the app actually serves:
//   app/public/ideas/index.json      — everything the grid + filters need, one fetch
//   app/public/ideas/<id>.json       — full detail, fetched only when a card is opened
// Run after normalize.mjs/merge.mjs. Re-run whenever the catalog changes.
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SOURCE = path.join(ROOT, 'cecotec-recipes.json');
const OUT_DIR = path.join(ROOT, '..', '..', 'app', 'public', 'ideas');

const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const index = data.recipes.map((r) => ({
  id: r.id,
  name: r.name,
  minutes: r.minutes,
  timeBucket: r.timeBucket,
  difficulty: r.difficulty,
  appliances: r.appliances,
  course: r.course,
  photoUrl: r.photoUrl,
}));
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));

for (const r of data.recipes) {
  fs.writeFileSync(path.join(OUT_DIR, `${r.id}.json`), JSON.stringify(r));
}

// The catalog ingredients (name/group/sensitive) an idea can reference — the grid/detail
// resolve pantry coverage by name against the household's own catalog, but need this to
// know which ideas ingredients are "sensitive" (salt, spices…) before that match exists.
fs.writeFileSync(path.join(OUT_DIR, 'ingredients.json'), JSON.stringify(data.ingredients));

const indexBytes = fs.statSync(path.join(OUT_DIR, 'index.json')).size;
console.log(`${index.length} ideas, ${data.ingredients.length} catalog ingredients`);
console.log(`index.json: ${(indexBytes / 1024).toFixed(0)} KB raw, ${(gzipSync(JSON.stringify(index)).length / 1024).toFixed(0)} KB gzip`);
console.log(`written to ${path.relative(process.cwd(), OUT_DIR)}/`);
