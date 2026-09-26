/**
 * Host ↔ webview message contract (spec §13.10). Every message is an envelope
 * `{ v, type, id?, payload }`; `v` is the protocol version.
 */

export const PROTOCOL_VERSION = 1;

export type ThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';
export type ThemeMode = 'auto' | 'ivory' | 'graphite' | 'highContrast';

/** Settings the webview needs. Extended by later milestones; unknown keys are ignored. */
export interface WebviewSettings {
  themeMode: ThemeMode;
  [key: string]: unknown;
}

/** Zero-based position in the host document. */
export interface DocumentRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface InitPayload {
  settings: WebviewSettings;
  themeKind: ThemeKind;
  /** `true`/`false` when the editor forces it; `null` defers to the OS preference. */
  reduceMotion: boolean | null;
  locale: string;
  strings: Record<string, string>;
}

export interface DiagramSummary {
  index: number;
  type: string;
  title?: string;
  summary: string;
}

export interface DocumentLoadPayload {
  uri: string;
  fileName: string;
  source: string;
  version: number;
  /** Where the diagram's text starts in the host document. */
  origin: { line: number; character: number };
  /** Index of this diagram in its document (M1). */
  diagramIndex?: number;
  /** Every diagram in the source document, for the toolbar switcher (M1). */
  diagrams?: DiagramSummary[];
}

export interface DocumentUpdatePayload {
  source: string;
  version: number;
  origin: { line: number; character: number };
  /** The bound diagram is no longer in the document; keep the last rendering and say so (M1). */
  unbound?: boolean;
}

export interface SettingsChangedPayload {
  settings: WebviewSettings;
  themeKind: ThemeKind;
  reduceMotion: boolean | null;
}

export type CommandAction =
  | 'togglePlay' | 'play' | 'pause' | 'next' | 'previous' | 'first' | 'last' | 'goToStep'
  | 'export' | 'exportSvg' | 'exportPng' | 'copyImage' | 'revealSource' | 'fit'
  | 'seekToLine' | 'nextChapter' | 'previousChapter' | 'toggleTranscript' | 'toggleInspector' | 'search' | 'startPresentation' | 'stopPresentation';

export const COMMAND_ACTIONS: readonly CommandAction[] = [
  'togglePlay', 'play', 'pause', 'next', 'previous', 'first', 'last', 'goToStep', 'export', 'exportSvg', 'exportPng', 'copyImage', 'revealSource', 'fit',
  'seekToLine', 'nextChapter', 'previousChapter', 'toggleTranscript', 'toggleInspector', 'search', 'startPresentation', 'stopPresentation',
];

export type ExportFormat = 'svg' | 'png';

export type HostMessage =
  | { v: 1; type: 'init'; payload: InitPayload }
  | { v: 1; type: 'document/load'; payload: DocumentLoadPayload }
  | { v: 1; type: 'document/update'; payload: DocumentUpdatePayload }
  | { v: 1; type: 'settings/changed'; payload: SettingsChangedPayload }
  | { v: 1; type: 'command'; payload: { action: CommandAction; args?: Record<string, unknown> } }
  | { v: 1; type: 'editor/cursor'; payload: { line: number; character: number } }
  | { v: 1; type: 'export/ack'; payload: { path: string } }
  /** The host's presentation layout is on or off (confirms `presentation/toggle`, or reports an exit by other means). */
  | { v: 1; type: 'presentation/state'; payload: { on: boolean } };

export interface StatePayload {
  uri?: string;
  stepIndex?: number;
  stepCount?: number;
  playing?: boolean;
  /** Document ranges of the current step, for editor decorations (M1). */
  sourceRanges?: DocumentRange[];
  [key: string]: unknown;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface ExportDataPayload {
  format: ExportFormat;
  suggestedName: string;
  /** File bytes (this chunk). */
  data: Uint8Array;
  /** 0-based chunk index and total chunk count (files over 8 MB are chunked). */
  index: number;
  total: number;
}

export type WebviewMessage =
  | { v: 1; type: 'ready'; payload: { protocol: number } }
  | { v: 1; type: 'state/changed'; payload: StatePayload }
  | { v: 1; type: 'log'; payload: { level: LogLevel; message: string } }
  | { v: 1; type: 'diagram/select'; payload: { index: number } }
  | { v: 1; type: 'source/reveal'; payload: { range: DocumentRange } }
  | { v: 1; type: 'export/data'; payload: ExportDataPayload }
  | { v: 1; type: 'clipboard/fallback'; payload: { reason: string } }
  /** Asks the host to enter or leave the presentation layout (spec presentation-mode). */
  | { v: 1; type: 'presentation/toggle'; payload: { on: boolean } };

export type HostMessageType = HostMessage['type'];
export type WebviewMessageType = WebviewMessage['type'];

export type ValidationResult<T> = { ok: true; message: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

type Guard = (value: unknown) => string | undefined;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const str: Guard = (v) => (typeof v === 'string' ? undefined : 'expected string');
const num: Guard = (v) => (typeof v === 'number' && Number.isFinite(v) ? undefined : 'expected number');
const bool: Guard = (v) => (typeof v === 'boolean' ? undefined : 'expected boolean');
const optional = (g: Guard): Guard => (v) => (v === undefined ? undefined : g(v));
const nullable = (g: Guard): Guard => (v) => (v === null ? undefined : g(v));
const oneOf = (...values: string[]): Guard => (v) => (typeof v === 'string' && values.includes(v) ? undefined : `expected one of ${values.join(', ')}`);
const record: Guard = (v) => (isObject(v) ? undefined : 'expected object');
const stringRecord: Guard = (v) => {
  if (!isObject(v)) return 'expected object';
  for (const [k, val] of Object.entries(v)) if (typeof val !== 'string') return `${k}: expected string`;
  return undefined;
};
const shape = (fields: Record<string, Guard>): Guard => (v) => {
  if (!isObject(v)) return 'expected object';
  for (const [key, guard] of Object.entries(fields)) {
    const error = guard(v[key]);
    if (error) return `${key}: ${error}`;
  }
  return undefined;
};

const themeKind = oneOf('light', 'dark', 'highContrast', 'highContrastLight');
const settings = shape({ themeMode: oneOf('auto', 'ivory', 'graphite', 'highContrast') });
const position = shape({ line: num, character: num });
const range = shape({ startLine: num, startCol: num, endLine: num, endCol: num });
const arrayOf = (g: Guard): Guard => (v) => {
  if (!Array.isArray(v)) return 'expected array';
  for (let i = 0; i < v.length; i++) {
    const error = g(v[i]);
    if (error) return `[${i}]: ${error}`;
  }
  return undefined;
};
const bytes: Guard = (v) => (v instanceof Uint8Array ? undefined : 'expected Uint8Array');
const diagramSummary = shape({ index: num, type: str, title: optional(str), summary: str });

const hostPayloads: Record<HostMessageType, Guard> = {
  init: shape({ settings, themeKind, reduceMotion: nullable(bool), locale: str, strings: stringRecord }),
  'document/load': shape({ uri: str, fileName: str, source: str, version: num, origin: position, diagramIndex: optional(num), diagrams: optional(arrayOf(diagramSummary)) }),
  'document/update': shape({ source: str, version: num, origin: position, unbound: optional(bool) }),
  'settings/changed': shape({ settings, themeKind, reduceMotion: nullable(bool) }),
  command: shape({ action: oneOf(...COMMAND_ACTIONS), args: optional(record) }),
  'editor/cursor': shape({ line: num, character: num }),
  'export/ack': shape({ path: str }),
  'presentation/state': shape({ on: bool }),
};

const webviewPayloads: Record<WebviewMessageType, Guard> = {
  ready: shape({ protocol: num }),
  'state/changed': (v) => record(v) ?? shape({ sourceRanges: optional(arrayOf(range)) })(v),
  log: shape({ level: oneOf('info', 'warn', 'error'), message: str }),
  'diagram/select': shape({ index: num }),
  'source/reveal': shape({ range }),
  'export/data': shape({ format: oneOf('svg', 'png'), suggestedName: str, data: bytes, index: num, total: num }),
  'clipboard/fallback': shape({ reason: str }),
  'presentation/toggle': shape({ on: bool }),
};

function validate<T>(value: unknown, payloads: Record<string, Guard>): ValidationResult<T> {
  if (!isObject(value)) return { ok: false, error: 'message is not an object' };
  if (value.v !== PROTOCOL_VERSION) return { ok: false, error: `unsupported protocol version ${String(value.v)}` };
  if (typeof value.type !== 'string' || !(value.type in payloads)) return { ok: false, error: `unknown message type ${String(value.type)}` };
  const idError = optional(str)(value.id);
  if (idError) return { ok: false, error: `id: ${idError}` };
  const guard = payloads[value.type] as Guard;
  const error = guard(value.payload);
  if (error) return { ok: false, error: `${value.type} payload.${error}` };
  return { ok: true, message: value as T };
}

/** Validates a message received by the webview from the host. */
export function validateHostMessage(value: unknown): ValidationResult<HostMessage> {
  return validate<HostMessage>(value, hostPayloads);
}

/** Validates a message received by the host from the webview. */
export function validateWebviewMessage(value: unknown): ValidationResult<WebviewMessage> {
  return validate<WebviewMessage>(value, webviewPayloads);
}

/** Builds a host message envelope. */
export function hostMessage<T extends HostMessageType>(type: T, payload: Extract<HostMessage, { type: T }>['payload']): Extract<HostMessage, { type: T }> {
  return { v: PROTOCOL_VERSION, type, payload } as Extract<HostMessage, { type: T }>;
}

/** Builds a webview message envelope. */
export function webviewMessage<T extends WebviewMessageType>(type: T, payload: Extract<WebviewMessage, { type: T }>['payload']): Extract<WebviewMessage, { type: T }> {
  return { v: PROTOCOL_VERSION, type, payload } as Extract<WebviewMessage, { type: T }>;
}
export * from './strings';
