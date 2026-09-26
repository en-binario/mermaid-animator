# Proposal: M2a — Narrative & present

## Why

M1 plays a sequence diagram, but only as a flat series of messages: loops run once, `alt` always takes its first branch, `par` lanes run one after another, captions and chapters are parsed but never shown, and nothing supports explaining a diagram to others. M2a (product specification §23.2) turns the animator into a tool for *understanding and presenting* flows: narration, navigation by chapter, exploration of large diagrams, faithful fragment semantics, and a presentation mode for design reviews — Scenario S2 and persona Marcus in spec §4.

## What Changes

- **Faithful fragment semantics:** loops play `@iterations n` (or `playback.loopIterations`) times with an iteration counter and compressed repeats; a **branch explorer** chooses which `alt`/`critical` branch plays (`first`, `all`, `ask` with an on-canvas choice), `opt` can be skipped, and `par`/`par_over` lanes play **concurrently** by default, several arrows drawing at once.
- **Narrative:** a caption strip shows `@caption` text; `@chapter` divides the step list into chapters shown as scrubber ticks, an inspector list and `Shift+←/→` navigation.
- **Inspector:** a side panel with the current step (endpoints, label, fragment path, iteration), a source link, participants (focus and visibility toggles), chapters and branch choices; an overlay sheet on narrow panels.
- **Exploration:** participant focus and multi-focus with dimming, *Play only focused steps*, and search across participants, labels, notes and captions.
- **Playback:** A–B loop ranges (`I`/`O`).
- **Camera:** a **Cinematic** mode that frames each step tightly.
- **Presentation mode:** maximised editor (Zen Mode opt-in and guarded), auto-hiding chrome, serif captions, title and chapter cards, presenter-clicker keys, blank screen, laser pointer and a progress hairline.
- **Transcript view:** an accessible, synchronised text rendition of the steps (`R`).
- **Editor → step:** clicking (or, with `follow`, moving the cursor) on a statement seeks to its step.
- **Annotation editor support:** completions, hovers, quick fixes and *Insert Annotation…* for `%% @…` directives; highlighted annotation lines; the remaining step directives (`@caption`, `@chapter`, `@iterations`, `@branch`, `@collapse`, `@focus`, `@latency`) take effect.

## Capabilities

### New Capabilities

- `narrative`: Captions and chapters — display, navigation and chapter ticks.
- `inspector`: The inspector panel: current step details, source link, participants, chapters and branch choices.
- `exploration`: Participant focus, multi-focus, focused playback and search.
- `presentation-mode`: Full-screen-style presenting with cards, clicker support, blank screen and laser pointer.
- `transcript-view`: A synchronised, accessible text view of the step list.
- `annotation-editing`: Completions, hovers, quick fixes, insertion and highlighting for annotations in the editor.

### Modified Capabilities

- `step-compilation`: fragment handling becomes complete — loop iterations, branch selection, skippable `opt`, concurrent `par` lanes (replaces the M1-only requirement).
- `animation-annotations`: all step directives take effect (replaces the M1-only directive list).
- `camera`: camera modes add `cinematic`.
- `playback`: A–B loop ranges.
- `source-sync`: editor cursor seeks to the step (click or follow).
- `sequence-rendering`: concurrent messages each draw with their own pulse; loop iteration counters; dimming for focus.
- `host-webview-protocol`: presentation layout messages and a seek-to-line command.

## Impact

- Code: `core` (step compiler options, fragment keys, focus filter, annotation completion data), `renderer` (multi-pulse, iteration counters, dim state, cards), `webview` (inspector, caption strip, search, presentation overlay, transcript, branch chips), `extension` (completion/hover/code-action providers, presentation layout commands, cursor seek).
- No new runtime dependencies.
- New settings: `playback.loopIterations`, `playback.compressRepeats`, `playback.altBranches`, `playback.parallel`, `display.showCaptions`, `display.showInspector`, `presentation.chapterCards`, `presentation.zenMode`, `annotations.highlight`; `camera.mode` gains `cinematic`.
- Non-goals (later): auto-captions (P2), hiding participants and collapsing fragments (P2), topology/split views and minimap (M2b).
