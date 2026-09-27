# Design

## Context

See proposal.md for the motivation. The facts that shape the approach:

- **Timeline and scene.** Playback position −1 (time 0) is the initial state. `positionAt` returns `index: -1` only for `t <= 0`. `sceneAt`/`topologySceneAt` derive every element's state from the step index `k`. With `futureSteps: hidden`, step 0 shows only participant headers. The Mermaid fallback (`GenericDiagram.renderAt`) hides every group at step 0, and the HTML player's generic reveal (`player/main.ts`) duplicates that logic. Animated SVG, GIF/video frames and the HTML player all sample the same scene functions.
- **Mermaid labels.** The fallback renders with `htmlLabels: false`. In that mode Mermaid's `nonMarkdownToLines` tokenizes a label with `/<[^>]+>|[^\s<>]+/g`, so `<b>` and `</b>` become separate words. They are measured, wrapped and drawn as text, which explains the tag-only lines in the screenshot. Mermaid can only draw bold and italic `tspan`s for markdown strings (a backtick-quoted label), which not every diagram type supports.
- **Native labels.** The sequence parser decodes entities and turns `<br>` into `\n`. Everything else is literal. `wrapText` works on plain strings, and `Measure` has one font per `FontRole` (`measure.ts`, `canvas.ts`).
- **Camera.** `Camera` reports gestures through `onUserMove`. The controller then sets `followSuspended`, which stops following and shows the *Resume following* chip. `toggleFollow` cycles through suspended, manual and follow. Automatic moves may hold the player (`hold('camera')`) until they finish. `pauseOnHover` is a separate `hold('hover')`.
- **Toolbar.** The toolbar lives in `App.tsx`, built from `IconButton`s and small anchored menus (`ExportMenu`, `ViewSwitcher`). Zooming exists only as `controller.zoom(factor)` bound to `+`/`-`.

## Goals / Non-Goals

**Goals:**
- Keep `sceneAt(t)` a pure function of time with the overview and its clear built in, so scrubbing, reverse playback and every export behave consistently.
- Parse formatting once, in `core`, and give all non-drawing consumers plain text without asking each one to strip tags.
- Keep the fallback's formatting within Mermaid's own measuring and wrapping, so boxes fit.

**Non-Goals:**
- Other HTML in labels (`<u>`, `<code>`, `<span style>`, links) and Mermaid markdown strings in native sequence diagrams.
- Changing the step list, step numbering, deep links or sidecar keys. The overview is not a step.
- A zoom percentage input field. Presets cover the need.
- Changing `+`/`-`/`0` or adding new zoom shortcuts.

## Decisions

### D1. Overview is a display option; the clear lives inside step 1's transition

`DisplayOptions` gains `overview: boolean`, resolved from `playback.initialOverview` and `@animator overview=`. `buildTimeline(steps, { overview })` then:
- sets `starts[0] = leadIn`, where `leadIn` is the overview dwell (`dwellMs`);
- adds `CLEAR_MS = 240` (`DURATION.base`) to `transitions[0]`;
- records `clear: CLEAR_MS` on the timeline.

`positionAt` returns index −1 for any `t <= starts[0]`, which fixes the binary search for a non-zero first start. `stepEnd(-1)` stays 0.

The scene functions handle the overview as follows:
- **At index −1 with the overview on**, they compute states as if the last step had rested, then drop current-step emphasis: every element is `past` at full opacity, unplayed items stay unplayed, and focus dimming still applies.
- **At index 0**, content that is only visible because of the overview fades out with `1 - windowed(e, 0, clear)`. Step 1's own choreography runs on `e - clear`. Motion `none` and reduced motion skip the fade (a cut).

`GenericDiagram.renderAt` and the player's generic reveal get the same two rules.

The existing player needs no special handling:
- `next()` from −1 jumps to `starts[0]`, skipping the overview dwell, and plays the clear.
- `previous()` rewinds through the clear back to t = 0.
- Autoplay, loops and animated exports play the lead-in, so the overview holds for `dwellMs`.

*Alternatives considered:*
- A synthetic "step 0" in the step list. Rejected: it shifts step numbers, ids, deep links, sidecar captions and the inspector list.
- Fading the overview out while step 1 draws. Rejected: two animations overlap, and the user asked for "clear, then start".
- A controller-side (non-pure) overlay. Rejected: exports and scrubbing would disagree with the panel.

### D2. Labels become plain text plus formatting marks

A new `core/inline.ts` provides `parseInline(text)`, which returns `{ plain, marks }`. Each mark is a character range over `plain` (`{ start, end, bold?, italic? }`). It recognizes `<b|strong|i|em>` and their closing tags (case-insensitive, optional whitespace before `>`) and applies the unmatched-tag rules in the specs. It runs after `<br>` normalization and before entity decoding, so an entity-encoded `#lt;b>` stays literal.

The sequence model keeps `label: string` but now stores `plain`, and adds optional `marks` where formatting exists. Topology nodes carry the same pair. Every current consumer of `label` therefore gets plain text: captions, transcript, search, announcements, inspector, tooltips and file names.

*Alternative considered:* keeping the raw markup in `label` with helpers to strip or parse it. Rejected: every consumer would have to remember to strip it, and a missed one leaks tags.

### D3. Formatting-aware measurement, wrapping and drawing

- **Measurement.** `Measure` gains an optional style argument: `(text, role, style?: { bold?, italic? })`. `FONTS` gets bold variants per role: labels and notes at weight 650, participants at 720 because their base weight is 560. Italic uses `italic` in the font string, and results are cached per style.
- **Wrapping.** `wrapText` gets a mark-aware sibling that breaks at the same word boundaries. It measures each line as the sum of its styled segments and returns lines as segments (`{ text, bold?, italic? }[]`). Plain callers keep the current signature.
- **Drawing.** SVG renderers (`svg.ts`, `topologySvg.ts`, the orientation overlay) emit one `tspan` per segment with `font-weight`/`font-style`. The canvas renderer draws the segments one after another with `ctx.font` switched per segment, keeping the current alignment by measuring the whole line first. Animated SVG reuses the static SVG structure, so it inherits the `tspan`s.

### D4. Mermaid fallback: invisible markers before the render, styling after it

Before `mermaid.render`, `fallback.ts` rewrites the source. For each formatted span it removes the tags and prefixes every word inside the span with a zero-width marker: U+2063 (invisible separator) for bold and U+2062 (invisible times) for italic, both if nested. These characters are not whitespace, so Mermaid's tokenizer keeps them attached to their word. They are zero-width, so measuring and wrapping see the untagged text.

After the render, a pass walks the SVG's text nodes. Any text node, or run inside one, that starts with a marker has the marker removed and is wrapped in or restyled as a `tspan` with bold weight or italic style. Group labels used as step names have markers stripped.

If Mermaid fails to parse the rewritten source, the fallback renders the original source unchanged. Tags then show as text, as they do today, and a debug log records the retry.

Mermaid measured the bold words at regular weight, so the bold weight is 650, not 700. Most node padding absorbs the difference of a few percent. The post-pass also compares each label's rendered width to its shape and, if it overflows, reduces the letter spacing of the bold `tspan`s to compensate.

*Alternatives considered:*
- Converting labels to Mermaid markdown strings. Rejected: only some diagram types support them, and they change wrapping behaviour (`markdownAutoWrap`).
- Restyling the literal tag tspans after rendering. Rejected: Mermaid has already wrapped with the tag widths, so stray tag-only lines remain.
- `htmlLabels: true`. Rejected: `foreignObject` labels depend on CSS for measuring and break PNG rasterization.

### D5. Following is a mode; user moves pause playback and mark the camera as displaced

- **State.** The controller drops `followSuspended`, and each camera slot gets `displaced: boolean`.
- **`onUserMove`:** cancel any camera tween, release `hold('camera')`, set `displaced` on the slot, and call `player.pause()` if playing. This is a real pause, not a hold, so leaving the canvas with the pointer does not resume playback.
- **Framing on a step change** (`onStepChanged`, both directions when displaced, forward only otherwise), per mode:
  - `follow` calls `followView` starting from the user's current view, so the zoom stays as the user left it. It pans the minimum distance and zooms out only when the step exceeds the safe area, as today.
  - `cinematic` runs `cinematicView` from the current view, which has the 1.6× zoom-change limit built in.
- **Play after a pause.** The controller subscribes to the player snapshot. When `playing` goes from false to true while a visible following slot is displaced, it frames the current step and holds the player with `hold('camera')` until the camera arrives. `displaced` then clears.
- **`toggleFollow`** toggles between `manual` and the configured following mode (`follow`, or `cinematic` while presenting or when configured).
- **UI.** The chip and its string are removed, and the eye button's pressed state reads `following` only.
- **Overview framing (initial-overview spec).** `applySlotMode` fits the whole diagram at step 0 when the overview is on. When leaving step 0 in `follow` mode:
  - if the slot is not displaced, the controller first applies the old "top, width-fit, ≤ 100 %" zoom centred on step 1 instead of `followView`, because `followView` from a fitted view would never zoom in;
  - if the user zoomed during the overview, it keeps the user's zoom.

*Alternative considered:* keep playing and re-frame at the next step. Rejected: the camera would jump away seconds after the user moved it, which is the disorientation the user reported.

### D6. Zoom controls read the camera, and the active slot is the last one touched

- **Level.** The controller exposes `zoomLevel` (a signal). It is updated from `Camera.onChange` of the active slot, which is the slot with the most recent pointer or wheel event and the sequence slot by default.
- **Actions.** `zoomTo(k)` applies `userSet` about each visible slot's centre. It is a user move, so D5's pausing applies. *Fit* keeps calling `fit()`, which is programmatic and does not pause.
- **UI.** A `ZoomGroup` component in `App.tsx` holds *Zoom out*, a percentage button (`Math.round(k * 100)` %) that opens a `menu` like `ExportMenu`, and *Zoom in*. Its buttons are disabled at the `ZOOM_MIN`/`ZOOM_MAX` limits. The factor stays 1.2 to match the keys.

### D7. Settings button goes through the host

- **Protocol.** New webview message `settings/open` with an empty payload, validated with `shape({})`.
- **Host.** `panel.ts` runs `workbench.action.openSettings` with `@ext:${context.extension.id}`. The id comes from the host, never from the payload.
- **Command.** `mermaidAnimator.openSettings` (icon `$(gear)`) runs the same code. It is listed in the palette and in the Diagrams view's `view/title` (`navigation@3`).
- **Webview.** The toolbar adds an `IconButton` with the `settings-gear` codicon after the keyboard button.
- **Web host.** `workbench.action.openSettings` is available there too, so the host stays web-compatible.

### D8. Settings plumbing and defaults

- **`playback.initialOverview`** (boolean, default `true`): add it to `package.json`, the NLS files (en/es), `WEBVIEW_SETTING_KEYS`, `animator.schema.json`, `ANIMATOR_VALUES` (`overview: ['true','false']`) and `resolveSettings`.
- **`display.arrowEndNames`:** the default becomes `auto` in `package.json`, `DEFAULT_SETTINGS`, the schema description and the README table. Users who set the value explicitly keep it.

## Risks / Trade-offs

- [Existing users now see the whole diagram at step 0 and a longer timeline (plus `dwellMs` + 240 ms)] → The setting and annotation disable it, and the CHANGELOG calls it out. Nothing persists timeline times (positions are step indices and ids), so saved state and deep links are unaffected.
- [Unicode markers may be rejected or re-encoded by some Mermaid diagram grammars] → Retry with the original source on any parse or render error, so the only loss is formatting. Unit-test the rewrite on flowchart, class, state and mindmap samples.
- [Bold text in fallback labels is slightly wider than Mermaid measured] → Weight 650 plus the letter-spacing compensation in the post-pass. Verify visually with the architecture document from the report.
- [Pausing on every small pan could annoy users who scroll a little during autoplay] → This matches the request. The pause is visible (the play button changes), one `Space` resumes, and the camera returns to the step first.
- [An overview of a very large diagram draws every element at step 0] → This is the same element count as the last step, which the performance budget already covers. No extra layout work.
- [Behavioural removal of the *Resume following* chip] → Documented in the camera spec delta (REMOVED with migration) and in the CHANGELOG.

## Migration Plan

No data migration is needed. The release ships the new setting, the changed `arrowEndNames` default and the removed chip, with a CHANGELOG entry under *Changed* that explains each and how to restore the old step-0 behaviour (`mermaidAnimator.playback.initialOverview: false`). Rollback is a normal version downgrade, and no persisted state changes shape.
