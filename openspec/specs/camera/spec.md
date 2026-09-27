# camera Specification

## Purpose
Keeps the action legible: users can pan and zoom freely, and during playback the camera frames the current step smoothly without disorienting motion.

## Requirements

### Requirement: Direct manipulation
The canvas SHALL support zoom about the pointer with `Ctrl`/`Cmd` + wheel and trackpad pinch, vertical and horizontal wheel panning, drag panning, `+`/`-` zoom about the centre, `0` fit and `F` frame the current step, within a zoom range of 0.1× to 8×.

#### Scenario: Zoom limit
- **WHEN** the user keeps zooming in past 8×
- **THEN** the zoom stays at 8×

### Requirement: Camera modes
`mermaidAnimator.camera.mode` SHALL accept `auto` (default), `fit`, `follow`, `cinematic` and `manual`: `fit` frames the whole diagram and never moves during playback; `follow` moves only when the current step's bounds leave the central 80% of the viewport, by the minimum distance that re-centres it with 24 px padding; `cinematic` frames each step tightly (sender, receiver and label, or the participants named by `@focus`, with 48 px padding) and glides between steps within the zoom limits; `manual` never moves on its own; `auto` behaves as `fit` when the whole diagram fits at 0.75× zoom or more, otherwise as `follow`.

#### Scenario: Follow on a long diagram
- **WHEN** the mode is `follow` and the next step lies below the viewport
- **THEN** the camera pans so the step is inside the viewport before its arrow starts drawing

#### Scenario: Cinematic framing
- **WHEN** the mode is `cinematic` and playback moves to a message between adjacent participants
- **THEN** the camera frames that message and its label with 48 px padding before the arrow starts drawing, changing zoom by at most 1.6×

### Requirement: Smooth, bounded camera motion
Automatic camera transitions SHALL use smooth zoom interpolation with durations between 320 ms and 900 ms divided by the speed, SHALL NOT change zoom by more than 1.6× in one step, and under reduced motion SHALL cut instead of animating.

#### Scenario: Reduced motion
- **WHEN** reduced motion is active and the camera must move
- **THEN** the view changes without an animated pan

### Requirement: Following survives user camera moves
A user pan, scroll, zoom or minimap move while the camera mode is `follow` or `cinematic` SHALL NOT turn following off and SHALL NOT show a *Resume following* chip. The follow toggle (`C` or the toolbar eye button) SHALL be the only control that turns following off or on, and its pressed state SHALL change only when it is used. After a user camera move, the camera SHALL stay where the user left it until playback next moves to a step. At that point it SHALL frame that step using the zoom level the user left: `follow` keeps that zoom unless the step is larger than the view, and `cinematic` starts from it within its usual zoom limits. A user move that interrupts an automatic camera move SHALL cancel it and release any playback wait for the camera.

#### Scenario: User zooms while following
- **WHEN** following is on, playback is paused at step 4, and the user zooms in to 200 % and pans away
- **THEN** the follow button stays pressed, no chip appears, and the camera stays where the user left it

#### Scenario: Next step after a user zoom
- **WHEN** following is on, the user has zoomed to 200 % and panned away from step 4, and then presses `→`
- **THEN** the camera moves to frame step 5 at 200 % before its arrow draws

#### Scenario: Turning following off
- **WHEN** following is on and the user presses `C`
- **THEN** following turns off, the follow button is no longer pressed, and the camera no longer moves on its own
