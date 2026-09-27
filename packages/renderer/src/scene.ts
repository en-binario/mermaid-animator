/**
 * The scene: visual state of every element as a pure function of playback time (spec §13.7,
 * FR-ANIM-01). Choreography windows follow spec §9.8.3; step states follow §9.7.
 */
import { positionAt, transitionOf, type CompiledSequence, type Position, type SequenceLayout, type Step, type Timeline } from '@mermaid-animator/core';
import { DURATION, EASE, springy, windowed } from './easing';

export type MotionProfile = 'formal' | 'expressive' | 'minimal' | 'none';
export type ElementState = 'future' | 'current' | 'past' | 'unplayed' | 'static';

export interface DisplayOptions {
  futureSteps: 'hidden' | 'ghosted' | 'visible';
  pastSteps: 'full' | 'muted' | 'trail';
  trailLength: number;
  motion: MotionProfile;
  indicator: 'pulse' | 'comet' | 'none';
  /** Step 0 shows the complete diagram, cleared at the start of step 1 (spec initial-overview). */
  overview?: boolean;
}

export const DEFAULT_DISPLAY: DisplayOptions = { futureSteps: 'hidden', pastSteps: 'full', trailLength: 3, motion: 'formal', indicator: 'pulse' };

/** Applies reduced motion (spec §9.8.4): Minimal profile, no travelling indicator. */
export function effectiveDisplay(options: DisplayOptions, reducedMotion: boolean): DisplayOptions {
  if (!reducedMotion) return options;
  return { ...options, motion: options.motion === 'none' ? 'none' : 'minimal', indicator: 'none' };
}

export const OPACITY = { ghost: 0.12, dim: 0.18, muted: 0.45 } as const;

export interface MessageState {
  state: ElementState;
  opacity: number;
  /** 0–1 fraction of the path drawn. */
  draw: number;
  head: number;
  headScale: number;
  label: number;
  labelRise: number;
  /** Accent highlight overlay (current step, fading when it becomes past). */
  highlight: number;
  pulse?: { at: number; opacity: number };
  emphasis: boolean;
  /** Outside the current focus (spec exploration). */
  dimmed?: boolean;
  highlighted?: boolean;
}

export interface NoteState {
  state: ElementState;
  opacity: number;
  rise: number;
  dimmed?: boolean;
}

export interface ParticipantState {
  opacity: number;
  headerDy: number;
  /** Accent overlay on the lifeline (0–1). */
  glow: number;
  /** 0–1 progress of the destruction mark; 0 means the lifeline runs to its full length. */
  destroyed: number;
  /** Part of the current focus: lifeline emphasised. */
  focused?: boolean;
  highlighted?: boolean;
}

export interface ActivationState {
  opacity: number;
  /** Current visible bottom of the bar. */
  y2: number;
  ghost: boolean;
  dimmed?: boolean;
}

export interface FragmentState {
  opacity: number;
  /** Brass illumination while its steps play. */
  active: number;
  /** Loop iteration shown in the tab while the loop plays. */
  iteration?: { n: number; of: number };
}

/** Per-frame inputs that are not part of the timeline. */
export interface SceneInputs {
  /** Focused participants (spec exploration); empty or undefined means no focus. */
  focus?: ReadonlySet<string>;
  /** Participant and message ids highlighted from the other view (spec split-view). */
  highlight?: ReadonlySet<string>;
}

export interface Scene {
  position: Position;
  messages: Map<string, MessageState>;
  notes: Map<string, NoteState>;
  participants: Map<string, ParticipantState>;
  activations: ActivationState[];
  fragments: Map<string, FragmentState>;
}

/** Per-diagram lookups computed once, then reused for every frame. */
export interface SceneModel {
  layout: SequenceLayout;
  compiled: CompiledSequence;
  timeline: Timeline;
  /** Steps in which each message animates (several across loop iterations), ascending. */
  messageSteps: Map<string, number[]>;
  noteSteps: Map<string, number[]>;
  /** Furthest row reached up to each step (loops jump back up; bars must not retract). */
  reach: number[];
  /** Participants each note is attached to (for focus dimming). */
  noteParticipants: Map<string, string[]>;
  createStep: Map<string, number>;
  destroyStep: Map<string, number>;
  fragmentSpan: Map<string, [number, number]>;
}

export function prepareScene(layout: SequenceLayout, compiled: CompiledSequence, timeline: Timeline): SceneModel {
  const messageSteps = new Map<string, number[]>();
  const noteSteps = new Map<string, number[]>();
  const add = (map: Map<string, number[]>, id: string, i: number) => map.set(id, [...(map.get(id) ?? []), i]);
  const createStep = new Map<string, number>();
  const destroyStep = new Map<string, number>();
  const fragmentSpan = new Map<string, [number, number]>();
  for (const id of compiled.initial.messages) add(messageSteps, id, -1);
  for (const id of compiled.initial.notes) add(noteSteps, id, -1);
  for (const id of compiled.initial.creates) createStep.set(id, -1);
  for (const id of compiled.initial.destroys) destroyStep.set(id, -1);
  compiled.steps.forEach((s: Step, i) => {
    for (const id of s.messages) add(messageSteps, id, i);
    for (const id of s.notes) add(noteSteps, id, i);
    for (const id of s.creates) createStep.set(id, i);
    for (const id of s.destroys) destroyStep.set(id, i);
    for (const f of s.fragmentPath) {
      const span = fragmentSpan.get(f.fragmentId);
      fragmentSpan.set(f.fragmentId, span ? [span[0], i] : [i, i]);
    }
  });
  const reach: number[] = [];
  layout.stepRows.forEach((row, i) => reach.push(Math.max(row, reach[i - 1] ?? row)));
  const noteParticipants = new Map(layout.notes.map((n) => [n.id, n.participants]));
  return { layout, compiled, timeline, messageSteps, noteSteps, reach, noteParticipants, createStep, destroyStep, fragmentSpan };
}

/** The step that decides an element's state at k: `k` itself if it animates then, else the latest before k, else its first. */
export function stepFor(steps: number[] | undefined, k: number): number | undefined {
  if (!steps?.length) return undefined;
  if (steps.includes(k)) return k;
  let latest: number | undefined;
  for (const s of steps) if (s <= k) latest = s;
  return latest ?? steps[0];
}

export function stateOf(step: number | undefined, k: number, unplayed: boolean): ElementState {
  if (unplayed || step === undefined) return unplayed ? 'unplayed' : 'static';
  if (step < 0) return 'static';
  if (step > k) return 'future';
  return step === k ? 'current' : 'past';
}

export function restingOpacity(state: ElementState, step: number, k: number, o: DisplayOptions): number {
  switch (state) {
    case 'future':
      return o.futureSteps === 'hidden' ? 0 : o.futureSteps === 'ghosted' ? OPACITY.ghost : 1;
    case 'unplayed':
      return OPACITY.ghost;
    case 'past': {
      if (o.pastSteps === 'muted') return OPACITY.muted;
      if (o.pastSteps === 'trail') {
        const age = k - step;
        return age <= o.trailLength ? 1 - (age / (o.trailLength + 1)) * (1 - OPACITY.muted) : OPACITY.muted;
      }
      return 1;
    }
    default:
      return 1;
  }
}

/** Computes the scene at time `t` (ms on the timeline, speed-independent). */
export function sceneAt(model: SceneModel, t: number, options: DisplayOptions = DEFAULT_DISPLAY, inputs: SceneInputs = {}): Scene {
  const position = positionAt(model.timeline, t);
  if (!options.overview || model.compiled.steps.length === 0) return computeScene(model, position, options, inputs);
  // Initial overview (spec initial-overview): the complete diagram before the first step…
  if (position.index < 0) return { ...overviewScene(model, options, inputs), position };
  // …which clears to the pre-reveal state at the start of step 0 (a cut under minimal motion).
  const cut = options.motion === 'minimal' || options.motion === 'none';
  if (position.index === 0 && position.cleared < 1 && !cut) {
    const initial = computeScene(model, INITIAL_POSITION, options, inputs);
    return blendScenes(overviewScene(model, options, inputs), initial, EASE.standard(position.cleared), position);
  }
  return computeScene(model, position, options, inputs);
}

const INITIAL_POSITION: Position = { index: -1, phase: 'initial', progress: 0, elapsed: 0, cleared: 0 };

/** Every element as it rests after the last step, without current-step emphasis. */
function overviewScene(model: SceneModel, options: DisplayOptions, inputs: SceneInputs): Scene {
  const last = model.compiled.steps.length - 1;
  const rest: Position = { index: last, phase: 'dwell', progress: 1, elapsed: Number.POSITIVE_INFINITY, cleared: 1 };
  const scene = computeScene(model, rest, { ...options, pastSteps: 'full', indicator: 'none' }, inputs);
  for (const m of scene.messages.values()) {
    if (m.state === 'current') m.state = 'past';
    m.highlight = 0;
    m.pulse = undefined;
  }
  for (const n of scene.notes.values()) if (n.state === 'current') n.state = 'past';
  for (const p of scene.participants.values()) p.glow = p.focused || p.highlighted ? 1 : 0;
  for (const f of scene.fragments.values()) {
    f.active = 0;
    f.iteration = undefined;
  }
  return scene;
}

const mix = (a: number, b: number, c: number) => a + (b - a) * c;

/** The overview fading into the pre-reveal state: overview geometry, opacities moving toward `to` by `c`. */
function blendScenes(from: Scene, to: Scene, c: number, position: Position): Scene {
  const messages = new Map([...from.messages].map(([id, m]) => [id, { ...m, opacity: mix(m.opacity, to.messages.get(id)?.opacity ?? 0, c) }]));
  const notes = new Map([...from.notes].map(([id, n]) => [id, { ...n, opacity: mix(n.opacity, to.notes.get(id)?.opacity ?? 0, c) }]));
  const participants = new Map(
    [...from.participants].map(([id, p]) => {
      const q = to.participants.get(id);
      return [id, { ...p, opacity: mix(p.opacity, q?.opacity ?? 0, c), destroyed: mix(p.destroyed, q?.destroyed ?? 0, c) }];
    }),
  );
  const activations = from.activations.map((a, i) => ({ ...a, opacity: mix(a.opacity, to.activations[i]?.opacity ?? 0, c) }));
  const fragments = new Map([...from.fragments].map(([id, f]) => [id, { ...f, opacity: mix(f.opacity, to.fragments.get(id)?.opacity ?? 0, c) }]));
  return { position, messages, notes, participants, activations, fragments };
}

function computeScene(model: SceneModel, position: Position, options: DisplayOptions, inputs: SceneInputs): Scene {
  const { layout, compiled, timeline } = model;
  const k = position.index;
  const T = k >= 0 ? transitionOf(timeline, k) : 0;
  // Motion "none" jumps to the end of every window as soon as a step starts.
  const e = options.motion === 'none' && k >= 0 ? Number.POSITIVE_INFINITY : position.elapsed;
  const minimal = options.motion === 'minimal';
  const current = k >= 0 ? compiled.steps[k] : undefined;
  const previous = k >= 1 ? compiled.steps[k - 1] : undefined;
  const focus = inputs.focus && inputs.focus.size ? inputs.focus : undefined;
  // One focused participant: anything touching it; several: interactions among them only.
  const inFocus = (ids: string[]) => !focus || (focus.size === 1 ? ids.some((id) => focus.has(id)) : ids.every((id) => focus.has(id)));
  const lit = (id: string) => inputs.highlight?.has(id) || undefined;

  // -- messages ---------------------------------------------------------------------------------------------
  const messages = new Map<string, MessageState>();
  for (const m of layout.messages) {
    const steps = model.messageSteps.get(m.id);
    const step = stepFor(steps, k);
    const state = stateOf(step, k, compiled.unplayed.has(m.id));
    const emphasis = !!steps?.some((s) => s >= 0 && compiled.steps[s]?.emphasis);
    const dimmed = !inFocus([m.from, m.to]) || undefined;
    const dim = (o: number) => (dimmed ? Math.min(o, OPACITY.dim) : o);
    const base = restingOpacity(state, step ?? -1, k, options);
    if (state !== 'current') {
      const fading = steps?.includes(k - 1) && k >= 0 ? 1 - windowed(e, 0, DURATION.base, EASE.exit) : 0;
      messages.set(m.id, { state, opacity: dim(base), draw: 1, head: 1, headScale: 1, label: 1, labelRise: 0, highlight: fading, emphasis, dimmed, highlighted: lit(m.id) });
      continue;
    }
    if (minimal) {
      const f = windowed(e, 0, DURATION.fast, EASE.linear);
      messages.set(m.id, { state, opacity: dim(f), draw: 1, head: 1, headScale: 1, label: f, labelRise: 0, highlight: 1, emphasis, dimmed, highlighted: lit(m.id) });
      continue;
    }
    const draw = windowed(e, 0, T, EASE.travel);
    const label = windowed(e, 0.6 * T, T, EASE.enter);
    const head = windowed(e, T - 60, T + 90, EASE.standard);
    const scaleEase = options.motion === 'expressive' ? springy : EASE.standard;
    const pulseOpacity = draw < 1 ? 1 : 1 - windowed(e, T - 60, T + 90, EASE.exit);
    messages.set(m.id, {
      state,
      opacity: dim(1),
      dimmed,
      draw,
      head,
      headScale: 0.6 + 0.4 * windowed(e, T - 60, T + 90, scaleEase),
      label,
      labelRise: 4 * (1 - label),
      highlight: 1,
      pulse: options.indicator !== 'none' && pulseOpacity > 0 && draw > 0 ? { at: draw, opacity: pulseOpacity } : undefined,
      emphasis,
      highlighted: lit(m.id),
    });
  }

  // -- notes --------------------------------------------------------------------------------------------------
  const notes = new Map<string, NoteState>();
  const noteParticipants = model.noteParticipants;
  for (const n of layout.notes) {
    const step = stepFor(model.noteSteps.get(n.id), k);
    const state = stateOf(step, k, compiled.unplayed.has(n.id));
    const involved = noteParticipants.get(n.id) ?? [];
    const dimmed = (focus && !involved.some((p) => focus.has(p))) || undefined;
    const dim = (o: number) => (dimmed ? Math.min(o, OPACITY.dim) : o);
    if (state === 'current') {
      const f = windowed(e, 0, minimal ? DURATION.fast : DURATION.base, EASE.enter);
      notes.set(n.id, { state, opacity: dim(f), rise: minimal ? 0 : 4 * (1 - f), dimmed });
    } else notes.set(n.id, { state, opacity: dim(restingOpacity(state, step ?? -1, k, options)), rise: 0, dimmed });
  }

  // -- participants -------------------------------------------------------------------------------------------
  const participants = new Map<string, ParticipantState>();
  // Sender lifeline lights up as the step starts; the receiver's when the message arrives.
  const glowIn = (id: string) => {
    if (!current) return 0;
    if (current.from === id) return windowed(e, 0, 120);
    if (current.to === id) return windowed(e, T, T + DURATION.fast);
    return 0;
  };
  for (const p of layout.participants) {
    const cStep = model.createStep.get(p.id);
    let opacity = 1;
    let headerDy = 0;
    if (cStep !== undefined && cStep >= 0) {
      if (cStep > k) opacity = restingOpacity('future', cStep, k, options);
      else if (cStep === k) {
        const f = windowed(e, 0, minimal ? DURATION.fast : DURATION.base, EASE.enter);
        opacity = f;
        headerDy = minimal ? 0 : -8 * (1 - f);
      }
    }
    let glow = glowIn(p.id);
    if (previous && (previous.from === p.id || previous.to === p.id) && glow === 0) glow = 1 - windowed(e, 0, DURATION.base, EASE.exit);
    const dStep = model.destroyStep.get(p.id);
    let destroyed = 0;
    if (dStep !== undefined) {
      if (dStep < 0 || dStep < k) destroyed = 1;
      else if (dStep === k) destroyed = minimal ? (e > 0 ? 1 : 0) : windowed(e, T, T + DURATION.fast);
    }
    const focused = !!focus?.has(p.id) || undefined;
    const highlighted = lit(p.id);
    participants.set(p.id, { opacity, headerDy, glow: focused || highlighted ? 1 : Math.max(0, glow), destroyed, focused, highlighted });
  }

  // -- activations --------------------------------------------------------------------------------------------
  const drawNow = k >= 0 ? (minimal ? 1 : windowed(e, 0, T, EASE.travel)) : 0;
  const reach = model.reach;
  const rowNow = k < 0 ? 0 : k === 0 ? (reach[0] as number) : (reach[k - 1] as number) + ((reach[k] as number) - (reach[k - 1] as number)) * drawNow;
  const activations: ActivationState[] = layout.activations.map((a) => ({ ...activationState(a), dimmed: (focus && !focus.has(a.participant)) || undefined }));
  function activationState(a: (typeof layout.activations)[number]): ActivationState {
    const minBottom = a.y1 + 10;
    if (a.startStep >= 0 && (k < a.startStep || (k === a.startStep && e < T))) {
      const future = restingOpacity('future', a.startStep, k, options);
      if (k === a.startStep || future === 0) return { opacity: 0, y2: minBottom, ghost: false };
      return { opacity: future, y2: a.y2, ghost: true };
    }
    if (k === a.startStep) {
      const g = minimal ? 1 : windowed(e, T, T + DURATION.base, EASE.standard);
      return { opacity: g, y2: a.y1 + 10 * g, ghost: false };
    }
    if (a.endStep !== undefined && k > a.endStep) return { opacity: restingOpacity('past', a.endStep, k, options), y2: a.y2, ghost: false };
    // The bar extends with the conversation until it reaches its closing row.
    return { opacity: 1, y2: Math.min(a.y2, Math.max(minBottom, rowNow + 10)), ghost: false };
  }

  // -- fragments ----------------------------------------------------------------------------------------------
  const fragments = new Map<string, FragmentState>();
  for (const f of layout.fragments) {
    const span = model.fragmentSpan.get(f.id);
    if (!span) {
      fragments.set(f.id, { opacity: 1, active: 0 });
      continue;
    }
    const [first, last] = span;
    let opacity = 1;
    if (k < first) opacity = restingOpacity('future', first, k, options);
    else if (k === first) opacity = Math.max(restingOpacity('future', first, first - 1, options), windowed(e, 0, DURATION.base, EASE.enter));
    let active = 0;
    if (k >= first && k <= last) active = k === first ? windowed(e, 0, minimal ? DURATION.fast : DURATION.slow, EASE.standard) : 1;
    else if (k === last + 1) active = 1 - windowed(e, 0, DURATION.base, EASE.exit);
    const frame = current?.fragmentPath.find((p) => p.fragmentId === f.id);
    const iteration = frame?.iteration && frame.of && frame.of > 1 ? { n: frame.iteration, of: frame.of } : undefined;
    fragments.set(f.id, { opacity, active, iteration });
  }

  return { position, messages, notes, participants, activations, fragments };
}
