# Design

## Context

Every renderer already draws from one palette table. `packages/renderer/src/theme.ts` defines `PALETTES` keyed by
`PaletteName` (`ivory`, `graphite`, `ivory-hc`, `graphite-hc`), and `tokens.css` mirrors it as
`[data-palette='…']` blocks. A unit test (`packages/renderer/test/theme.test.ts`) checks that the two match and checks
contrast for every palette. The export paths consume it as follows:

| Path | Palette source today |
|---|---|
| Still SVG / PNG / Copy (`main.tsx` `runExport` → `export.ts` `serializeSvg`) | Computed styles of the document, which is the panel's palette. There is no theme option |
| GIF / WebM / MP4 (`exporter.ts` `buildJob`) | `options.theme` mapped to `ivory` / `graphite`, otherwise `material.palette`. `canvas.ts` draws with `PALETTES[name]` |
| Animated SVG (`svgExport.ts`, `animatedSvg.ts` `themeVars`) | `github`, or `ivory` + `graphite` for the pair |
| HTML player (`player/main.ts`) | `data-palette` set from `light` / `dark` / `auto` |
| Generic (Mermaid) diagrams, every format | Mermaid's own CSS, baked with `themeVariables()` from the **document's** CSS tokens when the panel rendered. `frameSvgText` and `exportDrawing` clone that rendering, so the sheet's *Ivory* / *Graphite* choice has no effect for them |

The last row is the main constraint. Recolouring a Mermaid rendering after the fact is unreliable, because Mermaid
writes colours into id-scoped CSS rules and into inline attributes. The only dependable way to get another palette is
to render the diagram again.

## Goals / Non-Goals

**Goals:**
- One new palette entry (`monochrome`) that every existing export path picks up through `PaletteName`, with no
  per-format colour code.
- A single "resolve export palette" step shared by the sheet, the direct commands and every format.
- Generic diagrams exported in any fixed theme, without disturbing the panel's rendering or its adopted stylesheet.

**Non-Goals:**
- Making the HTML player's *Follow the viewer* mode recolour generic drawings live. They keep the baked panel palette,
  as today (`export-theme` :: *Export palette matrix* :: R9).
- A Monochrome value for `mermaidAnimator.theme.mode`.

## Decisions

### D1. Monochrome is a regular `PaletteName`, never returned by `resolvePalette`

Add `monochrome` to `PaletteName`, `PALETTES`, `tokens.css` and the `HALO` table in `canvas.ts`. `ThemeMode` and
`resolvePalette` stay unchanged, so the panel can never select it. Token values:

| Tokens | Value |
|---|---|
| `canvas`, `surface`, `note-fill` | `#FFFFFF` |
| `surface-sunken`, `accent-muted` | `#EDEDED` |
| `hairline`, `rule`, `note-rule`, `ink-1`, `ink-2`, `ink-3`, `accent`, `brass`, `sage`, `crimson`, `viridian` | `#000000` |
| Halo (`canvas.ts`) and `--halo` (animated SVG) | `#FFFFFF` |

With these values, `surface-sunken` provides the grey for `box` groups, fragment keyword tabs, subgraphs and topology
clusters, and `accent-muted` provides it for activation bars and the current-step highlight. This matches the spec's
header and grouping list with no renderer change. Because the ink tokens are all black, muted and unplayed states lose
their colour difference and keep only the opacity and stroke-width differences that the renderers already apply. The
existing `theme.test.ts` loops then cover contrast and CSS parity automatically.

*Alternative considered:* a CSS-only override layer on top of Ivory. It was rejected because the canvas renderer and the
animated SVG never read CSS. They read `PALETTES`.

### D2. `ExportTheme` and one resolver

Introduce `type ExportTheme = 'current' | 'ivory' | 'graphite' | 'monochrome'` in `packages/webview/src/animated/` and
`exportPalette(theme, active: PaletteName): PaletteName` (`current` → `active`). `buildJob`, the still export, the
animated SVG and the player all call it. The sheet state's `theme` widens to `ExportTheme`. `fieldsFor` adds `theme` for
`svg`, `png`, `copy` and `animated-svg`, and the `<select>` gains a *Monochrome* option (`sheet.theme.monochrome`).

### D3. Still export scopes the palette on the off-screen host

`serializeSvg` already attaches the drawing to an off-screen `div.ma-export-host` to read computed styles. It gains a
`palette` option and sets `host.dataset.palette = palette`. The `[data-palette]` token block then redefines the
`--ma-*` custom properties for that subtree only, so the resolved presentation attributes carry the export palette.
The *Theme* background reads `PALETTES[palette].canvas` instead of the document. The `ExportAction` for `svg`, `png` and
`copy` gains `theme`. The sheet passes its choice, and the direct commands pass `exportDefaults.theme`.

### D4. Generic diagrams: an off-screen twin rendering

`themeVariables()` becomes `themeVariables(c: Record<ColorToken, string>)`, fed from `PALETTES`. The panel passes its
active palette, which gives the same values it reads from CSS today. For Monochrome it adds overrides:

- `pie1`–`pie12` follow the ramp `#FFFFFF`, `#EDEDED`, `#CCCCCC`, `#A6A6A6`, with `pieStrokeColor` and
  `pieSectionTextColor` set to `#000000`;
- git branch colours are `#000000`;
- ER attribute rows are `#FFFFFF`, and the entity name row is `#EDEDED` (see Open questions for the exact keys).

`GenericDiagram.renderTwin(source, palette): Promise<GenericDiagram>` creates a detached instance with its own hidden
holder and its own render id, and therefore its own id-scoped stylesheet. It renders with the export palette's
variables, and the export uses the twin's `frameSvgText` / `exportDrawing` / player SVG. The twin is destroyed in a
`finally` block. `controller.exportMaterial(view, palette)` returns twin-backed material when the engine is generic and
`palette` differs from the active one. The group discovery and `orderGroups` run on the twin exactly as on the panel's
rendering. Colours do not affect Mermaid's layout, so the group count, the order and the bounds match. A guard compares
the group count with the panel's and fails the export if they differ.

Mermaid's `initialize` is global. Twin and panel renders are therefore serialised through one module-level promise
chain in `fallback.ts`, so a live reload that arrives during an export cannot interleave `initialize` and `render`
calls.

*Alternative considered:* rewriting colours in the cloned SVG with a lookup from palette to palette. It was rejected
because Mermaid derives some colours (darkened borders, computed text colours), so there is no one-to-one mapping.

### D5. Animated SVG theme mapping

`current` → `github` (with the pair and the adaptive option as today). Any other theme maps to one file with
`AnimatedSvgTheme` = that palette. `AnimatedSvgTheme` gains `monochrome`, and `themeVars` handles it through the
existing `PALETTES` branch (`--cs: none`). The sheet disables *Pair* unless the theme is `current`, and `adaptive` is
forced to `false` for fixed themes.

### D6. HTML player and protocol

`PlayerData.theme` and the `export/player` message's `theme` accept `monochrome` (`packages/protocol` validator
`oneOf('light', 'dark', 'auto', 'monochrome')`). The sheet maps `ivory` → `light`, `graphite` → `dark`,
`current` → `auto` and `monochrome` → `monochrome`. `player/main.ts` sets `data-palette='monochrome'` and does not
subscribe to `prefers-color-scheme`. `playerHtml.ts` emits `color-scheme: light` for it. For a fixed theme (`light`,
`dark` or `monochrome`), generic player data embeds the twin rendering from D4.

### D7. `mermaidAnimator.export.theme`

A new contribution in `packages/extension/package.json` (enum with `enumDescriptions`, NLS keys in `package.nls.json` and
`package.nls.es.json`) is added to the forwarded keys in `environment.ts`. The sidecar schema is regenerated with
`scripts/sidecar-schema.mjs`. `settings.ts` resolves `exportDefaults.theme` with the existing precedence (sidecar over
VS Code) and falls back to `current` for unknown values. `initialSheet` takes it as `defaults.theme`.

## Risks / Trade-offs

- [The twin render doubles Mermaid time for a generic export (hundreds of ms on large diagrams)] → It runs only when the
  export palette differs from the active one. The sheet already shows a busy state during export.
- [The group-count guard could fire on a Mermaid layout that is not deterministic] → Layout does not depend on colours.
  If the guard ever fires, the export fails with `export.failed` instead of producing a wrong step order. This is logged
  so that it can be investigated.
- [All-black ink removes the played / unplayed colour cue in animated Monochrome exports] → This is accepted for the
  formal style. The cue remains as opacity and stroke width. Static exports, the main use of Monochrome, show the
  resting frame, where every element is played.
- [Mermaid adds a new diagram type with colourful defaults that no variable covers] → The *Only palette colours*
  scenario runs over the fixture corpus. A new colour shows up as a test failure, not in users' documents.

## Migration Plan

This change is additive. The new setting defaults to `current`, and every existing export keeps its output. The one
observable change for existing users is the fix that makes *Ivory* / *Graphite* take effect for generic diagrams in GIF
and video exports. The CHANGELOG entry calls it out. Rolling back means reverting the change. No stored data depends on
it: a sidecar file with `export.theme` would then produce the schema's unknown-key warning.

## Open Questions

- The exact Mermaid 12 theme variables or selectors for the ER entity name row. They are pinned during implementation
  with `scripts/mermaid-probe.mjs` against an `erDiagram` fixture. If no theme variable exists for the row, a
  twin-scoped CSS rule (`#<twin id> …`) appended to the twin's stylesheet sets it. The outcome is fixed by
  `export-theme` :: *ER diagram in Monochrome* either way.
