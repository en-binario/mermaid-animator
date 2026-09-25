# Design: M1 — Sequence MVP

## Context

Builds on `add-m0-foundations` (monorepo, bundles, protocol v1, theme tokens, panel manager, serializer). Motivation: `proposal.md`. Behaviour: `specs/`. Product-level architecture: specification §13 (pipeline, data model, runtime) as revised in v1.1 after the technical review (ADR-010…013).

The Mermaid 12.0.0 sequence grammar was inspected directly (jison lexer rules and productions in the published package) to fix the statement forms listed in `specs/sequence-parsing`: 94 lexer rules including the sixteen half-arrow tokens, `()` central connections, `par_over`, `properties`/`details`, `;` separators, and `%`/`#` comments.

## Goals / Non-Goals

**Goals:**
- End-to-end: open → parse → compile → layout → animate → sync → export, for sequence diagrams, with every other type animating through Mermaid.
- Keep every pipeline stage pure and unit-testable in `packages/core`; DOM work confined to `packages/renderer` and `packages/webview`.

**Non-Goals (deferred per spec §23.2):** captions/chapters UI, inspector, minimap, focus/search, branch explorer, loop iterations > 1, concurrent `par`, Cinematic camera, presentation mode, topology/split/trace/transcript views, animated exports, sidecar files, annotation IntelliSense (completions/hover), Diagrams tree view, status-bar item.

## Decisions

### D1. Hand-written, line-oriented parser mirroring Mermaid's lexer
`core/parse/sequence` splits the source into logical statements (newline and `;`, respecting entity codes), then classifies each statement with anchored regular expressions ported from Mermaid's lexer rules (keyword alternatives are case-insensitive, actor names exclude `/\+()<>-:,;` except hyphens not forming arrows). Arrow recognition tries tokens longest-first, exactly as Mermaid's rule order does. A block stack handles fragments and boxes; unknown statements yield an error diagnostic and parsing continues. *Alternative:* running Mermaid's jison parser — rejected (ADR-001): no source ranges and DOM dependencies in the host.

### D2. Differential conformance tests against Mermaid
`fixtures/mermaid/sequence/*.mmd` (valid and invalid cases derived from the grammar and the Mermaid documentation) is checked by a Vitest suite that runs `mermaid.parse()` under jsdom and compares acceptance with the native parser. Semantic checks Mermaid performs in its database (e.g. a `create` must be followed by a message to the created participant) are mirrored.

### D3. IR and step list per spec §13.5 (v1.1)
Types live in `core/ir`. `Step` carries `id`, `structuralId`, `index`, `kind`, `targets`, `fragmentPath`, `timing`, `source`, `sources` and optional `lanes`, `caption`, `chapter`, `emphasis`. IDs use FNV-1a 64-bit (BigInt-free implementation over two 32-bit halves) rendered base-36.

### D4. Timeline as step windows, scene as a pure function
`core/timeline` computes `stepStarts[]`, per-step `transitionMs`/`dwellMs` and total duration; `positionAt(t) → { stepIndex, phase: 'transition'|'dwell', progress }`. `renderer/scene` maps `(layout, steps, position, display options, motion profile)` to a flat scene description (per element: visibility, opacity, draw fraction, pulse position, emphasis). The SVG renderer diffs the scene against the previously applied one and writes only changed attributes. This realises spec §13.7's "visual state = f(t)" without a generic tween interval tree, which M1 does not need; the scene function is the single place where choreography windows (§9.8.3) are encoded.

### D5. Layout with injected text measurement
`core/layout/sequence` receives a `measure(text, font) → width` function: canvas `measureText` in the webview (after `document.fonts.ready`), an average-advance approximation in tests. Output: participant columns, rows, message paths (straight or self-loop), activation rectangles (stack offsets), note and fragment boxes, and an overall bounding box. An `exportPadding` factor (1.08) widens boxes for SVG export (spec §14.4).

### D6. Camera with d3-zoom and our own tween
`d3-zoom` handles gestures and limits; automatic moves are tweened in our rAF loop using `d3-interpolate`'s `interpolateZoom` (van Wijk–Nuij) so they respect speed, reduced motion and the 1.6× per-step cap. Any gesture event not originated by our tween switches Follow to Manual and shows the chip.

### D7. Webview state with signals; one rAF clock
A single `Player` owns `t`, `playing`, `speed`, `loop` and a target (for stepping/reverse). One rAF loop advances `t` and calls `renderer.render(positionAt(t))`. Stepping plays to the end of the next transition; reverse plays backwards at 2×. Hidden panels (`visibilitychange`) pause.

### D8. Position preservation in the webview
On `document/update` the webview recompiles, then resolves the previous current step by `@step-id` → `id` → `structuralId` → cursor range (last `editor/cursor`) → nearest preceding index, and seeks to the end of that step's transition.

### D9. Diagnostics computed in the host
The host runs the same `core` parser for bound diagrams and publishes a `DiagnosticCollection`; the webview does not send diagnostics (avoids duplication). Ranges map from diagram-relative to document coordinates by the locator's offsets.

### D10. Generic fallback in the webview
`import('mermaid')` (lazy chunk) → `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme })` → `mermaid.render(id, source)`. The returned SVG's `<style>` elements are removed and their text installed via `new CSSStyleSheet()` + `adoptedStyleSheets` (CSP-safe); style attributes are permitted by `style-src-attr 'unsafe-inline'` (modified `webview-security` requirement). Groups are selected per type (`.node`, `.edgePath`/`.flowchart-link`, `.cluster`, `.actor`, `.messageLine0/1`, `.pieCircle`, `.task`, `.commit`, …) with a top-level `<g>` fallback, ordered by the rule in `specs/generic-diagram-fallback`, and animated with the same `Player`.

### D11. Static export in the webview, file writing in the host
SVG: clone the live SVG, resolve `var(--ma-*)` to computed colours, inline a `<style>` with `@font-face` data URIs of the bundled fonts, add `textLength`, and re-layout with `exportPadding`. PNG: draw the SVG string via `Image` onto a canvas on the main thread (single frame — the per-frame worker pipeline of ADR-010 is for animated exports in M3), `toBlob`. Copy: `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`. Bytes go to the host (`export/data`), which shows the save dialog and writes via `workspace.fs`.

### D12. Localisation
Host strings via `vscode.l10n.t` with `l10n/bundle.l10n.es.json`; manifest strings via `package.nls.json` / `package.nls.es.json`; webview strings from a keyed catalogue sent in `init`. A unit test compares key sets.

## Risks / Trade-offs

- [Mermaid's parser needs a DOM in Node] → jsdom in the conformance test only; if a diagram type misbehaves under jsdom, the test is limited to the sequence corpus.
- [Mermaid writes style attributes, which the strict CSP would block] → `style-src-attr 'unsafe-inline'` only; scripts stay nonce-locked and there is no network, so CSS-based exfiltration has no channel. Recorded in spec §18.
- [Mermaid chunk size (~3 MB)] → loaded only for fallback diagrams; not part of the initial bundle budget.
- [Scene recomputation per frame for very large diagrams] → diffed attribute writes; culling and level of detail are P1 (M2) items.
- [Visual verification of a webview is hard to automate] → the browser harness renders fixtures in Chromium for manual and scripted screenshots; automated pixel baselines are planned with CI.

## Implementation Notes

Findings made while implementing, reflected in code and (where product-relevant) in the specification:

- **Lexer generated from Mermaid.** `scripts/gen-sequence-lexer.mjs` extracts Mermaid 12.0.0's 94 lexer rules and state table into `lexerRules.generated.ts`; only the state actions are hand-written. Rule matching is first-match (Jison without `flex`).
- **Mermaid's semantic checks mirrored:** created participants must receive the next message; destroyed participants must take part in the next message; deactivating an inactive participant is an error (the `-` shorthand deactivates the *sender*); `create` of an existing id is an error; a participant may belong to one box; the diagram keyword is detected case-sensitively although the lexer is case-insensitive. Corpus agreement: 88/88 files.
- **CRLF.** Mermaid normalises `\r\n` to `\n` before lexing; replacing `\r` with a space let the whitespace rule swallow newlines. The parser now drops `\r` (line/column positions are unchanged).
- **Settle period (spec ADR-016).** The message choreography extends 240 ms past the travel (arrowhead, activation growth, receiver glow), so a step's rest point is `start + transition + settle`; otherwise a paused frame showed a half-dissolved pulse and ungrown bars.
- **Camera hold.** To meet "in view before the arrow draws", Follow holds the playhead at the step's start until the camera tween completes (not an 80 ms lead as the product spec's §8.6.2 text suggests; the observable outcome is the same).
- **Mermaid under the CSP (spec ADR-015).** Mermaid measures labels while its own `<style>` element is blocked. The generic engine renders twice with the same id (the first pass supplies the CSS, adopted as a constructed stylesheet, for the measuring pass) and uses SVG text labels. Blocked-`<style>` console messages from Mermaid are expected.
- **Pure helpers extracted for testing:** `orderGroups` (fallback ordering), `chooseEngine` (routing), `followView`/`fitView` (camera), `resolveSettings`, `announcement`.
- **Test hooks** are exposed through the extension API (`setSaveTarget`), because the integration-test bundle has its own copies of extension classes.
- **Known limitations (deferred):** editor → step seeking on click (the cursor is used only for position preservation in M1; seeking is M2a, FR-SYNC-04); the fallback's state-diagram labels are left-aligned by Mermaid's SVG-label layout; clipboard failure fallback verified by code review only (no clipboard in the test host).
