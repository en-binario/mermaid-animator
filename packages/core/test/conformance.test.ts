/**
 * Differential conformance (spec §21.2, sequence-parsing "Agreement with Mermaid"):
 * the native parser must report errors exactly when Mermaid 12's own parser rejects a file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSequence } from '../src';
// @ts-expect-error — plain ESM helper shared with scripts/mermaid-probe.mjs
import { mermaidParse } from '../../../scripts/mermaid-jsdom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/mermaid/sequence');
const corpus = ['valid', 'invalid'].flatMap((folder) =>
  readdirSync(path.join(root, folder))
    .filter((f) => f.endsWith('.mmd'))
    .map((f) => ({ folder, name: `${folder}/${f}`, source: readFileSync(path.join(root, folder, f), 'utf8') })),
);

describe('sequence conformance corpus', () => {
  it('has enough cases', () => {
    expect(corpus.filter((c) => c.folder === 'valid').length).toBeGreaterThanOrEqual(40);
    expect(corpus.filter((c) => c.folder === 'invalid').length).toBeGreaterThanOrEqual(10);
  });

  it.each(corpus)('$name agrees with Mermaid', async ({ folder, source }) => {
    const mermaid = (await mermaidParse(source)) as { ok: boolean; error?: string };
    expect(mermaid.ok, `fixture folder says ${folder}, Mermaid says ${mermaid.ok ? 'valid' : mermaid.error}`).toBe(folder === 'valid');
    const native = parseSequence(source);
    const errors = native.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.map((e) => `${e.range.startLine + 1}:${e.range.startCol + 1} ${e.message}`)).toEqual(mermaid.ok ? [] : expect.arrayContaining([expect.any(String)]));
  }, 30_000);
});
