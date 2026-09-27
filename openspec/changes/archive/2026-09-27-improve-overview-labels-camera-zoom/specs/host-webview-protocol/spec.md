# Spec Delta

## ADDED Requirements

### Requirement: Settings request
The webview SHALL send `settings/open` with an empty payload when the user activates the panel's settings button. The host SHALL validate the message like any other and respond by opening the Settings UI filtered to this extension. The host SHALL ignore any payload fields, and the webview SHALL NOT be able to choose which settings or search query are opened.

#### Scenario: Settings button pressed
- **WHEN** the host receives a valid `settings/open` message from a panel
- **THEN** the Settings UI opens filtered to Mermaid Animator settings

#### Scenario: Payload cannot change the query
- **WHEN** the host receives `settings/open` with a payload of `{ "query": "@ext:other.extension" }`
- **THEN** the Settings UI opens filtered to Mermaid Animator settings only
