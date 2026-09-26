/**
 * Search (spec exploration): a flat, case-insensitive index over participants, message labels,
 * notes and captions, each entry carrying the step it seeks to (0-based) when there is one.
 */
export type SearchKind = 'participant' | 'message' | 'note' | 'caption';

export interface SearchEntry {
  kind: SearchKind;
  text: string;
  /** 0-based step to seek to; undefined for statements that never play. */
  step?: number;
  /** Rendered element to highlight (`data-id`), when there is one. */
  elementId?: string;
}

export interface SearchSource {
  participants: readonly { id: string; label: string }[];
  messages: readonly { id: string; label: string; from: string; to: string }[];
  notes: readonly { id: string; text: string }[];
  steps: readonly { index: number; messages: readonly string[]; notes: readonly string[]; from?: string; to?: string; caption?: string }[];
}

export function buildSearchIndex(source: SearchSource): SearchEntry[] {
  const firstStep = new Map<string, number>();
  const participantStep = new Map<string, number>();
  for (const step of source.steps) {
    for (const id of [...step.messages, ...step.notes]) if (!firstStep.has(id)) firstStep.set(id, step.index);
    for (const p of [step.from, step.to]) if (p !== undefined && !participantStep.has(p)) participantStep.set(p, step.index);
  }
  for (const m of source.messages) {
    const step = firstStep.get(m.id);
    if (step === undefined) continue;
    for (const p of [m.from, m.to]) if (!participantStep.has(p) || (participantStep.get(p) as number) > step) participantStep.set(p, step);
  }
  const entries: SearchEntry[] = [];
  for (const p of source.participants) entries.push({ kind: 'participant', text: p.label === p.id ? p.label : `${p.label} (${p.id})`, step: participantStep.get(p.id), elementId: p.id });
  for (const m of source.messages) entries.push({ kind: 'message', text: `${m.from} → ${m.to}: ${m.label}`.replace(/\n/g, ' '), step: firstStep.get(m.id), elementId: m.id });
  for (const n of source.notes) entries.push({ kind: 'note', text: n.text.replace(/\n/g, ' '), step: firstStep.get(n.id), elementId: n.id });
  for (const s of source.steps) if (s.caption) entries.push({ kind: 'caption', text: s.caption, step: s.index });
  return entries;
}

/** Entries whose text contains `query` (case-insensitive), in step order; empty query → none. */
export function search(index: readonly SearchEntry[], query: string, limit = 50): SearchEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const order = (e: SearchEntry) => e.step ?? Number.MAX_SAFE_INTEGER;
  return index
    .filter((e) => e.text.toLocaleLowerCase().includes(needle))
    .sort((a, b) => order(a) - order(b))
    .slice(0, limit);
}
