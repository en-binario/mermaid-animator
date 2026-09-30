/**
 * Host ↔ webview message contract (spec §13.10). Every message is an envelope
 * `{ v, type, id?, payload }`; `v` is the protocol version.
 */

export const PROTOCOL_VERSION = 1;

export type ThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';
/** The Mermaid 12 themes (spec visual-theme: diagram theme selection). */
export type MermaidTheme = 'default' | 'neutral' | 'dark' | 'forest' | 'base' | 'neo' | 'neo-dark' | 'redux' | 'redux-dark' | 'redux-color' | 'redux-dark-color';
export const MERMAID_THEMES: readonly MermaidTheme[] = ['default', 'neutral', 'dark', 'forest', 'base', 'neo', 'neo-dark', 'redux', 'redux-dark', 'redux-color', 'redux-dark-color'];
/** `mermaidAnimator.theme.diagram`: Ink & Ivory, the Mermaid themes and Monochrome. */
export type DiagramTheme = 'auto' | 'ivory' | 'graphite' | 'highContrast' | MermaidTheme | 'monochrome';
/** Every diagram theme, in the toolbar menu's order. */
export const DIAGRAM_THEMES: readonly DiagramTheme[] = ['auto', 'ivory', 'graphite', 'highContrast', ...MERMAID_THEMES, 'monochrome'];
/** `mermaidAnimator.theme.ui`: the colours of the panel's controls. */
export type UiTheme = 'vscode' | 'ivory' | 'graphite' | 'highContrast';
export const UI_THEMES: readonly UiTheme[] = ['vscode', 'ivory', 'graphite', 'highContrast'];

/**
 * The effective diagram theme: `theme.diagram` when a settings scope sets a valid value, else the
 * deprecated `theme.mode`, else `auto` (spec visual-theme). Pass `undefined` for an unset key.
 */
export function resolveDiagramTheme(diagram: unknown, mode?: unknown): DiagramTheme {
  if (diagram !== undefined) return (DIAGRAM_THEMES as readonly unknown[]).includes(diagram) ? (diagram as DiagramTheme) : 'auto';
  return (DIAGRAM_THEMES as readonly unknown[]).includes(mode) ? (mode as DiagramTheme) : 'auto';
}

/** The effective UI theme: a valid `theme.ui` value, else `vscode`. */
export function resolveUiTheme(value: unknown): UiTheme {
  return (UI_THEMES as readonly unknown[]).includes(value) ? (value as UiTheme) : 'vscode';
}

/** Settings the webview needs. Extended by later milestones; unknown keys are ignored. */
export interface WebviewSettings {
  /** Resolved by the host: `theme.diagram`, or the deprecated `theme.mode` when it is unset. */
  diagramTheme: DiagramTheme;
  uiTheme: UiTheme;
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
  /** Manual topology positions saved for this diagram (M2b), node id → centre. */
  layout?: Record<string, { x: number; y: number }>;
  /** This diagram's entry of `<file>.animator.json` (M3). */
  sidecar?: SidecarEntry;
}

/** A diagram's entry in a sidecar file (spec sidecar-files). Step keys are resolved by the webview. */
export interface SidecarEntry {
  settings?: Record<string, unknown>;
  /** Step key (`@step-id`, content id, structural id or `#<n>`) → caption. */
  captions?: Record<string, string>;
  /** Step key → chapter title starting at that step. */
  chapters?: Record<string, string>;
  /** Topology node id → centre. */
  layout?: Record<string, { x: number; y: number }>;
}

export interface DocumentUpdatePayload {
  /** The refreshed sidecar entry when the sidecar file changed (M3). */
  sidecar?: SidecarEntry;
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
  | 'seekToLine' | 'nextChapter' | 'previousChapter' | 'toggleTranscript' | 'toggleInspector' | 'search' | 'startPresentation' | 'stopPresentation'
  | 'setView' | 'toggleView' | 'resetLayout'
  | 'goToStepId' | 'saveLayout' | 'saveDefaults';

export const COMMAND_ACTIONS: readonly CommandAction[] = [
  'togglePlay', 'play', 'pause', 'next', 'previous', 'first', 'last', 'goToStep', 'export', 'exportSvg', 'exportPng', 'copyImage', 'revealSource', 'fit',
  'seekToLine', 'nextChapter', 'previousChapter', 'toggleTranscript', 'toggleInspector', 'search', 'startPresentation', 'stopPresentation',
  'setView', 'toggleView', 'resetLayout',
  'goToStepId', 'saveLayout', 'saveDefaults',
];

export type ExportFormat = 'svg' | 'png' | 'gif' | 'webm' | 'mp4' | 'html';

export type HostMessage =
  | { v: 1; type: 'init'; payload: InitPayload }
  | { v: 1; type: 'document/load'; payload: DocumentLoadPayload }
  | { v: 1; type: 'document/update'; payload: DocumentUpdatePayload }
  | { v: 1; type: 'settings/changed'; payload: SettingsChangedPayload }
  | { v: 1; type: 'command'; payload: { action: CommandAction; args?: Record<string, unknown> } }
  | { v: 1; type: 'editor/cursor'; payload: { line: number; character: number } }
  | { v: 1; type: 'export/ack'; payload: { path: string } }
  /** The user cancelled the export's progress notification (M3). */
  | { v: 1; type: 'export/cancel'; payload: Record<string, never> }
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
  /** Half of a light/dark animated-SVG pair; the host writes both beside each other (M3). */
  pair?: 'light' | 'dark';
}

/** Data for the self-contained HTML player (M3 D5); the host inlines the player bundle around it. */
export interface PlayerExportPayload {
  suggestedName: string;
  title: string;
  /** JSON document read by the player bundle. */
  data: string;
  /** `light`, `dark`, `auto` (follow the viewer's colour scheme) or `monochrome` (spec export-theme). */
  theme: 'light' | 'dark' | 'auto' | 'monochrome';
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
  | { v: 1; type: 'presentation/toggle'; payload: { on: boolean } }
  /** Manual topology positions changed (M2b); `key` identifies the diagram within its document. */
  | { v: 1; type: 'layout/save'; payload: { key: string; positions: Record<string, { x: number; y: number }> } }
  /** Animated-export progress (M3); the first message opens the host's progress notification. */
  | { v: 1; type: 'export/progress'; payload: { fraction: number; phase: string } }
  /** The export stopped after `export/cancel` (or a sheet cancel); nothing will be written. */
  | { v: 1; type: 'export/cancelled'; payload: Record<string, never> }
  /** Open the Settings UI filtered to this extension (spec animator-panel); the host picks the query. */
  | { v: 1; type: 'settings/open'; payload: Record<string, never> }
  /** The user chose a diagram theme in the toolbar menu; the host writes `mermaidAnimator.theme.diagram` (spec visual-theme). */
  | { v: 1; type: 'theme/set'; payload: { theme: DiagramTheme } }
  | { v: 1; type: 'export/player'; payload: PlayerExportPayload }
  /** Merge a patch into this diagram's sidecar entry (Save Topology Layout, Save as Diagram Defaults). */
  | { v: 1; type: 'sidecar/write'; payload: { patch: SidecarEntry } }
  /** Sidecar keys that no longer resolve to a step, for diagnostics on the sidecar file. */
  | { v: 1; type: 'sidecar/unresolved'; payload: { entries: { section: 'captions' | 'chapters'; key: string }[] } };

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
const settings = shape({ diagramTheme: oneOf(...DIAGRAM_THEMES), uiTheme: oneOf(...UI_THEMES) });
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
const point = shape({ x: num, y: num });
const positions: Guard = (v) => {
  if (!isObject(v)) return 'expected object';
  for (const [k, p] of Object.entries(v)) {
    const error = point(p);
    if (error) return `${k}: ${error}`;
  }
  return undefined;
};
const sidecarEntry = shape({ settings: optional(record), captions: optional(stringRecord), chapters: optional(stringRecord), layout: optional(positions) });

const hostPayloads: Record<HostMessageType, Guard> = {
  init: shape({ settings, themeKind, reduceMotion: nullable(bool), locale: str, strings: stringRecord }),
  'document/load': shape({ uri: str, fileName: str, source: str, version: num, origin: position, diagramIndex: optional(num), diagrams: optional(arrayOf(diagramSummary)), layout: optional(positions), sidecar: optional(sidecarEntry) }),
  'document/update': shape({ source: str, version: num, origin: position, unbound: optional(bool), sidecar: optional(sidecarEntry) }),
  'settings/changed': shape({ settings, themeKind, reduceMotion: nullable(bool) }),
  command: shape({ action: oneOf(...COMMAND_ACTIONS), args: optional(record) }),
  'editor/cursor': shape({ line: num, character: num }),
  'export/ack': shape({ path: str }),
  'export/cancel': record,
  'presentation/state': shape({ on: bool }),
};

const webviewPayloads: Record<WebviewMessageType, Guard> = {
  ready: shape({ protocol: num }),
  'state/changed': (v) => record(v) ?? shape({ sourceRanges: optional(arrayOf(range)) })(v),
  log: shape({ level: oneOf('info', 'warn', 'error'), message: str }),
  'diagram/select': shape({ index: num }),
  'source/reveal': shape({ range }),
  'export/data': shape({ format: oneOf('svg', 'png', 'gif', 'webm', 'mp4', 'html'), suggestedName: str, data: bytes, index: num, total: num, pair: optional(oneOf('light', 'dark')) }),
  'export/progress': shape({ fraction: num, phase: str }),
  'export/cancelled': record,
  'settings/open': record,
  'theme/set': shape({ theme: oneOf(...DIAGRAM_THEMES) }),
  'export/player': shape({ suggestedName: str, title: str, data: str, theme: oneOf('light', 'dark', 'auto', 'monochrome') }),
  'sidecar/write': shape({ patch: sidecarEntry }),
  'sidecar/unresolved': shape({ entries: arrayOf(shape({ section: oneOf('captions', 'chapters'), key: str })) }),
  'clipboard/fallback': shape({ reason: str }),
  'presentation/toggle': shape({ on: bool }),
  'layout/save': shape({ key: str, positions }),
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
