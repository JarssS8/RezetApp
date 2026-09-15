#!/usr/bin/env node
// Usage: node tools/release/release-notes.mjs <version>  → prints that version's CHANGELOG.md section.
import { readFileSync } from 'node:fs';
import { changelogSection } from './version.mjs';

const version = process.argv[2];
const notes = changelogSection(readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8'), version);
if (!notes) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
console.log(notes);
