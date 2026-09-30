## ADDED Requirements

### Requirement: UI theme selection
The setting `mermaidAnimator.theme.ui` SHALL accept `vscode` (default), `ivory`, `graphite` and `highContrast`, and SHALL
set the colours of the panel's controls only: the toolbar, its menus and popovers, the inspector, the transcript, the
transport, the export sheet, banners, notices, tooltips, dialogs and the caption strip. With `vscode`, the controls
SHALL use the editor's own theme colours. With `ivory` or `graphite`, they SHALL use that Ink & Ivory palette. With
`highContrast`, they SHALL use Ivory high contrast for light and high-contrast-light editor themes and Graphite high
contrast otherwise. A value outside the list SHALL be treated as `vscode`. The UI theme SHALL be set only through
Settings: no control in the panel changes it. The UI theme SHALL NOT change the drawing, its canvas background or the
minimap drawing.

**Constraints:**
- `vscode` colours, as VS Code theme colour ids: panel and toolbar background `editor.background`; text
  `foreground`; secondary text `descriptionForeground`; borders and rules `panel.border`; menus and popovers
  `menu.background`, `menu.foreground` and `menu.selectionBackground`; pressed toggles and checked items
  `inputOption.activeBackground`, `inputOption.activeForeground` and `inputOption.activeBorder`; focus ring
  `focusBorder`

#### Scenario: UI theme matrix

| # | `theme.ui` | Editor colour theme | Controls drawn with |
| :--- | :--- | :--- | :--- |
| R1 | `neon` (outside the list) | *Any* | **The editor's theme colours** |
| R2 | `vscode` (default) | *Any* | **The editor's theme colours** |
| R3 | `ivory` | *Any* | **Ivory** |
| R4 | `graphite` | *Any* | **Graphite** |
| R5 | `highContrast` | Light or high contrast light | **Ivory high contrast** |
| R6 | `highContrast` | Dark or high contrast (dark) | **Graphite high contrast** |

#### Scenario: Controls follow the editor theme
- **GIVEN** `theme.ui` is `vscode` and the editor theme sets `editor.background` to `#1F1F1F` and `inputOption.activeBackground` to `#2489DB82`
- **WHEN** the panel is open with the Inspector shown
- **THEN** the toolbar background is `#1F1F1F` and the pressed Inspector button background is `#2489DB82`

#### Scenario: UI theme does not change the drawing
- **GIVEN** `theme.diagram` is `monochrome` and the panel shows a sequence diagram
- **WHEN** the user changes `theme.ui` from `vscode` to `graphite`
- **THEN** the toolbar background becomes `#1A1D21` (Graphite `surface`), and the canvas background stays `#FFFFFF` with every participant box filled `#FFFFFF`

### Requirement: Diagram theme selection
The setting `mermaidAnimator.theme.diagram` (default `auto`) SHALL accept the Ink & Ivory themes `auto`, `ivory`,
`graphite` and `highContrast`, the Mermaid themes `default`, `neutral`, `dark`, `forest`, `base`, `neo`, `neo-dark`,
`redux`, `redux-dark`, `redux-color` and `redux-dark-color`, and the custom theme `monochrome`. The diagram theme SHALL
set the colours of the drawing, its canvas background and the minimap drawing, and of exports whose theme is
*Current*. It SHALL NOT change the controls. `auto` SHALL select Ivory for light editor themes, Graphite for dark
themes and the matching high-contrast variant for high-contrast themes. `highContrast` SHALL select Ivory high contrast
for light and high-contrast-light editor themes and Graphite high contrast otherwise. Every other value SHALL select its
theme for every editor colour theme. When `theme.diagram` is not set in any settings scope, the deprecated setting
`mermaidAnimator.theme.mode` SHALL be used in its place. A value outside the list SHALL be treated as `auto`.
Mermaid-rendered diagrams SHALL be rendered with the selected Mermaid theme. A theme set by the diagram itself (a
`%%{init}%%` directive or frontmatter `config.theme`) SHALL win for that diagram, except under `monochrome` (see
*Monochrome palette*).

> **Supersedes:** Theme mode selection

#### Scenario: Diagram theme matrix

| # | `theme.diagram` | `theme.mode` (deprecated) | Editor colour theme | Drawing palette |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `sepia` (outside the list) | *Any* | Light | **Ivory** |
| R2 | Not set | Not set | Light | **Ivory** |
| R3 | Not set | Not set | Dark | **Graphite** |
| R4 | Not set | Not set | High contrast light | **Ivory high contrast** |
| R5 | Not set | Not set | High contrast (dark) | **Graphite high contrast** |
| R6 | Not set | `monochrome` | *Any* | **Monochrome** |
| R7 | Not set | `graphite` | Light | **Graphite** |
| R8 | `forest` | `monochrome` | *Any* | **Mermaid `forest`** |
| R9 | `ivory` | Not set | Dark | **Ivory** |
| R10 | `graphite` | Not set | Light | **Graphite** |
| R11 | `highContrast` | Not set | Light or high contrast light | **Ivory high contrast** |
| R12 | `highContrast` | Not set | Dark or high contrast (dark) | **Graphite high contrast** |
| R13 | `monochrome` | Not set | *Any* | **Monochrome** |
| R14 | Any Mermaid theme name (`default` … `redux-dark-color`) | Not set | *Any* | **That Mermaid theme** |

#### Scenario: Diagram theme does not change the controls
- **GIVEN** `theme.ui` is `ivory`
- **WHEN** the user sets `theme.diagram` to `dark`
- **THEN** the canvas background becomes `#333333` and the toolbar background stays `#FFFFFF` (Ivory `surface`)

#### Scenario: A diagram's own theme wins
- **GIVEN** `theme.diagram` is `forest` and a flowchart starts with `%%{init: {'theme': 'neutral'}}%%`
- **WHEN** the panel shows it
- **THEN** its nodes have the fill `#EEEEEE`, as in Mermaid's `neutral` theme

### Requirement: Mermaid theme palettes
When the diagram theme is a Mermaid theme, diagrams the extension draws itself (sequence diagrams and the topology view)
SHALL take their colours from that theme's variables in the pinned Mermaid version, so that they match Mermaid-rendered
diagrams in the same theme. Diagrams the extension draws SHALL NOT load Mermaid to obtain these colours. The mapping
SHALL keep the current step and note text legible: the highlight colour SHALL reach at least 3:1 against the canvas,
and note text SHALL reach at least 4.5:1 against the note fill. Ink & Ivory and Monochrome keep their own palettes and
their 4.5:1 text guarantee (*Colour token palettes*, *Monochrome palette*). Mermaid themes keep Mermaid's own text
colours.

**Constraints:**
- Canvas: `background`
- Participant, node and box fill: `actorBkg`; grouping fill: `labelBoxBkgColor`
- Borders and lifelines: `actorBorder`
- Text: `actorTextColor`; message lines and labels: `signalColor`
- Activation fill: `activationBkgColor`
- Notes: `noteBkgColor` and `noteBorderColor`; when `actorTextColor` on `noteBkgColor` is below 4.5:1, the note fill is the participant fill
- Current-step highlight: the first of `actorBorder`, `primaryBorderColor` and `signalColor` that reaches 3:1 against the canvas, otherwise `actorTextColor`
- Emphasis, critical and success colours (`brass`, `sage`, `crimson`, `viridian`): Ivory's for a canvas with relative luminance ≥ 0.5, Graphite's otherwise
- Mermaid colour values (`white`, `lightgrey`, `hsl(…)`, 3-digit hex) are resolved to `#RRGGBB`

#### Scenario: Mermaid theme palette matrix

| # | Diagram theme | Canvas | Participant fill | Participant border | Text | Message line | Current-step highlight | Note fill |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `default` | **`#FFFFFF`** | **`#ECECFF`** | **`#9370DB`** | **`#000000`** | **`#333333`** | **`#9370DB`** | **`#FFF5AD`** |
| R2 | `neutral` | **`#FFFFFF`** | **`#EEEEEE`** | **`#D4D4D4`** | **`#333333`** | **`#333333`** | **`#333333`** | **`#EEEEEE`** |
| R3 | `dark` | **`#333333`** | **`#1F2020`** | **`#CCCCCC`** | **`#D3D3D3`** | **`#D3D3D3`** | **`#CCCCCC`** | **`#474949`** |
| R4 | `forest` | **`#FFFFFF`** | **`#CDE498`** | **`#A6CF47`** | **`#000000`** | **`#333333`** | **`#333333`** | **`#FFF5AD`** |

#### Scenario: Native and Mermaid-rendered diagrams match
- **GIVEN** `theme.diagram` is `forest`
- **WHEN** the panel shows a sequence diagram and then a flowchart
- **THEN** the sequence diagram's participant boxes and the flowchart's nodes both have the fill `#CDE498`, on a `#FFFFFF` canvas

### Requirement: Live theme changes
Changes to the editor colour theme, `mermaidAnimator.theme.ui`, `mermaidAnimator.theme.diagram` or the deprecated
`mermaidAnimator.theme.mode` SHALL be applied to open panels without reloading them and without changing the playback
position, the view or the camera. A change SHALL switch only the theme it affects.

> **Supersedes:** Live theme switching

#### Scenario: Live theme change matrix

| # | Change | `theme.ui` | `theme.diagram` | Controls | Drawing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `theme.ui` `vscode` → `graphite` | *N/A* | *Any* | **Switch to Graphite** | **Unchanged** |
| R2 | `theme.diagram` `auto` → `forest` | *Any* | *N/A* | **Unchanged** | **Switch to Mermaid `forest`** |
| R3 | Editor theme light → dark | `vscode` | `auto` | **Switch to the new editor colours** | **Switch to Graphite** |
| R4 | Editor theme light → dark | `ivory` | `forest` | **Unchanged** | **Unchanged** |
| R5 | `theme.mode` `auto` → `monochrome` | *Any* | Not set | **Unchanged** | **Switch to Monochrome** |
| R6 | `theme.mode` `auto` → `monochrome` | *Any* | `forest` | **Unchanged** | **Unchanged** |

#### Scenario: Playback position survives a theme change
- **GIVEN** a panel is paused at step 4 of 9
- **WHEN** the user changes `theme.diagram` from `auto` to `dark`
- **THEN** the panel shows the `dark` theme and is still paused at step 4 of 9

### Requirement: Toolbar diagram theme menu
The panel toolbar SHALL show a *Diagram theme* button directly before the keyboard-shortcuts button. The button SHALL
be enabled whether or not a diagram is loaded. Activating it SHALL open a menu of radio items, one per
`mermaidAnimator.theme.diagram` value, in three groups separated by rules. The item of the effective diagram theme
(including a value that comes from the deprecated `theme.mode`) SHALL be checked and focused. Choosing an item that is
not checked SHALL write its value to `mermaidAnimator.theme.diagram`: to the workspace settings when the workspace
settings define `theme.diagram` or `theme.mode`, and to the user settings otherwise. Every open animator panel SHALL
then switch its drawing without reloading and without losing its playback state. The menu SHALL NOT change
`mermaidAnimator.theme.ui` or the controls' colours. Choosing the checked item SHALL write nothing. The menu SHALL close
after a choice, on `Escape` and on a click outside it, and focus SHALL return to the *Diagram theme* button. When the
setting cannot be written, the drawing SHALL keep its theme, and the host SHALL show the error notification
*Could not change the Mermaid Animator diagram theme: <reason>*.

> **Supersedes:** Toolbar theme menu

**Constraints:**
- Button label and tooltip: *Diagram theme*
- Group 1, Ink & Ivory: *Follow editor theme* (`auto`), *Ivory* (`ivory`), *Graphite* (`graphite`), *High contrast* (`highContrast`)
- Group 2, Mermaid: *Default* (`default`), *Neutral* (`neutral`), *Dark* (`dark`), *Forest* (`forest`), *Base* (`base`),
  *Neo* (`neo`), *Neo dark* (`neo-dark`), *Redux* (`redux`), *Redux dark* (`redux-dark`), *Redux color*
  (`redux-color`), *Redux dark color* (`redux-dark-color`)
- Group 3, Custom: *Monochrome* (`monochrome`)
- Keyboard: `ArrowDown` / `ArrowUp` move focus across groups and wrap, `Home` / `End` go to the first / last item,
  `Enter` or `Space` chooses, `Escape` closes without a change

#### Scenario: Diagram theme menu choice matrix

| # | Item chosen | Checked before | Workspace settings define | Value written to `theme.diagram` | Written to |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | *Any* | The chosen item | *Any* | **Nothing** | **Nothing** |
| R2 | *Forest* | Another item | Neither `theme.diagram` nor `theme.mode` | **`forest`** | **User settings** |
| R3 | *Monochrome* | Another item | Neither `theme.diagram` nor `theme.mode` | **`monochrome`** | **User settings** |
| R4 | *Follow editor theme* | Another item | Neither `theme.diagram` nor `theme.mode` | **`auto`** | **User settings** |
| R5 | *Any* | Another item | `theme.diagram` | **The item's value** | **Workspace settings** |
| R6 | *Any* | Another item | `theme.mode` only | **The item's value** | **Workspace settings** |

#### Scenario: Menu opens on the effective diagram theme
- **GIVEN** `theme.diagram` is not set and the deprecated `theme.mode` is `graphite`
- **WHEN** the user activates the *Diagram theme* button
- **THEN** the menu shows the 16 items in three groups, and *Graphite* has `aria-checked="true"` and has focus

#### Scenario: All open panels switch their drawing
- **GIVEN** two animator panels are open, the first at step 4 of 9 and paused, with `theme.ui` `vscode` and `theme.diagram` `auto` in a dark editor theme
- **WHEN** the user chooses *Forest* in the second panel's diagram theme menu
- **THEN** both panels draw with Mermaid's `forest` theme on a `#FFFFFF` canvas, the first panel is still at step 4 of 9 and paused, and both toolbars keep the editor's `editor.background`

#### Scenario: Escape closes the diagram theme menu without a change
- **GIVEN** the diagram theme menu is open with *Follow editor theme* checked
- **WHEN** the user moves focus to *Dark* and presses `Escape`
- **THEN** the menu is closed, focus is on the *Diagram theme* button, and `theme.diagram` is unchanged

#### Scenario: Diagram theme cannot be written
- **GIVEN** writing the user settings fails with `Unable to write into user settings because the file has unsaved changes.`
- **WHEN** the user chooses *Forest* in the diagram theme menu
- **THEN** the drawing keeps its theme and the host shows *Could not change the Mermaid Animator diagram theme: Unable to write into user settings because the file has unsaved changes.*

## MODIFIED Requirements

### Requirement: High-contrast adaptation
In high-contrast variants, borders SHALL be at least 2 px, dimming SHALL NOT rely on opacity alone, and focus indicators SHALL use the editor's contrast border colour. For the controls, a high-contrast variant is `theme.ui` `highContrast`, or `theme.ui` `vscode` with a high-contrast editor theme. For the drawing, it is a diagram theme that resolves to Ivory high contrast or Graphite high contrast.

#### Scenario: High-contrast borders
- **WHEN** the editor uses a high-contrast theme
- **THEN** interactive element borders render at 2 px or wider using the contrast border colour

#### Scenario: High-contrast adaptation matrix

| # | `theme.ui` | `theme.diagram` | Editor colour theme | Control borders | Drawing dimming |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `vscode` | `auto` | High contrast (dark) | **2 px, `contrastBorder`** | **Graphite high contrast: dimmed lines dotted (`stroke-dasharray: 1 3`) at full opacity** |
| R2 | `vscode` | `forest` | High contrast (dark) | **2 px, `contrastBorder`** | **Mermaid `forest`: opacity only** |
| R3 | `graphite` | `auto` | High contrast (dark) | **1 px, Graphite `rule`** | **Graphite high contrast: dimmed lines dotted (`stroke-dasharray: 1 3`) at full opacity** |
| R4 | `highContrast` | `ivory` | Light | **2 px, Ivory high contrast `rule`** | **Ivory: opacity only** |
| R5 | `vscode` | `auto` | Dark | **1 px, `panel.border`** | **Graphite: opacity only** |

## REMOVED Requirements

### Requirement: Theme mode selection
**Reason**: One setting coloured both the controls and the drawing. It is replaced by *UI theme selection*
(`mermaidAnimator.theme.ui`) and *Diagram theme selection* (`mermaidAnimator.theme.diagram`), which also adds the
Mermaid themes.
**Migration**: `mermaidAnimator.theme.mode` keeps working as the diagram theme while `theme.diagram` is not set in any
scope. Replace it with `theme.diagram` using the same value. The controls now follow the editor's theme; set
`theme.ui` to `ivory`, `graphite` or `highContrast` for the previous look.

### Requirement: Live theme switching
**Reason**: Superseded by *Live theme changes*, which covers both themes and the deprecated setting.
**Migration**: None needed; every change that switched a panel before still does.

### Requirement: Toolbar theme menu
**Reason**: Superseded by *Toolbar diagram theme menu*. The button now changes only the diagram theme, lists the Mermaid
themes and writes `theme.diagram`.
**Migration**: None needed. The menu reads a `theme.mode` value as before, and the next choice writes `theme.diagram`.

### Requirement: Monochrome panel controls
**Reason**: The controls follow the UI theme and no longer take the diagram's Monochrome palette, so they keep their
normal pressed and checked styles.
**Migration**: None needed.
