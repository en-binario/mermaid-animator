# Spec Delta

## Purpose

Lets a presenter walk an audience through a flow with nothing but the diagram, its narration and a clicker.

## ADDED Requirements

### Requirement: Entering and leaving
`P` or *Mermaid Animator: Start Presentation* SHALL maximise the editor area (`workbench.action.maximizeEditorHideSidebar`) and `Esc` or *Stop Presentation* SHALL restore the previous layout; when `mermaidAnimator.presentation.zenMode` is true (default false) Zen Mode SHALL also be entered, and on exit it SHALL be toggled back only if the `inZenMode` context key is still true.

#### Scenario: Zen Mode left early
- **WHEN** Zen Mode is enabled for presentations, the user leaves Zen Mode by other means and then exits the presentation
- **THEN** Zen Mode is not re-entered

### Requirement: Presentation layout
In presentation mode the camera SHALL use Cinematic framing, the inspector and minimap SHALL hide, the toolbar and transport SHALL auto-hide after 2 s without pointer movement, captions SHALL render in the serif caption face at 22–28 px, and a 2 px progress hairline SHALL run along the bottom edge.

#### Scenario: Chrome auto-hides
- **WHEN** the pointer has not moved for 2 seconds during a presentation
- **THEN** the toolbar and transport are hidden until the pointer moves

### Requirement: Title and chapter cards
A title card with the diagram title and a subtitle (`N participants · N chapters · N steps`) SHALL open the presentation and fade after 1.6 s or on the first key press; when `mermaidAnimator.presentation.chapterCards` is true (default), a chapter card SHALL introduce each chapter.

#### Scenario: Title card dismissed by a key
- **WHEN** the title card is showing and the presenter presses `→`
- **THEN** the card closes and the first step plays

### Requirement: Presenter controls
`PageDown`/`PageUp`, `→`/`←` and `Space` SHALL advance and go back; `B` or `.` SHALL toggle a blank (canvas-coloured) screen; holding `Z` SHALL show a laser pointer as a soft brass dot with a short trail following the pointer.

#### Scenario: Clicker
- **WHEN** a presentation clicker sends `PageDown`
- **THEN** the next step plays
