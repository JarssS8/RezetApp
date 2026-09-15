// Phase 3b: merge Spanish data + English translations into the final bilingual file.
// Usage: node merge.mjs   → out/cecotec-recipes.json, or a list of what is missing/invalid.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'out');
const EN = path.join(OUT, 'en');

const COURSES = {
  breakfast: { es: 'Desayuno', en: 'Breakfast' },
  starter: { es: 'Entrante', en: 'Starter' },
  main: { es: 'Principal', en: 'Main course' },
  side: { es: 'Guarnición', en: 'Side dish' },
  dessert: { es: 'Postre', en: 'Dessert' },
  snack: { es: 'Merienda', en: 'Snack' },
  bread: { es: 'Panes y masas', en: 'Breads and doughs' },
  sauce: { es: 'Salsas', en: 'Sauces' },
  drink: { es: 'Bebida', en: 'Drink' },
};
const FOOD_GROUPS = new Set(['fresco', 'seco', 'conserva']);

// Device menus must read as the appliance screen shows them (Spanish), even in English text.
const DEVICE_MENUS = {
  griddle: ['plancha'],
  'sauté': ['sofreír', 'saltear'],
  saute: ['sofreír', 'saltear'],
  'slow cook': ['fuego lento', 'cocción lenta'],
  dessert: ['postre'],
  pressure: ['presión'],
  fry: ['freír', 'freir'],
  bake: ['horno', 'hornear'],
  stew: ['guiso'],
  'keep warm': ['mantener caliente', 'recalentar'],
  steam: ['vapor'],
  rice: ['arroz'],
  fish: ['pescado'],
  ferment: ['fermentar'],
  reheat: ['recalentar'],
  chips: ['patatas fritas'],
};
let menuFixes = 0;
function restoreMenuNames(en, es) {
  return en.replace(/"([^"]+)"/g, (whole, term) => {
    const hit = DEVICE_MENUS[term.toLowerCase()]?.find((c) => es.toLowerCase().includes(c));
    if (!hit) return whole;
    menuFixes++;
    return `"${hit}"`;
  });
}

// Spanish pairs that translate to the same English name but are different products.
const NOT_SAME = new Set(['gambones|langostinos']);

const data = JSON.parse(fs.readFileSync(path.join(OUT, 'normalized.es.json'), 'utf8'));
const files = fs.existsSync(EN) ? fs.readdirSync(EN).filter((f) => f.endsWith('.json')) : [];

const enRecipes = new Map();
const enIngredients = new Map();
const problems = [];
for (const f of files) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(path.join(EN, f), 'utf8'));
  } catch (err) {
    problems.push(`${f}: invalid JSON (${err.message})`);
    continue;
  }
  for (const r of json.recipes ?? []) enRecipes.set(r.id, r);
  for (const i of json.ingredients ?? []) enIngredients.set(i.id, i);
}

const missingRecipes = [];
const recipes = data.recipes.map((r) => {
  const en = enRecipes.get(r.id);
  const valid =
    en &&
    typeof en.name === 'string' && en.name.trim() &&
    Array.isArray(en.steps) && en.steps.length === r.steps.length && en.steps.every((s) => typeof s === 'string' && s.trim()) &&
    COURSES[en.course] &&
    r.ingredients.every((i) => (!i.group || en.groups?.[i.group]) && (!i.note || en.notes?.[i.note]));
  if (!valid) {
    missingRecipes.push(r.id);
    return null;
  }
  const minutes = r.minutes;
  return {
    id: `cecotec-${r.id}`,
    sourceUrl: r.sourceUrl,
    publishedAt: r.publishedAt,
    name: { es: r.name, en: en.name.trim() },
    description: { es: '', en: '' },
    appliances: r.appliances,
    course: en.course,
    tags: [...r.appliances, en.course],
    baseServings: r.baseServings,
    servingsMax: r.servingsMax,
    servingsUnit: r.servingsUnit,
    servingsText: r.servingsText,
    minutes,
    minutesSource: r.minutesSource,
    timeBucket: minutes == null ? null : minutes <= 15 ? 'le15' : minutes <= 30 ? 'le30' : minutes <= 60 ? 'le60' : 'gt60',
    difficulty: r.difficulty,
    difficultySource: r.difficultySource,
    kcalPerServing: null,
    photoUrl: r.photoUrl,
    cookedCount: 0,
    ingredients: r.ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      quantity: i.quantity,
      unit: i.unit,
      toTaste: i.toTaste,
      optional: i.optional,
      group: i.group ? { es: i.group, en: en.groups[i.group] } : null,
      note: i.note ? { es: i.note, en: en.notes[i.note] } : null,
      sourceText: i.sourceText,
    })),
    steps: r.steps.map((s, idx) => ({
      text: { es: s.text, en: restoreMenuNames(en.steps[idx].trim(), s.text) },
      ...(s.timerMinutes != null ? { timerMinutes: s.timerMinutes } : {}),
      ...(s.temperatureC != null ? { temperatureC: s.temperatureC } : {}),
    })),
  };
});

const missingIngredients = [];
const ingredients = data.ingredients.map((c) => {
  const en = enIngredients.get(c.id);
  if (!en || typeof en.nameEn !== 'string' || !en.nameEn.trim() || !FOOD_GROUPS.has(en.group) || typeof en.sensitive !== 'boolean') {
    missingIngredients.push(c.id);
    return null;
  }
  return { id: c.id, name: { es: c.nameEs, en: en.nameEn.trim() }, group: en.group, defaultUnit: c.defaultUnit, sensitive: en.sensitive };
});

if (problems.length || missingRecipes.length || missingIngredients.length) {
  console.log(problems.join('\n'));
  console.log(`missing/invalid recipes: ${missingRecipes.length}`);
  console.log(`missing/invalid ingredients: ${missingIngredients.length}`);
  fs.writeFileSync(path.join(OUT, 'missing.json'), JSON.stringify({ recipes: missingRecipes, ingredients: missingIngredients }, null, 2));
  process.exit(1);
}

// One product under several Spanish spellings ("Pimienta"/"Pimenta", "Jamón de york"/"Jamón york"):
// merge when English name, food group and sensitivity all agree; the most used id wins.
const uses = new Map();
for (const r of recipes) for (const i of r.ingredients) uses.set(i.ingredientId, (uses.get(i.ingredientId) ?? 0) + 1);
const clusters = new Map();
for (const ing of ingredients) {
  const key = `${ing.name.en.toLowerCase().trim()}|${ing.group}|${ing.sensitive}`;
  if (!clusters.has(key)) clusters.set(key, []);
  clusters.get(key).push(ing);
}
const canonical = new Map();
for (const members of clusters.values()) {
  members.sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0));
  for (const m of members.slice(1)) {
    const pair = [members[0].name.es.toLowerCase(), m.name.es.toLowerCase()].sort().join('|');
    if (!NOT_SAME.has(pair)) canonical.set(m.id, members[0].id);
  }
}
for (const r of recipes) for (const i of r.ingredients) i.ingredientId = canonical.get(i.ingredientId) ?? i.ingredientId;
const catalog = ingredients.filter((i) => !canonical.has(i.id));

const final = {
  meta: {
    source: 'https://cecotec.es/recetas (Cecofry + Olla GM)',
    scrapedAt: new Date().toISOString(),
    recipeCount: recipes.length,
    ingredientCount: catalog.length,
    courses: COURSES,
    notes: [
      'Units: g, ml, ud, tbsp. 1 cucharadita = 1/3 tbsp; kg/l converted to g/ml.',
      'quantity/unit null + toTaste true = the source gives no amount ("Sal", "una pizca").',
      'kcalPerServing is always null: Cecotec does not publish calories.',
      'difficultySource "estimated" = Cecotec gives no difficulty; derived from step count and time.',
      'minutesSource "steps" = no declared time; sum of step timers.',
      'Appliance settings (temperature, program, pressure) stay inside step text; temperatureC is extracted when present.',
      'Device menu names (plancha, presión, turbo…) stay in Spanish, in quotes, in the English text: it is what the appliance screen shows.',
      'English text is a translation of the Spanish source.',
    ],
    excluded: [...data.guides.map((g) => ({ id: g.id, reason: 'guide, not a recipe', url: g.sourceUrl }))],
  },
  ingredients: catalog,
  recipes,
};
fs.writeFileSync(path.join(OUT, 'cecotec-recipes.json'), JSON.stringify(final, null, 2));
console.log(`ok: ${recipes.length} recipes, ${catalog.length} ingredients (${canonical.size} spelling duplicates merged), ${menuFixes} device menu names restored → out/cecotec-recipes.json`);
