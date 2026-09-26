/**
 * Sidecar entries in the webview (spec sidecar-files): the webview owns the step list, so it resolves
 * the entry's step keys to indices and reports the keys that no longer match anything.
 */
import { resolveStepKey, type Step } from '@mermaid-animator/core';
import type { SidecarEntry } from '@mermaid-animator/protocol';

export interface UnresolvedKey {
  section: 'captions' | 'chapters';
  key: string;
}

export interface ResolvedSidecar {
  stepCaptions: Record<number, string>;
  stepChapters: Record<number, string>;
  unresolved: UnresolvedKey[];
}

type StepKeys = Pick<Step, 'id' | 'structuralId'>;

/** Resolves captions and chapters against native steps (`#n`, `@step-id`/content id, structural id). */
export function resolveSidecar(steps: readonly StepKeys[], entry: SidecarEntry | undefined): ResolvedSidecar {
  const out: ResolvedSidecar = { stepCaptions: {}, stepChapters: {}, unresolved: [] };
  for (const section of ['captions', 'chapters'] as const) {
    for (const [key, text] of Object.entries(entry?.[section] ?? {})) {
      const index = resolveStepKey(steps, key);
      if (index === undefined) out.unresolved.push({ section, key });
      else (section === 'captions' ? out.stepCaptions : out.stepChapters)[index] = text;
    }
  }
  return out;
}

/** Generic diagrams have no step ids: only `#n` keys resolve (spec §10.12). */
export function resolveGenericSidecar(stepCount: number, entry: SidecarEntry | undefined): ResolvedSidecar {
  return resolveSidecar(Array.from({ length: stepCount }, () => ({ id: '\u0000', structuralId: '\u0000' })), entry);
}

/** Settings from host and sidecar merged in precedence order (spec §11.8: sidecar above settings). */
export function withSidecarSettings<T extends Record<string, unknown>>(host: T, entry: SidecarEntry | undefined): T {
  return entry?.settings ? { ...host, ...entry.settings } : host;
}
