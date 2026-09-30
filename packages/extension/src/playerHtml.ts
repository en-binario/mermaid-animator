/**
 * Assembles the self-contained HTML player (spec html-player, M3 D5): the player bundle and its
 * styles inline, the data document as inert JSON, and a strict CSP that allows exactly the inline
 * script and style by hash. Pure (Web Crypto only), so desktop and web hosts share it.
 */

async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let binary = '';
  for (const b of new Uint8Array(digest)) binary += String.fromCharCode(b);
  return btoa(binary);
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON that cannot close its <script> element or open an HTML comment. */
export function scriptSafeJson(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export interface PlayerHtmlParts {
  js: string;
  css: string;
  data: string;
  title: string;
  lang: string;
  theme: 'light' | 'dark' | 'auto' | 'monochrome';
}

export async function assemblePlayerHtml(parts: PlayerHtmlParts): Promise<string> {
  // A </script> inside the bundle would end the element early.
  const js = parts.js.replace(/<\/script/gi, '<\\/script');
  const css = parts.css.replace(/<\/style/gi, '<\\/style');
  const [scriptHash, styleHash] = await Promise.all([sha256(js), sha256(css)]);
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${scriptHash}'`,
    `style-src 'sha256-${styleHash}'`,
    // Scene state is written through CSSOM (not blocked); fonts and images are embedded as data.
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const color = parts.theme === 'dark' ? 'dark' : parts.theme === 'light' || parts.theme === 'monochrome' ? 'light' : 'light dark';
  return `<!DOCTYPE html>
<html lang="${escapeHtml(parts.lang)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="${color}">
<meta name="generator" content="Mermaid Animator">
<title>${escapeHtml(parts.title)}</title>
<style>${css}</style>
</head>
<body>
<div id="ma-player"></div>
<script type="application/json" id="ma-player-data">${scriptSafeJson(parts.data)}</script>
<script>${js}</script>
</body>
</html>
`;
}
