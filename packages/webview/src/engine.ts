import type { CompiledDiagram } from '@mermaid-animator/core';

export type EngineChoice = 'native' | 'generic' | 'error';

/**
 * Which renderer a diagram gets (spec generic-diagram-fallback): the native pipeline for sequence
 * diagrams it can read; Mermaid's rendering for every other type and for sequence diagrams the
 * native parser rejects but Mermaid accepts; otherwise an error with the native diagnostics.
 * `mermaidAccepts` is only consulted for rejected sequence diagrams.
 */
export function chooseEngine(compiled: Pick<CompiledDiagram, 'type' | 'sequence'>, mermaidAccepts: () => boolean | Promise<boolean>): EngineChoice | Promise<EngineChoice> {
  if (compiled.type !== 'sequence') return 'generic';
  if (compiled.sequence) return 'native';
  const accepts = mermaidAccepts();
  return typeof accepts === 'boolean' ? (accepts ? 'generic' : 'error') : accepts.then((ok) => (ok ? 'generic' : 'error'));
}
