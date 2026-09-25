# Tasks

## 1. Workspace scaffolding

- [ ] 1.1 Create the root `package.json` (private, npm workspaces `packages/*`, scripts `build`, `typecheck`, `lint`, `test`, `test:integration`, `package`), `tsconfig.base.json` (strict) and root `tsconfig.json`; verify `npm install` succeeds
- [ ] 1.2 Create package skeletons `core`, `protocol`, `renderer`, `webview`, `extension` with `package.json` and `src/index.ts`; verify `npm run typecheck` passes
- [ ] 1.3 Add ESLint flat config with typescript-eslint and the `core` import restriction; verify `npm run lint` passes and fails when `core` imports `vscode` (checked by a temporary edit)

## 2. Build pipeline

- [ ] 2.1 Write `scripts/build.mjs` producing the Node host, web host and webview bundles (with CSS/font/codicon assets); verify `npm run build` emits all three into `packages/extension/dist/`
- [ ] 2.2 Add the esbuild plugin that fails the web-host build on Node built-in imports; verify with a unit-style check that the web bundle contains no `require("fs")`-style references and that a deliberate `node:fs` import breaks the build

## 3. Protocol

- [ ] 3.1 Define host→webview and webview→host message types with protocol version 1 in `packages/protocol`; verify `npm run typecheck`
- [ ] 3.2 Implement validators that reject malformed or wrong-version messages; verify Vitest cases for every message type plus malformed inputs pass

## 4. Visual theme

- [ ] 4.1 Author `tokens.css` (Ivory, Graphite, Ivory HC, Graphite HC, spacing/radii/type/motion tokens) and the mirrored TypeScript token table in `packages/renderer`; verify the contrast test asserts ≥ 4.5:1 for all text tokens and passes
- [ ] 4.2 Implement `resolvePalette(mode, themeKind)` for `auto | ivory | graphite | highContrast`; verify unit tests for every combination
- [ ] 4.3 Bundle Inter and Source Serif 4 (Latin variable WOFF2) and codicons as webview assets with `@font-face` rules; verify the build output contains the font files and the CSS references them by relative URL

## 5. Extension host

- [ ] 5.1 Write the extension manifest: `mermaid` language for `.mmd`/`.mermaid`, commands, editor-title menu, palette `when` clauses, `theme.mode` setting, activation events, `engines.vscode ^1.95.0`, `browser` and `main` entries; verify `vsce ls` lists only bundled files
- [ ] 5.2 Implement the panel manager (create/reveal per URI, title `▶ <file>`, document change forwarding, dispose handling) and the ready handshake; verify with the integration tests in 5.5
- [ ] 5.3 Implement HTML generation with a fresh nonce and the CSP, and `localResourceRoots`; verify a unit test checks policy directives and nonce uniqueness
- [ ] 5.4 Implement theme-kind and reduced-motion resolution, `settings/changed` on theme or configuration change, the output channel for `log`, and the panel serializer; verify manually by switching themes in the Extension Development Host and by the reload integration test where feasible
- [ ] 5.5 Add `@vscode/test-electron` integration tests (language id for `.mmd`, open command creates one panel, re-run reveals it, unsaved edits are forwarded); verify `npm run test:integration` passes

## 6. Webview shell

- [ ] 6.1 Implement the webview bootstrap: `acquireVsCodeApi`, message validation, `ready`, `init` handling, signals for settings/theme/reduced motion, `setState` persistence, log forwarding; verify unit tests for the message reducer
- [ ] 6.2 Build the Preact shell (toolbar with file name, canvas placeholder showing line count, transport placeholder) styled with the tokens; verify visually in a browser harness page that mocks `acquireVsCodeApi` in Ivory and Graphite
- [ ] 6.3 Add the browser harness (`packages/webview/harness/index.html`) used for visual checks in later milestones; verify it loads the built bundle and switches palettes

## 7. Delivery hygiene

- [ ] 7.1 Add `.github/workflows/ci.yml` (matrix Windows/macOS/Ubuntu: install, lint, typecheck, unit tests, build, integration tests under xvfb on Linux, package VSIX artefact); verify the YAML parses and every referenced script exists
- [ ] 7.2 Write `README.md` (what it is, development commands) and `CONTRIBUTING.md` (OpenSpec workflow, commit conventions); verify each documented command runs as written
- [ ] 7.3 Package the extension with `npm run package`; verify a `.vsix` is produced and installs into VS Code with `code --install-extension`
