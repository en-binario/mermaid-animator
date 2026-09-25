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

### Requirement: Step-shaping directives in M1
The directives `@animator` (for settings supported in this release), `@id`, `@title`, `@step-id`, `@skip`, `@pause`, `@duration`, `@speed`, `@emphasis` and `@with-next` SHALL take effect; `@caption` and `@chapter` SHALL be parsed, validated and stored on steps; other directives of the product specification SHALL be accepted without warnings and have no effect yet.

#### Scenario: Skip
- **WHEN** `%% @skip` precedes a message
- **THEN** that message is drawn from the start and produces no step

#### Scenario: With-next
- **WHEN** `%% @with-next` precedes the first of two messages
- **THEN** both messages animate together as one step
