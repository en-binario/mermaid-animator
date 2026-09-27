# initial-overview Specification

## Purpose
Gives viewers a complete picture of the diagram at step 0 before the step-by-step reveal starts, then clears it so the reveal proceeds as before.

## Requirements

### Requirement: Overview at step 0
When `mermaidAnimator.playback.initialOverview` is true (default), or `@animator overview=true` is set, the panel SHALL show the complete diagram at step 0 (the position before the first step). The annotation SHALL take precedence over the setting. The complete diagram means:
- for sequence diagrams, every message, note, activation, fragment and participant (including participants created or destroyed during playback), drawn as they rest after the last step;
- for the topology view, every node and every edge with its full message count;
- for diagrams rendered through Mermaid, every revealed group.

The overview SHALL NOT show current-step emphasis: no travelling indicator, receiver glow, current-message highlight, arrow-end name tags or caption. `display.futureSteps` and `display.pastSteps` SHALL NOT dim overview content. Unplayed branches SHALL keep their unplayed styling, and focus dimming SHALL still apply. When the setting is false and no annotation enables it, step 0 SHALL render as it did before this change.

#### Scenario: Sequence diagram opens
- **WHEN** a sequence diagram with 12 messages opens with default settings
- **THEN** step 0 shows all 12 messages, their labels, notes and fragments, and the step counter reads 0 of the step total

#### Scenario: Flowchart opens
- **WHEN** a flowchart rendered through Mermaid opens with default settings
- **THEN** step 0 shows every node and edge of the flowchart

#### Scenario: Overview disabled by annotation
- **WHEN** the diagram contains `%% @animator overview=false`
- **THEN** step 0 shows only the pre-reveal state (participant headers for a sequence diagram, nothing for a Mermaid-rendered diagram)

#### Scenario: Ghosted future does not dim the overview
- **WHEN** `display.futureSteps` is `ghosted` and playback is at step 0
- **THEN** every message is drawn at full opacity

### Requirement: Clear before step 1
Moving from the overview to step 1 SHALL first clear the drawing to its pre-reveal state, fading overview-only content out over 240 ms, and only then start step 1's transition. The clear SHALL be part of step 1's transition, so *Next* from step 0 SHALL clear immediately. When playback plays through step 0 (autoplay, loop restart, animated export), the overview SHALL remain for the dwell time (`playback.dwellMs`, 900 ms by default) before clearing. Moving back from step 1 to step 0 SHALL restore the overview, animated or cut according to `playback.reverse`. Under reduced motion, or with motion profile `none`, the clear SHALL be an immediate cut.

#### Scenario: Next from step 0
- **WHEN** the panel is at step 0 showing the overview and the user presses `→`
- **THEN** the overview-only content fades out, then step 1 draws, and playback rests at step 1

#### Scenario: Back to step 0
- **WHEN** playback rests at step 1 and the user presses `←`
- **THEN** the complete diagram is shown again at step 0

#### Scenario: Autoplay from the start
- **WHEN** autoplay starts at step 0
- **THEN** the overview stays on screen for the dwell time before clearing and drawing step 1

### Requirement: Overview framing
At step 0 with the overview shown, camera modes `follow` and `cinematic` (including `auto` resolving to `follow`) SHALL fit the whole diagram in the view. When playback leaves step 0, `follow` SHALL move the camera to frame step 1. It SHALL use the zoom level the user set after the overview was framed, if any; otherwise the diagram width fitted to the viewport, never enlarged past 100 %. `cinematic` SHALL frame step 1 as it frames any step. `fit` and `manual` SHALL behave as they do for any other step.

#### Scenario: Long diagram in follow mode
- **WHEN** a sequence diagram too tall to fit at 75 % opens in `auto` camera mode
- **THEN** step 0 shows the whole diagram fitted to the view, and at step 1 the camera zooms in to frame the first message

#### Scenario: User zoom kept when leaving the overview
- **WHEN** the camera is in `follow` mode at step 0 and the user zooms to 150 % before pressing `→`
- **THEN** the camera frames step 1 at 150 %

### Requirement: Overview in exports and players
Static exports taken at step 0 SHALL show the overview. Animated exports (GIF, video, animated SVG) and the HTML player SHALL start with the overview, hold it for the dwell time, and include the clear before step 1, whenever the overview is enabled for the diagram.

#### Scenario: GIF export
- **WHEN** the user exports a GIF of a diagram with the overview enabled
- **THEN** the first frames show the complete diagram, followed by the clear and the step-by-step reveal

### Requirement: Overview announcement
When playback arrives at step 0 with the overview shown, the screen-reader live region SHALL announce the overview and the total number of steps.

#### Scenario: Screen reader at step 0
- **WHEN** the user presses `Home` in a 12-step diagram
- **THEN** the live region announces the overview and that the diagram has 12 steps
