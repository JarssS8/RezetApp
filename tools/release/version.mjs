// Pure helpers shared by the release scripts, CI and their tests.

export function nextVersion(current, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Not a plain SemVer version: ${current}`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump level: ${level} (use major, minor or patch)`);
}

/** Text under `## [version]` in CHANGELOG.md, up to the next version heading; null if absent. */
export function changelogSection(markdown, version) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return null;
  const next = lines.findIndex((line, i) => i > start && line.startsWith('## ['));
  return lines.slice(start + 1, next < 0 ? undefined : next).join('\n').trim();
}

/** Rewrites only the version fields, keeping each file's formatting untouched. */
export function setManifestVersion(text, version) {
  return text.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
}

export function setLockfileVersion(text, version) {
  const top = setManifestVersion(text, version);
  const rootPackage = top.indexOf('"": {');
  if (rootPackage < 0) return top;
  return top.slice(0, rootPackage) + setManifestVersion(top.slice(rootPackage), version);
}
