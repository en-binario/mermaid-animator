import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WEBVIEW_STRINGS } from '@mermaid-animator/protocol';

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(path.join(ext, p), 'utf8')) as Record<string, unknown>;
const nlsEn = read('package.nls.json') as Record<string, string>;
const nlsEs = read('package.nls.es.json') as Record<string, string>;
const bundleEs = read('l10n/bundle.l10n.es.json') as Record<string, string>;
const manifest = read('package.json');

function manifestKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string' && /^%.+%$/.test(value)) out.add(value.slice(1, -1));
  else if (Array.isArray(value)) value.forEach((v) => manifestKeys(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => manifestKeys(v, out));
  return out;
}

function hostLiterals(): string[] {
  const dir = path.join(ext, 'src');
  const literals = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    for (const m of readFileSync(path.join(dir, file), 'utf8').matchAll(/l10n\.t\('((?:[^'\\]|\\.)*)'/g)) literals.add((m[1] as string).replace(/\\'/g, "'"));
  }
  return [...literals];
}

const placeholders = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();

describe('localisation (English and Spanish)', () => {
  it('manifest strings exist in both languages with the same keys', () => {
    expect(Object.keys(nlsEs).sort()).toEqual(Object.keys(nlsEn).sort());
    const used = manifestKeys(manifest);
    expect([...used].filter((k) => !(k in nlsEn))).toEqual([]);
    expect(Object.keys(nlsEn).filter((k) => !used.has(k))).toEqual([]);
  });

  it('every webview string has a Spanish translation', () => {
    expect(Object.values(WEBVIEW_STRINGS).filter((english) => !(english in bundleEs))).toEqual([]);
  });

  it('every host string has a Spanish translation', () => {
    const literals = hostLiterals();
    expect(literals.length).toBeGreaterThan(10);
    expect(literals.filter((english) => !(english in bundleEs))).toEqual([]);
  });

  it('translations keep their placeholders', () => {
    for (const [english, spanish] of Object.entries(bundleEs)) expect(placeholders(spanish), english).toEqual(placeholders(english));
  });

  it('uses the expected Spanish command title and play label', () => {
    expect(nlsEs['command.open']).toBe('Abrir vista previa animada');
    expect(bundleEs[WEBVIEW_STRINGS['transport.play']]).toBe('Reproducir');
  });
});
