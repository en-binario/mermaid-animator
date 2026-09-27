# minimap Specification

## Purpose
Keeps users oriented in diagrams larger than the panel by showing the whole drawing, where the viewport is, and where playback is.

## Requirements

### Requirement: Minimap display
The canvas SHALL show a minimap of at most 160 × 110 px at its bottom-right corner with a simplified drawing (lifelines and message lines for sequence; nodes and edges for topology, no text), the viewport rectangle in the accent colour and the current step as a brass dot; `mermaidAnimator.display.showMinimap` SHALL be `auto` (default: shown only while the content exceeds the viewport), `always` or `never`, and the minimap SHALL hide during presentations.

#### Scenario: Auto hides when everything fits
- **WHEN** `showMinimap` is `auto` and the whole diagram is visible
- **THEN** no minimap is shown

### Requirement: Minimap navigation
Dragging the viewport rectangle SHALL pan the camera and clicking elsewhere on the minimap SHALL centre the camera there; either action SHALL count as a user camera move (following stays on and running playback pauses; see camera *Following survives user camera moves*).

#### Scenario: Click to centre
- **WHEN** the user clicks the lower half of the minimap of a long diagram
- **THEN** the camera centres on that part of the diagram, and following stays on if the camera was following
