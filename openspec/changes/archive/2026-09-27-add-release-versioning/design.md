# Design

## Context

- The only published package is `packages/extension` (`mermaid-animator`, version `1.0.0`). The other workspaces are
  private and stay at `0.1.0`.
- `packages/extension/CHANGELOG.md` has a `## Unreleased` section. Its entries already begin with a bold kind in two
  styles: `**Added — <title>.**` and `**Fixed:**`. Release headings read `## 1.0.0 — 2026-09-26`. An old heading,
  `## 0.1.0 — Unreleased`, never became a release.
- `package-lock.json` records `packages["packages/extension"].version` as `0.1.0`, which drifted when the manifest
  moved to `1.0.0`. The CycloneDX SBOM is generated from the manifest at build time, so it needs no bump.
- Repository scripts are plain Node ESM files in `scripts/` with no dependencies (`sidecar-schema.mjs` has a `--check`
  mode). `packages/extension/unit/sidecarSchema.test.ts` runs such a check through `execFileSync`, so `npm test`, and
  therefore CI, enforces it.
- The product specification (§21.5, §22.2, §22.4) names Changesets for versioning, but Changesets was never adopted.

## Goals / Non-Goals

**Goals:**
- One zero-dependency script, `scripts/version.mjs`, with two modes (`--check`, `--bump`) that follow the
  `release-versioning` spec exactly, including its messages.
- Table-driven tests that run the script against temporary fixture repositories, one case per spec table row.
- The current repository passes the check once the lockfile is corrected (`9 entries → minor (next 1.1.0)`).

**Non-Goals:**
- Rewriting past CHANGELOG sections (`1.0.0`, `0.1.0`); the entry kind rules apply only to `## Unreleased`.
- Generating GitHub release notes or Marketplace metadata.

## Decisions

### CHANGELOG entry kinds drive the level, not commits or Changesets
The CHANGELOG is already written by hand and read by users on the Marketplace, so tagging its entries costs one word
each and keeps one source of truth.
- *Conventional Commits* (rejected): commit subjects describe code changes, not user impact. `feat:` commits in this
  repository bundle whole milestones, and a `fix:` to an unreleased feature would imply a patch that users never see.
- *Changesets* (rejected): it adds a dependency and a second place (`.changeset/*.md`) to describe each change. It is
  also built for multi-package publishing, which this repository does not do. §21.5, §22.2 and §22.4 of the product
  specification are updated to name the CHANGELOG entry kinds instead.

### Kind vocabulary: Keep a Changelog plus `Breaking`
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` and `Security` are the Keep a Changelog kinds that contributors
recognise. `Breaking` covers incompatible changes to something that still exists (spec table rows R2 to R4). Without
it, those changes would be misfiled as `Changed`, a minor bump. `Changed` stays minor on purpose: a new default or a
visual change does not stop existing settings or diagrams from working.

### Raising `engines.vscode` is minor
The Marketplace serves the last compatible version to older VS Code installs, so nobody loses a working extension.
Making it major would force a major release for routine adoption of new APIs and dilute the signal of a major version.

### One script, text-level edits
`scripts/version.mjs` parses arguments, reads the three files, runs every check and collects the failures, then
prints them or the summary. `--bump` reuses the check, then edits the files.
- The manifest and the lockfile are edited with targeted string replacement of the one `"version"` line, located by
  parsing the JSON first (in the lockfile, the `"packages/extension"` object). Re-serialising with `JSON.stringify`
  would pass the tests, but could reorder keys or reformat lines, which breaks the spec's "only the version lines
  change" constraint.
- The CHANGELOG is processed line by line. The `## Unreleased` line is replaced by `## Unreleased`, an empty line and
  `## <next> — <date>`.
- Kind parsing: on a top-level bullet, `^- \*\*(.+?)(:|\.|\s—\s|\*\*)` captures the token before the first
  terminator. A bullet that does not start with `- **` is "no kind".
- `--root <dir>` (undocumented and used only by tests) points the script at a fixture repository. Messages always
  print the repository-relative paths.
- The default `--date` is the local calendar date (`YYYY-MM-DD` from `Date` getters, not `toISOString`, which would
  give the UTC date).
- npm scripts: `"version:check": "node scripts/version.mjs --check"` and
  `"version:bump": "node scripts/version.mjs --bump"`, so `npm run version:bump -- --level major` works. The name
  `version` itself is avoided because npm reserves it as a lifecycle hook.

### Tests run the CLI on fixture repositories
`packages/extension/unit/version.test.ts` builds a temporary directory per case (`mkdtempSync`). Each directory holds a
minimal manifest, lockfile and CHANGELOG. The test runs the script with `--root` and asserts the exit status, the
stdout and stderr lines, and the file contents. This tests the real exit codes and messages without adding TypeScript
declarations for an `.mjs` module. One further case runs `--check` against the real repository, like
`sidecarSchema.test.ts` does.

### Messages go to stderr on failure, stdout on success
Failures are printed to stderr, one per line, in the order the checks run: arguments, `## Unreleased` present,
manifest format, lockfile, release heading, then entries in line order. The summary and the success lines go to
stdout. Tests assert the combined text, so the stream split is a convention, not part of the spec.

## Risks / Trade-offs

- [Contributors forget the kind or pick the wrong one] → `npm test` fails on a missing or unknown kind. A wrong but
  valid kind (for example, `Changed` for a removal) is caught in review against the classification table in
  `docs/versioning.md`, which CONTRIBUTING links from its checklist.
- [Changes with no entry at all are released silently] → the new `rules.tasks` entry in `openspec/config.yaml` makes
  every OpenSpec change with a user-observable effect end with a task that adds an entry.
- [Line-based parsing misreads unusual Markdown, such as a bullet inside a code block under Unreleased] → the section
  is prose by convention; `version:check` reports anything unexpected rather than guessing.
- [Local-date default differs between maintainers in different time zones] → `--date` overrides it. The date is
  informational only.

## Migration Plan

1. Correct the lockfile entry to `1.0.0` (part of this change), so the first `version:check` passes.
2. The existing nine Unreleased entries already use recognised kinds, so no entry needs rewriting.
3. The next release runs `npm run version:bump`, reviews the diff, then commits and tags with the printed command.
Rollback: revert the commit. The script changes only the three files, all under version control.
