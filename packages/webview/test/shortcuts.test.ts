import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WEBVIEW_STRINGS } from '@mermaid-animator/protocol';
import { SHORTCUT_ROWS } from '../src/App';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = readFileSync(path.join(here, '../src/main.tsx'), 'utf8');
const readme = readFileSync(path.join(here, '../../extension/README.md'), 'utf8');

/** Keys bound in the keyboard handler's `handled` map (single characters and named keys). */
const handled = new Set([...main.matchAll(/^\s*(?:'([^']+)'|([A-Za-z]+)):\s*\(\)\s*=>/gm)].map((m) => (m[1] ?? m[2]) as string));

/** Single-letter and symbol keys documented in the overlay, e.g. `G`, `[ / ]`, `B / .`. */
function documentedKeys(label: string): string[] {
  if (/[⌁]/.test(label)) return [];
  return label
    .replace(/Shift \+ /g, '')
    .split(/\s*\/\s*|\s+/)
    .map((k) => k.trim())
    .filter((k) => k.length === 1 && k !== '+')
    .map((k) => ({ '→': 'ArrowRight', '←': 'ArrowLeft', '−': '-' })[k] ?? k.toLowerCase());
}

describe('documented shortcuts', () => {
  it('every overlay row has a string and a handler for its keys', () => {
    for (const [keys, label] of SHORTCUT_ROWS) {
      expect(WEBVIEW_STRINGS, label).toHaveProperty(label);
      for (const key of documentedKeys(keys)) expect(handled.has(key) || handled.has(key.toUpperCase()), `${keys} → ${key}`).toBe(true);
    }
  });

  it('the README keyboard table lists the letter shortcuts the handler binds', () => {
    const letters = [...handled].filter((k) => /^[a-z]$/.test(k));
    for (const letter of letters) expect(readme, `README mentions ${letter.toUpperCase()}`).toMatch(new RegExp(`\`${letter.toUpperCase()}\``));
  });
});
