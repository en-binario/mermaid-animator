# Spec Delta

## Purpose

Guarantees that every Mermaid diagram opens and animates, even without a native pipeline, by revealing Mermaid's own rendering in a sensible order with the same controls.

## ADDED Requirements

### Requirement: Fallback engine selection
Diagrams whose type has no native pipeline, and sequence diagrams the native parser rejects but Mermaid renders, SHALL be rendered by the bundled Mermaid with `securityLevel` forced to `strict`, loaded only when first needed.

#### Scenario: Flowchart opens
- **WHEN** the user animates a `flowchart TD` diagram
- **THEN** the panel shows Mermaid's rendering of it and the inspector-style notice *Generic animation — full semantics not available for this diagram type*

### Requirement: Ordered group reveal
The fallback SHALL identify animatable groups using per-type selectors (falling back to top-level groups), order them with nodes before their incident edges and otherwise top-to-bottom then left-to-right, and reveal one group per step by drawing strokes and fading fills and text.

#### Scenario: Steps equal groups
- **WHEN** a flowchart has 4 nodes and 3 edges
- **THEN** the step list has 7 steps and each node is revealed before any edge touching it

### Requirement: Shared controls
Transport, keyboard shortcuts, camera and static export SHALL work for fallback diagrams as for native ones.

#### Scenario: Export a fallback diagram
- **WHEN** the user exports a pie chart as PNG
- **THEN** the PNG shows the pie chart at the current step

### Requirement: Mermaid errors
When Mermaid cannot render a diagram, the panel SHALL show Mermaid's error message in the error banner and keep the last successful rendering if one exists.

#### Scenario: Invalid flowchart
- **WHEN** a flowchart contains a syntax error
- **THEN** the banner shows Mermaid's message
