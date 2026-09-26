# exploration Specification

## Purpose
Helps users make sense of large diagrams by focusing on the participants they care about and finding any message, note or caption quickly.

## Requirements

### Requirement: Participant focus
Clicking a participant header SHALL focus it: messages, activations and notes not involving it SHALL dim to 18% opacity with tertiary-ink labels (dotted strokes in high-contrast palettes) and its lifeline SHALL be emphasised; `Ctrl`/`Cmd`+click SHALL add participants so that only interactions among the selected participants stay prominent; `Esc` or clicking empty canvas SHALL clear focus.

#### Scenario: Focus one participant
- **WHEN** the user clicks the header of `Payments`
- **THEN** every message that neither starts nor ends at `Payments` is dimmed

#### Scenario: Multi-focus
- **WHEN** `Payments` is focused and the user `Ctrl`+clicks `Ledger`
- **THEN** only messages between `Payments` and `Ledger` remain prominent

### Requirement: Focused playback
When *Play only focused steps* is enabled in the inspector, playback, stepping and the step counter SHALL skip steps that do not involve the focused participants, and the scrubber SHALL show skipped ranges hatched; step identities SHALL be unaffected.

#### Scenario: Stepping skips unrelated steps
- **WHEN** focused playback is on with `Payments` focused and the user presses `→`
- **THEN** playback advances to the next step involving `Payments`

### Requirement: Search
Pressing `/` (or `Ctrl`/`Cmd`+`F` in the panel) SHALL open a search field that matches participants, message labels, notes and captions case-insensitively, lists matches with their step numbers, highlights matches on the canvas and scrubber, and seeks to a match on `Enter`.

#### Scenario: Find a message
- **WHEN** the user searches for `token` in a diagram with the message `A-->>G: token`
- **THEN** the result list shows that message with its step number and `Enter` seeks to it
