#!/usr/bin/env node
// Usage: node tools/release/bump-version.mjs <major|minor|patch>
// Moves app/ and mcp/ (package.json + package-lock.json) to one new version and prints it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextVersion, setLockfileVersion, setManifestVersion } from './version.mjs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const file = (path) => join(root, path);

const current = JSON.parse(readFileSync(file('app/package.json'), 'utf8')).version;
const version = nextVersion(current, process.argv[2]);

for (const pkg of ['app', 'mcp']) {
  const manifest = file(`${pkg}/package.json`);
  writeFileSync(manifest, setManifestVersion(readFileSync(manifest, 'utf8'), version));
  const lock = file(`${pkg}/package-lock.json`);
  writeFileSync(lock, setLockfileVersion(readFileSync(lock, 'utf8'), version));
}

console.log(version);
