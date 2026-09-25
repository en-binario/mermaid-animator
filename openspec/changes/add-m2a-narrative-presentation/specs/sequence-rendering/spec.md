# Spec Delta

## ADDED Requirements

### Requirement: Concurrent messages
When a step animates several messages (concurrent `par` lanes or `@with-next`), each message SHALL draw simultaneously along its own path with its own travelling indicator.

#### Scenario: Two pulses
- **WHEN** a concurrent `par` step with two lanes is mid-transition
- **THEN** two arrows are partially drawn and two pulses are visible

### Requirement: Loop iteration counter
While a loop's steps play, its label tab SHALL show the iteration as `n / N` in tabular figures, and messages repeated across iterations SHALL be drawn once, redrawing on each iteration.

#### Scenario: Second iteration
- **WHEN** playback is in iteration 2 of a three-iteration loop
- **THEN** the loop tab reads `2 / 3` and the loop's first message draws again

### Requirement: Focus dimming
Elements outside the current focus (see `exploration`) SHALL render at 18% opacity with tertiary-ink labels, and with dotted strokes instead of reduced opacity in high-contrast palettes.

#### Scenario: High contrast
- **WHEN** a participant is focused in a high-contrast theme
- **THEN** unrelated messages are drawn with dotted strokes rather than faded
