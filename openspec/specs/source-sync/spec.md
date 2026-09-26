# source-sync Specification

## Purpose
Keeps the animation and its source in step: edits appear live without losing the user's place, errors never blank the panel, and the panel and editor point at each other.

## Requirements

### Requirement: Live reload
The panel SHALL re-render from the in-memory document after edits, debounced by `mermaidAnimator.liveReload.debounceMs` (default 250 ms), when `mermaidAnimator.liveReload.enabled` is true (default).

#### Scenario: Add a message
- **WHEN** the user adds a message line and pauses typing
- **THEN** the panel shows the new message after the debounce interval

### Requirement: Position preservation
After a reload the current step SHALL be resolved in order by explicit `@step-id`, by `id`, by `structuralId`, by a step whose source contains the editor cursor, and finally by the nearest preceding surviving step.

#### Scenario: Editing the current label
- **WHEN** playback is paused on step 5 and the user edits step 5's label character by character
- **THEN** playback stays on step 5 throughout

### Requirement: Last known good rendering
When the source has errors that prevent a model, the panel SHALL keep the last successful rendering at reduced opacity and show a banner with the first error's message, its line and column, and a *Reveal in source* action; the panel SHALL never become blank because of a syntax error.

#### Scenario: Syntax error while typing
- **WHEN** the user types an unmatched `end`
- **THEN** the previous diagram stays visible dimmed with an error banner naming the line

### Requirement: Problems panel diagnostics
Parse and annotation diagnostics for diagrams with an open panel SHALL be published to the Problems panel under the source *Mermaid Animator* with their document ranges, and cleared when fixed or when the panel closes.

#### Scenario: Fix clears the problem
- **WHEN** the user fixes the error
- **THEN** its entry disappears from the Problems panel

### Requirement: Current step in the editor
When `mermaidAnimator.sync.stepToEditor` is true (default) the source range(s) of the current step SHALL be decorated in every visible editor showing the document, without scrolling it.

#### Scenario: Step advances
- **WHEN** playback advances to the next message
- **THEN** that message's line is highlighted in the source editor and the previous highlight is removed

### Requirement: Reveal source
The panel SHALL offer *Reveal in Source* for the current step, and `Alt` + double-click on a diagram element SHALL reveal and select that element's statement in the editor.

#### Scenario: Reveal a message
- **WHEN** the user `Alt`+double-clicks a message arrow
- **THEN** the editor shows the document with that message's statement selected

### Requirement: Hover details
Hovering a message, note or participant SHALL show a tooltip with its full label and source line number.

#### Scenario: Truncated label
- **WHEN** the user hovers a message whose label is truncated
- **THEN** the tooltip shows the complete label and `Line N`

### Requirement: Editor cursor seeks to the step
When `mermaidAnimator.sync.cursorToStep` is `click` (default), clicking on a statement line of the bound diagram SHALL seek its panel to the rest point of the step that contains that statement; with `follow`, every cursor move onto a statement line SHALL do so after a 120 ms debounce; with `off`, the cursor SHALL not move playback; lines that belong to no step SHALL leave playback unchanged.

#### Scenario: Click a message line
- **WHEN** the user clicks the line `Bob->>Carol: second` of a diagram whose panel rests on step 0
- **THEN** the panel rests on the step for `Bob->>Carol: second`

#### Scenario: Keyboard movement with click mode
- **WHEN** `cursorToStep` is `click` and the user moves the cursor with the arrow keys
- **THEN** playback does not move
