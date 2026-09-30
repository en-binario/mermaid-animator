## MODIFIED Requirements

### Requirement: Theme mode selection
The setting `mermaidAnimator.theme.mode` SHALL accept `auto` (default), `ivory`, `graphite`, `highContrast` and `monochrome`; `auto` SHALL select Ivory for light editor themes, Graphite for dark themes and the matching high-contrast variant for high-contrast themes. `ivory`, `graphite` and `monochrome` SHALL select their palette for every editor colour theme, and `highContrast` SHALL select Ivory high contrast for light and high-contrast-light editor themes and Graphite high contrast otherwise.

#### Scenario: Auto follows a dark theme
- **WHEN** the theme mode is `auto` and the editor uses a dark colour theme
- **THEN** the panel renders with the Graphite palette

#### Scenario: Fixed palette
- **WHEN** the theme mode is `ivory` and the editor uses a dark colour theme
- **THEN** the panel renders with the Ivory palette

#### Scenario: Theme mode matrix

| # | `theme.mode` | Editor colour theme | Panel palette |
| :--- | :--- | :--- | :--- |
| R1 | `auto` | Light | **Ivory** |
| R2 | `auto` | Dark | **Graphite** |
| R3 | `auto` | High contrast light | **Ivory high contrast** |
| R4 | `auto` | High contrast (dark) | **Graphite high contrast** |
| R5 | `ivory` | *Any* | **Ivory** |
| R6 | `graphite` | *Any* | **Graphite** |
| R7 | `highContrast` | Light or high contrast light | **Ivory high contrast** |
| R8 | `highContrast` | Dark or high contrast (dark) | **Graphite high contrast** |
| R9 | `monochrome` | *Any* | **Monochrome** |

## ADDED Requirements

### Requirement: Toolbar theme menu
The panel toolbar SHALL show a *Theme* button directly before the keyboard-shortcuts button. The button SHALL be enabled
whether or not a diagram is loaded. Activating it SHALL open a menu of radio items, one per `mermaidAnimator.theme.mode`
value, with the item of the effective value checked and focused. Choosing an item that is not checked SHALL write its
value to `mermaidAnimator.theme.mode`: to the workspace settings when the workspace settings define the key, and to the
user settings otherwise. Every open animator panel SHALL then switch to the resulting palette without reloading and
without losing its playback state. Choosing the checked item SHALL write nothing. The menu SHALL close after a choice,
on `Escape` and on a click outside it, and focus SHALL return to the *Theme* button. When the setting cannot be written,
the panel SHALL keep its palette, and the host SHALL show the error notification
*Could not change the Mermaid Animator theme: <reason>*.

**Constraints:**
- Button label and tooltip: *Theme*
- Items, in order: *Follow editor theme* (`auto`), *Ivory* (`ivory`), *Graphite* (`graphite`), *High contrast*
  (`highContrast`), *Monochrome* (`monochrome`)
- Keyboard: `ArrowDown` / `ArrowUp` move focus and wrap, `Home` / `End` go to the first / last item, `Enter` or `Space`
  chooses, `Escape` closes without a change

#### Scenario: Theme menu choice matrix

| # | Item chosen | Checked before | Workspace settings define `theme.mode` | Value written | Written to |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | *Any* | The chosen item | *Any* | **Nothing** | **Nothing** |
| R2 | *Follow editor theme* | Another item | No | **`auto`** | **User settings** |
| R3 | *Ivory* | Another item | No | **`ivory`** | **User settings** |
| R4 | *Graphite* | Another item | No | **`graphite`** | **User settings** |
| R5 | *High contrast* | Another item | No | **`highContrast`** | **User settings** |
| R6 | *Monochrome* | Another item | No | **`monochrome`** | **User settings** |
| R7 | *Any* | Another item | Yes | **The item's value** | **Workspace settings** |

#### Scenario: Menu opens on the effective mode
- **GIVEN** `mermaidAnimator.theme.mode` is `graphite`
- **WHEN** the user activates the *Theme* button
- **THEN** the menu shows the five items in order, *Graphite* has `aria-checked="true"` and has focus

#### Scenario: All open panels switch
- **GIVEN** two animator panels are open, the first at step 4 of 9 and paused, and `theme.mode` is `auto` with a dark editor theme
- **WHEN** the user chooses *Monochrome* in the second panel's theme menu
- **THEN** both panels show the Monochrome palette, the first panel is still at step 4 of 9 and paused, and the menu is closed with focus on the *Theme* button

#### Scenario: Escape closes without a change
- **GIVEN** the theme menu is open with *Follow editor theme* checked
- **WHEN** the user moves focus to *Ivory* and presses `Escape`
- **THEN** the menu is closed, focus is on the *Theme* button, and `theme.mode` is still `auto`

#### Scenario: Setting cannot be written
- **GIVEN** writing the user settings fails with `Unable to write into user settings because the file has unsaved changes.`
- **WHEN** the user chooses *Monochrome* in the theme menu
- **THEN** the panel keeps its palette and the host shows *Could not change the Mermaid Animator theme: Unable to write into user settings because the file has unsaved changes.*

### Requirement: Monochrome palette
The Monochrome palette SHALL draw every text, line, arrowhead, border and divider in black (`#000000`), and the canvas
and every fill in white (`#FFFFFF`), in the panel and in every export drawn in Monochrome. No other colour SHALL appear
in the drawing. This SHALL include colours the diagram source sets (Mermaid `style`, `classDef`, `linkStyle`,
`rect rgb(…)` / `rect rgba(…)`, `box` colours and `%%{init}%%` theme variables): an author fill SHALL become `#FFFFFF`
and an author stroke or text colour SHALL become `#000000`. Groupings, headers, activation bars and pie slices SHALL be
told apart by their black borders only. Solid ink marks, which are arrowheads, state start points, fork and join bars and
commit bullets, SHALL be filled `#000000`; every other fill SHALL be `#FFFFFF`, including an author fill of any colour,
black included. The current step SHALL be marked by stroke only, black at the active stroke width. De-emphasised elements (muted or unplayed) SHALL differ from emphasised ones only by opacity and stroke width.
Monochrome text and lines SHALL carry no casing; a text knockout, where one is drawn, SHALL be `#FFFFFF`.

> **Supersedes:** `export-theme` :: Monochrome palette

**Constraints:**
- Ink: `#000000`
- Canvas and every fill: `#FFFFFF`
- Contrast: every text colour is `#000000` on `#FFFFFF` (21:1)
- Background *Theme* of a Monochrome export: `#FFFFFF`

#### Scenario: Monochrome element colour matrix

| # | Element | Fill | Stroke | Text |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Canvas, and export background *Theme* | **`#FFFFFF`** | ***N/A*** | ***N/A*** |
| R2 | Sequence participant box, flowchart node, state, class box, topology node, ER entity header and attribute row | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R3 | Sequence `box` group, fragment keyword tab, flowchart subgraph, topology cluster | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R4 | Activation bar | **`#FFFFFF`** | **`#000000`** | ***N/A*** |
| R5 | Current-step highlight | **None** | **`#000000` at the active stroke width** | ***N/A*** |
| R6 | Message line, edge, relationship line, lifeline | ***N/A*** | **`#000000`** | **`#000000`** |
| R7 | Arrowhead, state start point, fork and join bar, commit bullet | **`#000000`** | **`#000000`** | ***N/A*** |
| R8 | Note, edge-label background, topology edge badge | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R9 | Pie slice and pie legend swatch | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R10 | Burnt-in caption, title card, step counter, transport | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R11 | Sequence `rect` region | **`#FFFFFF`** | **None** | ***N/A*** |

#### Scenario: Author colour matrix

| # | Source (Mermaid-rendered flowchart or sequence diagram) | Fill | Stroke | Text |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `style A fill:#f9f,stroke:#333,color:#c00` | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R2 | `classDef hot fill:#ffdddd,stroke:#cc0000` applied to node `B` | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R3 | `linkStyle 0 stroke:#ff3,stroke-width:4px` | ***N/A*** | **`#000000` at 4 px** | ***N/A*** |
| R4 | `rect rgb(200, 150, 255)` around two messages | **`#FFFFFF`** | **None** | ***N/A*** |
| R5 | `box Aqua Backend` around two participants | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R6 | `%%{init: {'themeVariables': {'primaryColor': '#ff0000'}}}%%` | **`#FFFFFF`** | **`#000000`** | **`#000000`** |
| R7 | `style A fill:#000,color:#fff` | **`#FFFFFF`** | **`#000000`** | **`#000000`** |

#### Scenario: Only palette colours
- **WHEN** the panel shows a flowchart with `classDef` colours in the Monochrome palette, and the same flowchart is exported as SVG with theme *Monochrome*
- **THEN** every `fill` and `stroke` value in the panel's drawing and in the SVG is `#000000`, `#FFFFFF`, `none` or `transparent`

#### Scenario: Monochrome text contrast
- **WHEN** the contrast of every Monochrome text colour is computed against every Monochrome fill
- **THEN** every ratio is 21:1

### Requirement: Monochrome panel controls
While the panel shows the Monochrome palette, pressed toolbar buttons, checked menu items and checked segmented items
SHALL be drawn inverted, with a `#000000` background and a `#FFFFFF` icon and text, and all other panel controls SHALL
have a `#FFFFFF` background with `#000000` icons, text and borders.

#### Scenario: Pressed and checked controls in Monochrome

| # | Control | State | Background | Icon and text |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Toolbar button (Follow, Search, Transcript, Inspector, Present) | Pressed | **`#000000`** | **`#FFFFFF`** |
| R2 | Toolbar button | Not pressed | **`#FFFFFF`** | **`#000000`** |
| R3 | Menu item (theme, zoom, speed) | Checked | **`#000000`** | **`#FFFFFF`** |
| R4 | Menu item | Not checked | **`#FFFFFF`** | **`#000000`** |
| R5 | View switcher segment | Checked | **`#000000`** | **`#FFFFFF`** |
| R6 | View switcher segment | Not checked | **`#FFFFFF`** | **`#000000`** |
