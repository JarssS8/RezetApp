#!/usr/bin/env node
// Mechanical facts for a push to main: push mode, commits, files per deploy target,
// flagged migration SQL and uncommitted changes. The deploying-to-main skill adds the judgment.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const REMOTE = 'origin';
const BRANCH = 'main';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
const tryGit = (...args) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

process.chdir(git('rev-parse', '--show-toplevel'));

// Same path rules as .github/workflows/deploy.yml.
const TARGETS = [
  { label: 'Base de datos (supabase db push)', match: (f) => f.startsWith('app/supabase/migrations/') },
  { label: 'Edge Functions de Supabase', match: (f) => f.startsWith('app/supabase/functions/') },
  { label: 'App web — Worker rezet (rezet.jarsss8.es)', match: (f) => f.startsWith('app/') && !f.startsWith('app/supabase/') },
  { label: 'Servidor MCP — Worker rezet-mcp (rezet-mcp.jarsss8.es)', match: (f) => f.startsWith('mcp/') || f.startsWith('app/src/domain/') },
];

const RISKY_SQL = [
  [/\bdrop\s+(table|schema|view|materialized\s+view|type|function|trigger|index)\b/i, 'DROP de objeto'],
  [/\bdrop\s+column\b/i, 'DROP COLUMN: borra los datos de esa columna'],
  [/\btruncate\b/i, 'TRUNCATE: vacía la tabla'],
  [/\bdelete\s+from\b/i, 'DELETE: borra filas'],
  [/^\s*update\s+[\w."]+\s+set\b/i, 'UPDATE de datos existentes'],
  [/\balter\s+column\b.*\btype\b/i, 'Cambio de tipo: puede truncar o fallar con datos existentes'],
  [/\bset\s+not\s+null\b/i, 'SET NOT NULL: falla si hay filas con NULL'],
  [/\badd\s+column\b(?!.*\bdefault\b).*\bnot\s+null\b/i, 'Columna NOT NULL sin DEFAULT: falla si la tabla tiene filas'],
  [/\brename\s+(column\b|to\b)/i, 'RENAME: rompe el código que use el nombre anterior'],
  [/\bon\s+delete\s+cascade\b/i, 'ON DELETE CASCADE: amplía lo que se borra en cascada'],
  [/\bdrop\s+constraint\b/i, 'DROP CONSTRAINT: quita una garantía de integridad'],
  [/\b(drop|alter|create)\s+policy\b|\b(enable|disable)\s+row\s+level\s+security\b/i, 'Cambia RLS: quién puede ver o tocar qué datos'],
  [/^\s*(grant|revoke)\b/i, 'Cambia permisos'],
];

const out = [];
const say = (line = '') => out.push(line);

tryGit('fetch', '--quiet', REMOTE, BRANCH);
tryGit('fetch', '--quiet', '--tags', REMOTE);
const head = git('rev-parse', 'HEAD');
const branch = tryGit('symbolic-ref', '--short', 'HEAD') ?? '(HEAD suelto)';
const remoteRef = `${REMOTE}/${BRANCH}`;
const remoteSha = tryGit('rev-parse', '--verify', '--quiet', remoteRef);
const base = remoteSha ? tryGit('merge-base', remoteRef, 'HEAD') : null;

let mode;
if (!remoteSha) mode = 'primer push (main no existe en GitHub)';
else if (remoteSha === head) mode = 'nada que subir (GitHub ya tiene este commit)';
else if (!base) mode = 'SOBRESCRIBIR: historias sin relación, requiere --force';
else if (base === remoteSha) mode = 'fast-forward (sin force)';
else mode = 'DIVERGENTE: GitHub tiene commits que no están en local, requiere --force';
const needsForce = mode.startsWith('SOBRESCRIBIR') || mode.startsWith('DIVERGENTE');

say(`# Datos para el informe de despliegue`);
say(`- Commit a subir: ${head.slice(0, 7)} "${git('log', '-1', '--format=%s')}" (rama local: ${branch})`);
say(`- Modo: ${mode}`);
say(`- Workflow de despliegue: ${existsSync('.github/workflows/deploy.yml') ? 'presente' : 'NO EXISTE: el push no desplegará nada'}`);

say('\n## Commits que se suben');
const range = base ? `${base}..HEAD` : 'HEAD';
const commits = git('log', '--format=%h %s', range).split('\n').filter(Boolean);
say(`${commits.length} commit(s)${commits.length > 20 ? ', últimos 20:' : ':'}`);
for (const c of commits.slice(0, 20)) say(`- ${c}`);

if (needsForce) {
  say('\n## Lo que se pierde en GitHub si se hace force push');
  const lost = git('log', '--format=%h %ad %s', '--date=short', base ? `HEAD..${remoteRef}` : remoteRef).split('\n').filter(Boolean);
  say(`${lost.length} commit(s) de ${remoteRef} dejarían de estar en main${lost.length > 10 ? ' (últimos 10):' : ':'}`);
  for (const c of lost.slice(0, 10)) say(`- ${c}`);
  say(`Respaldo antes del force push: git push ${REMOTE} ${remoteSha}:refs/heads/<rama-de-respaldo>`);
}

const files = remoteSha
  ? git('diff', '--name-status', remoteRef, 'HEAD').split('\n').filter(Boolean).map((l) => {
      const [status, ...rest] = l.split('\t');
      return { status: status[0], path: rest.at(-1) };
    })
  : git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').filter(Boolean).map((path) => ({ status: 'A', path }));

say('\n## Qué se despliega (mismas reglas que el workflow)');
let deploysSomething = false;
for (const target of TARGETS) {
  const hits = files.filter((f) => target.match(f.path));
  if (!hits.length) {
    say(`- ${target.label}: no se toca`);
    continue;
  }
  deploysSomething = true;
  say(`- ${target.label}: SE DESPLIEGA (${hits.length} archivo(s))`);
  for (const f of hits.slice(0, 12)) say(`  - ${f.status} ${f.path}`);
  if (hits.length > 12) say(`  - … y ${hits.length - 12} más`);
}
const other = files.filter((f) => !TARGETS.some((t) => t.match(f.path)));
say(`- Resto del repo (no se despliega): ${other.length} archivo(s)`);

say('\n## Versión');
const versionAt = (path) => {
  const raw = tryGit('show', `HEAD:${path}`);
  return raw ? JSON.parse(raw).version : null;
};
const appVersion = versionAt('app/package.json');
const mcpVersion = versionAt('mcp/package.json');
const releasedTags = (tryGit('tag', '-l', 'v*', '--sort=-v:refname') ?? '').split('\n').filter(Boolean);
const alreadyReleased = releasedTags.includes(`v${appVersion}`);
const hasNotes = (tryGit('show', 'HEAD:CHANGELOG.md') ?? '').split('\n').some((l) => l.startsWith(`## [${appVersion}]`));
say(`- Versión en el commit: ${appVersion} · última publicada: ${releasedTags[0] ?? 'ninguna'}`);
if (mcpVersion !== appVersion) say(`- AVISO: mcp/package.json dice ${mcpVersion}; debe coincidir con app/package.json`);
if (deploysSomething && alreadyReleased) {
  say(`- AVISO: se despliega código pero v${appVersion} ya está publicada. Falta subir versión (skill releasing-versions).`);
} else if (deploysSomething) {
  say(`- Al terminar el despliegue, CI publicará la Release v${appVersion}.`);
}
if (deploysSomething && !alreadyReleased && !hasNotes) say(`- AVISO: CHANGELOG.md no tiene sección para ${appVersion}; la Release fallará.`);

say('\n## Migraciones');
const migrations = files.filter((f) => f.path.startsWith('app/supabase/migrations/') && f.path.endsWith('.sql'));
if (!migrations.length) say('Ningún archivo de migración cambia en este push.');
for (const m of migrations) {
  const tag = { A: 'nueva', M: 'MODIFICADA (si ya estaba aplicada en producción no se reaplica)', D: 'BORRADA', R: 'renombrada' }[m.status] ?? m.status;
  say(`- ${m.path} — ${tag}`);
  if (m.status === 'D') continue;
  const lines = git('show', `HEAD:${m.path}`).split('\n');
  let inComment = false;
  lines.forEach((line, i) => {
    const code = line.replace(/--.*$/, '');
    if (inComment || /\/\*/.test(code)) inComment = !/\*\//.test(code);
    if (!code.trim() || inComment) return;
    for (const [re, why] of RISKY_SQL) if (re.test(code)) say(`  - línea ${i + 1}: ${why} → \`${line.trim().slice(0, 140)}\``);
  });
}
const localVersions = existsSync('app/supabase/migrations')
  ? git('ls-tree', '--name-only', 'HEAD', 'app/supabase/migrations/').split('\n').map((p) => p.split('/').pop().split('_')[0]).filter(Boolean)
  : [];
say(`Versiones de migración en el commit (${localVersions.length}): ${localVersions.join(', ')}`);
say('Compáralas con producción (mcp__supabase__list_migrations) antes de recomendar el despliegue.');

say('\n## Cambios sin commit (NO se suben)');
const dirty = git('status', '--porcelain').split('\n').filter(Boolean);
say(dirty.length ? dirty.map((d) => `- ${d}`).join('\n') : 'Ninguno.');

console.log(out.join('\n'));
