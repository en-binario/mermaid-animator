# Design

## Context

See proposal.md for the motivation. Current state:

| Area | Today |
|---|---|
| Palette selection | `main.tsx` sets `document.documentElement.dataset.palette = resolvePalette(settings.themeMode, themeKind)`. One `--ma-*` token set, from `tokens.css` `[data-palette='…']` blocks, colours the chrome (`styles/app.css`) and the drawing (`renderer/src/diagram.css`) alike |
| Palette readers | `controller.activePalette`, `fallback.ts` `activePalette()`, `export.ts` (background fallback) and `Presentation.tsx` (laser `--ma-brass`) all read `document.documentElement` |
| Chrome high contrast | `app.css` `[data-palette$='-hc'] .ma-button`, `.ma-scrubber__range`, … |
| Drawing high contrast | `diagram.css` `[data-palette$='-hc'] …`: dotted dimmed lines at full opacity |
| DOM | `.ma-canvas` (background `--ma-canvas`) holds `.ma-views` (absolute, inset 0), which holds every drawing: the sequence SVG, the topology SVG and the morph layer. Overlays sit beside it in `.ma-canvas`: banners, captions, tooltip, chapter and title cards |
| Mermaid rendering | `fallback.ts` renders with `theme: 'base'` and `themeVariables(palette)`. Monochrome runs `monochromeColours` after mounting |
| Settings | `theme.mode` → `WebviewSettings.themeMode`. `theme/set { mode }` writes `theme.mode` |
| Mermaid 12.0.0 | Ships `default`, `neutral`, `dark`, `forest`, `base`, `neo`, `neo-dark`, `redux`, `redux-dark`, `redux-color` and `redux-dark-color`. Their variables mix named colours, `hsl()` and 3/6-digit hex, and some resolve only after `initialize({ theme })` |

## Goals / Non-Goals

**Goals:**
- Two token scopes that never leak into each other: the chrome at the document root, and the drawing under
  `.ma-views`.
- Mermaid themes for native drawings without loading Mermaid at runtime, and without per-renderer colour code:
  they become ordinary `PaletteName` entries.
- One pure resolver for each theme, shared by the host, the webview and the tests.

**Non-Goals:**
- Per-diagram themes through the sidecar or `@animator`. A diagram's own Mermaid `%%{init}%%` theme keeps working for
  Mermaid-rendered diagrams only.
- Mermaid `look` (`neo`, `handDrawn`). Only colours change; geometry stays as it is.
- Mermaid themes as explicit export-sheet choices. *Current* covers them.
- Theming the HTML player's own controls separately from its drawing. The player keeps one palette.

## Decisions

### D1. Settings, resolution and protocol

- `package.json` contributions:
  - `mermaidAnimator.theme.ui`: enum `vscode` (default), `ivory`, `graphite` and `highContrast`.
  - `mermaidAnimator.theme.diagram`: enum of 16 values, default `auto`, with `enumItemLabels` for the Mermaid names.
  - `mermaidAnimator.theme.mode`: keeps its enum and gains `markdownDeprecationMessage` ("Use `theme.diagram`").
- `packages/protocol` exports:
  - `DIAGRAM_THEMES` (16, in the menu order) and `UI_THEMES`.
  - `resolveDiagramTheme(diagram: unknown, mode: unknown): DiagramTheme`: the first valid value of `diagram` and
    `mode`, otherwise `auto`.
  - `resolveUiTheme(value: unknown): UiTheme`: the value if valid, otherwise `vscode`.
- `environment.ts` `currentSettings()` passes `diagram` only when `inspect('theme.diagram')` has a user, workspace or
  folder value. That way, an unset `theme.diagram` does not hide `theme.mode` behind its default.
- `WebviewSettings.themeMode` is replaced by `diagramTheme` and `uiTheme`, and the `settings` guard validates both.
  Host and webview ship together, so no compatibility is needed.

*Alternative considered:* keeping `theme.mode` as the diagram key. It was rejected because the name gives no hint that
it now leaves the controls alone, while a sibling `theme.ui` exists. The fallback keeps every existing value working.

### D2. Two token scopes

- The root gets `data-ui` = `vscode`, `ivory`, `graphite`, `ivory-hc` or `graphite-hc`, from
  `uiPalette(uiTheme, themeKind)` in `renderer/src/theme.ts`.
- `tokens.css` turns each Ink & Ivory block into a selector list, for example
  `[data-palette='ivory'], [data-ui='ivory'] { … }`, so the token values stay single-sourced.
- The `data-ui='vscode'` block lives in `webview/src/styles/app.css`, because `--vscode-*` variables exist only in the
  webview. It maps each `--ma-*` token to a `var(--vscode-…, <Ivory fallback>)` (table below). It also adds three
  component rules:
  - pressed buttons and checked items use `inputOption.active{Background,Foreground,Border}`;
  - popovers and menus use `menu.background` / `menu.foreground`, with hover `menu.selectionBackground`;
  - toolbar hover uses `toolbar.hoverBackground`.
- `data-palette` moves from the root to `.ma-views` and to the minimap's drawing element. `.ma-views` gains
  `background: var(--ma-canvas)`, so the canvas colour comes from the diagram theme while the overlays in `.ma-canvas`
  keep the UI tokens.
- Chrome high-contrast rules in `app.css` switch from `[data-palette$='-hc']` to
  `[data-ui$='-hc'], body.vscode-high-contrast, body.vscode-high-contrast-light`. The drawing rules in `diagram.css`
  stay on `[data-palette$='-hc']`, which now matches `.ma-views`.
- One webview signal, `diagramPalette` (computed from host state), replaces every `document.documentElement.dataset.palette`
  read: `controller.activePalette`, `fallback.ts`, `export.ts` and `Presentation.tsx`. The laser reads `--ma-brass` from
  `.ma-views`.

| `--ma-*` token (UI `vscode`) | VS Code colour |
|---|---|
| `canvas`, `surface` | `editor.background` |
| `surface-sunken` | `toolbar.hoverBackground`, else `list.hoverBackground` |
| `hairline`, `rule` | `panel.border`, else `widget.border` |
| `ink-1` / `ink-2` / `ink-3` | `foreground` / `descriptionForeground` / `disabledForeground` |
| `accent` / `accent-muted` | `focusBorder` / `inputOption.activeBackground` |
| `note-fill` / `note-rule` | `editorWidget.background` / `editorWidget.border` |
| `brass` / `sage` / `crimson` / `viridian` | `editorWarning.foreground` / `charts.green` / `errorForeground` / `testing.iconPassed` |

*Alternative considered:* separate `--ma-ui-*` tokens in `app.css`. It was rejected because every chrome rule would be
touched and the palette blocks would be duplicated. Two attribute scopes over one token set give the same isolation.

### D3. Mermaid palettes, generated at build time

- `renderer/src/mermaidPalette.ts` (pure) exports two functions:
  - `toHex(value)`, which parses named colours, `#rgb`, `#rrggbb`, `rgb()` and `hsl()` into `#RRGGBB`;
  - `mermaidPalette(vars)`, which applies the mapping in `visual-theme` :: *Mermaid theme palettes* (the Constraints
    list): the accent contrast pick, the note fallback, and the light/dark borrowing of `brass`, `sage`, `crimson` and
    `viridian` from Ivory or Graphite.
- `scripts/mermaid-themes.mjs` loads Mermaid through `scripts/mermaid-jsdom.mjs`, calls `initialize({ theme })` for
  each of the 11 themes, reads `mermaidAPI.getConfig().themeVariables` and writes two files:
  - `renderer/src/mermaidPalettes.generated.ts`, a `Record<MermaidTheme, Record<ColorToken, string>>` with a header
    naming the Mermaid version;
  - `renderer/src/mermaidPalettes.generated.css`, with `[data-palette='mermaid-<name>']` blocks, imported next to
    `tokens.css`.
- `PaletteName` gains `mermaid-<name>`, `PALETTES` spreads the generated table, and `isHighContrast` is unchanged.
- The canvas renderer, the animated SVG (`themeVars`), `serializeSvg` (host `data-palette`) and the player CSS all pick
  up the Mermaid palettes through the existing `PALETTES` / `data-palette` paths, so there is no per-format code.
- `theme.test.ts` keeps its contrast loops for the Ink & Ivory and Monochrome palettes only. It asserts CSS/TS parity
  for every palette, including the generated ones.
- A sync test next to `packages/core/test/conformance.test.ts` loads Mermaid under jsdom, recomputes the table, and
  compares it with the generated one. A Mermaid bump therefore fails the test until `node scripts/mermaid-themes.mjs`
  runs again.

*Alternative considered:* reading theme variables from Mermaid at runtime. It was rejected for three reasons: it
loads Mermaid (several MB) just to colour a native sequence diagram; the player and the canvas export worker have no
Mermaid; and the result would not be testable without a DOM.

### D4. Mermaid-rendered diagrams in a Mermaid theme

`GenericDiagram.mermaidSvg` receives the diagram theme:

- For `mermaid-<name>`, it calls `initialize({ theme: name, themeVariables: { fontFamily, fontSize } })`. Only the font
  is overridden, so that label measurement matches the native renderer.
- For the Ink & Ivory and Monochrome palettes, it keeps `theme: 'base'` with `themeVariables(palette)`.

Mermaid gives a diagram's own `%%{init}%%` or frontmatter theme precedence over `initialize`, which yields *A diagram's
own theme wins*. Under Monochrome, `monochromeColours` still runs after mounting. The export twin (`renderTwin`)
compares `PaletteName`s as before.

### D5. Toolbar menu

- `themeMenu.ts` becomes a grouped list: `DIAGRAM_THEME_MENU = [{ group, items: [{ theme, label }] }]`, with labels
  `theme.<value>` in `strings.ts` (en and es; Mermaid names stay untranslated).
- `ThemeMenu` renders a `.ma-menu__rule` between groups. `useMenu` already skips non-button children when it moves
  focus, so arrow keys cross the groups.
- The button label becomes `toolbar.diagramTheme` = *Diagram theme*.
- `themeMenuMessage(checked, chosen)` returns `theme/set { theme }`, and `checked` is `settings.diagramTheme`.
- The previous change's Monochrome control CSS block in `app.css` is deleted.

### D6. Host write

`setDiagramTheme(theme)` in `environment.ts` writes to the Workspace target when
`inspect('theme.diagram').workspaceValue` or `inspect('theme.mode').workspaceValue` is defined, and to the Global
target otherwise. On failure it shows `l10n.t('Could not change the Mermaid Animator diagram theme: {0}', reason)`. It
never touches `theme.mode`, so the deprecated value stays in place, shadowed by `theme.diagram` once one is written.

### D7. Harness

The harness `Mode` select is replaced by a *UI theme* and a *Diagram theme* select, and the settings payload sends
`uiTheme` and `diagramTheme`. A `vscode vars` checkbox injects a Dark Modern `--vscode-*` sample on `body`, so the
`vscode` UI theme can be checked outside VS Code. Without it, the Ivory fallbacks apply.

## Risks / Trade-offs

- [Every user's controls change look on update (Ink & Ivory → VS Code colours)] → This is intended. It is a new default, so it is a
  `Changed` entry, not a breaking one (docs/versioning.md R6), and that entry names `theme.ui` for the previous look.
- [A VS Code theme omits a colour we map (for example `toolbar.hoverBackground` in older themes)] → Every `var()`
  has a second VS Code fallback and then an Ivory value. The harness sample covers the chain.
- [A Mermaid bump changes theme colours] → The sync test fails, and the table is regenerated in the same PR as the
  bump.
- [Mermaid theme text colours fall below 4.5:1 on some fills] → These are Mermaid's own choices and are accepted.
  Only the highlight (3:1) and note text (4.5:1) are guarded. The contrast guarantee stays with Ink & Ivory and
  Monochrome.
- [Overlays inside `.ma-canvas` (captions, chapter card) now use UI colours over a diagram-coloured canvas, for example
  `vscode` dark captions on a `forest` white canvas] → They already draw their own opaque surfaces. The harness
  checks legibility for the `vscode` × Mermaid light/dark combinations in *Live theme change matrix*.

## Migration Plan

- There is no data migration. `theme.mode` keeps working through the fallback, and the Settings UI shows its
  deprecation message.
- CHANGELOG entries:
  - `Added`: the Mermaid diagram themes, the diagram theme menu, and `theme.ui` / `theme.diagram`.
  - `Changed`: the controls follow VS Code by default.
  - `Deprecated`: `theme.mode`.
- Rollback means reverting the change. A written `theme.diagram` value is then ignored, as an unknown setting, and
  `theme.mode` applies again.
