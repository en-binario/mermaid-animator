# Spec Delta

## Purpose

Lets users move between the order-centred sequence view and the structure-centred topology view — without losing their place and with a transition that makes the correspondence between the two obvious.

## ADDED Requirements

### Requirement: Choosing a view
The toolbar SHALL offer a segmented control *Sequence | Topology | Split*; `T` SHALL toggle Sequence ↔ Topology and `S` Split; the commands *Show Sequence View*, *Show Topology View*, *Show Split View* and *Toggle Sequence / Topology* SHALL do the same for the active panel; `mermaidAnimator.view.default` (`sequence` default, `topology`, `split`) and `@animator view=` SHALL choose the initial view. Generic (non-sequence) diagrams SHALL offer only their own view.

#### Scenario: Keyboard toggle
- **WHEN** the panel shows the sequence view and the user presses `T`
- **THEN** the panel shows the topology view

#### Scenario: Default from annotation
- **WHEN** a diagram contains `%% @animator view=topology`
- **THEN** its panel opens in the topology view

### Requirement: Continuous morph
Switching between Sequence and Topology SHALL animate for 640 ms at 1× by element identity — lifelines retract and activations and notes fade (0–160 ms), participant headers travel and reshape into nodes while arrows follow their endpoints (80–480 ms), arrows sharing a pair merge into one edge with its badge counting up (320–560 ms), and edges settle into their routes with labels fading in (480–640 ms) — and the reverse transition SHALL mirror it; under reduced motion the switch SHALL be a 150 ms cross-fade.

#### Scenario: Mid-morph frame
- **WHEN** a switch to topology is 300 ms in
- **THEN** participant headers are between their sequence and topology positions and lifelines are no longer visible

### Requirement: State preserved across views
Switching views SHALL keep the current step and the focus; if playback was playing it SHALL pause for the morph and resume afterwards.

#### Scenario: Switching while playing
- **WHEN** autoplay is running and the user presses `T`
- **THEN** playback pauses during the morph and resumes from the same step when it ends
