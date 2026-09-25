import { describe, expect, it } from 'vitest';
import { detectDiagramType, diagramAtLine, locateDiagrams, rebind, similarity } from '../src';

const md = [
  '# Doc', // 0
  '```mermaid', // 1
  'sequenceDiagram', // 2
  '  A->>B: one', // 3
  '```', // 4
  '```js', // 5
  'const x = 1;', // 6
  '```', // 7
  '~~~~ mermaid', // 8
  '%% @id second', // 9
  'flowchart TD', // 10
  '  A-->B', // 11
  '~~~~', // 12
].join('\n');

describe('locateDiagrams', () => {
  it('finds mermaid fences with backticks and tildes, skipping other languages', () => {
    const found = locateDiagrams(md, 'markdown');
    expect(found.map((d) => [d.index, d.type, d.fenceLine, d.contentStartLine, d.contentEndLine, d.id])).toEqual([
      [0, 'sequence', 1, 2, 4, undefined],
      [1, 'flowchart', 8, 9, 12, 'second'],
    ]);
    expect(found[0]?.source).toBe('sequenceDiagram\n  A->>B: one');
  });

  it('accepts attributes after the info string and is case-insensitive', () => {
    const found = locateDiagrams('```Mermaid title="Auth"\nsequenceDiagram\n```', 'markdown');
    expect(found).toHaveLength(1);
  });

  it('requires a closing fence at least as long as the opening one', () => {
    const found = locateDiagrams('````mermaid\nsequenceDiagram\n```\n  A->>B: x\n````\nafter', 'mdx');
    expect(found[0]?.source).toBe('sequenceDiagram\n```\n  A->>B: x');
  });

  it('extends an unterminated fence to the end of the document', () => {
    const found = locateDiagrams('text\n```mermaid\nsequenceDiagram\n  A->>B: x', 'markdown');
    expect(found[0]?.contentEndLine).toBe(4);
  });

  it('ignores fences indented four spaces (code blocks) and backtick info strings containing backticks', () => {
    expect(locateDiagrams('    ```mermaid\n    x\n    ```', 'markdown')).toEqual([]);
    expect(locateDiagrams('```mermaid `x`\nsequenceDiagram\n```', 'markdown')).toEqual([]);
  });

  it('treats a mermaid document as one diagram', () => {
    const [d] = locateDiagrams('%% @title "Login"\nsequenceDiagram\n  A->>B: x', 'mermaid');
    expect(d).toMatchObject({ index: 0, type: 'sequence', contentStartLine: 0, title: 'Login' });
  });

  it('returns nothing for other languages', () => {
    expect(locateDiagrams('```mermaid\nsequenceDiagram\n```', 'typescript')).toEqual([]);
  });

  it('derives titles from front matter and title statements, and a summary line', () => {
    const [a] = locateDiagrams('---\ntitle: "From front matter"\n---\nsequenceDiagram\n  A->>B: x', 'mermaid');
    const [b] = locateDiagrams('sequenceDiagram\n  title Checkout\n  A->>B: x', 'mermaid');
    expect(a?.title).toBe('From front matter');
    expect(b?.title).toBe('Checkout');
    expect(b?.summary).toBe('title Checkout');
  });

  it('finds the diagram at a line', () => {
    const found = locateDiagrams(md, 'markdown');
    expect(diagramAtLine(found, 3)?.index).toBe(0);
    expect(diagramAtLine(found, 6)).toBeUndefined();
    expect(diagramAtLine(found, 8)?.index).toBe(1);
  });
});

describe('detectDiagramType', () => {
  it.each([
    ['sequenceDiagram', 'sequence'],
    ['  flowchart LR', 'flowchart'],
    ['graph TD', 'flowchart'],
    ['stateDiagram-v2', 'state'],
    ['gitGraph', 'gitGraph'],
    ['pie title Pets', 'pie'],
    ['%%{init: {}}%%\nclassDiagram', 'class'],
    ['---\ntitle: x\n---\nerDiagram', 'er'],
    ['%% comment\nsequenceDiagram', 'sequence'],
    ['SEQUENCEDIAGRAM', 'unknown'],
    ['hello', 'unknown'],
  ])('%j → %s', (source, type) => {
    expect(detectDiagramType(source)).toBe(type);
  });
});

describe('rebind', () => {
  const doc = (...sources: string[]) => locateDiagrams(sources.map((s) => '```mermaid\n' + s + '\n```').join('\n\n'), 'markdown');
  const target = 'sequenceDiagram\n  Alice->>Bob: hello there\n  Bob-->>Alice: hi';

  it('follows a diagram that moved down when another is inserted above', () => {
    const now = doc('flowchart TD\n A-->B', target);
    expect(rebind({ index: 0, source: target }, now)?.index).toBe(1);
  });

  it('follows an edited diagram', () => {
    const edited = target.replace('hello there', 'hello there, how are you');
    expect(rebind({ index: 0, source: target }, doc('pie\n "a": 1', edited))?.index).toBe(1);
  });

  it('prefers the @id annotation over content', () => {
    const now = doc('%% @id x\nsequenceDiagram\n  C->>D: other', target);
    expect(rebind({ id: 'x', index: 1, source: target }, now)?.index).toBe(0);
  });

  it('falls back to the index, and to nothing when the index is gone', () => {
    expect(rebind({ index: 0, source: 'zzzz' }, doc('pie\n "a": 1'))?.index).toBe(0);
    expect(rebind({ index: 3, source: 'zzzz' }, doc('pie\n "a": 1'))).toBeUndefined();
  });

  it('computes similarity', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abcdef', 'uvwxyz')).toBe(0);
  });
});
