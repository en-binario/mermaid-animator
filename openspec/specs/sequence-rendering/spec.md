# sequence-rendering Specification

## Purpose
Draws sequence diagrams in the formal Ink & Ivory shape language and animates each step so that order, causality and focus are evident, with rendering that is a pure function of playback time.

## Requirements

### Requirement: Deterministic layout
The sequence layout SHALL place participants in declaration then first-appearance order, size columns from measured label widths, and give messages, notes, fragment boundaries and branch separators their own rows; laying out the same model twice SHALL yield identical coordinates.

#### Scenario: Wide label widens the gap
- **WHEN** a message between adjacent participants has a label wider than the default gap
- **THEN** the gap between their lifelines grows so the label fits with padding

### Requirement: Shape language
Participants, actors and typed participants, lifelines, every arrow form, activations, notes, fragments with small-caps keyword tabs, boxes, autonumber badges, create/destroy markers and central-connection circles SHALL be drawn per §9.6.1 of the product specification using only theme tokens.

#### Scenario: Return message style
- **WHEN** a `-->>` message is drawn
- **THEN** it uses a dashed stroke in the secondary ink colour with a filled arrowhead

### Requirement: Pure function of time
The visual state of the diagram SHALL depend only on the playback time and the display configuration; rendering the same time twice SHALL produce the same drawing regardless of the path taken to reach it.

#### Scenario: Seek versus play
- **WHEN** playback reaches 2.4 s by playing from the start, and separately by seeking directly to 2.4 s
- **THEN** both drawings are identical

### Requirement: Message choreography
In the Formal profile a message step SHALL: emphasise the sender lifeline; draw the arrow from sender to receiver over the transition while a pulse rides its tip; fade in and raise the label by 4 px during the last 40% of the draw; reveal the arrowhead at arrival; then grow the receiver's activation (or shrink a deactivation) and emphasise the receiver lifeline; notes and created participants fade in; the enclosing fragments illuminate while their steps play.

#### Scenario: Mid-transition frame
- **WHEN** playback is at 50% of a message's transition
- **THEN** the arrow is partially drawn along the travel easing curve (about 73% of its length), the pulse is at its tip and the label is not yet visible

### Requirement: Step state display
Unplayed, current and played steps SHALL render per §9.7 of the product specification, with `mermaidAnimator.display.futureSteps` (`hidden` default, `ghosted`, `visible`) and `mermaidAnimator.display.pastSteps` (`full` default, `muted`, `trail`) controlling unplayed and played steps, and `@emphasis` steps drawn in brass.

#### Scenario: Ghosted future
- **WHEN** `futureSteps` is `ghosted`
- **THEN** unplayed messages are visible at low opacity with tertiary-ink labels

### Requirement: Motion profiles and reduced motion
`mermaidAnimator.motion.profile` SHALL select `formal` (default), `expressive`, `minimal` or `none`; when reduced motion is active and `mermaidAnimator.motion.respectReducedMotion` is true, the effective profile SHALL be `minimal` with no travelling pulse.

#### Scenario: Reduced motion
- **WHEN** reduced motion is active
- **THEN** messages appear by a short fade without drawing or pulses

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
