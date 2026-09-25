# playback Specification

## Purpose
Lets users move through the step list — automatically, one step at a time, or by scrubbing — with controls, keyboard shortcuts and editor commands.

## Requirements

### Requirement: Transport controls
The panel SHALL provide first step, previous step, play/pause, next step and last step controls, a step counter `NN / NN` in tabular figures, a speed selector (0.25×, 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×, 3×, 4×) and a loop toggle.

#### Scenario: Next step
- **WHEN** playback is paused at step 3 of 12 and the user activates *Next*
- **THEN** step 4's transition plays and playback pauses with the counter reading `04 / 12`

#### Scenario: Previous step
- **WHEN** playback is paused at step 4 and the user activates *Previous*
- **THEN** step 4's transition plays backwards at double speed and the counter reads `03 / 12`

### Requirement: Autoplay
Play SHALL advance through transitions and dwells at the selected speed; at the end playback SHALL stop, or restart from the beginning when loop is on.

#### Scenario: End without loop
- **WHEN** autoplay reaches the last step with loop off
- **THEN** playback stops showing the complete diagram

### Requirement: Scrubber
The scrubber SHALL seek continuously while dragged, showing intermediate animation states, and snap to the nearest step boundary on release when `mermaidAnimator.scrubber.snap` is true (default); hovering it SHALL show the step number and label under the pointer.

#### Scenario: Snap on release
- **WHEN** the user releases the scrubber partway through step 5's transition
- **THEN** playback settles at the nearest step boundary

### Requirement: Go to step
Activating the step counter or pressing `G` SHALL let the user enter a step number or search text and jump to the matching step.

#### Scenario: Jump by number
- **WHEN** the user enters `9`
- **THEN** playback seeks to step 9 and pauses

### Requirement: Keyboard shortcuts
With the panel focused, `Space`/`K` SHALL toggle play, `→`/`←` step, `Home`/`End` go to first/last, `[`/`]` change speed, `L` toggle loop, `G` open go-to-step, `+`/`-`/`0`/`F`/`C` control the camera, `E` export and `?` show the shortcut overlay.

#### Scenario: Space toggles play
- **WHEN** the panel is focused and paused and the user presses `Space`
- **THEN** autoplay starts

### Requirement: Editor commands
The commands *Play / Pause*, *Next Step*, *Previous Step*, *First Step*, *Last Step* and *Go to Step…* SHALL control the active animator panel and be bound by default to `Ctrl+Alt+Space`, `Ctrl+Alt+Right`, `Ctrl+Alt+Left` (`Cmd` on macOS) when a panel is active.

#### Scenario: Keybinding from the editor
- **WHEN** an animator panel is the active editor and the user presses `Ctrl+Alt+Right`
- **THEN** the panel advances one step

### Requirement: Automatic pausing
Playback SHALL pause when the panel becomes hidden and resume when it becomes visible if it was playing; it SHALL pause while the pointer is over the canvas when `mermaidAnimator.playback.pauseOnHover` is true (default).

#### Scenario: Hidden panel
- **WHEN** the user switches to another editor tab during autoplay
- **THEN** playback pauses, and resumes when the panel is shown again
