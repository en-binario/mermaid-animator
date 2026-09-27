# Spec Delta

## Purpose

Makes zooming discoverable with visible toolbar controls that show the current zoom level and offer common presets.

## ADDED Requirements

### Requirement: Toolbar zoom group
The panel toolbar SHALL show a zoom group with a *Zoom out* button, a button showing the current zoom as a whole percentage, and a *Zoom in* button, in that order. The group SHALL sit beside the fit and frame buttons. *Zoom in* and *Zoom out* SHALL change the zoom by the same factor as the `+` and `-` keys, about the centre of the view, within 10 %–800 %. At a limit, the corresponding button SHALL be disabled. Each button SHALL have a localized accessible name and tooltip that include its shortcut.

#### Scenario: Zoom in from the toolbar
- **WHEN** the zoom is 100 % and the user clicks *Zoom in*
- **THEN** the view zooms about its centre by the `+` key's factor and the percentage updates to 120 %

#### Scenario: Maximum zoom
- **WHEN** the zoom is 800 %
- **THEN** the *Zoom in* button is disabled

### Requirement: Live zoom percentage
The percentage SHALL reflect the current zoom of the view it describes and update during pointer and keyboard zoom, automatic camera moves, fit and frame. 100 % SHALL mean one drawing unit per CSS pixel. In the split view the controls SHALL act on both views, and the percentage SHALL show the zoom of the view the user last interacted with (the sequence view by default).

#### Scenario: Pinch zoom updates the label
- **WHEN** the user zooms with `Ctrl` + wheel
- **THEN** the percentage changes as the view zooms

### Requirement: Zoom presets
Activating the percentage button SHALL open a menu with the presets 25 %, 50 %, 75 %, 100 %, 150 %, 200 % and 400 %, and *Fit* (the same as the `0` key). The preset matching the current zoom SHALL be marked. Choosing a percentage SHALL zoom about the centre of the view to exactly that level, and choosing *Fit* SHALL frame the whole diagram. The menu SHALL be keyboard operable and close on `Escape` or outside click.

#### Scenario: Choose 50 %
- **WHEN** the user opens the percentage menu and chooses 50 %
- **THEN** the view zooms about its centre to 50 % and the button reads 50 %

### Requirement: Zoom controls count as user camera moves
Zooming with the toolbar or the presets, except *Fit*, SHALL count as a user camera move for following and automatic pausing.

#### Scenario: Zoom preset during playback
- **WHEN** playback is running with following on and the user chooses 200 %
- **THEN** playback pauses, following stays on, and the view is at 200 %
