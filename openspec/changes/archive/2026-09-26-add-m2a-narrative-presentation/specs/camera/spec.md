# Spec Delta

## MODIFIED Requirements

### Requirement: Camera modes
`mermaidAnimator.camera.mode` SHALL accept `auto` (default), `fit`, `follow`, `cinematic` and `manual`: `fit` frames the whole diagram and never moves during playback; `follow` moves only when the current step's bounds leave the central 80% of the viewport, by the minimum distance that re-centres it with 24 px padding; `cinematic` frames each step tightly (sender, receiver and label, or the participants named by `@focus`, with 48 px padding) and glides between steps within the zoom limits; `manual` never moves on its own; `auto` behaves as `fit` when the whole diagram fits at 0.75× zoom or more, otherwise as `follow`.

#### Scenario: Follow on a long diagram
- **WHEN** the mode is `follow` and the next step lies below the viewport
- **THEN** the camera pans so the step is inside the viewport before its arrow starts drawing

#### Scenario: Cinematic framing
- **WHEN** the mode is `cinematic` and playback moves to a message between adjacent participants
- **THEN** the camera frames that message and its label with 48 px padding before the arrow starts drawing, changing zoom by at most 1.6×
