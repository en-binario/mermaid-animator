## MODIFIED Requirements

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
