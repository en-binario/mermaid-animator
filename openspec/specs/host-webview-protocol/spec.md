# host-webview-protocol Specification

## Purpose
Defines the versioned message contract between the extension host and the animator webview so both sides can evolve independently and reject malformed traffic safely.

## Requirements

### Requirement: Versioned message envelope
Every message exchanged between host and webview SHALL be an object with a numeric protocol version `v`, a string `type` and a `payload`; requests that expect a reply SHALL carry an `id` that the reply echoes.

#### Scenario: Envelope shape
- **WHEN** the host sends any message to the webview
- **THEN** the message has `v` equal to the current protocol version (1), a known `type` and a `payload`

### Requirement: Ready handshake
The webview SHALL send `ready` with its protocol version once it can receive messages, and the host SHALL send `init` (settings, theme kind, reduced-motion preference, locale, strings) followed by `document/load` only after receiving `ready`.

#### Scenario: Load after ready
- **WHEN** a panel is created
- **THEN** the host sends no document to the webview before `ready` arrives, and sends `init` then `document/load` after it

### Requirement: Live updates
The host SHALL send `document/update` when the bound document's text changes and `settings/changed` when relevant configuration or the colour theme changes.

#### Scenario: Theme change
- **WHEN** the user switches VS Code from a light to a dark colour theme while a panel is open
- **THEN** the webview receives `settings/changed` with the new theme kind and applies it without reloading

### Requirement: Validation of incoming messages
Each side SHALL validate incoming messages against the protocol schema, ignore messages that fail validation or carry an unknown version, and log them without throwing.

#### Scenario: Malformed message
- **WHEN** the webview receives `{ "type": "document/load" }` with no version or payload
- **THEN** the message is ignored, a warning is logged, and the webview keeps working

### Requirement: State reporting
The webview SHALL report its user-visible state to the host with `state/changed` whenever that state changes, and forward diagnostic log lines with `log`.

#### Scenario: Log forwarding
- **WHEN** the webview logs a warning
- **THEN** the host writes it to the *Mermaid Animator* output channel

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

### Requirement: View commands
The host SHALL route the view commands to the active panel as `command` messages with action `setView` and argument `view` (`sequence`, `topology`, `split`) or action `toggleView`.

#### Scenario: Palette command
- **WHEN** the user runs *Show Split View* while a panel is active
- **THEN** that panel's webview receives `command` `setView` with `view: split`

### Requirement: Manual layout persistence
The webview SHALL send `layout/save` with the diagram key and node positions when manual positions change, the host SHALL store them per document and diagram in workspace state and include them in `document/load`, and *Reset Topology Layout* SHALL clear them.

#### Scenario: Positions round-trip
- **WHEN** the webview sends `layout/save` for diagram 2 of `docs.md` and the panel is later reopened
- **THEN** `document/load` for that diagram carries the saved positions

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
