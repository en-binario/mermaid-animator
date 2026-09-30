# Tasks

## 1. Prerequisite

- [ ] 1.1 Archive `add-monochrome-export-theme` (`openspec archive add-monochrome-export-theme`), then run `openspec validate add-theme-menu --strict`; verify that the INFO line "export-theme: target spec does not exist" is gone and `openspec/specs/export-theme/spec.md` exists

## 2. `monochrome` theme mode

- [ ] 2.1 Add `'monochrome'` to `ThemeMode` in `packages/renderer/src/theme.ts` and `packages/protocol/src/index.ts`, make `resolvePalette('monochrome', kind)` return `'monochrome'`, remove the "export-only" comments, and extend the protocol `settings` guard; verify `npm run typecheck` passes
- [ ] 2.2 `Theme mode matrix` (visual-theme) → `packages/renderer/test/theme.test.ts`, replace the `resolvePalette` cases with an `it.each` of one case per R1–R9, and update the "never returns monochrome" loop so it covers the four other modes only; verify it passes
- [ ] 2.3 In `packages/protocol/test/protocol.test.ts`, add cases that `init` and `settings/changed` accept `themeMode: 'monochrome'`; verify they pass
- [ ] 2.4 Add `monochrome` to the `mermaidAnimator.theme.mode` enum in `packages/extension/package.json` with `%config.theme.mode.monochrome%` (en "Always use the Monochrome palette: black text and lines on white." / es "Usar siempre la paleta Monocromo: texto y líneas negros sobre blanco.") and mention it in `config.theme.mode`; add the option to the harness `themeMode` select (`packages/webview/harness/index.html`); update the README settings row; verify the Settings UI lists five values in the Extension Development Host

## 3. White-only Monochrome palette

- [ ] 3.1 Set `surface-sunken` and `accent-muted` to `#FFFFFF` in `PALETTES.monochrome` and the `[data-palette='monochrome']` block of `packages/renderer/src/tokens.css`, update both comments, and delete `MONOCHROME_RAMP`; verify the `theme.test.ts` CSS-parity and contrast loops pass
- [ ] 3.2 `Monochrome text contrast` (visual-theme) → in `theme.test.ts`, replace the ramp case with an `it.each` over every Monochrome ink and fill token pair, asserting `contrastRatio(ink, fill) === 21`; verify it passes
- [ ] 3.3 In `themeVariables` (`packages/webview/src/fallback.ts`), set the Monochrome `pie1`–`pie12` to `c.surface`, drop the ER `mainBkg` / `primaryColor` grey override, and keep the black pie stroke and section text; update the doc comment; verify `export-theme.test.ts` expectations that named `#EDEDED` or the ramp are updated and pass
- [ ] 3.4 `Monochrome element colour matrix` (visual-theme) → harness checklist, panel with `theme.mode` `monochrome` and an SVG export with theme *Monochrome*, one line per row. Use a sequence diagram with `box`, `rect`, `loop`, activation and note, a flowchart with a subgraph, an `erDiagram`, a `pie`, a `stateDiagram-v2` with `[*]` and `<<fork>>`, and a `gitGraph`:
  - [ ] R1 canvas and export background `#FFFFFF`
  - [ ] R2 participant box, flowchart node, state, class box, topology node, ER header and attribute rows: fill `#FFFFFF`, stroke and text `#000000`
  - [ ] R3 `box` group, fragment tab, subgraph, topology cluster: fill `#FFFFFF`, stroke and text `#000000`
  - [ ] R4 activation bar: fill `#FFFFFF`, stroke `#000000`
  - [ ] R5 current step: no fill, black stroke at the active width
  - [ ] R6 message line, edge, relationship line, lifeline: stroke and text `#000000`
  - [ ] R7 arrowhead, state start point, fork/join bar, commit bullet: fill and stroke `#000000`
  - [ ] R8 note, edge-label background, topology edge badge: fill `#FFFFFF`, stroke and text `#000000`
  - [ ] R9 pie slice and legend swatch: fill `#FFFFFF`, stroke and text `#000000`
  - [ ] R10 burnt-in caption, title card, step counter and transport in a GIF frame: fill `#FFFFFF`, stroke and text `#000000`
  - [ ] R11 `rect` region: fill `#FFFFFF`, no stroke
- [ ] 3.5 In `packages/webview/test/export-theme.test.ts`, extend the `Export palette matrix` (export-theme) R1 case with a Monochrome active palette, and add `Current export from a Monochrome panel` as a case on `exportPalette('current', 'monochrome')`; verify they pass

## 4. Author colours in Mermaid-rendered diagrams

- [ ] 4.1 Pin the Mermaid 12 selectors for state start points, fork/join bars and commit bullets with `scripts/mermaid-probe.mjs` against `stateDiagram-v2` and `gitGraph` fixtures, and record them as `SOLID_MARKS` next to `NODE_SELECTORS` with a comment naming the Mermaid version; verify the probe output lists each selector
- [ ] 4.2 Add `monochromeColours(svg)` in `packages/webview/src/fallbackMonochrome.ts` implementing the D3 rules (inline `!important`, `stroke-width` untouched), and call it from `GenericDiagram.mount` when the palette is `monochrome`; verify a Vitest suite `packages/webview/test/fallback-monochrome.test.ts` on hand-written SVG (inline styles and a `<style>` with `!important`) covers text, marker, `SOLID_MARKS` and ordinary shapes
- [ ] 4.3 `Author colour matrix` (visual-theme) → in `fallback-monochrome.test.ts`, add an `it.each` with one case per R1–R7 on SVG fragments shaped like Mermaid's output for each source line; also check each row in the harness with the real Mermaid rendering (panel in Monochrome and an SVG export from a Graphite panel):
  - [ ] R1 `style A fill:#f9f,stroke:#333,color:#c00`
  - [ ] R2 `classDef hot …` on node `B`
  - [ ] R3 `linkStyle 0 stroke:#ff3,stroke-width:4px` keeps 4 px
  - [ ] R4 `rect rgb(200, 150, 255)`
  - [ ] R5 `box Aqua Backend`
  - [ ] R6 `%%{init}%%` `primaryColor`
  - [ ] R7 `style A fill:#000,color:#fff`
- [ ] 4.4 Cover `Only palette colours` (visual-theme) with a harness check over the fixture corpus: every `fill` / `stroke` in the Monochrome panel drawing and its SVG export is `#000000`, `#FFFFFF`, `none` or `transparent`. Also cover `ER diagram in Monochrome` and `Author colours in a Monochrome export` (export-theme) in the harness, including that the Graphite panel keeps `#f9f`
- [ ] 4.5 Pass `resolvePalette(settings.themeMode, themeKind)` to `GenericDiagram.render` from `controller.applySettings` / `build` instead of reading `data-palette` (D7); verify in the harness that switching a flowchart with `classDef` colours from Graphite to Monochrome and back shows white fills and then the author colours again, with the step unchanged

## 5. Toolbar theme menu

- [ ] 5.1 Extract the `ZoomGroup` menu behaviour (focus the checked item, outside-click close, arrow/Home/End/Escape keys, focus return) into a `useMenu` hook in `packages/webview/src/App.tsx`, and use it from `ZoomGroup`; verify the zoom menu still passes the `zoom-controls` harness checks
- [ ] 5.2 Add `themeMenuMessage(checked, chosen)` as a pure helper returning the `theme/set` message or `undefined`, and add the strings `toolbar.theme`, `theme.auto`, `theme.ivory`, `theme.graphite`, `theme.highContrast` and `theme.monochrome` (en and es) to `packages/protocol/src/strings.ts` and the Spanish catalogue; verify the strings test and typecheck pass
- [ ] 5.3 Add `ThemeMenu` (icon `symbol-color`, label *Theme*, always enabled, placed before the keyboard button) with five `menuitemradio` items checked from `hostState.settings.themeMode`, and `ui.themeMenu` closed with the other popovers; verify `Menu opens on the effective mode` and `Escape closes without a change` (visual-theme) in the harness
- [ ] 5.4 `Theme menu choice matrix` (visual-theme), webview side → `packages/webview/test/theme-menu.test.ts`, `it.each` on `themeMenuMessage`, one case per R1–R6 (R1: `undefined`; R2–R6: `theme/set` with the item's mode); verify it passes

## 6. Host: `theme/set`

- [ ] 6.1 Add the `theme/set` webview message type and its guard `shape({ mode: oneOf(...THEME_MODES) })` in `packages/protocol/src/index.ts`; verify with the next task
- [ ] 6.2 `Theme change message matrix` (host-webview-protocol), validation rows → `packages/protocol/test/protocol.test.ts`, one case per R1–R2 asserting the exact error `theme/set payload.mode: expected one of auto, ivory, graphite, highContrast, monochrome`; verify it passes
- [ ] 6.3 Add `setThemeMode(mode)` in `packages/extension/src/environment.ts` (D6 target selection, error notification `Could not change the Mermaid Animator theme: {0}` with its es entry in `l10n/bundle.l10n.es.json`) and handle `theme/set` in `panel.ts`; verify with the next two tasks
- [ ] 6.4 `Theme menu choice matrix` (visual-theme), host side → `packages/extension/test/suite/settingsAccess.test.ts`, one case per R2–R7 through `receiveForTest` (R2–R6 write the user settings; R7 writes the workspace settings when the workspace defines `theme.mode`), resetting the setting after each case; also cover `All open panels switch` with two panels; verify `npm run test:integration` passes
- [ ] 6.5 `Theme change message matrix` (host-webview-protocol), host rows → `settingsAccess.test.ts`, one case per R1–R4 asserting `theme.mode`, the `settings/changed` sent to each panel and the output-channel line; verify it passes
- [ ] 6.6 Cover `Setting cannot be written` (visual-theme) with an integration case that stubs `WorkspaceConfiguration.update` to reject, and assert the error notification text and the unchanged palette; verify it passes

## 7. Monochrome panel controls

- [ ] 7.1 Add the `[data-palette='monochrome']` rules of D5 to `packages/webview/src/styles/app.css` (inverted pressed and checked states, outline hover, `--ma-focus` kept); verify with the next task
- [ ] 7.2 `Pressed and checked controls in Monochrome` (visual-theme) → harness checklist, one line per row:
  - [ ] R1 pressed Follow/Search/Transcript/Inspector/Present: background `#000000`, icon `#FFFFFF`
  - [ ] R2 unpressed toolbar button: background `#FFFFFF`, icon `#000000`
  - [ ] R3 checked theme, zoom and speed menu item: background `#000000`, text `#FFFFFF`
  - [ ] R4 unchecked menu item: background `#FFFFFF`, text `#000000`
  - [ ] R5 checked view-switcher segment: background `#000000`, text `#FFFFFF`
  - [ ] R6 unchecked segment: background `#FFFFFF`, text `#000000`

## 8. Docs and release notes

- [ ] 8.1 Update the Monochrome wording ("light grey headers") in `package.nls.json` / `package.nls.es.json` `export.theme` descriptions, the regenerated `schemas/animator.schema.json` (`node scripts/sidecar-schema.mjs`) and the README to "black text and lines, white fills"; add the theme menu to the README toolbar section, noting that `rect` regions and pie slices are told apart by borders and labels only; verify `grep -rn "grey" packages/extension/package.nls*.json packages/extension/schemas packages/extension/README.md` finds no Monochrome mention
- [ ] 8.2 After 1.1, edit the `## Purpose` of `openspec/specs/export-theme/spec.md` by hand: drop "with one light grey for header and grouping fills", and drop the non-goal about a panel Monochrome palette (a delta cannot change a Purpose, docs/spec-writing.md §9); verify `openspec validate --specs --strict` passes
- [ ] 8.3 In `packages/extension/CHANGELOG.md` under `## Unreleased`, amend the unreleased *Added — Monochrome export theme* entry to white-only fills including author colours, and add **Added — theme menu.** (toolbar *Theme* menu with *Follow editor theme*, *Ivory*, *Graphite*, *High contrast*, *Monochrome*; it writes `mermaidAnimator.theme.mode`, which now accepts `monochrome`) per docs/versioning.md; verify `npm run version:check` passes

## 9. Integration check

- [ ] 9.1 Run `npm run check` and `npm run test:integration`; verify both pass, then run through `All open panels switch` once in the Extension Development Host with a native sequence diagram and a Mermaid-rendered flowchart side by side
