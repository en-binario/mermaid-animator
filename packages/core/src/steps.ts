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
  /** Stable key (kind, label, occurrence) used for branch choices (spec step-compilation). */
  key: string;
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
  /** Concurrent `par` lanes merged into this step. */
  lanes?: StepLane[];
  /** Participants to frame for this step (`@focus`). */
  focus?: string[];
  /** Set on the first step of an `alt`/`critical` whose branch must be chosen (`altBranches = ask`). */
  choice?: { fragmentKey: string; labels: string[] };
}

export interface StepLane {
  lane: number;
  label: string;
  /** Message and note ids of this lane in the step. */
  targets: string[];
  source: SourceRange;
  caption?: string;
}

export type BranchChoice = number | 'all' | 'skip';

export interface CompileOptions {
  notes?: 'step' | 'attach' | 'hidden';
  dwell?: 'adaptive' | 'fixed';
  dwellMs?: number;
  /** Default loop repetitions (`playback.loopIterations`). */
  loopIterations?: number;
  /** Play repetitions after the first at double speed (`playback.compressRepeats`). */
  compressRepeats?: boolean;
  /** Default branch policy for `alt` / `critical` (`playback.altBranches`). */
  altBranches?: 'first' | 'all' | 'ask';
  /** `par` lanes together or one after another (`playback.parallel`). */
  parallel?: 'concurrent' | 'sequential';
  /** Choices made in the inspector, keyed by fragment key (0-based branch index). */
  branchChoices?: Record<string, BranchChoice>;
  /** Sidecar captions and chapters by step index, used where no annotation provides one (M3). */
  stepCaptions?: Record<number, string>;
  stepChapters?: Record<number, string>;
}

/** A fragment as seen by the inspector's branch chooser. */
export interface FragmentInfo {
  key: string;
  id: string;
  kind: Fragment['kind'];
  label: string;
  branches: string[];
  /** Effective selection for alt/critical/opt (0-based branch, `all` or `skip`). */
  selected?: BranchChoice;
  iterations?: number;
  /** Branch choice pending (`ask`, nothing chosen yet). */
  pending?: boolean;
}

export const MAX_LOOP_ITERATIONS = 50;

export interface CompiledSequence {
  steps: Step[];
  /** Effects applied before the first step (skipped statements). */
  initial: { messages: string[]; notes: string[]; activations: ActivationEffect[]; creates: string[]; destroys: string[] };
  /** Message and note ids in branches or statements that never play (drawn as unplayed). */
  unplayed: Set<string>;
  hiddenNotes: boolean;
  /** Participant kinds after `@type` overrides. */
  participantKinds: Record<string, ParticipantKind>;
  /** Every fragment in document order with its key and branch selection. */
  fragments: FragmentInfo[];
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
  /** Later loop repetitions play at double speed. */
  compressed?: boolean;
  lanes?: StepLane[];
  choice?: { fragmentKey: string; labels: string[] };
}

const pathSig = (path: FragmentFrame[]) => path.map((f) => `${f.kind}:${f.branch}${f.iteration ? `@${f.iteration}` : ''}`).join('/');

/** Stable keys for every fragment: `kind|label#occurrence` in document order. */
export function fragmentKeys(model: SequenceModel): Map<string, string> {
  const keys = new Map<string, string>();
  const seen = new Map<string, number>();
  const visit = (nodes: SequenceNode[]) => {
    for (const n of nodes) {
      if (n.type !== 'fragment') continue;
      const base = `${n.fragment.kind}|${normalise(n.fragment.label)}`;
      const occ = seen.get(base) ?? 0;
      seen.set(base, occ + 1);
      keys.set(n.fragment.id, `${base}#${occ}`);
      for (const b of n.fragment.branches) visit(b.children);
    }
  };
  visit(model.body);
  return keys;
}

export interface AnnotationTarget {
  annotation: Annotation;
  kind: 'statement' | 'fragment' | 'declaration';
  /** Message, note, fragment or participant id. */
  id: string;
  range: SourceRange;
}

/**
 * Resolves what each statement-, fragment- and declaration-scoped annotation applies to: the next
 * message/note, fragment or participant declaration after it (spec §11.3). Unresolved annotations
 * are returned in `dangling`.
 */
export function annotationTargets(model: SequenceModel, annotations: Annotation[]): { targets: AnnotationTarget[]; dangling: Annotation[] } {
  const statements: { range: SourceRange; id: string }[] = [];
  const fragments: { range: SourceRange; id: string }[] = [];
  const collect = (nodes: SequenceNode[]) => {
    for (const n of nodes) {
      if (n.type === 'message') statements.push({ range: n.message.range, id: n.message.id });
      else if (n.type === 'note') statements.push({ range: n.note.range, id: n.note.id });
      else if (n.type === 'fragment') {
        fragments.push({ range: n.fragment.range, id: n.fragment.id });
        for (const b of n.fragment.branches) collect(b.children);
      }
    }
  };
  collect(model.body);
  statements.sort((a, b) => a.range.startLine - b.range.startLine);
  fragments.sort((a, b) => a.range.startLine - b.range.startLine);
  const declarations = [...model.participants].sort((x, y) => x.range.startLine - y.range.startLine);
  const targets: AnnotationTarget[] = [];
  const dangling: Annotation[] = [];
  for (const a of annotations) {
    const pool = a.scope === 'statement' ? statements : a.scope === 'fragment' ? fragments : a.scope === 'declaration' ? declarations.map((p) => ({ range: p.range, id: p.id })) : undefined;
    if (!pool) continue;
    const target = pool.find((s) => s.range.startLine > a.line);
    if (!target) dangling.push(a);
    else targets.push({ annotation: a, kind: a.scope as AnnotationTarget['kind'], id: target.id, range: target.range });
  }
  return { targets, dangling };
}

export function compileSequence(model: SequenceModel, annotations: Annotation[] = [], options: CompileOptions = {}): CompiledSequence {
  const notesMode = options.notes ?? 'step';
  const diagnostics: Diagnostic[] = [];
  const drafts: Draft[] = [];
  const unplayed = new Set<string>();
  const initial: CompiledSequence['initial'] = { messages: [], notes: [], activations: [], creates: [], destroys: [] };
  const participantKinds: Record<string, ParticipantKind> = Object.fromEntries(model.participants.map((p) => [p.id, p.kind]));
  const column = new Map(model.participants.map((p, i) => [p.id, i]));

  // Statement-, fragment- and declaration-scoped annotations, keyed by their targets.
  const { targets, dangling } = annotationTargets(model, annotations);
  const byStatement = new Map<string, Annotation[]>();
  const byFragment = new Map<string, Annotation[]>();
  for (const t of targets) {
    if (t.kind === 'statement') byStatement.set(t.id, [...(byStatement.get(t.id) ?? []), t.annotation]);
    else if (t.kind === 'fragment') byFragment.set(t.id, [...(byFragment.get(t.id) ?? []), t.annotation]);
    else participantKinds[t.id] = valueText(t.annotation.args[0]!.value) as ParticipantKind;
  }
  for (const a of dangling) {
    const what = a.scope === 'statement' ? 'a message or note' : a.scope === 'fragment' ? 'a fragment' : 'a participant declaration';
    diagnostics.push({ message: `'@${a.name}' is not followed by ${what}.`, severity: 'warning', range: a.range, code: 'annotation/no-target' });
  }
  const keys = fragmentKeys(model);
  const fragmentInfo: FragmentInfo[] = [];
  const loopDefault = Math.max(1, Math.floor(options.loopIterations ?? 1));
  const altPolicy = options.altBranches ?? 'first';
  const concurrent = (options.parallel ?? 'sequential') === 'concurrent';
  const has = (key: string, name: string) => (byStatement.get(key) ?? []).find((a) => a.name === name);

  const markUnplayed = (nodes: SequenceNode[]) => {
    for (const n of nodes) {
      if (n.type === 'message') unplayed.add(n.message.id);
      else if (n.type === 'note') unplayed.add(n.note.id);
      else if (n.type === 'fragment') for (const b of n.fragment.branches) markUnplayed(b.children);
    }
  };

  const walk = (nodes: SequenceNode[], path: FragmentFrame[], out: Draft[], compressed: boolean) => {
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
      out.push({ kind, messages: [], noteIds: [], noteTexts: [], activations: [], creates: [], destroys: [], path, sources: [source], anchors: [source], structuralSig: sig, label: '', compressed, ...fill });
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
            compressed,
          };
          pending = { activations: [], creates: [], destroys: [], sources: [] };
          out.push(draft);
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
          const last = out[out.length - 1];
          if (notesMode === 'attach' && last) {
            last.noteIds.push(n.id);
            last.noteTexts.push(n.text);
            last.sources.push(n.range);
            last.anchors.push(n.range);
            return;
          }
          out.push({
            kind: 'note', messages: [], noteIds: [n.id], noteTexts: [n.text], activations: [], creates: [], destroys: [], path,
            sources: [n.range], anchors: [n.range], structuralSig: `note|${n.participants.join(',')}|${pathSig(path)}`, label: n.text, compressed,
          });
          return;
        }
        case 'fragment': {
          flushPending();
          previous = undefined;
          walkFragment(node.fragment, path, out, compressed);
          return;
        }
      }
    });
    flushPending();
  };

  /** Branch selection for alt/critical/opt: inspector choice → `@branch` → setting (spec step-compilation). */
  const selection = (f: Fragment, key: string): { selected: BranchChoice; pending: boolean } => {
    const chosen = options.branchChoices?.[key];
    if (chosen !== undefined) return { selected: chosen, pending: false };
    const annotation = (byFragment.get(f.id) ?? []).find((a) => a.name === 'branch');
    if (annotation) {
      const v = annotation.args[0]!.value;
      if (v.kind === 'number') return { selected: Math.min(f.branches.length, Math.max(1, v.value)) - 1, pending: false };
      const text = valueText(v);
      if (text === 'all' || text === 'skip') return { selected: text, pending: false };
      if (text === 'ask') return { selected: 0, pending: f.kind !== 'opt' };
      const byLabel = f.branches.findIndex((b) => normalise(b.label) === normalise(text));
      if (byLabel >= 0) return { selected: byLabel, pending: false };
      diagnostics.push({ message: `No branch labelled '${text}' in '${f.kind} ${f.label}'.`, severity: 'warning', range: annotation.range, code: 'annotation/unknown-branch' });
    }
    if (f.kind === 'opt') return { selected: 0, pending: false };
    if (altPolicy === 'all') return { selected: 'all', pending: false };
    return { selected: 0, pending: altPolicy === 'ask' };
  };

  const walkFragment = (f: Fragment, path: FragmentFrame[], out: Draft[], compressed: boolean) => {
    const key = keys.get(f.id) ?? f.id;
    const frame = (b: number, extra: Partial<FragmentFrame> = {}): FragmentFrame => ({ fragmentId: f.id, key, kind: f.kind, label: f.label, branch: b, branchLabel: f.branches[b]?.label ?? '', ...extra });
    const info: FragmentInfo = { key, id: f.id, kind: f.kind, label: f.label, branches: f.branches.map((b) => b.label) };
    fragmentInfo.push(info);

    if (f.kind === 'loop') {
      const annotation = (byFragment.get(f.id) ?? []).find((a) => a.name === 'iterations');
      let n = annotation ? Math.floor(asNumber(annotation.args[0]?.value) ?? loopDefault) : loopDefault;
      if (n > MAX_LOOP_ITERATIONS) {
        diagnostics.push({ message: `Loops play at most ${MAX_LOOP_ITERATIONS} times; '${f.label}' is capped.`, severity: 'warning', range: annotation?.range ?? f.range, code: 'annotation/iterations-capped' });
        n = MAX_LOOP_ITERATIONS;
      }
      info.iterations = n;
      for (let i = 1; i <= n; i++) walk(f.branches[0]?.children ?? [], [...path, frame(0, { iteration: i, of: n })], out, compressed || (i > 1 && options.compressRepeats !== false));
      return;
    }

    if (f.kind === 'par' && concurrent && f.branches.length > 1) {
      const lanes = f.branches.map((branch, b) => {
        const laneOut: Draft[] = [];
        walk(branch.children, [...path, frame(b)], laneOut, compressed);
        return laneOut;
      });
      const longest = Math.max(0, ...lanes.map((l) => l.length));
      for (let k = 0; k < longest; k++) {
        const parts = lanes.map((l, lane) => ({ lane, draft: l[k] })).filter((p): p is { lane: number; draft: Draft } => !!p.draft);
        if (parts.length === 1) {
          out.push(parts[0]!.draft);
          continue;
        }
        const first = parts[0]!.draft;
        out.push({
          kind: parts.some((p) => p.draft.kind === 'message') ? 'message' : first.kind,
          messages: parts.flatMap((p) => p.draft.messages),
          noteIds: parts.flatMap((p) => p.draft.noteIds),
          noteTexts: parts.flatMap((p) => p.draft.noteTexts),
          activations: parts.flatMap((p) => p.draft.activations),
          creates: parts.flatMap((p) => p.draft.creates),
          destroys: parts.flatMap((p) => p.draft.destroys),
          path: [...path, frame(parts[0]!.lane)],
          sources: parts.flatMap((p) => p.draft.sources),
          anchors: parts.flatMap((p) => p.draft.anchors),
          structuralSig: parts.map((p) => p.draft.structuralSig).join('&'),
          label: parts.map((p) => p.draft.label).filter(Boolean).join(' ‖ '),
          compressed,
          lanes: parts.map((p) => ({ lane: p.lane, label: f.branches[p.lane]?.label ?? '', targets: [...p.draft.messages.map((m) => m.id), ...p.draft.noteIds], source: p.draft.sources[0]! })),
        });
      }
      return;
    }

    if (f.kind === 'alt' || f.kind === 'critical' || f.kind === 'opt') {
      const { selected, pending } = selection(f, key);
      info.selected = selected;
      info.pending = pending || undefined;
      f.branches.forEach((branch, b) => {
        const plays = selected === 'all' || (selected !== 'skip' && selected === b);
        if (!plays) {
          markUnplayed(branch.children);
          return;
        }
        const before = out.length;
        walk(branch.children, [...path, frame(b)], out, compressed);
        if (pending && out.length > before) out[before]!.choice = { fragmentKey: key, labels: f.branches.map((x) => x.label) };
      });
      return;
    }

    // par (sequential), break, rect: every branch plays in order.
    f.branches.forEach((branch, b) => walk(branch.children, [...path, frame(b)], out, compressed));
  };

  walk(model.body, [], drafts, false);

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

    // Annotations win over sidecar entries (spec sidecar-files: sidecars sit below annotations).
    const caption = list.filter((a) => a.name === 'caption').map((a) => a.args.map((x) => valueText(x.value)).join(' ')).join(' ') || options.stepCaptions?.[index] || undefined;
    const chapter = find('chapter') ? find('chapter')!.args.map((x) => valueText(x.value)).join(' ') : options.stepChapters?.[index];
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
    if (draft.compressed) {
      transitionMs /= 2;
      dwellMs /= 2;
    }
    const focusArg = find('focus')?.args[0]?.value;
    const focus = focusArg ? (focusArg.kind === 'list' ? focusArg.items.map(valueText) : [valueText(focusArg)]) : undefined;
    const lanes = draft.lanes?.map((lane) => {
      const laneCaption = list.filter((a) => a.name === 'caption' && lane.targets.some((t) => (byStatement.get(t) ?? []).includes(a))).map((a) => a.args.map((x) => valueText(x.value)).join(' ')).join(' ');
      return laneCaption ? { ...lane, caption: laneCaption } : lane;
    });
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
      lanes,
      focus,
      choice: draft.choice,
    };
  });
  // A pending branch choice stops autoplay at the rest point of the step before it.
  steps.forEach((step, i) => {
    if (step.choice && i > 0) steps[i - 1]!.timing.hold = true;
  });

  return { steps, initial, unplayed, hiddenNotes: notesMode === 'hidden', participantKinds, fragments: fragmentInfo, diagnostics };
}

/** Participants as seen after compilation (kinds overridden by `@type`). */
export function effectiveParticipants(model: SequenceModel, compiled: CompiledSequence): Participant[] {
  return model.participants.map((p) => ({ ...p, kind: compiled.participantKinds[p.id] ?? p.kind }));
}

/**
 * Resolves a sidecar step key (spec sidecar-files): `#<n>` (1-based step number), an `@step-id`
 * or content id, or a structural id. Returns the step index, or undefined when nothing matches.
 */
export function resolveStepKey(steps: readonly Pick<Step, 'id' | 'structuralId'>[], key: string): number | undefined {
  const numbered = /^#(\d+)$/.exec(key.trim());
  if (numbered) {
    const n = Number(numbered[1]);
    return n >= 1 && n <= steps.length ? n - 1 : undefined;
  }
  const byId = steps.findIndex((s) => s.id === key);
  if (byId >= 0) return byId;
  const byStructure = steps.findIndex((s) => s.structuralId === key);
  return byStructure >= 0 ? byStructure : undefined;
}
