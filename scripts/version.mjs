// Checks and applies the extension's version (spec release-versioning, policy docs/versioning.md): the release level
// comes from the kinds of the entries under `## Unreleased` in packages/extension/CHANGELOG.md, and the manifest,
// the lockfile and the latest CHANGELOG release heading must agree.
// Run: node scripts/version.mjs --check | --bump [--level major|minor|patch] [--date YYYY-MM-DD]
// (--root <dir> points at another repository; the tests use it for fixtures.)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST = 'packages/extension/package.json';
const LOCKFILE = 'package-lock.json';
const CHANGELOG = 'packages/extension/CHANGELOG.md';
const KINDS = ['Breaking', 'Removed', 'Added', 'Changed', 'Deprecated', 'Fixed', 'Security'];
const LEVEL_OF_KIND = { Breaking: 'major', Removed: 'major', Added: 'minor', Changed: 'minor', Deprecated: 'minor', Fixed: 'patch', Security: 'patch' };
const LEVELS = ['patch', 'minor', 'major'];
const KIND_LIST = `${KINDS.slice(0, -1).join(', ')} or ${KINDS.at(-1)}`;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_HEADING = /^## ((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)) — \d{4}-\d{2}-\d{2}$/;
const USAGE = 'usage: node scripts/version.mjs --check|--bump [--level major|minor|patch] [--date YYYY-MM-DD]';

function parseArgs(argv) {
  const args = { root: join(dirname(fileURLToPath(import.meta.url)), '..') };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check' || arg === '--bump') {
      if (args.mode) return { error: USAGE };
      args.mode = arg.slice(2);
    } else if (arg === '--level' || arg === '--date' || arg === '--root') {
      if (i + 1 >= argv.length) return { error: USAGE };
      args[arg.slice(2)] = argv[++i];
    } else return { error: USAGE };
  }
  if (!args.mode) return { error: USAGE };
  if (args.level !== undefined && !LEVELS.includes(args.level)) return { error: '--level must be major, minor or patch' };
  if (args.date !== undefined && !isDate(args.date)) return { error: '--date must be YYYY-MM-DD' };
  return args;
}

function isDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The kind of a top-level bullet, or an error message for it. */
function entryKind(line) {
  const m = /^- \*\*(.+?)(?::|\.|\s—\s|\*\*)/.exec(line);
  if (!m) return { error: `entry has no kind; start it with ${KIND_LIST} in bold` };
  const kind = m[1].trim();
  return KINDS.includes(kind) ? { kind } : { error: `unknown entry kind "${kind}"; use ${KIND_LIST}` };
}

/** Reads the three files and runs every check; failures are collected in order. */
function inspect(root) {
  const failures = [];
  const manifestText = readFileSync(join(root, MANIFEST), 'utf8');
  const lockText = readFileSync(join(root, LOCKFILE), 'utf8');
  const changelogText = readFileSync(join(root, CHANGELOG), 'utf8');
  const lines = changelogText.split(/\r?\n/);

  const unreleased = lines.indexOf('## Unreleased');
  if (unreleased < 0) failures.push(`${CHANGELOG} has no "## Unreleased" section`);

  const version = JSON.parse(manifestText).version;
  const validVersion = typeof version === 'string' && VERSION.test(version);
  if (!validVersion) failures.push(`${MANIFEST} version "${version}" is not major.minor.patch`);

  const lockEntry = JSON.parse(lockText).packages?.['packages/extension'];
  if (!lockEntry) failures.push(`${LOCKFILE} has no packages/extension entry`);
  else if (validVersion && lockEntry.version !== version) failures.push(`${LOCKFILE} records mermaid-animator ${lockEntry.version}, but ${MANIFEST} is ${version}`);

  const release = lines.map((l) => RELEASE_HEADING.exec(l)).find(Boolean)?.[1];
  if (validVersion) {
    if (!release) failures.push(`${CHANGELOG} has no release heading for ${version}`);
    else if (release !== version) failures.push(`the latest release in ${CHANGELOG} is ${release}, but ${MANIFEST} is ${version}`);
  }

  const kinds = [];
  if (unreleased >= 0) {
    for (let i = unreleased + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
      if (!lines[i].startsWith('- ')) continue;
      const entry = entryKind(lines[i]);
      if (entry.error) failures.push(`${CHANGELOG}:${i + 1}: ${entry.error}`);
      else kinds.push(entry.kind);
    }
  }
  const level = kinds.reduce((best, kind) => (LEVELS.indexOf(LEVEL_OF_KIND[kind]) > LEVELS.indexOf(best) ? LEVEL_OF_KIND[kind] : best), undefined);
  return { failures, version, kinds, level, manifestText, lockText, changelogText };
}

function nextVersion(version, level) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Replaces only the manifest's top-level `"version"` line. */
function bumpManifest(text, next) {
  return text.replace(/^( {2}"version": )"[^"]*"/m, `$1"${next}"`);
}

/** Replaces only the `"version"` line of the lockfile's `packages/extension` object. */
function bumpLockfile(text, next) {
  const start = text.search(/^ {4}"packages\/extension": \{/m);
  const end = text.indexOf('\n    }', start);
  const entry = text.slice(start, end).replace(/^( {6}"version": )"[^"]*"/m, `$1"${next}"`);
  return text.slice(0, start) + entry + text.slice(end);
}

function bumpChangelog(text, next, date) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.replace(/^## Unreleased(?=\r?$)/m, `## Unreleased${eol}${eol}## ${next} — ${date}`);
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) return fail([args.error]);
  const state = inspect(args.root);
  const failures = [...state.failures];
  let level = state.level;
  if (args.level && state.level && LEVELS.indexOf(args.level) < LEVELS.indexOf(state.level)) {
    failures.push(`--level ${args.level} is lower than ${state.level}, which the Unreleased entries require`);
  } else if (args.level && state.level) level = args.level;
  if (failures.length) return fail(failures);

  const count = state.kinds.length;
  if (args.mode === 'check') {
    console.log(count
      ? `mermaid-animator ${state.version}; Unreleased: ${count} ${count === 1 ? 'entry' : 'entries'} → ${level} (next ${nextVersion(state.version, level)})`
      : `mermaid-animator ${state.version}; Unreleased: no entries (no release pending)`);
    return 0;
  }

  if (!count) return fail([`Nothing to release: the Unreleased section of ${CHANGELOG} has no entries`]);
  const next = nextVersion(state.version, level);
  writeFileSync(join(args.root, MANIFEST), bumpManifest(state.manifestText, next));
  writeFileSync(join(args.root, LOCKFILE), bumpLockfile(state.lockText, next));
  writeFileSync(join(args.root, CHANGELOG), bumpChangelog(state.changelogText, next, args.date ?? localDate()));
  console.log(`mermaid-animator ${state.version} → ${next} (${level})`);
  console.log(`Next: git commit -am "chore(release): ${next}" && git tag v${next}`);
  return 0;
}

function fail(messages) {
  for (const message of messages) console.error(message);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
