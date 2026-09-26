# Proposal: M2b — Topology

## Why

A sequence diagram answers "in what order?" but hides "who talks to whom, and how often?". The ideas document's most distinctive idea — and Scenario S1 in the product specification (§4.2) — is to re-lay the same steps out as a live service map and morph between the two views so the relationship is obvious. M2b (spec §23.2) delivers the topology view, the continuous morph, a split view that shows both at once, and a minimap for navigating large diagrams.

## What Changes

- **Topology view:** participants become nodes (shapes by participant type), `box` groups become clusters, messages aggregate into directed edges with `×n` count badges and optional count-weighted width, return messages merge into dashed return lanes (or separate / hidden), self-calls become loop arcs; playback sends a pulse along the edge of each step and rings the active node; hovering an edge lists its messages as links that seek to them.
- **Layouts:** `layered` (ELK in a web worker, default), `force` (seeded d3-force, deterministic), `manual` (drag nodes; positions remembered per diagram); direction `LR`/`TB`; edge styles `curved`/`orthogonal`/`straight`.
- **View switching:** a segmented control *Sequence | Topology | Split* in the toolbar, `T` and `S`, commands, and `mermaidAnimator.view.default`; switching preserves the step and playing state.
- **Continuous morph:** Sequence ↔ Topology transitions animate over 640 ms by identity (headers → nodes, arrows → aggregated edges, activations → activity rings, boxes → clusters); a 150 ms cross-fade under reduced motion.
- **Split view:** both views side by side (stacked on narrow panels), one shared timeline, independent cameras, cross-highlighting on hover.
- **Minimap:** an overview with the viewport rectangle and current-step marker, shown when content exceeds the viewport; drag to pan, click to centre.

## Capabilities

### New Capabilities

- `topology-view`: Drawing and animating a sequence diagram as a service map, including layouts, edge aggregation and node interaction.
- `view-switching`: Choosing between Sequence, Topology and Split views and the continuous morph between Sequence and Topology.
- `split-view`: Showing Sequence and Topology side by side on one timeline with cross-highlighting.
- `minimap`: The overview map for navigating large diagrams.

### Modified Capabilities

- `host-webview-protocol`: a `setView` command and a message to persist manual topology layouts.

## Impact

- New bundled dependencies: `elkjs` (EPL-2.0, used unmodified in a worker; notice in `ThirdPartyNotices.txt`) and `d3-force` (ISC).
- Code: `core` (topology model: node/edge aggregation from the IR and step list), `renderer` (topology scene and SVG renderer, morph interpolator), `webview` (ELK worker via the blob shim of spec §13.2, view switcher, split layout, minimap, node dragging), `extension` (commands, settings, layout persistence in `workspaceState`).
- New settings: `view.default`, `topology.layout`, `topology.direction`, `topology.edgeStyle`, `topology.returnMessages`, `topology.edgeWeight`, `display.showMinimap`.
- Non-goals: radial and grid layouts, heat overlay, trace view (P2); sidecar persistence of manual layouts (M3 migrates the stored positions into the sidecar).
