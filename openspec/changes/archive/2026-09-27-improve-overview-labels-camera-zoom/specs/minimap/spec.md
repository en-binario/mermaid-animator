# Spec Delta

## MODIFIED Requirements

### Requirement: Minimap navigation
Dragging the viewport rectangle SHALL pan the camera and clicking elsewhere on the minimap SHALL centre the camera there; either action SHALL count as a user camera move (following stays on and running playback pauses; see camera *Following survives user camera moves*).

#### Scenario: Click to centre
- **WHEN** the user clicks the lower half of the minimap of a long diagram
- **THEN** the camera centres on that part of the diagram, and following stays on if the camera was following
