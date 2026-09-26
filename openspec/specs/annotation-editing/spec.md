# annotation-editing Specification

## Purpose
Makes writing `%% @…` annotations effortless and safe inside the editor: suggestions as you type, documentation on hover, fixes for mistakes and quick insertion.

## Requirements

### Requirement: Completions
In Mermaid contexts (`mermaid` documents and Mermaid fences in Markdown/MDX), typing `%% @` SHALL offer every directive name with its documentation; after a directive name it SHALL offer argument values where they are enumerable: participant ids for `@focus` and `@type` targets, branch labels and `all`/`ask`/`skip` for `@branch`, participant types for `@type`, and setting keys and enum values for `@animator`.

#### Scenario: Directive names
- **WHEN** the user types `%% @ca` on a line inside a Mermaid fence
- **THEN** `caption` and `chapter` are offered with their descriptions

#### Scenario: Animator values
- **WHEN** the user types `%% @animator camera=`
- **THEN** `auto`, `fit`, `follow`, `cinematic` and `manual` are offered

### Requirement: Hover documentation
Hovering an annotation's directive SHALL show its documentation, its scope and — for statement- and fragment-scoped directives — the statement it applies to and that statement's step number.

#### Scenario: Target shown
- **WHEN** the user hovers `@pause` on the line before `W->>+P: Authorise card`
- **THEN** the hover says it applies to `W->>+P: Authorise card` (step 3)

### Requirement: Quick fixes
An unknown-directive diagnostic with a suggestion SHALL offer a quick fix that replaces the name with the suggestion.

#### Scenario: Fix a typo
- **WHEN** the user applies the quick fix on `%% @pasue 1s`
- **THEN** the line becomes `%% @pause 1s`

### Requirement: Insert annotation
*Mermaid Animator: Insert Annotation…* SHALL present the directives in a quick pick and insert the chosen one as a snippet on a new line above the cursor's statement, with placeholders for its arguments.

#### Scenario: Insert a caption
- **WHEN** the cursor is on a message line and the user chooses `@caption`
- **THEN** `%% @caption "…"` is inserted above that line with the text selected

### Requirement: Annotation highlighting
When `mermaidAnimator.annotations.highlight` is true (default), the directive name on annotation lines in Mermaid contexts SHALL be decorated in the editor's link colour.

#### Scenario: Highlight off
- **WHEN** `annotations.highlight` is false
- **THEN** annotation lines have no animator decoration
