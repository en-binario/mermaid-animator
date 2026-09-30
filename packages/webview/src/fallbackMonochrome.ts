/**
 * Monochrome for Mermaid-rendered drawings (spec visual-theme, Monochrome palette): black ink on
 * white, whatever colours the diagram source sets (`style`, `classDef`, `linkStyle`, `rect rgb()`,
 * `box` colours, `%%{init}%%` theme variables). Runs once on the mounted drawing, after Mermaid's
 * stylesheet is adopted, and writes inline `!important` declarations, which win over the
 * stylesheet's `!important` `classDef` rules. `stroke-width` and opacity are left alone.
 */

export const INK = '#000000';
export const PAPER = '#FFFFFF';

const TEXT = new Set(['text', 'tspan', 'textPath']);
/** Elements that paint. Containers (`g`, `svg`) are skipped: every element computes a default black fill. */
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'use', ...TEXT]);
/** Groups that own a label: a black fill in one of them is an author fill, not a solid mark. */
const LABELLED_GROUP = 'g.node, g.cluster, g.stateGroup, g.classGroup, g.er, g.section, g.mindmap-node, g.timeline-node';

/** Whether a computed paint draws anything (`none`, `transparent` and zero alpha do not). */
export function isPaint(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return false;
  const alpha = /^rgba\([^)]*,\s*([\d.]+)\s*\)$/.exec(v);
  return !alpha || Number(alpha[1]) > 0;
}

function isWhite(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === 'white' || v === '#fff' || v === '#ffffff') return true;
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  return !!m && m[1] === '255' && m[2] === '255' && m[3] === '255';
}

function hasLabel(group: Element | null): boolean {
  if (!group) return true;
  return [...group.querySelectorAll('text, foreignObject')].some((t) => (t.textContent ?? '').trim() !== '');
}

/**
 * A solid mark Mermaid draws in the line or branch colour (state start and end points, fork and join
 * bars, commit bullets): its group carries no label, so any non-white fill there is ink, whatever
 * colour a theme variable gave it. In a labelled group a fill is an author fill and turns white.
 */
function solidMark(el: Element): boolean {
  return !hasLabel(el.closest(LABELLED_GROUP) ?? el.closest('g'));
}

function paint(el: SVGElement | HTMLElement, prop: string, value: string): void {
  el.style.setProperty(prop, value, 'important');
}

/** Recolours `root` in place. Returns the number of elements changed. */
export function monochromeColours(root: Element): number {
  const view = root.ownerDocument.defaultView;
  if (!view) return 0;
  let changed = 0;
  for (const el of root.querySelectorAll<SVGElement | HTMLElement>('*')) {
    const html = !(el instanceof view.SVGElement);
    if (el.closest('filter, clipPath, mask') || (!html && !SHAPES.has(el.localName) && el.localName !== 'stop')) continue;
    const cs = view.getComputedStyle(el);
    if (html) {
      if (!el.closest('foreignObject')) continue;
      // HTML labels: black text on a white box.
      paint(el, 'color', INK);
      if (isPaint(cs.getPropertyValue('background-color'))) paint(el, 'background-color', PAPER);
      changed++;
      continue;
    }
    if (el.localName === 'stop') {
      paint(el, 'stop-color', PAPER);
      changed++;
      continue;
    }
    const fill = cs.getPropertyValue('fill');
    const stroke = cs.getPropertyValue('stroke');
    let touched = false;
    if (isPaint(fill)) {
      const ink = TEXT.has(el.localName) || !!el.closest('marker') || (!isWhite(fill) && solidMark(el));
      paint(el, 'fill', ink ? INK : PAPER);
      touched = true;
    }
    if (isPaint(stroke)) {
      paint(el, 'stroke', INK);
      touched = true;
    }
    if (touched) changed++;
  }
  return changed;
}
