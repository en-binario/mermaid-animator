# export-theme Specification

## Purpose
Lets every image export be drawn in a chosen palette, independent of the panel's theme, including the formal
Monochrome palette (black ink on white) for documents, reports and print.

**Non-goals:**
- The palettes themselves, including Monochrome, and the panel's theme choice, owned by `visual-theme`.
- User-defined colours per element; only the export background colour is customisable, owned by `animated-export` and
  `static-export`.

## Requirements

### Requirement: Export theme per format
The export sheet's *Theme* field SHALL offer *Current*, *Ivory*, *Graphite* and *Monochrome* for every image format
(SVG, PNG, Copy image, GIF, WebM, MP4, Animated SVG and HTML player), and the export SHALL be drawn in the palette the
chosen theme names, whatever palette the panel shows. *Current* SHALL keep each format's existing behaviour: the panel's
active palette for stills, GIF and video; the GitHub-safe palette for Animated SVG; and, labelled *Follow the viewer*,
Ivory or Graphite following the viewer's colour scheme for the HTML player. The theme SHALL change colours only: frame
size, frame count, step order and timing SHALL be identical for every theme.

#### Scenario: Export palette matrix

| # | Format | Theme | Palette of the written file |
| :--- | :--- | :--- | :--- |
| R1 | SVG, PNG, Copy image, GIF, WebM, MP4 | *Current* | **The panel's active palette (Ivory, Graphite, Ivory high contrast or Graphite high contrast)** |
| R2 | SVG, PNG, Copy image, GIF, WebM, MP4 | *Ivory* | **Ivory** |
| R3 | SVG, PNG, Copy image, GIF, WebM, MP4 | *Graphite* | **Graphite** |
| R4 | SVG, PNG, Copy image, GIF, WebM, MP4 | *Monochrome* | **Monochrome** |
| R5 | Animated SVG | *Current* | **GitHub-safe (see `animated-svg-export`)** |
| R6 | Animated SVG | *Ivory* | **Ivory** |
| R7 | Animated SVG | *Graphite* | **Graphite** |
| R8 | Animated SVG | *Monochrome* | **Monochrome** |
| R9 | HTML player | *Follow the viewer* | **Ivory for a light viewer colour scheme, Graphite for a dark one; a Mermaid-rendered drawing keeps the panel's palette** |
| R10 | HTML player | *Ivory* | **Ivory for any viewer colour scheme** |
| R11 | HTML player | *Graphite* | **Graphite for any viewer colour scheme** |
| R12 | HTML player | *Monochrome* | **Monochrome for any viewer colour scheme** |

#### Scenario: Theme does not change the frames
- **GIVEN** a sequence diagram whose GIF export with theme *Current* at 15 fps is 1280 × 720 with 180 frames
- **WHEN** the same range is exported as GIF with theme *Monochrome*
- **THEN** the GIF is 1280 × 720 with 180 frames

#### Scenario: Panel keeps its palette
- **GIVEN** the panel shows the Graphite palette
- **WHEN** the user exports a PNG with theme *Monochrome*
- **THEN** the PNG has a `#FFFFFF` background and the panel still shows the Graphite palette

### Requirement: Default export theme setting
The setting `mermaidAnimator.export.theme` (default `current`) SHALL accept `current`, `ivory`, `graphite` and
`monochrome`. It SHALL set the theme preselected when the export sheet opens, and SHALL be the theme used by the direct
commands *Export as SVG*, *Export as PNG* and *Copy Image*, which do not open the sheet. Like the other `export.*`
settings, it SHALL also be accepted in a sidecar file's settings, which override the VS Code setting. A value outside
the accepted list SHALL be treated as `current`.

#### Scenario: Default export theme matrix

| # | Entry point | Effective `export.theme` | Theme used |
| :--- | :--- | :--- | :--- |
| R1 | *Any* | A value outside the list (`sepia`) | **Current** |
| R2 | Export sheet opens | `current` (default) | ***Current* preselected** |
| R3 | Export sheet opens | `ivory` | ***Ivory* preselected** |
| R4 | Export sheet opens | `graphite` | ***Graphite* preselected** |
| R5 | Export sheet opens | `monochrome` | ***Monochrome* preselected** |
| R6 | *Export as SVG*, *Export as PNG* or *Copy Image* command | `current` (default) | **The panel's active palette** |
| R7 | *Export as SVG*, *Export as PNG* or *Copy Image* command | `ivory` | **Ivory** |
| R8 | *Export as SVG*, *Export as PNG* or *Copy Image* command | `graphite` | **Graphite** |
| R9 | *Export as SVG*, *Export as PNG* or *Copy Image* command | `monochrome` | **Monochrome** |

#### Scenario: Sheet choice overrides the setting
- **GIVEN** `mermaidAnimator.export.theme` is `monochrome`
- **WHEN** the user opens the export sheet, selects *Ivory* and exports a PNG
- **THEN** the PNG is drawn in the Ivory palette

#### Scenario: Sidecar overrides the VS Code setting
- **GIVEN** the VS Code setting `mermaidAnimator.export.theme` is `current` and the diagram's sidecar file sets `export.theme` to `monochrome`
- **WHEN** the user runs *Export as SVG*
- **THEN** the SVG is drawn in the Monochrome palette

### Requirement: Monochrome palette
The Monochrome palette SHALL draw all text, lines, arrowheads, borders and dividers in black, and the canvas and every
component fill in white. It SHALL use one light grey only for header and grouping fills: ER entity headers, sequence
`box` groups, fragment keyword tabs, activation bars, flowchart subgraphs, topology clusters and the current-step
highlight. Pie slices SHALL use a fixed grey ramp. No other colour SHALL appear in a Monochrome export; de-emphasised
elements (muted or unplayed) SHALL differ from emphasised ones only by opacity and stroke width. Monochrome text and
lines SHALL carry no casing; a text knockout, where one is drawn, is `#FFFFFF`.

**Constraints:**
- Ink: `#000000`
- Canvas and component fill: `#FFFFFF`
- Header and grouping fill: `#EDEDED`
- Pie slice fills, in slice order and repeating: `#FFFFFF`, `#EDEDED`, `#CCCCCC`, `#A6A6A6`
- Contrast: every text colour reaches at least 4.5:1 against the fill under it (the lowest is `#000000` on `#A6A6A6`, 8.6:1)
- Background *Theme* is `#FFFFFF`

#### Scenario: Monochrome element colour matrix

| # | Element | Fill | Stroke | Text |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Canvas with background *Theme* | **`#FFFFFF`** | ***N/A*** | ***N/A*** |
| R2 | Sequence participant box, flowchart node, state, class box, topology node, ER attribute row | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R3 | ER entity header, sequence `box` group, fragment keyword tab, flowchart subgraph, topology cluster | **`#EDEDED`** | **`#000000`** | **`#000000`** |
| R4 | Activation bar, current-step highlight | **`#EDEDED`** | **`#000000`** | ***N/A*** |
| R5 | Message line, edge, relationship line, lifeline | ***N/A*** | **`#000000`** | **`#000000`** |
| R6 | Arrowhead | **`#000000`** | **`#000000`** | ***N/A*** |
| R7 | Note, edge-label background, topology edge badge | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R8 | Pie slice *k* (1-based) | **Ramp entry ((*k* − 1) mod 4) + 1** | **`#000000`** | **`#000000`** |
| R9 | Burnt-in caption, title card, step counter, transport | **`#FFFFFF`** | **`#000000`** | **`#000000`** |

#### Scenario: Only palette colours
- **WHEN** a Monochrome SVG export of a flowchart is inspected
- **THEN** every `fill` and `stroke` value is `#000000`, `#FFFFFF`, `#EDEDED`, `none` or `transparent`

#### Scenario: Monochrome text contrast
- **WHEN** the contrast of `#000000` is computed against `#FFFFFF`, `#EDEDED`, `#CCCCCC` and `#A6A6A6`
- **THEN** every ratio is at least 4.5:1

### Requirement: Export theme for Mermaid-rendered diagrams
For diagrams shown by the generic engine, an export whose theme is not the panel's active palette SHALL be drawn from a
separate rendering of the diagram in the export theme, so that *Ivory*, *Graphite* and *Monochrome* take effect for
them as for native diagrams. The panel's own rendering SHALL be left unchanged. The export rendering SHALL have the same
groups, step order and drawing size as the panel's rendering. When that rendering fails, nothing SHALL be written and
the panel SHALL show the notice *Export failed: <Mermaid's message>* (`export.failed`).

#### Scenario: ER diagram in Monochrome
- **GIVEN** an `erDiagram` with the entity `CUSTOMER` having the attributes `string name` and `int id`
- **WHEN** it is exported as SVG with theme *Monochrome*
- **THEN** the row holding `CUSTOMER` has the fill `#EDEDED`, both attribute rows have the fill `#FFFFFF`, and every text is `#000000`

#### Scenario: Ivory export of a flowchart from a Graphite panel
- **GIVEN** the panel shows a flowchart in the Graphite palette
- **WHEN** the user exports it as PNG with theme *Ivory*
- **THEN** the PNG has the Ivory canvas `#FAF8F3` and node text `#1B1E23`
- **AND** the panel still shows the flowchart in the Graphite palette

#### Scenario: Same steps in every theme
- **GIVEN** a flowchart with 4 nodes and 3 edges
- **WHEN** it is exported as GIF with theme *Monochrome*
- **THEN** the GIF reveals 7 groups in the same order as the panel

#### Scenario: Export rendering fails
- **GIVEN** Mermaid throws `Parse error on line 3` while rendering the diagram in the export theme
- **WHEN** the user exports it as SVG with theme *Monochrome*
- **THEN** no file is written and the panel shows *Export failed: Parse error on line 3*
