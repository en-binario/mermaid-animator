# Tasks

## 1. Monochrome palette (renderer)

- [ ] 1.1 Add `monochrome` to `PaletteName` and `PALETTES` in `packages/renderer/src/theme.ts` with the D1 token values, leaving `ThemeMode` and `resolvePalette` unchanged; verify `resolvePalette` cases in `theme.test.ts` still pass and none returns `monochrome`
- [ ] 1.2 Add the `[data-palette='monochrome']` block to `packages/renderer/src/tokens.css` and the `monochrome` halo (`#FFFFFF`) to `HALO` in `canvas.ts`; verify `theme.test.ts` passes its CSS-parity and contrast loops for `monochrome`
- [ ] 1.3 `Monochrome text contrast` (export-theme) → add to `packages/renderer/test/theme.test.ts` an `it.each` over `#FFFFFF`, `#EDEDED`, `#CCCCCC`, `#A6A6A6` asserting `contrastRatio('#000000', fill) >= 4.5`; verify it passes
- [ ] 1.4 Add `monochrome` to `AnimatedSvgTheme` and handle it in `themeVars` (`packages/renderer/src/animatedSvg.ts`) via the `PALETTES` branch (`--cs: none`, `--halo: #FFFFFF`); verify a new case in `animated-svg.test.ts` asserts those variables and no `prefers-color-scheme` block

## 2. Export theme resolution and the sheet

- [ ] 2.1 Add `ExportTheme` and `exportPalette(theme, active)` in `packages/webview/src/animated/` (D2) and use it in `buildJob` (`exporter.ts`); verify a Vitest case per theme in `packages/webview/test/sheet.test.ts` (or a new `export-theme.test.ts`) checks the resulting `job.palette`
- [ ] 2.2 `Export palette matrix` (export-theme) → `packages/webview/test/export-theme.test.ts`, `it.each` with one case per R1–R12 over the pure mapping (format × theme → palette or animated SVG theme or player theme); verify it passes
- [ ] 2.3 Widen `SheetState.theme` to `ExportTheme`, add `theme` to `fieldsFor` for `svg`, `png`, `copy` and `animated-svg`, and add the *Monochrome* option (`sheet.theme.monochrome`: en "Monochrome", es "Monocromo" in `packages/protocol/src/strings.ts` and the Spanish catalogue) to `ExportSheet.tsx`; verify with the next task
- [ ] 2.4 `Theme field enablement matrix` (animated-export) → `packages/webview/test/sheet.test.ts`, `it.each` with one case per R1–R4 asserting `fieldsFor(format).has('theme')`; update any existing `fieldsFor` expectation that listed SVG/PNG without `theme`; verify the suite passes
- [ ] 2.5 Pass `theme` through the sheet's `still` action and `ExportAction` (`main.tsx`), and add the `palette` option to `serializeSvg` (`export.ts`, D3), which sets `data-palette` on the off-screen host and takes the *Theme* background from `PALETTES[palette].canvas`; verify in the webview harness that a Monochrome SVG of a sequence diagram has a `#FFFFFF` background and `#000000` text while the panel keeps its palette (`Panel keeps its palette`)

## 3. Default export theme setting

- [ ] 3.1 Contribute `mermaidAnimator.export.theme` (enum `current`/`ivory`/`graphite`/`monochrome`, default `current`, `enumDescriptions`) in `packages/extension/package.json` with NLS strings in `package.nls.json` and `package.nls.es.json`, forward it in `environment.ts`, and regenerate the sidecar schema with `node scripts/sidecar-schema.mjs`; verify `animator.schema.json` contains `export.theme`
- [ ] 3.2 Resolve `exportDefaults.theme` in `packages/webview/src/settings.ts` (sidecar over VS Code, unknown → `current`) and feed it to `initialSheet` and to the direct `exportSvg` / `exportPng` / `copy` commands in `main.tsx`; verify with the next two tasks
- [ ] 3.3 `Default export theme matrix` (export-theme) → `packages/webview/test/sheet.test.ts` (R1–R5: `initialSheet` preselection, including the `sepia` fallback) and `packages/webview/test/sidecar.test.ts` or `settings-announce.test.ts` (R6–R9: the theme the direct commands resolve), one case per row id; verify it passes
- [ ] 3.4 Cover `Sheet choice overrides the setting` and `Sidecar overrides the VS Code setting` with Vitest cases on the settings resolution and sheet state; verify they pass

## 4. Mermaid-rendered diagrams in the export theme

- [ ] 4.1 Refactor `themeVariables()` in `packages/webview/src/fallback.ts` to take a token record from `PALETTES`, add the Monochrome overrides (pie ramp `pie1`–`pie12`, black pie stroke and section text, black git colours, white ER attribute rows), and verify that the panel renders unchanged in the harness for Ivory and Graphite
- [ ] 4.2 Pin the ER entity-name-row fill for Mermaid 12 with `scripts/mermaid-probe.mjs` against an `erDiagram` fixture, either as a theme variable or as a twin-scoped CSS rule (design Open Questions); record the chosen key or selector in a code comment and verify that the probe output shows `#EDEDED` on the name row
- [ ] 4.3 Serialise every Mermaid `initialize` + `render` through one promise chain in `fallback.ts`, and add `GenericDiagram.renderTwin(source, palette)` with its own hidden holder, render id and stylesheet, destroyed after use (D4); verify that a live reload during an export does not change the panel's colours (harness check)
- [ ] 4.4 Make `controller.exportMaterial(view, palette)` and the still-export drawing use the twin when the engine is generic and the palette differs from the active one, with the group-count guard failing the export through `export.failed`; verify `Ivory export of a flowchart from a Graphite panel` and `Same steps in every theme` in the harness
- [ ] 4.5 Harness checklist for the Mermaid-rendered scenarios (export-theme), one line each, run in `node scripts/serve-harness.mjs` and ticked here: `ER diagram in Monochrome` (name row `#EDEDED`, attribute rows `#FFFFFF`, text `#000000`); `Ivory export of a flowchart from a Graphite panel`; `Same steps in every theme` (7 groups, same order); `Export rendering fails` (no file, *Export failed: …* notice)
- [ ] 4.6 `Only palette colours` (export-theme) → a Vitest test (`packages/webview/test/export-theme.test.ts`, using `scripts/mermaid-jsdom.mjs` if the jsdom Mermaid setup allows it, otherwise a harness line in 4.5) that exports a flowchart in Monochrome and asserts every `fill`/`stroke` is `#000000`, `#FFFFFF`, `#EDEDED`, `none` or `transparent`; verify it passes

## 5. Monochrome element colours (native renderers)

- [ ] 5.1 `Monochrome element colour matrix` (export-theme) → harness checklist, one line per R1–R9, checked on exported Monochrome SVG and PNG of a sequence diagram with a `box`, a fragment, an activation and a note (R1–R7, R9 with burn-in on a GIF), a topology export (R2, R3, R7) and a pie chart (R8); tick each row here
- [ ] 5.2 Verify `Theme does not change the frames` with a Vitest case in `packages/webview/test/frames.test.ts` or `export-theme.test.ts` asserting that `buildJob` yields equal `width`, `height` and `plan.total` for `current` and `monochrome`

## 6. Animated SVG and HTML player

- [ ] 6.1 Map the sheet theme to `AnimatedSvgTheme` in `svgExport.ts` (D5): `current` → `github` with the pair and adaptive options as today, any other theme → one file in that palette with `pair` and `adaptive` forced off; disable *Pair* in `ExportSheet.tsx` unless the theme is *Current*; verify with the next task
- [ ] 6.2 `Animated SVG theme matrix` (animated-svg-export) → `packages/webview/test/export-theme.test.ts` (or `packages/renderer/test/animated-svg.test.ts`), `it.each` with one case per R1–R4 asserting file names, palette variables, casing (`--cs`) and presence of the `prefers-color-scheme` block; verify that it passes and that the existing `Pair written` expectation still holds
- [ ] 6.3 Accept `monochrome` in `PlayerData.theme`, the `export/player` validator in `packages/protocol/src/index.ts` and `playerHtml.ts` (`color-scheme: light`); make `player/main.ts` set `data-palette='monochrome'` without following `prefers-color-scheme`; embed the twin rendering for generic diagrams with a fixed theme (D6); verify with a protocol validation case and `packages/webview/test/player.test.ts` cases for R10–R12 of `Export palette matrix`
- [ ] 6.4 Extend the M3 integration test (`packages/extension/test/suite/m3.test.ts`) so that an `export/player` message with `theme: 'monochrome'` writes a player whose HTML declares `color-scheme: light`; verify with `npm run test:integration`

## 7. Documentation and release notes

- [ ] 7.1 Document the Monochrome theme and `mermaidAnimator.export.theme` in `packages/extension/README.md` (export section and settings table); verify that the setting key and its default match `package.json`
- [ ] 7.2 Add the entries under `## Unreleased` in `packages/extension/CHANGELOG.md` (docs/versioning.md): "**Added — Monochrome export theme.** …" (black ink, white fills, light grey headers; every image format; `mermaidAnimator.export.theme`) and "**Fixed:** the export theme (*Ivory* / *Graphite*) now applies to Mermaid-rendered diagrams"; verify with `npm run version:check` that the entries parse
- [ ] 7.3 Run `npm run check`, `npm run test:integration` and `openspec validate add-monochrome-export-theme --strict`; verify that all three pass
