## MODIFIED Requirements

### Requirement: Export sheet
*Export…* (toolbar, `E`, palette command, CodeLens) SHALL open an export sheet in the panel with: format (SVG, PNG, GIF, WebM, MP4, Animated SVG, HTML player, copy image), range (all steps, current chapter, A–B range, current step), view, camera (fit, cinematic, current), size (presets 1280×720, 1920×1080, 1080×1080, 1080×1920, fit to content, or custom), scale (1×, 2×, 3×), frame rate (12, 15, 24, 30, 60), speed (0.5×–2×), theme (current, Ivory, Graphite, Monochrome; enabled for every format, see `export-theme`), background (theme, transparent where the format allows, custom colour), burn-in of captions, title card, step counter and transport, loop (forever, once, n times), end hold (0–5 s) and quality; the sheet SHALL preview the selected range and show the estimated duration and file size, and options irrelevant to the chosen format SHALL be disabled. `mermaidAnimator.export.defaultFormat`, `export.fps`, `export.scale`, `export.background`, `export.includeCaptions` and `export.theme` SHALL set the initial choices.

#### Scenario: Estimates update
- **WHEN** the user changes the frame rate from 15 to 30 for a GIF
- **THEN** the estimated size increases and the duration stays the same

#### Scenario: Irrelevant options disabled
- **WHEN** the format is SVG
- **THEN** frame rate, loop and end hold are disabled

#### Scenario: Theme field enablement matrix

| # | Format | *Theme* field | Options offered |
| :--- | :--- | :--- | :--- |
| R1 | SVG, PNG, Copy image | **Enabled** | ***Current*, *Ivory*, *Graphite*, *Monochrome*** |
| R2 | GIF, WebM, MP4 | **Enabled** | ***Current*, *Ivory*, *Graphite*, *Monochrome*** |
| R3 | Animated SVG | **Enabled** | ***Current*, *Ivory*, *Graphite*, *Monochrome*** |
| R4 | HTML player | **Enabled** | ***Follow the viewer*, *Ivory*, *Graphite*, *Monochrome*** |
