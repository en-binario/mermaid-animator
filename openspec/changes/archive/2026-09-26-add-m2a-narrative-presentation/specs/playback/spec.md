# Spec Delta

## ADDED Requirements

### Requirement: A–B loop
`I` and `O` SHALL set the start and end of a loop range at the current rest point; while a range is set, autoplay SHALL repeat it, the scrubber SHALL show it as a tinted band, and `Shift+I` (or `Shift+O`) SHALL clear it.

#### Scenario: Rehearse a range
- **WHEN** the user sets `I` at step 3 and `O` at step 6 and presses `Space`
- **THEN** playback plays steps 4 to 6 and returns to step 3 repeatedly until paused or the range is cleared
