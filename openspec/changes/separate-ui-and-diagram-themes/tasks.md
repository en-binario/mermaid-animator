# Tasks

## 1. Theme values and resolvers (protocol, renderer)

- [x] 1.1 In `packages/protocol/src/index.ts`, add `DiagramTheme` / `DIAGRAM_THEMES` (16 values, in the menu order) and `UiTheme` / `UI_THEMES`, plus `resolveDiagramTheme(diagram, mode)` and `resolveUiTheme(value)` (D1). Replace `WebviewSettings.themeMode` with `diagramTheme` and `uiTheme` and update the `settings` guard. Verify `npm run typecheck` lists only the call sites that tasks 1.3–3.x change
- [x] 1.2 `Diagram theme matrix` (visual-theme) → `packages/webview/test/themes.test.ts` (the only package that depends on both protocol and renderer), `it.each` over `resolveDiagramTheme` plus `resolvePalette`, one case per R1–R14 (R14 over all 11 Mermaid names); verify it passes
- [x] 1.3 In `packages/renderer/src/theme.ts`, rename `ThemeMode` to `DiagramTheme` (re-exported from protocol), make `resolvePalette` cover all 16 values (Mermaid names → `mermaid-<name>`), and add `uiPalette(uiTheme, themeKind)` returning `vscode` or an Ink & Ivory palette name; verify with the next task
- [x] 1.4 `UI theme matrix` (visual-theme) → `packages/webview/test/themes.test.ts`, `it.each` over `resolveUiTheme` plus `uiPalette`, one case per R1–R6; verify it passes

## 2. Mermaid palettes

- [x] 2.1 Add `packages/renderer/src/mermaidPalette.ts` with `toHex` (named colours, `#rgb`, `#rrggbb`, `rgb()`, `hsl()`) and `mermaidPalette(vars)` implementing the mapping in the *Mermaid theme palettes* Constraints (D3). Verify `packages/renderer/test/mermaid-palette.test.ts` covers `toHex` for `white`, `lightgrey`, `#333`, `hsl(240, 60%, 86.2745098039%)` and a negative hue, the accent pick with its fallback, and the note fallback
- [x] 2.2 Add `scripts/mermaid-themes.mjs` (D3), which writes `packages/renderer/src/mermaidPalettes.generated.ts` (header naming Mermaid `12.0.0`) and the generated region of `tokens.css`. Move the Ink & Ivory table to `palettes.ts`. Run it, and add `mermaid-<name>` to `PaletteName` and `PALETTES`. Verify the `theme.test.ts` CSS/TS parity loop passes for all 16 palettes, with its contrast loops limited to Ink & Ivory and Monochrome
- [x] 2.3 `Mermaid theme palette matrix` (visual-theme) → `packages/renderer/test/mermaid-palette.test.ts`, `it.each` on the generated table, one case per R1–R4 (canvas, participant fill, border, text, message line, highlight, note fill); verify it passes
- [x] 2.4 Add the sync test `packages/renderer/test/mermaid-palette-sync.test.ts`: load Mermaid through `scripts/mermaid-jsdom.mjs`, recompute each theme with `mermaidPalette`, and compare with the generated table. Verify it passes, and that editing one generated value makes it fail

## 3. Two token scopes (webview)

- [x] 3.1 Turn the Ink & Ivory blocks in `packages/renderer/src/tokens.css` into `[data-palette='x'], [data-ui='x']` selector lists, and update the parity-test regex. Verify `theme.test.ts` passes
- [x] 3.2 Add the `[data-ui='vscode']` block and its three component rules to `packages/webview/src/styles/app.css` (D2 table), and delete the Monochrome control block from `add-theme-menu`. Verify in the harness, with the *vscode vars* sample on, that the toolbar background equals `--vscode-editor-background` and a pressed button uses `--vscode-inputOption-activeBackground`
- [x] 3.3 In `main.tsx`, set `data-ui` on the root from `uiPalette`. Set `data-palette` on `.ma-views` and the minimap drawing from a `diagramPalette` computed signal, and give `.ma-views` `background: var(--ma-canvas)`. Move chrome high-contrast selectors to `[data-ui$='-hc'], body.vscode-high-contrast, body.vscode-high-contrast-light`. Verify in the harness that `document.documentElement` has no `data-palette`
- [x] 3.4 Replace every `document.documentElement.dataset.palette` / root `--ma-*` read with `diagramPalette` or the `.ma-views` scope: `controller.activePalette`, `fallback.ts` `activePalette()`, `export.ts` background fallback and `Presentation.tsx` laser colour. Verify `grep -rn "documentElement.dataset.palette" packages/webview/src` finds only `player/main.ts`, and the existing export tests pass
- [x] 3.5 Cover `Controls follow the editor theme`, `UI theme does not change the drawing` and `Diagram theme does not change the controls` (visual-theme) in the harness, recording the toolbar and canvas colours observed

## 4. Mermaid-rendered diagrams in a Mermaid theme

- [x] 4.1 Pass the diagram palette into `GenericDiagram.mermaidSvg`: for `mermaid-<name>` use `initialize({ theme: name, themeVariables: { fontFamily, fontSize } })`, otherwise keep `base` + `themeVariables(palette)` (D4). Verify `A diagram's own theme wins` and `Native and Mermaid-rendered diagrams match` (visual-theme) in the harness: `neutral` nodes `#EEEEEE`, and `forest` participants and nodes both `#CDE498`
- [x] 4.2 Verify that Monochrome still neutralises author colours after the change by re-running the `fallback-monochrome.test.ts` suite and the harness *Only palette colours* sweep over the fixture corpus

## 5. Host: settings, fallback and write

- [x] 5.1 Contribute `mermaidAnimator.theme.ui` and `mermaidAnimator.theme.diagram` in `packages/extension/package.json`, with NLS in `package.nls.json` / `package.nls.es.json` and `enumItemLabels` for the Mermaid names, and deprecate `theme.mode` (`markdownDeprecationMessage`). Verify the l10n unit test passes and the manifest lists the 4 and 16 values
- [x] 5.2 In `environment.ts` `currentSettings()`, send `uiTheme` / `diagramTheme` through the protocol resolvers, passing `theme.diagram` only when a scope sets it (D1). Verify `Settings carry both themes` (host-webview-protocol) with an integration case in `packages/extension/test/suite/settingsAccess.test.ts`
- [x] 5.3 Replace `setThemeMode` with `setDiagramTheme` (D6, error string `Could not change the Mermaid Animator diagram theme: {0}` with its es entry) and update the `theme/set` handler in `panel.ts` to `payload.theme`; verify with the next tasks
- [x] 5.4 `Diagram theme change message matrix` (host-webview-protocol): R1–R2 → `packages/protocol/test/protocol.test.ts`, asserting the exact validator error; R1–R4 → `settingsAccess.test.ts`, asserting `theme.diagram`, `theme.ui`, the `settings/changed` sent to each panel and the output-channel line; verify both pass
- [x] 5.5 `Diagram theme menu choice matrix` (visual-theme), host side → `settingsAccess.test.ts`, one case per R2–R6 (R5: workspace defines `theme.diagram`; R6: workspace defines only `theme.mode`), resetting all three keys after each case. Also cover `Diagram theme cannot be written` with the stubbed configuration. Verify `npm run test:integration` passes
- [x] 5.6 `Live theme change matrix` (visual-theme), host rows R5–R6 → `settingsAccess.test.ts`, asserting the `diagramTheme` each `settings/changed` carries when `theme.mode` changes with `theme.diagram` unset and set; verify it passes

## 6. Toolbar diagram theme menu

- [x] 6.1 Rewrite `themeMenu.ts` as grouped `DIAGRAM_THEME_MENU` with `theme/set { theme }`. Add the strings `toolbar.diagramTheme` and `theme.<value>` for the 16 values (en and es) and the group headings, and render the groups with `.ma-menu__rule` in `ThemeMenu`. Verify `packages/webview/test/theme-menu.test.ts` asserts the 16 items, their order and their groups
- [x] 6.2 `Diagram theme menu choice matrix` (visual-theme), webview side → `theme-menu.test.ts`, `it.each` on `themeMenuMessage`, one case per R1–R4 (R1: `undefined`); verify it passes
- [x] 6.3 Cover `Menu opens on the effective diagram theme`, `All open panels switch their drawing` (one panel, with `settings/changed` driven from the harness) and `Escape closes the diagram theme menu without a change` (visual-theme) in the harness, including arrow keys crossing the two group rules

## 7. Checks that span the themes

- [x] 7.1 `Live theme change matrix` (visual-theme) R1–R4 → harness checklist, recording the toolbar background and the canvas background before and after:
  - [x] R1 `theme.ui` `vscode` → `graphite`: toolbar `#1A1D21`, drawing unchanged
  - [x] R2 `theme.diagram` `auto` → `forest`: toolbar unchanged, canvas `#FFFFFF` and participants `#CDE498`
  - [x] R3 editor light → dark with `vscode` / `auto`: toolbar follows the injected dark sample, drawing Graphite
  - [x] R4 editor light → dark with `ivory` / `forest`: neither changes
- [x] 7.2 Cover `Playback position survives a theme change` (visual-theme) in the harness: paused at step 4, switch `theme.diagram` to `dark`, and the step and paused state are kept
- [x] 7.3 `High-contrast adaptation matrix` (visual-theme) → harness checklist, with `body.vscode-high-contrast` toggled to stand in for the editor, one line per row:
  - [x] R1 `vscode` / `auto` / HC: control borders 2 px `contrastBorder`; dimmed lines dotted at full opacity
  - [x] R2 `vscode` / `forest` / HC: control borders 2 px; dimming by opacity only
  - [x] R3 `graphite` / `auto` / HC: control borders 1 px transparent; dimmed lines dotted
  - [x] R4 `highContrast` / `ivory` / light: control borders 2 px Ivory HC `rule`; dimming by opacity only
  - [x] R5 `vscode` / `auto` / dark: control borders 1 px transparent; dimming by opacity only
- [x] 7.4 `Export palette matrix` (export-theme) R1 → extend its `it.each` in `packages/webview/test/export-theme.test.ts` with a `mermaid-forest` active palette. Cover `Current export from a Monochrome panel` and `Current export in a Mermaid theme` with `exportPalette` / `buildJob` cases, and check the PNG of the latter in the harness (`#FFFFFF` background, participants `#CDE498`, no Graphite colour); verify they pass

## 8. Docs and release notes

- [x] 8.1 Update `packages/webview/harness` (UI theme and diagram theme selects, the *vscode vars* sample, D7) and the README: the settings table with `theme.ui`, `theme.diagram` and deprecated `theme.mode`, the toolbar *Diagram theme* paragraph, and the Monochrome paragraph. Verify `grep -n "theme.mode" packages/extension/README.md` shows it only as deprecated
- [x] 8.2 In `packages/extension/CHANGELOG.md` under `## Unreleased` (docs/versioning.md), add three entries and fold the unreleased *theme menu* entry into the `Added` one. Verify `npm run version:check` passes:
  - **Added — diagram themes.** The Mermaid themes, the *Diagram theme* menu, `theme.diagram` and `theme.ui`.
  - **Changed:** the panel's controls follow the VS Code theme by default; `theme.ui` restores Ink & Ivory.
  - **Deprecated:** `theme.mode`, still honoured while `theme.diagram` is unset.

## 9. Integration check

- [ ] 9.1 Run `npm run check` and `npm run test:integration`; verify both pass. Then, in the Extension Development Host, switch the editor between Dark Modern and Light Modern with `theme.ui` `vscode` and `theme.diagram` `forest`, and confirm the controls follow the editor while the drawing stays `forest`
