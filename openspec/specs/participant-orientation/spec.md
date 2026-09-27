# participant-orientation Specification

## Purpose
Keeps sequence-diagram participants identifiable when the camera has moved their headers out of view, both while exploring a paused diagram and during playback, so every visible lifeline can be told apart.

## Requirements

### Requirement: Participant rail
When `mermaidAnimator.display.participantNames` is `auto` (default), the sequence view SHALL show a band pinned to the top edge of the view that names every participant whose header lies entirely above the visible area while its lifeline crosses the top edge of the view and lies within the view horizontally. Each name SHALL be centred on its lifeline's on-screen position and follow it as the camera pans, zooms or glides; the band and its text SHALL keep a constant on-screen size at every zoom level, with a translucent theme-surface background and a hairline lower border. The band SHALL be absent whenever no participant qualifies, and SHALL appear and disappear with a fade of at most 150 ms (an immediate change under reduced motion). A participant introduced with `create` SHALL be named only once its header row is above the view, and a destroyed participant SHALL NOT be named once its lifeline ends above the view. Names SHALL shorten with an ellipsis so that neighbouring names never overlap, and a name that cannot fit at least three characters SHALL be replaced by a short tick whose full name appears on hover. With `participantNames` set to `off`, neither the rail nor the off-screen markers SHALL be shown.

#### Scenario: Scrolled below the headers
- **WHEN** the user pans a long sequence diagram so the participant headers are above the view
- **THEN** a band at the top of the view names each visible lifeline, centred on it

#### Scenario: Headers visible
- **WHEN** the participant headers are inside the view
- **THEN** no band is shown

#### Scenario: Constant size at high zoom
- **WHEN** the user zooms in to 8× with the headers out of view
- **THEN** the names in the band have the same on-screen size as at 1× zoom

#### Scenario: Created participant not yet reached
- **WHEN** a participant created at row 20 has its header below the top of the view
- **THEN** the band does not name that participant

#### Scenario: Destroyed participant
- **WHEN** a participant's lifeline was destroyed at a row that is above the view
- **THEN** the band does not name that participant

#### Scenario: Setting off
- **WHEN** `mermaidAnimator.display.participantNames` is `off` and the headers are out of view
- **THEN** no band and no off-screen markers are shown

### Requirement: Rail styling and interaction
Names in the participant rail SHALL follow the diagram's state: participants involved in the current step SHALL use the accent colour as their lifelines do, and participants outside the current focus SHALL use the dimmed focus styling. Clicking a name SHALL focus that participant exactly as clicking its header does (`Ctrl`/`Cmd`+click adds to the focus); the band outside the names SHALL NOT capture the pointer, so panning by dragging works across it. The rail SHALL be hidden from assistive technology, which already receives participant names through the step announcements, inspector and transcript.

#### Scenario: Current step highlighted
- **WHEN** the current step is a message from Gateway to Auth and both are named in the band
- **THEN** both names are shown in the accent colour

#### Scenario: Focus from the rail
- **WHEN** the user clicks *Auth* in the band
- **THEN** everything not involving Auth dims, as after clicking Auth's header

#### Scenario: Dragging across the band
- **WHEN** the user starts a drag on the band between two names
- **THEN** the canvas pans

### Requirement: Off-screen participant markers
When `mermaidAnimator.display.participantNames` is `auto`, each participant involved in the current step whose lifeline lies left or right of the view SHALL be shown as a marker on that edge of the view, with a chevron pointing towards it and its name, vertically near the current step's position when that is in view. Activating a marker (click, or `Enter`/`Space` when focused) SHALL pan the camera horizontally by the minimum distance that brings the lifeline into view with 24 px padding, and SHALL count as a user camera move (following stays on and running playback pauses; see camera *Following survives user camera moves*). Markers SHALL be keyboard focusable and labelled with the participant's name. Participants not involved in the current step SHALL NOT get markers.

#### Scenario: Receiver off to the right
- **WHEN** the current step sends a message to Database and Database's lifeline is right of the view
- **THEN** a marker naming Database with a chevron appears at the right edge

#### Scenario: Jump to the participant
- **WHEN** the user clicks that marker
- **THEN** the camera pans so Database's lifeline is in view, and following stays on if the camera was following

#### Scenario: Uninvolved participant
- **WHEN** a participant off to the left takes no part in the current step
- **THEN** no marker is shown for it

### Requirement: Arrow-end name tags
`mermaidAnimator.display.arrowEndNames` SHALL accept `off`, `auto` (default) and `always`. When it is not `off`, every message drawn in the current step SHALL show a small tag with the sender's name at the arrow's start and one with the receiver's name at its end (a single tag for a self-message), in constant on-screen size, placed beside the endpoints so they do not cover the message label or arrowhead. With `auto`, a tag SHALL be shown only for a participant whose header is not visible in the view. Tags SHALL appear with the arrow as it draws, remain while the step is current, and disappear when another step becomes current; played and unplayed steps SHALL NOT show tags.

#### Scenario: Default setting
- **WHEN** the user has not configured `arrowEndNames` and the camera frames the current message with the headers out of view
- **THEN** both endpoint tags are shown

#### Scenario: Always
- **WHEN** `arrowEndNames` is `always` and the current step is Gateway → Auth
- **THEN** the arrow shows a *Gateway* tag at its start and an *Auth* tag at its end

#### Scenario: Auto with visible headers
- **WHEN** `arrowEndNames` is `auto` and both participants' headers are in view
- **THEN** no tags are shown

#### Scenario: Auto when zoomed in
- **WHEN** `arrowEndNames` is `auto` and the camera frames the current message with the headers out of view
- **THEN** both endpoint tags are shown

#### Scenario: Off
- **WHEN** `arrowEndNames` is `off`
- **THEN** no tags are shown for any step

#### Scenario: Next step
- **WHEN** playback moves to the next step
- **THEN** the previous step's tags disappear and the new step's tags appear with its arrow

### Requirement: Orientation across views and modes
The participant rail, off-screen markers and arrow-end tags SHALL apply to the sequence view only: in split view they SHALL appear in the sequence side alone, they SHALL NOT appear in the topology view or for generic Mermaid diagrams, and they SHALL be hidden during a Sequence ↔ Topology morph. They SHALL remain available in presentation mode (they are diagram content, not chrome that hides after inactivity). Under reduced motion they SHALL appear, move with the camera and disappear without animated transitions.

#### Scenario: Split view
- **WHEN** the split view is shown with the sequence side zoomed in below the headers
- **THEN** the band appears across the sequence side only

#### Scenario: Topology view
- **WHEN** the topology view is shown
- **THEN** no band, markers or tags are shown

#### Scenario: Presenting
- **WHEN** a presentation frames a message with the headers out of view and the chrome has hidden
- **THEN** the band remains visible
