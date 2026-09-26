# Mermaid Animator

A VS Code extension that plays the Mermaid diagrams already in your repository as elegant, navigable animations.

- **Product specification:** [vscode-extension-specification.md](vscode-extension-specification.md) (v1.1) — the product-level source of truth.
- **Living requirements:** [`openspec/specs/`](openspec/specs/) — normative, testable requirements for what has been built.
- **Change proposals:** [`openspec/changes/`](openspec/changes/) — one per milestone (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Repository layout

| Path | Contents |
|---|---|
| `packages/core` | Pure TypeScript pipeline (parsing, steps, timeline, layout). No DOM, Node or VS Code imports. |
| `packages/protocol` | Versioned host ↔ webview message contract and validators. |
| `packages/renderer` | Ink & Ivory theme tokens, scene model and SVG renderer. |
| `packages/webview` | Preact application inside the animator webview, plus a browser harness. |
| `packages/extension` | The VS Code extension (manifest, host code, integration tests). |
| `scripts/` | Build, type-check, harness server and icon generator. |

## Development

Requires Node.js 22.12 or later.

```sh
npm install              # install all workspaces
npm run build            # bundles: host (Node), host (web), webview → packages/extension/dist
npm run check            # lint + type-check + unit tests
npm run test:integration # builds, downloads VS Code once into .vscode-test/, runs the Mocha suites
npm run package          # production build + mermaid-animator.vsix at the repository root
```

To try the extension, open this folder in VS Code and run the extension from `packages/extension` (Run → Start Debugging with an *Extension Development Host* configuration), or install the packaged VSIX:

```sh
code --install-extension mermaid-animator.vsix
```

### Webview harness

The webview can be developed in a normal browser with a mocked VS Code API:

```sh
npm run build
node scripts/serve-harness.mjs          # → http://localhost:5173/packages/webview/harness/
```

Query parameters: `theme=light|dark|highContrast|highContrastLight`, `mode=auto|ivory|graphite|highContrast`, `locale=en|es`, `reduce=1`, `chrome=0` (hide the harness controls), `fixture=<name>` (any file in `fixtures/demo/` or `valid/…`, `invalid/…` from the conformance corpus), and settings as `s.<key>=<value>` (e.g. `s.display.futureSteps=ghosted`, `s.playback.startAt=end`).

### Mermaid conformance

The native sequence parser is checked against Mermaid's own parser (run under jsdom):

```sh
node scripts/mermaid-probe.mjs fixtures/mermaid/sequence/valid   # ask Mermaid about any files
node scripts/gen-sequence-lexer.mjs                              # regenerate lexer rules after a Mermaid upgrade
```

`npm test` includes the differential corpus test (`packages/core/test/conformance.test.ts`).

### Sidecar schema

`packages/extension/schemas/animator.schema.json` is generated from the manifest's settings; run `node scripts/sidecar-schema.mjs` after adding or changing a per-diagram setting (a unit test fails while it is out of date).

### Integration tests

`npm run test:integration` runs every suite in a downloaded VS Code; `MOCHA_GREP="<pattern>" node packages/extension/test/runTests.mjs` runs matching tests only (after `npm run build`).

## Release checklist

1. `npm run check`, `npm run build`, `npm run test:integration` all pass (and again after `node scripts/build.mjs --production`).
2. `npm run package` produces `mermaid-animator.vsix`, `packages/extension/ThirdPartyNotices.txt` (including gifenc and Mediabunny) and the CycloneDX SBOM `mermaid-animator.cdx.json`.
3. Install it into a clean VS Code profile (for example `code --user-data-dir <tmp> --extensions-dir <tmp> --install-extension mermaid-animator.vsix`) and smoke-test: open a Markdown file with a sequence diagram → **▶ Animate**; play, step with `→`/`←`, scrub; edit a message label and confirm the playhead stays; introduce a syntax error and confirm the dimmed last-good drawing and the Problems entry; **Export…** → PNG 2×; open a flowchart and confirm the generic animation.
4. Share: export a **GIF** and a **WebM** and play both; export an **animated SVG** and view it as an image (`<img>` in a Markdown preview or a browser); export the **HTML player**, open it with the network disabled and step through it; **Copy Link to Current Step**, close the panel and open the link — the same step appears.
5. Update `packages/extension/CHANGELOG.md`.

## Licence

MIT. Bundled fonts (Inter, Source Serif 4) are under the SIL Open Font License 1.1; codicons under CC BY 4.0.
