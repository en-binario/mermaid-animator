# Spec Delta

## Purpose

Shows who talks to whom, and how often, by re-laying a sequence diagram's participants and messages out as a live service map driven by the same step list.

## ADDED Requirements

### Requirement: Nodes and clusters
Each participant SHALL be a node whose shape follows its participant type (`participant` rounded rectangle; `actor` person glyph above the label; `database` cylinder; `queue` horizontal cylinder; `collections` stacked rectangles; `boundary`, `control`, `entity` their UML glyphs), and each `box` group SHALL be a labelled cluster containing its members.

#### Scenario: Database node
- **WHEN** a participant is declared `participant L@{ "type": "database" } as Ledger`
- **THEN** the topology view draws `Ledger` as a cylinder

### Requirement: Aggregated edges
Messages SHALL aggregate into one directed edge per ordered pair of participants, labelled with a `×n` badge when `n > 1`; when `mermaidAnimator.topology.edgeWeight` is `count` (default) the edge width SHALL be `1.25 + 1.5 × log₂(n)` px capped at 5 px; self-calls SHALL be loop arcs on the node; `mermaidAnimator.topology.returnMessages` SHALL merge return messages (dashed arrows) into a return lane beside their request edge (`merge`, default), draw them as their own edges (`separate`) or omit them (`hide`).

#### Scenario: Repeated calls
- **WHEN** `Gateway` calls `Auth` three times
- **THEN** one edge from Gateway to Auth is drawn with the badge `×3`

### Requirement: Topology playback
The topology view SHALL use the same step list and timeline as the sequence view: each step's messages SHALL send a pulse along their edges over the step's transition, concurrent steps SHALL pulse simultaneously, and a node SHALL show an activity ring while it has an open activation.

#### Scenario: Same position in both views
- **WHEN** playback rests on step 5 in the sequence view and the user switches to topology
- **THEN** the topology view rests on step 5 with the edges of steps 1–5 drawn as played

### Requirement: Layouts
`mermaidAnimator.topology.layout` SHALL select `layered` (default; ordered by first call, direction `mermaidAnimator.topology.direction` `LR` default or `TB`, computed off the main thread), `force` (deterministic for the same diagram) or `manual`; in `manual`, dragging a node SHALL move it, positions SHALL be remembered per diagram across reloads, nodes without a stored position SHALL be placed by the layered layout, and *Reset Topology Layout* SHALL clear stored positions. `mermaidAnimator.topology.edgeStyle` SHALL select `curved` (default), `orthogonal` or `straight` edges.

#### Scenario: Deterministic force layout
- **WHEN** the same diagram is shown twice with the `force` layout
- **THEN** the node positions are identical

#### Scenario: Manual positions persist
- **WHEN** the user drags `Auth` in manual layout and reloads the window
- **THEN** `Auth` is where the user left it

### Requirement: Layout stability under edits
After a live reload, nodes that still exist SHALL keep their positions unless the layout strategy requires re-ordering, and new nodes SHALL animate into place.

#### Scenario: Add a participant
- **WHEN** a message to a new participant is added while the topology view is open
- **THEN** existing nodes stay in place and the new node appears

### Requirement: Edge and node interaction
Hovering an edge SHALL list the messages it aggregates with their step numbers, each activating a seek to that step; clicking a node SHALL focus that participant as in the sequence view.

#### Scenario: Seek from an edge
- **WHEN** the user hovers the `Gateway → Auth` edge and activates its second message
- **THEN** playback rests on that message's step
