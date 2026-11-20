---
title: Sequence, topology, split
description: The sequence, topology and split views of a Mermaid sequence diagram, the morph between them, layouts, the minimap and participant names when zoomed in.
---

# Sequence, topology, split

A sequence diagram can be shown three ways, all on the same timeline. The default comes from
[`mermaidAnimator.view.default`](../reference/settings.md#mermaidanimator-view-default), and
`%% @animator view=topology` sets it for one diagram.

## Sequence

The classic view: participants across the top, lifelines down, messages in order.

## Topology

Press `T` for the same steps as a live service map:

- participants become nodes, shaped by type (actor, database, queue and the rest; [`@type`](../authoring/annotations.md#directives)
  sets the shape);
- `box` groups become clusters;
- messages merge into edges with `×n` badges, and return messages run as dashed lanes beside their request
  ([`topology.returnMessages`](../reference/settings.md#mermaidanimator-topology-returnmessages));
- each step sends a pulse along its edge.

Hover an edge to list its messages and jump to any of them; click a node to focus it.

## Morph

Switching between Sequence and Topology animates by identity: headers travel into nodes, and arrows follow and merge
into edges, without losing your step or focus. Under reduced motion it's a short cross-fade.

## Split

Press `S` for both views side by side (stacked on narrow panels) on one timeline, each with its own camera. Hovering
an element highlights its counterpart in the other view.

## Layouts

| Layout | What it does |
|---|---|
| `layered` (default) | Left to right or top to bottom ([`topology.direction`](../reference/settings.md#mermaidanimator-topology-direction): `LR` or `TB`) |
| `force` | A deterministic force-directed layout |
| `manual` | Drag nodes; the positions are remembered for that diagram. *Reset Topology Layout* forgets them, and *Save Topology Layout* writes them to a [sidecar file](../authoring/sidecar-files.md) |

Set it with [`topology.layout`](../reference/settings.md#mermaidanimator-topology-layout). Edges are `curved`,
`orthogonal` or `straight` ([`topology.edgeStyle`](../reference/settings.md#mermaidanimator-topology-edgestyle)),
and their width follows the message count or is `uniform`
([`topology.edgeWeight`](../reference/settings.md#mermaidanimator-topology-edgeweight)).

## Minimap

An overview in the corner whenever the drawing is larger than the view: drag the frame to pan, click to jump there
([`display.showMinimap`](../reference/settings.md#mermaidanimator-display-showminimap)).

## Who is who when zoomed in

- Once the participant headers scroll out of view, a slim band at the top of the sequence view names every visible
  lifeline. Click a name to focus it.
- Participants of the current step that are off to the left or right get a marker on that edge; click it to pan
  there ([`display.participantNames`](../reference/settings.md#mermaidanimator-display-participantnames)).
- The ends of the arrow that is playing are labelled with the sender and receiver names when their headers are out of
  view ([`display.arrowEndNames`](../reference/settings.md#mermaidanimator-display-arrowendnames): `auto` by default,
  or `always` / `off`).
