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
