# Tasks

## 1. Diagram discovery (core + host)

- [x] 1.1 Implement the fence locator and diagram-type detector in `core` (backtick/tilde fences, info strings, unterminated fences, front matter, directives, comments); verify Vitest cases for every rule in `specs/diagram-discovery` and the type list in `specs/sequence-parsing`
- [x] 1.2 Implement diagram binding (match by `@id`, similarity ≥ 50%, index) in `core`; verify unit tests for moved, edited and deleted diagrams
- [ ] 1.3 Add CodeLens, context keys, *Animate Diagram at Cursor*, *Animate All Diagrams in File*, Explorer menu with quick pick, and widen open commands/title action to Markdown/MDX; key panels per diagram with `▶ <title> · n` titles; verify integration tests for CodeLens presence, markdown open and panel reuse

## 2. Sequence parsing and annotations (core)

- [x] 2.1 Implement the statement splitter and label decoding (entities, `<br>`, wrap prefixes, `#` comments); verify unit tests
- [x] 2.2 Implement the sequence parser for all statement forms with source ranges, block stack, implicit participants and error recovery; verify unit tests per statement form and for unclosed/stray blocks
- [x] 2.3 Implement front matter / `%%{init}%%` / title extraction; verify unit tests
- [x] 2.4 Implement the annotation grammar, scoping, validation diagnostics with suggestions; verify unit tests including `@pasue` → `@pause`
- [x] 2.5 Build the conformance corpus (≥ 40 valid and ≥ 10 invalid fixtures) and the differential test against Mermaid 12 under jsdom; verify 100% acceptance agreement
- [x] 2.6 Add the 1,000-line parse performance test; verify median < 30 ms

## 3. Step compilation and timeline (core)

- [x] 3.1 Implement step compilation with activation/create/destroy merge rules, fragment handling for M1, fragment paths and annotation effects; verify unit tests for each rule in `specs/step-compilation` and `specs/animation-annotations`
- [x] 3.2 Implement stable identities (FNV-1a 64, structural and content IDs, `@step-id`); verify property-style tests: unrelated insertion keeps IDs, label edit keeps `structuralId`
- [x] 3.3 Implement timing (`travel(Δcol)`, adaptive dwell, overrides) and the timeline (`stepStarts`, `positionAt`); verify unit tests including the 315 ms / 710 ms example
- [x] 3.4 Implement position resolution (step-id → id → structuralId → cursor → nearest preceding); verify unit tests

## 4. Layout and rendering (core + renderer)

- [ ] 4.1 Implement the deterministic sequence layout with injected measurement and export padding; verify unit tests for column widths, rows, activations, fragments and determinism
- [ ] 4.2 Implement the scene function (step states, choreography windows, display options, motion profiles, reduced motion); verify unit tests at chosen times (mid-transition half-drawn arrow, label hidden, seek-vs-play equality)
- [ ] 4.3 Implement the SVG renderer (shape language for all elements and arrow kinds, diffed attribute writes, tooltips data, accessible label); verify visually in the harness with the fixture gallery in Ivory, Graphite and HC

## 5. Playback, camera and accessibility (webview)

- [ ] 5.1 Implement the Player (rAF clock, play/pause/step/reverse, speed, loop, seek, snap) and wire it to the renderer; verify unit tests with a fake clock
- [ ] 5.2 Build the transport UI (buttons, scrubber with hover label, counter, go-to-step, speed popover, loop) and keyboard shortcuts with the `?` overlay; verify in the harness by keyboard only
- [ ] 5.3 Implement the camera (d3-zoom gestures and limits, Auto/Fit/Follow/Manual, interpolateZoom tween, 1.6× cap, resume chip, fit/frame); verify unit tests for the follow decision and manual checks in the harness
- [ ] 5.4 Implement pause-on-hidden and pause-on-hover; live-region announcements and accessible names; verify unit test for announcement text and a keyboard walkthrough in the harness

## 6. Source sync (host + webview)

- [ ] 6.1 Implement live reload with debounce and position preservation end to end; verify integration test editing a label keeps the step
- [ ] 6.2 Implement last-known-good rendering with the error banner and *Reveal in source*; verify in the harness with an invalid fixture
- [ ] 6.3 Publish Problems-panel diagnostics for bound diagrams; verify integration test that an error appears and clears
- [ ] 6.4 Implement current-step editor decorations, `editor/cursor`, reveal source and `Alt`+double-click; verify integration test for decoration ranges

## 7. Static export (webview + host)

- [ ] 7.1 Implement SVG export (resolved colours, embedded fonts, `textLength`, export padding) and PNG export (1×/2×/3×, background choice); verify unit test on the serialised SVG (no scripts or external URLs) and a harness export check of PNG dimensions
- [ ] 7.2 Implement copy image with fallback, the export quick pick, save dialog, `export/ack` and open/reveal actions; verify integration test that an export writes a file

## 8. Generic fallback (webview)

- [ ] 8.1 Add lazy Mermaid rendering with strict security, constructed stylesheets and the CSP change; update spec §18; verify in the harness that a flowchart renders under the production CSP with no blocked-style regressions
- [ ] 8.2 Implement group discovery, ordering and reveal steps with shared transport/camera/export; verify unit test for ordering on a synthetic group list and harness checks for flowchart, pie and state diagrams
- [ ] 8.3 Route sequence diagrams rejected natively but accepted by Mermaid to the fallback; verify a unit test of the routing decision

## 9. Localisation, settings and documentation

- [ ] 9.1 Add English/Spanish bundles for host, manifest and webview strings and the key-parity test; verify it passes
- [ ] 9.2 Contribute the M1 settings (`codeLens.enabled`, `liveReload.*`, `sync.stepToEditor`, `playback.*`, `scrubber.snap`, `display.*`, `motion.*`, `camera.mode`) and apply live changes; verify integration test toggling `codeLens.enabled`
- [ ] 9.3 Update README with usage, shortcuts and settings; verify each documented command exists in the manifest

## 10. Integration checks

- [ ] 10.1 Run lint, typecheck, unit, conformance, performance and integration suites; verify all pass
- [ ] 10.2 Package the VSIX and smoke-test it in VS Code (open a Markdown diagram, play, step, edit live, export PNG); verify the checklist in the README release section
