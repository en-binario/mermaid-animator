# Proposal: M0 — Foundations

## Why

The specification (`vscode-extension-specification.md` v1.1, §23 M0) needs a working skeleton before any animation work can start: every later milestone depends on a buildable monorepo, a secure webview that can talk to the extension host through a typed protocol, and the "Ink & Ivory" theme tokens. Building these first isolates platform risk (CSP, web-host compatibility, panel restoration) from product risk.

## What Changes

- Create the npm-workspaces monorepo (`packages/core`, `protocol`, `renderer`, `webview`, `extension`) with strict TypeScript, esbuild bundles for the Node host, the web host and the webview, Vitest, ESLint (with the rule that `core` imports no DOM/Node/vscode APIs), and a GitHub Actions workflow.
- Ship an extension skeleton that registers the `mermaid` language for `.mmd` / `.mermaid`, contributes *Open Animated Preview* and *Open Animated Preview to the Side*, and opens an animator panel for the active Mermaid file.
- Render a webview shell (toolbar, canvas, transport placeholders) under a strict nonce-based Content Security Policy with no network access, loading only bundled assets.
- Define the versioned host ↔ webview message protocol (`init`, `document/load`, `document/update`, `settings/changed`, `ready`, `state/changed`, `log`) with runtime validation.
- Implement the Ink & Ivory palettes (Ivory, Graphite, both high-contrast variants), automatic selection from the VS Code theme kind with live switching, bundled Inter / Source Serif 4 fonts, and propagation of the reduced-motion preference.
- Restore open animator panels after a window reload.

## Capabilities

### New Capabilities

- `animator-panel`: Opening, titling, reusing and restoring the animator panel for Mermaid files; `mermaid` language registration; desktop and web host support.
- `webview-security`: Content Security Policy, resource-root restrictions and the no-network guarantee for the animator webview.
- `host-webview-protocol`: The versioned, validated message contract between the extension host and the webview, including the ready handshake and live document/settings updates.
- `visual-theme`: Ink & Ivory colour tokens, theme-mode selection and live switching, high-contrast adaptation, bundled typography and reduced-motion propagation.

### Modified Capabilities

(none — no specs exist yet)

## Impact

- New code: all packages under `packages/`, build scripts under `scripts/`, CI under `.github/workflows/`.
- New dev dependencies: TypeScript, esbuild, Vitest, ESLint + typescript-eslint, `@types/vscode` (1.95), `@vscode/test-electron`, `@vscode/vsce`. Runtime (bundled) dependencies: `preact`, `@preact/signals`, `@vscode/codicons`, `@fontsource-variable/inter`, `@fontsource-variable/source-serif-4`.
- No user-visible animation yet; the panel shows the diagram's identity and line count only.
