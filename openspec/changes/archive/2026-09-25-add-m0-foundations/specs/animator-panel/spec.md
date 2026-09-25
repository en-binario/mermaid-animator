# Spec Delta

## Purpose

Lets users open a dedicated Mermaid Animator panel for a Mermaid file and keeps that panel available across window reloads, in both desktop and web editor hosts.

## ADDED Requirements

### Requirement: Mermaid language registration
The extension SHALL register the language identifier `mermaid` for files with the extensions `.mmd` and `.mermaid`.

#### Scenario: Opening a .mmd file
- **WHEN** the user opens a file named `flow.mmd`
- **THEN** the editor reports its language as `mermaid`

### Requirement: Open animated preview commands
The extension SHALL contribute the commands *Mermaid Animator: Open Animated Preview* and *Mermaid Animator: Open Animated Preview to the Side*, available in the command palette only while the active editor's language is `mermaid`, and an editor-title action that runs *Open Animated Preview to the Side*.

#### Scenario: Open beside the editor
- **WHEN** the active editor shows a `mermaid` file and the user runs *Open Animated Preview to the Side*
- **THEN** an animator panel opens in the editor group beside the active one and receives the file's current text

#### Scenario: Command hidden for other languages
- **WHEN** the active editor shows a TypeScript file
- **THEN** neither open command appears in the command palette

### Requirement: Panel identity and reuse
The animator panel SHALL be titled `▶ <file name>`, and running an open command again for a file that already has a panel SHALL reveal that panel instead of creating a second one.

#### Scenario: Reveal existing panel
- **WHEN** a panel is already open for `flow.mmd` and the user runs *Open Animated Preview* for `flow.mmd`
- **THEN** the existing panel is revealed and no additional panel is created

### Requirement: Unsaved content is shown
The panel SHALL display the in-memory document text, including unsaved edits, and SHALL receive updated text when the document changes.

#### Scenario: Unsaved edit reaches the panel
- **WHEN** the user types into `flow.mmd` without saving while its panel is open
- **THEN** the panel receives the edited text within one second

### Requirement: Panel restoration
Animator panels open when the window reloads SHALL be restored after the reload, bound to the same file.

#### Scenario: Reload window
- **WHEN** an animator panel is open for `flow.mmd` and the user runs *Developer: Reload Window*
- **THEN** after the reload an animator panel for `flow.mmd` is present again

### Requirement: Desktop and web hosts
The extension SHALL activate and open the animator panel in the desktop extension host and in the web extension host without relying on Node.js-only APIs in the web build.

#### Scenario: Web build contains no Node.js modules
- **WHEN** the web-host bundle is built
- **THEN** the build succeeds with a browser platform target and the bundle references no Node.js built-in modules
