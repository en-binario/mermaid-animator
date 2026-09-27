# Design

## Context

See proposal.md for motivation and specs/participant-orientation for the behaviour. Relevant current state:

- The sequence layout (`packages/core/src/layout.ts`) gives each participant `x`, `header`, optional `footer`, `lifeline { y1, y2, full }`, `created` and `destroyedAt`; each message has `from`, `to`, `points`, `label` and `bounds`; each step lists its `messages`.
- The sequence camera slot exposes `camera.view { x, y, k }` (screen = drawing × k + offset) and the viewport size; `camera.userSet(view)` performs a user camera move (suspends Follow/Cinematic and shows the chip), as the minimap already uses.
- `DiagramController.render()` runs every animation frame and calls `updateMinimaps()` after drawing, with the current step, focus, presentation and morph state at hand — the natural place to update a screen-space overlay.
- Header clicks call `toggleFocus(id, additive)`; `stepInvolves()` in `narrative.ts` resolves the participants a step involves.
- Export frames are drawn by the Canvas backend (`animated/draw.ts`) with `cameraAt(job.camera, t)`; burn-ins are flags on the job (`BurnIn`) drawn after the scene.
- The webview CSP forbids inline style elements; positions must be set through CSSOM.

## Goals / Non-Goals

**Goals:**
- One pure model computes rail entries, markers and tags from layout + view + step, shared by the panel overlay and the export renderer, so both follow the same rules and are unit-testable without a DOM.
- No per-frame DOM churn: overlay elements are created once per participant and only repositioned.
- No change to the SVG scene graph, `sceneAt`, or the host–webview protocol.

**Non-Goals:**
- Changing layout (e.g. reserving space for the rail) — the rail overlays the drawing.
- Rails for footers/bottom edge: the bottom mirror headers do not add information once the top rail exists.

## Decisions

### D1. A pure orientation model in the webview
`webview/src/orientation/model.ts` exports functions of plain data:
- `railEntries(layout, view, viewport, options)` → `{ id, label, x, width, state }[]` where `x` is the lifeline's screen x and `width` the space available before neighbours (half the gap to each neighbouring visible lifeline, minus 8 px). Visibility per participant: `header.y + header.h` in screen space `< 0` (fully above the view), lifeline span `[y1, destroyedAt ?? full]` crosses screen y = 0, screen x within `[0, viewport.width]`. Created participants satisfy the first test only once their header row scrolls above, so no special case is needed beyond using the header rect.
- `edgeMarkers(layout, view, viewport, involvedIds, stepBounds)` → `{ id, label, side, y }[]` for involved participants with screen x `< 0` or `> width`; `y` is the step's screen centre clamped into the view (the view's centre when the step is off-screen vertically).
- `arrowTags(layout, messages, view, viewport, mode, headerVisible)` → `{ text, x, y, anchor }[]`: for each message of the current step, tags at `points[0]` and `points[last]`, offset outward along the arrow's direction and 12 px above the line when the label sits below it (below otherwise), so they avoid the label rect; self-messages get one tag at the start. `auto` filters to participants whose header rect is not within the view.
- Text fitting takes a `measure(text, font)` function (canvas measurement already used by layout) and shortens with an ellipsis; below three characters the entry becomes a `tick`.

Alternative considered: computing inside the renderer package. Rejected because the rail is screen-space UI tied to the camera, which lives in the webview; the renderer stays drawing-space only.

### D2. Panel overlay as HTML over the sequence slot
`webview/src/orientation/overlay.ts` (`OrientationOverlay`) owns a positioned container inside the sequence slot (like the minimap), with a band element, one reusable name element per participant (keyed by id), marker buttons and tag elements. `update(model output, opacity)` sets `transform: translateX(...)`, `max-width`, text and state classes via CSSOM each frame; elements not in the output are hidden, not removed. The band background has `pointer-events: none`; names and markers have `pointer-events: auto`. Name clicks call `toggleFocus`; markers call `camera.userSet` with the minimal horizontal pan (lifeline at 24 px from the near edge). The container is `aria-hidden`, except markers, which are `<button>`s with an accessible name (`Show {participant}`), so keyboard users can reach off-screen participants.

HTML rather than an SVG layer outside the camera group: CSS text-overflow/ellipsis, theme tokens and `backdrop-filter` come for free, and the minimap already sets the pattern. The fade is a CSS opacity transition (disabled under reduced motion by the existing reduced-motion class).

Alternative considered: drawing names in drawing space with an inverse-scale transform. Rejected: it re-renders SVG per frame and interacts badly with the morph and focus dimming.

### D3. Hook into the frame loop
`updateMinimaps()` becomes `updateOverlays()`, which also calls `orientation.update(...)` when the sequence view (or split) is shown, not morphing, and the engine is native; otherwise the overlay is hidden. Current-step inputs (involved participants, messages, whether an arrow is drawing) come from the step list and the scene time already known to the controller; tags fade in over the arrow's draw window using the step's transition times from the timeline, so they stay consistent with `sceneAt`.

### D4. Settings
`display.participantNames` (`auto` | `off`, default `auto`) and `display.arrowEndNames` (`off` | `auto` | `always`, default `off`) join `AnimatorSettings.display` resolution, `WEBVIEW_SETTING_KEYS` and the manifest; the sidecar schema is regenerated (`scripts/sidecar-schema.mjs`), so sidecars can set them. Changes apply live through the existing `settings/changed` path.

### D5. Export burn-in
`BurnIn` gains `names: boolean` (sheet checkbox *Participant names*, default from `participantNames !== 'off'`). `drawBurnIns` calls `railEntries` with the frame's `cameraAt(job.camera, t)` view scaled by the export pixel scale and draws the band and names with the Canvas 2D API and the job palette/fonts. It runs in the worker like the other burn-ins (the model is DOM-free), so frames stay a function of `t`. Measurement uses the worker's canvas `measureText` with the embedded fonts already registered there.

## Risks / Trade-offs

- [The band covers the top 24 px of the drawing] → it is translucent, appears only when headers are off-screen (so nothing header-related is hidden), and pointer events pass through the background.
- [Crowded rails at low zoom with many participants] → ellipsis and ticks with hover names; at low zoom headers are usually on-screen, so the rail rarely shows then.
- [Tags colliding with neighbouring messages' labels in dense diagrams] → tags only on the current step's messages and positioned away from their own label; `arrowEndNames` defaults to `off`.
- [Per-frame cost] → the model is O(participants + current messages) with cached measurements per label/width; DOM writes are transforms only.
- [Export text measurement differences between worker and main thread] → both use the same embedded fonts (verified in M3), and the rule set is the same pure model.

## Migration Plan

Additive: new settings with defaults, no stored-state changes. Rollback is removing the overlay and settings; sidecars that set the new keys are then accepted by the schema's open `settings` object and ignored.
