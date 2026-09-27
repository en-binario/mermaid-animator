import { describe, expect, it } from 'vitest';
import { adaptiveDwellMs, buildTimeline, CLEAR_MS, compileDiagram, fnv1a64, positionAt, resolvePosition, snapTime, stepEnd, transitionOf, travelMs } from '../src';

const compile = (body: string, options = {}) => {
  const result = compileDiagram(`sequenceDiagram\n${body}`, options);
  if (!result.sequence) throw new Error(JSON.stringify(result.diagnostics));
  return { ...result.sequence.compiled, timeline: result.sequence.timeline, diagnostics: result.diagnostics };
};

describe('fnv1a64', () => {
  it('matches the reference FNV-1a 64-bit values', () => {
    const reference = (text: string) => {
      let h = 0xcbf29ce484222325n;
      for (const b of new TextEncoder().encode(text)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
      const hi = Number(h >> 32n).toString(36).padStart(7, '0');
      const lo = Number(h & 0xffffffffn).toString(36).padStart(7, '0');
      return hi + lo;
    };
    for (const text of ['', 'a', 'message|A|B|#0', 'ünïcödé ♥ 😀']) expect(fnv1a64(text)).toBe(reference(text));
  });
});

describe('step list', () => {
  it('produces one step per message and per note, in source order', () => {
    const { steps } = compile('A->>B: one\nB->>C: two\nNote over C: n\nC->>A: three');
    expect(steps.map((s) => [s.index, s.kind, s.label])).toEqual([
      [0, 'message', 'one'],
      [1, 'message', 'two'],
      [2, 'note', 'n'],
      [3, 'message', 'three'],
    ]);
  });

  it('attaches notes to the previous step or hides them when configured', () => {
    expect(compile('A->>B: one\nNote over B: n', { notes: 'attach' }).steps).toHaveLength(1);
    expect(compile('A->>B: one\nNote over B: n', { notes: 'hidden' }).steps).toHaveLength(1);
  });

  it('merges an explicit activate into the preceding message that it follows', () => {
    const { steps } = compile('User->>Gateway: login\nactivate Gateway\nGateway->>Auth: verify\ndeactivate Gateway');
    expect(steps).toHaveLength(2);
    expect(steps[0]?.activations).toEqual([{ participant: 'Gateway', on: true }]);
    expect(steps[1]?.activations).toEqual([{ participant: 'Gateway', on: false }]);
    expect(steps[0]?.sources.map((r) => r.startLine)).toEqual([1, 2]);
  });

  it('attaches an activate to the following message when the sender is activated first', () => {
    const { steps } = compile('Note over A: start\nactivate A\nA->>B: go\ndeactivate A');
    expect(steps.map((s) => [s.kind, s.activations])).toEqual([
      ['note', []],
      ['message', [{ participant: 'A', on: true }, { participant: 'A', on: false }]],
    ]);
  });

  it('keeps shorthand activations on their message', () => {
    const { steps } = compile('A->>+B: go\nB-->>-A: back');
    expect(steps.map((s) => s.activations)).toEqual([[{ participant: 'B', on: true }], [{ participant: 'B', on: false }]]);
  });

  it('makes an activation with no eligible neighbour its own step', () => {
    const { steps } = compile('Note over A: n\nactivate Z\nNote over A: m');
    expect(steps.map((s) => s.kind)).toEqual(['note', 'activation', 'note']);
  });

  it('merges create into the next message and destroy into its adjacent message', () => {
    const { steps } = compile('create participant Log\nApp->>Log: open\ndestroy Log\nApp-xLog: close');
    expect(steps.map((s) => [s.label, s.creates, s.destroys])).toEqual([
      ['open', ['Log'], []],
      ['close', [], ['Log']],
    ]);
  });

  it('plays only the first alt branch and leaves the others unplayed', () => {
    const { steps, unplayed } = compile('alt valid\nA->>B: v1\nA->>B: v2\nelse invalid\nA->>B: i1\nend');
    expect(steps.map((s) => s.label)).toEqual(['v1', 'v2']);
    expect(unplayed.size).toBe(1);
    expect(steps[0]?.fragmentPath).toEqual([expect.objectContaining({ kind: 'alt', branch: 0, branchLabel: 'valid' })]);
  });

  it('plays loops once and par lanes in sequence, recording the fragment path', () => {
    const { steps } = compile('loop retry\npar a\nA->>B: x\nand b\nC->>D: y\nend\nend');
    expect(steps.map((s) => [s.label, s.fragmentPath.map((f) => `${f.kind}${f.branch}${f.iteration ? `#${f.iteration}/${f.of}` : ''}`)])).toEqual([
      ['x', ['loop0#1/1', 'par0']],
      ['y', ['loop0#1/1', 'par1']],
    ]);
  });

  it('has contiguous indices and is deterministic', () => {
    const body = 'A->>B: a\nloop l\nB->>C: b\nend\nNote over C: n\nC-->>A: c';
    const a = compile(body);
    const b = compile(body);
    expect(a.steps.map((s) => s.index)).toEqual(a.steps.map((_, i) => i));
    expect(JSON.stringify(a.steps)).toBe(JSON.stringify(b.steps));
  });
});

describe('stable identities', () => {
  const lines = ['A->>B: login', 'B->>C: verify', 'C-->>B: ok', 'B-->>A: token', 'A->>B: login', 'Note over A: done'];

  it('keeps other ids when an unrelated statement is inserted anywhere', () => {
    const base = compile(lines.join('\n')).steps;
    for (let at = 0; at <= lines.length; at++) {
      const edited = [...lines.slice(0, at), 'X->>Y: unrelated', ...lines.slice(at)];
      const ids = compile(edited.join('\n')).steps.filter((s) => s.label !== 'unrelated');
      expect(ids.map((s) => s.id)).toEqual(base.map((s) => s.id));
      expect(ids.map((s) => s.structuralId)).toEqual(base.map((s) => s.structuralId));
    }
  });

  it('changes only the edited step id on a label edit, never its structuralId', () => {
    const base = compile(lines.join('\n')).steps;
    const edited = compile(lines.map((l) => (l === 'B->>C: verify' ? 'B->>C: verify credentials' : l)).join('\n')).steps;
    expect(edited.map((s) => s.structuralId)).toEqual(base.map((s) => s.structuralId));
    expect(edited.filter((s, i) => s.id !== base[i]?.id).map((s) => s.label)).toEqual(['verify credentials']);
  });

  it('distinguishes repeated identical messages by occurrence', () => {
    const steps = compile(lines.join('\n')).steps;
    expect(steps[0]?.id).not.toBe(steps[4]?.id);
  });

  it('uses @step-id when given', () => {
    expect(compile('%% @step-id sign-in\nA->>B: login').steps[0]?.id).toBe('sign-in');
  });
});

describe('timing', () => {
  it('uses the logical column span, clamped to 280–900 ms', () => {
    expect(travelMs(1)).toBe(315);
    expect(travelMs(0)).toBe(315);
    expect(travelMs(3)).toBe(505);
    expect(travelMs(20)).toBe(900);
  });

  it('computes the adaptive dwell from label and caption words', () => {
    expect(adaptiveDwellMs('POST /login')).toBe(710);
    expect(adaptiveDwellMs('row')).toBe(600);
    expect(adaptiveDwellMs('x '.repeat(40))).toBe(4000);
  });

  it('matches the specification example (adjacent columns, POST /login)', () => {
    const [step] = compile('participant U\nparticipant G\nU->>G: POST /login').steps;
    expect(step?.timing).toMatchObject({ transitionMs: 315, dwellMs: 710 });
  });

  it('is independent of layout: self messages count as one column', () => {
    expect(compile('A->>A: think').steps[0]?.timing.transitionMs).toBe(315);
    expect(compile('participant A\nparticipant B\nparticipant C\nA->>C: far').steps[0]?.timing.transitionMs).toBe(410);
  });

  it('supports fixed dwell and annotation overrides', () => {
    expect(compile('A->>B: x', { dwell: 'fixed', dwellMs: 900 }).steps[0]?.timing.dwellMs).toBe(900);
    const { steps } = compile('%% @duration 500ms\n%% @pause 2s\nA->>B: x\n%% @speed 2x\nA->>B: y\n%% @pause\nA->>B: z');
    expect(steps.map((s) => s.timing)).toEqual([
      expect.objectContaining({ transitionMs: 500, dwellMs: 2000, hold: false }),
      expect.objectContaining({ transitionMs: 157.5, dwellMs: 300, hold: false }),
      expect.objectContaining({ hold: true }),
    ]);
  });
});

describe('annotation effects', () => {
  it('skips, merges, emphasises and stores captions and chapters', () => {
    const { steps, initial } = compile(
      ['%% @skip', 'A->>B: static', '%% @chapter "Sign in"', '%% @caption "The user logs in."', '%% @with-next', 'A->>B: one', 'B->>C: two', '%% @emphasis', 'C-->>A: three'].join('\n'),
    );
    expect(initial.messages).toHaveLength(1);
    expect(steps.map((s) => [s.label, s.messages.length, s.chapter, s.caption, s.emphasis])).toEqual([
      ['one · two', 2, 'Sign in', 'The user logs in.', undefined],
      ['three', 1, undefined, undefined, true],
    ]);
  });

  it('applies @type to the next declaration and warns about dangling directives', () => {
    const result = compile('%% @type database\nparticipant L\nA->>L: write\n%% @pause 1s');
    expect(result.participantKinds.L).toBe('database');
    expect(result.diagnostics.map((d) => d.code)).toContain('annotation/no-target');
  });
});

describe('timeline', () => {
  const { steps, timeline } = compile('participant A\nparticipant B\nA->>B: one\nB->>A: two');

  it('lays out transition windows followed by dwells', () => {
    expect(timeline.starts).toEqual([0, 315 + steps[0]!.timing.dwellMs]);
    expect(timeline.duration).toBe(steps.reduce((t, s) => t + s.timing.transitionMs + s.timing.dwellMs, 0));
  });

  it('reports positions', () => {
    expect(positionAt(timeline, 0)).toEqual({ index: -1, phase: 'initial', progress: 0, elapsed: 0, cleared: 0 });
    expect(positionAt(timeline, 157.5)).toMatchObject({ index: 0, phase: 'transition', progress: 0.5 });
    expect(positionAt(timeline, stepEnd(timeline, 0))).toMatchObject({ index: 0, phase: 'dwell', progress: 1 });
    expect(positionAt(timeline, timeline.duration + 100)).toMatchObject({ index: 1, phase: 'dwell' });
  });

  it('snaps to the nearest step boundary', () => {
    expect(snapTime(timeline, 50)).toBe(0);
    expect(snapTime(timeline, 300)).toBe(stepEnd(timeline, 0));
    expect(stepEnd(timeline, 0)).toBe(315 + 240);
    expect(snapTime(timeline, timeline.starts[1]! + 200)).toBe(stepEnd(timeline, 1));
  });

  it('builds an empty timeline for no steps', () => {
    expect(buildTimeline([])).toEqual({ starts: [], transitions: [], settles: [], dwells: [], holds: [], duration: 0 });
    expect(buildTimeline([], { overview: true, leadInMs: 900 })).toEqual({ starts: [], transitions: [], settles: [], dwells: [], holds: [], duration: 0 });
  });
});

describe('timeline with the initial overview', () => {
  const source = 'participant A\nparticipant B\nA->>B: one\nB->>A: two';
  const plain = compile(source, { dwellMs: 900 }).timeline;
  const { compiled: { steps }, timeline } = compileDiagram(`sequenceDiagram\n${source}`, { overview: true, dwellMs: 900 }).sequence!;

  it('leaves the timeline unchanged without the overview', () => {
    expect(compileDiagram(`sequenceDiagram\n${source}`, { overview: false, dwellMs: 900 }).sequence!.timeline).toEqual(plain);
    expect(plain.clear).toBeUndefined();
  });

  it('rests on the overview for the lead-in, then clears inside step 0', () => {
    expect(timeline.clear).toBe(CLEAR_MS);
    expect(timeline.starts[0]).toBe(900);
    expect(timeline.transitions[0]).toBe(plain.transitions[0]! + CLEAR_MS);
    expect(transitionOf(timeline, 0)).toBe(plain.transitions[0]);
    expect(transitionOf(timeline, 1)).toBe(plain.transitions[1]);
    expect(timeline.duration).toBe(plain.duration + 900 + CLEAR_MS);
    expect(steps).toHaveLength(2);
  });

  it('reports the overview until step 0 starts, then the clear before the step draws', () => {
    expect(positionAt(timeline, 0)).toMatchObject({ index: -1, phase: 'initial', cleared: 0 });
    expect(positionAt(timeline, 900)).toMatchObject({ index: -1, phase: 'initial', cleared: 0 });
    expect(positionAt(timeline, 900 + CLEAR_MS / 2)).toMatchObject({ index: 0, phase: 'transition', progress: 0, cleared: 0.5, elapsed: -CLEAR_MS / 2 });
    expect(positionAt(timeline, 900 + CLEAR_MS)).toMatchObject({ index: 0, cleared: 1, elapsed: 0 });
    expect(positionAt(timeline, 900 + CLEAR_MS + plain.transitions[0]! / 2)).toMatchObject({ index: 0, phase: 'transition', progress: 0.5 });
    expect(positionAt(timeline, stepEnd(timeline, 0))).toMatchObject({ index: 0, phase: 'dwell', cleared: 1 });
    expect(positionAt(timeline, timeline.starts[1]! + 1)).toMatchObject({ index: 1, cleared: 1 });
  });

  it('keeps step boundaries for snapping and resting', () => {
    expect(stepEnd(timeline, -1)).toBe(0);
    expect(stepEnd(timeline, 0)).toBe(900 + CLEAR_MS + plain.transitions[0]! + 240);
    expect(snapTime(timeline, 100)).toBe(0);
    expect(snapTime(timeline, stepEnd(timeline, 0) - 20)).toBe(stepEnd(timeline, 0));
  });
});

describe('resolvePosition', () => {
  const before = compile('A->>B: one\nB->>C: two\nC->>D: three').steps;

  it('keeps the step while its label is edited', () => {
    const after = compile('A->>B: one\nB->>C: tw\nC->>D: three').steps;
    expect(resolvePosition(before, 1, after)).toBe(1);
  });

  it('follows the step when statements are inserted before it', () => {
    const after = compile('X->>Y: new\nA->>B: one\nB->>C: two\nC->>D: three').steps;
    expect(resolvePosition(before, 1, after)).toBe(2);
  });

  it('falls back to the cursor, then to the nearest preceding survivor', () => {
    const replaced = compile('A->>B: one\nQ->>R: other\nC->>D: three').steps;
    expect(resolvePosition(before, 1, replaced, 2)).toBe(1);
    expect(resolvePosition(before, 1, replaced)).toBe(0);
  });

  it('keeps the initial state', () => {
    expect(resolvePosition(before, -1, before)).toBe(-1);
  });
});

describe('sidecar step keys', () => {
  it('resolves #n, step ids and structural ids, and applies captions below annotations', async () => {
    const { compileDiagram, resolveStepKey } = await import('../src');
    const src = 'sequenceDiagram\nA->>B: one\n%% @step-id sign-in\nB->>A: two\n%% @caption "From the annotation"\nA->>B: three';
    const steps = compileDiagram(src).sequence!.compiled.steps;
    expect(resolveStepKey(steps, '#3')).toBe(2);
    expect(resolveStepKey(steps, '#9')).toBeUndefined();
    expect(resolveStepKey(steps, 'sign-in')).toBe(1);
    expect(resolveStepKey(steps, steps[0]!.structuralId)).toBe(0);
    expect(resolveStepKey(steps, 'missing')).toBeUndefined();
    const withSidecar = compileDiagram(src, { stepCaptions: { 0: 'From the sidecar', 2: 'Ignored' }, stepChapters: { 1: 'Session' } }).sequence!.compiled.steps;
    expect(withSidecar[0]!.caption).toBe('From the sidecar');
    expect(withSidecar[2]!.caption).toBe('From the annotation');
    expect(withSidecar[1]!.chapter).toBe('Session');
  });
});
