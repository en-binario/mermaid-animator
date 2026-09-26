# animated-export Specification

## Purpose
Takes the animation out of the editor as GIF or video, frame-exact and configurable, for release notes, issues, chat and slides.

## Requirements

### Requirement: Export sheet
*Export…* (toolbar, `E`, palette command, CodeLens) SHALL open an export sheet in the panel with: format (SVG, PNG, GIF, WebM, MP4, Animated SVG, HTML player, copy image), range (all steps, current chapter, A–B range, current step), view, camera (fit, cinematic, current), size (presets 1280×720, 1920×1080, 1080×1080, 1080×1920, fit to content, or custom), scale (1×, 2×, 3×), frame rate (12, 15, 24, 30, 60), speed (0.5×–2×), theme (current, Ivory, Graphite), background (theme, transparent where the format allows, custom colour), burn-in of captions, title card, step counter and transport, loop (forever, once, n times), end hold (0–5 s) and quality; the sheet SHALL preview the selected range and show the estimated duration and file size, and options irrelevant to the chosen format SHALL be disabled. `mermaidAnimator.export.defaultFormat`, `export.fps`, `export.scale`, `export.background` and `export.includeCaptions` SHALL set the initial choices.

#### Scenario: Estimates update
- **WHEN** the user changes the frame rate from 15 to 30 for a GIF
- **THEN** the estimated size increases and the duration stays the same

#### Scenario: Irrelevant options disabled
- **WHEN** the format is SVG
- **THEN** frame rate, loop and end hold are disabled

### Requirement: Frame-exact rendering
Animated raster and video exports SHALL render frame `n` from the scene at time `start + n / fps × speed` of the selected range, independently of machine speed and of the panel's live playback, so that an export of duration `d` at `fps` contains exactly `ceil(d × fps)` frames plus the end hold.

#### Scenario: Frame count
- **WHEN** a 10-second range is exported at 30 fps with a 1.5 s end hold
- **THEN** the video contains 345 frames

#### Scenario: Frame matches the scene
- **WHEN** frame 90 of a 30 fps export is compared with the scene rendered at 3.0 s
- **THEN** the two images are identical

### Requirement: GIF export
GIF exports SHALL use a palette computed for the export with optional dithering, honour the loop setting and the transparent background option, and a 20-second range at 15 fps and 1280 px width SHALL encode in under 20 s on reference hardware.

#### Scenario: Loop once
- **WHEN** a GIF is exported with loop set to *once*
- **THEN** the GIF plays one time and stops on its last frame

### Requirement: Video export
WebM exports SHALL use VP9 (VP8 when VP9 is unavailable); MP4 SHALL be offered only when the host's encoder reports H.264 support and SHALL otherwise be disabled with an explanation suggesting WebM; a 30-second range at 30 fps and 1920×1080 SHALL encode as WebM in under 45 s on reference hardware.

#### Scenario: No H.264
- **WHEN** the host's encoder does not support H.264
- **THEN** the MP4 option is disabled and explains that WebM is available

### Requirement: Progress and cancellation
Animated exports SHALL show progress in the sheet and in a VS Code progress notification with *Cancel*; cancelling SHALL stop encoding within one second and write nothing.

#### Scenario: Cancel
- **WHEN** the user cancels an export at 40%
- **THEN** encoding stops and no file is written

### Requirement: Generic diagrams
Animated exports SHALL also be available for diagrams shown by the generic engine, rendering their frames on the main thread with the same frame-exact rule.

#### Scenario: Flowchart GIF
- **WHEN** the user exports a flowchart as GIF
- **THEN** the GIF shows the ordered reveal of its nodes and edges
