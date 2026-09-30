// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isPaint, monochromeColours } from '../src/fallbackMonochrome';

const WHITE = 'rgb(255, 255, 255)';
const BLACK = 'rgb(0, 0, 0)';

function mount(body: string): SVGSVGElement {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  const svg = document.querySelector('svg')!;
  monochromeColours(svg);
  return svg;
}
const paint = (el: Element | null, prop: string) => getComputedStyle(el!).getPropertyValue(prop);

describe('isPaint', () => {
  it.each([
    ['none', false],
    ['transparent', false],
    ['rgba(0, 0, 0, 0)', false],
    ['', false],
    ['rgb(255, 153, 255)', true],
    ['rgba(128, 128, 128, 0.5)', true],
    ['url(#gradient)', true],
  ])('%s → %s', (value, expected) => {
    expect(isPaint(value)).toBe(expected);
  });
});

describe('monochromeColours rules', () => {
  it('turns ordinary shape fills white and strokes black', () => {
    const svg = mount('<g class="node"><rect id="r" style="fill:#ffcc00;stroke:#9370db"/><text>A</text></g>');
    expect(paint(svg.querySelector('#r'), 'fill')).toBe(WHITE);
    expect(paint(svg.querySelector('#r'), 'stroke')).toBe(BLACK);
  });

  it('draws text black whatever its colour', () => {
    const svg = mount('<g class="node"><text id="t" style="fill:#ffffff"><tspan id="s" style="fill:#c00">A</tspan></text></g>');
    expect(paint(svg.querySelector('#t'), 'fill')).toBe(BLACK);
    expect(paint(svg.querySelector('#s'), 'fill')).toBe(BLACK);
  });

  it('draws arrowheads inside a marker black, whatever their colour', () => {
    const svg = mount('<defs><marker id="m"><path id="p" style="fill:#333333;stroke:#333333"/></marker></defs><g class="node"><text>A</text></g>');
    expect(paint(svg.querySelector('#p'), 'fill')).toBe(BLACK);
    expect(paint(svg.querySelector('#p'), 'stroke')).toBe(BLACK);
  });

  it('keeps unlabelled solid marks black (state start, fork bar)', () => {
    const svg = mount(
      '<g class="node default"><circle id="start" class="state-start" style="fill:#000000;stroke:#000000"/></g>' +
        '<g class="node statediagram-state"><g><path id="fork" style="fill:#000000;stroke:#000000"/></g></g>',
    );
    expect(paint(svg.querySelector('#start'), 'fill')).toBe(BLACK);
    expect(paint(svg.querySelector('#fork'), 'fill')).toBe(BLACK);
  });

  it('draws unlabelled marks in a theme colour black, and keeps their white fills (commit bullets)', () => {
    const svg = mount(
      '<g class="commit-bullets"><circle id="bullet" class="commit" style="fill:#ff0000;stroke:#ff0000"/>' +
        '<circle id="merge" class="commit commit-merge" style="fill:#ffffff;stroke:#ff0000"/></g>',
    );
    expect(paint(svg.querySelector('#bullet'), 'fill')).toBe(BLACK);
    expect(paint(svg.querySelector('#merge'), 'fill')).toBe(WHITE);
    expect(paint(svg.querySelector('#merge'), 'stroke')).toBe(BLACK);
  });

  it('leaves none fills, containers and stroke widths alone', () => {
    const svg = mount('<g id="g" class="edges"><path id="e" style="fill:none;stroke:#ff3;stroke-width:4px"/></g>');
    const edge = svg.querySelector('#e')!;
    expect(isPaint(paint(edge, 'fill'))).toBe(false);
    expect(paint(edge, 'stroke-width')).toBe('4px');
    expect((svg.querySelector('#g') as SVGGElement).style.getPropertyValue('fill')).toBe('');
  });
});

describe('author colour matrix', () => {
  // Fragments shaped like Mermaid 12's output for each source line; the harness checks real renderings.
  const node = (rect: string, text: string) => `<g class="node default"><rect id="shape" style="${rect}"/><g class="label"><text id="label" style="${text}"><tspan>A</tspan></text></g></g>`;
  it.each([
    ['style A fill:#f9f,stroke:#333,color:#c00', node('fill:#f9f;stroke:#333', 'fill:#c00'), WHITE, BLACK, BLACK],
    ['classDef hot fill:#ffdddd,stroke:#cc0000 on node B', node('fill:#ffdddd;stroke:#cc0000', 'fill:#333333'), WHITE, BLACK, BLACK],
    ['rect rgb(200, 150, 255) around two messages', '<rect id="shape" class="rect" style="fill:rgb(200, 150, 255)"/>', WHITE, 'none', undefined],
    ['box Aqua Backend around two participants', '<g><rect id="shape" class="rect" style="fill:aqua;stroke:rgb(0, 0, 0)"/><text id="label" class="text" style="fill:#333">Backend</text></g>', WHITE, BLACK, BLACK],
    ["%%{init}%% primaryColor '#ff0000'", node('fill:#ff0000;stroke:#9370db', 'fill:#131300'), WHITE, BLACK, BLACK],
    ['style A fill:#000,color:#fff', node('fill:#000;stroke:#000', 'fill:#fff'), WHITE, BLACK, BLACK],
  ])('%s → white fill, black stroke and text', (_source, body, fill, stroke, text) => {
    const svg = mount(body);
    const shape = svg.querySelector('#shape');
    expect(paint(shape, 'fill')).toBe(fill);
    if (stroke === 'none') expect(isPaint(paint(shape, 'stroke'))).toBe(false);
    else expect(paint(shape, 'stroke')).toBe(stroke);
    if (text) expect(paint(svg.querySelector('#label'), 'fill')).toBe(text);
  });

  it('linkStyle 0 stroke:#ff3,stroke-width:4px → black at 4 px', () => {
    const svg = mount('<g class="edgePaths"><path id="edge" class="flowchart-link" style="fill:none;stroke:#ff3;stroke-width:4px"/></g>');
    const edge = svg.querySelector('#edge');
    expect(paint(edge, 'stroke')).toBe(BLACK);
    expect(paint(edge, 'stroke-width')).toBe('4px');
  });
});
