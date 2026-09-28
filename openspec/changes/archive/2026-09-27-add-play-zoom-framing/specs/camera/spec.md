## ADDED Requirements

### Requirement: Play zoom settings
`mermaidAnimator.camera.playZoom` (default `100`) and `mermaidAnimator.camera.presentationZoom` (default `150`) SHALL set, in percent, the zoom at which a following camera frames steps during normal playback and in presentation mode. Neither setting has an `@animator` short name. A number outside the range SHALL be clamped to it, and any other value SHALL be replaced by the default. Changing either setting SHALL take effect at the next step framing without reloading the panel.

**Constraints:**
- Range: `10`–`800` (percent)
- Defaults: `playZoom` `100`, `presentationZoom` `150`

#### Scenario: Play zoom setting value matrix

| # | Setting | Value in settings | Zoom used by that mode |
| :--- | :--- | :--- | :--- |
| R1 | `camera.playZoom` | Absent | **100 %** |
| R2 | `camera.presentationZoom` | Absent | **150 %** |
| R3 | *Any* | `80` | **80 %** |
| R4 | *Any* | `5` | **10 %** |
| R5 | *Any* | `1000` | **800 %** |
| R6 | `camera.playZoom` | `"large"` | **100 %** |
| R7 | `camera.presentationZoom` | `"large"` | **150 %** |

### Requirement: Session play zoom
Each view (the drawing — a native sequence or a Mermaid-rendered diagram — and the topology view) SHALL keep two session zoom levels: a normal one and a presentation one. When a diagram is loaded into the panel (the panel opens, or a different diagram is chosen in the diagram selector), both SHALL be set from `camera.playZoom` and `camera.presentationZoom`. A user zoom — `Ctrl`/`Cmd` + wheel, trackpad pinch, `+`/`-`, the toolbar *Zoom in* and *Zoom out* buttons, or a zoom preset — SHALL set the session zoom of the current mode (presentation while presenting, normal otherwise) of each view it zoomed to the resulting zoom, at any step and in any playback state. *Fit*, *Frame step*, pans, scrolls, minimap moves and automatic camera moves SHALL NOT change a session zoom. A live reload of the same diagram's source SHALL keep both session zooms, and changing a setting SHALL set the matching session zoom of every view to the new value. A following camera SHALL frame each step at the session zoom of the current mode, subject to *Wide-step zoom-out*. `fit`, `cinematic` outside presentation mode, and `manual` SHALL NOT use a session zoom.

#### Scenario: Framing zoom matrix

| # | Presenting | Camera | Last user zoom since load | Step framed at |
| :--- | :--- | :--- | :--- | :--- |
| R1 | *Any* | Following off (`manual`, or toggled off with `C`) | *Any* | **No automatic framing** |
| R2 | No | `fit` (including `auto` resolving to `fit`) | *Any* | **Whole diagram fitted** |
| R3 | No | `cinematic` | *Any* | **Cinematic framing** |
| R4 | No | `follow` (including `auto` resolving to `follow`) | None | **100 % (`camera.playZoom`)** |
| R5 | No | `follow` | 60 %, while not presenting | **60 %** |
| R6 | No | `follow` | 200 %, while presenting | **100 % (`camera.playZoom`)** |
| R7 | Yes | Following on | None | **150 % (`camera.presentationZoom`)** |
| R8 | Yes | Following on | 200 %, while presenting | **200 %** |
| R9 | Yes | Following on | 60 %, while not presenting | **150 % (`camera.presentationZoom`)** |

#### Scenario: Session zoom lifetime matrix

| # | Event | Normal session zoom afterwards | Presentation session zoom afterwards |
| :--- | :--- | :--- | :--- |
| R1 | The panel opens on a diagram | **`camera.playZoom`** | **`camera.presentationZoom`** |
| R2 | A different diagram is chosen in the diagram selector | **`camera.playZoom`** | **`camera.presentationZoom`** |
| R3 | The same diagram's source is edited (live reload) | **Unchanged** | **Unchanged** |
| R4 | `camera.playZoom` is changed to `80` | **80 %** | **Unchanged** |
| R5 | `camera.presentationZoom` is changed to `200` | **Unchanged** | **200 %** |
| R6 | User zoom to 130 % while not presenting | **130 %** | **Unchanged** |
| R7 | User zoom to 130 % while presenting | **Unchanged** | **130 %** |
| R8 | *Fit* (`0`) or *Frame step* (`F`) | **Unchanged** | **Unchanged** |
| R9 | Pan, scroll or minimap move | **Unchanged** | **Unchanged** |
| R10 | Automatic camera move (step framing, wide-step zoom-out, overview fit) | **Unchanged** | **Unchanged** |
| R11 | Entering or leaving presentation mode | **Unchanged** | **Unchanged** |

#### Scenario: Replay and resume use the user's zoom
- **GIVEN** a diagram was just opened in `follow` mode with default settings and rests at step 0
- **WHEN** the user presses *Play*
- **THEN** after the overview's dwell the camera frames step 1 at 100 %
- **AND WHEN** the user zooms to 150 % with `Ctrl` + wheel during step 3
- **THEN** playback pauses and the percentage reads 150 %
- **AND WHEN** the user presses *Play*
- **THEN** the camera frames step 3 at 150 % and playback continues
- **AND WHEN** playback ends and the user presses *First step* and then *Play*
- **THEN** after the overview's dwell the camera frames step 1 at 150 %

#### Scenario: Another diagram resets the session zoom
- **GIVEN** the user zoomed to 150 % while playing diagram 1 of a file in `follow` mode
- **WHEN** the user chooses diagram 2 in the diagram selector and presses *Play*
- **THEN** the camera frames step 1 of diagram 2 at 100 %

### Requirement: Wide-step zoom-out
When a following camera frames a step whose bounds, with a 24 px margin on each side, do not fit in the view at the session zoom Z, it SHALL zoom out to the largest zoom at which they fit, but not below 75 %. When Z is 75 % or less, whether the user zoomed there or a setting is below 75 %, the camera SHALL frame every step at Z, zooming neither out nor in. When the step does not fit at the resulting zoom, the camera SHALL centre the step on each axis where it overflows. The next step that fits at Z SHALL be framed at Z again. The zoom-out SHALL NOT change the session zoom. A step's bounds are its message or edge with its label, or, when the step has `@focus`, the focused participants' columns over the step's rows.

**Constraints:**
- Margin: 24 px on each side of the step
- Floor: 75 %, or Z when Z is below 75 %

#### Scenario: Wide-step zoom matrix

| # | Session zoom Z | Step fits at Z | Step fits at 75 % | Zoom used | Overflowing axis |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | *Any* | Yes | *N/A* | **Z** | **None** |
| R2 | 75 % or less | No | *N/A* | **Z** | **Step centred** |
| R3 | Above 75 % | No | Yes | **Largest zoom between 75 % and Z at which the step fits** | **None** |
| R4 | Above 75 % | No | No | **75 %** | **Step centred** |

#### Scenario: Zoom restored after a wide edge
- **GIVEN** a `follow` camera at session zoom 100 % in a view 1000 px wide, where step 7's edge is 1100 px wide and step 8's edge is 300 px wide, both 100 px tall
- **WHEN** playback moves to step 7
- **THEN** the camera frames step 7 at zoom 952 ÷ 1100 (0.8655) and the percentage reads 87 %
- **AND WHEN** playback moves to step 8
- **THEN** the camera frames step 8 at 100 %

#### Scenario: Wide edge at a user zoom below 75 %
- **GIVEN** a `follow` camera where the user zoomed to 50 %, and step 7's edge does not fit in the view at 50 %
- **WHEN** playback moves to step 7
- **THEN** the percentage reads 50 % and step 7 is centred on the axis where it overflows

### Requirement: Framing stays on the drawing
Every automatic step framing by a following camera SHALL end with the view on the drawing: on each axis where the drawing, at the framing zoom, is wider (or taller) than the view less a 24 px margin on each side, no more than 24 px of canvas beyond the drawing's edge SHALL be visible; on each axis where it is not, the drawing SHALL be centred. Within those limits the camera SHALL keep the current step fully in view with a 24 px margin whenever the step fits at the framing zoom, without necessarily centring it: at an unchanged zoom it SHALL move by the minimum distance that brings the step inside the central 80 % of the view, and when the zoom changes it SHALL centre the step before applying the limits. User moves SHALL NOT be limited, and the fitted overview at step 0 SHALL NOT change. Moves SHALL be animated as *Smooth, bounded camera motion* describes and cut under reduced motion.

**Constraints:**
- Canvas visible beyond the drawing's edge on an axis larger than the view: at most 24 px
- Step margin inside the view: 24 px

#### Scenario: Framing axis matrix

| # | Drawing at the framing zoom on the axis | Step before the limit is applied | View on that axis | Step |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Fits within the view less 48 px | *Any* | **Drawing centred** | **Fully visible** |
| R2 | Larger than the view less 48 px | Near the drawing's start edge | **Drawing's start edge 24 px inside the view's start edge** | **Fully visible with a 24 px margin** |
| R3 | Larger than the view less 48 px | Near the drawing's end edge | **Drawing's end edge 24 px inside the view's end edge** | **Fully visible with a 24 px margin** |
| R4 | Larger than the view less 48 px | Inside the central 80 % of the view | **Unmoved** | **Fully visible, not re-centred** |
| R5 | Larger than the view less 48 px | Outside the central 80 %, away from the drawing's edges | **Minimum pan that brings the step inside the central 80 %** | **Fully visible with a 24 px margin** |

#### Scenario: Last step of a large flowchart
- **GIVEN** a Mermaid-rendered flowchart 3000 × 2400 px drawn in `follow` mode at session zoom 100 % in a view 1700 × 1250 px
- **WHEN** playback reaches the last step, an edge that fits at 100 % and ends at the drawing's bottom-right node
- **THEN** the percentage reads 100 %, the drawing's right and bottom edges are 24 px inside the view's right and bottom edges, and the edge is fully visible

## MODIFIED Requirements

### Requirement: Camera modes
`mermaidAnimator.camera.mode` SHALL accept `auto` (default), `fit`, `follow`, `cinematic` and `manual`: `fit` frames the whole diagram and never moves during playback; `follow` frames each step at the session zoom (see *Session play zoom*), adjusted only by *Wide-step zoom-out*, and at an unchanged zoom moves only when the current step's bounds leave the central 80% of the viewport, by the minimum distance that brings them back with 24 px padding, always ending on the drawing (see *Framing stays on the drawing*); `cinematic` frames each step tightly (sender, receiver and label, or the participants named by `@focus`, with 48 px padding) and glides between steps within the zoom limits; `manual` never moves on its own; `auto` behaves as `fit` when the whole diagram fits at 0.75× zoom or more, otherwise as `follow`. In presentation mode the camera SHALL frame steps as `follow` does, at the presentation session zoom, whatever the configured mode (see presentation-mode *Presentation layout*).

#### Scenario: Follow on a long diagram
- **WHEN** the mode is `follow` and the next step lies below the viewport
- **THEN** the camera pans so the step is inside the viewport before its arrow starts drawing

#### Scenario: Cinematic framing
- **WHEN** the mode is `cinematic` and playback moves to a message between adjacent participants
- **THEN** the camera frames that message and its label with 48 px padding before the arrow starts drawing, changing zoom by at most 1.6×

### Requirement: Smooth, bounded camera motion
Automatic camera transitions SHALL use smooth zoom interpolation with durations between 320 ms and 900 ms divided by the speed, SHALL NOT change zoom by more than 1.6× in one step, and under reduced motion SHALL cut instead of animating. The 1.6× limit SHALL NOT apply to a following camera's move to the session zoom, to a *Wide-step zoom-out* or back from it, or to leaving the step-0 overview.

#### Scenario: Reduced motion
- **WHEN** reduced motion is active and the camera must move
- **THEN** the view changes without an animated pan

#### Scenario: Presentation zoom-out past the 1.6× limit
- **GIVEN** presentation mode at session zoom 150 %, where the next step does not fit at 75 %
- **WHEN** the presenter presses `→`
- **THEN** the camera moves to 75 % in one animated move of 320–900 ms before the step draws

### Requirement: Following survives user camera moves
A user pan, scroll, zoom or minimap move while the camera mode is `follow` or `cinematic` SHALL NOT turn following off and SHALL NOT show a *Resume following* chip. The follow toggle (`C` or the toolbar eye button) SHALL be the only control that turns following off or on, and its pressed state SHALL change only when it is used. After a user camera move, the camera SHALL stay where the user left it until playback next moves to a step. At that point it SHALL frame that step using the zoom level the user left: `follow` frames it at the session zoom, which a user zoom sets to the zoom the user left (see *Session play zoom*), subject to *Wide-step zoom-out*, and `cinematic` starts from it within its usual zoom limits. A user move that interrupts an automatic camera move SHALL cancel it and release any playback wait for the camera.

#### Scenario: User zooms while following
- **WHEN** following is on, playback is paused at step 4, and the user zooms in to 200 % and pans away
- **THEN** the follow button stays pressed, no chip appears, and the camera stays where the user left it

#### Scenario: Next step after a user zoom
- **WHEN** following is on, the user has zoomed to 200 % and panned away from step 4, and then presses `→`
- **THEN** the camera moves to frame step 5 at 200 % before its arrow draws

#### Scenario: Turning following off
- **WHEN** following is on and the user presses `C`
- **THEN** following turns off, the follow button is no longer pressed, and the camera no longer moves on its own

#### Scenario: Pan only keeps the session zoom
- **GIVEN** following is on at session zoom 100 %, and step 4 was framed at 80 % by a *Wide-step zoom-out*
- **WHEN** the user pans away without zooming and then presses `→`, and step 5 fits at 100 %
- **THEN** the camera frames step 5 at 100 %
