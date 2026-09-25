import { describe, expect, it } from 'vitest';
import { buildCsp, buildHtml, createNonce } from '../src/html';

const cspSource = 'https://file+.vscode-resource.vscode-cdn.net';

describe('createNonce', () => {
  it('returns 128 bits of url-safe randomness and never repeats', () => {
    const nonces = new Set(Array.from({ length: 200 }, () => createNonce()));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/); // 16 bytes → 22 base64url chars
    }
  });
});

describe('buildCsp', () => {
  const csp = buildCsp(cspSource, 'abc');
  const directives = Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));

  it('denies everything by default and blocks the network', () => {
    expect(directives['default-src']).toEqual(["'none'"]);
    expect(directives['connect-src']).toEqual(["'none'"]);
  });

  it('allows scripts only by nonce or from the resource origin', () => {
    expect(directives['script-src']).toEqual(["'nonce-abc'", cspSource]);
    expect(csp).not.toContain('unsafe-eval');
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
  });

  it('restricts styles, images, fonts and workers', () => {
    expect(directives['style-src']).toEqual([cspSource, "'nonce-abc'"]);
    expect(directives['style-src-attr']).toEqual(["'unsafe-inline'"]);
    expect(directives['style-src-elem']).toBeUndefined();
    expect(directives['img-src']).toEqual([cspSource, 'data:', 'blob:']);
    expect(directives['font-src']).toEqual([cspSource, 'data:']);
    expect(directives['worker-src']).toEqual([cspSource, 'blob:']);
  });
});

describe('buildHtml', () => {
  it('embeds the policy, the nonce on the script and only resource-origin assets', () => {
    const html = buildHtml({ cspSource, nonce: 'n0nce', lang: 'es', scriptUri: `${cspSource}/main.js`, styleUris: [`${cspSource}/main.css`] });
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain(`<script type="module" nonce="n0nce" src="${cspSource}/main.js">`);
    expect(html).toContain('<html lang="es">');
    expect(html).not.toMatch(/https?:\/\/(?!file\+\.vscode-resource)/);
  });

  it('produces a different nonce for every render', () => {
    const a = buildHtml({ cspSource, nonce: createNonce(), lang: 'en', scriptUri: 'x', styleUris: [] });
    const b = buildHtml({ cspSource, nonce: createNonce(), lang: 'en', scriptUri: 'x', styleUris: [] });
    const nonceOf = (html: string) => /nonce-([A-Za-z0-9_-]+)/.exec(html)?.[1];
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });
});
