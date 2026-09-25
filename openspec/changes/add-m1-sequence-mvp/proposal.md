# Proposal: M1 — Sequence MVP (Preview)

## Why

After M0 the extension can open a secure, themed panel but shows nothing animated. M1 (product specification §23.2) delivers the product's core promise for the most common diagram type: any Mermaid sequence diagram already in a repository — in a `.mmd` file or a Markdown fence — plays back step by step, stays in sync with its source while the user edits, and can be exported as a still image. Every other Mermaid diagram type opens too, with a generic reveal animation, so no diagram fails to open.

## What Changes

- **Discovery:** detect Mermaid diagrams in Markdown/MDX fences and `.mmd`/`.mermaid` files; CodeLens *▶ Animate · Export…* above fences; editor-title action and palette commands for Markdown files that contain diagrams; *Animate Diagram at Cursor*, *Animate All Diagrams in File*; Explorer context menu with a quick pick for multi-diagram files; a toolbar diagram switcher that reuses the webview.
- **Parsing:** a native, error-tolerant Mermaid 12 sequence-diagram parser producing an IR with source ranges (participants and all participant types, boxes, create/destroy, every arrow form including half arrows and central connections, activations, notes, all fragments, autonumber, titles/accessibility statements, links/properties/details, entity codes, front matter and `%%{init}%%`); a diagram-type detector; parse diagnostics.
- **Annotations:** parse and validate `%% @…` annotations with diagnostics; apply the step-shaping directives (`@animator`, `@step-id`, `@skip`, `@pause`, `@duration`, `@speed`, `@emphasis`, `@with-next`); store captions and chapters for M2a.
- **Step compilation:** one canonical step list with the activation/create/destroy merge rules, first-branch `alt`, single-iteration `loop`, sequential `par` lanes, two-level stable identity (`StepId` + `structuralId`), layout-invariant transition timing and adaptive dwell.
- **Rendering & animation:** deterministic sequence layout; SVG rendering in the Ink & Ivory shape language; visual state as a pure function of time; the full message choreography (arrow draw, travelling pulse, label, arrowhead, activation growth); step-state display options; Formal/Expressive/Minimal/None motion profiles; reduced motion.
- **Playback:** transport (first/previous/play-pause/next/last), continuous scrubber with step snapping, go-to-step, speed, loop, keyboard shortcuts, host commands and keybindings; pause when hidden and on hover.
- **Camera:** pan/zoom within 0.1–8×; Auto/Fit/Follow/Manual modes with smooth zoom interpolation and motion limits; *Resume following* chip; frame current step; fit.
- **Source sync:** live reload with debounce and position preservation; last-known-good scene with an error banner; Problems-panel diagnostics; current-step decoration in the editor; reveal source; hover tooltips with source lines.
- **Static export:** SVG (with font-fallback safety) and PNG at 1×/2×/3×, copy image to clipboard.
- **Generic fallback:** lazily loaded Mermaid renders any other diagram type (and sequence diagrams the native parser rejects but Mermaid accepts), animated as ordered group reveals with the same transport, camera and export.
- **Accessibility & localisation:** live-region step announcements, labelled controls, keyboard operation; English and Spanish.
- **BREAKING (pre-release):** none for users; `animator-panel` and `webview-security` requirements are widened (see Modified Capabilities).

## Capabilities

### New Capabilities

- `diagram-discovery`: Finding Mermaid diagrams in documents and the workspace entry points (CodeLens, title action, palette, Explorer menu, diagram switcher) that open them, and keeping a panel bound to its diagram as the document changes.
- `sequence-parsing`: Parsing Mermaid 12 sequence-diagram syntax into a source-ranged model with error recovery and diagnostics, plus diagram-type detection.
- `animation-annotations`: The `%% @directive` annotation language: grammar, validation diagnostics and the step-shaping directives available in M1.
- `step-compilation`: Turning a parsed diagram into the canonical ordered step list with merge rules, fragment handling, stable identities and timing.
- `sequence-rendering`: Laying out and drawing sequence diagrams and animating each step according to the motion system and display options.
- `playback`: Transport controls, scrubbing, speed, looping, keyboard shortcuts and commands that move through the step list.
- `camera`: Pan, zoom and automatic camera behaviour during playback.
- `source-sync`: Live reload, position preservation, error handling, diagnostics and bidirectional links between the panel and the source editor.
- `static-export`: Exporting the current frame as SVG or PNG and copying it to the clipboard.
- `generic-diagram-fallback`: Animating every Mermaid diagram type without a native pipeline by revealing Mermaid's own rendering in order.
- `animator-accessibility`: Screen-reader announcements, labelled controls and keyboard operability of the animator.
- `localization`: Presenting all user-facing text in English or Spanish according to the editor's display language.

### Modified Capabilities

- `animator-panel`: open commands and the title action become available for Markdown/MDX documents containing diagrams; panel titles include the diagram title and index; panels are keyed per diagram rather than per file.
- `webview-security`: inline style *attributes* become permitted (style *elements* still require the nonce) so Mermaid's own rendering works in the generic fallback.
- `host-webview-protocol`: new messages for command routing, diagram selection, diagnostics, source reveal, editor decorations, export data and clipboard fallback.

## Impact

- Code: `packages/core` (parsers, IR, annotations, steps, timeline, layout, locator), `packages/renderer` (SVG scene, runtime, camera, export), `packages/webview` (app, transport, fallback), `packages/extension` (providers, sync, diagnostics, export writer, l10n).
- New bundled dependencies: `mermaid` 12.0.0 (lazy chunk), `d3-zoom`, `d3-selection`, `d3-interpolate`. New dev dependency: `jsdom` (differential conformance tests against Mermaid's parser).
- VSIX size grows by the Mermaid chunk (loaded only for fallback diagrams).
- Product specification updates: §18 CSP row (style attributes), and any clarification discovered during implementation.
