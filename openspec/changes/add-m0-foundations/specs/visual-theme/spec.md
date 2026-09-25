# Spec Delta

## Purpose

Provides the formal "Ink & Ivory" visual language — colour tokens, theme selection, high-contrast adaptation, typography and motion preference — that every animator view is drawn with.

## ADDED Requirements

### Requirement: Colour token palettes
The webview SHALL define the Ink & Ivory colour tokens (§9.2 of the product specification) for the Ivory (light) and Graphite (dark) palettes, and every text token SHALL have a contrast ratio of at least 4.5:1 against its palette's canvas colour.

#### Scenario: Text contrast
- **WHEN** the contrast of each text token (`ink-1`, `ink-2`, `ink-3`, `accent`, `brass`, `crimson`, `viridian`) is computed against its palette's canvas
- **THEN** every ratio is at least 4.5:1

### Requirement: Theme mode selection
The setting `mermaidAnimator.theme.mode` SHALL accept `auto` (default), `ivory`, `graphite` and `highContrast`; `auto` SHALL select Ivory for light editor themes, Graphite for dark themes and the matching high-contrast variant for high-contrast themes.

#### Scenario: Auto follows a dark theme
- **WHEN** the theme mode is `auto` and the editor uses a dark colour theme
- **THEN** the panel renders with the Graphite palette

#### Scenario: Fixed palette
- **WHEN** the theme mode is `ivory` and the editor uses a dark colour theme
- **THEN** the panel renders with the Ivory palette

### Requirement: Live theme switching
Changes to the editor colour theme or to `mermaidAnimator.theme.mode` SHALL be applied to open panels without reloading them.

#### Scenario: Setting change
- **WHEN** the user changes `mermaidAnimator.theme.mode` from `auto` to `graphite` while a panel is open
- **THEN** the panel switches to Graphite without losing its state

### Requirement: High-contrast adaptation
In high-contrast variants, borders SHALL be at least 2 px, dimming SHALL NOT rely on opacity alone, and focus indicators SHALL use the editor's contrast border colour.

#### Scenario: High-contrast borders
- **WHEN** the editor uses a high-contrast theme
- **THEN** interactive element borders render at 2 px or wider using the contrast border colour

### Requirement: Bundled typography
The webview SHALL use the bundled Inter font for diagram labels and the bundled Source Serif 4 font for captions and titles, falling back to the editor UI font stack if a font fails to load.

#### Scenario: Fonts load offline
- **WHEN** the panel opens without network access
- **THEN** labels render in Inter and titles in Source Serif 4

### Requirement: Reduced-motion propagation
The host SHALL resolve the editor's `workbench.reduceMotion` setting (with `auto` deferring to the operating system preference) and pass it to the webview, which SHALL expose it to all animation code and update it live.

#### Scenario: Reduce motion on
- **WHEN** `workbench.reduceMotion` is `on`
- **THEN** the webview reports reduced motion as active
