# Mermaid Animator

Play the Mermaid diagrams already in your repository as elegant, navigable animations — in `.mmd` / `.mermaid` files and in ` ```mermaid ` blocks inside Markdown.

> **Status: preview (0.1).** Sequence diagrams are fully animated; every other Mermaid diagram type opens with a generic, ordered reveal.

## Getting started

- **Markdown:** click **▶ Animate** above any ` ```mermaid ` block.
- **Mermaid files:** click the ▶ button in the editor title bar, or run **Mermaid Animator: Open Animated Preview to the Side** (`Ctrl+K Alt+M` / `Cmd+K Alt+M`).
- **Explorer:** right-click a `.md`, `.mdx`, `.mmd` or `.mermaid` file → **Animate Mermaid Diagram**.
- **Several diagrams in one file:** **Animate All Diagrams in File**, or switch diagrams from the panel toolbar.

Nothing in your diagrams needs to change. Edits appear live, and the panel keeps your place while you type.

## What you see

- Messages draw from sender to receiver with a travelling pulse; activations rise and fall; notes, created participants and destroyed lifelines appear on their step; `loop` / `alt` / `opt` / `par` / `critical` / `break` / `rect` frames light up while their steps play.
- The current step is highlighted in the source editor; **Alt + double-click** any element to jump to its line.
- Syntax errors never blank the panel: the last good drawing stays, dimmed, with the error and a *Reveal in source* link, and the problem is listed in the Problems panel.

## Keyboard (panel focused)

| Key | Action | Key | Action |
|---|---|---|---|
| `Space` / `K` | Play / pause | `+` / `-` | Zoom |
| `→` / `←` | Next / previous step | `0` | Fit diagram |
| `Home` / `End` | First / last step | `F` | Frame current step |
| `G` | Go to step (number or text) | `C` | Camera follow on/off |
| `[` / `]` | Slower / faster | `E` | Export |
| `L` | Loop | `?` | All shortcuts |

From the editor: **Play / Pause** `Ctrl+Alt+Space`, **Next / Previous Step** `Ctrl+Alt+→ / ←` (`Cmd` on macOS) while a panel is active.

## Export

**Export…** (toolbar, `E`, or the CodeLens) saves the current frame as **SVG** (self-contained: fonts embedded, no scripts or external references) or **PNG** at 1×/2×/3×, optionally transparent, or copies it to the clipboard.

## Annotations (optional)

Refine an animation with Mermaid comments, which other renderers ignore:

```mermaid
sequenceDiagram
    %% @animator speed=1.25 future=ghosted camera=follow
    %% @caption "The customer confirms the basket."
    Customer->>+Shop: Confirm order
    %% @pause 1.5s
    Shop-->>-Customer: Confirmed
```

Supported in this release: `@animator`, `@id`, `@title`, `@step-id`, `@skip`, `@pause`, `@duration`, `@speed`, `@emphasis`, `@with-next`, `@type`; `@caption` and `@chapter` are validated and stored for the next release. Mistakes are reported in the Problems panel.

## Settings

| Setting | Default | Description |
|---|---|---|
| `mermaidAnimator.theme.mode` | `auto` | `auto` follows the editor theme; `ivory`, `graphite`, `highContrast` force a palette. |
| `mermaidAnimator.codeLens.enabled` | `true` | CodeLens above Markdown diagrams. |
| `mermaidAnimator.liveReload.enabled` / `.debounceMs` | `true` / `250` | Re-render while editing. |
| `mermaidAnimator.sync.stepToEditor` | `true` | Highlight the current step in the source. |
| `mermaidAnimator.sync.cursorToStep` | `click` | Send the editor cursor to the panel (keeps your place). |
| `mermaidAnimator.playback.autoplay` | `false` | Start playing when a panel opens. |
| `mermaidAnimator.playback.speed` | `1` | Initial speed (0.25–4). |
| `mermaidAnimator.playback.dwell` / `.dwellMs` | `adaptive` / `900` | Rest after each step (adaptive = reading time). |
| `mermaidAnimator.playback.onEnd` | `stop` | `stop`, `loop` or `rewind`. |
| `mermaidAnimator.playback.reverse` | `animate` | Step back animated or `cut`. |
| `mermaidAnimator.playback.pauseOnHover` | `true` | Pause while the pointer is over the diagram. |
| `mermaidAnimator.playback.startAt` | `beginning` | Or `end` to open on the complete diagram. |
| `mermaidAnimator.playback.notes` | `step` | Notes as steps, `attach`ed to the previous step, or `hidden`. |
| `mermaidAnimator.scrubber.snap` | `true` | Snap to a step when the scrubber is released. |
| `mermaidAnimator.display.futureSteps` | `hidden` | `hidden`, `ghosted` or `visible`. |
| `mermaidAnimator.display.pastSteps` / `.trailLength` | `full` / `3` | `full`, `muted` or a fading `trail`. |
| `mermaidAnimator.motion.profile` | `formal` | `formal`, `expressive`, `minimal` or `none`. |
| `mermaidAnimator.motion.respectReducedMotion` | `true` | Minimal motion when reduced motion is requested. |
| `mermaidAnimator.motion.travelIndicator` | `pulse` | `pulse`, `comet` or `none`. |
| `mermaidAnimator.camera.mode` | `auto` | `auto`, `fit`, `follow` or `manual`. |
| `mermaidAnimator.files.languages` | `markdown, mdx, mermaid` | Languages scanned for diagrams. |

## Accessibility and languages

Every control is keyboard operable and labelled; each step is announced to screen readers ("Step 7 of 24. Gateway to Auth: verify token. In loop Retry."). High-contrast themes and reduced motion are honoured. The interface is available in English and Spanish.

## Privacy

Diagram content never leaves your machine. The animator makes no network requests.
