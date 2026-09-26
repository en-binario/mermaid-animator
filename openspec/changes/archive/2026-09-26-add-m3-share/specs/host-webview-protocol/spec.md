# Spec Delta

## ADDED Requirements

### Requirement: Export progress and cancellation
The webview SHALL report animated-export progress with `export/progress` (fraction and phase) and the host SHALL send `export/cancel` when the user cancels the progress notification; the webview SHALL then stop the worker and send `export/cancelled`.

#### Scenario: Cancel from the notification
- **WHEN** the user clicks *Cancel* on the export notification
- **THEN** the webview receives `export/cancel`, stops encoding and replies `export/cancelled`

### Requirement: HTML player assembly
The webview SHALL send `export/player` with the diagram's player data (source or pre-rendered drawing, step list, timeline, captions, chapters, theme and options); the host SHALL inline the player bundle, styles and fonts from the extension's `dist` folder into a single HTML file and write it like other exports.

#### Scenario: Player written
- **WHEN** the webview sends `export/player` and the user confirms the save dialog
- **THEN** the host writes one `.html` file containing the player script inline

### Requirement: Sidecar data
`document/load` and `document/update` SHALL carry the diagram's resolved sidecar entry, and the webview SHALL request writes with `sidecar/write` carrying a patch for its diagram key.

#### Scenario: Sidecar edited
- **WHEN** the sidecar file changes while a panel is open
- **THEN** the host sends `document/update` with the new sidecar entry
