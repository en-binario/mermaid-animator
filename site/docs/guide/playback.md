---
title: Playing a diagram
description: How Mermaid Animator plays a diagram step by step, the overview, the camera, zoom, themes and the link to the source editor.
---

# Playing a diagram

## The overview, then the steps

Step 0 shows the complete diagram, framed to fit, so you see the whole picture before the reveal. The first step
clears it, and the diagram then builds up step by step; stepping back to 0 brings the overview back. Turn it off
with [`mermaidAnimator.playback.initialOverview`](../reference/settings.md#mermaidanimator-playback-initialoverview)
or, for one diagram, `%% @animator overview=false`.

## What animates

- Messages draw from sender to receiver with a travelling pulse
  ([`motion.travelIndicator`](../reference/settings.md#mermaidanimator-motion-travelindicator): `pulse`, `comet` or
  `none`).
- Activations rise and fall; notes, created participants and destroyed lifelines appear on their step.
- `loop` / `alt` / `opt` / `par` / `critical` / `break` / `rect` frames light up while their steps play.
- **Loops** repeat with an `n / N` counter in their tab
  ([`playback.loopIterations`](../reference/settings.md#mermaidanimator-playback-loopiterations), or
  [`@iterations`](../authoring/annotations.md#directives) for one loop). Repeats after the first play at double speed
  ([`playback.compressRepeats`](../reference/settings.md#mermaidanimator-playback-compressrepeats)).
- **`par` lanes** play together, each message with its own pulse
  ([`playback.parallel`](../reference/settings.md#mermaidanimator-playback-parallel)).
- **`alt` / `critical` / `opt`** play the branch you choose: in the inspector, with `%% @branch`, or on the canvas
  when [`playback.altBranches`](../reference/settings.md#mermaidanimator-playback-altbranches) is `ask`.

Future and past steps can be hidden, ghosted or muted
([`display.futureSteps`](../reference/settings.md#mermaidanimator-display-futuresteps),
[`display.pastSteps`](../reference/settings.md#mermaidanimator-display-paststeps)), and the motion style ranges from
`formal` to `expressive`, `minimal` or `none`
([`motion.profile`](../reference/settings.md#mermaidanimator-motion-profile)). Reduced motion is honoured.

Every other Mermaid diagram type (flowcharts and the rest) is drawn by Mermaid and opens with a generic, ordered
reveal, with the same transport, camera and export.

## Transport

Play and pause (`Space`), step (`→` `←`), jump to the first or last step (`Home` `End`), go to a step by number or text
(`G`), change the speed (`[` `]`), loop (`L`), and drag the scrubber, which snaps to the nearest step when you let go
([`scrubber.snap`](../reference/settings.md#mermaidanimator-scrubber-snap)). After each step the animation rests for
a reading time that adapts to the step
([`playback.dwell`](../reference/settings.md#mermaidanimator-playback-dwell)).

## Camera

With *Camera follows playback* on (the eye button or `C`), the camera keeps each step in view at a steady zoom: 100 %
by default ([`camera.playZoom`](../reference/settings.md#mermaidanimator-camera-playzoom)).

- It zooms out, never below 75 %, only for a step too wide to fit.
- It never leaves most of the view empty: the drawing stays against the edges of the view, or centred when it's
  smaller.
- Pan, scroll or zoom whenever you like: following stays on, and if the animation is playing it pauses. Press play
  (or step) and the camera returns to the current step at the zoom you chose, which it keeps (replay included) until
  you open another diagram.
- Only the eye button or `C` turns following off.

`F` frames the current step and `0` fits the whole diagram.

## Zoom

The toolbar's zoom group shows the current zoom: `−` and `+` zoom out and in (like the `-` and `+` keys), and clicking
the percentage offers 25 %–400 % and *Fit*. `Ctrl`/`Cmd` + wheel or a pinch zooms about the pointer.

## Themes

The diagram and the panel's controls have separate themes.

- **Diagram theme.** The toolbar's *Diagram theme* button changes only the diagram: *Follow editor theme*, *Ivory*,
  *Graphite* and *High contrast* (the Ink & Ivory themes); Mermaid's own themes *Default*, *Neutral*, *Dark*,
  *Forest*, *Base*, *Neo*, *Neo dark*, *Redux*, *Redux dark*, *Redux color* and *Redux dark color*, which also colour
  the natively drawn sequence diagrams; and *Monochrome*. The choice is saved to
  [`theme.diagram`](../reference/settings.md#mermaidanimator-theme-diagram) (in the workspace settings if the
  workspace sets it, otherwise in your user settings), and every open panel switches at once.
- **Controls.** The toolbar, menus, inspector and transport follow the VS Code theme. Set
  [`theme.ui`](../reference/settings.md#mermaidanimator-theme-ui) to `ivory`, `graphite` or `highContrast` for the
  Ink & Ivory look.

## Bold and italic labels

`<b>…</b>` / `<strong>…</strong>` and `<i>…</i>` / `<em>…</em>` in labels render as bold and italic, as in Mermaid's
own preview, in every view, diagram type and export. Wrapping and box sizes account for the formatting. Search, the
transcript, captions and screen readers use the text without tags; other HTML stays as written.

## The source editor

- The current step is highlighted in the source
  ([`sync.stepToEditor`](../reference/settings.md#mermaidanimator-sync-steptoeditor)).
- Clicking a statement in the editor moves playback to its step
  ([`sync.cursorToStep`](../reference/settings.md#mermaidanimator-sync-cursortostep); `follow` also tracks keyboard
  moves).
- **Alt + double-click** any element in the panel to jump to its line.
- Edits re-render live ([`liveReload.enabled`](../reference/settings.md#mermaidanimator-livereload-enabled)), and the
  panel keeps your place.

## Syntax errors

Syntax errors never blank the panel: the last good drawing stays, dimmed, with the error and a *Reveal in source*
link, and the problem is listed in the Problems panel.

## Settings

The gear button at the end of the panel toolbar (or **Mermaid Animator: Open Settings**, also in the Mermaid Diagrams
view's title bar) opens the Settings editor filtered to Mermaid Animator. Every setting is in the
[settings reference](../reference/settings.md).
