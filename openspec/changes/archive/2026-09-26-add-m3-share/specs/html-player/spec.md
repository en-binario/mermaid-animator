# Spec Delta

## Purpose

Shares the full interactive experience — playback, stepping, captions and chapters — as a single file that opens in any browser or embeds in a documentation site.

## ADDED Requirements

### Requirement: Self-contained player
*HTML player* SHALL write one `.html` file containing the diagram, the player code, styles and fonts inline, with no network requests, which offers play/pause, previous/next, first/last, a scrubber with chapter ticks, a step counter, captions and the keyboard shortcuts of the panel, in the chosen theme (or following the viewer's colour scheme).

#### Scenario: Offline
- **WHEN** the exported file is opened in a browser without network access
- **THEN** the diagram animates and every control works

### Requirement: Player views and diagrams
The player SHALL support the views available when exporting (sequence, topology, split for sequence diagrams) and diagrams shown by the generic engine (as their pre-rendered drawing with the ordered reveal).

#### Scenario: Generic diagram
- **WHEN** a flowchart is exported as an HTML player
- **THEN** the player steps through the flowchart's reveal without loading Mermaid

### Requirement: Links into the player
The player SHALL open at the step given by `#step=<n>` or the first step of the chapter given by `#chapter=<slug>`, and SHALL update the fragment as the viewer steps.

#### Scenario: Chapter link
- **WHEN** the player is opened with `#chapter=session`
- **THEN** it rests on the first step of the chapter "Session"
