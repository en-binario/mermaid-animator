# Proposal

## Why

Once the camera zooms into a sequence diagram (Follow, Cinematic, or panning by hand) the participant headers and footers leave the viewport, and what remains is a set of identical dashed lifelines: users can no longer tell which line is *Gateway* and which is *Auth*. This happens both while exploring a paused diagram and during playback, and it also affects Cinematic GIF/video exports, whose frames show unlabelled lifelines.

## What Changes

- **Participant rail.** When participants' headers have scrolled above the top of the sequence view, a slim, translucent band pinned to the top edge shows their names, each centred on its lifeline's on-screen position and kept at a constant on-screen size at any zoom. Names shorten to fit their column, follow the current-step and focus styling, and clicking one focuses that participant as a header click does. The rail appears and disappears on its own (never while all headers are visible).
- **Off-screen participant markers.** When the current step involves a participant whose lifeline is left or right of the viewport, a marker with its name and a chevron sits on that edge; activating it pans the lifeline into view.
- **Arrow-end name tags (optional).** A new setting shows small sender and receiver name tags at the ends of the message(s) playing in the current step — `off` (default), `auto` (only for participants whose header is not visible) or `always`.
- **Export burn-in.** GIF and video exports gain a *Participant names* burn-in that draws the rail into frames where the export camera hides the headers (Cinematic or current view).
- **Settings.** `mermaidAnimator.display.participantNames` (`auto` default, `off`) controls the rail and markers; `mermaidAnimator.display.arrowEndNames` (`off` default, `auto`, `always`) controls the tags. Both are per-diagram settings, so sidecars can set them. English and Spanish strings.

Non-goals: the topology view (nodes are already labelled) and generic Mermaid diagrams; the animated SVG and HTML player exports (their view is fixed to the whole diagram); new `@animator` annotation keys; names repeated along lifelines.

## Capabilities

### New Capabilities
- `participant-orientation`: keeping sequence participants identifiable when their headers are out of view — the participant rail, off-screen participant markers and optional arrow-end name tags, and how they behave across views, modes and reduced motion.

### Modified Capabilities
- `animated-export`: a *Participant names* burn-in for GIF and video exports.

## Impact

- `packages/webview`: a new orientation overlay for the sequence camera slot, updated from the existing per-frame pass that drives the minimaps; a pure layout model for rail entries, markers and tags (unit-tested); settings resolution; export sheet option; Canvas drawing of the rail in export frames.
- `packages/protocol`: new webview strings (EN/ES).
- `packages/extension`: two new contributed settings (`package.nls*.json`), `WEBVIEW_SETTING_KEYS`, regenerated sidecar schema, README.
- No new dependencies; no change to the host–webview message set.
