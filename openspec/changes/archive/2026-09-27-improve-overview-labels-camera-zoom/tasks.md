# Tasks

## 1. Settings defaults and plumbing

- [x] 1.1 Change the `mermaidAnimator.display.arrowEndNames` default to `auto` in `packages/extension/package.json`, `DEFAULT_SETTINGS` (`packages/webview/src/settings.ts`), `schemas/animator.schema.json` and the README settings table. Update `packages/extension/test/suite/orientation.test.ts` (expects `defaultValue` `auto`) and `packages/webview/test/settings-announce.test.ts` (fallback `auto`). Verify with `npm test -w packages/webview` and the extension integration suite.
- [x] 1.2 Add `mermaidAnimator.playback.initialOverview` (boolean, default `true`) to `package.json`, `package.nls.json` and `package.nls.es.json`, `WEBVIEW_SETTING_KEYS` (`environment.ts`) and `animator.schema.json`. Add `overview: ['true','false']` to `ANIMATOR_VALUES`/`ANIMATOR_KEYS` in `core/annotations.ts`. Resolve `overview` into `DisplayOptions` in `resolveSettings`, with the annotation overriding the setting. Verify with a `settings-announce.test.ts` case for setting vs `@animator overview=false`, and an `annotations.test.ts` case for validation and completions.

## 2. Initial overview: timeline and native scenes

- [x] 2.1 Extend `buildTimeline` with `{ overview, leadInMs }`. It sets `starts[0] = leadInMs`, adds `CLEAR_MS = 240` to `transitions[0]` and records `clear` on `Timeline`. Make `positionAt` return index −1 for `t <= starts[0]`. Verify with new `core` tests: no overview gives the timeline exactly as before; with the overview, `next` from −1 lands at `stepEnd(0)`; `snapTime` and `resolvePosition` still work.
- [x] 2.2 Add `overview` to `DisplayOptions` and `DEFAULT_DISPLAY`. Implement the index −1 overview state in `sceneAt`: every message, note, activation, fragment and created/destroyed participant is drawn as rested after the last step, with no emphasis, and unplayed and focus dimming still apply. At index 0, fade overview-only content over `clear` and offset step 1's choreography by `clear`, cutting under `minimal`/`none`. Verify with `renderer/test/scene.test.ts` cases for step 0 (all messages at opacity 1 with `futureSteps` hidden and ghosted), mid-clear opacities, step 1 drawing only after the clear, and the overview off matching previous output.
- [x] 2.3 Apply the same overview and clear rules in `topologySceneAt`: all nodes and edges at full count at −1, cleared at the start of step 1. Verify with `topology-scene.test.ts` cases.
- [x] 2.4 Pass the overview option and the lead-in (`dwellMs`) through the controller's `timeline()` and the player, and announce the overview at step 0 (new `announce.overview` string in `protocol/strings.ts` and the `es` l10n bundle). Verify with `player.test.ts`: *Next* from 0 skips the lead-in and plays the clear, *Previous* from 1 returns to 0, and autoplay dwells on the overview. Also verify the announcement in `settings-announce.test.ts`.

## 3. Initial overview: fallback, framing and exports

- [x] 3.1 Implement the overview in `GenericDiagram.renderAt` and the timeline it builds (all groups visible at −1, cleared during step 1's first 240 ms), and mirror it in the HTML player's generic reveal (`player/main.ts`). Verify with a unit test around the reveal-opacity function, extracted if needed, and by opening a flowchart in the extension development host: step 0 shows the whole chart and `→` clears it before revealing the first node.
- [x] 3.2 Overview framing in the controller: at step 0 with the overview on, `follow`/`cinematic`/`auto→follow` slots fit the whole diagram. Leaving step 0 in `follow` without a user zoom frames step 1 at the width-fit zoom (≤ 100 %); with a user zoom it keeps that zoom. Verify with a `camera.test.ts` test for the leave-overview view function, and manually on a long sequence diagram.
- [x] 3.3 Check that animated SVG, GIF/video frames (`animated/frames.ts`) and the HTML player include the overview hold and the clear, and that a static export at step 0 shows the overview. Verify with a `frames.test.ts` case (the first frame shows every message, a frame in the clear shows fading opacity) and an `animated-svg.test.ts` case for keyframes at t = 0.
- [x] 3.4 Document the overview (behaviour, setting, `@animator overview=false`) in the extension README, and add *Changed* and *Added* CHANGELOG entries. Verify that the README settings table lists `playback.initialOverview`.

## 4. Inline label formatting: core

- [x] 4.1 Add `core/src/inline.ts` with `parseInline(text) → { plain, marks }` (b/strong/i/em, case-insensitive, nesting, unmatched-tag rules) and export it from `core/index.ts`. Verify with a new `core/test/inline.test.ts` covering bold, italic, nesting, across `<br>`, an unclosed opener, a stray closer, `<B >` and non-formatting tags left literal.
- [x] 4.2 Use `parseInline` in the sequence parser's label cleanup after `<br>` normalization and before `decodeEntities`, for messages, notes, fragments and branches, participants and boxes. Store the plain `label` plus optional `marks`, and carry the marks into topology nodes. Verify with `sequence-parser.test.ts` cases for the spec scenarios (bold run, `#lt;b>` literal) and a conformance run (`npm test -w packages/core`) with no regressions.
- [x] 4.3 Extend `Measure` with an optional style and add a mark-aware wrapper beside `wrapText` that returns styled segments per line. Use it in `layout.ts` (messages, notes, headers, fragments) and `topologyNodeSize`. Verify with `layout.test.ts`: a bold label measures wider than the same plain label, and wrap points are computed without tag text.

## 5. Inline label formatting: rendering and exports

- [x] 5.1 Add bold and italic font variants to `renderer/measure.ts` (`FONTS`, with a per-style cache key). Emit styled `tspan`s in `svg.ts`, `topologySvg.ts` and the orientation overlay (rail entries, arrow-end tags). Verify with a renderer test that a bold message label produces a `tspan` with bold `font-weight` and no `<b>` text.
- [x] 5.2 Draw styled segments in `canvas.ts` (GIF and video frames), switching `ctx.font` per segment while keeping alignment. Verify with a `frames.test.ts` or canvas unit test that uses a stub context to record the fonts set for a mixed label.
- [x] 5.3 Fallback: rewrite formatting tags into U+2063/U+2062 word markers before `mermaid.render`, and retry with the original source on failure. Post-process the SVG text nodes to strip markers and apply bold/italic `tspan`s, with the overflow compensation. Strip markers from group labels. Verify with a unit test of the source rewrite and a test of the post-pass on a hand-built SVG fragment. Then open the architecture document from the report (`FirmaDigitalService` and similar nodes) in the development host and confirm bold text, no tag-only lines, and text inside the node borders.
- [x] 5.4 Confirm that plain text reaches captions, transcript, search, inspector list, tooltips, announcements and export file names. Verify with a `narrative.test.ts` or search test that a `<b>` label is found by its plain text and shown without tags.
- [x] 5.5 Document supported inline formatting in the README (supported tags, and that other HTML stays literal) and add a CHANGELOG *Added* entry. Verify by reading the rendered README section.

## 6. Camera: following survives user moves

- [x] 6.1 Replace `followSuspended` with a per-slot `displaced` flag. `onUserMove` cancels the tween, releases `hold('camera')`, marks the slot as displaced and pauses a playing player. `toggleFollow` switches between `manual` and the configured following mode. Verify with a controller-level test (or a unit test of the extracted follow-state logic): a user move while playing sets playing to false, `following` stays true, and pointer leave does not resume.
- [x] 6.2 Frame displaced slots on the next step change (forward or back) from the user's current zoom, and on the paused-to-playing transition frame the current step with `hold('camera')` before continuing. Verify with a `camera.test.ts` case that `followView` from a user view keeps `k`, plus a manual check: zoom to 200 % during autoplay, press `Space`, and the camera returns to the step at 200 % and playback continues.
- [x] 6.3 Remove the *Resume following* chip (`App.tsx`, the `.ma-resume` styles in `app.css`, the `camera.resume` string and its l10n entry) and make the eye button's pressed state reflect `following` only. Update the shortcuts overlay text for `C` if needed. Verify with `npm run build` and `tsc` clean, and confirm the chip no longer appears after panning.
- [x] 6.4 Update README camera documentation (no chip; user moves pause playback; `C` turns following off) and add a CHANGELOG *Changed* entry. Verify that the README no longer mentions *Resume following*.

## 7. Zoom controls

- [x] 7.1 Add the `zoomLevel` signal (the active slot is the last one with a pointer or wheel event, the sequence slot by default) and `zoomTo(k)` to the controller, both counting as user moves. Verify with a unit test of the zoom-about-centre helper (for example, `zoomTo(0.5)` keeps the viewport centre fixed and clamps to 0.1–8).
- [x] 7.2 Add a `ZoomGroup` to the toolbar in `App.tsx` beside fit and frame: *Zoom out*, a percentage button with a preset menu (25–400 %, *Fit*, current value marked, keyboard operable, `Escape` or outside click closes it) and *Zoom in*, disabled at the limits. Add strings to `protocol/strings.ts` and the `es` bundle, and styles in `app.css` using Ink & Ivory tokens. Verify in the development host: the percentage tracks Ctrl+wheel and automatic moves, choosing 50 % reads 50 %, and zooming during playback pauses it.
- [x] 7.3 Document the zoom group in the README and the shortcuts section. Verify that the README toolbar section lists the zoom controls.

## 8. Settings access

- [x] 8.1 Add the `settings/open` webview message to the `protocol` union and validator (empty payload, extra fields ignored). Verify with a `protocol.test.ts` case that it validates.
- [x] 8.2 Handle `settings/open` in `panel.ts` by opening `workbench.action.openSettings` with `@ext:${context.extension.id}`. Add the `mermaidAnimator.openSettings` command (icon `$(gear)`, localized title, palette and Diagrams `view/title` `navigation@3`). Verify with an extension integration test that the command is registered and that the panel handling a `settings/open` message invokes the settings command (stubbed).
- [x] 8.3 Add the gear `IconButton` (`settings-gear` codicon, localized label) at the end of the webview toolbar, posting `settings/open`. Add README and CHANGELOG entries. Verify in the development host that clicking it opens Settings filtered to Mermaid Animator.

## 9. Integration checks

- [x] 9.1 Run `npm run build`, `npm test` for all workspaces, and the extension integration suite. Verify that everything passes with no type errors.
- [x] 9.2 End-to-end walkthrough in the development host with the report's `architecture.md` (flowchart) and a long sequence sample. Confirm the step-0 overview, then the clear, then the reveal; bold labels; the gear button; following kept through pan and zoom, with the pause and resume behaviour; the zoom group; arrow-end tags appearing when zoomed in; and a GIF and an HTML player export that start with the overview. Verify by recording the result in the PR description.
- [x] 9.3 Run `openspec validate improve-overview-labels-camera-zoom --strict` and verify it reports the change as valid.
