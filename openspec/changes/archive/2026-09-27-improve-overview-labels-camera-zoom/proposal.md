# Proposal

## Why

Using the animator on real architecture documents showed six rough edges.

- Step 0 is empty or nearly empty, so viewers never see the whole diagram before the reveal starts.
- `<b>` markup, which Mermaid's own preview renders as bold, shows up as literal `<b>` text. It also pushes words onto separate lines.
- There is no quick way to reach the extension's settings.
- Any small pan or zoom silently turns *Camera follows playback* off.
- The helpful arrow-end name tags are off by default.
- Zoom is only available through shortcuts, with no visible level.

## What Changes

- **Initial overview (step 0).** Before the first step, the panel shows the complete diagram (every message, note, node and edge) as a static overview, framed to fit. Starting step 1 clears the drawing back to its pre-reveal state and the step-by-step reveal proceeds as today. This applies to native sequence, topology and Mermaid fallback diagrams, and to animated exports, which render from the same scene. A new setting `mermaidAnimator.playback.initialOverview` (default `true`) and `@animator overview=false` turn it off.
- **Inline label formatting.** `<b>`/`<strong>` render as bold and `<i>`/`<em>` as italic. This covers diagrams drawn through Mermaid (flowchart and the rest), native sequence labels (messages, notes, participants, fragments), topology node labels, and every export. Wrapping and box sizes are measured from the formatted text. Captions, the transcript, search and screen-reader announcements use the text without tags.
- **Settings button.** A gear button in the panel toolbar, and a new *Mermaid Animator: Open Settings* command, open VS Code's Settings editor filtered to this extension.
- **Following survives user camera moves.** Panning, scrolling or zooming no longer turns following off, and no *Resume following* chip appears. Only the follow toggle (`C` or the eye button) turns it off. If playback is running, a user camera move pauses it. When playback continues (play, next or previous), the camera returns to the current step and keeps the zoom level the user chose. **BREAKING** (behavioural): the *Resume following* chip is removed.
- **`arrowEndNames` defaults to `auto`.** Arrow-end name tags now appear by default, but only for participants whose header is out of view.
- **Zoom controls.** The toolbar gets a zoom group: zoom out, the current zoom as a percentage, and zoom in. Clicking the percentage opens presets (25 %–400 %, *Fit*), and the percentage updates live during gestures and automatic camera moves.

## Capabilities

### New Capabilities
- `initial-overview`: the complete-diagram overview at step 0, the clear-then-reveal transition into step 1, its camera framing, and the setting and annotation that control it.
- `label-formatting`: inline `<b>`/`<strong>`/`<i>`/`<em>` formatting in every rendering engine and export, with plain-text use elsewhere.
- `zoom-controls`: the toolbar zoom group (zoom out, percentage with presets, zoom in).

### Modified Capabilities
- `camera`: the *Resume following* requirement is replaced. User camera moves keep following enabled and reuse the user's zoom when following resumes.
- `playback`: *Automatic pausing* adds pausing when the user moves the camera during playback.
- `participant-orientation`: *Arrow-end name tags* default changes from `off` to `auto`; *Off-screen participant markers* no longer mention the removed *Resume following* chip.
- `minimap`: *Minimap navigation* no longer mentions the removed *Resume following* chip.
- `sequence-parsing`: *Labels* keep inline formatting tags as formatting runs instead of literal text.
- `animator-panel`: adds access to the extension's settings from the panel and the command palette.
- `host-webview-protocol`: adds the webview → host `settings/open` message.

## Impact

- **core**: `sequence/parser.ts` (label cleanup), a new inline-markup module (runs and plain text), `layout.ts` (`wrapText` and measurement over runs), `topology.ts` (node label runs), `annotations.ts` (`overview` key).
- **renderer**: `scene.ts`, `topologyScene.ts` (overview state at index −1 and the clear window in step 1), `svg.ts`, `topologySvg.ts` (bold/italic `tspan`s), `canvas.ts` (bold/italic runs for GIF and video frames), `measure.ts` (bold/italic fonts), `animatedSvg.ts` (overview keyframes follow from the scene).
- **webview**: `fallback.ts` (overview state, formatting markers before the Mermaid render and styling after it), `controller.ts` (follow behaviour, pause on user move, step-0 fit, zoom level signal and presets), `camera.ts`, `App.tsx` (gear button, zoom group, chip removal), `settings.ts` (`initialOverview`, `arrowEndNames` default), `narrative.ts`, `Transcript.tsx`, `search.ts`, `announce.ts` (plain text), `player/main.ts` (HTML player overview).
- **protocol**: new `settings/open` webview message and its validator.
- **extension**: `package.json` (new setting, command, `arrowEndNames` default, menus), `package.nls*.json`, `l10n/bundle.l10n.es.json`, `schemas/animator.schema.json`, `panel.ts` (handles `settings/open`), `extension.ts` (command), README and CHANGELOG.
- **Tests**: `orientation.test.ts` and `settings-announce.test.ts` (new `arrowEndNames` default), plus new unit tests for markup parsing, overview scene state, camera following and zoom presets.
- No new dependencies.
