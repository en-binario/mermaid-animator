# Design

## Context

`add-monochrome-export-theme` (commit `417f7e5`) added `monochrome` as a `PaletteName` in
`packages/renderer/src/theme.ts` and `tokens.css`, deliberately unreachable from `resolvePalette`. It is export-only and
uses `#EDEDED` for `surface-sunken` and `accent-muted`, plus `MONOCHROME_RAMP` for pie slices. Current state relevant
here:

| Area | Today |
|---|---|
| Panel palette | `main.tsx` sets `document.documentElement.dataset.palette = resolvePalette(settings.themeMode, themeKind)`. The host sends `themeMode` from `mermaidAnimator.theme.mode` in `init` and `settings/changed` (`environment.ts` `currentSettings`). The protocol validator accepts only `auto`, `ivory`, `graphite` and `highContrast` |
| Setting changes | `panel.ts` rebroadcasts `settings/changed` to every panel on any `mermaidAnimator.*` configuration change. `controller.applySettings` rebuilds with `preserve: true` |
| Writing settings from the webview | None. `settings/open` only opens the Settings UI |
| Toolbar menus | `ZoomGroup` in `App.tsx` implements a `role="menu"` popover with `menuitemradio` items, the arrow/Home/End/Escape keys and outside-click close |
| Native diagrams | Colours come only from palette tokens. The parser keeps `box` and `rect` colours (`core/src/sequence/parser.ts`), but no renderer reads them (`.ma-rect-fill` uses `accent-muted`) |
| Mermaid-rendered diagrams | `fallback.ts` renders with `themeVariables(palette, source)`. Author colours (`style`, `classDef`, `linkStyle`, `rect rgb()`, `box` colours, `%%{init}%%`) reach the SVG as inline styles and as `!important` rules in Mermaid's stylesheet, which is adopted as a constructed stylesheet |
| Panel chrome | `styles/app.css` shows pressed and checked states with `--ma-accent-muted` backgrounds and hover with `--ma-surface-sunken` |

## Goals / Non-Goals

**Goals:**
- One palette entry drives Monochrome in the panel, stills, GIF/video, Animated SVG and the player, with no
  per-format colour code (as in `add-monochrome-export-theme` D1).
- Author colours in Mermaid-rendered diagrams are neutralised in one place, applied to both the panel rendering and
  the export twin.
- The theme menu writes the real setting, so the Settings UI, the menu and every panel agree.

**Non-Goals:**
- A command-palette theme picker or a keybinding for the menu.
- Recolouring the editor or other extensions. Only `mermaidAnimator.theme.mode` is written.
- Per-diagram themes: `theme.mode` stays a VS Code setting and does not become a sidecar or `@animator` setting.

## Decisions

### D1. `monochrome` becomes a `ThemeMode`

`ThemeMode` in `packages/renderer/src/theme.ts` and `packages/protocol/src/index.ts` gains `'monochrome'`.
`resolvePalette('monochrome', _)` returns `'monochrome'` for every `ThemeKind`, and the "export-only" comments go. The
protocol `settings` guard becomes `oneOf('auto', 'ivory', 'graphite', 'highContrast', 'monochrome')`, which also covers
`init`. `package.json` adds the enum value with `%config.theme.mode.monochrome%` (en, es). The webview harness select
gains the option. `environment.ts` needs no change because it forwards the raw value.

### D2. White-only Monochrome tokens

In `PALETTES.monochrome` and the `[data-palette='monochrome']` block of `tokens.css`, `surface-sunken` and
`accent-muted` become `#FFFFFF`. Every fill token is then white and every ink token black. `MONOCHROME_RAMP` is
deleted. In `fallback.ts` `themeVariables`, the Monochrome overrides set `pie1`–`pie12` to `c.surface` and drop the ER
`mainBkg` grey, so ER uses the base `mainBkg: c.surface`. `pieStrokeColor`, `pieOuterStrokeColor` and
`pieSectionTextColor` stay ink. The existing `theme.test.ts` contrast loop and CSS/TS parity test cover the new values.
Its `MONOCHROME_RAMP` contrast case becomes the *Monochrome text contrast* scenario (21:1).

The native renderers need no code change. Groupings (`.ma-box-fill`, the fragment tab, activations) already draw a
`hairline`/`rule`/`accent` stroke, which is black in Monochrome. The current-step highlight is an `accent` stroke
overlay (`canvas.ts` `strokePath(..., c.accent, pal.stroke.active)`). `.ma-rect-fill` has `stroke: none`, so a `rect`
region becomes white on white, which is the requested outcome (see Risks).

*Alternative considered:* keeping the greys for chrome and splitting diagram tokens from chrome tokens. It was rejected
because the tokens are shared across renderers and exports. Chrome state gets its own rule instead (D5).

### D3. Author-colour normaliser for Mermaid-rendered diagrams

A new pure-DOM pass `monochromeColours(svg)` in `packages/webview/src/fallbackMonochrome.ts` runs in
`GenericDiagram.mount` after the drawing is attached and styles are adopted, only when `this.palette === 'monochrome'`.
It therefore applies to the panel rendering and to the export twin (`renderTwin`) alike. For each shape or text element
(`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `use`, `text`, `tspan`, `textPath`), it reads the
computed `fill` and `stroke` and writes inline `style` declarations with `!important`. Inline `!important` beats
Mermaid's stylesheet `!important` from `classDef`. Containers (`g`, `svg`) are skipped, because every element computes
a default black fill. The rules:

| Element | `fill` | `stroke` |
|---|---|---|
| `text`, `tspan`, `textPath`; anything inside `<marker>` | `#000000` | `#000000` unless `none` |
| A non-white fill in a group with no label (the nearest `g.node`, `g.cluster`, … or else the nearest `g` has no non-empty text): state start and end points, fork/join bars, commit bullets, also when a `%%{init}%%` branch colour tints them; white fills there (hollow merge commits, the end-state ring) stay white | `#000000` | `#000000` unless `none` |
| Every other shape whose computed `fill` is not `none` / `transparent` | `#FFFFFF` | `#000000` unless `none` / `transparent` |
| HTML inside `foreignObject` | `color: #000000`; a painted `background-color` becomes `#FFFFFF` | — |

The solid-mark rule is structural rather than a selector list. Mermaid 12 draws fork/join bars and the end-state dot as
rough.js paths inside an unclassed `g`, so no stable selector names them. What they share is that the group carries no
label, whereas every node an author can style has one. An author `style A fill:#000` therefore sits in a labelled
group and turns white, as `visual-theme` :: *Author colour matrix* :: R7 requires.

`stroke-width` is left untouched, so `linkStyle … stroke-width:4px` survives (`visual-theme` :: *Author colour matrix*
:: R3). The pass runs once per render, not per frame. `serializeSvg` already resolves computed styles into attributes,
so every export format inherits the result.

*Alternative considered:* stripping `style` / `classDef` / `linkStyle` lines from the source before rendering. It was
rejected for three reasons: it changes the layout when an author style sets `stroke-width` or `font-size`; it cannot
catch `%%{init}%%` variables or `box` colours; and it would make the panel differ from what Mermaid users expect
structurally.

*Alternative considered:* rewriting colours in Mermaid's CSS text. It was rejected because the selectors do not
reveal whether a rule targets text (fill = ink) or a shape (fill = white).

### D4. Toolbar theme menu

`ThemeMenu` in `App.tsx` sits in the toolbar before the keyboard button: `IconButton` icon `symbol-color`, label
`t('toolbar.theme')` = *Theme*. It is always enabled, because it does not depend on `controller`. Its popover reuses
the `ZoomGroup` menu behaviour. That behaviour (focus the checked item, outside-click close, arrow/Home/End/Escape keys,
focus back to the trigger) is extracted into a small `useMenu(open, setOpen)` hook that both use, so the two menus
cannot drift. `ui` gains `themeMenu: boolean`, closed together with the other popovers. Items are `menuitemradio`,
checked from `hostState.value.settings.themeMode`. Choosing an unchecked item posts
`webviewMessage('theme/set', { mode })`. The palette changes only when the host's `settings/changed` arrives, so the
panel never shows a mode the setting does not hold. New strings go in `protocol/src/strings.ts`: `toolbar.theme`,
`theme.auto` (*Follow editor theme*), `theme.ivory`, `theme.graphite`, `theme.highContrast` (*High contrast*) and
`theme.monochrome`, each with its Spanish entry.

### D5. Monochrome chrome states

`styles/app.css` adds a `[data-palette='monochrome']` block. `.ma-button--pressed`, `.ma-menu__item--checked`,
`.ma-segmented__item--checked` and `.ma-inspector__item[aria-pressed='true']` get `background: var(--ma-ink-1);
color: var(--ma-canvas)`, which is inverted. Hover states, which otherwise use the now-white `surface-sunken`, get
`outline: 1px solid var(--ma-ink-1); outline-offset: -1px`. The focus ring keeps `--ma-focus`, the editor's focus
colour, so keyboard focus stays visible on an inverted control. `tokens.css` sets no Monochrome `--ma-focus`.

### D6. Host: `theme/set`

`WebviewMessage` gains `{ type: 'theme/set'; payload: { mode: ThemeMode } }`, validated with
`shape({ mode: oneOf(...THEME_MODES) })`. `shape` ignores extra keys, which gives *Theme change message matrix* R4.
`panel.ts` handles it with `await setThemeMode(message.payload.mode)` from `environment.ts`:

```ts
const config = vscode.workspace.getConfiguration('mermaidAnimator');
const target = config.inspect('theme.mode')?.workspaceValue !== undefined
  ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
await config.update('theme.mode', mode, target);
```

On failure it calls `vscode.window.showErrorMessage(l10n.t('Could not change the Mermaid Animator theme: {0}',
reason))`. On success nothing else is needed: the existing configuration listener sends `settings/changed` to every
panel. The setting has window scope, so there is no workspace-folder value to consider.

### D7. Live switch of Mermaid-rendered diagrams

`controller.applySettings` rebuilds and re-renders the generic drawing, and `GenericDiagram.render` reads the palette
from `document.documentElement.dataset.palette`. There is no race with the `effect` in `main.tsx` that sets it: `handle`
assigns `hostState.value` before it calls `applySettings`, and Preact signals run that effect synchronously on the
assignment, so the rebuild always reads the new palette. No code change is needed. Leaving Monochrome re-renders from
scratch, so the normaliser's inline styles disappear with the old DOM.

## Risks / Trade-offs

- [A `rect` region, and the colour difference between pie slices and between `box` groups, carry meaning that white
  fills erase] → The user chose this explicitly. `box` groups keep their black border, pie slices keep their black
  separators and slice labels, and a `rect` region's messages stay visible. The trade-off is noted in the README
  Monochrome description.
- [A solid mark that Mermaid draws inside a labelled group turns white, or an author-coloured node with an empty
  label (an unlabelled group) turns black] → Marks inside `<marker>` are always ink. The *Only palette colours*
  harness check runs over the fixture corpus, and `stateDiagram-v2`/`gitGraph` fixtures confirm the marks stay black.
- [`getComputedStyle` over every element of a large Mermaid drawing] → It runs once per render, only in Monochrome, on
  the order of the element count. A 2 000-element flowchart is measured during implementation. If the pass takes more
  than 50 ms, restrict it to elements under the node and edge selectors.
- [Writing user settings from a webview click is a new side effect] → Only `theme.mode` can be written, only with a
  validated enum value, and only through a user click. The host ignores extra payload fields (R4).
- [HC editor users who pick Monochrome lose the 2 px HC borders] → That is their explicit choice. *Follow editor theme*
  and *High contrast* remain one click away in the same menu.

## Migration Plan

The change is additive for the setting: the default stays `auto`, and existing values are untouched. The grey
Monochrome of `add-monochrome-export-theme` is still under *Unreleased* in the CHANGELOG, so no released version
changes: that entry is amended to describe white-only fills instead of adding a `Changed` entry. Rolling back means reverting the change. A user who still has
`theme.mode: "monochrome"` then sees an invalid-value warning in Settings, and the older validator rejects that
`settings/changed`, so the rollback note tells users to reset the setting first.

Order: archive `add-monochrome-export-theme` before archiving this change, because `export-theme` MODIFIED/REMOVED
deltas need the synced spec. Then edit the `export-theme` Purpose by hand. It still says "with one light grey" and lists
the panel palette as a non-goal.

