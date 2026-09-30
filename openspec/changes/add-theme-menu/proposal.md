# Proposal

## Why

Changing the animator's palette today means leaving the panel, opening Settings and finding
`mermaidAnimator.theme.mode`. Users who switch between a dark editor and a projector, or who check how a diagram will
look in a document, do this often. The formal black-on-white Monochrome palette also exists only for exports
(`add-monochrome-export-theme`), so users cannot preview it in the panel before they export. Its grey header fills and
grey pie ramp also still let colour-like shading through, and colours written in the Mermaid source (`style`,
`classDef`, `rect rgb(…)`) survive in Mermaid-rendered diagrams. Users expect a monochrome drawing to be only black ink
on white.

## What Changes

- New **Theme** button in the panel toolbar, placed before the keyboard-shortcuts and settings buttons. It opens a menu
  with *Follow editor theme*, *Ivory*, *Graphite*, *High contrast* and *Monochrome*. The current mode is checked.
  Choosing an item writes `mermaidAnimator.theme.mode`: to the workspace settings when the workspace already sets it,
  otherwise to the user settings. Every open panel then switches live, as it does today when the setting changes.
- `mermaidAnimator.theme.mode` gains the value `monochrome`. With it, the panel shows the Monochrome palette for any
  editor colour theme.
- **Monochrome becomes pure black on white, in the panel and in every export.** Every fill is `#FFFFFF`, and every line,
  border, arrowhead and text is `#000000`. This drops the `#EDEDED` header and grouping grey and the pie grey ramp that
  `add-monochrome-export-theme` introduced. It also covers colours the author wrote in the Mermaid source: `style`,
  `classDef`, `linkStyle`, `rect rgb(…)`, `box` colours and `%%{init}%%` theme variables. Any author fill becomes white,
  and any author stroke or text colour becomes black.
- In Monochrome, the current step is marked by stroke only: black, at the active stroke width. Pressed toolbar buttons
  and checked menu and segmented items are drawn inverted (black background, white icon and text), because a white
  fill can no longer show state.
- New webview → host message `theme/set` carrying the chosen mode. The host validates it like every other message.
- The export theme *Current* now also yields Monochrome when the panel shows Monochrome.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `visual-theme`: *Theme mode selection* adds `monochrome`. New requirements cover the toolbar theme menu, the
  Monochrome palette (moved here from `export-theme`, since the panel now uses it too, and changed to white-only fills
  that override author colours), and Monochrome panel controls.
- `export-theme`: *Monochrome palette* is removed and superseded by the `visual-theme` requirement.
  *Export theme per format* counts Monochrome among the panel palettes that *Current* yields. *Export theme for
  Mermaid-rendered diagrams* updates the ER scenario to white-only fills and adds author-colour and panel-Monochrome
  scenarios.
- `host-webview-protocol`: new requirement *Theme change request* for the `theme/set` message.

## Impact

- **Ordering:** `export-theme` exists only in the unarchived change `add-monochrome-export-theme`. That change is
  committed and complete, and it has to be archived before this one so the `export-theme` deltas here apply to a synced
  spec. The `export-theme` Purpose still mentions "one light grey" and lists the panel palette as a non-goal. A Purpose
  cannot change through a delta, so it is edited directly after the archive (see tasks).
- `packages/renderer`: `ThemeMode` adds `monochrome`, and `resolvePalette` returns it. The `monochrome` entries of
  `PALETTES`, `tokens.css` and `MONOCHROME_RAMP` become white-only.
- `packages/webview`: the toolbar theme menu (`App.tsx`), the Monochrome control styles (`styles/app.css`), Mermaid
  theme variables and a post-render colour normaliser for author colours (`fallback.ts`), the harness theme-mode select,
  and new localisation strings.
- `packages/protocol`: the `themeMode` validator accepts `monochrome`, plus the new `theme/set` webview message and its
  validator.
- `packages/extension`: `theme.mode` enum and NLS strings (en, es), the `theme/set` handler that writes the setting in
  `panel.ts`, the failure notification string, the README settings table, and a CHANGELOG entry.
- No new dependencies. Mermaid stays at the pinned 12.x.
