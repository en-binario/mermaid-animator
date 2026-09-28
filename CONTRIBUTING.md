# Contributing

## Workflow: OpenSpec

Work is planned and delivered as [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes (spec §23.1).

1. **Propose** — `openspec new change <id>` (or `/opsx:propose` in Claude Code), then write `proposal.md`, the capability spec deltas under `specs/`, `design.md` and `tasks.md`. Write the deltas by [docs/spec-writing.md](docs/spec-writing.md): decision tables when an outcome depends on two or more conditions, checkable outcomes, one test case per table row.
2. **Validate** — `openspec validate <id> --strict` must pass before implementation starts.
3. **Apply** — implement the tasks in order (`/opsx:apply`), ticking each checkbox in `tasks.md` only when its stated verification passes.
4. **Archive** — `openspec archive <id> --yes` merges the requirement deltas into `openspec/specs/` and moves the change to `openspec/changes/archive/`.

Keep `vscode-extension-specification.md` in step: if implementation reveals that the product specification is wrong or incomplete, update it in the same change and say so in the change's design notes.

## Checks

Every change must pass:

```sh
npm run check             # lint, type-check, unit tests
npm run build
npm run test:integration
```

Architecture rules enforced by lint: `packages/core` imports nothing from VS Code, Node.js or DOM-oriented packages. The web-host bundle fails to build if it imports a Node.js built-in.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/) style subjects (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `chore:`).
- One logical change per commit; reference the OpenSpec change id in the body when relevant.

## Versioning

The extension follows Semantic Versioning, and the release level comes from the CHANGELOG. The rules are in [docs/versioning.md](docs/versioning.md).

- Every change with a user-observable effect adds one entry under `## Unreleased` in [packages/extension/CHANGELOG.md](packages/extension/CHANGELOG.md), starting with its kind in bold: `Breaking`, `Removed`, `Added`, `Changed`, `Deprecated`, `Fixed` or `Security` (for example `- **Fixed:** …`). A `Breaking` or `Removed` entry says what users do instead.
- `npm run version:check` validates the entries, checks that the manifest, the lockfile and the CHANGELOG agree on the version, and prints the pending release. `npm test` runs it too.
- Never edit the extension's `version` by hand; `npm run version:bump` applies a release.

## Design

Visual work follows the Ink & Ivory design system (spec §9): colours only from tokens, hairline strokes, no overshoot in the Formal motion profile, and the design QA checklist in §9.11.
