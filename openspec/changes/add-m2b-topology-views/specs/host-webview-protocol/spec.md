# Spec Delta

## ADDED Requirements

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
