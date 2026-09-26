import type { DocumentLoadPayload, HostMessage, ThemeKind, WebviewSettings } from '@mermaid-animator/protocol';

/** Everything the webview knows from the host. Pure data; updated by `reduce`. */
export interface HostState {
  initialized: boolean;
  settings: WebviewSettings;
  themeKind: ThemeKind;
  /** Editor preference; `null` means "follow the OS". */
  reduceMotionPreference: boolean | null;
  locale: string;
  strings: Record<string, string>;
  document?: DocumentLoadPayload;
  /** Last editor cursor position inside the bound diagram (document coordinates). */
  cursor?: { line: number; character: number };
}

export const initialHostState: HostState = {
  initialized: false,
  settings: { themeMode: 'auto' },
  themeKind: 'dark',
  reduceMotionPreference: null,
  locale: 'en',
  strings: {},
};

/** Applies a validated host message to the state. */
export function reduce(state: HostState, message: HostMessage): HostState {
  switch (message.type) {
    case 'init':
      return {
        ...state,
        initialized: true,
        settings: message.payload.settings,
        themeKind: message.payload.themeKind,
        reduceMotionPreference: message.payload.reduceMotion,
        locale: message.payload.locale,
        strings: message.payload.strings,
      };
    case 'document/load':
      return { ...state, document: message.payload };
    case 'document/update':
      if (!state.document) return state;
      if (message.payload.version < state.document.version) return state;
      return { ...state, document: { ...state.document, ...message.payload } };
    case 'settings/changed':
      return {
        ...state,
        settings: message.payload.settings,
        themeKind: message.payload.themeKind,
        reduceMotionPreference: message.payload.reduceMotion,
      };
    case 'editor/cursor':
      return { ...state, cursor: message.payload };
    case 'command':
    case 'export/ack':
    case 'presentation/state':
      return state;
  }
}

/** Resolves reduced motion: an explicit editor preference wins over the OS query. */
export function resolveReduceMotion(preference: boolean | null, osPrefersReduced: boolean): boolean {
  return preference ?? osPrefersReduced;
}

/** Formats a localised string, replacing `{0}`, `{1}`… placeholders. */
export function format(strings: Record<string, string>, key: string, ...args: (string | number)[]): string {
  const template = strings[key] ?? key;
  return template.replace(/\{(\d+)\}/g, (_m, i: string) => String(args[Number(i)] ?? ''));
}
