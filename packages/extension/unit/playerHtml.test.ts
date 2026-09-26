import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assemblePlayerHtml, scriptSafeJson } from '../src/playerHtml';

describe('HTML player assembly', () => {
  const parts = { js: 'console.log("</script> inside");', css: 'body{color:red}', data: '{"title":"<b>x</b>"}', title: 'Checkout — <demo>', lang: 'en', theme: 'auto' as const };

  it('allows exactly the inline script and style by hash', async () => {
    const html = await assemblePlayerHtml(parts);
    const script = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(html)![1]!;
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
    const hash = (s: string) => createHash('sha256').update(s).digest('base64');
    expect(html).toContain(`script-src 'sha256-${hash(script)}'`);
    expect(html).toContain(`style-src 'sha256-${hash(style)}'`);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
  });

  it('keeps the bundle and data inside their elements', async () => {
    const html = await assemblePlayerHtml(parts);
    expect(html).toContain('<\\/script> inside');
    expect(html).toContain('\\u003cb\\u003ex\\u003c/b\\u003e');
    expect(html).toContain('<title>Checkout — &lt;demo&gt;</title>');
    expect(html.match(/<script>/g)).toHaveLength(1);
  });

  it('references nothing outside the file', async () => {
    const html = await assemblePlayerHtml(parts);
    expect(html).not.toMatch(/(src|href)\s*=\s*["']?https?:/i);
  });

  it('escapes JSON so it cannot break out of a script element', () => {
    expect(scriptSafeJson('{"a":"</script><!--"}')).toBe('{"a":"\\u003c/script\\u003e\\u003c!--"}');
  });
});
