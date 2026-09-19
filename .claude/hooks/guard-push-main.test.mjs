// Tests del guard de push a main: `node --test .claude/hooks/guard-push-main.test.mjs`.
// Cada caso crea un repo desechable con un remoto bare local y le pasa al hook
// el mismo JSON que le pasaría Claude Code. Nada toca el repo real ni la red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = new URL('./guard-push-main.mjs', import.meta.url).pathname;
const MAIN = 'ma' + 'in'; // sin el literal en los comandos de esta suite de cara al propio hook

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'guard-'));
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  const g = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', MAIN, remote]);
  execFileSync('git', ['init', '-q', '-b', MAIN, repo]);
  g(['config', 'user.email', 't@t']);
  g(['config', 'user.name', 't']);
  g(['commit', '-q', '--allow-empty', '-m', 'base']);
  g(['remote', 'add', 'origin', remote]);
  g(['push', '-q', 'origin', MAIN]);
  g(['switch', '-q', '-c', 'feature', '--track', `origin/${MAIN}`]);
  g(['commit', '-q', '--allow-empty', '-m', 'unconfirmed']);
  return { root, repo, g };
}

function run(cwd, command, tool = 'Bash') {
  const input = tool === 'Bash' ? { tool_name: 'Bash', tool_input: { command }, cwd } : { tool_name: tool, tool_input: { file_path: command }, cwd };
  return spawnSync('node', [HOOK], { input: JSON.stringify(input), encoding: 'utf8' }).status;
}

const blocked = [
  // Formas canónicas (ya se bloqueaban).
  `git push origin HEAD:${MAIN}`,
  `git push origin HEAD:refs/heads/${MAIN}`,
  // Auditoría run-3 (repo-tooling:.claude/hooks/guard-push-main:denylist-parser-does-not-bind-main-ref-updates).
  `git push origin HEAD:heads/${MAIN}`,
  `git push origin HEAD:ma\\in`,
  `echo $(git push origin HEAD:${MAIN})`,
  `bash -c 'git push origin HEAD:${MAIN}'`,
  `B=${MAIN}; git push origin HEAD:$B`,
  `git -c push.default=upstream push`,
  `git -c remote.origin.push=HEAD:refs/heads/${MAIN} push origin`,
  `git -c alias.p=push p origin HEAD:${MAIN}`,
  `git -C /nonexistent-dir --git-dir=REPO/.git push origin HEAD:${MAIN}`,
  `gh pr merge 12 --merge --admin`,
  `gh api -X PATCH repos/o/r/git/refs/heads/${MAIN} -f sha=0000000`,
  `printf '{}' > .git/deploy-confirmatio''n.json`,
];

for (const command of blocked) {
  test(`bloquea: ${command}`, () => {
    const { repo } = fixture();
    assert.equal(run(repo, command.replace('REPO', repo)), 2);
  });
}

test('bloquea un push implícito cuando la config persistente lo manda a main', () => {
  const { repo, g } = fixture();
  g(['config', 'remote.origin.push', `HEAD:refs/heads/${MAIN}`]);
  assert.equal(run(repo, 'git push origin'), 2);
});

test('bloquea un push implícito con push.default=upstream en la config', () => {
  const { repo, g } = fixture();
  g(['config', 'push.default', 'upstream']);
  assert.equal(run(repo, 'git push'), 2);
});

test('bloquea un alias persistente que empuja', () => {
  const { repo, g } = fixture();
  g(['config', 'alias.p', 'push']);
  assert.equal(run(repo, `git p origin HEAD:${MAIN}`), 2);
});

test('bloquea escribir el marcador con Write', () => {
  const { repo } = fixture();
  assert.equal(run(repo, join(repo, '.git', 'deploy-confirmation.json'), 'Write'), 2);
});

test('deja pasar comandos sin push y pushes a otras ramas', () => {
  const { repo } = fixture();
  assert.equal(run(repo, 'git status'), 0);
  assert.equal(run(repo, 'git push origin feature'), 0);
  assert.equal(run(repo, 'git push -u origin HEAD:feature'), 0);
  assert.equal(run(repo, 'npm test'), 0);
});

test('con confirmación válida deja pasar el push canónico una sola vez', () => {
  const { repo, g } = fixture();
  g(['switch', '-q', MAIN]);
  g(['merge', '-q', '--ff-only', 'feature']);
  const marker = join(repo, '.git', 'deploy-confirmation.json');
  writeFileSync(marker, JSON.stringify({ sha: g(['rev-parse', 'HEAD']), force: false, confirmedAt: Date.now() }));
  assert.equal(run(repo, `git push origin ${MAIN}`), 0);
  assert.equal(existsSync(marker), false);
  assert.equal(run(repo, `git push origin ${MAIN}`), 2);
});

test('falla cerrado con una entrada ilegible', () => {
  const status = spawnSync('node', [HOOK], { input: '{no es json', encoding: 'utf8' }).status;
  assert.equal(status, 2);
});
