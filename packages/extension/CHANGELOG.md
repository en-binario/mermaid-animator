# Changelog

## Unreleased

- **Added — overview at step 0.** Before the first step the panel shows the complete diagram, framed to fit; the first step clears it and the step-by-step reveal starts. Applies to sequence, topology and Mermaid-rendered diagrams, and to GIF, video, animated SVG and HTML player exports. Set `mermaidAnimator.playback.initialOverview` to `false` (or `%% @animator overview=false`) for the previous behaviour.
- **Added — bold and italic labels.** `<b>`, `<strong>`, `<i>` and `<em>` in labels now render as formatting instead of literal tags, in every diagram type and export; tag-only lines no longer appear in flowchart nodes.
- **Added — settings button.** A gear button in the panel toolbar and the command *Mermaid Animator: Open Settings* (also in the Mermaid Diagrams view) open the Settings editor filtered to this extension.
- **Added — zoom controls.** The toolbar has zoom out / zoom in buttons and the current zoom as a percentage, which opens presets from 25 % to 400 % and *Fit*.
- **Changed — camera following.** Panning, scrolling or zooming no longer turns *Camera follows playback* off, and the *Resume following* chip is gone. A camera move during playback pauses it; when playback continues the camera returns to the current step at your zoom level. Turn following off with the eye button or `C`.
- **Changed:** `mermaidAnimator.display.arrowEndNames` now defaults to `auto`: the ends of the playing arrow are labelled with the sender and receiver names when their headers are out of view.

## 1.0.0 — 2026-09-26

- **M3 — Share.** Export sheet with live preview and size estimates; animated GIF, WebM and MP4 (where H.264 is available) rendered and encoded in a background worker with progress and cancel; animated SVG that plays as an image, with a GitHub light + dark pair; self-contained offline HTML player with step and chapter links; *Insert below diagram* for Markdown; *Copy Link to Current Step* and `vscode://` deep links; sidecar files (`<file>.animator.json`) with a JSON schema, live updates, dangling-reference warnings, *Save Topology Layout* and *Save Current Settings as Diagram Defaults*; the *Mermaid Diagrams* Explorer view; the *Get started* walkthrough; `export.*`, `diagramsView.*` and `files.include` settings; CycloneDX SBOM.
- **Fixed:** the topology layout and export workers now start inside VS Code webviews (workers run from embedded source instead of loading extension files).

## 0.1.0 — Unreleased

- **M2b — Topology.** Topology view (typed nodes, clusters, aggregated edges with badges and weighted widths, return lanes, loop arcs, pulses and activity rings) with `layered` (ELK in a worker), deterministic `force` and `manual` layouts; Sequence ↔ Topology morph; split view with cross-highlighting; minimap; edge message lists; manual layouts remembered per diagram; third-party notices.
- **M2a — Narrative & present.** Loop iterations with counters, branch choices (`first` / `all` / `ask`, inspector chips, `@branch`), concurrent `par` lanes; captions and chapters; inspector; participant focus and focused playback; search; A–B loop; Cinematic camera with `@focus`; presentation mode with title and chapter cards, clicker keys, blank screen and laser pointer; transcript view; editor cursor → step; annotation completions, hovers, quick fixes, *Insert Annotation…* and highlighting.
- **M1 — Sequence MVP.** Native Mermaid 12 sequence-diagram parser (100% agreement with Mermaid on the conformance corpus), animated playback with transport, scrubber, speed, loop and keyboard shortcuts; Fit / Follow / Manual camera; CodeLens and Explorer entry points for Markdown and Mermaid files; live reload that keeps your place; last-known-good rendering with Problems diagnostics; current-step highlighting in the source; SVG / PNG export and copy image; generic animation for every other Mermaid diagram type; annotations; English and Spanish.
- **M0 — Foundations.** Animator panel, Ink & Ivory themes, secure webview, restored panels.
