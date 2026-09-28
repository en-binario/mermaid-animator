# Tasks

## 1. Consistent starting point

- [x] 1.1 Correct `package-lock.json` `packages["packages/extension"].version` from `0.1.0` to `1.0.0` (run `npm install --package-lock-only`, then confirm the diff touches only that line; if npm rewrites other entries, edit the one line by hand instead). Verify that `git diff package-lock.json` shows a single changed line.

## 2. Version script: check mode

- [x] 2.1 Create `scripts/version.mjs` (zero-dependency Node ESM, header comment in the style of `scripts/sidecar-schema.mjs`) with argument parsing (`--check`, `--bump`, `--level`, `--date`, `--root`), file reading, CHANGELOG sectioning (`## Unreleased` to the next `## ` line; release headings `## x.y.z — YYYY-MM-DD`), entry kind parsing per design, level and next-version computation, and every check of the `Version consistency check` requirement, with the exact messages from the spec (failures to stderr, the summary to stdout, exit `1` on any failure). Verify that `node scripts/version.mjs --check` prints `mermaid-animator 1.0.0; Unreleased: 9 entries → minor (next 1.1.0)` and exits `0` on the repository.
- [x] 2.2 Add `"version:check": "node scripts/version.mjs --check"` and `"version:bump": "node scripts/version.mjs --bump"` to the root `package.json`. Verify that `npm run version:check` prints the same summary line as 2.1.
- [x] 2.3 Create `packages/extension/unit/version.test.ts` with a fixture helper: it writes a manifest, a lockfile and a CHANGELOG into `mkdtempSync`, runs `node scripts/version.mjs … --root <dir>` through `spawnSync`, and returns the status, output and file contents. Add a case that runs `--check` on the real repository and expects status `0` (as `sidecarSchema.test.ts` does). Verify with `npx vitest run packages/extension/unit/version.test.ts` passing.
- [x] 2.4 `Entry kind matrix` (release-versioning) → `packages/extension/unit/version.test.ts`, `it.each` with one case per R1–R7, placing each row's line at line 12 of the fixture CHANGELOG and asserting the reported message (or its absence) and the counted kinds.
- [x] 2.5 `Release level matrix` (release-versioning) → `packages/extension/unit/version.test.ts`, `it.each` with one case per R1–R4 on a `1.2.3` fixture, asserting the level and the next version in the summary line.
- [x] 2.6 `Version consistency matrix` (release-versioning) → `packages/extension/unit/version.test.ts`, `it.each` with one case per R1–R9, asserting the exit status and the exact output line. Add cases for the `Every invalid entry is reported` scenario (messages for lines 5 and 7, in order, exit `1`) and the `Several failures are all reported` scenario (the lockfile message and the entry kind message both present, exit `1`).
- [x] 2.7 Verify the `The test suite runs the check` scenario by hand: add a temporary `- **Improved:** test` entry to `## Unreleased`, run `npm test`, confirm that it fails with the `unknown entry kind "Improved"` message, then remove the entry and confirm that `npm test` passes.

## 3. Version script: level override and bump mode

- [x] 3.1 Implement `--level` validation and comparison (refusal messages from the spec). `Level override matrix` (release-versioning) → `packages/extension/unit/version.test.ts`, `it.each` with one case per R1–R7, run in `--check` mode, plus R3, R4, R6 and R7 in `--bump` mode, asserting that the fixture files are byte-identical after R6 and R7.
- [x] 3.2 Implement `--bump` per design: run the checks, refuse an empty Unreleased section, validate `--date` (default: the local date), replace only the `"version"` line in the manifest and in the lockfile's `packages/extension` object, rewrite the `## Unreleased` line as `## Unreleased`, an empty line and `## <next> — <date>`, and print the two success lines. `Release step matrix` (release-versioning) → `packages/extension/unit/version.test.ts`, `it.each` with one case per R1–R5, asserting the exit status, the output, and either byte-identical files (R1–R3) or the updated files (R4 with the test's own local date, R5 with `2026-10-01`).
- [x] 3.3 Add a case for the `Release and check again` scenario: from a `1.0.0` fixture with one `Added` and one `Fixed` entry, run `--bump --date 2026-10-01`, then `--check`. Assert every THEN line, and assert that a line diff of each of the three files shows only the version lines and the Unreleased heading changed.

## 4. Policy and contributor documentation

- [x] 4.1 Write `docs/versioning.md` in the style of `docs/spec-writing.md` (header block, numbered sections, decision log). It covers the public surface, the change classification table (the same rows R1–R11 as the spec), the entry kinds and their format with examples, the level rule, `--level`, the release procedure (`npm run version:check`, `npm run version:bump`, review the diff, then the printed commit and tag commands), and a decision log entry dated 2026-09-27. The procedure must also say that a `Breaking` or `Removed` entry names what users do instead. Verify with the checklist in 4.2.
- [x] 4.2 `Change classification table` (release-versioning) → manual checklist: confirm that `docs/versioning.md` states each row with the same entry kind and level.
  - [x] R1 Removed command, setting, setting value, annotation or argument → `Removed`, major
  - [x] R2 Stops reading earlier sidecar files → `Breaking`, major
  - [x] R3 Stops opening earlier deep links or player links → `Breaking`, major
  - [x] R4 Accepted input now produces an error diagnostic or is ignored → `Breaking`, major
  - [x] R5 Adds to the public surface → `Added`, minor
  - [x] R6 Changes a default, a keybinding or visible behaviour → `Changed`, minor
  - [x] R7 Raises `engines.vscode` → `Changed`, minor
  - [x] R8 Announces a future removal → `Deprecated`, minor
  - [x] R9 Behaviour matches the specs or README again → `Fixed`, patch
  - [x] R10 Security fix → `Security`, patch
  - [x] R11 No user-observable effect → no entry, no release
- [x] 4.3 Update `CONTRIBUTING.md`: add a *Versioning* section linking `docs/versioning.md`, stating that every change with a user-observable effect adds a kind-prefixed entry under `## Unreleased`, and listing `npm run version:check`. Verify that the link resolves and that `npm run version:check` runs as written.
- [x] 4.4 Add to `openspec/config.yaml` `rules.tasks`: `'When the change has a user-observable effect, end with a task that adds a kind-prefixed entry under ## Unreleased in packages/extension/CHANGELOG.md (docs/versioning.md).'` Verify that `openspec instructions tasks --change add-release-versioning --json` includes the new rule.
- [x] 4.5 Update `vscode-extension-specification.md` §21.5 (release notes come from the CHANGELOG), §22.2 (the *Release* row drops Changesets) and §22.4 (Conventional Commits; versioning by CHANGELOG entry kinds per `docs/versioning.md`). Verify that `grep -n Changesets vscode-extension-specification.md` returns no lines (today it matches lines 2049, 2094 and 2116).

## 5. Integration

- [x] 5.1 Run `npm run check` and `npm run build`. Verify that both pass and that `git status` shows no files changed by the version script.
- [x] 5.2 Run `openspec validate add-release-versioning --strict`. Verify that it reports the change as valid.
