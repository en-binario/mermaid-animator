# animator-accessibility Specification

## Purpose
Makes the animator usable without sight and without a pointer: every control is labelled and keyboard operable, and each step is announced to assistive technology.

## Requirements

### Requirement: Step announcements
A polite live region SHALL announce each step reached, in the form *"Step 7 of 24. Gateway to Auth: verify token. In loop Retry."*, at most once per step and not at speeds above 2×.

#### Scenario: Stepping announces
- **WHEN** the user presses `→`
- **THEN** the live region announces the new step's number, endpoints, label and fragment context

### Requirement: Labelled, keyboard-operable controls
Every control SHALL have an accessible name, be reachable with `Tab` in the order toolbar → canvas → transport, show a visible focus indicator using the editor focus border colour, and have a target size of at least 24 × 24 CSS pixels.

#### Scenario: Keyboard-only playback
- **WHEN** a user operates the panel with the keyboard only
- **THEN** they can reach and operate every transport control and see which one has focus

### Requirement: Diagram text alternative
The diagram drawing SHALL expose an image role with an accessible label summarising the diagram (title or type, participant count, step count), using `accTitle`/`accDescr` when present.

#### Scenario: Accessibility title
- **WHEN** the diagram declares `accTitle: Login flow`
- **THEN** the drawing's accessible label begins with `Login flow`
