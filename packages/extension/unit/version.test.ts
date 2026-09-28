import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');
const script = join(root, 'scripts', 'version.mjs');
const FILES = ['packages/extension/package.json', 'package-lock.json', 'packages/extension/CHANGELOG.md'] as const;

interface Fixture {
  version?: string;
  lock?: string;
  /** Version of the latest release heading; null leaves it out. */
  release?: string | null;
  /** Lines under `## Unreleased`; null leaves the section out. */
  unreleased?: string[] | null;
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture({ version = '1.0.0', lock = version, release = version, unreleased = [] }: Fixture = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'animator-version-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'packages', 'extension'), { recursive: true });
  const manifest = { name: 'mermaid-animator', version, publisher: 'enbinario', contributes: { configuration: { properties: { x: { version: '9.9.9' } } } } };
  const lockfile = {
    name: 'fixture',
    version: '0.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', version: '0.0.0', workspaces: ['packages/*'] },
      'packages/core': { name: '@mermaid-animator/core', version: '0.1.0' },
      'packages/extension': { name: 'mermaid-animator', version: lock, license: 'MIT' },
    },
  };
  const changelog = ['# Changelog', ''];
  if (unreleased) changelog.push('## Unreleased', '', ...unreleased, '');
  if (release) changelog.push(`## ${release} — 2026-09-26`, '', '- **M3 — Share.** Export sheet.', '');
  changelog.push('## 0.1.0 — Unreleased', '', '- **M0 — Foundations.** Animator panel.', '');
  writeFileSync(join(dir, FILES[0]), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(dir, FILES[1]), `${JSON.stringify(lockfile, null, 2)}\n`);
  writeFileSync(join(dir, FILES[2]), changelog.join('\n'));
  return dir;
}

function run(dir: string | undefined, ...args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args, ...(dir ? ['--root', dir] : [])], { encoding: 'utf8' });
  return { status: result.status, lines: `${result.stdout}${result.stderr}`.split('\n').filter(Boolean) };
}

const read = (dir: string) => FILES.map((file) => readFileSync(join(dir, file), 'utf8'));
const entries = (kinds: string[]) => kinds.map((kind, i) => `- **${kind}:** entry ${i + 1}.`);
const kindMessage = (line: number, kind: string) =>
  `packages/extension/CHANGELOG.md:${line}: unknown entry kind "${kind}"; use Breaking, Removed, Added, Changed, Deprecated, Fixed or Security`;
const noKindMessage = (line: number) =>
  `packages/extension/CHANGELOG.md:${line}: entry has no kind; start it with Breaking, Removed, Added, Changed, Deprecated, Fixed or Security in bold`;

describe('version check', () => {
  it('passes on the repository', () => {
    const result = run(undefined, '--check');
    expect(result.lines.join('\n')).toMatch(/^mermaid-animator \d+\.\d+\.\d+; Unreleased: /);
    expect(result.status).toBe(0);
  });

  // Line 12 is the eighth line of the section: seven `Added` fillers occupy lines 5–11.
  it.each([
    { name: 'accepts a kind followed by a title', line: '- **Added — overview at step 0.** Before the first step …', kind: 'Added', message: undefined },
    { name: 'accepts a kind followed by a colon', line: '- **Fixed:** step bounds of Mermaid-rendered diagrams …', kind: 'Fixed', message: undefined },
    { name: 'accepts a kind followed by a full stop', line: '- **Breaking.** Sidecar files of version 1 are no longer read …', kind: 'Breaking', message: undefined },
    { name: 'reports an unknown kind', line: '- **Improved:** faster layout', kind: undefined, message: kindMessage(12, 'Improved') },
    { name: 'reports a kind in the wrong case', line: '- **added:** a new export', kind: undefined, message: kindMessage(12, 'added') },
    { name: 'reports an entry without a kind', line: '- Faster playback on large diagrams', kind: undefined, message: noKindMessage(12) },
    { name: 'ignores an indented continuation line', line: '  - second paragraph of the entry above', kind: undefined, message: undefined },
  ])('$name', ({ line, kind, message }) => {
    const dir = fixture({ unreleased: [...entries(Array(7).fill('Added')), line] });
    expect(readFileSync(join(dir, FILES[2]), 'utf8').split('\n')[11]).toBe(line);
    const result = run(dir, '--check');
    if (message) {
      expect(result.lines).toEqual([message]);
      expect(result.status).toBe(1);
    } else {
      const count = kind ? 8 : 7;
      const level = kind === 'Breaking' ? 'major' : 'minor';
      expect(result.lines).toEqual([`mermaid-animator 1.0.0; Unreleased: ${count} entries → ${level} (next ${level === 'major' ? '2.0.0' : '1.1.0'})`]);
      expect(result.status).toBe(0);
    }
  });

  it('reports every invalid entry in line order', () => {
    // Lines 5–7: no kind, a valid entry, an unknown kind.
    const dir = fixture({ unreleased: ['- Faster playback', '- **Added:** a view.', '- **Improved:** layout'] });
    expect(run(dir, '--check')).toEqual({ status: 1, lines: [noKindMessage(5), kindMessage(7, 'Improved')] });
  });

  it.each([
    { name: 'has nothing pending without entries', kinds: [], output: 'mermaid-animator 1.2.3; Unreleased: no entries (no release pending)' },
    { name: 'plans a major release for a removal among other kinds', kinds: ['Added', 'Removed', 'Fixed'], output: 'mermaid-animator 1.2.3; Unreleased: 3 entries → major (next 2.0.0)' },
    { name: 'plans a minor release for additions, changes and deprecations', kinds: ['Fixed', 'Changed', 'Deprecated'], output: 'mermaid-animator 1.2.3; Unreleased: 3 entries → minor (next 1.3.0)' },
    { name: 'plans a patch release for fixes and security fixes only', kinds: ['Fixed', 'Security'], output: 'mermaid-animator 1.2.3; Unreleased: 2 entries → patch (next 1.2.4)' },
  ])('$name', ({ kinds, output }) => {
    expect(run(fixture({ version: '1.2.3', unreleased: entries(kinds) }), '--check')).toEqual({ status: 0, lines: [output] });
  });

  it.each([
    {
      name: 'requires an Unreleased section',
      fixture: { unreleased: null },
      status: 1,
      output: 'packages/extension/CHANGELOG.md has no "## Unreleased" section',
    },
    {
      name: 'requires a major.minor.patch manifest version',
      fixture: { version: '1.0', lock: '1.0.0', release: '1.0.0', unreleased: entries(['Added']) },
      status: 1,
      output: 'packages/extension/package.json version "1.0" is not major.minor.patch',
    },
    {
      name: 'reports a lockfile that disagrees with the manifest',
      fixture: { lock: '0.1.0', unreleased: entries(['Added']) },
      status: 1,
      output: 'package-lock.json records mermaid-animator 0.1.0, but packages/extension/package.json is 1.0.0',
    },
    {
      name: 'reports a latest release that disagrees with the manifest',
      fixture: { version: '1.0.1', release: '1.0.0', unreleased: entries(['Added']) },
      status: 1,
      output: 'the latest release in packages/extension/CHANGELOG.md is 1.0.0, but packages/extension/package.json is 1.0.1',
    },
    {
      name: 'reports a missing release heading',
      fixture: { release: null, unreleased: entries(['Added']) },
      status: 1,
      output: 'packages/extension/CHANGELOG.md has no release heading for 1.0.0',
    },
    {
      name: 'reports an entry without a kind',
      fixture: { unreleased: ['- Faster playback'] },
      status: 1,
      output: noKindMessage(5),
    },
    {
      name: 'reports no pending release without entries',
      fixture: {},
      status: 0,
      output: 'mermaid-animator 1.0.0; Unreleased: no entries (no release pending)',
    },
    {
      name: 'counts entries and plans the release',
      fixture: { unreleased: entries(['Added', 'Added', 'Added', 'Added', 'Added', 'Changed', 'Changed', 'Changed', 'Fixed']) },
      status: 0,
      output: 'mermaid-animator 1.0.0; Unreleased: 9 entries → minor (next 1.1.0)',
    },
    {
      name: 'writes a single entry in the singular',
      fixture: { unreleased: entries(['Fixed']) },
      status: 0,
      output: 'mermaid-animator 1.0.0; Unreleased: 1 entry → patch (next 1.0.1)',
    },
  ])('$name', ({ fixture: f, status, output }) => {
    expect(run(fixture(f), '--check')).toEqual({ status, lines: [output] });
  });

  it('reports several failures together', () => {
    const dir = fixture({ lock: '0.1.0', unreleased: ['- Faster playback'] });
    const result = run(dir, '--check');
    expect(result.lines).toContain('package-lock.json records mermaid-animator 0.1.0, but packages/extension/package.json is 1.0.0');
    expect(result.lines).toContain(noKindMessage(5));
    expect(result.status).toBe(1);
  });
});

describe('level override', () => {
  const implied = { patch: ['Fixed'], minor: ['Added'], major: ['Removed'] } as const;

  it.each([
    { name: 'refuses an unknown level', implied: 'minor', level: 'huge', status: 1, check: '--level must be major, minor or patch', next: undefined },
    { name: 'uses the implied level without an override', implied: 'minor', level: undefined, status: 0, check: 'mermaid-animator 1.0.0; Unreleased: 1 entry → minor (next 1.1.0)', next: '1.1.0 (minor)' },
    { name: 'raises a patch release to minor', implied: 'patch', level: 'minor', status: 0, check: 'mermaid-animator 1.0.0; Unreleased: 1 entry → minor (next 1.1.0)', next: '1.1.0 (minor)' },
    { name: 'raises a minor release to major', implied: 'minor', level: 'major', status: 0, check: 'mermaid-animator 1.0.0; Unreleased: 1 entry → major (next 2.0.0)', next: '2.0.0 (major)' },
    { name: 'accepts the implied level', implied: 'minor', level: 'minor', status: 0, check: 'mermaid-animator 1.0.0; Unreleased: 1 entry → minor (next 1.1.0)', next: '1.1.0 (minor)' },
    { name: 'refuses to lower a minor release to patch', implied: 'minor', level: 'patch', status: 1, check: '--level patch is lower than minor, which the Unreleased entries require', next: undefined },
    { name: 'refuses to lower a major release to minor', implied: 'major', level: 'minor', status: 1, check: '--level minor is lower than major, which the Unreleased entries require', next: undefined },
  ] as const)('$name', ({ implied: from, level, status, check, next }) => {
    const levelArgs = level ? ['--level', level] : [];
    expect(run(fixture({ unreleased: entries([...implied[from]]) }), '--check', ...levelArgs)).toEqual({ status, lines: [check] });

    const dir = fixture({ unreleased: entries([...implied[from]]) });
    const before = read(dir);
    const bump = run(dir, '--bump', '--date', '2026-10-01', ...levelArgs);
    expect(bump.status).toBe(status);
    if (next) {
      expect(bump.lines[0]).toBe(`mermaid-animator 1.0.0 → ${next}`);
    } else {
      expect(bump.lines).toEqual([check]);
      expect(read(dir)).toEqual(before);
    }
  });
});

describe('version bump', () => {
  const localDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const success = ['mermaid-animator 1.0.0 → 1.1.0 (minor)', 'Next: git commit -am "chore(release): 1.1.0" && git tag v1.1.0'];

  it.each([
    { name: 'refuses a date in another format', fixture: { unreleased: entries(['Added']) }, date: '01/10/2026', status: 1, output: ['--date must be YYYY-MM-DD'] },
    { name: 'refuses to release when a check fails', fixture: { lock: '0.1.0', unreleased: entries(['Added']) }, date: '2026-10-01', status: 1, output: ['package-lock.json records mermaid-animator 0.1.0, but packages/extension/package.json is 1.0.0'] },
    { name: 'refuses to release without entries', fixture: {}, date: '2026-10-01', status: 1, output: ['Nothing to release: the Unreleased section of packages/extension/CHANGELOG.md has no entries'] },
    { name: 'dates the release with the local date by default', fixture: { unreleased: entries(['Added']) }, date: undefined, status: 0, output: success },
    { name: 'dates the release with the given date', fixture: { unreleased: entries(['Added']) }, date: '2026-10-01', status: 0, output: success },
  ])('$name', ({ fixture: f, date, status, output }) => {
    const dir = fixture(f);
    const before = read(dir);
    expect(run(dir, '--bump', ...(date ? ['--date', date] : []))).toEqual({ status, lines: output });
    if (status) {
      expect(read(dir)).toEqual(before);
    } else {
      const [manifest, lock, changelog] = read(dir);
      expect(JSON.parse(manifest!).version).toBe('1.1.0');
      expect(JSON.parse(lock!).packages['packages/extension'].version).toBe('1.1.0');
      expect(changelog).toContain(`## Unreleased\n\n## 1.1.0 — ${date ?? localDate()}\n\n- **Added:** entry 1.`);
    }
  });

  it('releases, then reports nothing pending', () => {
    const dir = fixture({ unreleased: ['- **Added — zoom controls.** Toolbar buttons.', '- **Fixed:** step bounds.'] });
    const before = read(dir).map((text) => text.split('\n'));
    expect(run(dir, '--bump', '--date', '2026-10-01')).toEqual({ status: 0, lines: success });

    const after = read(dir).map((text) => text.split('\n'));
    for (const [i, file] of ['manifest', 'lockfile'].entries()) {
      const changed = after[i]!.flatMap((line, n) => (line === before[i]![n] ? [] : [line]));
      expect(after[i], file).toHaveLength(before[i]!.length);
      expect(changed, file).toEqual([expect.stringMatching(/^ +"version": "1\.1\.0",$/)]);
    }
    expect(JSON.parse(after[0]!.join('\n')).contributes.configuration.properties.x.version).toBe('9.9.9');
    expect(JSON.parse(after[1]!.join('\n')).packages['packages/core'].version).toBe('0.1.0');
    const heading = before[2]!.indexOf('## Unreleased');
    expect(after[2]).toEqual([...before[2]!.slice(0, heading + 1), '', '## 1.1.0 — 2026-10-01', ...before[2]!.slice(heading + 1)]);
    expect(after[2]!.slice(heading, heading + 6)).toEqual(['## Unreleased', '', '## 1.1.0 — 2026-10-01', '', '- **Added — zoom controls.** Toolbar buttons.', '- **Fixed:** step bounds.']);

    expect(run(dir, '--check')).toEqual({ status: 0, lines: ['mermaid-animator 1.1.0; Unreleased: no entries (no release pending)'] });
  });
});
