# Tasks

## 1. Fragment semantics (core)

- [ ] 1.1 Add fragment keys and the new compile options (`loopIterations`, `compressRepeats`, `altBranches`, `parallel`, `branchChoices`) with precedence inspector → `@branch` → setting; verify unit tests for key stability across edits and precedence
- [ ] 1.2 Implement loop expansion with iteration frames, iteration-aware structural ids and compressed repeats, capped at 50 with a warning; verify unit tests including the three-iteration scenario
- [ ] 1.3 Implement branch selection (`first`, `all`, `ask` choice flag + hold, `skip` for `opt`); verify unit tests for each mode and that unplayed branches stay in `unplayed`
- [ ] 1.4 Implement concurrent `par` lanes (zip, `lanes`, `sources`, max transition) and `sequential`; verify unit tests for uneven lanes and contiguous indices
- [ ] 1.5 Extract `annotationTargets` and export `DIRECTIVE_DOCS`; apply `@focus`, `@latency`, `@caption`, `@chapter` effects; verify unit tests and that existing M1 tests still pass

## 2. Rendering and scene (renderer)

- [ ] 2.1 Change `messageStep` to multiple steps per message and derive state from the latest step ≤ k; verify scene unit tests for repeated loop messages
- [ ] 2.2 Emit a pulse per current message and render a pulse pool; verify a scene test with two lanes and a harness frame showing two pulses
- [ ] 2.3 Add fragment iteration state and the `n / N` tab label; verify scene test and harness check
- [ ] 2.4 Add focus dimming (opacity 0.18 + ink-3, dotted in HC) as a scene input; verify scene tests for single and multi-focus

## 3. Playback and camera (webview)

- [ ] 3.1 Add Player ranges (A–B) and a skip set for focused playback; verify player unit tests
- [ ] 3.2 Add `cinematicView` and the `cinematic` camera mode (with `@focus` targets) reusing the camera hold; verify camera unit tests and a harness check
- [ ] 3.3 Implement the `ask` choice chips on canvas and resume after choosing; verify in the harness with an `ask` fixture

## 4. Narrative, inspector and exploration (webview)

- [ ] 4.1 Build the caption strip with the whitelist inline parser; verify unit tests for the parser (including literal `<b>`) and a harness screenshot
- [ ] 4.2 Build chapters: scrubber ticks with tooltips, chapter list, `Shift+←/→`; verify unit test for chapter derivation and harness check
- [ ] 4.3 Build the inspector (sections, responsive beside/overlay, `D`, persisted section state, branch chips recompiling with position preserved); verify harness checks at 1000 px and 700 px
- [ ] 4.4 Implement participant focus / multi-focus, *Play only focused steps* and hatched scrubber ranges; verify harness check
- [ ] 4.5 Implement search (`/`, `Ctrl/Cmd+F`) over participants, labels, notes and captions with canvas and scrubber highlights; verify unit test for the search index and harness check
- [ ] 4.6 Build the transcript view (`R`, chapters, captions, `aria-current`, seek on activate); verify harness keyboard check and an axe-style audit of roles

## 5. Presentation mode (webview + host)

- [ ] 5.1 Webview presentation overlay: cinematic camera, auto-hiding chrome, serif captions, title and chapter cards, progress hairline, blank screen, laser pointer, clicker keys; verify harness screenshots of title card, chapter card and a step
- [ ] 5.2 Host presentation layout via `presentation/toggle` / `presentation/state`, maximise/restore and guarded Zen Mode; commands *Start/Stop Presentation*; verify integration test that the commands exist and state round-trips

## 6. Editor integration (host)

- [ ] 6.1 Send `seekToLine` for `sync.cursorToStep` (`click`/`follow`/`off`) and resolve it in the webview; verify integration test that clicking a message line moves the step decoration there
- [ ] 6.2 Annotation completions (names, `@animator` keys/values, participant ids, branch labels, types); verify integration test with `vscode.executeCompletionItemProvider`
- [ ] 6.3 Annotation hovers with target statement and step; verify integration test with `vscode.executeHoverProvider`
- [ ] 6.4 Quick fix for unknown directives and *Insert Annotation…*; verify integration test applying the code action
- [ ] 6.5 Annotation highlighting decoration and `annotations.highlight`; verify manual check in the Extension Development Host

## 7. Settings, localisation and docs

- [ ] 7.1 Contribute the new settings and commands (chapters, presentation, transcript, insert annotation) with English/Spanish strings; verify the localisation parity test
- [ ] 7.2 Update the product specification where implementation differs (e.g. presentation layout commands) and the extension README; verify documented shortcuts match the keyboard handler

## 8. Integration checks

- [ ] 8.1 Run lint, typecheck, unit, conformance and integration suites (development and production builds); verify all pass
- [ ] 8.2 Harness walkthrough of the checkout demo in Ivory, Graphite and high contrast: captions, chapters, inspector, focus, search, `ask` branches, concurrent `par`, presentation, transcript; verify screenshots reviewed against the design QA checklist (spec §9.11)
