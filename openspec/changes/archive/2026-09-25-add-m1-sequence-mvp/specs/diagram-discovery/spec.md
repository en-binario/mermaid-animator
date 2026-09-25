# Spec Delta

## Purpose

Finds Mermaid diagrams wherever they already live — Markdown fences and Mermaid files — and offers the entry points that open them in the animator, keeping each panel attached to the right diagram as documents change.

## ADDED Requirements

### Requirement: Diagram detection
The extension SHALL detect as diagrams: the whole text of a `mermaid`-language document, and every fenced code block in a Markdown or MDX document whose info string's first word is `mermaid` (case-insensitive), using backtick or tilde fences of length three or more, with the closing fence using the same character and at least the opening length. Unterminated fences SHALL extend to the end of the document.

#### Scenario: Two diagrams in a Markdown file
- **WHEN** a Markdown document contains a ```` ```mermaid ```` block, a ```` ```js ```` block and a `~~~~ mermaid` block
- **THEN** exactly two diagrams are detected, with the source ranges of their contents

#### Scenario: Info string attributes
- **WHEN** a fence opens with ```` ```mermaid title="Auth" ````
- **THEN** it is detected as a Mermaid diagram

### Requirement: CodeLens entry point
When `mermaidAnimator.codeLens.enabled` is true (default), each detected Markdown diagram SHALL show the CodeLens actions *▶ Animate* and *Export…* on its opening fence line.

#### Scenario: Animate from CodeLens
- **WHEN** the user clicks *▶ Animate* above the second diagram of a document
- **THEN** an animator panel opens showing that diagram

#### Scenario: CodeLens disabled
- **WHEN** `mermaidAnimator.codeLens.enabled` is false
- **THEN** no animator CodeLens appears

### Requirement: Diagram at cursor and all diagrams
The extension SHALL provide *Animate Diagram at Cursor* (opens the diagram containing the cursor, otherwise the first diagram) and *Animate All Diagrams in File* (opens one panel per diagram).

#### Scenario: Cursor outside any diagram
- **WHEN** the cursor is on prose between two diagrams and the user runs *Animate Diagram at Cursor*
- **THEN** the first diagram of the document opens

### Requirement: Explorer entry point
The Explorer context menu SHALL offer *Animate Mermaid Diagram* for `.mmd`, `.mermaid`, `.md` and `.mdx` files; for files containing several diagrams it SHALL present a quick pick labelled by diagram title, `@id` or first meaningful line.

#### Scenario: Multi-diagram file
- **WHEN** the user chooses *Animate Mermaid Diagram* on a Markdown file with three diagrams
- **THEN** a quick pick lists three entries and choosing one opens that diagram

#### Scenario: File without diagrams
- **WHEN** the file contains no diagram
- **THEN** an information message states that no Mermaid diagram was found and no panel opens

### Requirement: Context keys
The extension SHALL maintain the context keys `mermaidAnimator.editorHasDiagram` (active editor contains at least one diagram), `mermaidAnimator.cursorInDiagram` (cursor inside a diagram) and `mermaidAnimator.panelActive` (an animator panel is the active editor).

#### Scenario: Cursor moves into a fence
- **WHEN** the cursor moves from prose into a Mermaid fence
- **THEN** `mermaidAnimator.cursorInDiagram` becomes true

### Requirement: Diagram switcher
The panel toolbar SHALL list all diagrams of its source document and switching to another one SHALL reuse the same webview.

#### Scenario: Switch diagram
- **WHEN** the user picks *Diagram 3* in the toolbar switcher
- **THEN** the panel shows diagram 3 without the webview being recreated

### Requirement: Stable binding to a diagram
A panel bound to a Markdown diagram SHALL stay bound to it when the document changes, matching first by `@id` annotation, then by greatest content similarity (at least 50%), then by the same index; if no diagram remains, the panel SHALL show a notice and keep the last rendering.

#### Scenario: Diagram moves down
- **WHEN** the user inserts a new diagram above the bound one
- **THEN** the panel keeps showing the originally bound diagram
