/**
 * Step compilation (spec §13.6, v1.1): turns a parsed sequence diagram plus annotations into the
 * canonical ordered step list that drives every view, control, export and sync path.
 */
import type { Diagnostic, SourceRange } from './text';
import type { Fragment, Message, Participant, ParticipantKind, SequenceModel, SequenceNode } from './sequence/model';
import { asDuration, asNumber, valueText, type Annotation } from './annotations';
import { fnv1a64 } from './hash';

export type StepKind = 'message' | 'note' | 'activation' | 'create' | 'destroy';

export interface FragmentFrame {
  fragmentId: string;
  kind: Fragment['kind'];
  label: string;
  branch: number;
  branchLabel: string;
  iteration?: number;
  of?: number;
}

export interface ActivationEffect {
  participant: string;
  on: boolean;
}

export interface Step {
  /** `@step-id` slug, else content hash. */
  id: string;
  /** Label-independent identity (kind, endpoints, fragment path, occurrence). */
  structuralId: string;
  index: number;
  kind: StepKind;
  /** Message ids animated by this step (several when merged with `@with-next`). */
  messages: string[];
  notes: string[];
  activations: ActivationEffect[];
  creates: string[];
  destroys: string[];
  fragmentPath: FragmentFrame[];
  /** Primary endpoints and label, for announcements and tooltips. */
  from?: string;
  to?: string;
  label: string;
  caption?: string;
  chapter?: string;
  emphasis?: boolean;
  timing: { transitionMs: number; dwellMs: number; hold: boolean; latencyMs?: number };
  source: SourceRange;
  sources: SourceRange[];
}

export interface CompileOptions {
  notes?: 'step' | 'attach' | 'hidden';
  dwell?: 'adaptive' | 'fixed';
  dwellMs?: number;
}

export interface CompiledSequence {
  steps: Step[];
  /** Effects applied before the first step (skipped statements). */
  initial: { messages: string[]; notes: string[]; activations: ActivationEffect[]; creates: string[]; destroys: string[] };
  /** Message and note ids in branches or statements that never play (drawn as unplayed). */
  unplayed: Set<string>;
  hiddenNotes: boolean;
  /** Participant kinds after `@type` overrides. */
  participantKinds: Record<string, ParticipantKind>;
  diagnostics: Diagnostic[];
}

// -- timing -----------------------------------------------------------------------------------------

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

/** Layout-invariant transition duration from the logical column span (spec §9.8.2). */
export function travelMs(deltaColumns: number): number {
  return clamp(280, 220 + 95 * Math.max(1, deltaColumns), 900);
}

const words = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Adaptive dwell: comfortable reading time for the label and caption (spec §8.5.1). */
export function adaptiveDwellMs(label: string, caption = ''): number {
  return clamp(600, 250 + 230 * (words(label) + words(caption)), 4000);
}

// -- identities --------------------------------------------------------------------------------------

const normalise = (label: string) => label.toLowerCase().replace(/\s+/g, ' ').trim();

// -- compilation --------------------------------------------------------------------------------------

interface Draft {
  kind: StepKind;
  messages: Message[];
  noteIds: string[];
  noteTexts: string[];
  activations: ActivationEffect[];
  creates: string[];
  destroys: string[];
  path: FragmentFrame[];
  sources: SourceRange[];
  /** Statement ranges annotations can target. */
  anchors: SourceRange[];
  structuralSig: string;
  label: string;
}

const pathSig = (path: FragmentFrame[]) => path.map((f) => `${f.kind}:${f.branch}`).join('/');

export function compileSequence(model: SequenceModel, annotations: Annotation[] = [], options: CompileOptions = {}): CompiledSequence {
  const notesMode = options.notes ?? 'step';
  const diagnostics: Diagnostic[] = [];
  const drafts: Draft[] = [];
  const unplayed = new Set<string>();
  const initial: CompiledSequence['initial'] = { messages: [], notes: [], activations: [], creates: [], destroys: [] };
  const participantKinds: Record<string, ParticipantKind> = Object.fromEntries(model.participants.map((p) => [p.id, p.kind]));
  const column = new Map(model.participants.map((p, i) => [p.id, i]));

  // Statement-scoped annotations, keyed by the statement they attach to.
  const statementAnchors: { range: SourceRange; key: string }[] = [];
  const fragmentAnchors: { range: SourceRange; key: string }[] = [];
  const collectAnchors = (nodes: SequenceNode[]) => {
    for (const n of nodes) {
      if (n.type === 'message') statementAnchors.push({ range: n.message.range, key: n.message.id });
      else if (n.type === 'note') statementAnchors.push({ range: n.note.range, key: n.note.id });
      else if (n.type === 'fragment') {
        fragmentAnchors.push({ range: n.fragment.range, key: n.fragment.id });
        for (const b of n.fragment.branches) collectAnchors(b.children);
      }
    }
  };
  collectAnchors(model.body);
  statementAnchors.sort((a, b) => a.range.startLine - b.range.startLine);
  fragmentAnchors.sort((a, b) => a.range.startLine - b.range.startLine);

  const byStatement = new Map<string, Annotation[]>();
  for (const a of annotations) {
    if (a.scope === 'statement') {
      const target = statementAnchors.find((s) => s.range.startLine > a.line);
      if (!target) {
        diagnostics.push({ message: `'@${a.name}' is not followed by a message or note.`, severity: 'warning', range: a.range, code: 'annotation/no-target' });
        continue;
      }
      byStatement.set(target.key, [...(byStatement.get(target.key) ?? []), a]);
    } else if (a.scope === 'fragment') {
      if (!fragmentAnchors.some((f) => f.range.startLine > a.line)) {
        diagnostics.push({ message: `'@${a.name}' is not followed by a fragment.`, severity: 'warning', range: a.range, code: 'annotation/no-target' });
      }
    } else if (a.scope === 'declaration') {
      const target = model.participants.filter((p) => p.range.startLine > a.line).sort((x, y) => x.range.startLine - y.range.startLine)[0];
      if (!target) {
        diagnostics.push({ message: `'@${a.name}' is not followed by a participant declaration.`, severity: 'warning', range: a.range, code: 'annotation/no-target' });
        continue;
      }
      participantKinds[target.id] = valueText(a.args[0]!.value) as ParticipantKind;
    }
  }
  const has = (key: string, name: string) => (byStatement.get(key) ?? []).find((a) => a.name === name);

  const markUnplayed = (nodes: SequenceNode[]) => {
    for (const n of nodes) {
      if (n.type === 'message') unplayed.add(n.message.id);
      else if (n.type === 'note') unplayed.add(n.note.id);
      else if (n.type === 'fragment') for (const b of n.fragment.branches) markUnplayed(b.children);
    }
  };

  const walk = (nodes: SequenceNode[], path: FragmentFrame[]) => {
    /** The last message step in this block, while only activation/create/destroy statements follow it. */
    let previous: Draft | undefined;
    /** Effects waiting for the next message in this block. */
    let pending: { activations: ActivationEffect[]; creates: string[]; destroys: string[]; sources: SourceRange[] } = { activations: [], creates: [], destroys: [], sources: [] };
    const nextMessage = (from: number): Message | undefined => {
      for (let j = from; j < nodes.length; j++) {
        const n = nodes[j] as SequenceNode;
        if (n.type === 'message') return n.message;
        if (n.type !== 'activation' && n.type !== 'create' && n.type !== 'destroy') return undefined;
      }
      return undefined;
    };
    const standalone = (kind: StepKind, sig: string, source: SourceRange, fill: Partial<Draft>) => {
      drafts.push({ kind, messages: [], noteIds: [], noteTexts: [], activations: [], creates: [], destroys: [], path, sources: [source], anchors: [source], structuralSig: sig, label: '', ...fill });
    };
    const flushPending = () => {
      // Pending effects with no following message become their own steps.
      for (const a of pending.activations) standalone('activation', `activation|${a.participant}|${a.on}`, pending.sources[0]!, { activations: [a] });
      for (const c of pending.creates) standalone('create', `create|${c}`, pending.sources[0]!, { creates: [c] });
      for (const d of pending.destroys) standalone('destroy', `destroy|${d}`, pending.sources[0]!, { destroys: [d] });
      pending = { activations: [], creates: [], destroys: [], sources: [] };
    };

    nodes.forEach((node, i) => {
      switch (node.type) {
        case 'message': {
          const m = node.message;
          const skip = has(m.id, 'skip');
          const effects: ActivationEffect[] = [];
          if (m.activatesTarget) effects.push({ participant: m.to, on: true });
          if (m.deactivatesSource) effects.push({ participant: m.from, on: false });
          if (skip) {
            initial.messages.push(m.id);
            initial.activations.push(...pending.activations, ...effects);
            initial.creates.push(...pending.creates);
            initial.destroys.push(...pending.destroys);
            pending = { activations: [], creates: [], destroys: [], sources: [] };
            previous = undefined;
            return;
          }
          const draft: Draft = {
            kind: 'message',
            messages: [m],
            noteIds: [],
            noteTexts: [],
            activations: [...pending.activations, ...effects],
            creates: [...pending.creates],
            destroys: [...pending.destroys],
            path,
            sources: [m.range, ...pending.sources],
            anchors: [m.range],
            structuralSig: `message|${m.from}|${m.to}|${pathSig(path)}`,
            label: m.label,
          };
          pending = { activations: [], creates: [], destroys: [], sources: [] };
          drafts.push(draft);
          previous = draft;
          return;
        }
        case 'activation': {
          const effect = { participant: node.participant, on: node.on };
          if (node.on) {
            const p = previous?.messages[previous.messages.length - 1];
            const alreadyActivated = p?.activatesTarget && p.to === node.participant;
            if (previous && p && (p.to === node.participant || p.from === node.participant) && !alreadyActivated) {
              previous.activations.push(effect);
              previous.sources.push(node.range);
              return;
            }
            const following = nextMessage(i + 1);
            if (following && following.from === node.participant) {
              pending.activations.push(effect);
              pending.sources.push(node.range);
              return;
            }
          } else if (previous) {
            previous.activations.push(effect);
            previous.sources.push(node.range);
            return;
          }
          standalone('activation', `activation|${node.participant}|${node.on}|${pathSig(path)}`, node.range, { activations: [effect] });
          return;
        }
        case 'create': {
          const following = nextMessage(i + 1);
          if (following && following.to === node.participant) {
            pending.creates.push(node.participant);
            pending.sources.push(node.range);
          } else standalone('create', `create|${node.participant}|${pathSig(path)}`, node.range, { creates: [node.participant] });
          return;
        }
        case 'destroy': {
          if (node.attachTo === 'next') {
            pending.destroys.push(node.participant);
            pending.sources.push(node.range);
          } else if (node.attachTo === 'prev' && previous) {
            previous.destroys.push(node.participant);
            previous.sources.push(node.range);
          } else standalone('destroy', `destroy|${node.participant}|${pathSig(path)}`, node.range, { destroys: [node.participant] });
          return;
        }
        case 'note': {
          previous = undefined;
          if (notesMode === 'hidden') return;
          const n = node.note;
          if (has(n.id, 'skip')) {
            initial.notes.push(n.id);
            return;
          }
          const last = drafts[drafts.length - 1];
          if (notesMode === 'attach' && last) {
            last.noteIds.push(n.id);
            last.noteTexts.push(n.text);
            last.sources.push(n.range);
            last.anchors.push(n.range);
            return;
          }
          drafts.push({
            kind: 'note', messages: [], noteIds: [n.id], noteTexts: [n.text], activations: [], creates: [], destroys: [], path,
            sources: [n.range], anchors: [n.range], structuralSig: `note|${n.participants.join(',')}|${pathSig(path)}`, label: n.text,
          });
          return;
        }
        case 'fragment': {
          flushPending();
          previous = undefined;
          const f = node.fragment;
          // M1 semantics (spec §23.2): alt/critical play their first branch; loop plays once; par lanes play in sequence.
          const playAll = f.kind === 'par' || f.kind === 'loop' || f.kind === 'opt' || f.kind === 'break' || f.kind === 'rect';
          f.branches.forEach((branch, b) => {
            if (!playAll && b > 0) {
              markUnplayed(branch.children);
              return;
            }
            const frame: FragmentFrame = { fragmentId: f.id, kind: f.kind, label: f.label, branch: b, branchLabel: branch.label };
            if (f.kind === 'loop') Object.assign(frame, { iteration: 1, of: 1 });
            walk(branch.children, [...path, frame]);
          });
          return;
        }
      }
    });
    flushPending();
  };
  walk(model.body, []);

  // Apply statement annotations and @with-next merges.
  const annotated = drafts.map((d) => {
    const keys = [...d.messages.map((m) => m.id), ...d.noteIds];
    const list = keys.flatMap((k) => byStatement.get(k) ?? []);
    return { draft: d, list };
  });
  const merged: { draft: Draft; list: Annotation[] }[] = [];
  for (let i = 0; i < annotated.length; i++) {
    const current = annotated[i]!;
    const withNext = current.list.find((a) => a.name === 'with-next');
    if (!withNext) {
      merged.push(current);
      continue;
    }
    const count = asNumber(withNext.args[0]?.value) ?? 1;
    const group = annotated.slice(i, i + 1 + count);
    const base = group[0]!.draft;
    const combined: Draft = {
      ...base,
      messages: group.flatMap((g) => g.draft.messages),
      noteIds: group.flatMap((g) => g.draft.noteIds),
      noteTexts: group.flatMap((g) => g.draft.noteTexts),
      activations: group.flatMap((g) => g.draft.activations),
      creates: group.flatMap((g) => g.draft.creates),
      destroys: group.flatMap((g) => g.draft.destroys),
      sources: group.flatMap((g) => g.draft.sources),
      structuralSig: group.map((g) => g.draft.structuralSig).join('+'),
      label: group.map((g) => g.draft.label).filter(Boolean).join(' · '),
    };
    merged.push({ draft: combined, list: group.flatMap((g) => g.list.filter((a) => a !== withNext)) });
    i += group.length - 1;
  }

  const structuralCount = new Map<string, number>();
  const contentCount = new Map<string, number>();
  const steps: Step[] = merged.map(({ draft, list }, index) => {
    const find = (name: string) => list.find((a) => a.name === name);
    const primary = draft.messages[0];
    const sSig = draft.structuralSig;
    const sOcc = structuralCount.get(sSig) ?? 0;
    structuralCount.set(sSig, sOcc + 1);
    const cSig = `${sSig}|${normalise(draft.label)}`;
    const cOcc = contentCount.get(cSig) ?? 0;
    contentCount.set(cSig, cOcc + 1);
    const explicitId = find('step-id');

    const caption = list.filter((a) => a.name === 'caption').map((a) => a.args.map((x) => valueText(x.value)).join(' ')).join(' ') || undefined;
    const chapter = find('chapter') ? find('chapter')!.args.map((x) => valueText(x.value)).join(' ') : undefined;
    const spans = draft.messages.map((m) => Math.abs((column.get(m.to) ?? 0) - (column.get(m.from) ?? 0)) || 1);
    let transitionMs = travelMs(Math.max(1, ...spans));
    let dwellMs = options.dwell === 'fixed' ? (options.dwellMs ?? 900) : adaptiveDwellMs(draft.label, caption);
    const duration = asDuration(find('duration')?.args[0]?.value);
    if (duration !== undefined) transitionMs = duration;
    const pause = find('pause');
    let hold = false;
    if (pause) {
      const ms = asDuration(pause.args[0]?.value);
      if (ms === undefined) hold = true;
      else dwellMs = ms;
    }
    const speed = asNumber(find('speed')?.args[0]?.value);
    if (speed) {
      transitionMs /= speed;
      dwellMs /= speed;
    }
    const latency = asDuration(find('latency')?.args[0]?.value);

    return {
      id: explicitId ? valueText(explicitId.args[0]!.value) : fnv1a64(`${cSig}#${cOcc}`),
      structuralId: fnv1a64(`${sSig}#${sOcc}`),
      index,
      kind: draft.kind,
      messages: draft.messages.map((m) => m.id),
      notes: draft.noteIds,
      activations: draft.activations,
      creates: draft.creates,
      destroys: draft.destroys,
      fragmentPath: draft.path,
      from: primary?.from,
      to: primary?.to,
      label: draft.label,
      caption,
      chapter,
      emphasis: find('emphasis') ? true : undefined,
      timing: { transitionMs, dwellMs, hold, latencyMs: latency },
      source: draft.sources[0] as SourceRange,
      sources: draft.sources,
    };
  });

  return { steps, initial, unplayed, hiddenNotes: notesMode === 'hidden', participantKinds, diagnostics };
}

/** Participants as seen after compilation (kinds overridden by `@type`). */
export function effectiveParticipants(model: SequenceModel, compiled: CompiledSequence): Participant[] {
  return model.participants.map((p) => ({ ...p, kind: compiled.participantKinds[p.id] ?? p.kind }));
}
