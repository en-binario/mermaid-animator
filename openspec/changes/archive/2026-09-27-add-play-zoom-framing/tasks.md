# Tasks

## 1. Reproduce

- [x] 1.1 Open diagram 5 of the report's `architecture.md` (Mermaid-rendered flowchart, 43 steps) in the Extension Development Host with default settings, play to 43/43, and record the zoom at each step where it changes and the final view (expected: about 21 %, drawing in the top-left corner). Also log `stepBounds` for the widest edges. Verify by writing the observed zoom sequence and bounds into the PR description notes, confirming or correcting the root cause in design.md *Context*.

## 2. Settings

- [x] 2.1 Add `mermaidAnimator.camera.playZoom` (number, default `100`, min `10`, max `800`) and `mermaidAnimator.camera.presentationZoom` (default `150`) to `packages/extension/package.json`, with `%config.camera.playZoom%` / `%config.camera.presentationZoom%` descriptions in `package.nls.json` and `package.nls.es.json`, and add both keys to the forwarded list in `packages/extension/src/environment.ts`. Verify with a `settingsAccess.test.ts` integration case that both keys are contributed with their defaults and reach the webview settings payload.
- [x] 2.2 Expose `playZoom` and `presentationZoom` (fractions) from `resolveSettings` in `packages/webview/src/settings.ts` with `num(…, 100 | 150, 10, 800) / 100`. `Play zoom setting value matrix` (camera) → `packages/webview/test/settings-announce.test.ts` (or a new `settings.test.ts`), `it.each` with one case per R1–R7.
- [x] 2.3 Add both settings to the README settings table and a CHANGELOG *Added* entry. Verify that the README table lists `camera.playZoom` (`100`) and `camera.presentationZoom` (`150`).

## 3. Framing function

- [x] 3.1 Add `clampToContent(view, content, viewport, margin = 24)` to `packages/webview/src/camera.ts` (centre the content on an axis where `content·k + 48 ≤ viewport`, otherwise keep the content edges no more than 24 px inside the view edges). `Framing axis matrix` (camera) → `packages/webview/test/camera.test.ts`, `it.each` with one case per R1–R5. Also assert that the step stays fully inside the view with a 24 px margin in every row.
- [x] 3.2 Add `playView(current, target, content, viewport, zoom)` per design D1 (session zoom, wide-step zoom-out with the `min(zoom, 0.75)` floor, minimum pan at an unchanged zoom, centring on a zoom change, then `clampToContent`, returning undefined when nothing moves). `Wide-step zoom matrix` (camera) → `packages/webview/test/camera.test.ts`, `it.each` with one case per R1–R4. Add cases for the `Zoom restored after a wide edge` scenario (1100 px edge in a 1000 px view → `k ≈ 0.8655`, then 300 px edge → `k = 1`), the `Wide edge at a user zoom below 75 %` scenario (session zoom 0.5, edge wider than the view at 0.5 → `k = 0.5`, edge centred) and the `Last step of a large flowchart` scenario (3000 × 2400 drawing, 1700 × 1250 view → right and bottom edges 24 px inside).
- [x] 3.3 Remove `followView`, `overviewExitView` and `followStartView` and their tests, and move the surviving expectations (minimum pan into the central 80 %) onto `playView`. Verify with `npm test -w packages/webview` passing and `grep -r "followView\|overviewExitView\|followStartView" packages` finding nothing.

## 4. Session zoom in the controller

- [x] 4.1 Change `CameraCallbacks.onUserMove` to `onUserMove(zoomed: boolean)` in `camera.ts`: `userSet` and the d3 `applied` handler compare the old and new `k`. Verify with a `camera.test.ts` case using a stubbed `Camera` (or by extracting the comparison into a pure helper) where a wheel pan reports `false` and a `zoomTo` reports `true`.
- [x] 4.2 Add `sessionZoom: { normal, presenting }` to `CameraSlot` in `controller.ts`. Set it in `load()` from settings, leave it in `update()`, overwrite a mode's value in the settings-change path only when that setting's resolved value changed, and write `view.k` into the current mode's value in `onUserMove(slot, zoomed)` when `zoomed` is true. `Session zoom lifetime matrix` (camera) → extract the transitions into a pure `nextSessionZoom(state, event)` in `packages/webview/src/camera.ts` (or a small `sessionZoom.ts`) and test it in `packages/webview/test/camera.test.ts`, `it.each` with one case per R1–R11.
- [x] 4.3 Route every following-camera framing through `playView` at `framingZoom(slot)`: `onStepChanged` (follow and presenting), `leaveOverview`, `followStep`, `onResume`, `reframe`, `toggleFollow` and the initial follow view in `applySlotMode` (without the overview: the drawing's top rows as the target). Keep the `hold('camera')` behaviour. Pass `slot.framingTarget(step, bounds)` (renamed from `cinematicTarget`) as the target. Verify with `npm run build` and `tsc` clean, and the manual checks in 6.1.
- [x] 4.4 `Framing zoom matrix` (camera) → extract the mode and zoom choice into a pure `framingFor({ presenting, mode, following, sessionZoom })` returning `none | fit | cinematic | { zoom }`, and test it in `packages/webview/test/camera.test.ts`, `it.each` with one case per R1–R9.
- [x] 4.5 In `GenericDiagram.discover` (`packages/webview/src/fallback.ts`), map boxes and edge endpoints with `svg.getScreenCTM()⁻¹ · el.getScreenCTM()` instead of `getCTM()` (design *Context* 1), so bounds no longer depend on the camera; verify in the harness that `wide-architecture.mmd` bounds are identical before and after a camera move. In `GenericDiagram.stepBounds`, return the union of the group's box and its attached edge-label boxes. Verify with a `fallback-order.test.ts` (or new) case on a hand-built group with an `extra` label: the bounds include the label.

## 5. Presentation mode

- [x] 5.1 In `setPresenting`, use `follow` slot modes with the presentation session zoom (fit the overview at step 0), and on exit re-run `applyCameraMode(false)` and frame the current step at the normal session zoom when the resolved mode is `follow`. Stop forcing `cinematic` in `applySlotMode` and `toggleFollow` while presenting. Verify with the manual checks in 6.1 (rows for `Presentation zoom` and `Presentation keeps its own zoom`).
- [x] 5.2 `Overview exit zoom matrix` (initial-overview) → `packages/webview/test/camera.test.ts`, `it.each` with one case per R1–R4, driving `framingFor` + `playView` from an overview-fitted view at each row's session zoom and asserting the resulting `k`.
- [x] 5.3 Update the README *Presentation* bullet (frames each step at `camera.presentationZoom`, 150 % by default, no longer Cinematic) and the camera text, and add a CHANGELOG *Changed* entry for presentation framing and follow zoom. Verify that the README no longer says presentation uses Cinematic.

## 6. Integration checks

- [x] 6.1 Harness checklist (`node scripts/serve-harness.mjs`, 1700 × 1250 page, fixtures `wide-architecture.mmd` and `long-flow.mmd`). No PR exists, so the result of each line is recorded here:
  - `Replay and resume use the user's zoom`: Play from step 0 → 100 %. `+` during playback → paused at 120 %. Play → resumed at 120 %. `Home`, then Play → step 2 at 120 %. ✓
  - `Another diagram resets the session zoom`: after zooming to 144 %, re-sending `document/load` (the path a diagram-selector change takes) → step 0 fitted, then 100 %. ✓
  - `Presentation zoom`: `P` at step 0 → the overview stays fitted (65 %). `→` → step 1 at 150 %. ✓
  - `Presentation keeps its own zoom`: `+` while presenting → 180 %. `Esc` → 100 %, and `→` stays at 100 %. `P`, `→` → 180 %. ✓
  - `Presentation zoom-out past the 1.6× limit`: covered by the `playView` test (150 % → 75 % in one move). With `reduce=1`, entering presentation cuts straight to 150 %. ✓
  - `Wide edge at a user zoom below 75 %`: `-` ×5 → 48 %. The wide step 36 is framed at 48 %. ✓
  - `Pan only keeps the session zoom`: wide steps 36–37 at 75 %, then a pan, then `→` → step 38 at 100 %. ✓
  - `Last step of a large flowchart`: `wide-architecture.mmd` played 1 → 40 stays at 100 %, with 75 % only on the wide steps 36–37. The drawing is centred across (narrower than the view), and no more than 24 px of canvas shows above or below it. Before the fix, step 36 went to 66 % with the drawing pushed into a corner. ✓
  - Existing: `long-flow.mmd` in `auto` → step 0 fitted at 46 %, step 1 at 100 %, then minimum pans of 40 px per message. The last step stops with the drawing's bottom 24 px inside the view. ✓
- [x] 6.2 Run `npm run build`, `npm test` for all workspaces, and the extension integration suite. Verify that everything passes with no type errors.
- [x] 6.3 Run `openspec validate add-play-zoom-framing --strict` and verify it reports the change as valid.
- [x] 6.4 Commit the implementation and this change's artifacts as `feat: play and presentation zoom with drawing-bound framing (openspec add-play-zoom-framing)`, ending with the Co-Authored-By trailer. Verify with `git log -1` and a clean `git status`.
