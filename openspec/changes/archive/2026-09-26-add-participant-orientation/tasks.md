# Tasks

## 1. Settings

- [x] 1.1 Contribute `mermaidAnimator.display.participantNames` (`auto` default, `off`) and `mermaidAnimator.display.arrowEndNames` (`off` default, `auto`, `always`) with English and Spanish descriptions, add them to `WEBVIEW_SETTING_KEYS` and `AnimatorSettings.display` resolution, and regenerate the sidecar schema; verify the settings unit tests (defaults, invalid values fall back), the localisation parity test and the sidecar-schema freshness test pass
- [x] 1.2 Document both settings in the extension README settings table and describe the rail, markers and tags in the *Sequence, topology, split* section; verify the README unit test (documented settings exist in the manifest) passes

## 2. Orientation model (webview, pure)

- [x] 2.1 Implement `railEntries` (visibility above the view, lifeline crossing the top edge, horizontal culling, created and destroyed participants, current-step and focus state) with name fitting (ellipsis, tick below three characters); verify unit tests for each spec scenario of *Participant rail* including 8× zoom producing identical on-screen sizes
- [x] 2.2 Implement `edgeMarkers` (involved participants only, side, clamped vertical position) and the minimal-pan target (24 px padding); verify unit tests for right/left off-screen receivers, uninvolved participants and the pan distance
- [x] 2.3 Implement `arrowTags` for `off`/`auto`/`always` (endpoint placement away from the label and arrowhead, one tag for self-messages, `auto` filtering by header visibility); verify unit tests for each *Arrow-end name tags* scenario and a self-message

## 3. Panel overlay (webview)

- [x] 3.1 Build `OrientationOverlay` for the sequence slot (band, reusable per-participant names, marker buttons, tags; CSSOM positioning; pass-through band background; fade with reduced-motion cut; `aria-hidden` except labelled markers) with Ink & Ivory styles for Ivory, Graphite and high contrast; verify a harness check of `sign-in.mmd` and `long-flow.mmd` zoomed below the headers in each theme (screenshots) and that dragging on the band pans
- [x] 3.2 Drive the overlay from the frame loop (`updateOverlays`): sequence and split views only, hidden in topology, generic diagrams and during morphs, kept while presenting; tags follow the current step's draw window; verify in the harness that the rail tracks Follow and Cinematic glides without lag, disappears when headers return, and is absent in topology view and during a morph
- [x] 3.3 Wire interactions: name click → `toggleFocus` (`Ctrl`/`Cmd` additive), marker click/`Enter`/`Space` → `camera.userSet` minimal pan with the *Resume following* chip; verify in the harness that clicking *Auth* in the rail dims as a header click does and a Database marker pans it into view and suspends Follow

## 4. Export burn-in (webview)

- [x] 4.1 Add `names` to `BurnIn`, the *Participant names* checkbox to the export sheet (default from `participantNames`), and draw the rail in `drawBurnIns` from the frame camera with the export scale; add the new sheet strings (EN/ES); verify unit tests of the sheet defaults and a harness check that a Cinematic GIF shows the rail on frames below the headers, none when disabled, and byte-identical Fit-camera frames with and without it
- [x] 4.2 Confirm the worker renders the burn-in identically to the main thread; verify the existing worker-frame probe (frame 90 at 30 fps) is byte-identical with *Participant names* enabled and a Cinematic camera

## 5. Integration checks

- [x] 5.1 Run lint, typecheck, unit and integration suites on development and production builds; verify all pass, including an integration test that the two settings are contributed and reach the webview in `settings/changed`
