# Spec Delta

## Purpose

Gives a precise, always-available account of where playback is — which step, in which fragment and iteration, from which line — and the controls to steer participants, chapters and branches.

## ADDED Requirements

### Requirement: Inspector panel
The panel SHALL provide an inspector with collapsible sections *Step* (number, endpoints, label, caption), *Context* (fragment path and loop iteration, e.g. `LOOP retry › ALT valid · iteration 2 of 3`), *Source* (a link that reveals the statement), *Participants*, *Chapters* and *Branches*; it SHALL sit beside the canvas when the panel is at least 880 px wide and be an overlay sheet toggled with `D` otherwise, and `mermaidAnimator.display.showInspector` SHALL control its default visibility.

#### Scenario: Wide panel
- **WHEN** the panel is 1000 px wide and the inspector is enabled
- **THEN** the inspector is shown beside the canvas without covering it

#### Scenario: Narrow panel
- **WHEN** the panel is 700 px wide and the user presses `D`
- **THEN** the inspector opens as an overlay sheet and `D` or `Esc` closes it

### Requirement: Branch choices
For every `alt`, `critical` and `opt` fragment the inspector SHALL list the fragment with chips for its branches (for `opt`: *include* / *skip*); choosing a chip SHALL recompile the step list with that branch, keep the playhead on the current step when it still exists, and remember the choice for the panel's lifetime.

#### Scenario: Choose the second branch
- **WHEN** the user selects the chip `[invalid]` of an `alt`
- **THEN** the step list plays the `invalid` branch and the `valid` branch is drawn as unplayed

### Requirement: Section state persistence
Collapsed and expanded inspector sections SHALL be remembered across panel hide/show and window reload.

#### Scenario: Reload keeps sections
- **WHEN** the user collapses *Participants* and reloads the window
- **THEN** *Participants* is still collapsed
