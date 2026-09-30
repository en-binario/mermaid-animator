## MODIFIED Requirements

### Requirement: GitHub-safe theming
When the export theme is *Current* (the default, see `export-theme`), the animated SVG SHALL have a transparent background and a GitHub-safe palette whose inks keep at least 4.5:1 contrast on `#ffffff` and whose strokes and text carry a white casing keeping at least 4.5:1 against both the inks and `#0d1117` (no flat colour reaches 4.5:1 on both backgrounds); *Export for GitHub (light + dark pair)* SHALL write `<name>.light.anim.svg` and `<name>.dark.anim.svg`; when `mermaidAnimator.export.svgAdaptiveTheme` is true (default false) the single file SHALL additionally include a `prefers-color-scheme: dark` palette. With the theme *Ivory*, *Graphite* or *Monochrome*, the export SHALL write one file named `<name>.anim.svg` in that palette with no casing and no `prefers-color-scheme` block, and the pair option SHALL be disabled; `export.svgAdaptiveTheme` SHALL have no effect.

#### Scenario: Pair written
- **WHEN** the user exports `checkout` with *Export for GitHub (light + dark pair)*
- **THEN** `checkout.light.anim.svg` and `checkout.dark.anim.svg` are written

#### Scenario: Animated SVG theme matrix

| # | Theme | Pair | `export.svgAdaptiveTheme` | Files written for `checkout` | Palette | Casing | `prefers-color-scheme: dark` block |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | *Ivory*, *Graphite* or *Monochrome* | **Disabled** | *Any* | **`checkout.anim.svg`** | **The chosen theme** | **None** | **Absent** |
| R2 | *Current* | Selected | *Any* | **`checkout.light.anim.svg`, `checkout.dark.anim.svg`** | **Ivory, Graphite** | **None** | **Absent** |
| R3 | *Current* | Not selected | `false` (default) | **`checkout.anim.svg`** | **GitHub-safe** | **White** | **Absent** |
| R4 | *Current* | Not selected | `true` | **`checkout.anim.svg`** | **GitHub-safe** | **White** | **Present** |
