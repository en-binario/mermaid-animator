import { describe, expect, it } from 'vitest';
import { annotationTargets, compileDiagram, DIRECTIVE_DOCS, DIRECTIVE_NAMES, fragmentKeys, parseAnnotations, parseSequence, travelMs, type CompileOptions } from '../src';

const compile = (body: string, options: CompileOptions = {}) => {
  const d = compileDiagram(`sequenceDiagram\n${body}`, options);
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  return { ...d.sequence.compiled, diagnostics: d.diagnostics, timeline: d.sequence.timeline };
};
const labels = (steps: { label: string }[]) => steps.map((s) => s.label);

describe('fragment keys', () => {
  it('derive from kind, label and occurrence, independent of unrelated edits', () => {
    const before = parseSequence('sequenceDiagram\nalt ok\nA->>B: x\nend\nloop again\nB->>A: y\nend\nalt ok\nA->>B: z\nend').model;
    const after = parseSequence('sequenceDiagram\nC->>D: inserted\nalt ok\nA->>B: x\nend\nloop again\nB->>A: y\nend\nalt ok\nA->>B: z\nend').model;
    expect([...fragmentKeys(before).values()]).toEqual(['alt|ok#0', 'loop|again#0', 'alt|ok#1']);
    expect([...fragmentKeys(after).values()]).toEqual([...fragmentKeys(before).values()]);
  });
});

describe('loops', () => {
  const body = '%% @iterations 3\nloop retry\nA->>B: try\nB-->>A: fail\nend';

  it('play @iterations times with iteration frames and compressed repeats', () => {
    const { steps } = compile(body);
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.fragmentPath[0]?.iteration)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(steps.every((s) => s.fragmentPath[0]?.of === 3)).toBe(true);
    expect(steps[2]!.timing.transitionMs).toBe(steps[0]!.timing.transitionMs / 2);
    expect(steps[2]!.timing.dwellMs).toBe(steps[0]!.timing.dwellMs / 2);
  });

  it('do not compress when compressRepeats is false, and use the default iteration count', () => {
    expect(compile(body, { compressRepeats: false }).steps[2]!.timing.transitionMs).toBe(travelMs(1));
    expect(compile('loop l\nA->>B: x\nend', { loopIterations: 2 }).steps).toHaveLength(2);
  });

  it('give every iteration its own stable identity', () => {
    const three = compile(body).steps.map((s) => s.id);
    const four = compile(body.replace('3', '4')).steps.map((s) => s.id);
    expect(new Set(three).size).toBe(6);
    expect(four.slice(0, 6)).toEqual(three);
  });

  it('cap iterations at 50 with a warning', () => {
    const r = compile('%% @iterations 500\nloop l\nA->>B: x\nend');
    expect(r.steps).toHaveLength(50);
    expect(r.diagnostics.map((d) => d.code)).toContain('annotation/iterations-capped');
  });
});

describe('branch selection', () => {
  const alt = 'alt valid\nA->>B: v1\nA->>B: v2\nelse invalid\nA->>B: i1\nend';

  it('plays the first branch by default and keeps the others unplayed', () => {
    const r = compile(alt);
    expect(labels(r.steps)).toEqual(['v1', 'v2']);
    expect(r.unplayed.size).toBe(1);
    expect(r.fragments[0]).toMatchObject({ key: 'alt|valid#0', kind: 'alt', branches: ['valid', 'invalid'], selected: 0 });
  });

  it('honours @branch by number and by label', () => {
    expect(labels(compile(`%% @branch 2\n${alt}`).steps)).toEqual(['i1']);
    expect(labels(compile(`%% @branch "invalid"\n${alt}`).steps)).toEqual(['i1']);
  });

  it('warns about an unknown branch label', () => {
    expect(compile(`%% @branch "nope"\n${alt}`).diagnostics.map((d) => d.code)).toContain('annotation/unknown-branch');
  });

  it('lets inspector choices win over annotations and settings', () => {
    const r = compile(`%% @branch 2\n${alt}`, { altBranches: 'all', branchChoices: { 'alt|valid#0': 0 } });
    expect(labels(r.steps)).toEqual(['v1', 'v2']);
  });

  it('plays every branch in order with altBranches = all', () => {
    const r = compile(alt, { altBranches: 'all' });
    expect(labels(r.steps)).toEqual(['v1', 'v2', 'i1']);
    expect(r.unplayed.size).toBe(0);
    expect(r.steps.map((s) => s.fragmentPath[0]?.branch)).toEqual([0, 0, 1]);
  });

  it('flags a pending choice and holds the step before it with altBranches = ask', () => {
    const r = compile(`X->>Y: before\n${alt}`, { altBranches: 'ask' });
    expect(r.steps[1]!.choice).toEqual({ fragmentKey: 'alt|valid#0', labels: ['valid', 'invalid'] });
    expect(r.steps[0]!.timing.hold).toBe(true);
    expect(r.fragments[0]!.pending).toBe(true);
    const chosen = compile(`X->>Y: before\n${alt}`, { altBranches: 'ask', branchChoices: { 'alt|valid#0': 1 } });
    expect(chosen.steps[1]!.choice).toBeUndefined();
    expect(labels(chosen.steps)).toEqual(['before', 'i1']);
  });

  it('skips an opt when chosen', () => {
    const r = compile('opt maybe\nA->>B: x\nend\nB->>A: y', { branchChoices: { 'opt|maybe#0': 'skip' } });
    expect(labels(r.steps)).toEqual(['y']);
    expect(labels(compile('%% @branch skip\nopt maybe\nA->>B: x\nend').steps)).toEqual([]);
  });
});

describe('concurrent par lanes', () => {
  const par = 'participant A\nparticipant B\nparticipant C\nparticipant D\npar left\nA->>B: l1\nB->>A: l2\nand right\nA->>D: r1\nend';

  it('zip the k-th step of each lane into one step with lanes and sources', () => {
    const { steps } = compile(par, { parallel: 'concurrent' });
    expect(steps).toHaveLength(2);
    expect(steps[0]!.messages).toHaveLength(2);
    expect(steps[0]!.lanes?.map((l) => [l.lane, l.label])).toEqual([[0, 'left'], [1, 'right']]);
    expect(steps[0]!.sources.map((r) => r.startLine)).toEqual([6, 9]);
    expect(steps[1]!.lanes).toBeUndefined();
    expect(steps.map((s) => s.index)).toEqual([0, 1]);
  });

  it('last as long as the slowest lane', () => {
    const { steps } = compile(par, { parallel: 'concurrent' });
    expect(steps[0]!.timing.transitionMs).toBe(travelMs(3));
  });

  it('play lanes one after another when sequential', () => {
    expect(labels(compile(par, { parallel: 'sequential' }).steps)).toEqual(['l1', 'l2', 'r1']);
  });
});

describe('annotation targets and effects', () => {
  it('resolve statement, fragment and declaration targets and report dangling ones', () => {
    const source = 'sequenceDiagram\n%% @type database\nparticipant L\n%% @caption "c"\nA->>L: x\n%% @iterations 2\nloop l\nA->>L: y\nend\n%% @pause 1s';
    const { model } = parseSequence(source);
    const { annotations } = parseAnnotations(source);
    const { targets, dangling } = annotationTargets(model, annotations);
    expect(targets.map((t) => [t.annotation.name, t.kind, t.range.startLine])).toEqual([
      ['type', 'declaration', 2],
      ['caption', 'statement', 4],
      ['iterations', 'fragment', 6],
    ]);
    expect(dangling.map((a) => a.name)).toEqual(['pause']);
  });

  it('apply @focus and @latency to their steps', () => {
    const { steps } = compile('%% @focus A, B\n%% @latency 40ms\nA->>B: x');
    expect(steps[0]!.focus).toEqual(['A', 'B']);
    expect(steps[0]!.timing.latencyMs).toBe(40);
  });

  it('document every directive', () => {
    expect(Object.keys(DIRECTIVE_DOCS).sort()).toEqual([...DIRECTIVE_NAMES].sort());
  });
});
