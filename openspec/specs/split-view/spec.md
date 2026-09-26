# split-view Specification

## Purpose
Shows the order and the structure of a flow at the same time, so each step can be read in both representations at once.

## Requirements

### Requirement: Side-by-side views
The split view SHALL show the sequence and topology views side by side when the panel is at least 1100 px wide and stacked otherwise, driven by one shared timeline and transport, each with its own camera and zoom.

#### Scenario: Narrow panel
- **WHEN** the split view is shown in a 900 px wide panel
- **THEN** the sequence view is above the topology view

#### Scenario: Shared playback
- **WHEN** the user presses `→` in the split view
- **THEN** both views animate the same next step at the same time

### Requirement: Cross-highlighting
Hovering a participant, message or edge in either view SHALL highlight its counterpart in the other (a message ↔ its aggregated edge; a header ↔ its node).

#### Scenario: Hover a node
- **WHEN** the user hovers the `Auth` node in the topology view
- **THEN** the `Auth` header and lifeline are highlighted in the sequence view
