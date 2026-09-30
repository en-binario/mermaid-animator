## ADDED Requirements

### Requirement: Theme change request
The webview SHALL send `theme/set` with the chosen `mode` when the user chooses an unchecked item in the toolbar theme
menu. The host SHALL validate the message like any other: `mode` SHALL be one of `auto`, `ivory`, `graphite`,
`highContrast` and `monochrome`. For a valid message, the host SHALL write `mermaidAnimator.theme.mode` (see
`visual-theme` :: *Toolbar theme menu*), and every open panel SHALL receive the resulting `settings/changed`. An invalid
message SHALL be ignored and logged, and the setting SHALL be unchanged. The host SHALL ignore any other payload field
and SHALL NOT write any other setting in response to `theme/set`. Every `settings/changed` and `init` message SHALL
accept `themeMode` `monochrome`.

#### Scenario: Theme change message matrix

| # | `theme.mode` before | webview → host `theme/set` payload | `theme.mode` after | host → webview `settings/changed` to each open panel | Output channel |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `auto` | `{ "mode": "neon" }` | **`auto`** | **Not sent** | **`Ignored invalid webview message: theme/set payload.mode: expected one of auto, ivory, graphite, highContrast, monochrome`** |
| R2 | `auto` | `{}` | **`auto`** | **Not sent** | **`Ignored invalid webview message: theme/set payload.mode: expected one of auto, ivory, graphite, highContrast, monochrome`** |
| R3 | `auto` | `{ "mode": "monochrome" }` | **`monochrome`** | **Sent, with `themeMode: "monochrome"`** | **Nothing logged** |
| R4 | `auto` | `{ "mode": "ivory", "key": "workbench.colorTheme" }` | **`ivory`** | **Sent, with `themeMode: "ivory"`** | **Nothing logged; `workbench.colorTheme` unchanged** |
