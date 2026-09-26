import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');

describe('sidecar schema', () => {
  it('is generated from the current manifest', () => {
    expect(() => execFileSync(process.execPath, [join(root, 'scripts', 'sidecar-schema.mjs'), '--check'], { stdio: 'pipe' })).not.toThrow();
  });

  it('types settings like the manifest and is contributed for *.animator.json', () => {
    const schema = JSON.parse(readFileSync(join(root, 'packages', 'extension', 'schemas', 'animator.schema.json'), 'utf8'));
    const settings = schema.definitions.diagram.properties.settings.properties;
    expect(settings['playback.speed']).toMatchObject({ type: 'number', minimum: 0.25, maximum: 4 });
    expect(settings['view.default'].enum).toEqual(['sequence', 'topology', 'split']);
    const manifest = JSON.parse(readFileSync(join(root, 'packages', 'extension', 'package.json'), 'utf8'));
    expect(manifest.contributes.jsonValidation).toEqual([{ fileMatch: '*.animator.json', url: './schemas/animator.schema.json' }]);
  });
});
