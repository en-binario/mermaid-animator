# Spec Delta

## MODIFIED Requirements

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
