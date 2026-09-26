import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ext = path.resolve(__dirname, '..');
const readme = readFileSync(path.join(ext, 'README.md'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ext, 'package.json'), 'utf8'));
const nls = JSON.parse(readFileSync(path.join(ext, 'package.nls.json'), 'utf8')) as Record<string, string>;
const titles = new Set<string>(manifest.contributes.commands.map((c: { title: string }) => nls[c.title.replace(/^%|%$/g, '')] ?? c.title));

describe('README', () => {
  it('documents only commands the manifest contributes', () => {
    // Command names appear in bold or italics, optionally after "Mermaid Animator: ".
    const mentioned = [...readme.matchAll(/\*{1,2}(?:Mermaid Animator: )?([A-Z][^*\n]{2,60}?)\*{1,2}/g)].map((m) => m[1]!.trim());
    const commands = mentioned.filter((m) => titles.has(m));
    for (const expected of ['Copy Link to Current Step', 'Save Topology Layout', 'Save Current Settings as Diagram Defaults', 'Export…', 'Filter by Diagram Type…', 'Reset Topology Layout', 'Insert Annotation…', 'Start Presentation', 'Animate All Diagrams in File', 'Animate Mermaid Diagram']) {
      expect(titles.has(expected), `${expected} is a contributed command`).toBe(true);
      expect(commands, `${expected} is documented`).toContain(expected);
    }
    for (const title of ['Export as GIF…', 'Export as Video…', 'Export as Animated SVG…', 'Export as HTML Player…']) {
      expect(titles.has(title), `${title} is a contributed command`).toBe(true);
      expect(readme).toContain(title.replace('Export as ', '').replace('…', ''));
    }
  });

  it('documents only settings the manifest contributes', () => {
    const properties = manifest.contributes.configuration.properties as Record<string, unknown>;
    const rows = [...readme.matchAll(/^\| `(mermaidAnimator\.[^`]+)`(?: \/ `\.([^`]+)`)?/gm)];
    expect(rows.length).toBeGreaterThan(30);
    for (const [, key, sibling] of rows) {
      expect(properties[key!], key).toBeDefined();
      if (sibling) expect(properties[`${key!.slice(0, key!.lastIndexOf('.'))}.${sibling}`], `${key} / .${sibling}`).toBeDefined();
    }
  });
});
