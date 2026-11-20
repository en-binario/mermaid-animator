---
title: Export and share
description: Export a Mermaid animation as GIF, WebM or MP4 video, animated SVG for a GitHub README, a self-contained HTML player, or a still SVG or PNG, and share links to a step.
---

# Export and share

**Export…** (toolbar, `E`, the CodeLens, or **Mermaid Animator: Export…**) opens the export sheet: pick a format and
see a live preview with the estimated duration and file size. Options that don't apply to the chosen format are
disabled.

## Formats

| Format | What you get |
|---|---|
| **GIF** | Animated GIF with a global palette (optional dithering) and transparency; loops forever, once or *n* times |
| **WebM / MP4** | VP9 video; MP4 (H.264) where the editor's encoder supports it. Otherwise the sheet says so and offers WebM |
| **Animated SVG** | Plays as an image, for example in a GitHub README; CSS keyframes, no scripts. *Export for GitHub (light + dark pair)* writes `name.light.anim.svg` and `name.dark.anim.svg` |
| **HTML player** | One self-contained, offline file with transport, keyboard control, chapters and `#step=` / `#chapter=` links |
| **SVG / PNG** | The current frame (SVG self-contained with fonts embedded; PNG at 1×, 2× or 3×, optionally transparent), or copy it to the clipboard |

The sheet starts with [`export.defaultFormat`](../reference/settings.md#mermaidanimator-export-defaultformat)
selected. *Export as GIF… / Video… / Animated SVG… / HTML Player…* open it with that format selected; bind them with
`"args": { "start": true }` to export straight away with your defaults:

```json
{
  "key": "ctrl+alt+g",
  "command": "mermaidAnimator.export.gif",
  "args": { "start": true }
}
```

## Options for GIF and video

You choose the range (all steps, current chapter, A–B range, current step), view, camera (fit, cinematic, current),
size preset, frame rate (12–60 fps), speed, theme, background, what to burn in (captions, title card, step counter,
progress bar), end hold and quality.

Frames are rendered and encoded in a background worker with frame-exact timing, and the progress notification has
**Cancel**.

## Theme

Every format offers *Current* (the panel's diagram theme, including a Mermaid theme), *Ivory*, *Graphite* and
*Monochrome*.

**Monochrome** is a formal style for specifications, reports and print: black text and lines, and white shapes and
background. Colours the diagram sets itself (`style`, `classDef`, `linkStyle`, `rect rgb(…)`, `box` colours,
`%%{init}%%` theme variables) become white fills with black lines and text, so groups, `box`es and pie slices are
told apart by their borders and labels only, and a `rect` region is no longer visible. Pick *Monochrome* in the
toolbar's *Diagram theme* menu to preview it in the panel.

[`export.theme`](../reference/settings.md#mermaidanimator-export-theme) sets the theme the sheet starts with and the
one *Export as SVG*, *Export as PNG* and *Copy Image* use. For an animated SVG, the GitHub palette and the light + dark
pair come with *Current*; any other theme writes one file in that palette.

## Insert below the diagram

After exporting from a Markdown file, **Insert below diagram** adds an image reference after the diagram's closing
fence, or a `<picture>` element for a light + dark pair.

## Animated SVG notes

- Motion is sampled at 30 Hz into merged keyframes, so a long flow can pass 1 MB. The sheet warns and suggests a GIF.
- By default the file has a transparent background and a palette meant to read on both GitHub's light and dark
  backgrounds. No single colour reaches 4.5:1 contrast on both `#ffffff` and `#0d1117`, so lines and text carry a thin
  contrasting halo. For the best result on GitHub, use the light + dark pair.
- [`export.svgAdaptiveTheme`](../reference/settings.md#mermaidanimator-export-svgadaptivetheme) also embeds a
  `prefers-color-scheme: dark` palette.

## Links to a step

**Copy Link to Current Step** (Command Palette) copies a link such as:

```text
vscode://enbinario.mermaid-animator/open?path=docs/checkout.md&diagram=checkout&step=confirm-order
```

Opening it in VS Code opens the file, the diagram (by `@id` or position) and the step (by step id, then by number),
or says what couldn't be found. In VS Code Insiders the link starts with `vscode-insiders://`.

Exported HTML players link to steps and chapters with `#step=` and `#chapter=`.
