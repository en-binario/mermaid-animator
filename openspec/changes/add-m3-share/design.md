# Design: M3 — Share (1.0)

## Context

Follows M2a and M2b. Relevant current state:

- Scenes are renderer-independent (`sceneAt`, and after M2b `topologySceneAt`); the SVG renderers are the only drawing backends. Static export (`packages/webview/src/export.ts`) clones the live SVG, resolves token colours to attributes, embeds Inter as data URIs (esbuild `dataurl` loader) and rasterises single frames on the main thread.
- The host writes exports through `export/data` chunks, a save dialog (overridable in tests through the API) and `workspace.fs`.
- Workers must use the blob shim (ADR-013); the CSP allows `worker-src blob:` and `importScripts` from the resource origin.
- M2b stores manual layouts in `workspaceState`.
- Product decisions already taken: ADR-008 (offline, frame-exact export), ADR-010 (Canvas 2D backend in the encoder worker), §14.4 (GitHub-safe animated SVG, light/dark pair, `textLength`).

Motivation: `proposal.md`. Behaviour: `specs/`.

## Goals / Non-Goals

**Goals:** one frame-exact rendering path for every animated format; exports independent of live playback; sidecars that never surprise (explicit writes, dangling references reported); a 1.0-quality package.

**Non-Goals:** APNG/WebP, PNG sequences, CLI, ffmpeg transcoding, scrollytelling player layout (P2).

## Decisions

### D1. Canvas 2D backend shared by worker and player
`renderer/src/canvas.ts` draws a sequence or topology scene onto any `CanvasRenderingContext2D`-compatible context (including `OffscreenCanvasRenderingContext2D`), using resolved colour values (a palette object, not CSS variables), the same geometry helpers (`partialPath`, `pointAlong`) and the layout objects. Fonts are registered in the worker with `self.fonts.add(new FontFace(family, buffer))` from the embedded font data. A unit test renders selected frames with both backends in the harness and compares pixels within a small tolerance (anti-aliasing differs slightly), and compares worker frame `n` with the main-thread canvas render at the same time exactly.

### D2. Render-and-encode worker
`webview/src/workers/export.worker.ts` receives `{ kind, layout(s), steps/timeline, display, palette, fonts, options }`, loops `n = 0 … frames` computing `t = start + n × 1000 / fps × speed`, draws with D1 on an `OffscreenCanvas`, and encodes:
- **GIF:** `gifenc` — a global palette quantised from a sample of frames (every k-th frame), optional dithering, loop count per option, transparency via a reserved index.
- **WebM / MP4:** WebCodecs `VideoEncoder` (`vp09.00.10.08`, fallback `vp8`; `avc1.640028` for MP4, offered only if `VideoEncoder.isConfigSupported` resolves true) muxed with `mediabunny`.
Progress messages every 10 frames; `cancel` stops the loop and closes the encoder. Output bytes are transferred to the main thread and sent to the host in 8 MB `export/data` chunks.

### D3. Generic diagrams render on the main thread
Mermaid's drawing cannot be reproduced in a worker. For generic diagrams the exporter serialises the Mermaid SVG once, then per frame applies the group opacities/dash offsets for `t` to a detached clone, rasterises through `Image` on an `OffscreenCanvas`-backed main-thread canvas, and passes `ImageBitmap`s to the same encoder worker. Slower, but the rule "frame n = time t" is identical.

### D4. Animated SVG compiler
`renderer/src/animatedSvg.ts` walks the timeline and, per element, collects keyframes of the properties the scene animates (opacity, transform, `stroke-dashoffset` with `pathLength="1"` normalisation for drawing), merges consecutive equal values, and emits one `@keyframes` rule per element with percentage stops over the loop duration, easing via per-segment `animation-timing-function` (cubic-bezier of the easing tokens). Pulses become keyframed `transform: translate()` samples (12 per message). The document carries the GitHub-safe palette (transparent background; strokes and text chosen for ≥ 4.5:1 on `#ffffff` and `#0d1117`, verified by the existing contrast utility in a unit test), the 8% width buffer and `textLength` from static export, and a `prefers-reduced-motion` block that pins every element to its final state. Light/dark pairs run the compiler twice with the Ivory and Graphite palettes.

### D5. HTML player as a separate bundle assembled by the host
`scripts/build.mjs` gains a `player` entry (core + renderer + a small Preact-free transport UI) emitted as `dist/player/player.js` and `player.css`. The webview sends `export/player` with the diagram data; the host reads the bundle, CSS and font files from `dist` (the webview cannot fetch them under `connect-src 'none'`), inlines them with the JSON data into an HTML template with its own strict CSP (`default-src 'none'`, hashes for the inline script and style), and writes the file. Generic diagrams embed the pre-rendered Mermaid SVG and the group order, and the player applies the same reveal.

### D6. Export sheet
`ExportSheet.tsx` (right-side sheet, 360 px, spec §9.9) holds the options state, shows a live preview by running a second, small scene render at the preview's own time, and computes estimates: duration from the range and options; size from bitrate × duration for video, a sampled-frame encode × frames for GIF, and serialised length for SVG/HTML. The palette/CodeLens *Export…* command opens the sheet instead of the M1 quick pick; *Copy image* stays one click.

### D7. Deep links
`copyStepLink` builds the URI from the panel's document (workspace-relative path), diagram key and current step id; `vscode.env.uriScheme` picks `vscode` or `vscode-insiders`. A `UriHandler` parses `open?path&diagram&step`, resolves the path against each workspace folder, opens the panel (existing `openDiagram`) and sends `command goToStepId`, resolved in the webview with the existing identity fallback.

### D8. Sidecar service
`extension/src/sidecar.ts` finds `<file>.animator.json`, parses it with a JSONC parser (comments allowed), validates against `schemas/animator.schema.json`, and exposes the entry for a diagram key; it watches the file and pushes `document/update` with the new entry. Resolution of step keys happens in the webview (it owns the step list) and unresolved keys are reported back so the host publishes diagnostics on the sidecar file. Writes use `jsonc-parser`'s `modify`/`applyEdits` to preserve formatting; saving a layout also deletes the M2b workspace-state entry. Writes are disabled when `vscode.workspace.isTrusted` is false (commands gated by `isWorkspaceTrusted`).

### D9. Diagrams view
`extension/src/diagramsView.ts`: a `TreeDataProvider` over an index built with `workspace.findFiles(include, exclude)` in batches of 50 with `setTimeout(0)` yields, capped at `diagramsView.maxFiles` (10,000); each file is read and scanned with the existing `locateDiagrams`. A `FileSystemWatcher` updates single entries. Type icons are 16 px SVGs in `media/types/`.

### D10. Walkthrough and release
`contributes.walkthroughs` with five steps and Markdown descriptions in `media/walkthrough/` (English and Spanish via `package.nls`); the sample opens through `workspace.openTextDocument({ language: 'mermaid', content })`. Version 1.0.0, `ThirdPartyNotices.txt` extended with gifenc and Mediabunny (MPL-2.0 notice and source link), and a CycloneDX SBOM generated with `npm sbom --sbom-format cyclonedx` into the release artefacts.

## Risks / Trade-offs

- [H.264 absent from VS Code's Chromium build on some platforms] → MP4 disabled with an explanation (spec); WebM is always available.
- [Canvas and SVG backends drift visually] → pixel-comparison tests on the fixture gallery; both backends share geometry and palette code.
- [Animated SVG size for long diagrams] → merged keyframes and a 1 MB warning with a GIF suggestion.
- [GIF palette quality on gradients-free but anti-aliased art] → sampled global palette plus optional dithering; defaults tuned on the demo fixtures.
- [MPL-2.0 dependency] → used unmodified; licence notice and a link to the exact source version shipped.
- [Sidecar formatting churn] → edits through `jsonc-parser` keep comments and ordering.
