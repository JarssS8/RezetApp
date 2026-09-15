// Phase 3a: split the Spanish data into translation batches.
// Usage: node make-batches.mjs [onlyIds.json]   → out/batches/*.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'out');
const BATCHES = path.join(OUT, 'batches');
const RECIPES_PER_BATCH = 75;
const INGREDIENTS_PER_BATCH = 450;

const data = JSON.parse(fs.readFileSync(path.join(OUT, 'normalized.es.json'), 'utf8'));
fs.rmSync(BATCHES, { recursive: true, force: true });
fs.mkdirSync(BATCHES, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');

const recipes = data.recipes.map((r) => ({
  id: r.id,
  name: r.name,
  appliances: r.appliances,
  ingredients: r.ingredients.map((i) => i.sourceText),
  steps: r.steps.map((s) => s.text),
  groups: [...new Set(r.ingredients.map((i) => i.group).filter(Boolean))],
  notes: [...new Set(r.ingredients.map((i) => i.note).filter(Boolean))],
}));
let n = 0;
for (let i = 0; i < recipes.length; i += RECIPES_PER_BATCH) {
  n++;
  fs.writeFileSync(
    path.join(BATCHES, `recipes-${pad(n)}.json`),
    JSON.stringify({ batch: `recipes-${pad(n)}`, recipes: recipes.slice(i, i + RECIPES_PER_BATCH) }, null, 2),
  );
}

const ingredients = data.ingredients.map((c) => ({ id: c.id, nameEs: c.nameEs, variants: c.variants.slice(0, 4), defaultUnit: c.defaultUnit }));
let m = 0;
for (let i = 0; i < ingredients.length; i += INGREDIENTS_PER_BATCH) {
  m++;
  fs.writeFileSync(
    path.join(BATCHES, `ingredients-${pad(m)}.json`),
    JSON.stringify({ batch: `ingredients-${pad(m)}`, ingredients: ingredients.slice(i, i + INGREDIENTS_PER_BATCH) }, null, 2),
  );
}

console.log(`recipe batches: ${n} (${recipes.length} recipes, ${recipes.reduce((a, r) => a + r.steps.length, 0)} steps)`);
console.log(`ingredient batches: ${m} (${ingredients.length} ingredients)`);
