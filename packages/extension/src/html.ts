/**
 * Webview HTML and Content Security Policy (spec §18). Pure functions: no
 * `vscode` import, so they are unit-testable and shared by desktop and web hosts.
 */

/** 128-bit random nonce, base64url-encoded. Uses Web Crypto (Node ≥ 20 and browsers). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildCsp(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `style-src ${cspSource} 'nonce-${nonce}'`,
    `img-src ${cspSource} data: blob:`,
    `font-src ${cspSource} data:`,
    `worker-src ${cspSource} blob:`,
    "connect-src 'none'",
  ].join('; ');
}

export interface HtmlAssets {
  cspSource: string;
  nonce: string;
  lang: string;
  scriptUri: string;
  styleUris: string[];
}

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function buildHtml(assets: HtmlAssets): string {
  const csp = buildCsp(assets.cspSource, assets.nonce);
  const styles = assets.styleUris.map((uri) => `<link rel="stylesheet" href="${escapeAttr(uri)}">`).join('\n    ');
  return `<!DOCTYPE html>
<html lang="${escapeAttr(assets.lang)}">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${styles}
    <title>Mermaid Animator</title>
  </head>
  <body>
    <div id="app" class="ma-root"></div>
    <script type="module" nonce="${assets.nonce}" src="${escapeAttr(assets.scriptUri)}"></script>
  </body>
</html>`;
}
