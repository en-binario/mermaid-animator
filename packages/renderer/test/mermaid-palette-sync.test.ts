// Keeps mermaidPalettes.generated.ts in sync with the installed Mermaid (spec visual-theme: Mermaid
// theme palettes). After a Mermaid upgrade, run `node scripts/mermaid-themes.mjs`.
import { describe, expect, it } from 'vitest';
import { MERMAID_THEME_KEYS, mermaidPalette, type MermaidThemeVariables } from '../src/mermaidPalette';
import { MERMAID_PALETTE_SOURCE, MERMAID_PALETTES } from '../src/mermaidPalettes.generated';
import { INK_IVORY_PALETTES } from '../src/palettes';
// @ts-expect-error: plain ESM helper without types
import { mermaidParse } from '../../../scripts/mermaid-jsdom.mjs';

describe('generated Mermaid palettes', () => {
  it('match the installed Mermaid themes', async () => {
    await mermaidParse('graph TD; A-->B');
    const { default: mermaid } = await import('mermaid');
    const { version } = (await import('mermaid/package.json', { with: { type: 'json' } })).default as { version: string };
    expect(MERMAID_PALETTE_SOURCE).toBe(`mermaid ${version}`);
    for (const name of Object.keys(MERMAID_PALETTES) as (keyof typeof MERMAID_PALETTES)[]) {
      mermaid.initialize({ startOnLoad: false, theme: name.slice('mermaid-'.length) as never });
      const all = mermaid.mermaidAPI.getConfig().themeVariables as Record<string, unknown>;
      const vars = Object.fromEntries(MERMAID_THEME_KEYS.map((k) => [k, String(all[k])])) as MermaidThemeVariables;
      expect(mermaidPalette(vars, INK_IVORY_PALETTES.ivory, INK_IVORY_PALETTES.graphite), name).toEqual(MERMAID_PALETTES[name]);
    }
  }, 30_000);
});
