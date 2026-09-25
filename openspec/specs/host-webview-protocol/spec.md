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
