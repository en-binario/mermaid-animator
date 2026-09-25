import { describe, expect, it } from 'vitest';
import { compileDiagram } from '@mermaid-animator/core';
import { chooseEngine } from '../src/engine';

describe('chooseEngine', () => {
  const never = () => {
    throw new Error('Mermaid must not be consulted');
  };

  it('uses the native pipeline for sequence diagrams it can read, without loading Mermaid', () => {
    expect(chooseEngine(compileDiagram('sequenceDiagram\nA->>B: x'), never)).toBe('native');
  });

  it('uses Mermaid for other diagram types', () => {
    expect(chooseEngine(compileDiagram('flowchart TD\nA-->B'), never)).toBe('generic');
    expect(chooseEngine(compileDiagram('pie\n"a": 1'), never)).toBe('generic');
  });

  it('falls back to Mermaid for a rejected sequence diagram only when Mermaid accepts it', async () => {
    const broken = compileDiagram('sequenceDiagram\nloop x\nA->>B: y');
    expect(chooseEngine(broken, () => true)).toBe('generic');
    expect(chooseEngine(broken, () => false)).toBe('error');
    await expect(chooseEngine(broken, async () => true)).resolves.toBe('generic');
  });
});
