#!/usr/bin/env node
// Run BY THE USER (`! node .claude/skills/deploying-to-main/confirm.mjs [--force]`) after reading
// the deploy report. Authorizes one push of the current HEAD to main within 30 minutes.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const force = process.argv.includes('--force');
const sha = git('rev-parse', 'HEAD');
const subject = git('log', '-1', '--format=%s');
const marker = join(git('rev-parse', '--absolute-git-dir'), 'deploy-confirmation.json');

writeFileSync(marker, JSON.stringify({ sha, force, confirmedAt: Date.now() }, null, 2));

console.log(`Confirmado: subir ${sha.slice(0, 7)} ("${subject}") a main${force ? ' con force push' : ''}.`);
console.log('Vale para un solo push y durante 30 minutos.');
if (git('status', '--porcelain')) console.log('Aviso: hay cambios sin commit; no se subirán.');
