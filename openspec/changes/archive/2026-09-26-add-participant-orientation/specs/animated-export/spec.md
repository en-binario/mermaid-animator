# Spec Delta

## ADDED Requirements

### Requirement: Participant-name burn-in
The export sheet SHALL offer a *Participant names* burn-in for GIF, WebM and MP4 exports of the sequence view, enabled by default and following `mermaidAnimator.display.participantNames` (disabled by default when that setting is `off`). When enabled, every frame in which the export camera leaves participant headers above the frame SHALL show the participant rail with the same visibility, placement and shortening rules as in the panel, scaled with the export's pixel scale and drawn from the frame's camera so that frame `n` remains a function of its time alone. Off-screen markers and arrow-end tags SHALL NOT be burnt in. With the Fit camera, where headers stay in frame, the burn-in SHALL have no visible effect.

#### Scenario: Cinematic GIF
- **WHEN** a sequence diagram is exported as a GIF with the Cinematic camera and *Participant names* enabled
- **THEN** frames framing messages below the headers show the rail naming the visible lifelines

#### Scenario: Burn-in disabled
- **WHEN** the same export is made with *Participant names* disabled
- **THEN** no frame shows the rail

#### Scenario: Fit camera
- **WHEN** a sequence diagram is exported with the Fit camera
- **THEN** the frames are identical whether *Participant names* is enabled or not
