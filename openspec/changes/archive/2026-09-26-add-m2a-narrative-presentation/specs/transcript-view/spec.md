# Spec Delta

## Purpose

Provides a text-first rendition of the whole diagram that screen-reader users can navigate and that sighted users can scan and search like an outline.

## ADDED Requirements

### Requirement: Transcript view
`R` or *Show Transcript View* SHALL replace the canvas with an ordered list of steps in the form `07. Gateway → Auth: verify(token) — in loop "retry", iteration 2 of 3`, grouped under chapter headings, with captions beneath their steps, using semantic lists and headings; `R` again SHALL return to the diagram at the same step.

#### Scenario: Toggle
- **WHEN** the user presses `R` on step 7 and then `R` again
- **THEN** the transcript is shown with step 7 marked current, and afterwards the diagram returns resting on step 7

### Requirement: Transcript synchronisation
The current step SHALL be marked (`aria-current="step"`) and kept in view as playback moves, and activating an entry SHALL seek to that step.

#### Scenario: Seek from the transcript
- **WHEN** the user activates entry 12 with `Enter`
- **THEN** playback rests on step 12 and entry 12 is marked current
