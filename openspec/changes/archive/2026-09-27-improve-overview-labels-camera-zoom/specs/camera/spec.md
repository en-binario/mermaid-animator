# Spec Delta

## ADDED Requirements

### Requirement: Following survives user camera moves
A user pan, scroll, zoom or minimap move while the camera mode is `follow` or `cinematic` SHALL NOT turn following off and SHALL NOT show a *Resume following* chip. The follow toggle (`C` or the toolbar eye button) SHALL be the only control that turns following off or on, and its pressed state SHALL change only when it is used. After a user camera move, the camera SHALL stay where the user left it until playback next moves to a step. At that point it SHALL frame that step using the zoom level the user left: `follow` keeps that zoom unless the step is larger than the view, and `cinematic` starts from it within its usual zoom limits. A user move that interrupts an automatic camera move SHALL cancel it and release any playback wait for the camera.

#### Scenario: User zooms while following
- **WHEN** following is on, playback is paused at step 4, and the user zooms in to 200 % and pans away
- **THEN** the follow button stays pressed, no chip appears, and the camera stays where the user left it

#### Scenario: Next step after a user zoom
- **WHEN** following is on, the user has zoomed to 200 % and panned away from step 4, and then presses `→`
- **THEN** the camera moves to frame step 5 at 200 % before its arrow draws

#### Scenario: Turning following off
- **WHEN** following is on and the user presses `C`
- **THEN** following turns off, the follow button is no longer pressed, and the camera no longer moves on its own

## REMOVED Requirements

### Requirement: Resume following
**Reason**: A pan or zoom silently turned following off, and users had to notice and click a chip to get it back. Following now stays on until the user turns it off with the follow toggle, and a user move pauses playback instead (see *Following survives user camera moves* and playback *Automatic pausing*).
**Migration**: No settings change is needed. Users who want the camera to stay put turn following off with `C` or the eye button, or set `mermaidAnimator.camera.mode` to `manual`. The *Resume following* chip is gone; `C` still toggles following.
