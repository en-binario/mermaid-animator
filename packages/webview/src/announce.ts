import type { Participant, Step } from '@mermaid-animator/core';
import { stepText } from './narrative';

type Format = (key: string, ...args: (string | number)[]) => string;

/**
 * Live-region text for a step (spec §16): "Step 7 of 24. Gateway to Auth: verify token. In loop Retry."
 * followed by the caption when there is one.
 */
export function announcement(step: Step | undefined, index: number, count: number, participants: readonly Participant[], t: Format): string {
  if (!step) return t('announce.start', count);
  const name = (id?: string) => participants.find((p) => p.id === id)?.label.replace(/\n/g, ' ') ?? id ?? '';
  const parts = [t('announce.step', index + 1, count)];
  if (step.kind === 'message') parts.push(t('announce.message', name(step.from), name(step.to), step.label.replace(/\n/g, ' ')));
  else if (step.kind === 'note') parts.push(t('announce.note', step.label.replace(/\n/g, ' ')));
  else if (step.label) parts.push(`${step.label}.`);
  else if (step.activations.length || step.creates.length || step.destroys.length) parts.push(`${stepText(step, t)}.`);
  const context = step.fragmentPath
    .map((f) => `${f.kind}${f.branchLabel ? ` ${f.branchLabel}` : ''}${f.iteration !== undefined && (f.of ?? 1) > 1 ? ` ${t('inspector.iteration', f.iteration, f.of as number)}` : ''}`)
    .join(', ');
  if (context) parts.push(t('announce.in', context));
  if (step.caption) parts.push(step.caption);
  return parts.join(' ');
}
