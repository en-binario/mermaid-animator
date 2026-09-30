/**
 * Static export (spec §14.1, §14.4): standalone SVG with resolved colours, embedded fonts,
 * `textLength` safety and an 8% width buffer; PNG at 1×/2×/3×; copy as PNG to the clipboard.
 * Loaded lazily: it carries the embedded font data.
 */
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';
import interLatinExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2';
import { PALETTES, SVG_NS, type PaletteName } from '@mermaid-animator/renderer';
import { diagramPalette } from './palette';

export interface Drawing {
  svg: SVGSVGElement;
  width: number;
  height: number;
}

export interface ExportOptions {
  background: 'theme' | 'transparent';
  /** Export palette (spec export-theme); omitted, the panel's active palette. */
  palette?: PaletteName;
}

const STYLE_PROPERTIES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor', 'dominant-baseline',
] as const;

const FONT_CSS = [
  `@font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;src:url(${interLatin}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}`,
  `@font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;src:url(${interLatinExt}) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;}`,
].join('\n');

/** The embedded Inter files, for exports drawn outside the document (the export worker). */
export const EMBEDDED_FONTS = [
  { family: 'Inter Variable', url: interLatin as string, unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
  { family: 'Inter Variable', url: interLatinExt as string, unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
];

/** Decodes a base64 data URL (fetch is blocked by `connect-src 'none'`). */
export function dataUrlBytes(url: string): ArrayBuffer {
  const base64 = url.slice(url.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Produces a self-contained SVG document: styles resolved into presentation attributes, fonts
 * embedded as data URIs, no scripts or external references.
 */
export function serializeSvg(drawing: Drawing, options: ExportOptions): string {
  const { svg, width, height } = drawing;
  const pad = 16;
  // Attach off-screen so computed styles (from the token CSS) can be read.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.className = 'ma-export-host';
  // The token block of the export palette redefines the --ma-* colours for this subtree only.
  // Always a drawing scope: without it the host would take the controls' (UI theme) colours.
  host.dataset.palette = options.palette ?? diagramPalette.value;
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', String(Math.ceil(width + 2 * pad)));
    svg.setAttribute('height', String(Math.ceil(height + 2 * pad)));
    svg.setAttribute('viewBox', `${-pad} ${-pad} ${Math.ceil(width + 2 * pad)} ${Math.ceil(height + 2 * pad)}`);
    for (const el of [svg, ...svg.querySelectorAll('*')]) {
      if (el instanceof SVGStyleElement) continue;
      const computed = getComputedStyle(el);
      for (const prop of STYLE_PROPERTIES) {
        const value = computed.getPropertyValue(prop);
        if (value && value !== 'normal' && !(prop === 'stroke-dasharray' && value === 'none')) el.setAttribute(prop, value);
      }
      if (computed.display === 'none') el.setAttribute('display', 'none');
    }
    // Fallback fonts must not overflow boxes (spec §14.4): pin each line's advance.
    for (const tspan of svg.querySelectorAll<SVGTextContentElement>('text > tspan, text:not(:has(tspan))')) {
      const length = tspan.getComputedTextLength();
      if (length > 0) {
        tspan.setAttribute('textLength', length.toFixed(2));
        tspan.setAttribute('lengthAdjust', 'spacing');
      }
    }
    for (const el of svg.querySelectorAll('[class], [data-kind], [data-id], [data-state], [data-emphasis], [data-muted], [data-active], [data-ghost]')) {
      for (const attr of ['class', 'data-kind', 'data-id', 'data-state', 'data-emphasis', 'data-muted', 'data-active', 'data-ghost']) el.removeAttribute(attr);
    }
    svg.removeAttribute('class');
    svg.removeAttribute('role');
  } finally {
    host.remove();
  }
  // Added only once detached: a <style> element inside the live document would be blocked by the CSP.
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = FONT_CSS;
  svg.insertBefore(style, svg.firstChild);
  if (options.background === 'theme') {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(-pad));
    bg.setAttribute('y', String(-pad));
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', PALETTES[options.palette ?? diagramPalette.value].canvas);
    svg.insertBefore(bg, style.nextSibling);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

/** Rasterises a serialised SVG to PNG at `scale`. */
export async function rasterize(svgText: string, width: number, height: number, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The SVG could not be rasterised.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Size of the exported document (drawing plus padding), in CSS pixels. */
export function exportSize(drawing: Drawing): { width: number; height: number } {
  return { width: Math.ceil(drawing.width + 32), height: Math.ceil(drawing.height + 32) };
}

/** Places a PNG on the system clipboard from within the webview (spec §13.10). */
export async function copyPng(blob: Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
