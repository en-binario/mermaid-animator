import { describe, expect, it } from 'vitest';
import { approximateMeasure, buildTopology, compileDiagram, layoutSequence, topologyGeometry, topologyNodeSize, type Rect } from '@mermaid-animator/core';
import { compileSequenceSvg, compileTopologySvg, contrastRatio, DEFAULT_DISPLAY, GITHUB_SAFE, prepareScene, prepareTopologyScene, themeVars, type AnimatedSvgOptions } from '../src';

const source = 'sequenceDiagram\nparticipant U\nparticipant G\nparticipant A\nU->>+G: login\nG->>A: verify\nA-->>G: ok\nG-->>-U: token\nNote over G: done';

function compile(overrides: Partial<AnimatedSvgOptions> = {}) {
  const d = compileDiagram(source).sequence!;
  const layout = layoutSequence(d.model, d.compiled, { measure: approximateMeasure });
  const options: AnimatedSvgOptions = {
    start: 0, end: d.timeline.duration, speed: 1, hold: 1, loop: 0, theme: 'github', adaptive: false, display: DEFAULT_DISPLAY,
    fontCss: "@font-face{font-family:'Inter Variable';src:url(data:font/woff2;base64,AAAA) format('woff2')}", measure: approximateMeasure, ...overrides,
  };
  return { svg: compileSequenceSvg(layout, prepareScene(layout, d.compiled, d.timeline), options, 'Sign-in'), d, layout };
}

describe('animated SVG (sequence)', () => {
  const { svg } = compile();

  it('is a script-free, self-contained SVG', () => {
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    expect(svg).not.toMatch(/(href|src)\s*=\s*["']?https?:/i);
    expect(svg).not.toMatch(/url\(\s*["']?https?:/i);
    expect(svg).not.toMatch(/@import/i);
    // Only internal references (masks) and embedded data remain.
    for (const m of svg.matchAll(/url\(([^)]*)\)/g)) expect(m[1]!.startsWith('#') || m[1]!.startsWith('data:')).toBe(true);
  });

  it('animates with CSS keyframes and loops as asked', () => {
    expect(svg).toMatch(/@keyframes k/);
    expect(svg).toMatch(/animation:k\w+ \d+ms linear infinite both/);
    expect(compile({ loop: 2 }).svg).toMatch(/linear 2 both/);
  });

  it('draws messages through masks with normalised path length', () => {
    expect(svg).toMatch(/<mask id="m\w+" maskUnits="userSpaceOnUse"><path class="mk \w+" pathLength="1"/);
    // Drawing starts (nearly) hidden: the first 30 Hz sample inside a step is just after its start.
    const offsets = [...svg.matchAll(/stroke-dashoffset:([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...offsets)).toBeGreaterThan(0.9);
  });

  it('shows the final frame under reduced motion', () => {
    expect(svg).toMatch(/@media \(prefers-reduced-motion: reduce\)\{\*\{animation:none!important\}\}/);
    // Base styles hold the last sample: every message fully drawn at the end.
    const bases = [...svg.matchAll(/\.(a\w+)\{stroke-dashoffset:([\d.]+)[;}]/g)].map((m) => Number(m[2]));
    expect(bases.length).toBeGreaterThan(0);
    expect(bases.every((v) => v === 0)).toBe(true);
  });

  it('pins text advances with textLength', () => {
    expect(svg).toMatch(/textLength="[\d.]+" lengthAdjust="spacing"/);
  });

  it('adds a dark palette only when adaptive', () => {
    expect(svg).not.toMatch(/prefers-color-scheme/);
    expect(compile({ adaptive: true }).svg).toMatch(/@media \(prefers-color-scheme: dark\)/);
  });

  it('uses a transparent background', () => {
    expect(svg).not.toMatch(/<rect[^>]*width="100%"/);
  });
});

describe('GitHub-safe palette', () => {
  const light = '#ffffff';
  const dark = '#0d1117';
  const inks = [GITHUB_SAFE.ink, GITHUB_SAFE.ink2, GITHUB_SAFE.ink3, GITHUB_SAFE.accent, GITHUB_SAFE.brass, GITHUB_SAFE.crimson];

  it('keeps every ink at 4.5:1 on the light page and on its casing', () => {
    for (const ink of inks) {
      expect(contrastRatio(ink, light), ink).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, GITHUB_SAFE.casing), ink).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the casing at 4.5:1 on the dark page', () => {
    expect(contrastRatio(GITHUB_SAFE.casing, dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('documents why a casing is needed: no flat colour reaches 4.5:1 on both pages', () => {
    let best = 0;
    for (let v = 0; v <= 255; v++) {
      const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      best = Math.max(best, Math.min(contrastRatio(hex, light), contrastRatio(hex, dark)));
    }
    expect(best).toBeLessThan(4.5);
  });

  it('turns the casing off for the Ivory and Graphite palettes', () => {
    expect(themeVars('github')['--cs']).toBe('#ffffff');
    expect(themeVars('ivory')['--cs']).toBe('none');
    expect(themeVars('graphite')['--cs']).toBe('none');
  });

  it('draws the Monochrome palette in black on white, without casing', () => {
    const v = themeVars('monochrome');
    expect(v['--cs']).toBe('none');
    expect(v['--halo']).toBe('#FFFFFF');
    expect([v['--i1'], v['--i2'], v['--i3'], v['--ac'], v['--rl'], v['--hl']]).toEqual(Array(6).fill('#000000'));
    expect([v['--sf'], v['--nf']]).toEqual(['#FFFFFF', '#FFFFFF']);
    expect([v['--sk'], v['--am']]).toEqual(['#EDEDED', '#EDEDED']);
    const { svg } = compile({ theme: 'monochrome' });
    expect(svg).not.toMatch(/prefers-color-scheme/);
    expect(svg).toMatch(/--i1:#000000/i);
  });
});

describe('animated SVG (topology)', () => {
  it('compiles the topology view with the same guarantees', () => {
    const d = compileDiagram(`${source}
G->>A: audit`).sequence!;
    const topology = buildTopology(d.model, d.compiled);
    const nodes = new Map<string, Rect>(topology.nodes.map((n, i) => [n.id, { x: i * 240, y: 0, ...(() => { const s = topologyNodeSize(n, approximateMeasure); return { w: s.w, h: s.h }; })() }]));
    const geometry = topologyGeometry(topology, nodes, 'curved');
    const labels = { nodes: new Map(topology.nodes.map((n) => [n.id, [n.label]])), messages: new Map<string, string>() };
    const svg = compileTopologySvg(topology, geometry, labels, prepareTopologyScene(topology, d.compiled, d.timeline), {
      start: 0, end: d.timeline.duration, speed: 1, hold: 0, loop: 1, theme: 'ivory', adaptive: false, display: DEFAULT_DISPLAY, fontCss: '', measure: approximateMeasure,
    }, 'Map');
    expect(svg).toMatch(/@keyframes/);
    expect(svg).toMatch(/linear 1 both/);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).toMatch(/×2/);
  });
});

describe('animated SVG with the initial overview', () => {
  function overviewSvg(overview: boolean) {
    const d = compileDiagram(source, { overview, dwellMs: 900 }).sequence!;
    const layout = layoutSequence(d.model, d.compiled, { measure: approximateMeasure });
    const options: AnimatedSvgOptions = {
      start: 0, end: d.timeline.duration, speed: 1, hold: 1, loop: 0, theme: 'github', adaptive: false, display: { ...DEFAULT_DISPLAY, overview }, fontCss: '', measure: approximateMeasure,
    };
    return compileSequenceSvg(layout, prepareScene(layout, d.compiled, d.timeline), options, 'Sign-in');
  }

  it('starts with every message drawn, then clears before the first step draws', () => {
    const on = overviewSvg(true);
    const off = overviewSvg(false);
    const firstDash = (svg: string) => [...svg.matchAll(/@keyframes \w+\{0%\{stroke-dashoffset:([\d.]+)\}/g)].map((m) => Number(m[1]));
    expect(firstDash(on).length).toBeGreaterThan(0);
    expect(firstDash(on).every((v) => v === 0)).toBe(true);
    // Overview content is fully visible at 0% and fades during the clear; without it nothing does.
    const clearing = /@keyframes \w+\{0%\{opacity:1\}[\d.]+%\{opacity:1\}[\d.]+%\{opacity:0\.\d+\}/;
    expect(on).toMatch(clearing);
    expect(off).not.toMatch(clearing);
    expect(firstDash(off).length).toBe(firstDash(on).length);
  });
});

describe('animated SVG with formatted labels', () => {
  it('pins each styled run and never writes tag text', () => {
    const d = compileDiagram('sequenceDiagram\nA->>B: <b>POST</b> /firma-dr/iniciar').sequence!;
    const layout = layoutSequence(d.model, d.compiled, { measure: approximateMeasure });
    const options: AnimatedSvgOptions = { start: 0, end: d.timeline.duration, speed: 1, hold: 1, loop: 0, theme: 'github', adaptive: false, display: DEFAULT_DISPLAY, fontCss: '', measure: approximateMeasure };
    const svg = compileSequenceSvg(layout, prepareScene(layout, d.compiled, d.timeline), options, 'T');
    expect(svg).toMatch(/<tspan font-weight="650" textLength="[\d.]+" lengthAdjust="spacing">POST<\/tspan>/);
    expect(svg).not.toContain('&lt;b&gt;');
  });
});
