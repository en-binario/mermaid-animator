# Spec Delta

## MODIFIED Requirements

### Requirement: Automatic pausing
Playback SHALL pause when the panel becomes hidden and resume when it becomes visible if it was playing; it SHALL pause while the pointer is over the canvas when `mermaidAnimator.playback.pauseOnHover` is true (default). A user camera move during playback SHALL pause playback until the user resumes it. A user camera move is a pan, scroll, zoom, zoom preset or minimap move, but not *Fit* or *Frame step*. This pause SHALL NOT end when the pointer leaves the canvas. When the user resumes with *Play*, *Next* or *Previous*, a following camera SHALL first return to the current or target step, keeping the user's zoom level (see camera *Following survives user camera moves*), and then playback SHALL continue.

#### Scenario: Hidden panel
- **WHEN** the user switches to another editor tab during autoplay
- **THEN** playback pauses, and resumes when the panel is shown again

#### Scenario: Scroll during playback
- **WHEN** autoplay is running with following on and the user scrolls the canvas
- **THEN** playback pauses, the play button shows *Play*, and following stays on

#### Scenario: Resume after zooming
- **WHEN** playback was paused by a user zoom to 150 % during step 6 and the user presses *Play*
- **THEN** the camera returns to step 6 at 150 % and playback continues from where it paused

#### Scenario: Pointer leaves after a camera pause
- **WHEN** playback was paused by a user pan and the pointer then leaves the canvas
- **THEN** playback stays paused
