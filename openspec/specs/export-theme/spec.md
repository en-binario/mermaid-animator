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
chosen theme names, whatever diagram theme the panel shows. *Current* SHALL keep each format's existing behaviour: for
stills, GIF and video, the panel's diagram theme, which is any `mermaidAnimator.theme.diagram` value, including a
Mermaid theme or Monochrome (see `visual-theme` :: *Diagram theme selection*); the GitHub-safe palette for Animated
SVG; and, labelled *Follow the viewer*, Ivory or Graphite following the viewer's colour scheme for the HTML player. The
UI theme (`mermaidAnimator.theme.ui`) SHALL have no effect on any export. The theme SHALL change colours only: frame
size, frame count, step order and timing SHALL be identical for every theme.

#### Scenario: Export palette matrix

| # | Format | Theme | Palette of the written file |
| :--- | :--- | :--- | :--- |
| R1 | SVG, PNG, Copy image, GIF, WebM, MP4 | *Current* | **The panel's diagram theme (Ivory, Graphite, Ivory high contrast, Graphite high contrast, Monochrome or a Mermaid theme)** |
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

#### Scenario: Current export from a Monochrome panel
- **GIVEN** `mermaidAnimator.theme.diagram` is `monochrome` and the panel shows a sequence diagram
- **WHEN** the user exports a PNG with theme *Current*
- **THEN** the PNG has a `#FFFFFF` background and every participant box has the fill `#FFFFFF` and the stroke `#000000`

#### Scenario: Current export in a Mermaid theme
- **GIVEN** `mermaidAnimator.theme.diagram` is `forest`, `theme.ui` is `graphite`, and the panel shows a sequence diagram
- **WHEN** the user exports a PNG with theme *Current*
- **THEN** the PNG has a `#FFFFFF` background and every participant box has the fill `#CDE498`; no Graphite colour appears

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

### Requirement: Export theme for Mermaid-rendered diagrams
For diagrams shown by the generic engine, an export whose theme is not the panel's active palette SHALL be drawn from a
separate rendering of the diagram in the export theme, so that *Ivory*, *Graphite* and *Monochrome* take effect for
them as for native diagrams. An export whose theme is the panel's active palette SHALL use the panel's rendering. The
panel's own rendering SHALL be left unchanged. The export rendering SHALL have the same groups, step order and drawing
size as the panel's rendering. A Monochrome export rendering SHALL replace the colours the diagram source sets, as
`visual-theme` :: *Monochrome palette* states. When that rendering fails, nothing SHALL be written and the panel SHALL
show the notice *Export failed: <Mermaid's message>* (`export.failed`).

#### Scenario: ER diagram in Monochrome
- **GIVEN** an `erDiagram` with the entity `CUSTOMER` having the attributes `string name` and `int id`
- **WHEN** it is exported as SVG with theme *Monochrome*
- **THEN** the row holding `CUSTOMER` and both attribute rows have the fill `#FFFFFF` and the stroke `#000000`, and every text is `#000000`

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

#### Scenario: Author colours in a Monochrome export
- **GIVEN** the panel shows, in the Graphite palette, a flowchart with the line `style A fill:#f9f,stroke:#333,color:#c00`
- **WHEN** it is exported as SVG with theme *Monochrome*
- **THEN** node `A` in the SVG has the fill `#FFFFFF`, the stroke `#000000` and the text `#000000`
- **AND** node `A` in the panel still has the fill `#f9f`
