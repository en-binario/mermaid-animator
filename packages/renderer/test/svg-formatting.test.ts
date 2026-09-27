// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { approximateMeasure, buildTopology, compileDiagram, layoutSequence, topologyGeometry, topologyNodeSize } from '@mermaid-animator/core';
import { BOLD_WEIGHT, fontFor, SequenceSvgRenderer, SVG_NS, TopologySvgRenderer } from '../src';

function mount(body: string) {
  const d = compileDiagram(`sequenceDiagram\n${body}`).sequence!;
  const layout = layoutSequence(d.model, d.compiled, { measure: approximateMeasure });
  const svg = document.createElementNS(SVG_NS, 'svg');
  const g = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(g);
  new SequenceSvgRenderer(g).mount(layout);
  return { svg, d };
}

describe('formatted labels in the SVG renderer', () => {
  it('draws bold runs as weighted tspans without tag text', () => {
    const { svg } = mount('A->>B: <b>POST</b> /firma-dr/iniciar');
    const label = svg.querySelector('.ma-message-label')!;
    expect(label.textContent).toBe('POST /firma-dr/iniciar');
    expect(label.textContent).not.toContain('<b>');
    const bold = label.querySelector('tspan tspan')!;
    expect(bold.textContent).toBe('POST');
    expect(bold.getAttribute('font-weight')).toBe(String(BOLD_WEIGHT.label));
  });

  it('draws italic runs and styles participants, notes and fragment labels', () => {
    const { svg } = mount('participant G as <b>Gateway</b>\nNote over G: <i>cached</i>\nloop <b>retry</b>\nG->>G: x\nend');
    expect(svg.querySelector('.ma-participant-label tspan tspan')!.getAttribute('font-weight')).toBe(String(BOLD_WEIGHT.participant));
    expect(svg.querySelector('.ma-note-text tspan tspan')!.getAttribute('font-style')).toBe('italic');
    const fragment = svg.querySelector('.ma-fragment-label')!;
    expect(fragment.textContent).toBe('[retry]');
    expect(fragment.querySelector('tspan tspan')!.textContent).toBe('retry');
  });

  it('leaves plain labels as plain text', () => {
    const { svg } = mount('A->>B: plain');
    expect(svg.querySelector('.ma-message-label tspan tspan')).toBeNull();
  });

  it('styles topology node labels', () => {
    const d = compileDiagram('sequenceDiagram\nparticipant G as <b>Gateway</b>\nparticipant A\nG->>A: <i>x</i>').sequence!;
    const topology = buildTopology(d.model, d.compiled);
    const sizes = new Map(topology.nodes.map((n) => [n.id, topologyNodeSize(n, approximateMeasure)]));
    const geometry = topologyGeometry(topology, new Map([...sizes].map(([id, s], i) => [id, { x: i * 200, y: 0, w: s.w, h: s.h }])), 'straight');
    const g = document.createElementNS(SVG_NS, 'g');
    new TopologySvgRenderer(g).mount(topology, geometry, {
      nodes: new Map([...sizes].map(([id, s]) => [id, s.lines])),
      nodeRuns: new Map([...sizes].flatMap(([id, s]) => (s.runs ? [[id, s.runs] as const] : []))),
      messages: new Map(),
    });
    const bold = g.querySelector('[data-id="G"] .ma-participant-label tspan tspan')!;
    expect(bold.textContent).toBe('Gateway');
    expect(bold.getAttribute('font-weight')).toBe(String(BOLD_WEIGHT.participant));
  });

  it('builds canvas fonts with the bold weight and italic style', () => {
    expect(fontFor('label')).toMatch(/^450 13px/);
    expect(fontFor('label', { bold: true })).toMatch(/^650 13px/);
    expect(fontFor('note', { bold: true, italic: true })).toMatch(/^italic 650 13px/);
  });
});
