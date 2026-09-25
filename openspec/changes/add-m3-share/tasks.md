# Tasks

## 1. Canvas render backend (renderer)

- [ ] 1.1 Implement the Canvas 2D backend for sequence scenes (shapes, text, pulses, fragments, activations) with a resolved palette; verify a harness pixel comparison against the SVG renderer on the demo fixtures within tolerance
- [ ] 1.2 Extend the Canvas backend to topology scenes; verify the same comparison for the topology view
- [ ] 1.3 Register fonts in workers from embedded font data; verify text metrics match the main thread in a harness check

## 2. Render-and-encode worker (webview)

- [ ] 2.1 Build the export worker entry and start it through the blob shim; implement the frame loop with frame-exact times, progress and cancel; verify a unit test of the frame-time function (345 frames for 10 s at 30 fps + 1.5 s hold) and a harness check that worker frame 90 equals the scene at 3.0 s
- [ ] 2.2 Add GIF encoding with `gifenc` (sampled palette, dithering option, loop count, transparency); verify a harness export whose GIF header reports the expected size, frame count and loop
- [ ] 2.3 Add WebM (VP9/VP8) and conditional MP4 (H.264) with `mediabunny`; verify a harness export playable in a `<video>` element and that MP4 is disabled when unsupported
- [ ] 2.4 Add main-thread frame production for generic diagrams feeding the same encoder; verify a flowchart GIF export in the harness
- [ ] 2.5 Measure NFR-PERF-12 and NFR-PERF-13 on the demo fixtures and record results in the design notes

## 3. Animated SVG (renderer)

- [ ] 3.1 Implement the keyframe compiler (merged stops, easing segments, drawing via `pathLength`, pulse samples, loop count) with a GitHub-safe palette; verify unit tests that the output has no script/handlers/external URLs and that palette contrast is ≥ 4.5:1 on `#ffffff` and `#0d1117`
- [ ] 3.2 Add the reduced-motion final-frame block, the light/dark pair, `svgAdaptiveTheme` and the 1 MB warning; verify a unit test for the pair names and a manual check rendering the SVG as an `<img>` in a browser

## 4. HTML player

- [ ] 4.1 Add the `player` bundle entry (core, renderer, transport, keyboard, captions, chapters, views, `#step=`/`#chapter=`); verify a harness page that loads the bundle with fixture data
- [ ] 4.2 Assemble the self-contained HTML in the host with its own CSP (hashes) and inline fonts; verify an integration test that the written file contains no external URLs and a manual offline browser check
- [ ] 4.3 Support generic diagrams in the player (pre-rendered SVG + reveal order); verify a flowchart player in the browser

## 5. Export sheet (webview + host)

- [ ] 5.1 Build the export sheet (all options, disabled irrelevant options, preview, estimates, settings defaults) replacing the M1 quick pick for *Export…*; verify harness checks for estimates and disabled options
- [ ] 5.2 Wire progress and cancellation to a VS Code progress notification (`export/progress`, `export/cancel`, `export/cancelled`); verify an integration test that cancelling writes nothing
- [ ] 5.3 Implement *Insert below diagram* (image reference or `<picture>` for pairs) after exports from Markdown; verify an integration test that the reference is inserted after the closing fence

## 6. Deep links

- [ ] 6.1 Implement *Copy Link to Current Step* and the URI handler (path resolution, diagram key, step id with fallback, not-found message); verify integration tests for link format and for opening a link

## 7. Sidecar files (host + webview)

- [ ] 7.1 Add `schemas/animator.schema.json` with `jsonValidation`; verify an integration test that an invalid value is diagnosed
- [ ] 7.2 Implement reading (JSONC, precedence, live updates, step-key resolution in the webview, dangling-key diagnostics); verify unit tests for resolution and an integration test that a sidecar caption appears
- [ ] 7.3 Implement *Save Topology Layout* and *Save Current Settings as Diagram Defaults* with formatting-preserving edits, workspace-state migration and untrusted-workspace gating; verify integration tests for both commands

## 8. Mermaid Diagrams view and walkthrough (host)

- [ ] 8.1 Implement the diagrams index and tree (batches, cap, progress, watcher, filters, actions, type icons); verify integration tests for listing and for a newly saved file appearing
- [ ] 8.2 Add the walkthrough with English and Spanish content and the sample-opening action; verify an integration test that the step command opens the sample

## 9. Settings, localisation, docs and release

- [ ] 9.1 Contribute the export and diagrams-view settings and new commands with English/Spanish strings; verify the localisation parity test
- [ ] 9.2 Extend `ThirdPartyNotices.txt` (gifenc, Mediabunny) and generate a CycloneDX SBOM; verify both are produced by `npm run package`
- [ ] 9.3 Update the README, CHANGELOG (1.0.0) and the product specification where the implementation differs; verify documented commands exist in the manifest

## 10. Integration checks

- [ ] 10.1 Run lint, typecheck, unit, conformance and integration suites (development and production builds); verify all pass
- [ ] 10.2 Package version 1.0.0 and run the README release checklist extended with GIF, WebM, animated SVG (viewed as an image), HTML player (offline) and a deep link; verify every item
