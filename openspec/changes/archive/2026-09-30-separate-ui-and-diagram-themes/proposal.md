# Proposal

## Why

One setting, `mermaidAnimator.theme.mode`, colours both the panel's controls (toolbar, menus, inspector, transport) and
the diagram. So choosing Monochrome for a diagram also turns every button black and white, and the controls never look
like the rest of VS Code. Users also know Mermaid's own themes (`default`, `forest`, `dark`, …) from GitHub and the
Mermaid Live Editor, and they expect to preview a diagram in one of those looks. The animator offers none of them.

## What Changes

- **Two independent themes.**
  - The **UI theme** colours the panel's controls. It comes from the new setting `mermaidAnimator.theme.ui` and is
    changed only in Settings. Its values are `vscode` (the default: the editor's own theme colours, including high
    contrast), `ivory`, `graphite` and `highContrast` (today's Ink & Ivory look).
  - The **diagram theme** colours only the drawing and its canvas. It comes from the new setting
    `mermaidAnimator.theme.diagram`.
- **Diagram themes:**
  - Ink & Ivory: *Follow editor theme* (`auto`, the default, today's look), *Ivory*, *Graphite* and *High contrast*.
  - The 11 themes of the pinned Mermaid 12: `default`, `neutral`, `dark`, `forest`, `base`, `neo`, `neo-dark`,
    `redux`, `redux-dark`, `redux-color` and `redux-dark-color`.
  - The custom *Monochrome* theme: black ink on white, where every filled colour becomes white.
- **Native diagrams follow Mermaid themes too.** Sequence diagrams and the topology view take their colours from the
  chosen Mermaid theme's variables: background, box fill and border, line, text, note and activation. Mermaid-rendered
  diagrams are rendered with that theme directly.
- **The toolbar *Theme* button changes only the diagram theme.** It becomes *Diagram theme*, lists the 16 diagram
  themes in three groups and writes `mermaidAnimator.theme.diagram`. The UI theme never changes the drawing, and the
  diagram theme never changes the controls. **Visible change** (a `Changed` entry under docs/versioning.md, not breaking): by default the controls now follow the VS Code
  theme instead of Ink & Ivory. Set `theme.ui` to `ivory`, `graphite` or `highContrast` for the previous look.
- `mermaidAnimator.theme.mode` is deprecated. It still sets the diagram theme when `theme.diagram` is not set anywhere,
  so existing settings keep working.
- The rule that draws pressed and checked controls inverted in Monochrome is removed, because the controls no longer
  follow the diagram theme.
- The `theme/set` message carries a diagram theme, and the host writes `theme.diagram`. The settings sent to the
  webview carry both themes.
- Exports: *Current* means the panel's diagram theme, including a Mermaid theme, both for stills and for GIF/video.
  The explicit export choices (*Ivory*, *Graphite*, *Monochrome*) are unchanged.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `visual-theme`:
  - New requirements: *UI theme selection*, *Diagram theme selection* (supersedes *Theme mode selection*), *Mermaid
    theme palettes* (native diagrams in a Mermaid theme), *Live theme changes* (supersedes *Live theme switching*) and
    *Toolbar diagram theme menu* (supersedes *Toolbar theme menu*).
  - *High-contrast adaptation* covers the UI theme.
  - *Monochrome panel controls* is removed.
- `host-webview-protocol`: *Diagram theme change request* supersedes *Theme change request* (new values, and the
  setting it writes).
- `export-theme`: *Export theme per format* defines *Current* as the panel's diagram theme and names
  `theme.diagram` in its scenarios.

## Impact

- `packages/renderer`:
  - `ThemeMode` becomes `DiagramTheme`, and `resolvePalette` covers all 16 values.
  - `PaletteName` gains 11 `mermaid-*` palettes.
  - A generated table `mermaidPalettes.generated.ts` holds each Mermaid theme's variables mapped to Ink & Ivory
    tokens.
  - The contrast tests are limited to Ink & Ivory and Monochrome.
- `packages/webview`:
  - The UI theme token block that maps to `--vscode-*` colours goes in `tokens.css` or `app.css`.
  - The diagram palette is scoped to the drawing container and the minimap, not the document root.
  - Mermaid rendering uses a theme name for Mermaid themes (`fallback.ts`).
  - The toolbar menu gets groups and new labels, and the Monochrome control CSS is removed.
  - `Presentation.tsx` reads the laser colour from the drawing scope.
  - The harness gets both selectors.
- `packages/protocol`: `WebviewSettings` gets `diagramTheme` and `uiTheme` (replacing `themeMode`), with the validators
  and new strings.
- `packages/extension`:
  - New `theme.ui` and `theme.diagram` contributions, and `theme.mode` deprecated (`markdownDeprecationMessage`).
  - The `theme.mode` fallback lives in `environment.ts`.
  - `setDiagramTheme` picks the write target.
  - NLS (en, es), README and CHANGELOG are updated.
- `scripts/mermaid-themes.mjs` generates the Mermaid palette table from the pinned Mermaid, and a test keeps the table
  in sync with Mermaid.
- No new runtime dependencies. Mermaid stays at the pinned 12.x, and native diagrams do not load Mermaid to get a
  theme.
