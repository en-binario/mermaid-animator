import { describe, expect, it } from 'vitest';
import { compileDiagram, type Step } from '@mermaid-animator/core';
import { chapterIndexAt, chapterTarget, contextText, deriveChapters, focusSkipSet, parseInline, stepInvolves, transcript } from '../src/narrative';
import { announcement } from '../src/announce';
import { buildSearchIndex, search } from '../src/search';
import { format } from '../src/state';
import { WEBVIEW_STRINGS } from '@mermaid-animator/protocol';

const t = (key: string, ...args: (string | number)[]) => format(WEBVIEW_STRINGS, key, ...args);

function compile(body: string) {
  const d = compileDiagram(`sequenceDiagram\n${body}`, {});
  if (!d.sequence) throw new Error(JSON.stringify(d.diagnostics));
  return d.sequence;
}

describe('parseInline', () => {
  it('parses bold, italic and code', () => {
    expect(parseInline('The **gateway** asks *Auth* to run `verify()`.')).toEqual([
      { kind: 'text', text: 'The ' },
      { kind: 'bold', text: 'gateway' },
      { kind: 'text', text: ' asks ' },
      { kind: 'italic', text: 'Auth' },
      { kind: 'text', text: ' to run ' },
      { kind: 'code', text: 'verify()' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps HTML literal', () => {
    expect(parseInline('<b>x</b>')).toEqual([{ kind: 'text', text: '<b>x</b>' }]);
  });

  it('keeps unclosed and spaced markers literal', () => {
    expect(parseInline('a * b and **c')).toEqual([{ kind: 'text', text: 'a * b and **c' }]);
    expect(parseInline('`unclosed')).toEqual([{ kind: 'text', text: '`unclosed' }]);
  });
});

describe('chapters', () => {
  const { compiled } = compile('%% @chapter "Credentials"\nA->>B: 1\nB->>A: 2\nA->>B: 3\n%% @chapter "Session"\nB->>A: 4\nA->>B: 5');
  const chapters = deriveChapters(compiled.steps);

  it('derives titles and first steps', () => {
    expect(chapters).toEqual([
      { title: 'Credentials', firstStep: 0 },
      { title: 'Session', firstStep: 3 },
    ]);
    expect(chapterIndexAt(chapters, -1)).toBe(-1);
    expect(chapterIndexAt(chapters, 4)).toBe(1);
  });

  it('navigates to the next and previous chapter', () => {
    expect(chapterTarget(chapters, 1, 1)).toBe(3);
    expect(chapterTarget(chapters, 3, 1)).toBeUndefined();
    expect(chapterTarget(chapters, 4, -1)).toBe(3);
    expect(chapterTarget(chapters, 3, -1)).toBe(0);
    expect(chapterTarget(chapters, -1, -1)).toBeUndefined();
  });
});

describe('context and transcript', () => {
  const { compiled } = compile('%% @iterations 3\nloop retry\nalt valid\nG->>Auth: verify(token)\nelse invalid\nG->>A: no\nend\nend');

  it('formats the inspector context with the iteration', () => {
    expect(contextText(compiled.steps[1]!.fragmentPath, t)).toBe('LOOP retry › ALT valid · iteration 2 of 3');
  });

  it('formats transcript lines with numbers and context', () => {
    const groups = transcript(compiled.steps, t);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries[1]!.line).toBe('02. G → Auth: verify(token) — in loop "retry", iteration 2 of 3, in alt "valid"');
  });

  it('groups transcript entries under chapters with captions', () => {
    const c = compile('%% @chapter "One"\n%% @caption "First."\nA->>B: x\n%% @chapter "Two"\nB->>A: y').compiled;
    const groups = transcript(c.steps, t);
    expect(groups.map((g) => g.chapter)).toEqual(['One', 'Two']);
    expect(groups[0]!.entries[0]).toMatchObject({ line: '01. A → B: x', caption: 'First.' });
  });
});

describe('focused playback', () => {
  const seq = compile('A->>B: ab\nB->>C: bc\nC->>A: ca\nNote over C: n');
  const ends = new Map(seq.model.body.flatMap((n) => (n.type === 'message' ? [[n.message.id, [n.message.from, n.message.to] as const]] : [])));
  const notes = new Map(seq.model.body.flatMap((n) => (n.type === 'note' ? [[n.note.id, n.note.participants]] : [])));
  const involves = (s: Step) => stepInvolves(s, ends, notes);

  it('skips steps not touching a single focused participant', () => {
    expect([...focusSkipSet(seq.compiled.steps, new Set(['A']), involves)]).toEqual([1, 3]);
  });

  it('keeps only interactions among several focused participants', () => {
    expect([...focusSkipSet(seq.compiled.steps, new Set(['A', 'B']), involves)]).toEqual([1, 2, 3]);
  });
});

describe('search index', () => {
  const seq = compile('participant G as Gateway\nA->>G: login\nG-->>A: token\nNote over A: keeps the token\n%% @caption "Token issued."\nA->>G: done');
  const index = buildSearchIndex({
    participants: seq.model.participants.map((p) => ({ id: p.id, label: p.label })),
    messages: seq.model.body.flatMap((n) => (n.type === 'message' ? [{ id: n.message.id, label: n.message.label, from: n.message.from, to: n.message.to }] : [])),
    notes: seq.model.body.flatMap((n) => (n.type === 'note' ? [{ id: n.note.id, text: n.note.text }] : [])),
    steps: seq.compiled.steps,
  });

  it('finds messages, notes and captions case-insensitively with step numbers', () => {
    const hits = search(index, 'TOKEN');
    expect(hits.map((h) => [h.kind, h.step])).toEqual([
      ['message', 1],
      ['note', 2],
      ['caption', 3],
    ]);
    expect(hits[0]!.text).toBe('G → A: token');
  });

  it('finds participants by label and seeks to their first step', () => {
    expect(search(index, 'gateway')).toEqual([{ kind: 'participant', text: 'Gateway (G)', step: 0, elementId: 'G' }]);
    expect(search(index, '  ')).toEqual([]);
  });
});

describe('step text for effect-only steps', () => {
  it('describes activation steps instead of leaving them blank', () => {
    const { compiled } = compile('A->>+B: go\nloop again\nA->>B: x\nend\ndeactivate B\nA->>B: y');
    const lines = transcript(compiled.steps, t).flatMap((g) => g.entries.map((e) => e.line));
    expect(lines[2]).toBe('03. B deactivates');
  });
});

describe('formatted labels outside the drawing', () => {
  const d = compileDiagram('sequenceDiagram\nparticipant G as <b>Gateway</b>\nG->>A: <b>atomic DR lock</b>\nNote over A: <i>cached</i>', {});
  const { model, compiled } = d.sequence!;

  it('finds steps by their plain text', () => {
    const index = buildSearchIndex({
      participants: model.participants,
      messages: model.body.flatMap((n) => (n.type === 'message' ? [n.message] : [])),
      notes: model.body.flatMap((n) => (n.type === 'note' ? [n.note] : [])),
      steps: compiled.steps,
    });
    expect(search(index, 'atomic DR').map((e) => e.text)).toEqual(['G → A: atomic DR lock']);
    expect(index.some((e) => e.text.includes('<'))).toBe(false);
  });

  it('lists steps in the transcript without tags', () => {
    const lines = transcript(compiled.steps, t).flatMap((g) => g.entries.map((e) => e.line));
    expect(lines.some((l) => l.includes('atomic DR lock'))).toBe(true);
    expect(lines.join('\n')).not.toMatch(/<\/?[bi]>/);
  });

  it('announces steps with plain names and labels', () => {
    const text = announcement(compiled.steps[0], 0, compiled.steps.length, model.participants, t);
    expect(text).toContain('Gateway to A: atomic DR lock.');
    expect(text).not.toMatch(/<\/?[bi]>/);
  });
});
