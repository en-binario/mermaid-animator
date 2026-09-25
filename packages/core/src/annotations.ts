/**
 * The `%% @directive` annotation language (spec §11): grammar, scopes and validation.
 * Attaching statement-scoped annotations to steps happens in the step compiler.
 */
import { LineIndex, type Diagnostic, type SourceRange } from './text';
import { preprocess } from './preprocess';

export type AnnotationScope = 'diagram' | 'statement' | 'fragment' | 'declaration';

export type AnnotationValue =
  | { kind: 'string'; value: string }
  | { kind: 'duration'; ms: number; raw: string }
  | { kind: 'number'; value: number; raw: string }
  | { kind: 'word'; value: string }
  | { kind: 'list'; items: AnnotationValue[] };

export interface AnnotationArg {
  key?: string;
  value: AnnotationValue;
}

export interface Annotation {
  name: string;
  args: AnnotationArg[];
  scope: AnnotationScope;
  /** Diagram-relative line of the annotation. */
  line: number;
  range: SourceRange;
}

interface DirectiveSpec {
  scope: AnnotationScope;
  validate: (args: AnnotationArg[]) => string | undefined;
}

// -- value helpers ------------------------------------------------------------------------------

export function valueText(v: AnnotationValue): string {
  switch (v.kind) {
    case 'string':
    case 'word':
      return v.value;
    case 'duration':
    case 'number':
      return v.raw;
    case 'list':
      return v.items.map(valueText).join(', ');
  }
}

export function asDuration(v: AnnotationValue | undefined): number | undefined {
  if (!v) return undefined;
  if (v.kind === 'duration') return v.ms;
  if (v.kind === 'number' && !v.raw.endsWith('x')) return v.value;
  return undefined;
}

export function asNumber(v: AnnotationValue | undefined): number | undefined {
  return v?.kind === 'number' ? v.value : undefined;
}

// -- validators -----------------------------------------------------------------------------------

const none = (args: AnnotationArg[]) => (args.length ? 'takes no arguments' : undefined);
const one = (pred: (v: AnnotationValue) => boolean, what: string, optional = false) => (args: AnnotationArg[]) => {
  if (args.length === 0) return optional ? undefined : `expects ${what}`;
  if (args.length > 1 || args[0]?.key !== undefined || !pred(args[0]!.value)) return `expects ${what}`;
  return undefined;
};
const isText = (v: AnnotationValue) => v.kind === 'string' || v.kind === 'word';
const isDuration = (v: AnnotationValue) => v.kind === 'duration' || (v.kind === 'number' && !v.raw.endsWith('x') && v.value >= 0);
const isPositiveInt = (v: AnnotationValue) => v.kind === 'number' && Number.isInteger(v.value) && v.value >= 1 && !v.raw.endsWith('x');
const isSpeed = (v: AnnotationValue) => v.kind === 'number' && v.value >= 0.25 && v.value <= 4;
const isSlug = (v: AnnotationValue) => v.kind === 'word' && /^[A-Za-z0-9][\w.-]*$/.test(v.value);
const anyList = (args: AnnotationArg[]) => (args.length ? undefined : 'expects one or more values');
const textRun = (args: AnnotationArg[]) => (args.length && args.every((a) => !a.key && isText(a.value)) ? undefined : 'expects quoted text');

/** Short names usable in `@animator key=value` (spec §15.2) and the values accepted in M1. */
export const ANIMATOR_KEYS: Record<string, ((v: AnnotationValue) => boolean) | null> = {
  speed: isSpeed,
  autoplay: (v) => v.kind === 'word' && ['true', 'false'].includes(v.value),
  dwell: (v) => v.kind === 'word' && ['fixed', 'adaptive'].includes(v.value),
  dwellMs: isDuration,
  onEnd: (v) => v.kind === 'word' && ['stop', 'loop', 'rewind'].includes(v.value),
  reverse: (v) => v.kind === 'word' && ['animate', 'cut'].includes(v.value),
  startAt: (v) => v.kind === 'word' && ['beginning', 'end', 'lastPosition'].includes(v.value),
  notes: (v) => v.kind === 'word' && ['step', 'attach', 'hidden'].includes(v.value),
  future: (v) => v.kind === 'word' && ['hidden', 'ghosted', 'visible'].includes(v.value),
  past: (v) => v.kind === 'word' && ['full', 'muted', 'trail'].includes(v.value),
  trail: isPositiveInt,
  numbers: (v) => v.kind === 'word' && ['auto', 'always', 'never'].includes(v.value),
  motion: (v) => v.kind === 'word' && ['formal', 'expressive', 'minimal', 'none'].includes(v.value),
  indicator: (v) => v.kind === 'word' && ['pulse', 'comet', 'none'].includes(v.value),
  camera: (v) => v.kind === 'word' && ['auto', 'fit', 'follow', 'cinematic', 'manual'].includes(v.value),
  // Accepted for forward compatibility; take effect in later milestones.
  view: null, iterations: null, branches: null, parallel: null, timing: null, layout: null, direction: null, returns: null, order: null, engine: null,
};

const DIRECTIVES: Record<string, DirectiveSpec> = {
  animator: {
    scope: 'diagram',
    validate: (args) => {
      for (const a of args) {
        if (!a.key) return 'expects key=value pairs';
        if (!(a.key in ANIMATOR_KEYS)) return `does not know the setting '${a.key}'`;
        const check = ANIMATOR_KEYS[a.key];
        if (check && !check(a.value)) return `has an invalid value for '${a.key}'`;
      }
      return undefined;
    },
  },
  id: { scope: 'diagram', validate: one(isSlug, 'an identifier') },
  title: { scope: 'diagram', validate: textRun },
  group: { scope: 'diagram', validate: anyList },
  order: { scope: 'diagram', validate: one((v) => v.kind === 'word' && ['topological', 'source', 'bfs', 'path', 'token'].includes(v.value), 'topological, source, bfs, path or token') },
  path: { scope: 'diagram', validate: anyList },
  start: { scope: 'diagram', validate: anyList },
  events: { scope: 'diagram', validate: anyList },
  chapter: { scope: 'statement', validate: textRun },
  caption: { scope: 'statement', validate: textRun },
  pause: { scope: 'statement', validate: one(isDuration, 'a duration such as 1.5s', true) },
  duration: { scope: 'statement', validate: one(isDuration, 'a duration such as 400ms') },
  latency: { scope: 'statement', validate: one(isDuration, 'a duration such as 40ms') },
  speed: { scope: 'statement', validate: one(isSpeed, 'a speed between 0.25x and 4x') },
  emphasis: { scope: 'statement', validate: none },
  skip: { scope: 'statement', validate: none },
  'with-next': { scope: 'statement', validate: one(isPositiveInt, 'a positive whole number', true) },
  'step-id': { scope: 'statement', validate: one(isSlug, 'an identifier') },
  focus: { scope: 'statement', validate: anyList },
  choose: { scope: 'statement', validate: one(isText, 'a node id or edge label') },
  iterations: { scope: 'fragment', validate: one(isPositiveInt, 'a positive whole number') },
  branch: { scope: 'fragment', validate: one((v) => isPositiveInt(v) || isText(v), 'a branch number, label, all, ask or skip') },
  collapse: { scope: 'fragment', validate: none },
  type: {
    scope: 'declaration',
    validate: one((v) => v.kind === 'word' && ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'].includes(v.value), 'a participant type'),
  },
};

export const DIRECTIVE_NAMES = Object.keys(DIRECTIVES);

export function directiveScope(name: string): AnnotationScope | undefined {
  return DIRECTIVES[name]?.scope;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] as number;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] as number;
      row[j] = Math.min((row[j] as number) + 1, (row[j - 1] as number) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length] as number;
}

export function suggestDirective(name: string): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const known of DIRECTIVE_NAMES) {
    const d = levenshtein(name, known);
    if (d < bestDistance) {
      best = known;
      bestDistance = d;
    }
  }
  return best;
}

// -- grammar ---------------------------------------------------------------------------------------

function parseValue(raw: string): AnnotationValue {
  if (raw.startsWith('"')) return { kind: 'string', value: raw.slice(1, raw.endsWith('"') && raw.length > 1 ? -1 : undefined).replace(/\\"/g, '"') };
  const duration = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(raw);
  if (duration) return { kind: 'duration', ms: Number(duration[1]) * (duration[2] === 's' ? 1000 : 1), raw };
  if (/^-?\d+(?:\.\d+)?x?$/.test(raw)) return { kind: 'number', value: Number(raw.replace(/x$/, '')), raw };
  return { kind: 'word', value: raw };
}

/** Splits argument text into tokens, keeping quoted strings (with `\"` escapes) whole. */
function tokenize(text: string): string[] | undefined {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i] as string)) {
      i++;
      continue;
    }
    let j = i;
    let token = '';
    while (j < text.length && !/\s/.test(text[j] as string)) {
      if (text[j] === '"') {
        const start = j;
        j++;
        while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
        if (j >= text.length) return undefined; // unterminated string
        j++;
        token += text.slice(start, j);
      } else {
        token += text[j];
        j++;
      }
    }
    tokens.push(token);
    i = j;
  }
  return tokens;
}

function parseArgs(text: string): AnnotationArg[] | undefined {
  const raw = tokenize(text);
  if (!raw) return undefined;
  // Merge comma-separated lists written with spaces: `A, B ,C`.
  const merged: string[] = [];
  for (const t of raw) {
    const last = merged[merged.length - 1];
    if (last !== undefined && (last.endsWith(',') || t.startsWith(','))) merged[merged.length - 1] = last + t;
    else merged.push(t);
  }
  return merged.map((token) => {
    const eq = token.startsWith('"') ? -1 : token.indexOf('=');
    const key = eq > 0 ? token.slice(0, eq) : undefined;
    const body = eq > 0 ? token.slice(eq + 1) : token;
    const parts = body.startsWith('"') ? [body] : body.split(',').filter(Boolean);
    const value: AnnotationValue = parts.length > 1 ? { kind: 'list', items: parts.map(parseValue) } : parseValue(parts[0] ?? '');
    return key ? { key, value } : { value };
  });
}

export interface AnnotationParseResult {
  annotations: Annotation[];
  diagnostics: Diagnostic[];
}

/** Extracts and validates every annotation of a diagram (diagram-relative ranges). */
export function parseAnnotations(source: string): AnnotationParseResult {
  const lines = new LineIndex(source);
  const annotations: Annotation[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const comment of preprocess(source).comments) {
    const m = /^%%[ \t]*@([A-Za-z][\w-]*)(.*)$/.exec(comment.text);
    if (!m) continue;
    const name = m[1] as string;
    const range = lines.range(comment.offset, comment.offset + comment.text.length);
    const line = range.startLine;
    const spec = DIRECTIVES[name];
    if (!spec) {
      const suggestion = suggestDirective(name);
      diagnostics.push({
        message: `Unknown annotation '@${name}'.${suggestion ? ` Did you mean '@${suggestion}'?` : ''}`,
        severity: 'warning',
        range,
        code: 'annotation/unknown',
      });
      continue;
    }
    const args = parseArgs(m[2] as string);
    const problem = args ? spec.validate(args) : 'has an unterminated string';
    if (!args || problem) {
      diagnostics.push({ message: `'@${name}' ${problem}.`, severity: 'error', range, code: 'annotation/invalid-arguments' });
      continue;
    }
    annotations.push({ name, args, scope: spec.scope, line, range });
  }
  const seen = new Map<string, Annotation>();
  for (const a of annotations.filter((x) => x.name === 'step-id')) {
    const id = valueText(a.args[0]!.value);
    if (seen.has(id)) diagnostics.push({ message: `Duplicate '@step-id ${id}'.`, severity: 'error', range: a.range, code: 'annotation/duplicate-step-id' });
    else seen.set(id, a);
  }
  return { annotations, diagnostics };
}

/** Diagram-level `@animator` settings merged into one record of short names. */
export function animatorSettings(annotations: Annotation[]): Record<string, AnnotationValue> {
  const out: Record<string, AnnotationValue> = {};
  for (const a of annotations) if (a.name === 'animator') for (const arg of a.args) if (arg.key) out[arg.key] = arg.value;
  return out;
}
