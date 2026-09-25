# Spec Delta

## Purpose

Produces an animation that plays wherever an SVG image is displayed — notably GitHub READMEs — without scripts, video players or external files.

## ADDED Requirements

### Requirement: Script-free animated SVG
*Animated SVG* SHALL produce one self-contained SVG in which the selected range plays through CSS `@keyframes` (opacity, transform and stroke drawing), with no scripts, no external references, embedded fonts, `textLength` safety on text, and looping per the loop option.

#### Scenario: Plays as an image
- **WHEN** the exported SVG is referenced with `![flow](flow.anim.svg)` in a GitHub README
- **THEN** the animation plays in the rendered README

#### Scenario: No script
- **WHEN** the exported file is inspected
- **THEN** it contains no `<script>` element, no event-handler attribute and no external URL

### Requirement: GitHub-safe theming
By default the animated SVG SHALL have a transparent background and a palette whose strokes and text keep at least 4.5:1 contrast on both `#ffffff` and `#0d1117`; *Export for GitHub (light + dark pair)* SHALL write `<name>.light.anim.svg` and `<name>.dark.anim.svg`; when `mermaidAnimator.export.svgAdaptiveTheme` is true (default false) the single file SHALL additionally include a `prefers-color-scheme: dark` palette.

#### Scenario: Pair written
- **WHEN** the user exports `checkout` with *Export for GitHub (light + dark pair)*
- **THEN** `checkout.light.anim.svg` and `checkout.dark.anim.svg` are written

### Requirement: Reduced motion and size
The animated SVG SHALL show the final frame statically under `prefers-reduced-motion: reduce`, and the sheet SHALL warn before writing a file larger than 1 MB.

#### Scenario: Large diagram
- **WHEN** the estimated animated SVG exceeds 1 MB
- **THEN** the sheet shows a warning and suggests a shorter range or GIF
