# Design

## Context

See proposal.md (Why). The relevant code today:

- `packages/webview/src/camera.ts` holds pure framing functions. `followView` keeps the current zoom, and when a step
  does not fit in the central 80 % it zooms out by at most 1.6× and centres the step. Nothing ever zooms back in, and
  nothing keeps the view on the drawing. `overviewExitView` / `followStartView` pick the zoom after the overview as
  "diagram width fitted, never past 100 %".
- `packages/webview/src/controller.ts` owns one `CameraSlot` per view (drawing, topology). `onStepChanged` dispatches
  to `followStep`, `leaveOverview` or `cinematicStep`. `onUserMove` marks the slot `displaced`, and `onResume` re-frames
  displaced slots. `setPresenting` forces every slot into `cinematic`.
- `Camera.onUserMove()` does not say whether the user zoomed or only panned.
- For Mermaid-rendered diagrams, `GenericDiagram.stepBounds` is the group's bounding box without its edge label. A long
  orthogonal edge can be almost as large as the drawing (the edges running down the right side in the 43/43
  screenshot).

Confirmed cause of the 43/43 screenshot (task 1.1, reproduced with `fixtures/demo/wide-architecture.mmd`, a 40-step
flowchart shaped like the report's diagram 5, in a 1700 × 1250 harness):

1. **Wrong step bounds for Mermaid-rendered diagrams.** `GenericDiagram.discover` maps boxes with
   `svg.getCTM()⁻¹ · el.getCTM()`. In Chromium an element's `getCTM()` is relative to the nearest viewport, which is
   the nested Mermaid `<svg>`. The nested `<svg>`'s own `getCTM()`, however, includes the camera transform of the
   outer `.ma-viewport`. The product depends on wherever the camera was when the diagram was discovered: after one
   camera move, the `SPA → GW` edge at drawing x ≈ 578 was mapped to x ≈ −538. That is worse after switching
   diagrams, when the previous diagram's camera is still applied. The edge endpoints use the same mix. The fix is to
   use `getScreenCTM()` on both sides: `svg.getScreenCTM()` includes the nested viewBox, so the product is the
   element's transform in Mermaid user space, and subtracting the viewBox origin gives drawing coordinates.
2. **Compounding zoom-out with no clamp.** Steps 1–35 stayed at 100 %. Step 36, the `K → NOT` edge (really
   828 × 1672 px in a 1044 × 1708 drawing), made `followView` zoom out to 66 % and centre on its mis-mapped box at
   drawing x ≈ −126. The drawing ended up in the bottom-right, with most of the view empty. With more wide edges the
   zoom compounds by up to 1.6× each time, which gives the report's 21 %.

## Goals / Non-Goals

**Goals:**
- A single pure function computes every following camera's step framing, so the decision tables in the camera delta
  map to one `it.each` test file.
- The session zoom lives in the controller, per slot and per mode. The camera module stays stateless apart from the
  current view.

**Non-Goals:**
- An `@animator` annotation for the zoom settings. Like every setting forwarded to the webview, both are also accepted
  in a sidecar's `settings` (the generated `animator.schema.json` lists them), with the usual precedence.
- Panning along an edge while it draws when the edge does not fit even at 75 %. The step is centred instead.
- Changing `cinematic` outside presentation mode, `fit`, `manual`, `auto`'s 0.75× resolution rule, or export cameras.
- Constraining user pans to the drawing.

## Decisions

### D1. One pure framing function: `playView`
`playView(current, target, content, viewport, zoom)` in `camera.ts` returns the view for a following camera:
1. `fitK = min((vw − 48) / target.w, (vh − 48) / target.h)`. If `fitK ≥ zoom`, then `k = zoom`. Otherwise
   `k = max(fitK, min(zoom, 0.75))`, clamped to 0.1–8.
2. If `k === current.k` (within 1e-3), apply the existing minimum-pan rule toward the central 80 %, keeping the
   current translation when the target is already inside it. Otherwise centre the target at `k`.
3. Pass the result through `clampToContent(view, content, viewport, 24)`: on each axis, if `content·k + 48 ≤ viewport`,
   centre the content. Otherwise limit the translation so the content's edges are no more than 24 px inside the view's
   edges. Return undefined when the clamped view equals `current`, so no move is animated.

The clamp cannot hide the step. The step lies inside the content, so moving the view toward the content's interior
keeps the step inside the view, with the same margin on the side the view moved away from. `followView`,
`overviewExitView` and `followStartView` are removed. Their callers use `playView`, which also covers resize reframing
and the initial view without an overview (that view uses the drawing's top rows as the target).

*Alternative:* patch `followView` to zoom back in and clamp separately. We rejected it because the zoom logic,
wide-step rule and clamp would then be split across three call sites, and the matrices could not be tested as one
function.

### D2. Session zoom on the slot
`CameraSlot` gains `sessionZoom: { normal: number; presenting: number }`. `load()` sets it from settings, `update()`
(live reload) leaves it alone, and `applySettings` overwrites a mode's value only when that setting's resolved value
changed. The controller's `framingZoom(slot)` returns `sessionZoom[this.presenting ? 'presenting' : 'normal']`.

### D3. Telling a zoom from a pan
`CameraCallbacks.onUserMove` becomes `onUserMove(zoomed: boolean)`. `Camera.userSet` compares the old and new `k`, and
`applied()` does the same for d3 gestures (touch pinch). The controller's `onUserMove(slot, zoomed)` then writes
`slot.camera.view.k` into the current mode's session zoom when `zoomed` is true. `zoom()` / `zoomTo()` (toolbar,
presets, `+`/`-`) already go through `userSet`, so split-view toolbar zoom sets both slots. *Fit* and *Frame step* use
`moveTo`, so they never set it.

### D4. Presentation is follow at the presentation zoom
`setPresenting(true)` sets slot modes to `follow` (not `cinematic`) and frames the current step with `playView` at
`sessionZoom.presenting`. At step 0 with the overview it fits the whole diagram instead. `setPresenting(false)` re-runs
`applyCameraMode` and frames the current step at `sessionZoom.normal` if the resolved mode is `follow`. `toggleFollow`
turns following back on as `follow` while presenting. `applySlotMode` stops forcing `cinematic` while presenting.

### D5. Framing target honours `@focus`
`playView` receives `slot.cinematicTarget(step, bounds)` (renamed `framingTarget`) instead of the raw step bounds, which
`animation-annotations` already requires for Follow mode. For Mermaid-rendered diagrams, `stepBounds` becomes the union
of the group's box and its attached edge-label boxes (the `extra` elements), so "edge with its label" holds.

### D6. 1.6× limit
`playView` never calls `limitZoomChange`. `cinematicView` keeps it. This matches the exemption in the modified
*Smooth, bounded camera motion*. Durations still come from `Camera.moveTo` (320–900 ms ÷ speed), and reduced motion
still cuts (`animate: !this.reducedMotion`).

### D7. Settings plumbing
`camera.playZoom` and `camera.presentationZoom` are added to the host's forwarded key list (`environment.ts`) and to
`package.json` contributions (`type: number`, `minimum: 10`, `maximum: 800`, defaults 100/150), with `%config…%`
descriptions in `package.nls.json` and `package.nls.es.json`. `resolveSettings` exposes
`playZoom = num(host['camera.playZoom'], 100, 10, 800) / 100` (the same for `presentationZoom`). Non-numbers fall back to
the default through `num`.

## Risks / Trade-offs

- [A user zoom at the fitted overview (for example one `+` from 21 % to 25 %) becomes the session zoom, so step 1 plays
  at 25 %] → This is what the request asks for ("any moment"), and the old overview spec already did it. The
  percentage label shows the value, and one preset choice fixes it.
- [Edges nearly as large as the drawing (long orthogonal routes) are centred at 75 %, which may show little of the
  nodes they connect] → The clamp keeps the view on the drawing. Panning along the edge is a stated non-goal and could
  be a follow-up change.
- [Presentation loses Cinematic's tight framing of small steps] → This is intended by the request.
  `camera.presentationZoom` can be raised for tighter framing.
- [Clamping could fight the minimum-pan rule and cause jitter between steps] → At an unchanged zoom the view is already
  clamped from the previous framing, and the minimum pan moves toward the step, which is inside the content. The
  harness checklist includes a long diagram stepped end to end.

## Migration Plan

There is no data migration. The new settings default to the requested values. The presentation camera change is a
behaviour change, called out in the proposal as **BREAKING (behaviour)**. To roll back, revert the implementation commit.
