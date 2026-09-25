# Spec Delta

## ADDED Requirements

### Requirement: Editor cursor seeks to the step
When `mermaidAnimator.sync.cursorToStep` is `click` (default), clicking on a statement line of the bound diagram SHALL seek its panel to the rest point of the step that contains that statement; with `follow`, every cursor move onto a statement line SHALL do so after a 120 ms debounce; with `off`, the cursor SHALL not move playback; lines that belong to no step SHALL leave playback unchanged.

#### Scenario: Click a message line
- **WHEN** the user clicks the line `Bob->>Carol: second` of a diagram whose panel rests on step 0
- **THEN** the panel rests on the step for `Bob->>Carol: second`

#### Scenario: Keyboard movement with click mode
- **WHEN** `cursorToStep` is `click` and the user moves the cursor with the arrow keys
- **THEN** playback does not move
