// Phase 1: download every Cecofry + Olla GM recipe page once and keep the raw
// Next.js RSC payload plus the fields we can extract, so later phases never refetch.
// Usage: node fetch-raw.mjs            (resumable: skips recipes already cached)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const RAW = path.join(ROOT, 'raw');
const BASE = 'https://cecotec.es';
const CATEGORIES = ['cecofry', 'ollas-gm'];
const CONCURRENCY = 4;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

fs.mkdirSync(RAW, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } });
      if (res.ok) return await res.text();
      if (res.status === 404) throw Object.assign(new Error('404'), { fatal: true });
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (err.fatal || attempt >= 4) throw err;
      await sleep(800 * attempt * attempt);
    }
  }
}

function rscOf(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  let out = '';
  while ((m = re.exec(html))) out += JSON.parse(`"${m[1]}"`);
  return out;
}

/** Parses the balanced JSON value that starts at `start` (a `{` or `[`). */
function balancedAt(text, start) {
  let depth = 0;
  let inStr = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (ch === '\\') j++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, j + 1));
    }
  }
  return null;
}

function valueAfterKey(text, key) {
  const i = text.indexOf(`"${key}":`);
  if (i < 0) return null;
  const start = i + key.length + 3;
  return balancedAt(text, start);
}

/** RSC long strings are emitted as `id:T<hexByteLength>,<text>` rows and referenced as "$id". */
function resolveRef(rsc, value) {
  if (typeof value !== 'string' || !/^\$[0-9a-f]+$/.test(value)) return value;
  const id = value.slice(1);
  const m = new RegExp(`(?:^|\\n)${id}:T([0-9a-f]+),`).exec(rsc);
  if (m) {
    const buf = Buffer.from(rsc.slice(m.index + m[0].length), 'utf8');
    return buf.subarray(0, parseInt(m[1], 16)).toString('utf8');
  }
  const j = new RegExp(`(?:^|\\n)${id}:(".*)`).exec(rsc);
  return j ? JSON.parse(j[1]) : value;
}

function extract(rsc, slug) {
  // Template "object": the page ships the whole recipe record.
  const objStart = rsc.indexOf(`{"slug":"${slug}"`);
  if (objStart >= 0) {
    const obj = balancedAt(rsc, objStart);
    if (obj && ('post_description' in obj || 'checklist_group' in obj)) {
      return {
        template: 'object',
        title: obj.title,
        image: obj.preview_image ?? null,
        publishedAt: obj.published_date ?? null,
        category: obj.category?.slug ?? null,
        tags: (obj.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name ?? t.slug)).filter(Boolean),
        details: Object.fromEntries(
          (obj.highlighted_detail ?? []).flatMap((g) => g.details ?? []).map((d) => [d.name, d.description]),
        ),
        checklistGroups: obj.checklist_group ?? [],
        ingredientGroups: obj.ingredient_groups ?? [],
        stepsHtml: resolveRef(rsc, obj.post_description ?? ''),
        videoUrl: obj.video_url ?? null,
      };
    }
  }

  // Template "rendered": the page ships a component tree.
  const details = {};
  for (const m of rsc.matchAll(
    /uppercase tracking-wide","children":"([^"]+)"\}\],\["\$","span",null,\{"className":"text-xl","children":"([^"]*)"/g,
  )) {
    details[m[1]] = m[2];
  }
  const htmls = [...rsc.matchAll(/"dangerouslySetInnerHTML":\{"__html":("(?:[^"\\]|\\.)*")\}/g)].map((x) =>
    resolveRef(rsc, JSON.parse(x[1])),
  );
  const title = /"className":"text-6xl[^"]*","children":"((?:[^"\\]|\\.)*)"/.exec(rsc);
  const image = /"preview_image":"([^"]+)"/.exec(rsc);
  return {
    template: 'rendered',
    title: title ? JSON.parse(`"${title[1]}"`) : null,
    image: image ? image[1] : null,
    publishedAt: null,
    category: null,
    tags: [],
    details,
    checklistGroups: valueAfterKey(rsc, 'checklist_group') ?? [],
    ingredientGroups: valueAfterKey(rsc, 'ingredient_groups') ?? [],
    stepsHtml: htmls.join('\n'),
    videoUrl: null,
  };
}

async function listRecipes() {
  const seen = new Map();
  for (const category of CATEGORIES) {
    const html = await get(`${BASE}/recetas/${category}`);
    for (const m of html.matchAll(/\/recetas\/(cecofry|ollas-gm)\/([a-z0-9-]+)/g)) {
      const key = `${m[1]}/${m[2]}`;
      if (!seen.has(key)) seen.set(key, { listing: category, category: m[1], slug: m[2] });
    }
  }
  return [...seen.values()];
}

async function main() {
  const recipes = await listRecipes();
  console.log(`listing: ${recipes.length} recipe urls`);
  const queue = recipes.filter((r) => !fs.existsSync(path.join(RAW, `${r.category}__${r.slug}.json`)));
  console.log(`to fetch: ${queue.length} (cached: ${recipes.length - queue.length})`);

  let done = 0;
  const failures = [];
  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      const url = `${BASE}/recetas/${r.category}/${r.slug}`;
      try {
        const rsc = rscOf(await get(url));
        const data = extract(rsc, r.slug);
        const problems = [];
        if (!data.title) problems.push('no title');
        if (!data.checklistGroups.length) problems.push('no ingredients');
        if (!data.stepsHtml.trim()) problems.push('no steps');
        if (!data.image) problems.push('no image');
        fs.writeFileSync(path.join(RAW, `${r.category}__${r.slug}.rsc.txt`), rsc);
        fs.writeFileSync(
          path.join(RAW, `${r.category}__${r.slug}.json`),
          JSON.stringify({ url, ...r, ...data, problems }, null, 2),
        );
        if (problems.length) failures.push(`${r.slug}: ${problems.join(', ')}`);
      } catch (err) {
        failures.push(`${r.slug}: ${err.message}`);
      }
      done++;
      if (done % 50 === 0) console.log(`  ${done} fetched`);
      await sleep(150);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`done: ${done} fetched, ${failures.length} with problems`);
  if (failures.length) console.log(failures.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
