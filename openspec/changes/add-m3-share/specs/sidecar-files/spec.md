# Spec Delta

## Purpose

Keeps a diagram's animation settings, narration and layout in the repository beside the diagram, for teams who prefer their Mermaid source free of annotations.

## ADDED Requirements

### Requirement: Sidecar location and schema
The sidecar of a source file SHALL be `<source file name>.animator.json` in the same folder (for example `README.md.animator.json`), with diagrams keyed by `@id` or `#<1-based index>`; the extension SHALL contribute a JSON schema for `*.animator.json` providing validation and completion.

#### Scenario: Schema validation
- **WHEN** a sidecar sets `"playback.speed": "fast"`
- **THEN** the editor reports a schema error on that value

### Requirement: Reading sidecars
Settings, captions, chapters and topology positions from a diagram's sidecar SHALL apply with the precedence of spec §11.8 (above user and workspace settings, below Mermaid front matter and annotations); step references SHALL resolve by `@step-id`, content id, structural id or `#<step number>`; entries that no longer resolve SHALL produce warning diagnostics on the sidecar file instead of being dropped silently; edits to the sidecar SHALL apply to open panels live.

#### Scenario: Caption from sidecar
- **WHEN** the sidecar has `"captions": { "#3": "Auth looks the user up." }` for the diagram
- **THEN** step 3 shows that caption

#### Scenario: Dangling reference
- **WHEN** a sidecar caption refers to a step id that no longer exists
- **THEN** a warning is shown on that entry in the sidecar file

### Requirement: Writing sidecars
The extension SHALL write the sidecar only when the user runs *Save Topology Layout* or *Save Current Settings as Diagram Defaults*, preserving unrelated content and formatting as far as possible; saving a layout SHALL move positions previously stored in workspace state into the sidecar; in untrusted workspaces sidecars SHALL be read but never written.

#### Scenario: Save layout
- **WHEN** the user runs *Save Topology Layout* after arranging nodes manually
- **THEN** the sidecar contains the positions under the diagram's key and the workspace-state copy is removed

#### Scenario: Untrusted workspace
- **WHEN** the workspace is not trusted
- **THEN** the save commands are unavailable and sidecars are still applied
