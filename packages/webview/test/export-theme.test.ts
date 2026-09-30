import { describe, expect, it } from 'vitest';
import { approximateMeasure, compileDiagram, layoutSequence } from '@mermaid-animator/core';
import type { WebviewSettings } from '@mermaid-animator/protocol';
import { DEFAULT_DISPLAY, themeVars, type AnimatedSvgTheme, type PaletteName } from '@mermaid-animator/renderer';
import { buildJob, type AnimatedOptions } from '../src/animated/exporter';
import type { ExportMaterial } from '../src/animated/material';
import { fieldsFor, initialSheet } from '../src/animated/sheet';
import { animatedSvgNames, svgVariant } from '../src/animated/svgExport';
import { animatedSvgTheme, exportPalette, parseExportTheme, playerPalette, playerTheme, type ExportTheme } from '../src/animated/theme';
import { resolveSettings } from '../src/settings';
import { withSidecarSettings } from '../src/sidecar';

const STILL_AND_VIDEO = ['svg', 'png', 'copy', 'gif', 'webm', 'mp4'] as const;

describe('export palette matrix', () => {
  // R1–R4: stills, GIF and video draw with the chosen palette; Current keeps the panel's.
  const stills: [string, ExportTheme, PaletteName, PaletteName][] = [
    ['R1', 'current', 'ivory', 'ivory'],
    ['R1', 'current', 'graphite', 'graphite'],
    ['R1', 'current', 'ivory-hc', 'ivory-hc'],
    ['R1', 'current', 'graphite-hc', 'graphite-hc'],
    ['R2', 'ivory', 'graphite', 'ivory'],
    ['R3', 'graphite', 'ivory', 'graphite'],
    ['R4', 'monochrome', 'graphite', 'monochrome'],
  ];
  it.each(stills)('%s: theme %s from a %s panel draws %s', (_row, theme, active, expected) => {
    for (const _format of STILL_AND_VIDEO) expect(exportPalette(theme, active)).toBe(expected);
  });

  // R5–R8: animated SVG.
  it.each([
    ['R5', 'current', 'github'],
    ['R6', 'ivory', 'ivory'],
    ['R7', 'graphite', 'graphite'],
    ['R8', 'monochrome', 'monochrome'],
  ] as const)('%s: animated SVG with theme %s uses the %s palette', (_row, theme, expected) => {
    expect(animatedSvgTheme(theme)).toBe(expected);
  });

  // R9–R12: HTML player, for a light and a dark viewer.
  it.each([
    ['R9', 'current', 'ivory', 'graphite'],
    ['R10', 'ivory', 'ivory', 'ivory'],
    ['R11', 'graphite', 'graphite', 'graphite'],
    ['R12', 'monochrome', 'monochrome', 'monochrome'],
  ] as const)('%s: player with theme %s shows %s to a light viewer and %s to a dark one', (_row, theme, light, dark) => {
    expect(playerPalette(playerTheme(theme), false)).toBe(light);
    expect(playerPalette(playerTheme(theme), true)).toBe(dark);
  });
});

describe('export.theme values', () => {
  it('reads unknown values as current', () => {
    expect(parseExportTheme('sepia')).toBe('current');
    expect(parseExportTheme(undefined)).toBe('current');
    expect(parseExportTheme('monochrome')).toBe('monochrome');
  });
});

describe('animated job palette', () => {
  const d = compileDiagram('sequenceDiagram\nA->>B: one\nB-->>A: two\nA->>B: three').sequence!;
  const layout = layoutSequence(d.model, d.compiled, { measure: approximateMeasure });
  const material: ExportMaterial = {
    kind: 'sequence',
    timeline: d.timeline,
    content: { x: 0, y: 0, w: layout.width, h: layout.height },
    display: DEFAULT_DISPLAY,
    palette: 'graphite',
    text: { title: 'T', subtitle: '', captions: [], stepCount: 3 },
    rest: 0,
    chapters: [],
    source: () => ({ kind: 'sequence', layout, compiled: d.compiled, timeline: d.timeline }),
  };
  const options: AnimatedOptions = {
    format: 'gif', range: 'all', view: 'sequence', camera: 'fit', size: 'hd', scale: 1, fps: 15, speed: 1, theme: 'current', background: 'theme',
    burnIn: { captions: false, title: false, counter: false, transport: false, names: false }, loop: 0, hold: 1.5, quality: 'medium', dither: false,
  };

  it.each([
    ['current', 'graphite'],
    ['ivory', 'ivory'],
    ['graphite', 'graphite'],
    ['monochrome', 'monochrome'],
  ] as const)('theme %s renders with the %s palette', (theme, palette) => {
    expect(buildJob(material, { ...options, theme }, []).palette).toBe(palette);
  });

  it('keeps the frame size and count whatever the theme', () => {
    const current = buildJob(material, options, []);
    const mono = buildJob(material, { ...options, theme: 'monochrome' }, []);
    expect([mono.width, mono.height, mono.plan.total]).toEqual([current.width, current.height, current.plan.total]);
  });
});

describe('theme field enablement matrix', () => {
  it.each([
    ['R1', 'svg'],
    ['R1', 'png'],
    ['R1', 'copy'],
    ['R2', 'gif'],
    ['R2', 'webm'],
    ['R2', 'mp4'],
    ['R3', 'animated-svg'],
    ['R4', 'html'],
  ] as const)('%s: the theme field is enabled for %s', (_row, format) => {
    expect(fieldsFor(format).has('theme')).toBe(true);
  });
});

describe('default export theme matrix', () => {
  const sheetDefaults = { format: 'png', scale: 2, background: 'theme', captions: true };
  // What the sheet preselects and what the direct commands draw, from the effective `export.theme`.
  const resolved = (value: unknown) => resolveSettings({ themeMode: 'auto', 'export.theme': value } as WebviewSettings).exportDefaults.theme;

  it.each([
    ['R1', 'sepia', 'current'],
    ['R2', 'current', 'current'],
    ['R3', 'ivory', 'ivory'],
    ['R4', 'graphite', 'graphite'],
    ['R5', 'monochrome', 'monochrome'],
  ] as const)('%s: export.theme %s preselects %s in the sheet', (_row, value, expected) => {
    expect(initialSheet({ ...sheetDefaults, theme: resolved(value) }, true).theme).toBe(expected);
  });

  it.each([
    ['R1', 'sepia', 'ivory-hc'],
    ['R6', 'current', 'ivory-hc'],
    ['R7', 'ivory', 'ivory'],
    ['R8', 'graphite', 'graphite'],
    ['R9', 'monochrome', 'monochrome'],
  ] as const)('%s: with export.theme %s the direct commands draw %s from a high-contrast panel', (_row, value, expected) => {
    expect(exportPalette(resolved(value), 'ivory-hc')).toBe(expected);
  });

  it('defaults to current when the setting is absent', () => {
    expect(resolveSettings({ themeMode: 'auto' }).exportDefaults.theme).toBe('current');
  });

  it('lets the sheet choice override the setting', () => {
    const sheet = { ...initialSheet({ ...sheetDefaults, theme: resolved('monochrome') }, true), theme: 'ivory' as const };
    expect(exportPalette(sheet.theme, 'graphite')).toBe('ivory');
  });

  it('lets a sidecar override the VS Code setting', () => {
    const host = { themeMode: 'auto', 'export.theme': 'current' } as WebviewSettings;
    const merged = withSidecarSettings(host, { settings: { 'export.theme': 'monochrome' } });
    expect(exportPalette(resolveSettings(merged).exportDefaults.theme, 'ivory')).toBe('monochrome');
  });
});

describe('animated SVG theme matrix', () => {
  const casing = (theme: AnimatedSvgTheme) => themeVars(theme)['--cs'];
  it.each([
    ['R1', 'ivory', false, false, ['checkout.anim.svg'], ['ivory']],
    ['R1', 'graphite', true, true, ['checkout.anim.svg'], ['graphite']],
    ['R1', 'monochrome', true, false, ['checkout.anim.svg'], ['monochrome']],
    ['R2', 'current', true, true, ['checkout.light.anim.svg', 'checkout.dark.anim.svg'], ['ivory', 'graphite']],
    ['R3', 'current', false, false, ['checkout.anim.svg'], ['github']],
    ['R4', 'current', false, true, ['checkout.anim.svg'], ['github']],
  ] as const)('%s: theme %s, pair %s, adaptive %s', (row, theme, pair, adaptive, files, palettes) => {
    const variant = svgVariant({ theme, pair, adaptive });
    expect(animatedSvgNames('checkout', variant.pair)).toEqual(files);
    expect(variant.themes).toEqual(palettes);
    // Only the GitHub-safe palette carries the white casing; only R4 adds the dark block.
    expect(variant.themes.map(casing)).toEqual(palettes.map((p) => (p === 'github' ? '#ffffff' : 'none')));
    expect(variant.adaptive).toBe(row === 'R4');
  });
});
