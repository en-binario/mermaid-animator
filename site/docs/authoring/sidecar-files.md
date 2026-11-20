---
title: Sidecar files
description: Keep Mermaid Animator settings, captions, chapters and topology positions in a <file>.animator.json next to the source, validated by a JSON schema.
---

# Sidecar files

Prefer your Mermaid source free of annotations? Keep settings, captions, chapters and topology positions beside it in
`<file>.animator.json`, for example `README.md.animator.json` or `flow.mmd.animator.json`. VS Code completes and
validates it with the bundled JSON schema.

```json5
{
  "version": 1,
  "diagrams": {
    "sign-in": {                                   // the diagram's @id, or "#2" for the second diagram
      "settings": { "view.default": "split", "playback.speed": 1.25 },
      "captions": { "lookup-user": "Auth looks the user up.", "#4": "The database returns the hash." },
      "chapters": [{ "title": "Credentials", "firstStep": "#1" }],
      "topology": { "layout": "manual", "positions": { "U": [40, 160], "G": [260, 160] } }
    }
  }
}
```

## Keys

- **Diagrams** are keyed by their [`@id`](annotations.md#directives) or, without one, by `#<n>`, their position in the
  file (1-based).
- **Steps** are referenced by `#<number>`, by [`@step-id`](annotations.md#directives), or by the step's content or
  structural id. Fixing a typo in a label doesn't orphan its caption. Use `@step-id` for references that survive any
  edit.
- An entry that no longer matches a step is flagged with a warning in the sidecar instead of being dropped silently.

## Priority

Sidecar settings sit above your user and workspace settings and below front matter and annotations (see
[Where settings come from](annotations.md#where-settings-come-from)). Edits to the sidecar apply to open panels
immediately.

## Writing it from the panel

The extension writes the sidecar only when you ask it to, keeping its comments and formatting:

- **Save Topology Layout** moves positions you dragged in a `manual` layout (kept per workspace until then) into the
  file.
- **Save Current Settings as Diagram Defaults** saves the speed, view and camera.

In untrusted workspaces sidecars are read but never written.

## The schema

The schema is published at
[`https://mermaid-animator.enbinario.com/schemas/animator.schema.json`](pathname:///schemas/animator.schema.json) and
bundled with the extension, which applies it to every `*.animator.json` file. To use it in another editor, add:

```json
{
  "$schema": "https://mermaid-animator.enbinario.com/schemas/animator.schema.json"
}
```
