# Spec Delta

## Purpose

Shows every Mermaid diagram in the workspace in one place, so users can find and open any of them without searching files.

## ADDED Requirements

### Requirement: Diagrams tree
When `mermaidAnimator.diagramsView.enabled` is true (default), the Explorer SHALL contain a *Mermaid Diagrams* view listing files that contain diagrams (matching `mermaidAnimator.files.include`, default `**/*.{md,mdx,mmd,mermaid}`, and honouring `files.exclude` and `search.exclude`), each with its diagrams labelled by title, `@id` or first meaningful line and an icon for the diagram type.

#### Scenario: Listing
- **WHEN** the workspace contains `docs/auth.md` with two diagrams
- **THEN** the view shows `auth.md` with two children labelled by their titles or first lines

### Requirement: Diagrams view actions
Each diagram entry SHALL offer *Animate* (default on click), *Open Source* and *Export…*; the view title SHALL offer *Refresh* and a type filter.

#### Scenario: Animate from the view
- **WHEN** the user clicks a diagram entry
- **THEN** an animator panel opens for that diagram

### Requirement: Incremental and bounded indexing
The index SHALL update on file creation, change and deletion without a full rescan, SHALL scan files with a fence pattern rather than a full parse, SHALL yield to the event loop every 50 files, SHALL stop after 10,000 files (configurable) and SHALL show progress in the view title while scanning.

#### Scenario: New file
- **WHEN** a new Markdown file with a Mermaid fence is saved
- **THEN** it appears in the view without a manual refresh
