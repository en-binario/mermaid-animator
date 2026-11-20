// Generates packages/extension/schemas/animator.schema.json (spec sidecar-files) from the manifest:
// the `settings` of a sidecar entry accept the per-diagram settings the webview reads
// (WEBVIEW_SETTING_KEYS in extension/src/environment.ts), with the manifest's types, enums and ranges.
// Run: node scripts/sidecar-schema.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'packages', 'extension');
const manifest = JSON.parse(readFileSync(join(ext, 'package.json'), 'utf8'));
const nls = JSON.parse(readFileSync(join(ext, 'package.nls.json'), 'utf8'));
const environment = readFileSync(join(ext, 'src', 'environment.ts'), 'utf8');
const list = /WEBVIEW_SETTING_KEYS = \[([\s\S]*?)\] as const/.exec(environment);
if (!list) throw new Error('WEBVIEW_SETTING_KEYS not found');
const keys = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const text = (value) => (typeof value === 'string' ? value.replace(/^%(.+)%$/, (_, k) => nls[k] ?? value) : undefined);
const properties = {};
for (const key of keys) {
  const setting = manifest.contributes.configuration.properties[`mermaidAnimator.${key}`];
  if (!setting) throw new Error(`mermaidAnimator.${key} is not contributed`);
  const schema = {};
  for (const field of ['type', 'enum', 'minimum', 'maximum', 'pattern', 'items', 'default']) if (setting[field] !== undefined) schema[field] = setting[field];
  const description = text(setting.markdownDescription ?? setting.description);
  if (description) schema.markdownDescription = description;
  if (setting.enumDescriptions) schema.enumDescriptions = setting.enumDescriptions.map(text);
  properties[key] = schema;
}

const stepKey = { type: 'string', minLength: 1, description: 'A step: `#<step number>`, an `@step-id` slug, a content step id or a structural id.' };
const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://mermaid-animator.enbinario.com/schemas/animator.schema.json',
  title: 'Mermaid Animator sidecar',
  description: 'Animation settings, narration and layout for the Mermaid diagrams of the file this sidecar sits beside (`<file>.animator.json`).',
  type: 'object',
  additionalProperties: false,
  properties: {
    $schema: { type: 'string' },
    version: { const: 1, description: 'Sidecar format version.' },
    diagrams: {
      type: 'object',
      description: 'Entries keyed by the diagram\'s `@id`, or by `#<index>` (1-based position in the file).',
      additionalProperties: { $ref: '#/definitions/diagram' },
    },
  },
  definitions: {
    diagram: {
      type: 'object',
      additionalProperties: false,
      properties: {
        settings: {
          type: 'object',
          description: 'Settings for this diagram, above user and workspace settings and below front matter and annotations.',
          properties,
          // Keys for diagram types animated natively in later releases (e.g. `flowchart.order`) are accepted.
          additionalProperties: true,
        },
        captions: {
          type: 'object',
          description: 'Captions by step.',
          propertyNames: stepKey,
          additionalProperties: { type: 'string' },
        },
        chapters: {
          type: 'array',
          description: 'Chapters, each starting at a step.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'firstStep'],
            properties: { title: { type: 'string', minLength: 1 }, firstStep: stepKey },
          },
        },
        topology: {
          type: 'object',
          additionalProperties: false,
          properties: {
            layout: { enum: ['layered', 'force', 'manual'], description: 'Topology layout; `manual` uses the positions below.' },
            positions: {
              type: 'object',
              description: 'Node centres by participant id, as `[x, y]`.',
              additionalProperties: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
            },
          },
        },
        flowchart: { type: 'object', description: 'Flowchart options (applied when flowcharts are animated natively).' },
      },
    },
  },
};

const out = join(ext, 'schemas', 'animator.schema.json');
const json = `${JSON.stringify(schema, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8');
  if (current !== json) {
    console.error('animator.schema.json is out of date: run node scripts/sidecar-schema.mjs');
    process.exit(1);
  }
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log(`Wrote ${out} (${keys.length} settings)`);
}
