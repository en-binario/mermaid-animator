# Spec Delta

## ADDED Requirements

### Requirement: Command routing
The host SHALL forward editor commands and keybindings for the active panel to its webview as `command` messages naming the action (`togglePlay`, `play`, `pause`, `next`, `previous`, `first`, `last`, `goToStep`, `export`, `copyImage`, `revealSource`).

#### Scenario: Next step from a keybinding
- **WHEN** the user presses the *Next Step* keybinding while a panel is active
- **THEN** that panel's webview receives `command` with action `next`

### Requirement: Diagram selection and document list
The host SHALL include in `document/load` the list of diagrams in the source document (index, title, type), and the webview SHALL request another diagram with `diagram/select`, to which the host replies with a new `document/load` on the same webview.

#### Scenario: Select diagram 2
- **WHEN** the webview sends `diagram/select` with index 2
- **THEN** the host sends `document/load` for diagram 2 to the same webview

### Requirement: Source and editor messages
The webview SHALL report the current step's document ranges in `state/changed`, request editor navigation with `source/reveal`, and the host SHALL send the editor cursor position with `editor/cursor` when the user clicks in the bound diagram.

#### Scenario: Reveal request
- **WHEN** the webview sends `source/reveal` with a range
- **THEN** the host reveals and selects that range in an editor for the bound document

### Requirement: Export transfer
The webview SHALL send exported files to the host as `export/data` messages carrying the format, a suggested file name and the bytes (chunked above 8 MB), and report clipboard failures with `clipboard/fallback`; the host SHALL acknowledge completed writes with `export/ack`.

#### Scenario: PNG export
- **WHEN** the webview sends `export/data` for a PNG and the user confirms the save dialog
- **THEN** the host writes the bytes to the chosen file and sends `export/ack` with its path
