# Design: M0 — Foundations

## Context

Greenfield repository: it contains only the product specification (`vscode-extension-specification.md` v1.1), its review, and OpenSpec. Motivation is in `proposal.md`; behaviour is in `specs/`. The product specification fixes the architecture (§13.2 process model, ADR-003/004) — this document records how M0 realises it.

Constraints: Node 24 / npm 11 available locally, no pnpm; VS Code 1.139 locally while the declared minimum is 1.95; the extension must run in the web extension host (vscode.dev) later, so host code cannot use Node built-ins outside a clearly separated Node entry.

## Goals / Non-Goals

**Goals:**
- A repository where `npm install && npm run build && npm test` produces bundles and runs all tests on Windows, macOS and Linux.
- One source tree compiled to three bundles: host (Node), host (browser), webview.
- A protocol and theming layer that M1 builds on without restructuring.

**Non-Goals:**
- Diagram parsing, layout or animation (M1).
- Markdown discovery, CodeLens, exports (M1+).
- Running `@vscode/test-web` locally; the web bundle is verified by a browser-platform build and a Node-built-in scan. Web-host smoke tests join CI when the project has a hosted pipeline.

## Decisions

### D1. npm workspaces, packages as TypeScript sources
Packages under `packages/*` expose TypeScript entry points directly (`"exports": "./src/index.ts"`); esbuild bundles across package boundaries and Vitest resolves the same sources. *Alternative:* per-package `tsc` builds with project references — rejected for M0 because it doubles build steps and adds declaration-emit ordering without benefit while every consumer is bundled. Type checking runs once from the root `tsconfig.json` over all packages (`tsc --noEmit`).

### D2. esbuild with one build script
`scripts/build.mjs` produces:
- `packages/extension/dist/extension.node.js` — `platform: node`, `format: cjs`, external `vscode`.
- `packages/extension/dist/extension.web.js` — `platform: browser`, `format: cjs`, external `vscode`; a plugin fails the build on any Node built-in import.
- `packages/extension/dist/webview/` — `platform: browser`, `format: esm`, `splitting: true` (so M1 can lazy-load Mermaid), CSS and font assets copied beside it.
*Alternative:* webpack/Vite — heavier configuration for no gain at this size.

### D3. The extension package is the VSIX root
`packages/extension/package.json` is the extension manifest; everything the VSIX needs is bundled into its `dist/` and `media/`, so packaging uses `vsce package --no-dependencies`. The root `package.json` is private and only orchestrates.

### D4. Webview UI: Preact + signals, own components
Preact (~4 KB) with `@preact/signals` for state. VS Code's Webview UI Toolkit is deprecated (ADR-003), so controls are hand-built on VS Code CSS variables and `@vscode/codicons`. JSX via esbuild's automatic runtime (`jsxImportSource: preact`).

### D5. Protocol as a shared package with hand-written validators
`packages/protocol` exports discriminated-union types plus a small `validateHostMessage` / `validateWebviewMessage` pair. *Alternative:* zod — rejected to keep the webview's initial bundle within budget (NFR-PERF-11); the protocol is small enough for explicit guards, and unit tests cover every message type.

### D6. HTML generation and CSP
The host builds the webview HTML from a template with a fresh 128-bit nonce from `crypto.getRandomValues` (available in both Node ≥ 20 and browsers — no `crypto` module import). CSP per `specs/webview-security` and product spec §18. `localResourceRoots` = `[dist, media]`. `retainContextWhenHidden` is not used; UI state goes through `vscode.setState`.

### D7. Theme resolution split between host and webview
The host reports `themeKind` (`light | dark | highContrast | highContrastLight`) from `window.activeColorTheme` plus the configured mode; the webview resolves the effective palette with a pure function in `packages/renderer/src/theme.ts` and sets `data-palette` on the root element. Tokens live in one CSS file (`tokens.css`) keyed by `[data-palette=…]`, mirrored as a TypeScript table used by the contrast unit test, which fails the build if any text token drops below 4.5:1.

### D8. Reduced motion
Host resolves `workbench.reduceMotion`: `on` → true, `off` → false, `auto` → deferred to the webview's `matchMedia('(prefers-reduced-motion: reduce)')`. Exposed as a signal in the webview.

### D9. Panel restoration
A `WebviewPanelSerializer` for view type `mermaidAnimator.panel`; the webview persists `{ uri }` through `vscode.setState`, which VS Code hands back to the serializer on reload.

### D10. Tests
Vitest for pure code (protocol validators, theme resolution, contrast, CSP builder). `@vscode/test-electron` + Mocha for integration (language registration, open command, panel reuse, unsaved-text delivery). ESLint flat config with typescript-eslint and `no-restricted-imports` forbidding `vscode`, Node built-ins and DOM-only modules in `packages/core`.

## Risks / Trade-offs

- [ESM chunks served from the webview resource origin may be refused as cross-origin modules] → M0 ships the webview entry as a module script and verifies it loads in a real VS Code window during the integration test; fallback is an IIFE build with dynamic `<script>` injection.
- [`@vscode/test-electron` downloads a VS Code build (~150 MB) on first run] → cached in `.vscode-test/`, git-ignored; CI caches it.
- [Declared minimum 1.95 but tested on current stable] → `@types/vscode` pinned to 1.95 so newer APIs fail type checking.
- [Fonts add ~500 KB to the VSIX] → Latin subsets of the variable WOFF2 files only.
