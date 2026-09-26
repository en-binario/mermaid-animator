# Design: M2b — Topology

## Context

Follows M2a (`add-m2a-narrative-presentation`), which adds concurrent lanes, multi-step messages and focus as scene inputs. Current rendering is sequence-only: `layoutSequence` (core), `prepareScene`/`sceneAt` and `SequenceSvgRenderer` (renderer), one `<svg>` and one `Camera` in `DiagramController` (webview). The timeline is layout-invariant (ADR-011), so a second view can share it unchanged. Workers must be created through the blob shim (ADR-013) and the webview CSP already allows `worker-src blob:` and `importScripts` from the resource origin.

Motivation: `proposal.md`. Behaviour: `specs/`.

## Goals / Non-Goals

**Goals:** a topology view that is a pure function of the same IR, step list and time; a morph that makes identity visible; two synchronised views; a minimap usable in both.

**Non-Goals:** radial/grid layouts, heat overlay, trace view (P2); sidecar persistence (M3).

## Decisions

### D1. Topology model in `core`
`buildTopology(model, compiled)` returns nodes (participant id, label, kind, box), clusters (boxes), and edges keyed `from→to` with their message ids and step indices, split into request edges and return lanes according to `returnMessages` (a message is a return when dotted). Pure and unit-tested; it also yields the message → edge map used for cross-highlighting and the morph.

### D2. Layout engines behind one interface
`TopologyLayout = (topology, options) => Promise<{ nodes: Map<id, Rect>, edges: Map<key, Point[]>, bounds }>`:
- **layered:** `elkjs` (`elk-api` in the webview, `elk-worker.min.js` copied to `dist/webview/workers/`), started with the blob shim using `new URL('./workers/elk-worker.min.js', import.meta.url)` — no protocol change needed. Options: `elk.algorithm=layered`, direction from settings, `elk.randomSeed` fixed, nodes ordered by first call, clusters as compound nodes, previous positions passed as hints for stability. Edge routes come from ELK (`SPLINES` for curved, `ORTHOGONAL`, `POLYLINE` for straight).
- **force:** `d3-force` run synchronously to a fixed 300 ticks with `simulation.randomSource` bound to a seeded LCG (seed = hash of node ids), so output is deterministic; edges drawn as quadratic curves, bidirectional pairs offset.
- **manual:** stored positions from `document/load`; missing nodes placed by the layered result.
*Alternative:* dagre — smaller, but unmaintained and weaker with clusters.

### D3. Topology scene and renderer
`topologySceneAt(model, t, display, { focus })` in `renderer`: an edge is played when any of its steps ≤ k (state/opacity rules shared with the sequence scene helpers); each current message contributes a pulse travelling along its edge route over the step transition; node activity rings follow open activations at k (reusing the activation effects already on steps). `TopologySvgRenderer` mirrors `SequenceSvgRenderer` (build once, diffed writes, token CSS classes in `diagram.css`, typed node shapes reusing the glyph paths).

### D4. Views in the controller
`DiagramController` owns a `view` signal (`sequence | topology | split`) and a list of *view slots* (renderer + `<svg>` + `Camera`). Split creates two slots in a CSS grid (columns ≥ 1100 px, rows otherwise); one `Player` drives both. Generic diagrams keep a single slot and disable the switcher.

### D5. Morph as a transient drawing with its own clock
On switch, the player takes a `morph` hold and a `MorphRenderer` draws an interpolated scene for 640 ms (150 ms cross-fade under reduced motion): header rects interpolate position/size/radius to node rects; arrows become chords whose endpoints follow their participants; chords of the same edge cross-fade into the aggregated edge and badges count up; lifelines retract (`scaleY`), notes/activations fade — the windows of spec §8.4 encoded in one pure `morphAt(from, to, p)` function. At the end the target slot is shown and the hold released; playback state is untouched (step and focus preserved).

### D6. Minimap
`Minimap.tsx` renders a static simplified SVG per layout (lines/rects only, scaled to ≤ 160 × 110) and a viewport rectangle derived from the slot camera's view each frame; pointer drag/click call `camera.userSet`, which already suspends Follow/Cinematic. Visibility follows `display.showMinimap` and the content-vs-viewport test; hidden while presenting.

### D7. Cross-highlighting
Hover events in either slot resolve to an element ref (existing `elementAt`); the counterpart set comes from D1's maps (message ↔ edge, participant ↔ node) and is applied as a `highlight` scene input (accent outline) in the other slot.

### D8. Manual layout persistence
The webview sends `layout/save { key, positions }` (debounced 500 ms after a drag); the host stores `workspaceState["layout:" + uri + "#" + (id ?? index)]` and adds `layout` to `document/load`. *Reset Topology Layout* clears it. M3 migrates these into the sidecar file.

## Risks / Trade-offs

- [elkjs adds ≈ 1.5 MB] → lazy-loaded only when the topology view is first shown; not in the initial bundle budget.
- [ELK layout latency for large graphs] → computed in the worker (NFR-PERF-08: < 300 ms for 50 nodes); a hairline progress indicator while pending; the previous layout stays visible.
- [Morph cost with hundreds of messages] → chords beyond 300 are faded rather than individually interpolated.
- [EPL-2.0 licence] → used unmodified via its published worker file; notice and licence text shipped in `ThirdPartyNotices.txt`.

## Implementation notes

- **Layout latency (NFR-PERF-08).** Measured in the webview harness (Chromium, production CSP) with `fixtures/demo/fifty-services.mmd` (50 participants, 79 messages, `layered`, LR) via the `ma:topology-layout` performance measure: warm layouts **148–221 ms** (5 runs after live edits) — within the 300 ms budget. The very first layout took **794 ms** because it includes loading the topology chunk and starting the ELK worker (1.5 MB script); to keep that off the click path the controller starts the layout in the background as soon as the pointer or focus reaches the view switcher.
- **Edge routes.** ELK's routes are used as given only for `orthogonal` edges (polylines). Curved and straight edges are routed geometrically from the node boxes in `core` (`routeEdges`), which also offsets opposite pairs and merged return lanes and draws self-call loops — ELK's spline control points would not accommodate the lanes, and the same router serves the `force` and `manual` layouts.
- **Split orientation** follows the panel width (≥ 1100 px → columns), not the canvas width beside the inspector, as the spec states.
- **Manual layout.** Nodes without a stored position take their layered position; the first drag stores every node's position so the arrangement stays stable afterwards.
