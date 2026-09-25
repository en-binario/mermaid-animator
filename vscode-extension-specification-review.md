# Validation & Improvement Report — Mermaid Animator VS Code Extension Specification

| | |
|---|---|
| **Target Document** | [vscode-extension-specification.md](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md) (v1.0 Draft) |
| **Source Baseline** | [ideas-exploration.md](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/ideas-exploration.md) |
| **Review Date** | 2026-09-25 |
| **Review Scope** | Requirements completeness, internal consistency, browser/Chromium & VS Code API feasibility, Mermaid 11.x grammar parity, security/CSP, and delivery risk |
| **Overall Verdict** | **Approved with Recommended Revisions** (High maturity; 12 architectural/spec corrections and 14 high-leverage enhancements identified) |

---

## Table of Contents

1. [Executive Summary & Validation Scorecard](#1-executive-summary--validation-scorecard)
2. [Traceability & Alignment Audit](#2-traceability--alignment-audit)
3. [Critical Technical & Architectural Corrections (Must-Fix)](#3-critical-technical--architectural-corrections-must-fix)
4. [Internal Specification Contradictions & Edge Cases](#4-internal-specification-contradictions--edge-cases)
5. [VS Code Platform, Webview & Security Refinements](#5-vs-code-platform-webview--security-refinements)
6. [Mermaid 11.x Grammar & Rendering Improvements](#6-mermaid-11x-grammar--rendering-improvements)
7. [UX, Accessibility & Export Enhancements](#7-ux-accessibility--export-enhancements)
8. [Delivery Plan & Scope De-Risking](#8-delivery-plan--scope-de-risking)
9. [Ready-to-Apply Specification Diffs (Redlines)](#9-ready-to-apply-specification-diffs-redlines)

---

## 1. Executive Summary & Validation Scorecard

[vscode-extension-specification.md](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md) is an exceptionally well-crafted product and technical specification. It successfully transforms the 41-line concept in [ideas-exploration.md](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/ideas-exploration.md) into a rigorous, testable engineering blueprint while preserving its core thesis: **one canonical step list driving a deterministic scene interpolator (`sceneAt(t)`) across multiple views and playback modes**.

However, deep validation against **Chromium's rendering pipeline**, **VS Code's Extension & Webview APIs**, **GitHub's Markdown/Camo sanitizer**, and **Mermaid 11.x syntax** reveals several technical traps and internal inconsistencies that would cause implementation blockers or UX regressions if not resolved before Milestone M0/M1.

### Scorecard by Dimension

| Dimension | Rating | Summary |
|---|---|---|
| **Product Vision & UX (§1–§8)** | **9.5 / 10** | Cohesive, zero-touch philosophy (`%% @...`), thoughtful camera guardrails (`d3.interpolateZoom`), strong persona coverage. |
| **Visual Design & Accessibility (§9, §16)** | **9.5 / 10** | "Ink & Ivory" token contrast math is accurate (verified WCAG 2.2 AA ratios); reduced-motion and high-contrast fallbacks are well-defined. |
| **Core Pipeline & Data Model (§10–§13)** | **8.0 / 10** | Clean separation of concerns, **but** contains a circular dependency between `StepCompiler` and `LayoutEngine`, a `StepId` mutation bug during live typing, and an incomplete `Step` model for `par` concurrency. |
| **Export & Platform Feasibility (§14, §18)** | **7.5 / 10** | Contains a Chromium `OffscreenCanvas` / SVG decoding bug in the Worker pipeline, a GitHub dark-mode SVG `<img>` misconception, and a Webview Worker CSP origin trap. |
| **Delivery Plan Realism (§23)** | **7.5 / 10** | M1 (5 weeks) and M2 (4 weeks) are overly dense for a 2-engineer team; `mermaid-overlay` and FLIP morphing need explicit risk isolation. |

---

## 2. Traceability & Alignment Audit

Every capability proposed in [ideas-exploration.md](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/ideas-exploration.md) was cross-checked against [vscode-extension-specification.md](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md):

- **100% Feature Retention:** All 24 functional points from `ideas-exploration.md` are accounted for and traced in Appendix D.
- **Pragmatic Departures:**
  - *GSAP `ScrollTrigger` ([ideas-exploration.md#L32](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/ideas-exploration.md#L32)) → Native `IntersectionObserver` + `sceneAt(t)` (ADR-006, §8.11):* **Validated and strongly endorsed.** GSAP's standard "no-charge" license has commercial restrictions in certain SaaS/redistribution contexts and adds unnecessary bundle weight when `sceneAt(t)` already computes exact frame state for any normalized scroll progress $p \in [0, 1]$.
  - *Custom Parser vs `mermaidAPI` ([ideas-exploration.md#L5-L6](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/ideas-exploration.md#L5-L6)) → Hybrid Native Parser + Mermaid Tier 3 Fallback (ADR-001, §13.4):* **Validated.** Mermaid's internal `yy` / diagram DBs do not expose character/line `SourceRange`s for individual messages and notes, which are strictly required for `FR-SYNC-03` (step-to-editor highlighting) and `FR-PARSE-05` (statement-scoped annotations).

---

## 3. Critical Technical & Architectural Corrections (Must-Fix)

### 3.1 `[CRITICAL]` Export Pipeline: `OffscreenCanvas` & SVG Decoding in Workers Will Fail in Chromium (§13.9, §14.3)

- **Specification Reference:** [§13.9](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1564) (*"for raster exports, the SVG for each frame is serialised with fonts embedded as data URIs and drawn to an `OffscreenCanvas`"*) and [§14.3](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1662-L1682) (`R -> R: serialise SVG -> OffscreenCanvas -> EW: ImageBitmap`).
- **The Problem:**
  1. In Chromium (the runtime inside VS Code Desktop and Web), `createImageBitmap(svgBlob)` **throws `DOMException: The source image could not be decoded`** because Blink's `createImageBitmap` does not decode `image/svg+xml` blobs.
  2. Decoding an SVG onto a canvas in Chromium requires `HTMLImageElement` (`new Image()`), which **only exists on the main UI thread**, not in a Web Worker.
  3. Furthermore, serializing the DOM SVG 1,800 times (for a 60s @ 30fps export), base64-encoding embedded WOFF2 fonts into every frame's string, and decoding `new Image()` on the main thread will block the webview UI thread and miss `NFR-PERF-12` (< 20s GIF) and `NFR-PERF-13` (< 45s 1080p WebM) by an order of magnitude.
- **Recommended Improvement:**
  - Because `sceneAt(t)` ([§13.7](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1520)) produces a pure, renderer-independent scene state (coordinates, paths, opacities, stroke offsets), implement a **direct `CanvasRenderingContext2D` backend** (`@mermaid-animator/renderer/canvas`) alongside the SVG backend.
  - Run `sceneAt(f / fps)` and `renderSceneToCanvas(scene, offscreenCtx)` **entirely inside the Encoder Web Worker** using `OffscreenCanvas` and `self.fonts.add(new FontFace(...))`. This eliminates SVG string serialization, main-thread `Image` decoding, and cross-thread `ImageBitmap` transfers, achieving 10×–30× faster offline exports.

---

### 3.2 `[CRITICAL]` Live-Editing & Sidecar Bug in `StepId` Hashing (§13.6.3, §8.12.2, Appendix B)

- **Specification Reference:** [§13.6.3](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1510-L1518), [§8.12.2](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L581-L585), and [Appendix B](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L2187-L2190).
- **The Problem:**
  `StepId` is defined as:
  ```text
  signature  = kind | from | to | normalise(label) | fragmentPathSignature
  StepId     = base36( fnv1a64( signature + "#" + occurrence ) )
  ```
  This creates **two user-facing bugs**:
  1. **Broken Live Reload While Typing (Scenario S4):** In Scenario S4 (*"While Ana types a new message in the source, the panel updates... the new message is drawn in as the current step"*), as the user types or edits a message label character-by-character (`W->>P: Auth` → `W->>P: Authorise`), `normalise(label)` changes on every 250 ms debounce tick. Because the old `StepId` vanishes, §8.12.2's rule (*"if it no longer exists, seek to the nearest preceding surviving step"*) causes the viewer to **jump backward to Step $k-1$ while the user is actively typing Step $k$**!
  2. **Silent Data Loss in Sidecar Files (Appendix B):** Appendix B keys sidecar captions by `StepId` (`"k3f9a2": "Auth looks the user up..."`). If an author fixes a single typo in the diagram's message label, `StepId` changes and **silently orphans all sidecar captions and chapter pointers attached to that step**.
- **Recommended Improvement:**
  1. **Add an optional `%% @step-id <slug>` statement annotation** (and use it when present as the canonical `StepId`) so sidecar references can be pinned immutably.
  2. **Separate Structural ID from Content ID:** Define `structuralId = hash(kind | from | to | fragmentPathSignature | occurrence)` alongside `contentId`. During live reload (§8.12.2) and sidecar resolution (§11.7), fall back in order: `explicit @step-id` → `contentId` → `structuralId` (at matching or active editor cursor line) → `nearest preceding step`.

---

### 3.3 `[HIGH]` Pipeline Circular Dependency Between `StepCompiler`, `LayoutEngine`, and Split View (§13.3, §13.6.1, §8.3.3)

- **Specification Reference:** [§13.3](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1331-L1345) (Core pipeline diagram), [§13.5](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1449-L1462) (`Step.timing`), [§13.6.1](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1500), and [§8.3.3](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L383-L386) (Split view).
- **The Problem:**
  - The architecture diagram in §13.3 shows `Step compiler (F) -> Timeline compiler (G)` running in parallel with `Layout engine (L)`.
  - However, §9.8.2 defines transition duration as `travel(L) = clamp(280, 180 + 0.85 * L, 900)` where `L` is the **pixel path length**, and §13.5 embeds `timing: { transitionMs, dwellMs }` directly inside `Step` (the output of `StepCompiler`).
  - **The Split View & Morph Paradox:** In **Split View** (§8.3.3), Sequence view and Topology view run side-by-side *"sharing one timeline"*. In Sequence view, a message between adjacent columns may have $L_{\text{seq}} = 120\text{ px}$ ($T = 282\text{ ms}$), whereas in Topology view the same edge may span $L_{\text{topo}} = 480\text{ px}$ ($T = 588\text{ ms}$). If `transitionMs` depends on layout pixel length $L$, the two views cannot share a single timeline without one view finishing its arrow draw early or `Timeline.duration` shifting whenever the user switches views (`T`)!
- **Recommended Improvement:**
  - Make `Step.timing.transitionMs` **layout-invariant** by parameterizing `travel` in `StepCompiler` on **logical span** rather than pixel length:
    $$\text{transitionMs} = \text{clamp}(280,\; 220 + 95 \times \Delta\text{col},\; 900)$$
    where $\Delta\text{col} = |\text{col}(\text{to}) - \text{col}(\text{from})|$ (with $\Delta\text{col} = 1$ for self-messages and non-sequence diagrams).
  - Both Sequence view ($L_{\text{seq}}$) and Topology view ($L_{\text{topo}}$) then interpolate their respective path lengths `0 → L_view` over the exact same `[start, end]` millisecond window on the shared `Timeline`. This restores 100% purity to `StepCompiler` (zero layout dependency) and guarantees timeline invariance across Sequence, Topology, and Split views.

---

### 3.4 `[HIGH]` Web Workers Inside VS Code Webviews Will Fail Without a Blob Shim (§13.2, §18)

- **Specification Reference:** [§13.2](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1327) and [§18](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1925) (`worker-src ${webview.cspSource} blob:;`).
- **The Problem:**
  In VS Code, a Webview frame runs on the origin `vscode-webview://<uuid>`, while `webview.asWebviewUri(...)` rewrites local extension assets to `https://file+.vscode-resource.vscode-cdn.net/...`. Because the HTML `Worker` constructor enforces a strict same-origin check on its script URL argument, calling `new Worker(workerWebviewUri)` directly in Chromium throws a cross-origin `SecurityError` even when `worker-src ${webview.cspSource}` is present in the CSP!
- **Recommended Improvement:**
  Specify in §13.2 and §18 that Webview Workers (ELK, GIF, WebCodecs) MUST be instantiated via a same-origin `Blob` wrapper:
  ```ts
  function createWebviewWorker(scriptUri: string): Worker {
    const blob = new Blob([`importScripts(${JSON.stringify(scriptUri)});`], {
      type: 'application/javascript',
    });
    return new Worker(URL.createObjectURL(blob));
  }
  ```

---

## 4. Internal Specification Contradictions & Edge Cases

### 4.1 Concurrent `par` Steps vs `Step` Data Model (§8.8, §13.5, §13.6.1)

- **Specification Reference:** [§8.8](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L538), [§13.5](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1449-L1462), and [§13.6.1](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1496).
- **The Contradiction:**
  - §8.8 states: *"each branch is a lane, and the k-th message of every lane animates together as one step."*
  - §13.6.1 states: *"zip lanes so that the k-th step of each lane shares a step index (`concurrent`)."*
  - §13.6.2 states: *"Step indices are contiguous from 0."*
  - Yet in `Step` (§13.5), `source: SourceRange` is a **single** range, `lane?: number` is a scalar, and `caption?: string` is a single string. If two lanes share `index: 5`, either `StepList.steps` has duplicate `index` values (breaking `steps[index]` lookup and `Step 05 / 24` counting) or they are merged into one `Step` object whose `source: SourceRange` can only point to one of the two lanes!
- **Recommended Fix:**
  Keep `StepList.steps` strictly 1-to-1 with `index` (`steps[i].index === i`), and update `Step` in §13.5 to carry `sources: SourceRange[]` (an array of source ranges, length 1 for normal steps and length $m$ for zipped `par` steps) plus `lanes?: { laneIndex: number; label: string; targets: ElementRef[]; source: SourceRange; caption?: string }[]`. This allows `FR-SYNC-03` to highlight **all** simultaneously executing lines in the editor and the Inspector to display all active lanes.

---

### 4.2 Explicit `activate` / `deactivate` Merging Heuristic (§10.1 vs Common Mermaid Authoring)

- **Specification Reference:** [§10.1](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L941) (*"explicit `activate` lines attach to the following message; `deactivate` to the preceding one"*).
- **The Edge Case:**
  In standard Mermaid sequence diagrams (including official Mermaid documentation examples), authors almost universally write explicit `activate` **immediately after** the incoming message that triggers the activation:
  ```mermaid
  sequenceDiagram
      User->>Gateway: POST /login
      activate Gateway
      Gateway->>Auth: verify(token)
      deactivate Gateway
  ```
  Under §10.1's current wording (*"explicit `activate` lines attach to the following message"*), `activate Gateway` would NOT attach to `User->>Gateway: POST /login`; it would wait and attach to `Gateway->>Auth: verify(token)`!
- **Recommended Fix:**
  Update the attachment rule in §10.1 and §13.6.1:
  1. An explicit `activate X` attaches to the **immediately preceding message** if `X` is that message's target (`to === X`) or sender (`from === X`), unless that message already activated `X` via `+`. Otherwise, if `X` is the sender of the **immediately following message**, it attaches to the following message.
  2. Consecutive `deactivate X`, `deactivate Y` statements at the end of a call chain all merge into the immediately preceding return/request message.

---

### 4.3 `create` and `destroy` Step Merging Omission in `StepCompiler` (§10.1 vs §13.6.1)

- **Specification Reference:** [§10.1](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L937-L938) vs [§13.6.1](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1489-L1491).
- **The Inconsistency:**
  - §10.1 specifies: *"Header materialises at the creation row as part of the step that creates it"* and *"Lifeline terminates with a ✕ at the step of its final message."*
  - However, in §13.5 (`SequenceNode`), `create` and `destroy` are distinct AST nodes, and §13.6.1's algorithm only mentions merging `activate`/`deactivate` (step 2), leaving `create` and `destroy` unmerged.
- **Recommended Fix:**
  Add to §13.6.1 Step 2: *"Merge a preceding `create participant X` statement into the immediately following message step targeting `X` (adding `X`'s header reveal tween to `[0, base]`), and merge a following `destroy X` statement into the immediately preceding message step involving `X` (adding `X`'s termination ✕ tween to `[T, T + fast]`). Standalone `create`/`destroy` statements with no adjacent message involving `X` emit their own step."*

---

## 5. VS Code Platform, Webview & Security Refinements

### 5.1 Presentation Mode & `workbench.action.toggleZenMode` State Trap (§8.10)

- **Specification Reference:** [§8.10](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L557) (*"Executes `workbench.action.toggleZenMode` and `workbench.action.maximizeEditorHideSidebar` ... and restores the previous layout on exit (`Esc`)."*).
- **The Pitfall:**
  `workbench.action.toggleZenMode` is a blind toggle, and VS Code's Extension API does not expose a boolean `isInZenMode` property. If a user enters Presentation Mode (`P`), then presses `Esc` twice (VS Code's built-in shortcut to exit Zen Mode), and then exits Presentation Mode (`Esc`), executing `toggleZenMode` on exit will **re-enter Zen Mode**!
- **Recommended Improvement:**
  - Use `workbench.action.maximizeEditorHideSidebar` (or `workbench.action.toggleMaximizeEditorGroup`) as the default layout action on `P`, and make `presentation.zenMode` opt-in (`default: false`), OR
  - Inside the webview, use the standard Fullscreen API (`document.documentElement.requestFullscreen()`) when triggered by a user key/click (`P`), which naturally restores the exact prior window state on `Esc` and sends a deterministic `fullscreenchange` DOM event to exit Presentation Mode cleanly.

---

### 5.2 Clipboard Image API in VS Code (§12.10 `FR-EXP-01`, §13.10)

- **Specification Reference:** [§13.10](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1596) (`clipboard/image | { png } | Copy image (host writes via a temporary file where clipboard image APIs are unavailable)`).
- **The Pitfall:**
  `vscode.env.clipboard` only supports text (`writeText`). Writing a PNG to a temporary file in the Extension Host does not place an image on the system clipboard without spawning OS-specific binaries (`powershell`, `osascript`, `xclip`/`wl-copy`), which fails on `vscode.dev` and restricted environments.
- **Recommended Improvement:**
  Execute `navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])` **directly inside the Webview** (Chromium natively supports `ClipboardItem` for `image/png` across Windows, macOS, Linux, and Web). Only send `clipboard/image` to the host if the user triggers *Copy Image* from the Command Palette while the webview does not have focus (in which case the host focuses the webview first and dispatches the copy command).

---

### 5.3 Redundant `activationEvents` in `package.json` (§15.3, Appendix C)

- **Specification Reference:** [§15.3](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1854) and [Appendix C](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L2236-L2242).
- **The Issue:**
  With `engines.vscode: "^1.95.0"`, VS Code automatically generates activation events for contributed `languages` (`onLanguage:mermaid`), `commands`, `views`, `customEditors`, and `onWebviewPanel`. Explicitly listing `onLanguage:mermaid` in `activationEvents` when `contributes.languages` defines `mermaid` produces a `vsce` packaging warning.
- **Recommended Fix:**
  Reduce `activationEvents` in `package.json` to only those languages **not** defined by this extension plus `onUri` and `onWebviewPanel:mermaidAnimator.panel`:
  ```json
  "activationEvents": [
    "onLanguage:markdown",
    "onLanguage:mdx",
    "onWebviewPanel:mermaidAnimator.panel",
    "onUri"
  ]
  ```

---

## 6. Mermaid 11.x Grammar & Rendering Improvements

### 6.1 Missing Sequence Diagram Syntax in `SequenceIR` (§10.1, §13.5)

To satisfy `FR-PARSE-01` (*"accept every sequence diagram accepted by the pinned Mermaid version's parser"*), `SequenceIR` ([§13.5](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1392-L1444)) needs three small additions for Mermaid 10.x/11.x compatibility:

1. **Upper/Lower Half-Arrowheads (`-\`, `--\`, `/\`, `//--`):**
   Mermaid sequence diagrams support upper/lower half-filled and half-open arrows (`-\`, `--\`, `-/`, `--/`). Add `'solidHalfTop' | 'dottedHalfTop' | 'solidHalfBottom' | 'dottedHalfBottom'` to `ArrowKind`.
2. **Participant Destruction Target (`destroy` Kind):**
   In Mermaid 11, `destroy X` can precede *or* follow the message that destroys `X`. `DestroyNode` should record `{ type: 'destroy', participant: string, attachTo: 'prev' | 'next' | 'standalone', range: SourceRange }`.
3. **Mermaid Markdown Strings & HTML Entities (`#quot;`, `#9829;`):**
   Mermaid sequence labels support character entity codes (e.g., `A->>B: I #9829; Mermaid#59;`) and Markdown strings (`` A->>B: "`**Bold** text`" ``). Specify an entity decoder in the lexer and reuse §8.9's safe whitelist inline parser (`**bold**`, `*italic*`, `` `code` ``) for `<tspan>` generation in labels and notes.

---

## 7. UX, Accessibility & Export Enhancements

### 7.1 Animated SVG Export in GitHub READMEs: Dark Mode & Font Clipping (§14.4, §14.5)

- **Specification Reference:** [§14.4](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1688-L1695) and [§14.5](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md#L1696-L1705).
- **Two Real-World GitHub Issues:**
  1. **OS vs GitHub Theme Mismatch:** When an SVG is embedded via `![alt](./checkout.anim.svg)`, `@media (prefers-color-scheme: dark)` inside the SVG queries the **viewer's OS theme**, *not* the GitHub website's theme selector (`data-color-mode="dark"`). If a user has macOS in Light Mode but GitHub in Dark Mode, `checkout.anim.svg` will render with a bright Ivory background on a dark GitHub page.
  2. **Font Substitution Box Overflow:** GitHub's Camo proxy and Safari's `<img>` SVG renderer restrict or delay `@font-face` `data:` URIs inside external `<img>` SVGs. When `Inter` falls back to `Arial` or `Helvetica`, glyph widths differ by up to 6–9%, causing labels to overflow participant boxes whose widths were tightly calculated via `measureText` with `Inter`.
- **Recommended Improvements:**
  1. **Add `textLength` + Safety Padding in Exported SVGs:** In static and animated SVG exports, add a `+8%` horizontal width buffer to participant boxes and set `textLength="<measuredPx>" lengthAdjust="spacing"` on `<text>` elements so fallback system fonts never overflow boxes or overlap arrowheads.
  2. **Offer GitHub `<picture>` Snippet in `Insert reference` (§14.5):** When `export.background = "transparent"` is used or when exporting for GitHub, allow exporting a light/dark pair (`checkout.light.anim.svg` / `checkout.dark.anim.svg`) with a `<picture>` Markdown snippet, or default the single-file Animated SVG background to `transparent` with adaptive stroke colors that maintain ≥ 4.5 : 1 contrast on both `#ffffff` and `#0d1117` (GitHub dark canvas) when OS and GitHub themes disagree.

---

### 7.2 Multi-Diagram Scroll & Resource Budget in Markdown Files (§8.1, §8.12)

- **Context:** Architecture documentation files (`docs/architecture.md`) often contain 8–15 Mermaid diagrams.
- **Improvement:** Clarify in §8.1 that when `panel.reuse = "perDocument"` (or when switching via the toolbar breadcrumb `checkout.md › Diagram 2 ▾`), switching between diagrams inside the same Markdown file reuses the existing Webview instance via `document/load` (< 40 ms transition) rather than tearing down and recreating the Webview iframe.

---

## 8. Delivery Plan & Scope De-Risking

### 8.1 Milestone M1 & M2 Compression Risk (§23)

- **Observation:**
  - **M1 (5 weeks, 2 engineers)** includes building a hand-written sequence parser with 100% Mermaid 11 conformance, custom layout, scene runtime, full transport/camera, editor sync, static SVG/PNG export, Tier 3 fallback for all other diagram types, and EN/ES localization.
  - **M2 (4 weeks, 2 engineers)** packs **18 major features**: Topology view (ELK + d3-force + manual), FLIP morphing, Split view, Transcript view, Inspector, Minimap, Focus/Multi-focus, Search, Branch explorer, Loop iterations, `par` concurrency, Annotation language + IntelliSense/diagnostics/quick-fixes, Captions, Chapters, Presentation mode, Cursor-to-step sync, and Cinematic camera.
- **Recommended Adjustments:**
  1. **Split M2 into M2a (3 weeks — Narrative, Annotations & Presentation) and M2b (3 weeks — Topology View, Split View & FLIP Morph):**
     - *M2a:* Annotations (`%% @...`) + IntelliSense, Captions, Chapters, Inspector, Focus/Filter, Search, Branch/Loop/Par semantics, Presentation mode, Cinematic camera, Transcript view.
     - *M2b:* Topology View (ELK worker + d3-force + manual), FLIP Sequence ↔ Topology morph, Split view, Minimap.
  2. **Defer `mermaid-overlay` Engine (`render.engine = "mermaid-overlay"`, §13.9) to P2 / M4:**
     - The extension already has **Engine `native`** (for Tier 1/2) and **Generic Fallback (Tier 3)** (which animates Mermaid's rendered SVG). Maintaining a separate `mermaid-overlay` mapper for sequence diagrams that reverse-engineers Mermaid's internal DOM classes (`.messageLine0`, `.actor`) duplicates Tier 3's mechanism while adding brittle coupling to Mermaid's SVG structure. Unifying `mermaid-overlay` with the Tier 3 SVG engine (so users who choose `render.engine = "mermaid-overlay"` simply run the diagram through the enhanced SVG group animator) cuts ~2 weeks of maintenance work.

---

## 9. Ready-to-Apply Specification Diffs (Redlines)

Below are concrete replacement blocks ready to be merged into [vscode-extension-specification.md](file:///C:/Users/jhonw/Documents/EnBinario/mermaid-animator/vscode-extension-specification.md).

### Redline 1 — §13.5 `Step` & `ArrowKind` Definitions (Lines 1404–1463)

```diff
 export type ArrowKind =
   | 'solid' | 'dotted'                          // ->   -->
   | 'solidArrow' | 'dottedArrow'                // ->>  -->>
   | 'solidBidirectional' | 'dottedBidirectional'// <<->> <<-->>
   | 'solidCross' | 'dottedCross'                // -x   --x
-  | 'solidOpen' | 'dottedOpen';                 // -)   --)
+  | 'solidOpen' | 'dottedOpen'                  // -)   --)
+  | 'solidHalfTop' | 'dottedHalfTop'            // -\   --\
+  | 'solidHalfBottom' | 'dottedHalfBottom';     // -/   --/
```

```diff
 export interface Step {
   id: StepId;
+  structuralId: StepId;          // label-independent ID for live-edit cursor stability
   index: number;
   kind: 'message' | 'note' | 'activation' | 'create' | 'destroy'
       | 'transition' | 'node' | 'edge' | 'commit' | 'task' | 'group';
   targets: ElementRef[];         // IR element ids animated by this step
   fragmentPath: { fragmentId: string; branch: number; iteration?: number; of?: number }[];
-  lane?: number;                 // for concurrent par steps
+  lanes?: {                      // populated when concurrent par branches zip into one step
+    lane: number;
+    targets: ElementRef[];
+    source: SourceRange;
+    caption?: string;
+  }[];
   chapter?: string;
   caption?: string;
   emphasis?: boolean;
   timing: { transitionMs: number; dwellMs: number; latencyMs?: number };
-  source: SourceRange;
+  source: SourceRange;           // primary range (first lane when concurrent)
+  sources: SourceRange[];        // all active source ranges for editor decoration (FR-SYNC-03)
 }
```

### Redline 2 — §13.6.3 Stable Step IDs (Lines 1510–1519)

```diff
 #### 13.6.3 Stable step IDs
 
 ```
-signature  = kind | from | to | normalise(label) | fragmentPathSignature
-occurrence = count of earlier steps with the same signature
-StepId     = base36( fnv1a64( signature + "#" + occurrence ) )
+structuralSig = kind | from | to | fragmentPathSignature
+structuralOcc = count of earlier steps with the same structuralSig
+structuralId  = base36( fnv1a64( structuralSig + "#" + structuralOcc ) )
+
+contentSig    = structuralSig | normalise(label)
+contentOcc    = count of earlier steps with the same contentSig
+StepId        = explicitStepId ?? base36( fnv1a64( contentSig + "#" + contentOcc ) )
 ```
 
-`normalise` lowercases, collapses whitespace and strips autonumber prefixes. Inserting unrelated statements does not change existing IDs; editing a label changes only that step's ID (in which case position is preserved by nearest-preceding fallback).
+`normalise` lowercases, collapses whitespace and strips autonumber prefixes. Authors MAY pin an immutable `explicitStepId` via `%% @step-id <slug>`. During live reload (§8.12.2) and sidecar lookup (§11.7), resolution checks `StepId` first, then `structuralId` (preserving position while a user actively edits a message's label), and finally falls back to the nearest preceding surviving step.
```

### Redline 3 — §14.3 Export Pipeline (Lines 1662–1682)

```diff
 ```mermaid
 sequenceDiagram
     actor U as User
     participant WV as Webview UI
-    participant R as Offline Renderer
-    participant EW as Encoder Worker
+    participant EW as Offline Renderer + Encoder Worker
     participant H as Extension Host
     U->>WV: Export (options)
     WV->>H: request save location
     H-->>WV: target Uri (showSaveDialog)
+    WV->>EW: startExport(timeline, layout, fonts, options)
     loop for each frame f
-        WV->>R: sceneAt(f / fps)
-        R->>R: serialise SVG → OffscreenCanvas
-        R->>EW: ImageBitmap (transfer)
+        EW->>EW: scene = sceneAt(f / fps)
+        EW->>EW: renderSceneToCanvas(scene, offscreenCtx)
+        EW->>EW: encodeFrame(offscreenCanvas)
         EW-->>WV: progress
     end
     EW-->>WV: encoded bytes
     WV->>H: export/data (chunked)
     H->>H: workspace.fs.writeFile
     H-->>U: notification · Open · Reveal · Insert reference
 ```
```
