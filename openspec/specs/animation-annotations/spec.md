# animation-annotations Specification

## Purpose
Lets authors refine an animation with directives written as Mermaid comments (`%% @name args`), which other Mermaid renderers ignore, and reports mistakes in those directives.

## Requirements

### Requirement: Annotation grammar
A line whose first non-blank characters are `%%` followed by optional blanks and `@name` SHALL be parsed as an annotation with arguments that are `key=value` pairs or values (quoted strings with `\"` escapes, durations in `ms` or `s`, numbers with optional `x` suffix, comma-separated lists, or words). Lines starting with `%%{` SHALL NOT be treated as annotations.

#### Scenario: Pair arguments
- **WHEN** the source contains `%% @animator speed=1.5 future=ghosted`
- **THEN** one annotation `animator` with arguments `speed = 1.5` and `future = ghosted` is produced

### Requirement: Annotation scope
Diagram-scoped directives (`animator`, `id`, `title`) SHALL apply to the whole diagram; statement-scoped directives SHALL apply to the next statement that produces a step, skipping declarations.

#### Scenario: Directive before declarations
- **WHEN** `%% @pause 2s` precedes `participant A` and then `A->>B: go`
- **THEN** the pause applies to the step for `A->>B: go`

### Requirement: Annotation diagnostics
Unknown directive names SHALL produce a warning diagnostic suggesting the closest known name; invalid arguments SHALL produce an error; statement-scoped directives with no following step SHALL produce a warning; duplicate `@step-id` values SHALL produce an error.

#### Scenario: Misspelled directive
- **WHEN** the source contains `%% @pasue 1s`
- **THEN** a warning says the directive is unknown and suggests `@pause`

### Requirement: Directive effects
The directives `@animator`, `@id`, `@title`, `@step-id`, `@skip`, `@pause`, `@duration`, `@speed`, `@emphasis`, `@with-next`, `@type`, `@caption`, `@chapter`, `@latency`, `@focus`, `@iterations`, `@branch` and `@collapse` SHALL take effect: captions and chapters are shown (see `narrative`), `@latency` is shown in the inspector, `@focus` frames the listed participants for its step in Cinematic and Follow modes, `@iterations` and `@branch` drive fragment handling (see `step-compilation`), and `@collapse` is accepted and reserved for fragment collapsing; the topology and flowchart directives (`@group`, `@order`, `@path`, `@start`, `@choose`, `@events`) SHALL be accepted without warnings and take effect in later milestones.

#### Scenario: Caption shown
- **WHEN** `%% @caption "Retrying once."` precedes a message
- **THEN** the caption strip shows "Retrying once." while that message is the current step

#### Scenario: Focus framing
- **WHEN** the camera mode is `cinematic` and a step is annotated `%% @focus Gateway, Auth`
- **THEN** the camera frames the Gateway and Auth lifelines for that step
