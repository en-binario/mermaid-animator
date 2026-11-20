---
title: Accessibility and privacy
description: Keyboard and screen reader support in Mermaid Animator, its languages, and why your diagrams never leave your machine.
---

# Accessibility and privacy

## Accessibility

- Every control is keyboard operable and labelled. Press `?` in the panel for the [shortcuts](guide/keyboard.md).
- Each step is announced to screen readers, for example: *"Step 7 of 24. Gateway to Auth: verify token. In loop
  Retry, iteration 2 of 3."*
- The [transcript view](guide/narrate-and-present.md#transcript) (`R`) offers the whole flow as text.
- High-contrast themes are honoured, and the *High contrast* diagram theme is available in any editor theme.
- Reduced motion is honoured: animations become minimal
  ([`motion.respectReducedMotion`](reference/settings.md#mermaidanimator-motion-respectreducedmotion)), and switching
  views cross-fades.

## Languages

The interface is available in English and Spanish, following VS Code's display language.

## Privacy

- Diagram content never leaves your machine. The animator makes no network requests.
- Exported HTML players and SVGs reference nothing outside themselves.
- In untrusted workspaces, diagrams can be viewed and exported, but [sidecar files](authoring/sidecar-files.md) are
  never written.

## Reporting a vulnerability

Report it privately with **Report a vulnerability** under the *Security* tab of the
[GitHub repository](https://github.com/en-binario/mermaid-animator/security), not in a public issue.
