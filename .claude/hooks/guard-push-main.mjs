#!/usr/bin/env node
// PreToolUse guard. Claude may not push to `main`, nor record a deploy confirmation itself:
// only the user, by running `! node .claude/skills/deploying-to-main/confirm.mjs`, can
// authorize one push of one exact commit (see the deploying-to-main skill).
//
// Fails closed: any error (unreadable input, a git call that throws…) blocks. Exit code 1 would
// be a non-blocking hook error, which is exactly how the security audit (run-3) slipped a push
// through with `-C <not-a-repo> --git-dir=…`. It also normalizes the command the way the shell
// would (backslash escapes, quotes) before looking at it, resolves where an implicit `git push`
// really goes from the git config, and refuses constructs it cannot follow (command
// substitution, `bash -c`, variables, config overrides) whenever a push is involved.
// Tests: `node --test .claude/hooks/guard-push-main.test.mjs`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const PROTECTED = 'main';
const MARKER = 'deploy-confirmation.json';
const MAX_AGE_MS = 30 * 60 * 1000;
const HOW_TO_CONFIRM =
  'Usa la skill deploying-to-main: genera el informe de despliegue, enséñaselo al usuario y pídele que confirme escribiendo: ! node .claude/skills/deploying-to-main/confirm.mjs (añade --force si hay que sobrescribir main).';

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

process.on('uncaughtException', (e) => block(`guard-push-main: error inesperado, se bloquea por seguridad (${e?.message ?? e}).`));
process.on('unhandledRejection', (e) => block(`guard-push-main: error inesperado, se bloquea por seguridad (${e?.message ?? e}).`));

const raw = await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', (chunk) => (data += chunk));
  process.stdin.on('end', () => resolve(data));
});
const input = JSON.parse(raw || '{}');
const cwd = input.cwd || process.cwd();

function git(args, dir) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}
/** Like `git`, but a missing value (non-zero exit) is `''` instead of an error. */
function gitValue(args, dir) {
  try {
    return git(args, dir);
  } catch {
    return '';
  }
}

const CONFIRM_SCRIPT = 'deploying-to-main/confirm.mjs';
const ONLY_USER = `La confirmación de un despliegue a main solo la puede dar el usuario. ${HOW_TO_CONFIRM}`;
const UNVERIFIABLE = `Forma de push que el guard no puede verificar (sustitución de comandos, bash -c, variables, alias o config de git en línea): usa un \`git push <remoto> <rama>\` explícito. ${HOW_TO_CONFIRM}`;

if (input.tool_name !== 'Bash') {
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '';
  if (target.endsWith(MARKER) || target.endsWith(CONFIRM_SCRIPT)) block(ONLY_USER);
  process.exit(0);
}

const command = input.tool_input?.command ?? '';
// What the shell would actually see: `ma\in` is `main`, `deploy-confirmatio''n.json` is the marker.
const unescaped = command.replace(/\\(.)/gs, '$1');
const unquoted = unescaped.replace(/["']/g, '');
const segments = unescaped.split(/&&|\|\||;|\||\n/);

// Reading or listing these files is fine; running the confirmation or writing its marker is not.
const INTERPRETERS = new Set(['node', 'bun', 'deno', 'sh', 'bash', 'zsh', 'tsx', 'npx']);
const WRITERS = new Set(['tee', 'cp', 'mv', 'touch', 'install', 'dd', 'ln', 'node', 'bun', 'deno', 'python', 'python3', 'perl', 'ruby']);
const baseName = (token) => token.split('/').pop();
for (const segment of segments) {
  const tokens = tokenize(segment);
  const plain = segment.replace(/["']/g, '');
  const runsConfirm = tokens.some(
    (t, i) => t.endsWith(CONFIRM_SCRIPT) && (i === 0 || INTERPRETERS.has(baseName(tokens[i - 1]))),
  );
  const writesMarker =
    plain.includes(MARKER) && (plain.includes('>') || tokens.some((t) => WRITERS.has(baseName(t)) || t === '-i'));
  if (runsConfirm || writesMarker) block(ONLY_USER);
}

// GitHub-side updates of main never go through `git push`.
if (/\bgh\s+pr\s+merge\b/.test(unquoted)) block(`Fusionar un PR en GitHub actualiza main: requiere la confirmación del usuario. ${HOW_TO_CONFIRM}`);
if (/\bgh\s+api\b/.test(unquoted) && /(refs\/)?heads\/main\b|\/merges\b|\/pulls\/\d+\/merge\b/.test(unquoted)) {
  block(`Actualizar main por la API de GitHub requiere la confirmación del usuario. ${HOW_TO_CONFIRM}`);
}

const mentionsPush = /\bpush\b/.test(unquoted);
const hasGit = /(^|[\s/;&|(`$])git(\s|$)/.test(unquoted);
if (!mentionsPush && !hasGit) process.exit(0);

if (mentionsPush) {
  if (/\$\(|`|<\(|\$\{?[A-Za-z_]/.test(unescaped)) block(UNVERIFIABLE);
  if (/\b(ba|z|da|k)?sh\s+-c\b|\beval\b|\bxargs\b|\bsource\b/.test(unquoted)) block(UNVERIFIABLE);
  if (/(^|\s)-c\s*(alias|push|remote|branch|url|include|core\.hookspath)\b/i.test(unquoted)) block(UNVERIFIABLE);
  if (/--git-dir|--work-tree|\bGIT_DIR=|\bGIT_WORK_TREE=|\bGIT_CONFIG/.test(unquoted)) block(UNVERIFIABLE);
  if (/\bgit\s+(-\S+\s+)*config\b/.test(unquoted)) block(UNVERIFIABLE);
}

function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  let started = false;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current || started) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += ch;
  }
  if (current || started) tokens.push(current);
  return tokens;
}

/** `refs/heads/main`, `heads/main` and `main` are the same branch to git. */
const branchName = (ref) => ref.replace(/^\+/, '').replace(/^(refs\/)?heads\//, '');

/** Where a `git push` with no refspec really sends HEAD, according to the git config. */
function implicitDests(dir, remoteArg, branch) {
  const remote =
    remoteArg ||
    gitValue(['config', '--get', `branch.${branch}.pushRemote`], dir) ||
    gitValue(['config', '--get', 'remote.pushDefault'], dir) ||
    gitValue(['config', '--get', `branch.${branch}.remote`], dir) ||
    'origin';
  const configured = gitValue(['config', '--get-all', `remote.${remote}.push`], dir)
    .split('\n')
    .filter(Boolean);
  if (configured.length > 0) {
    return configured.map((spec) => {
      const plain = spec.replace(/^\+/, '');
      const dest = plain.includes(':') ? plain.split(':')[1] || plain.split(':')[0] : plain;
      return branchName(dest === 'HEAD' ? branch : dest);
    });
  }
  // push.default (simple/current/upstream…) and pushRemote are what @{push} resolves.
  const upstream = gitValue(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{push}'], dir);
  if (upstream) return [branchName(upstream.replace(/^[^/]+\//, ''))];
  return [branch];
}

// Every ref update a `git push` segment would make, as { dest, src } (src null = deletion).
function pushTargets(tokens) {
  const gitAt = tokens.findIndex((t) => t === 'git' || t.endsWith('/git'));
  if (gitAt < 0) return null;
  let dir = cwd;
  let i = gitAt + 1;
  for (; i < tokens.length && tokens[i].startsWith('-'); i++) {
    if (tokens[i] === '-C') {
      const next = tokens[++i];
      dir = isAbsolute(next) ? next : join(dir, next);
    } else if (tokens[i] === '-c') i++;
  }
  const sub = tokens[i];
  if (sub === undefined) return null;
  if (sub !== 'push') {
    // A persistent alias (`alias.p = push`) pushes without the word "push" in the command.
    const alias = gitValue(['config', '--get', `alias.${sub}`], dir);
    if (/\bpush\b/.test(alias) || alias.startsWith('!')) block(UNVERIFIABLE);
    return null;
  }

  const options = [];
  const positional = [];
  for (let j = i + 1; j < tokens.length; j++) {
    const arg = tokens[j];
    if (arg === '--') {
      positional.push(...tokens.slice(j + 1));
      break;
    }
    if (arg.startsWith('-')) {
      options.push(arg.split('=')[0]);
      if (['-o', '--push-option', '--repo', '--receive-pack', '--exec'].includes(arg)) j++;
      continue;
    }
    positional.push(arg);
  }

  let branch = 'HEAD';
  try {
    branch = git(['symbolic-ref', '--short', 'HEAD'], dir);
  } catch {}

  const refspecs = positional.slice(1);
  const force =
    options.some((o) => ['-f', '--force', '--force-with-lease', '--force-if-includes'].includes(o)) ||
    refspecs.some((r) => r.startsWith('+'));
  const deleting = options.includes('-d') || options.includes('--delete');
  const targets = [];

  if (options.includes('--all') || options.includes('--mirror') || options.includes('--branches')) {
    targets.push({ dest: PROTECTED, src: options.includes('--mirror') ? null : PROTECTED });
  }
  if (refspecs.length === 0 && !options.includes('--tags') && targets.length === 0) {
    for (const dest of implicitDests(dir, positional[0], branch)) targets.push({ dest, src: 'HEAD' });
  }
  for (const spec of refspecs) {
    const plain = spec.replace(/^\+/, '');
    let src;
    let dest;
    if (deleting) [src, dest] = [null, plain];
    else if (plain.includes(':')) {
      [src, dest] = plain.split(/:(.*)/s);
      if (!dest) dest = src;
      if (!src) src = null;
    } else [src, dest] = [plain, plain];
    dest = branchName(dest);
    if (dest === 'HEAD') dest = branch;
    targets.push({ dest, src });
  }
  return { dir, force, targets };
}

for (const segment of segments) {
  const parsed = pushTargets(tokenize(segment));
  if (!parsed) continue;
  const hits = parsed.targets.filter((t) => t.dest === PROTECTED);
  if (hits.length === 0) continue;

  if (hits.some((t) => t.src === null)) block('Borrar o reemplazar main entero (--delete/--mirror) no está permitido desde Claude.');

  const gitDir = git(['rev-parse', '--git-dir'], parsed.dir);
  const markerPath = isAbsolute(gitDir) ? join(gitDir, MARKER) : join(parsed.dir, gitDir, MARKER);
  if (!existsSync(markerPath)) block(`Push a main bloqueado: no hay confirmación del usuario. ${HOW_TO_CONFIRM}`);

  const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (Date.now() - marker.confirmedAt > MAX_AGE_MS) {
    rmSync(markerPath);
    block(`Push a main bloqueado: la confirmación ha caducado (más de 30 minutos). ${HOW_TO_CONFIRM}`);
  }
  for (const hit of hits) {
    const sha = git(['rev-parse', hit.src], parsed.dir);
    if (sha !== marker.sha) {
      block(
        `Push a main bloqueado: el usuario confirmó ${marker.sha.slice(0, 7)} pero este push sube ${sha.slice(0, 7)}. Vuelve a generar el informe para el commit actual. ${HOW_TO_CONFIRM}`,
      );
    }
  }
  if (parsed.force && !marker.force) {
    block(`Push a main bloqueado: es un force push y el usuario no confirmó con --force. ${HOW_TO_CONFIRM}`);
  }
  rmSync(markerPath);
}

process.exit(0);
