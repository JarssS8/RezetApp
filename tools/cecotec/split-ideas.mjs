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
const PHOTOS_DIR = path.join(OUT_DIR, 'photos');

const data = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

// make-thumbs.mjs ya bajó y redujo las fotos a app/public/ideas/photos/<id>.jpg
// (los originales de Cecotec llegan a pesar 13 MB — con eso la rejilla tardaba
// hasta un minuto en móvil). Si falta el archivo (url caída en origen, o no se
// ha corrido make-thumbs.mjs todavía), la idea se sirve sin foto: la rejilla y
// el detalle ya saben pintar un marcador en ese caso.
const localPhotos = new Set(
  fs.existsSync(PHOTOS_DIR) ? fs.readdirSync(PHOTOS_DIR).map((f) => f.replace(/\.jpg$/, '')) : [],
);
const photoUrlFor = (id) => (localPhotos.has(id) ? `/ideas/photos/${id}.jpg` : null);

// Solo se limpian los JSON de nivel superior — photos/ la llena make-thumbs.mjs
// aparte (bajar 722 fotos de nuevo en cada split sería absurdo) y no se toca aquí.
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const entry of fs.readdirSync(OUT_DIR)) {
  if (entry.endsWith('.json')) fs.rmSync(path.join(OUT_DIR, entry));
}

const index = data.recipes.map((r) => ({
  id: r.id,
  name: r.name,
  minutes: r.minutes,
  timeBucket: r.timeBucket,
  difficulty: r.difficulty,
  appliances: r.appliances,
  course: r.course,
  photoUrl: photoUrlFor(r.id),
}));
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));

for (const r of data.recipes) {
  fs.writeFileSync(path.join(OUT_DIR, `${r.id}.json`), JSON.stringify({ ...r, photoUrl: photoUrlFor(r.id) }));
}

// The catalog ingredients (name/group/sensitive) an idea can reference — the grid/detail
// resolve pantry coverage by name against the household's own catalog, but need this to
// know which ideas ingredients are "sensitive" (salt, spices…) before that match exists.
fs.writeFileSync(path.join(OUT_DIR, 'ingredients.json'), JSON.stringify(data.ingredients));

const indexBytes = fs.statSync(path.join(OUT_DIR, 'index.json')).size;
console.log(`${index.length} ideas, ${data.ingredients.length} catalog ingredients`);
console.log(`index.json: ${(indexBytes / 1024).toFixed(0)} KB raw, ${(gzipSync(JSON.stringify(index)).length / 1024).toFixed(0)} KB gzip`);
console.log(`written to ${path.relative(process.cwd(), OUT_DIR)}/`);
