# Proposal: M3 — Share (1.0)

## Why

After M2 the animator explains diagrams well inside VS Code, but the explanation cannot leave the editor except as a still image. Technical writers, reviewers and presenters (personas Priya and Sofia, Scenario S3 in spec §4) need the animation itself in READMEs, release notes, slides and documentation sites, and teams need their captions, chapters and layouts to live with the repository. M3 (spec §23.2) completes version 1.0: animated exports, a self-contained HTML player, deep links, sidecar files, a workspace-wide diagrams view and an onboarding walkthrough.

## What Changes

- **Export sheet:** an in-panel export dialog (spec §14.2) with format, range (all / chapter / A–B / current step), view, camera, size presets, scale, frame rate, speed, theme, background, captions/title card/counter/transport burn-in, loop count, end hold and quality, with a live preview and estimated duration and size; *Export…* from the palette and CodeLens opens it.
- **Animated raster/video:** GIF, WebM (VP9) and MP4 (H.264 where the host's encoder supports it) rendered **frame-exactly** by sampling the timeline, with the Canvas 2D render backend running inside a worker (ADR-010); progress with cancel.
- **Animated SVG:** a script-free, self-contained SVG animated with CSS keyframes that plays in GitHub READMEs; transparent GitHub-safe palette by default, an optional light/dark pair, a reduced-motion final frame and a size warning.
- **HTML player:** one self-contained `.html` file with the diagram, transport, keyboard control, captions and chapters, supporting `#step=` and `#chapter=` links.
- **Insert reference:** after exporting from Markdown, insert an image reference (or a `<picture>` element for a light/dark pair) below the diagram.
- **Deep links:** *Copy Link to Current Step* produces `vscode://enbinario.mermaid-animator/open?…` links that open the file, diagram and step.
- **Sidecar files:** `<source>.animator.json` stores settings, captions, chapters and topology positions per diagram (schema with IntelliSense); read automatically, written only on explicit *Save Layout* / *Save as Diagram Defaults*; unresolved step references are reported; M2b's workspace-state layouts migrate into it on save.
- **Mermaid Diagrams view:** an Explorer tree of every diagram in the workspace with type icons, filters and actions.
- **Walkthrough:** *Get started with Mermaid Animator* (open a sample, step through, switch views, annotate, export).
- **Release 1.0:** version 1.0.0, VSIX with third-party notices and SBOM.

## Capabilities

### New Capabilities

- `animated-export`: The export sheet and frame-exact GIF, WebM and MP4 exports.
- `animated-svg-export`: Script-free animated SVG for READMEs and documentation sites.
- `html-player`: The self-contained interactive HTML export.
- `deep-links`: Links that open a diagram at a specific step.
- `sidecar-files`: Per-diagram configuration, narrative and layout stored beside the source.
- `diagrams-view`: The workspace-wide Mermaid Diagrams tree.
- `walkthrough`: The onboarding walkthrough.

### Modified Capabilities

- `static-export`: adds inserting an image reference below the exported diagram.
- `host-webview-protocol`: export progress and cancellation, HTML player assembly, sidecar data and writes.

## Impact

- New bundled dependencies: `gifenc` (MIT) and `mediabunny` (MPL-2.0, unmodified, notice included) in the export worker.
- Code: `renderer` gains the Canvas 2D backend and an animated-SVG compiler; `webview` gains the export sheet, the render/encode worker and the player bundle entry; `extension` gains the URI handler, sidecar service, diagrams tree, walkthrough and HTML assembly; `scripts/build.mjs` builds the worker and the player bundle.
- New settings: `export.defaultFormat`, `export.fps`, `export.scale`, `export.background`, `export.includeCaptions`, `export.outputDirectory`, `export.svgAdaptiveTheme`, `diagramsView.enabled`, `files.include`.
- Non-goals: APNG/WebP, PNG sequences and the headless CLI (P2); MP4 through an external ffmpeg (P2 — MP4 is offered only where WebCodecs supports H.264); the scrollytelling "article" layout of the HTML player (P2).
