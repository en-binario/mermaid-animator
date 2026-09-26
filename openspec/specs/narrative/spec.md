# narrative Specification

## Purpose
Tells the story of a diagram in words: captions narrate each step and chapters divide the flow into named phases that can be navigated directly.

## Requirements

### Requirement: Caption strip
When the current step has a caption (from `@caption`), the panel SHALL show it in a caption strip below the canvas, centred, at most 68 characters per line, supporting only `**bold**`, `*italic*` and `` `code` `` inline markup; the strip SHALL be hidden when no step of the diagram has a caption or when `mermaidAnimator.display.showCaptions` is false, and caption changes SHALL cross-fade.

#### Scenario: Caption appears with its step
- **WHEN** playback reaches a step annotated `%% @caption "The gateway asks Auth to verify the token."`
- **THEN** the caption strip shows that sentence

#### Scenario: Markup is not interpreted beyond the whitelist
- **WHEN** a caption contains `<b>x</b>`
- **THEN** the text `<b>x</b>` is shown literally

### Requirement: Chapters
`@chapter "Title"` SHALL start a chapter at the next step; chapters SHALL appear as ticks on the scrubber with their titles in tooltips and as a list in the inspector, and choosing a chapter SHALL seek to its first step.

#### Scenario: Chapter ticks
- **WHEN** a diagram has chapters "Credentials" at step 1 and "Session" at step 7
- **THEN** the scrubber shows two chapter ticks and hovering the second shows "Session"

### Requirement: Chapter navigation
`Shift+→` and `Shift+←` SHALL seek to the first step of the next and previous chapter, and the commands *Next Chapter* / *Previous Chapter* SHALL do the same for the active panel.

#### Scenario: Next chapter
- **WHEN** playback is in chapter "Credentials" and the user presses `Shift+→`
- **THEN** playback rests at the first step of "Session"
