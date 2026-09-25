import { describe, expect, it } from 'vitest';
import { parseSequence, type Message, type SequenceNode } from '../src';

const BS = '\\';
const messages = (body: SequenceNode[]): Message[] =>
  body.flatMap((n) => (n.type === 'message' ? [n.message] : n.type === 'fragment' ? n.fragment.branches.flatMap((b) => messages(b.children)) : []));
const parse = (text: string) => parseSequence(`sequenceDiagram\n${text}`);

describe('participants', () => {
  it('orders declared then first-appearance participants and applies aliases and kinds', () => {
    const { model, diagnostics } = parse('participant B as Bob\nactor U as User\nU->>B: hi\nB->>Carol: fwd');
    expect(diagnostics).toEqual([]);
    expect(model.participants.map((p) => [p.id, p.label, p.kind])).toEqual([
      ['B', 'Bob', 'participant'],
      ['U', 'User', 'actor'],
      ['Carol', 'Carol', 'participant'],
    ]);
  });

  it('reads participant types from @{…} metadata', () => {
    const { model } = parse('participant DB@{ "type": "database" } as Ledger\nparticipant Q@{ type: queue }\nA->>DB: q');
    expect(model.participants.find((p) => p.id === 'DB')).toMatchObject({ kind: 'database', label: 'Ledger' });
    expect(model.participants.find((p) => p.id === 'Q')?.kind).toBe('queue');
  });

  it('assigns box membership and colours', () => {
    const { model } = parse('box Aqua Front end\nparticipant A\nend\nbox Team B\nparticipant B\nend\nA->>B: x');
    expect(model.boxes.map((b) => [b.color, b.label, b.members])).toEqual([
      ['Aqua', 'Front end', ['A']],
      ['transparent', 'Team B', ['B']],
    ]);
  });
});

describe('messages', () => {
  it.each([
    ['->', 'solid', false], ['-->', 'solid', true], ['->>', 'solidArrow', false], ['-->>', 'solidArrow', true],
    ['<<->>', 'solidBidirectional', false], ['<<-->>', 'solidBidirectional', true], ['-x', 'solidCross', false], ['--x', 'solidCross', true],
    ['-)', 'solidOpen', false], ['--)', 'solidOpen', true],
    [`-|${BS}`, 'halfTop', false], ['-|/', 'halfBottom', false], [`-${BS}${BS}`, 'stickTop', false], ['-//', 'stickBottom', false],
    ['/|-', 'halfTopReverse', false], [`${BS}|-`, 'halfBottomReverse', false], ['//-', 'stickTopReverse', false], [`${BS}${BS}-`, 'stickBottomReverse', false],
    [`--|${BS}`, 'halfTop', true], ['//--', 'stickTopReverse', true],
  ])('%s → %s (dotted %s)', (arrow, kind, dotted) => {
    const { model, diagnostics } = parse(`Alice${arrow}Bob: hi`);
    expect(diagnostics).toEqual([]);
    expect(messages(model.body)[0]).toMatchObject({ from: 'Alice', to: 'Bob', arrow: kind, dotted, label: 'hi' });
  });

  it('records activation shorthands and central connections', () => {
    const { model } = parse('A->>+B: go\nB-->>-A: back\nA()->>()B: c');
    const [go, back, c] = messages(model.body);
    expect(go?.activatesTarget).toBe(true);
    expect(back?.deactivatesSource).toBe(true);
    expect(c?.central).toBe('both');
  });

  it('decodes entities, removes wrap prefixes and turns <br> into line breaks', () => {
    const { model } = parse('A->>B: I #9829; #quot;you#quot;\nA->>B: :wrap: line one<br/>line two');
    expect(messages(model.body).map((m) => m.label)).toEqual(['I ♥ "you"', 'line one\nline two']);
  });

  it('stops text at # comments and ; separators', () => {
    const { model } = parse('A->>B: kept # dropped\nA->>B: one; B->>A: two');
    expect(messages(model.body).map((m) => m.label)).toEqual(['kept', 'one', 'two']);
  });

  it('numbers messages when autonumber is on', () => {
    const { model } = parse('A->>B: x\nautonumber 10 5\nA->>B: y\nA->>B: z\nautonumber off\nA->>B: w');
    expect(messages(model.body).map((m) => m.sequenceNumber)).toEqual([undefined, 10, 15, undefined]);
    expect(model.autonumber).toBe(true);
  });
});

describe('source ranges', () => {
  it('points at the statement in diagram-relative coordinates', () => {
    const { model } = parseSequence('sequenceDiagram\n    participant A\n    A->>B: hello');
    const m = messages(model.body)[0];
    expect(m?.range).toEqual({ startLine: 2, startCol: 4, endLine: 2, endCol: 16 });
    expect(model.participants[0]?.range.startLine).toBe(1);
  });

  it('keeps line numbers after front matter and directives', () => {
    const { model } = parseSequence('---\ntitle: T\n---\n%%{init: {}}%%\nsequenceDiagram\n  A->>B: x');
    expect(messages(model.body)[0]?.range.startLine).toBe(5);
  });
});

describe('notes, fragments and statements', () => {
  it('parses notes', () => {
    const { model } = parse('Note right of A: r\nNote over A,B: both');
    const notes = model.body.flatMap((n) => (n.type === 'note' ? [n.note] : []));
    expect(notes.map((n) => [n.placement, n.participants, n.text])).toEqual([
      ['rightOf', ['A'], 'r'],
      ['over', ['A', 'B'], 'both'],
    ]);
  });

  it('parses fragments with branches', () => {
    const { model } = parse('alt ok\nA->>B: 1\nelse bad\nA->>B: 2\nend\npar_over p\nA->>B: 3\nand q\nB->>A: 4\nend');
    const fragments = model.body.flatMap((n) => (n.type === 'fragment' ? [n.fragment] : []));
    expect(fragments.map((f) => [f.kind, f.over ?? false, f.branches.map((b) => b.label)])).toEqual([
      ['alt', false, ['ok', 'bad']],
      ['par', true, ['p', 'q']],
    ]);
    expect(fragments[0]?.range.startLine).toBe(1);
    expect(fragments[0]?.range.endLine).toBe(5);
  });

  it('records create and destroy and where destroy attaches', () => {
    const { model, diagnostics } = parse('A->>B: x\ncreate participant C\nA->>C: hi\ndestroy C\nA-xC: bye\nB->>A: last\ndestroy B');
    expect(diagnostics).toEqual([]);
    const nodes = model.body.filter((n) => n.type === 'create' || n.type === 'destroy');
    expect(nodes.map((n) => (n.type === 'destroy' ? `destroy ${n.participant} ${n.attachTo}` : `create ${n.participant}`))).toEqual([
      'create C',
      'destroy C next',
      'destroy B prev',
    ]);
    const unrelated = parse('A->>B: x\nC->>D: y\ndestroy A').model.body.find((n) => n.type === 'destroy');
    expect(unrelated?.type === 'destroy' && unrelated.attachTo).toBe('standalone');
  });

  it('reads titles and accessibility text', () => {
    const { model } = parse('title Checkout\naccTitle: Acc title\naccDescr {\n  multi\n}\nA->>B: x');
    expect(model).toMatchObject({ title: 'Checkout', accTitle: 'Acc title', accDescr: 'multi' });
  });
});

describe('error recovery', () => {
  it('reports an unclosed fragment and keeps its content', () => {
    const { model, diagnostics } = parse('loop forever\nA->>B: inside');
    expect(diagnostics.map((d) => [d.code, d.range.startLine])).toEqual([['parse/unclosed-block', 1]]);
    expect(messages(model.body).map((m) => m.label)).toEqual(['inside']);
  });

  it('reports a stray end and continues', () => {
    const { model, diagnostics } = parse('A->>B: one\nend\nB->>A: two');
    expect(diagnostics.map((d) => [d.code, d.range.startLine])).toEqual([['parse/unmatched-keyword', 2]]);
    expect(messages(model.body).map((m) => m.label)).toEqual(['one', 'two']);
  });

  it('reports every broken statement, not only the first', () => {
    const { diagnostics } = parse('A->>B\nB->>A: fine\nfrobnicate\nC->>: x');
    expect(diagnostics.map((d) => d.range.startLine)).toEqual([1, 3, 4]);
  });

  it('accepts CRLF line endings with unchanged line numbers', () => {
    const { model, diagnostics } = parseSequence('sequenceDiagram\r\n    title T\r\n    autonumber\r\n    actor U as User\r\n    U->>B: hi\r\n');
    expect(diagnostics).toEqual([]);
    expect(messages(model.body)[0]?.range.startLine).toBe(4);
    expect(model.participants[0]?.label).toBe('User');
  });

  it('never throws on arbitrary input', () => {
    const noise = ['', '\n\n', 'sequenceDiagram', '::::', '->>->>', 'sequenceDiagram\n@{', 'sequenceDiagram\nparticipant', 'sequenceDiagram\nbox', '%%{', '---\n'];
    for (const text of noise) expect(() => parseSequence(text)).not.toThrow();
  });
});
