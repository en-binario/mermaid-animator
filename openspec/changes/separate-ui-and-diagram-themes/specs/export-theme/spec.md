## MODIFIED Requirements

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
