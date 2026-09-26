/**
 * Topology scene (spec topology-view, M2b D3): the visual state of every node, edge and cluster
 * as a pure function of playback time, driven by the same step list and timeline as the
 * sequence scene and sharing its state rules.
 */
import { positionAt, type CompiledSequence, type Position, type Timeline, type Topology } from '@mermaid-animator/core';
import { DURATION, EASE, windowed } from './easing';
import { DEFAULT_DISPLAY, OPACITY, restingOpacity, stateOf, stepFor, type DisplayOptions, type ElementState } from './scene';

export interface EdgePulse {
  at: number;
  opacity: number;
  message: string;
}

export interface EdgeState {
  state: ElementState;
  opacity: number;
  /** 0–1 fraction of the route drawn (only below 1 while the edge is first played). */
  draw: number;
  /** Accent highlight: current step, fading as it becomes past. */
  highlight: number;
  pulses: EdgePulse[];
  /** Messages of the current step on this edge (for the transient label). */
  current: string[];
  /** Label opacity for the current message. */
  label: number;
  emphasis: boolean;
  dimmed?: boolean;
  /** Cross-highlighted from the other view. */
  highlighted?: boolean;
}

export interface NodeState {
  opacity: number;
  /** Sender / receiver glow while a step involves the node. */
  glow: number;
  /** 0–1 activity ring while the node has an open activation. */
  ring: number;
  /** Open activation depth (nested activations draw extra rings). */
  depth: number;
  destroyed: boolean;
  focused?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
}

export interface ClusterState {
  opacity: number;
  active: number;
}

export interface TopologyScene {
  position: Position;
  edges: Map<string, EdgeState>;
  nodes: Map<string, NodeState>;
  clusters: Map<string, ClusterState>;
}

export interface TopologySceneInputs {
  focus?: ReadonlySet<string>;
  /** Node ids and edge keys highlighted from the other view (spec split-view). */
  highlight?: ReadonlySet<string>;
}

export interface TopologySceneModel {
  topology: Topology;
  compiled: CompiledSequence;
  timeline: Timeline;
  /** Open activation depth per participant at the rest point of each step (index k + 1; 0 = initial). */
  depths: Map<string, number>[];
  createStep: Map<string, number>;
  destroyStep: Map<string, number>;
  /** Message id → [sender, receiver] (every message, including hidden returns). */
  ends: Map<string, [string, string]>;
}

export function prepareTopologyScene(topology: Topology, compiled: CompiledSequence, timeline: Timeline): TopologySceneModel {
  const depths: Map<string, number>[] = [];
  const open = new Map<string, number>();
  const apply = (effects: { participant: string; on: boolean }[]) => {
    for (const a of effects) open.set(a.participant, Math.max(0, (open.get(a.participant) ?? 0) + (a.on ? 1 : -1)));
  };
  apply(compiled.initial.activations);
  depths.push(new Map(open));
  for (const step of compiled.steps) {
    apply(step.activations);
    depths.push(new Map(open));
  }
  const createStep = new Map<string, number>();
  const destroyStep = new Map<string, number>();
  for (const id of compiled.initial.creates) createStep.set(id, -1);
  for (const id of compiled.initial.destroys) destroyStep.set(id, -1);
  for (const step of compiled.steps) {
    for (const id of step.creates) if (!createStep.has(id)) createStep.set(id, step.index);
    for (const id of step.destroys) if (!destroyStep.has(id)) destroyStep.set(id, step.index);
  }
  const ends = new Map<string, [string, string]>();
  for (const edge of topology.edges) for (const m of edge.messages) ends.set(m, [edge.from, edge.to]);
  return { topology, compiled, timeline, depths, createStep, destroyStep, ends };
}

export function topologySceneAt(model: TopologySceneModel, t: number, options: DisplayOptions = DEFAULT_DISPLAY, inputs: TopologySceneInputs = {}): TopologyScene {
  const { topology, compiled, timeline } = model;
  const position = positionAt(timeline, t);
  const k = position.index;
  const T = k >= 0 ? (timeline.transitions[k] as number) : 0;
  const e = options.motion === 'none' && k >= 0 ? Number.POSITIVE_INFINITY : position.elapsed;
  const minimal = options.motion === 'minimal';
  const current = k >= 0 ? compiled.steps[k] : undefined;
  const previous = k >= 1 ? compiled.steps[k - 1] : undefined;
  const focus = inputs.focus && inputs.focus.size ? inputs.focus : undefined;
  const inFocus = (ids: string[]) => !focus || (focus.size === 1 ? ids.some((id) => focus.has(id)) : ids.every((id) => focus.has(id)));
  const highlight = inputs.highlight;
  const currentMessages = new Set(current?.messages ?? []);

  // -- edges ----------------------------------------------------------------------------------------------------
  const edges = new Map<string, EdgeState>();
  for (const edge of topology.edges) {
    const step = stepFor(edge.steps, k);
    const state = stateOf(step, k, edge.steps.length === 0);
    const emphasis = edge.steps.some((s) => compiled.steps[s]?.emphasis);
    const dimmed = !inFocus([edge.from, edge.to]) || undefined;
    const dim = (o: number) => (dimmed ? Math.min(o, OPACITY.dim) : o);
    const highlighted = highlight?.has(edge.key) || undefined;
    if (state !== 'current') {
      const fading = edge.steps.includes(k - 1) && k >= 0 ? 1 - windowed(e, 0, DURATION.base, EASE.exit) : 0;
      edges.set(edge.key, { state, opacity: dim(restingOpacity(state, step ?? -1, k, options)), draw: 1, highlight: fading, pulses: [], current: [], label: 0, emphasis, dimmed, highlighted });
      continue;
    }
    const firstTime = !edge.steps.some((s) => s < k);
    const onEdge = edge.messages.filter((m) => currentMessages.has(m));
    if (minimal) {
      const f = windowed(e, 0, DURATION.fast, EASE.linear);
      edges.set(edge.key, { state, opacity: dim(firstTime ? f : 1), draw: 1, highlight: 1, pulses: [], current: onEdge, label: f, emphasis, dimmed, highlighted });
      continue;
    }
    const travel = windowed(e, 0, T, EASE.travel);
    const pulseOpacity = travel < 1 ? 1 : 1 - windowed(e, T - 60, T + 90, EASE.exit);
    const pulses = options.indicator !== 'none' && pulseOpacity > 0 && travel > 0 ? onEdge.map((message) => ({ at: travel, opacity: pulseOpacity, message })) : [];
    edges.set(edge.key, {
      state,
      opacity: dim(1),
      draw: firstTime ? travel : 1,
      highlight: 1,
      pulses,
      current: onEdge,
      label: windowed(e, 0.5 * T, T, EASE.enter),
      emphasis,
      dimmed,
      highlighted,
    });
  }

  // -- nodes ----------------------------------------------------------------------------------------------------
  const nodes = new Map<string, NodeState>();
  const depthNow = model.depths[k + 1] ?? new Map<string, number>();
  const depthBefore = model.depths[k] ?? new Map<string, number>();
  /** Sender and receiver roles of a node in a step (concurrent steps have several messages). */
  const roles = (step: typeof current, id: string) => {
    let sender = false;
    let receiver = false;
    for (const m of step?.messages ?? []) {
      const [from, to] = model.ends.get(m) ?? [step?.from, step?.to];
      if (from === id) sender = true;
      if (to === id) receiver = true;
    }
    if (step && !step.messages.length && (step.from === id || step.to === id)) sender = true;
    return { sender, receiver, any: sender || receiver };
  };
  for (const n of topology.nodes) {
    let opacity = 1;
    const cStep = model.createStep.get(n.id);
    if (cStep !== undefined && cStep >= 0) {
      if (cStep > k) opacity = restingOpacity('future', cStep, k, options);
      else if (cStep === k) opacity = windowed(e, 0, minimal ? DURATION.fast : DURATION.base, EASE.enter);
    }
    const dStep = model.destroyStep.get(n.id);
    const destroyed = dStep !== undefined && (dStep < k || (dStep === k && e >= T));
    if (destroyed) opacity = Math.min(opacity, OPACITY.muted);

    // The sender lights up as the step starts, the receiver when the message arrives.
    const now = roles(current, n.id);
    let glow = Math.max(now.sender ? windowed(e, 0, 120) : 0, now.receiver ? windowed(e, T, T + DURATION.fast) : 0);
    if (!now.any && roles(previous, n.id).any) glow = 1 - windowed(e, 0, DURATION.base, EASE.exit);

    const before = depthBefore.get(n.id) ?? 0;
    const after = depthNow.get(n.id) ?? 0;
    // Rings change as the step's message arrives, like activation bars in the sequence view.
    const change = k < 0 ? 1 : minimal ? 1 : windowed(e, T, T + DURATION.base, EASE.standard);
    const ring = before === after ? (after > 0 ? 1 : 0) : after > before ? (before > 0 ? 1 : change) : after > 0 ? 1 : 1 - change;
    const depth = Math.max(before, after) > 0 ? (change >= 1 ? after : Math.max(before, after)) : 0;

    const focused = focus?.has(n.id) || undefined;
    const dimmed = (focus && !focus.has(n.id)) || undefined;
    nodes.set(n.id, {
      opacity: dimmed ? Math.min(opacity, OPACITY.dim) : opacity,
      glow: focused ? 1 : Math.max(0, glow),
      ring,
      depth,
      destroyed,
      focused,
      dimmed,
      highlighted: highlight?.has(n.id) || undefined,
    });
  }

  // -- clusters -------------------------------------------------------------------------------------------------
  const clusters = new Map<string, ClusterState>();
  for (const c of topology.clusters) {
    const active = Math.max(0, ...c.members.map((m) => nodes.get(m)?.glow ?? 0));
    clusters.set(c.id, { opacity: 1, active });
  }

  return { position, edges, nodes, clusters };
}
