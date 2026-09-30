# Proposal

## Why

Exports carry the panel's Ink & Ivory colours (warm ivory canvas, navy accent, brass and sage highlights). Those colours
read as branded when the image goes into a formal document, such as a specification, an audit report, a thesis or a
printed handbook. There, a diagram is expected to be black ink on white paper. Users recolour exports by hand today, and
they cannot recolour Mermaid-rendered diagrams at all: the sheet's *Ivory* / *Graphite* choice is ignored for them.

## What Changes

- Add a **Monochrome** export theme. All text, lines, arrowheads and borders are black (`#000000`), and every canvas and
  component fill is white (`#FFFFFF`). A single light grey (`#EDEDED`) fills only structural header and grouping areas:
  ER entity headers, sequence `box` groups, fragment keyword tabs and activation bars, flowchart subgraphs, and the
  current-step highlight. Pie slices use a fixed grey ramp so that they stay
  distinguishable.
- The export sheet's **Theme** field offers *Current*, *Ivory*, *Graphite* and *Monochrome*. It is now enabled for every
  image format: SVG, PNG, Copy image, GIF, WebM, MP4, Animated SVG and HTML player. Previously it was enabled for GIF,
  WebM, MP4 and HTML player only.
- New setting `mermaidAnimator.export.theme` (`current` default, `ivory`, `graphite`, `monochrome`) sets the sheet's
  initial theme. The direct commands *Export as SVG*, *Export as PNG* and *Copy Image*, which bypass the sheet, also use it.
- Mermaid-rendered (generic) diagrams are re-rendered off-screen with the chosen export theme. As a result, *Ivory* and
  *Graphite* now also take effect for them, which fixes the ignored choice.
- Animated SVG: *Current* keeps today's GitHub-safe single file, the light + dark pair and the adaptive option. Any other
  theme writes one file with that palette, and the pair and adaptive options are disabled.
- HTML player: *Monochrome* pins the player to the Monochrome palette whatever the viewer's colour scheme is.
- The panel itself is unchanged. `mermaidAnimator.theme.mode` gains no Monochrome value.

## Capabilities

### New Capabilities
- `export-theme`: the export themes available to each format, the `mermaidAnimator.export.theme` setting, the Monochrome
  palette's colour rules (black ink, white fills, one light grey for header and grouping fills, the pie grey ramp), and
  how Mermaid-rendered diagrams take the export theme.

### Modified Capabilities
- `animated-export`: the *Export sheet* requirement lists Monochrome among the theme choices, enables the theme field for
  every image format, and names `export.theme` among the initial-choice settings.
- `animated-svg-export`: *GitHub-safe theming* applies when the theme is *Current*. The light + dark pair and
  `export.svgAdaptiveTheme` apply only then.

## Impact

- `packages/renderer`: new `monochrome` palette in `theme.ts` and `tokens.css`, the canvas halo table, and the animated
  SVG theme variables (`AnimatedSvgTheme`).
- `packages/webview`: export sheet (`sheet.ts` field table, `ExportSheet.tsx` options), still export (`main.tsx`
  `runExport`, `export.ts` `serializeSvg` palette scoping), animated job palette (`exporter.ts`), animated SVG theme
  choice (`svgExport.ts`), generic engine re-render with explicit theme variables (`fallback.ts`), the player data theme
  (`player/data.ts`, `player/main.ts`), settings resolution (`settings.ts`), and new localisation strings.
- `packages/protocol`: `export/player` `theme` accepts `monochrome`; the export theme default travels with the export
  settings.
- `packages/extension`: `mermaidAnimator.export.theme` contribution and NLS strings (en, es), forwarding it with the other
  `export.*` settings, the player HTML `color-scheme` for Monochrome, and a CHANGELOG entry.
- No new dependencies. Mermaid stays at the pinned 12.x.
