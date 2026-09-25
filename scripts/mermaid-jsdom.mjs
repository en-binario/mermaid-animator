// Loads Mermaid in Node with a jsdom window so its parser can validate sources.
// Shared by scripts/mermaid-probe.mjs and the conformance test.
import { JSDOM } from 'jsdom';

let mermaidPromise;

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const keys = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'SVGElement', 'DOMParser', 'MutationObserver', 'getComputedStyle'];
  for (const key of keys) {
    try {
      Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true, writable: true });
    } catch {
      // some globals (navigator on newer Node) are read-only; Mermaid works without overriding them
    }
  }
}

async function loadMermaid() {
  installDom();
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  return mermaid;
}

/** Resolves to `{ ok: true, type }` or `{ ok: false, error }` — never throws. */
export async function mermaidParse(source) {
  mermaidPromise ??= loadMermaid();
  const mermaid = await mermaidPromise;
  try {
    const result = await mermaid.parse(source);
    return { ok: true, type: result?.diagramType };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
