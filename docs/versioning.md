# Versioning

> **Applies to:** the version of the published extension, `packages/extension/package.json` `version`
> **Enforced by:** `npm run version:check`, which `npm test` runs (spec `release-versioning`), and review (§6)
> **Tooling:** [`scripts/version.mjs`](../scripts/version.mjs) through `npm run version:check` and `npm run version:bump`

Mermaid Animator follows [Semantic Versioning](https://semver.org/). Users read the version number as a promise.
A **major** release warns that settings, keybindings, diagram annotations, sidecar files or links they rely on may
stop working. A **minor** release adds or changes things without breaking them. A **patch** release only fixes.

The level of a release is not chosen by hand. It follows from the kinds of the entries under `## Unreleased` in
[`packages/extension/CHANGELOG.md`](../packages/extension/CHANGELOG.md).

The private workspace packages (`core`, `protocol`, `renderer`, `webview`) are never published and keep their
versions. The sidecar format version (`"version": 1`) is separate and is owned by the `sidecar-files` spec.

## 1. The public surface

A change is breaking only if it affects something users depend on. That is the extension's public surface:

- command ids (`mermaidAnimator.*`);
- setting keys and their accepted values;
- default keybindings;
- `@animator` annotations and their arguments;
- the sidecar file format (`<file>.animator.json`);
- `vscode://` deep links, and step and chapter links in exported HTML players;
- export formats;
- the minimum VS Code version (`engines.vscode`).

Anything else is internal: the webview's DOM, the host ↔ webview protocol, file layout, workspace packages, and
visual details not named above. A visible change to the internals is still a `Changed` entry (§2, R6), but it is
never breaking.

## 2. Classifying a change

Every change with a user-observable effect adds one entry under `## Unreleased`, with the kind from this table:

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

Notes on the harder cases:

- **A new default is `Changed`, not `Breaking`.** Users who set the old value keep it, and nothing stops working.
- **Removing a keybinding is `Changed`.** Users can bind the command again. Removing the *command* is `Removed`.
- **Raising `engines.vscode` is `Changed`.** The Marketplace keeps serving the last compatible version to older
  VS Code installs, so nobody loses a working extension.
- **Prefer deprecating to removing.** Ship a `Deprecated` entry in a minor release while the old key still works.
  Then remove it in the next major release with a `Removed` entry.
- **A fix that changes the public surface is not only a fix.** If a bug fix requires renaming a setting, record it as
  `Removed` (the old key) plus `Added` (the new one).

## 3. Writing an entry

Each entry is a top-level bullet (`- ` in column 1) whose first word is its kind in bold. Inside the bold span, the
kind is followed by `:`, `.`, or ` — ` and a short title:

```markdown
## Unreleased

- **Added — zoom controls.** The toolbar has zoom out / zoom in buttons and the current zoom as a percentage.
- **Changed:** `mermaidAnimator.display.arrowEndNames` now defaults to `auto`.
- **Fixed:** step bounds of Mermaid-rendered diagrams no longer depend on where the camera was.
- **Removed:** the `@animator old=` argument. Migrate: write `@animator new=` instead.
```

The last line is illustrative; `old=` and `new=` are placeholders.

- The kinds are `Breaking`, `Removed`, `Added`, `Changed`, `Deprecated`, `Fixed` and `Security`. They are
  case-sensitive.
- Indented lines continue the entry above them.
- Write for users, not for reviewers. Name the setting, command or annotation, and what they will notice.
- A `Breaking` or `Removed` entry tells users what to do instead (`Migrate: …`).
- Past release sections are history and are not rewritten.

## 4. The release level

The release takes the highest level among the Unreleased entries:

| Kinds under `## Unreleased` | Level | From `1.2.3` |
| :--- | :--- | :--- |
| None | No release pending | — |
| Any `Breaking` or `Removed` | major | `2.0.0` |
| Otherwise, any `Added`, `Changed` or `Deprecated` | minor | `1.3.0` |
| Only `Fixed` and `Security` | patch | `1.2.4` |

`--level major|minor|patch` raises the level. For example, a maintainer might want a minor release for a set of
fixes large enough to deserve one. The level can never be lowered: the script refuses a level below the one the
entries require.

## 5. Releasing

1. Run `npm run version:check`. It prints the pending release, for example
   `mermaid-animator 1.0.0; Unreleased: 9 entries → minor (next 1.1.0)`, or lists everything that is wrong. It checks
   that every entry has a known kind, and that the manifest, `package-lock.json` and the latest release heading in the
   CHANGELOG all have the same version.
2. Run `npm run version:bump`. Add `-- --level <level>` to raise the level, or `-- --date YYYY-MM-DD` to date the
   release other than today. The script writes the new version to `packages/extension/package.json` and
   `package-lock.json`, turns `## Unreleased` into `## <version> — <date>`, and opens a new, empty `## Unreleased`.
   It changes nothing else, and it changes nothing at all when a check fails.
3. Review the diff, then run the two commands it prints:
   `git commit -am "chore(release): <version>" && git tag v<version>`.
4. Package and publish from the tagged commit (`npm run package`). Publishing is a manual step.

## 6. Review checklist

| Check | What to look for |
|---|---|
| Entry present | The change has a user-observable effect, and it adds an entry under `## Unreleased` (R11 is the only exception) |
| Kind | The entry's kind matches its row in §2. In particular, a removal is not filed as `Changed` |
| Migration | A `Breaking` or `Removed` entry says what users do instead |
| No manual bump | The change does not edit the `version` in the manifest or the lockfile; only `npm run version:bump` does |

## Decision log

- 2026-09-27: Adopted with the `add-release-versioning` change. CHANGELOG entry kinds drive the level, rather than
  Conventional Commits (which describe code, not user impact) or Changesets (which adds a dependency and a second
  place to describe each change). The kinds are Keep a Changelog's plus `Breaking`. Raising `engines.vscode` is minor.
