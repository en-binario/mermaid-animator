# Design: M2a — Narrative & present

## Context

Builds on M1 (archived `2026-09-25-add-m1-sequence-mvp`). Relevant current code:

- `packages/core/src/steps.ts` — `compileSequence` walks fragments with M1 rules (first `alt` branch, one loop pass, sequential `par`), stores `caption`/`chapter` on steps, and computes stable ids from structural signatures.
- `packages/renderer/src/scene.ts` — `prepareScene` maps each message to **one** step (`messageStep: Map<string, number>`); `sceneAt` has a single pulse; `svg.ts` owns one pulse element.
- `packages/webview/src/player.ts` — rest points, holds (`hidden`, `hover`, `scrub`, `camera`), no ranges or skipping.
- `packages/webview/src/controller.ts` / `camera.ts` — Fit/Follow/Manual, `followView`, camera hold before drawing.
- `packages/extension/src/editorIntegration.ts` — CodeLens, decorations, diagnostics, `forwardCursor` (currently only records the cursor for position preservation).

Motivation: `proposal.md`. Behaviour: `specs/`.

## Goals / Non-Goals

**Goals:** complete fragment semantics without changing the timeline model (ADR-011 stays: duration derives from logical columns); keep all new logic pure where possible (`core`, `renderer`, pure webview helpers) so it is unit-testable.

**Non-Goals:** auto-captions, hiding participants, collapsing fragments (P2); topology, split view and minimap (M2b); persistence of choices in sidecar files (M3).

## Decisions

### D1. Compile options carry every playback-shaping choice
`compileSequence(model, annotations, options)` gains `loopIterations`, `compressRepeats`, `altBranches`, `parallel` and `branchChoices: Record<FragmentKey, number | 'all' | 'skip'>`. A **fragment key** is `kind|normalisedLabel#occurrence` (occurrence among fragments with the same kind and label), computed in the compiler, so inspector choices survive edits elsewhere (spec requirement *Stable fragment keys*). Precedence: inspector choice → `@branch` → setting.
*Alternative:* choices applied as a post-filter on a fully expanded list — rejected because unplayed branches must stay drawn but produce no steps, and loop expansion changes structural signatures.

### D2. Loop expansion and identities
Loop bodies are walked `n` times with `FragmentFrame.iteration`. The iteration index is part of `pathSig`, so ids are stable per iteration and adding an iteration never renames earlier steps. Compressed repeats halve `transitionMs` and `dwellMs` in the compiler (timeline stays generic).

### D3. `ask` as a hold plus a pending choice
With `altBranches = ask`, the compiler provisionally plays the first branch and flags the fragment's first step with `choice: { fragmentKey, labels }`; the timeline marks the preceding step as a hold. When the player rests on that hold, the canvas shows branch chips; choosing one recompiles with the choice (D1) and resumes from the same step via `resolvePosition`.

### D4. Concurrent lanes as one step with `lanes`
Lanes are compiled separately then zipped: step k merges the k-th draft of each lane into one `Step` with `messages` from every lane, `lanes[]` and `sources[]`; `transitionMs` is the maximum over lanes (logical columns). The scene already iterates messages; `prepareScene` changes `messageStep` to `Map<string, number[]>` (a message can belong to several steps across loop iterations) and a message's state is taken from its latest step ≤ k.

### D5. One pulse per animated message
`sceneAt` returns a pulse on every current message; `SequenceSvgRenderer` keeps a small pool of pulse elements sized to the maximum concurrency of the step list. Fragment state gains `iteration?: { n, of }`, rendered in the tab as `n / N`.

### D6. Focus as a scene input; focused playback as a player skip set
`sceneAt(model, t, display, { focus })` dims every element not touching the focus set (multi-focus: both endpoints in the set). *Play only focused steps* passes a `skip: Set<number>` to the Player: `next`/`previous` and autoplay jump over skipped steps' windows (setting `t` to the next unskipped start), and the scrubber renders skipped ranges hatched. Step identities and the timeline are unchanged.

### D7. Player ranges
`Player.setRange(a, b)` (rest times); autoplay wraps from `b` to `a`. `I`/`O` set bounds at the current rest point; `Shift+I`/`Shift+O` clear.

### D8. Cinematic camera
A pure `cinematicView(target, viewport, current)` in `camera.ts`: fit the target (step bounds, or the union of `@focus` participants' columns over the step's rows) with 48 px padding, clamp to `limitZoomChange`, and reuse the existing camera hold so framing completes before drawing.

### D9. Narrative UI
`CaptionStrip` renders caption text through a whitelist inline parser (`**`, `*`, `` ` ``) that produces Preact nodes, never HTML strings. Chapters are derived from `Step.chapter` into `{ title, firstStep }[]`; the scrubber draws chapter ticks with tooltips; `Shift+←/→` and the new commands *Next/Previous Chapter* route through `command` actions.

### D10. Inspector and transcript as webview components
`Inspector.tsx` (sections Step, Context, Source, Participants, Chapters, Branches) is laid out beside the canvas via CSS grid at ≥ 880 px and as an overlay sheet below; section state persists through `vscode.setState`. `Transcript.tsx` renders `<ol>` grouped by chapter `<h2>`s with `aria-current="step"`, replacing the canvas while active.

### D11. Presentation mode
Webview: a `presenting` signal switches camera to Cinematic, hides inspector, adds an auto-hide class driven by a 2 s idle timer, renders title/chapter cards (serif display type) and a blank-screen and laser-pointer overlay (a canvas layer following pointer events, brass dot with a fading 12-point trail). Host: on `presentation/toggle` it runs `workbench.action.maximizeEditorHideSidebar`; on exit it runs `workbench.action.toggleMaximizeEditorGroup` only if it maximised the group itself, and `workbench.action.exitZenMode` — which only acts when Zen Mode is active, satisfying the "toggle back only if still in Zen Mode" requirement without reading context keys.

### D12. Editor → step
`forwardCursor` sends `command { action: 'seekToLine', args: { line } }` for mouse selections (`click`) or every move after 120 ms (`follow`); the webview maps the document line through the diagram origin to a step whose `sources` contain it.

### D13. Annotation editor support in the host
`core` exports directive metadata (`DIRECTIVE_DOCS`: summary, scope, argument kinds) and `annotationTargets(model, annotations)` (the statement and step each statement/fragment directive attaches to — the logic already inside `compileSequence`, extracted). The extension registers a `CompletionItemProvider` (trigger `@`, `=`), `HoverProvider` and `CodeActionProvider` (for `annotation/unknown` diagnostics) on the Markdown/MDX/Mermaid selectors, active only when the position is inside a located diagram; *Insert Annotation…* inserts a `SnippetString`; highlighting uses a decoration type with `ThemeColor('textLink.foreground')`.

## Risks / Trade-offs

- [Loop expansion inflates step lists for large `@iterations`] → cap at 50 iterations with a warning diagnostic.
- [Concurrent lanes with very different lengths leave short lanes idle] → accepted; matches the "k-th step together" rule of spec §8.8.
- [Editor layout commands differ across VS Code versions] → verified in integration tests against the declared minimum through `vscode.commands.getCommands`; missing commands degrade to webview-only presentation.
- [Laser pointer and cards add overlay complexity] → isolated in `Presentation.tsx`; disabled under reduced motion except the static dot.
