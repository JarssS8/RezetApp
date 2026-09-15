import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changelogSection, nextVersion, setLockfileVersion, setManifestVersion } from './version.mjs';

test('nextVersion bumps each level and resets the lower ones', () => {
  assert.equal(nextVersion('1.4.2', 'patch'), '1.4.3');
  assert.equal(nextVersion('1.4.2', 'minor'), '1.5.0');
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
});

test('nextVersion rejects pre-releases and unknown levels', () => {
  assert.throws(() => nextVersion('1.4.2-beta.1', 'patch'), /Not a plain SemVer/);
  assert.throws(() => nextVersion('1.4.2', 'huge'), /Unknown bump level/);
});

const changelog = `# Changelog

## [1.1.0] - 2026-09-16

### Español
**Nuevo**
- Aviso cuando hay una versión nueva.

## [1.0.0] - 2026-09-15

### Español
**Nuevo**
- Primera versión.
`;

test('changelogSection returns only the requested version', () => {
  const notes = changelogSection(changelog, '1.1.0');
  assert.match(notes, /Aviso cuando hay una versión nueva/);
  assert.doesNotMatch(notes, /Primera versión/);
  assert.match(changelogSection(changelog, '1.0.0'), /Primera versión/);
});

test('changelogSection returns null for a missing version', () => {
  assert.equal(changelogSection(changelog, '9.9.9'), null);
});

test('setManifestVersion changes only the version field', () => {
  const manifest = '{\n  "name": "rezet-mcp",\n  "version": "0.1.0",\n  "engines": { "node": ">=22" }\n}\n';
  assert.equal(setManifestVersion(manifest, '1.1.0'), manifest.replace('0.1.0', '1.1.0'));
});

test('setLockfileVersion updates the top-level and root-package versions, not dependencies', () => {
  const lock = JSON.stringify(
    {
      name: 'rezet',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: { '': { name: 'rezet', version: '1.0.0' }, 'node_modules/x': { version: '1.0.0' } },
    },
    null,
    2,
  );
  const updated = JSON.parse(setLockfileVersion(lock, '1.1.0'));
  assert.equal(updated.version, '1.1.0');
  assert.equal(updated.packages[''].version, '1.1.0');
  assert.equal(updated.packages['node_modules/x'].version, '1.0.0');
});
