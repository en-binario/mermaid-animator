# Spec Delta

## ADDED Requirements

### Requirement: Presentation layout messages
The webview SHALL request presentation start and stop with `presentation/toggle`, and the host SHALL perform the editor layout changes and confirm with `presentation/state` so both sides agree when presentation ends by other means.

#### Scenario: Leave by Escape
- **WHEN** the presenter presses `Esc` in the panel
- **THEN** the webview sends `presentation/toggle` with `on: false`, the host restores the layout and replies with `presentation/state` `false`

### Requirement: Seek command with a source line
The host SHALL send `command` with action `seekToLine` and the document line when the editor cursor should move playback (see `source-sync`), and the webview SHALL resolve the line to a step.

#### Scenario: Seek to line
- **WHEN** the host sends `seekToLine` with line 17
- **THEN** the webview seeks to the step whose sources include line 17, or leaves playback unchanged if none does
