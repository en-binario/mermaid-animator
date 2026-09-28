# Spec Delta

## Purpose

Defines how the extension's version number (`packages/extension/package.json` `version`) is chosen and applied, so
that a major, minor or patch release tells users what the release can break. The level comes from kind-prefixed
entries under `## Unreleased` in `packages/extension/CHANGELOG.md`, and the repository scripts check and apply it.

**Non-goals:**
- Publishing to the Visual Studio Marketplace or Open VSX, creating git commits or tags, and pre-release channels;
  these stay manual release steps outside this capability.
- Versions of the private workspace packages (`@mermaid-animator/core`, `protocol`, `renderer`, `webview`), which are
  never published.
- The sidecar file format version (`"version": 1`), owned by `sidecar-files`.

## ADDED Requirements

### Requirement: Change classification
Every released change SHALL be classified by its effect on the extension's public surface and recorded under
`## Unreleased` with the entry kind of its row below. A release SHALL increment the major version when it removes
anything from the public surface or changes it so that a user's existing settings, keybindings, diagram annotations,
sidecar files or links stop working; the minor version when it adds to or changes the public surface without that
effect; and the patch version otherwise. A change with no user-observable effect SHALL NOT add an entry. The policy
SHALL be written in `docs/versioning.md`, which states this table.

**Constraints:**
- Public surface: command ids, setting keys and their accepted values, default keybindings, `@animator` annotations
  and their arguments, the sidecar file format, `vscode://` deep links and HTML player step and chapter links, export
  formats, and the minimum VS Code version (`engines.vscode`)

#### Scenario: Change classification table

| # | Change | Entry kind | Level |
| :--- | :--- | :--- | :--- |
| R1 | Removes or renames a command id, setting key, accepted setting value, `@animator` annotation or annotation argument | **`Removed`** | **major** |
| R2 | Stops reading sidecar files that the previous release read | **`Breaking`** | **major** |
| R3 | Stops opening deep links or HTML player step or chapter links that the previous release produced | **`Breaking`** | **major** |
| R4 | Changes an existing annotation, argument or setting value so that a diagram or settings file accepted by the previous release now produces an error diagnostic or is ignored | **`Breaking`** | **major** |
| R5 | Adds a command, setting, setting value, annotation, argument, view, export format or keybinding | **`Added`** | **minor** |
| R6 | Changes a setting's default, a default keybinding, or visible behaviour, without removing anything from the public surface | **`Changed`** | **minor** |
| R7 | Raises the minimum VS Code version (`engines.vscode`) | **`Changed`** | **minor** |
| R8 | Announces that part of the public surface will be removed in a later major release, while it keeps working | **`Deprecated`** | **minor** |
| R9 | Makes behaviour match what the specs and README already describe | **`Fixed`** | **patch** |
| R10 | Fixes a security vulnerability without changing the public surface | **`Security`** | **patch** |
| R11 | Changes only documentation, tests, build scripts or internal code, with no user-observable effect | **No entry** | **No release** |

### Requirement: CHANGELOG entry kinds
Each top-level bullet under `## Unreleased` in `packages/extension/CHANGELOG.md` SHALL start with its kind in bold,
followed inside the bold span by `:`, `.` or ` — ` (the text after ` — ` is a title). The version check SHALL report
every bullet whose kind is missing or not one of the recognised kinds, with its line number, and SHALL exit with
status `1` when it reports any.

**Constraints:**
- Recognised kinds, case-sensitive: `Breaking`, `Removed`, `Added`, `Changed`, `Deprecated`, `Fixed`, `Security`
- The Unreleased section runs from the line `## Unreleased` to the next line starting with `## `
- A top-level bullet is a line starting with `- ` in column 1; indented lines belong to the bullet above them
- Paths in messages are relative to the repository root

#### Scenario: Entry kind matrix

| # | Line 12 of the CHANGELOG, inside the Unreleased section | Parsed kind | Check output for that line |
| :--- | :--- | :--- | :--- |
| R1 | `- **Added — overview at step 0.** Before the first step …` | **`Added`** | **None** |
| R2 | `- **Fixed:** step bounds of Mermaid-rendered diagrams …` | **`Fixed`** | **None** |
| R3 | `- **Breaking.** Sidecar files of version 1 are no longer read …` | **`Breaking`** | **None** |
| R4 | `- **Improved:** faster layout` | **None** | **`packages/extension/CHANGELOG.md:12: unknown entry kind "Improved"; use Breaking, Removed, Added, Changed, Deprecated, Fixed or Security`** |
| R5 | `- **added:** a new export` | **None** | **`packages/extension/CHANGELOG.md:12: unknown entry kind "added"; use Breaking, Removed, Added, Changed, Deprecated, Fixed or Security`** |
| R6 | `- Faster playback on large diagrams` | **None** | **`packages/extension/CHANGELOG.md:12: entry has no kind; start it with Breaking, Removed, Added, Changed, Deprecated, Fixed or Security in bold`** |
| R7 | `  - second paragraph of the entry above` | **Not an entry** | **None** |

#### Scenario: Every invalid entry is reported
- **GIVEN** the Unreleased section has an entry without a kind on line 5 and an entry of kind `Improved` on line 7
- **WHEN** the maintainer runs `npm run version:check`
- **THEN** the output has one message for line 5 and one for line 7, in line order
- **AND** the exit status is `1`

### Requirement: Release level from entry kinds
The release level SHALL be the highest level implied by the kinds under `## Unreleased`: `Breaking` and `Removed`
imply major, `Added`, `Changed` and `Deprecated` imply minor, and `Fixed` and `Security` imply patch. The next version
SHALL be computed from the manifest version by Semantic Versioning: a major release increments the major number and
resets minor and patch to `0`, a minor release increments the minor number and resets patch to `0`, and a patch release
increments the patch number.

**Constraints:**
- Versions are `<major>.<minor>.<patch>`, three non-negative integers without leading zeros and without a
  pre-release or build suffix

#### Scenario: Release level matrix

| # | Kinds under `## Unreleased` | Level | Next version from `1.2.3` |
| :--- | :--- | :--- | :--- |
| R1 | None (no entries) | **None** | **None (no release pending)** |
| R2 | At least one `Breaking` or `Removed`, with any others | **major** | **`2.0.0`** |
| R3 | No `Breaking` or `Removed`; at least one `Added`, `Changed` or `Deprecated` | **minor** | **`1.3.0`** |
| R4 | Only `Fixed` and `Security` | **patch** | **`1.2.4`** |

### Requirement: Level override
`npm run version:check` and `npm run version:bump` SHALL accept `--level <major|minor|patch>`. A given level SHALL be
used when it is equal to or higher than the level implied by the entries, and SHALL be refused, with exit status `1`
and no file changed, when it is lower or not one of the three values.

#### Scenario: Level override matrix

| # | Level implied by the entries | `--level` | Level used | Exit status | Output |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | *Any* | `huge` | **None** | **`1`** | **`--level must be major, minor or patch`** |
| R2 | *Any* | Absent | **The implied level** | **`0`** | **The summary line (check) or the two success lines (bump)** |
| R3 | patch | `minor` | **minor** | **`0`** | **The summary line (check) or the two success lines (bump)** |
| R4 | minor | `major` | **major** | **`0`** | **The summary line (check) or the two success lines (bump)** |
| R5 | minor | `minor` | **minor** | **`0`** | **The summary line (check) or the two success lines (bump)** |
| R6 | minor | `patch` | **None** | **`1`** | **`--level patch is lower than minor, which the Unreleased entries require`** |
| R7 | major | `minor` | **None** | **`1`** | **`--level minor is lower than major, which the Unreleased entries require`** |

### Requirement: Version consistency check
`npm run version:check` SHALL verify that the manifest version (`packages/extension/package.json` `version`), the
lockfile version (`package-lock.json` `packages["packages/extension"].version`) and the version of the latest release
heading in `packages/extension/CHANGELOG.md` are equal, and that the Unreleased entries are valid. It SHALL print every
failure, one per line, and exit with status `1` when any check fails; otherwise it SHALL print the summary line and exit
with status `0`. `npm test` SHALL run this check against the repository, so continuous integration fails when it fails.

**Constraints:**
- A release heading is a line `## <major>.<minor>.<patch> — <YYYY-MM-DD>`; the latest is the first in file order.
  Headings in any other form (such as `## 0.1.0 — Unreleased`) are not release headings
- Summary line with entries: `mermaid-animator <version>; Unreleased: <n> entries → <level> (next <next version>)`,
  with `1 entry` for a single entry
- Summary line without entries: `mermaid-animator <version>; Unreleased: no entries (no release pending)`

#### Scenario: Version consistency matrix

| # | `## Unreleased` present | Manifest | Lockfile | Latest release heading | Unreleased entries | Exit status | Output |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | No | *Any* | *Any* | *Any* | *N/A* | **`1`** | **`packages/extension/CHANGELOG.md has no "## Unreleased" section`** |
| R2 | Yes | `1.0` | *Any* | *Any* | *Any* | **`1`** | **`packages/extension/package.json version "1.0" is not major.minor.patch`** |
| R3 | Yes | `1.0.0` | `0.1.0` | `1.0.0` | Valid | **`1`** | **`package-lock.json records mermaid-animator 0.1.0, but packages/extension/package.json is 1.0.0`** |
| R4 | Yes | `1.0.1` | `1.0.1` | `1.0.0` | Valid | **`1`** | **`the latest release in packages/extension/CHANGELOG.md is 1.0.0, but packages/extension/package.json is 1.0.1`** |
| R5 | Yes | `1.0.0` | `1.0.0` | None | Valid | **`1`** | **`packages/extension/CHANGELOG.md has no release heading for 1.0.0`** |
| R6 | Yes | `1.0.0` | `1.0.0` | `1.0.0` | One without a kind | **`1`** | **The entry kind message for that line** |
| R7 | Yes | `1.0.0` | `1.0.0` | `1.0.0` | None | **`0`** | **`mermaid-animator 1.0.0; Unreleased: no entries (no release pending)`** |
| R8 | Yes | `1.0.0` | `1.0.0` | `1.0.0` | 5 `Added`, 3 `Changed`, 1 `Fixed` | **`0`** | **`mermaid-animator 1.0.0; Unreleased: 9 entries → minor (next 1.1.0)`** |
| R9 | Yes | `1.0.0` | `1.0.0` | `1.0.0` | 1 `Fixed` | **`0`** | **`mermaid-animator 1.0.0; Unreleased: 1 entry → patch (next 1.0.1)`** |

#### Scenario: Several failures are all reported
- **GIVEN** the lockfile records `0.1.0`, the manifest and the latest release heading say `1.0.0`, and one Unreleased
  entry has no kind
- **WHEN** the maintainer runs `npm run version:check`
- **THEN** the output contains the lockfile message and the entry kind message
- **AND** the exit status is `1`

#### Scenario: The test suite runs the check
- **GIVEN** an Unreleased entry of kind `Improved` is committed
- **WHEN** `npm test` runs
- **THEN** the test suite fails, and its output contains the `unknown entry kind "Improved"` message

### Requirement: Applying a release
`npm run version:bump` SHALL run every check of the version consistency check and, when all pass and the Unreleased
section has at least one entry, SHALL write the next version to the manifest and the lockfile, rename `## Unreleased`
to `## <next version> — <date>` with its entries unchanged beneath it, and insert a new `## Unreleased` heading
followed by an empty line above that heading. It SHALL accept `--date <YYYY-MM-DD>` and SHALL default to the local
date. When any check fails, the Unreleased section is empty, or an argument is invalid, it SHALL exit with status `1`
and change no file.

**Constraints:**
- Only three files change: `packages/extension/package.json`, `package-lock.json` and
  `packages/extension/CHANGELOG.md`; within them, only the version lines and the Unreleased heading change
- Success output, two lines: `mermaid-animator <version> → <next version> (<level>)` and
  `Next: git commit -am "chore(release): <next version>" && git tag v<next version>`

#### Scenario: Release step matrix

| # | `--date` | Checks | Unreleased entries | Exit status | Files | Output |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `01/10/2026` | *Any* | *Any* | **`1`** | **Unchanged** | **`--date must be YYYY-MM-DD`** |
| R2 | *Any valid* | A check fails | *Any* | **`1`** | **Unchanged** | **Every check failure, one per line** |
| R3 | *Any valid* | Pass | None | **`1`** | **Unchanged** | **`Nothing to release: the Unreleased section of packages/extension/CHANGELOG.md has no entries`** |
| R4 | Absent | Pass | At least one | **`0`** | **Updated; heading dated with the local date** | **The two success lines** |
| R5 | `2026-10-01` | Pass | At least one | **`0`** | **Updated; heading dated `2026-10-01`** | **The two success lines** |

#### Scenario: Release and check again
- **GIVEN** the manifest, the lockfile and the latest release heading say `1.0.0`, and `## Unreleased` holds one
  `Added` entry and one `Fixed` entry
- **WHEN** the maintainer runs `npm run version:bump -- --date 2026-10-01`
- **THEN** the output is `mermaid-animator 1.0.0 → 1.1.0 (minor)` followed by
  `Next: git commit -am "chore(release): 1.1.0" && git tag v1.1.0`
- **AND** the manifest and the lockfile say `1.1.0`
- **AND** the CHANGELOG reads `## Unreleased`, an empty line, `## 1.1.0 — 2026-10-01`, then the two entries
- **AND WHEN** the maintainer runs `npm run version:check`
- **THEN** the output is `mermaid-animator 1.1.0; Unreleased: no entries (no release pending)` and the exit status is `0`
