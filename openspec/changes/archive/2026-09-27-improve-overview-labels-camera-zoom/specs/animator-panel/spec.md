# Spec Delta

## ADDED Requirements

### Requirement: Settings access
The panel toolbar SHALL end with a gear button labelled *Mermaid Animator Settings*. The extension SHALL also contribute the command *Mermaid Animator: Open Settings*, always available in the command palette and shown with a gear icon in the Diagrams view title bar. Both SHALL open the editor's Settings UI filtered to this extension's settings.

#### Scenario: Gear button
- **WHEN** the user clicks the gear button in the animator panel's toolbar
- **THEN** the Settings editor opens showing only Mermaid Animator settings

#### Scenario: Command palette
- **WHEN** the user runs *Mermaid Animator: Open Settings* with no animator panel open
- **THEN** the Settings editor opens showing only Mermaid Animator settings
