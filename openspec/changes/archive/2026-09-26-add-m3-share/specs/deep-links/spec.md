# Spec Delta

## Purpose

Lets people point colleagues at an exact moment of a diagram's animation from chats, issues and documents.

## ADDED Requirements

### Requirement: Copy link to step
*Copy Link to Current Step* SHALL copy `vscode://enbinario.mermaid-animator/open?path=<workspace-relative path>&diagram=<@id or 1-based index>&step=<step id>` for the active panel (`vscode-insiders://` in Insiders).

#### Scenario: Link format
- **WHEN** the active panel shows diagram 2 of `docs/auth.md` resting on a step with id `sign-in`
- **THEN** the clipboard holds a link with `path=docs/auth.md`, `diagram=2` and `step=sign-in`

### Requirement: Opening links
Opening such a link SHALL resolve the path within the open workspace folders, open the animator for the diagram and rest on the step (resolved by step id, then structural id, then the nearest step); if the file or diagram is not found, a message SHALL say so.

#### Scenario: Open a link
- **WHEN** a link to step `sign-in` of diagram 2 of `docs/auth.md` is opened
- **THEN** a panel for that diagram opens resting on step `sign-in`

#### Scenario: Missing file
- **WHEN** the linked path is not in any workspace folder
- **THEN** an information message states that the file was not found and nothing else happens
