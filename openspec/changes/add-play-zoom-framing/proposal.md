# Proposal

## Why

During playback the zoom drifts in ways the user did not choose. Follow mode only ever zooms *out* (by up to 1.6× per
step whenever a step is larger than the view) and never zooms back in, so on a large Mermaid-rendered flowchart a
few wide edges compound until the view sits at about 20 %. Follow also centres the camera on a step without regard to
the drawing's edges, so the last steps of a diagram can leave most of the view as empty canvas, with the drawing
squeezed into a corner (the 43/43 screenshot of `architecture.md` diagram 5). Presentation mode uses Cinematic
framing, whose zoom changes on every step. Users want a predictable zoom: a known default when they press *Play*, the
zoom they picked when they change it, and a camera that shows the drawing rather than empty space.

## What Changes

- New settings `mermaidAnimator.camera.playZoom` (default `100`) and `mermaidAnimator.camera.presentationZoom`
  (default `150`), in percent, set the zoom that a following camera uses to frame steps during normal playback and in
  presentation mode.
- Each view keeps two session zoom levels, one for normal playback and one for presentation mode. They start at the
  settings when a diagram is loaded into the panel (opened, or picked from the diagram selector). Any user zoom
  (`Ctrl`/`Cmd` + wheel, pinch, `+`/`-`, toolbar zoom buttons, presets) replaces the session zoom of the current mode,
  so *Play*, *Next*, replay and resume frame the next step at the zoom the user chose. *Fit* and *Frame step* do not
  change it.
- Follow framing keeps the session zoom from step to step. When a step (typically a long edge) does not fit in the
  view at that zoom, the camera zooms out only as far as needed, never below 75 % (when the session zoom is already 75 % or lower, it is kept
  and the step is centred), and returns to the session zoom on
  the next step that fits.
- Automatic step framing no longer shows empty canvas: on each axis where the drawing is larger than the view, the
  view stays within the drawing (24 px margin); on an axis where it is smaller, the drawing is centred. The current
  step stays fully in view, but is not necessarily centred.
- **BREAKING (behaviour):** presentation mode frames steps with this zoom-anchored follow framing at the presentation
  zoom instead of Cinematic framing. `camera.mode: cinematic` outside presentation mode is unchanged.
- Leaving the step-0 overview in Follow mode frames step 1 at the session zoom instead of "diagram width fitted,
  never past 100 %".
- Moves between the session zoom and the wide-step zoom-out, and leaving the overview, are exempt from the 1.6× zoom
  change limit per automatic move.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `camera`: Follow mode and user-move behaviour now use a per-mode session zoom; new requirements for the play zoom
  settings, the wide-step zoom-out with a 75 % floor, and framing that stays within the drawing; the 1.6× limit gains
  exceptions.
- `initial-overview`: *Overview framing* leaves step 0 at the session zoom and describes presentation mode.
- `presentation-mode`: *Presentation layout* uses the presentation zoom instead of Cinematic framing.

## Impact

- `packages/webview/src/camera.ts`: new pure framing function (session zoom, wide-step zoom-out, content clamping)
  replacing the `followView` / `overviewExitView` / `followStartView` path for following cameras.
- `packages/webview/src/controller.ts`: per-slot session zoom for normal and presentation mode, reset on `load`,
  updated from user zooms, used by step changes, resume, overview exit and presentation.
- `packages/webview/src/settings.ts`, `packages/extension/src/environment.ts`, `packages/extension/package.json`,
  `package.nls.json`, `package.nls.es.json`: the two new settings.
- Tests: `packages/webview/test/camera.test.ts` (table-driven framing), settings tests, harness checklist.
- Exports (animated export camera options `fit`, `cinematic`, `current`) and the HTML player are not affected.
