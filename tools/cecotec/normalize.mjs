// Phase 2: turn the cached raw pages into Rezet-shaped Spanish data.
// Usage: node normalize.mjs   → out/normalized.es.json + a quality report on stdout
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });

const ENTITIES = {
  nbsp: ' ', ntilde: 'ñ', Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', uuml: 'ü', Uuml: 'Ü', ordm: 'º', ordf: 'ª',
  deg: '°', iexcl: '¡', iquest: '¿', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', frac12: '½', frac14: '¼', frac34: '¾', middot: '·',
};

const decode = (s) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e] ?? m,
  );

const clean = (s) =>
  decode(String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ── Durations & temperatures ───────────────────────────────────────────────

function parseDuration(text) {
  const s = clean(text).toLowerCase();
  if (!s) return null;
  const h = /(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|h)\b/.exec(s);
  const m = /(\d+)\s*(?:minutos?|minutes?|mins?|m)\b/.exec(s);
  if (h || m) return Math.round((h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? parseInt(m[1], 10) : 0));
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

const DURATION_IN_TEXT =
  /(\d+(?:[.,]\d+)?)\s*(?:horas?|h)\b(?:\s*(?:y\s*)?(\d+)\s*(?:minutos?|min)\b)?|(\d+)\s*(?:minutos?|min)\b/i;

function stepTimer(text) {
  const m = DURATION_IN_TEXT.exec(text);
  if (!m) return undefined;
  if (m[3]) return parseInt(m[3], 10);
  return Math.round(parseFloat(m[1].replace(',', '.')) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
}

function stepTemperature(text) {
  const m = /(\d{2,3})\s*(?:º|°)\s*c?\b|(\d{2,3})\s*grados/i.exec(text);
  return m ? parseInt(m[1] ?? m[2], 10) : undefined;
}

// ── Detail fields ──────────────────────────────────────────────────────────

const detail = (r, re) => Object.entries(r.details).filter(([k]) => re.test(k)).map(([, v]) => clean(v));

function parseServings(r) {
  const [raw] = detail(r, /comensales|servings|unidades/i);
  if (!raw) return { baseServings: null, servingsMax: null, servingsUnit: null, servingsText: null };
  const nums = [...raw.matchAll(/\d+/g)].map((x) => parseInt(x[0], 10));
  const unitsKey = Object.keys(r.details).some((k) => /unidades/i.test(k));
  const isUnits = unitsKey || /\bu\b|un\.|uni|unid|uidades|\du\b/i.test(raw);
  return {
    baseServings: nums[0] ?? null,
    servingsMax: nums[1] ?? null,
    servingsUnit: isUnits ? 'unidades' : 'comensales',
    servingsText: raw,
  };
}

function parseMinutes(r) {
  const prep = detail(r, /^(tiempo|prep time)$/i).map(parseDuration).find((v) => v != null);
  const cooking = detail(r, /cooking time/i).map(parseDuration).find((v) => v != null);
  if (prep != null || cooking != null) return { minutes: (prep ?? 0) + (cooking ?? 0), minutesSource: 'cecotec' };
  return { minutes: null, minutesSource: null };
}

function parseDifficulty(r) {
  const [raw] = detail(r, /dificultad/i);
  const v = stripAccents((raw ?? '').toLowerCase());
  if (v.startsWith('facil')) return 'easy';
  if (v.startsWith('medi')) return 'medium';
  if (v.startsWith('dificil')) return 'hard';
  return null;
}

function parseAppliances(r) {
  const [robot] = detail(r, /r?obots?|rbot/i);
  const source = `${robot ?? ''} ${r.title} ${r.category ?? ''}`.toLowerCase();
  const out = [];
  if (/cecofry/.test(source)) out.push('cecofry');
  if (/\bollas?\b|olla-gm|ollas-gm/.test(source)) out.push('olla-gm');
  if (/mambo/.test(source)) out.push('mambo');
  return out.length ? out : [r.category === 'ollas-gm' ? 'olla-gm' : 'cecofry'];
}

const displayName = (title) =>
  clean(title)
    .replace(/\s+en\s+(?:la\s+|las\s+|el\s+|tu\s+|airfryer\s+)?(?:cecofry|ollas?|mambo)\b.*$/i, '')
    .trim();

// ── Ingredients ────────────────────────────────────────────────────────────

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const WORD_QTY = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, medio: 0.5, media: 0.5 };

/** Units that convert into the app's g/ml/tbsp. factor multiplies the quantity. */
const MEASURES = [
  [/^(?:g|gr|grs|gramos?)\.?$/, { unit: 'g', factor: 1 }],
  [/^(?:kg|kgs|kilos?|kilogramos?)\.?$/, { unit: 'g', factor: 1000 }],
  [/^(?:ml|mililitros?)\.?$/, { unit: 'ml', factor: 1 }],
  [/^(?:cl|centilitros?)\.?$/, { unit: 'ml', factor: 10 }],
  [/^(?:l|lt|litros?)\.?$/, { unit: 'ml', factor: 1000 }],
  [/^(?:cucharadas?|cdas?|cuchara|cucharas)\.?$/, { unit: 'tbsp', factor: 1 }],
  // 1 cucharadita = 5 ml = 1/3 de cucharada (15 ml).
  [/^(?:cucharaditas?|cdtas?|cucharillas?|cucharitas?)\.?$/, { unit: 'tbsp', factor: 1 / 3 }],
];
/** Amounts too vague to scale: kept as a note, quantity left empty. */
const VAGUE = /^(?:pizcas?|chorritos?|chorros?|puñados?|puñaditos?|gotas?|toques?)$/;
/** Countable portions: stay in the ingredient name, counted in `ud`. */
const PORTIONS =
  /^(?:dientes?|lonchas?|l[aá]minas?|placas?|c[aá]psulas?|hojas?|rebanadas?|latas?|sobres?|trozos?|rodajas?|ramitas?|ramas?|manojos?|bolsas?|paquetes?|botes?|tarros?|filetes?|lomos?|vasos?|tazas?|medidas?|bolas?|cubitos?|tiras?|pastillas?|bricks?|tabletas?|vainas?|tallos?|cabezas?|piezas?|porciones?|raciones?|yemas?|claras?)$/;
const UNIT_WORDS = /^(?:unidad(?:es)?|uds?\.?|u\.?)$/;

function singularWord(w) {
  if (w.length <= 3) return w;
  if (w.endsWith('ces')) return `${w.slice(0, -3)}z`;
  if (/[lnrdj]es$/.test(w)) return w.slice(0, -2);
  if (/[aeiou]s$/.test(w)) return w.slice(0, -1);
  return w;
}

const ingredientKey = (name) =>
  stripAccents(name.toLowerCase())
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singularWord)
    .join(' ');

function parseQuantity(s) {
  let m = /^(\d+)\s+(\d+)\/(\d+)\s*/.exec(s);
  if (m) return { value: +m[1] + +m[2] / +m[3], rest: s.slice(m[0].length) };
  m = /^(\d+)([½¼¾⅓⅔])\s*/.exec(s);
  if (m) return { value: +m[1] + FRACTIONS[m[2]], rest: s.slice(m[0].length) };
  m = /^([½¼¾⅓⅔])\s*/.exec(s);
  if (m) return { value: FRACTIONS[m[1]], rest: s.slice(m[0].length) };
  m = /^(\d+)\/(\d+)\s*/.exec(s);
  if (m) return { value: +m[1] / +m[2], rest: s.slice(m[0].length) };
  m = /^(\d+(?:[.,]\d+)?)(?:\s*(?:-|a)\s*(\d+(?:[.,]\d+)?))?\s*/.exec(s);
  if (m) return { value: parseFloat(m[1].replace(',', '.')), max: m[2] ? parseFloat(m[2].replace(',', '.')) : undefined, rest: s.slice(m[0].length) };
  m = /^(una?|uno|dos|tres|cuatro|cinco|seis|medio|media)\s+/i.exec(s);
  if (m) return { value: WORD_QTY[m[1].toLowerCase()], rest: s.slice(m[0].length), word: true };
  return null;
}

const round = (n) => Math.round(n * 100) / 100;

function parseIngredientLine(line) {
  const text = clean(line);
  const notes = [...text.matchAll(/\(([^)]*)\)/g)].map((x) => x[1].trim()).filter(Boolean);
  let s = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.:;,]+$/, '');
  const optional = /opcional/i.test(text);
  const guideLike = /\d+\s*(?:º|°)\s*c\b|descongelar/i.test(text);

  const q = parseQuantity(s);
  let quantity = null;
  let unit = null;
  let vague = null;
  if (q) {
    s = q.rest;
    const [first = '', ...others] = s.split(' ');
    const token = stripAccents(first.toLowerCase());
    const measure = MEASURES.find(([re]) => re.test(token));
    if (measure) {
      quantity = round(q.value * measure[1].factor);
      unit = measure[1].unit;
      // "1,2 l ml de agua": a second unit word is a typo, not part of the name.
      if (others.length && MEASURES.some(([re]) => re.test(stripAccents(others[0].toLowerCase())))) others.shift();
      s = others.join(' ');
    } else if (VAGUE.test(token)) {
      vague = first.toLowerCase();
      s = others.join(' ');
    } else if (UNIT_WORDS.test(token)) {
      quantity = round(q.value);
      unit = 'ud';
      s = others.join(' ');
    } else {
      quantity = round(q.value);
      unit = 'ud';
      if (PORTIONS.test(token)) {
        const singular = singularWord(first.toLowerCase());
        s = [singular, ...others].join(' ');
      }
    }
    if (q.max != null && quantity != null) notes.unshift(`${q.value}-${q.max}`);
  }
  s = s.replace(/^(?:de|del)\s+/i, '').trim();
  const name = capitalize(s);
  if (vague) notes.unshift(vague);
  return {
    name,
    key: ingredientKey(name),
    quantity,
    unit,
    toTaste: quantity == null,
    optional,
    note: notes.length ? notes.join('; ') : null,
    sourceText: text,
    guideLike,
  };
}

function normalizeGroup(group) {
  if (!group) return null;
  const g = clean(group)
    .replace(/[:.]+$/, '')
    .replace(/^ingredientes\s+/i, '')
    .toLowerCase();
  return capitalize(g);
}

// ── Steps ──────────────────────────────────────────────────────────────────

function parseSteps(html) {
  const blocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  const parts = blocks.length ? blocks : [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  return (parts.length ? parts : [html])
    .map(clean)
    .filter(Boolean)
    .map((text) => {
      const step = { text };
      const timer = stepTimer(text);
      const temp = stepTemperature(text);
      if (timer != null) step.timerMinutes = timer;
      if (temp != null) step.temperatureC = temp;
      return step;
    });
}

// ── Main ───────────────────────────────────────────────────────────────────

const raws = fs
  .readdirSync(RAW)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')));

const catalog = new Map();
const recipes = [];
const guides = [];
const report = {
  pages: raws.length, missingMinutes: [], minutesFromSteps: 0, missingServings: [], servingsOver24: [],
  difficultyEstimated: 0, toTasteLines: 0, vagueNotes: 0, emptyNames: [], duplicatesDropped: [],
};

for (const r of raws) {
  const steps = parseSteps(r.stepsHtml);
  const lines = r.checklistGroups.flatMap((g) =>
    g.items.map((item) => {
      // "Para el pollo: 4 contramuslos de pollo" carries its own group inline.
      const inline = /^(para\s+[^:]{2,40}):\s*(.+)$/i.exec(clean(item));
      return inline
        ? { group: normalizeGroup(inline[1]), item: inline[2] }
        : { group: normalizeGroup(g.group), item };
    }),
  );
  const parsed = lines.map(({ group, item }) => ({ group, ...parseIngredientLine(item) }));

  const guideLines = parsed.filter((p) => p.guideLike).length;
  const kind = guideLines >= 2 || (guideLines >= 1 && parsed.length <= 3) ? 'guide' : 'recipe';

  const { minutes: declared, minutesSource } = parseMinutes(r);
  let minutes = declared;
  let source = minutesSource;
  if (minutes == null) {
    const sum = steps.reduce((acc, st) => acc + (st.timerMinutes ?? 0), 0);
    if (sum > 0) {
      minutes = sum;
      source = 'steps';
      report.minutesFromSteps++;
    } else {
      report.missingMinutes.push(r.slug);
    }
  }

  const servings = parseServings(r);
  if (servings.baseServings == null) report.missingServings.push(r.slug);
  if (servings.baseServings > 24) report.servingsOver24.push(`${r.slug} (${servings.servingsText})`);

  let difficulty = parseDifficulty(r);
  let difficultySource = 'cecotec';
  if (!difficulty) {
    difficulty = steps.length <= 5 && (minutes ?? 0) <= 30 ? 'easy' : 'medium';
    difficultySource = 'estimated';
    report.difficultyEstimated++;
  }

  const ingredients = parsed.map((p) => {
    if (!p.name) report.emptyNames.push(`${r.slug}: ${p.sourceText}`);
    if (p.toTaste) report.toTasteLines++;
    return {
      ingredientId: p.key.replace(/\s+/g, '-'),
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      toTaste: p.toTaste,
      optional: p.optional,
      group: p.group,
      note: p.note,
      sourceText: p.sourceText,
    };
  });

  const entry = {
    id: r.slug,
    kind,
    sourceUrl: r.url,
    sourceTitle: clean(r.title),
    publishedAt: r.publishedAt,
    name: displayName(r.title),
    appliances: parseAppliances(r),
    ...servings,
    minutes,
    minutesSource: source,
    difficulty,
    difficultySource,
    kcalPerServing: null,
    photoUrl: r.image,
    ingredients,
    steps,
  };
  (kind === 'guide' ? guides : recipes).push(entry);
}

// Same dish published twice: keep the most recent copy.
const byContent = new Map();
for (const rec of recipes) {
  const sig = `${rec.name.toLowerCase()}|${rec.ingredients.map((i) => i.sourceText.toLowerCase()).sort().join('|')}`;
  const prev = byContent.get(sig);
  if (!prev) byContent.set(sig, rec);
  else {
    const keep = (rec.publishedAt ?? '') > (prev.publishedAt ?? '') ? rec : prev;
    const drop = keep === rec ? prev : rec;
    byContent.set(sig, keep);
    report.duplicatesDropped.push(`${drop.id} (dup of ${keep.id})`);
  }
}
const finalRecipes = [...byContent.values()].sort((a, b) => a.id.localeCompare(b.id));

// The catalog only covers what survives: no guide lines, no dropped duplicates.
for (const rec of finalRecipes) {
  for (const i of rec.ingredients) {
    if (!catalog.has(i.ingredientId)) catalog.set(i.ingredientId, { id: i.ingredientId, variants: new Map(), units: new Map(), uses: 0 });
    const c = catalog.get(i.ingredientId);
    c.uses++;
    c.variants.set(i.name, (c.variants.get(i.name) ?? 0) + 1);
    if (i.unit) c.units.set(i.unit, (c.units.get(i.unit) ?? 0) + 1);
  }
}

const ingredients = [...catalog.values()]
  .map((c) => {
    const variants = [...c.variants].sort((a, b) => b[1] - a[1]);
    const singular = variants.find(([v]) => ingredientKey(v) === stripAccents(v.toLowerCase()).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim());
    const units = [...c.units].sort((a, b) => b[1] - a[1]);
    return {
      id: c.id,
      nameEs: (singular ?? variants[0])[0],
      variants: variants.map(([v]) => v),
      defaultUnit: units[0]?.[0] ?? 'ud',
      uses: c.uses,
    };
  })
  .sort((a, b) => b.uses - a.uses);

fs.writeFileSync(
  path.join(OUT, 'normalized.es.json'),
  JSON.stringify({ recipes: finalRecipes, guides, ingredients }, null, 2),
);

const dist = (xs) => JSON.stringify([...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())]);
console.log('recipes', finalRecipes.length, 'guides', guides.length, 'catalog ingredients', ingredients.length);
console.log('appliances', dist(finalRecipes.map((r) => r.appliances.join('+'))));
console.log('difficulty', dist(finalRecipes.map((r) => `${r.difficulty}/${r.difficultySource}`)));
console.log(
  'time buckets',
  dist(finalRecipes.map((r) => (r.minutes == null ? 'none' : r.minutes <= 15 ? '≤15' : r.minutes <= 30 ? '≤30' : r.minutes <= 60 ? '≤60' : '>60'))),
);
console.log('servings unit', dist(finalRecipes.map((r) => r.servingsUnit)));
console.log('units', dist(finalRecipes.flatMap((r) => r.ingredients.map((i) => i.unit ?? 'al gusto'))));
console.log('steps per recipe (min/avg/max)', Math.min(...finalRecipes.map((r) => r.steps.length)), (finalRecipes.reduce((a, r) => a + r.steps.length, 0) / finalRecipes.length).toFixed(1), Math.max(...finalRecipes.map((r) => r.steps.length)));
console.log('report', JSON.stringify({ ...report, missingMinutes: report.missingMinutes.length, missingServings: report.missingServings.length }, null, 1));
console.log('missing minutes sample', report.missingMinutes.slice(0, 10).join(', '));
console.log('guides', guides.map((g) => g.id).join(', '));
