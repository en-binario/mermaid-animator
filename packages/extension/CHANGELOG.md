# Changelog

## 1.0.0 — 2026-09-26

- **M3 — Share.** Export sheet with live preview and size estimates; animated GIF, WebM and MP4 (where H.264 is available) rendered and encoded in a background worker with progress and cancel; animated SVG that plays as an image, with a GitHub light + dark pair; self-contained offline HTML player with step and chapter links; *Insert below diagram* for Markdown; *Copy Link to Current Step* and `vscode://` deep links; sidecar files (`<file>.animator.json`) with a JSON schema, live updates, dangling-reference warnings, *Save Topology Layout* and *Save Current Settings as Diagram Defaults*; the *Mermaid Diagrams* Explorer view; the *Get started* walkthrough; `export.*`, `diagramsView.*` and `files.include` settings; CycloneDX SBOM.
- **Fixed:** the topology layout and export workers now start inside VS Code webviews (workers run from embedded source instead of loading extension files).

## 0.1.0 — Unreleased

- **M2b — Topology.** Topology view (typed nodes, clusters, aggregated edges with badges and weighted widths, return lanes, loop arcs, pulses and activity rings) with `layered` (ELK in a worker), deterministic `force` and `manual` layouts; Sequence ↔ Topology morph; split view with cross-highlighting; minimap; edge message lists; manual layouts remembered per diagram; third-party notices.
- **M2a — Narrative & present.** Loop iterations with counters, branch choices (`first` / `all` / `ask`, inspector chips, `@branch`), concurrent `par` lanes; captions and chapters; inspector; participant focus and focused playback; search; A–B loop; Cinematic camera with `@focus`; presentation mode with title and chapter cards, clicker keys, blank screen and laser pointer; transcript view; editor cursor → step; annotation completions, hovers, quick fixes, *Insert Annotation…* and highlighting.
- **M1 — Sequence MVP.** Native Mermaid 12 sequence-diagram parser (100% agreement with Mermaid on the conformance corpus), animated playback with transport, scrubber, speed, loop and keyboard shortcuts; Fit / Follow / Manual camera; CodeLens and Explorer entry points for Markdown and Mermaid files; live reload that keeps your place; last-known-good rendering with Problems diagnostics; current-step highlighting in the source; SVG / PNG export and copy image; generic animation for every other Mermaid diagram type; annotations; English and Spanish.
- **M0 — Foundations.** Animator panel, Ink & Ivory themes, secure webview, restored panels.
