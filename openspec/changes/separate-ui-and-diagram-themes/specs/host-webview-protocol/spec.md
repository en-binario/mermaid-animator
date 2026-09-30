## ADDED Requirements

### Requirement: Diagram theme change request
The webview SHALL send `theme/set` with the chosen `theme` when the user chooses an unchecked item in the toolbar
diagram theme menu. The host SHALL validate the message like any other: `theme` SHALL be one of the 16
`mermaidAnimator.theme.diagram` values (see `visual-theme` :: *Diagram theme selection*). For a valid message, the host
SHALL write `mermaidAnimator.theme.diagram` (see `visual-theme` :: *Toolbar diagram theme menu*), and every open panel
SHALL receive the resulting `settings/changed`. An invalid message SHALL be ignored and logged, and no setting SHALL
change. The host SHALL ignore any other payload field, and SHALL NOT write `mermaidAnimator.theme.ui` or any other
setting in response to `theme/set`. Every `init` and `settings/changed` message SHALL carry the effective diagram theme
as `diagramTheme` and the UI theme as `uiTheme`, resolved by the host (with `theme.mode` in place of an unset
`theme.diagram`, and an unknown value replaced by the default).

> **Supersedes:** Theme change request

#### Scenario: Diagram theme change message matrix

| # | `theme.diagram` before | webview → host `theme/set` payload | `theme.diagram` after | host → webview `settings/changed` to each open panel | Output channel |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Not set | `{ "theme": "sepia" }` | **Not set** | **Not sent** | **`Ignored invalid webview message: theme/set payload.theme: expected one of auto, ivory, graphite, highContrast, monochrome, default, neutral, dark, forest, base, neo, neo-dark, redux, redux-dark, redux-color, redux-dark-color`** |
| R2 | Not set | `{ "mode": "monochrome" }` (the old payload) | **Not set** | **Not sent** | **`Ignored invalid webview message: theme/set payload.theme: expected one of auto, ivory, graphite, highContrast, monochrome, default, neutral, dark, forest, base, neo, neo-dark, redux, redux-dark, redux-color, redux-dark-color`** |
| R3 | Not set | `{ "theme": "forest" }` | **`forest`** | **Sent, with `diagramTheme: "forest"`** | **Nothing logged** |
| R4 | `auto` | `{ "theme": "monochrome", "ui": "graphite" }` | **`monochrome`** | **Sent, with `diagramTheme: "monochrome"` and `uiTheme` unchanged** | **Nothing logged; `theme.ui` unchanged** |

#### Scenario: Settings carry both themes
- **GIVEN** `theme.ui` is not set, `theme.diagram` is not set and the deprecated `theme.mode` is `graphite`
- **WHEN** a panel opens
- **THEN** its `init` message carries `uiTheme: "vscode"` and `diagramTheme: "graphite"`

## REMOVED Requirements

### Requirement: Theme change request
**Reason**: Superseded by *Diagram theme change request*: the payload names a diagram theme (`theme`, 16 values), and
the host writes `mermaidAnimator.theme.diagram` instead of `theme.mode`.
**Migration**: None for users; the webview and host ship together.
