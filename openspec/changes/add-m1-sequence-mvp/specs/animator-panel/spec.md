# Spec Delta

## MODIFIED Requirements

### Requirement: Open animated preview commands
The extension SHALL contribute the commands *Mermaid Animator: Open Animated Preview* and *Mermaid Animator: Open Animated Preview to the Side*, available in the command palette only while the active editor's language is `mermaid` or the active editor is a Markdown or MDX document containing at least one Mermaid diagram, and an editor-title action that runs *Open Animated Preview to the Side* under the same condition. For Markdown and MDX documents the commands SHALL open the diagram containing the cursor, otherwise the first diagram.

#### Scenario: Open beside the editor
- **WHEN** the active editor shows a `mermaid` file and the user runs *Open Animated Preview to the Side*
- **THEN** an animator panel opens in the editor group beside the active one and receives the file's current text

#### Scenario: Markdown with a diagram
- **WHEN** the active editor shows a Markdown file whose cursor is inside its second Mermaid fence and the user runs *Open Animated Preview*
- **THEN** an animator panel opens showing the second diagram

#### Scenario: Command hidden for other languages
- **WHEN** the active editor shows a TypeScript file, or a Markdown file without Mermaid fences
- **THEN** neither open command appears in the command palette

### Requirement: Panel identity and reuse
The animator panel SHALL be titled `▶ <diagram title or file name>`, followed by ` · <n>` when its document contains more than one diagram (`n` being the diagram's 1-based index); running an open command again for a diagram that already has a panel SHALL reveal that panel instead of creating a second one.

#### Scenario: Reveal existing panel
- **WHEN** a panel is already open for `flow.mmd` and the user runs *Open Animated Preview* for `flow.mmd`
- **THEN** the existing panel is revealed and no additional panel is created

#### Scenario: Title for a second diagram
- **WHEN** a panel opens for the second diagram of `docs/auth.md`, which has no title
- **THEN** the panel is titled `▶ auth.md · 2`
