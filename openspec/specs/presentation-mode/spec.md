# presentation-mode Specification

## Purpose
Lets a presenter walk an audience through a flow with nothing but the diagram, its narration and a clicker.

## Requirements

### Requirement: Entering and leaving
`P` or *Mermaid Animator: Start Presentation* SHALL maximise the editor area (`workbench.action.maximizeEditorHideSidebar`) and `Esc` or *Stop Presentation* SHALL restore the previous layout; when `mermaidAnimator.presentation.zenMode` is true (default false) Zen Mode SHALL also be entered, and on exit it SHALL be toggled back only if the `inZenMode` context key is still true.

#### Scenario: Zen Mode left early
- **WHEN** Zen Mode is enabled for presentations, the user leaves Zen Mode by other means and then exits the presentation
- **THEN** Zen Mode is not re-entered

### Requirement: Presentation layout
In presentation mode the camera SHALL frame steps as camera mode `follow` does, at the presentation session zoom (`mermaidAnimator.camera.presentationZoom`, default `150`; see camera *Session play zoom*), honouring `@focus`, instead of Cinematic framing, whatever `mermaidAnimator.camera.mode` is. Entering and leaving presentation mode SHALL frame the current step at the session zoom of the mode being entered (the fitted overview at step 0), unless following is off. The inspector and minimap SHALL hide, the toolbar and transport SHALL auto-hide after 2 s without pointer movement, captions SHALL render in the serif caption face at 22–28 px, and a 2 px progress hairline SHALL run along the bottom edge.

#### Scenario: Chrome auto-hides
- **WHEN** the pointer has not moved for 2 seconds during a presentation
- **THEN** the toolbar and transport are hidden until the pointer moves

#### Scenario: Presentation zoom
- **GIVEN** a diagram was just opened with default settings and rests at step 0
- **WHEN** the user presses `P` and then `→` after the title card closes
- **THEN** the camera frames step 1 at 150 %

#### Scenario: Presentation keeps its own zoom
- **GIVEN** presentation mode at step 3, where the presenter zoomed to 200 %
- **WHEN** the presenter presses `Esc` and then `→`
- **THEN** the camera frames step 4 at 100 %
- **AND WHEN** the user presses `P` and then `→`
- **THEN** the camera frames step 5 at 200 %

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
