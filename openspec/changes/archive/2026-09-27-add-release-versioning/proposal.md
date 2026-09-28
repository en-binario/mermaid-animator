# Proposal

## Why

The extension is at `1.0.0` and its `CHANGELOG.md` already collects nine entries under `## Unreleased`, but nothing
says whether the next release is `1.0.1`, `1.1.0` or `2.0.0`. The bump is chosen by hand, and nothing keeps the
version numbers in step: `package-lock.json` still records the extension as `0.1.0` while its manifest says `1.0.0`.
The product specification (§22) promises versioning from recorded changes, but no tooling does it. Users installing
from the Marketplace read the version as a promise: a major bump warns that settings, commands, annotations or sidecar
files they rely on may stop working. That promise needs written rules and a check that enforces them.

## What Changes

- A written versioning policy (`docs/versioning.md`) that defines the extension's public surface (command ids,
  setting keys and values, `@animator` annotations, sidecar format, deep-link URIs, export formats, keybindings,
  minimum VS Code version) and classifies each kind of change as major, minor or patch.
- Every top-level entry under `## Unreleased` in `packages/extension/CHANGELOG.md` starts with a bold kind:
  `Breaking`, `Removed`, `Added`, `Changed`, `Deprecated`, `Fixed` or `Security`. The kinds already used (`Added`,
  `Changed`, `Fixed`) keep their current form.
- The release level is derived from the kinds present: `Breaking` or `Removed` → major; `Added`, `Changed` or
  `Deprecated` → minor; `Fixed` or `Security` → patch. A maintainer can raise the level with `--level`, never lower it.
- New npm scripts:
  - `npm run version:check` validates the Unreleased entries, checks that the manifest version, the lockfile version
    and the latest released CHANGELOG heading agree, and prints the pending bump. It also runs inside `npm test`, so CI
    fails on an entry with an unknown kind or on drifting versions.
  - `npm run version:bump` applies the release: writes the next version to `packages/extension/package.json` and
    `package-lock.json`, turns `## Unreleased` into `## <version> — <date>`, and opens a new empty `## Unreleased`.
- `CONTRIBUTING.md` and the OpenSpec `tasks` rules require each change with user-observable behaviour to add a
  kind-prefixed CHANGELOG entry.
- The stale lockfile entry (`0.1.0`) is corrected to `1.0.0`.

## Capabilities

### New Capabilities
- `release-versioning`: How the extension's version number is chosen and applied: the change classification, the
  CHANGELOG entry kinds, the bump level they imply, the level override, the release step and the consistency check.

### Modified Capabilities
<!-- None: no existing capability's requirements change. -->

## Impact

- **New files:** `scripts/version.mjs`, `docs/versioning.md`, `packages/extension/unit/version.test.ts`.
- **Edited:** root `package.json` (two scripts), `package-lock.json` (extension version), `CONTRIBUTING.md`,
  `openspec/config.yaml` (`rules.tasks`), `vscode-extension-specification.md` §22 (Changesets replaced by CHANGELOG
  entry kinds).
- **No runtime change:** the extension, webview and exports are untouched; no new dependency.
- **Out of scope:** publishing to the Marketplace or Open VSX, git commits and tags (the script prints the commands),
  pre-release channels, and versions of the private workspace packages (`core`, `protocol`, `renderer`, `webview`).
