import type { FontRole, Measure, TextRun, TextStyle } from '@mermaid-animator/core';

/** Canvas font strings matching diagram.css for each text role. */
export const FONTS: Record<FontRole, string> = {
  label: '450 13px "Inter Variable", system-ui, sans-serif',
  participant: '560 13.5px "Inter Variable", system-ui, sans-serif',
  note: '400 13px "Inter Variable", system-ui, sans-serif',
  micro: '650 10.5px "Inter Variable", system-ui, sans-serif',
  badge: '560 10.5px "Inter Variable", system-ui, sans-serif',
};

/** Weight of bold runs per role (spec label-formatting): a clear step above each role's weight. */
export const BOLD_WEIGHT: Record<FontRole, number> = { label: 650, participant: 720, note: 650, micro: 750, badge: 720 };

/** Canvas font string for a role and inline style. */
export function fontFor(role: FontRole, style?: TextStyle): string {
  let font = FONTS[role];
  if (style?.bold) font = font.replace(/^\d+/, String(BOLD_WEIGHT[role]));
  if (style?.italic) font = `italic ${font}`;
  return font;
}

/** SVG presentation attributes for a styled run. */
export function runAttributes(run: TextRun, role: FontRole): Record<string, string | number | undefined> {
  return { 'font-weight': run.bold ? BOLD_WEIGHT[role] : undefined, 'font-style': run.italic ? 'italic' : undefined };
}

/**
 * Measures text with a canvas after fonts are ready (spec §13.8.1). Results are cached per
 * role, style and text. Letter-spaced small caps (`micro`) add 0.08em per character.
 */
export function createCanvasMeasure(): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text, role, style) => {
    const key = `${role}${style?.bold ? 'b' : ''}${style?.italic ? 'i' : ''}\u0000${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let width: number;
    if (ctx) {
      ctx.font = fontFor(role, style);
      width = ctx.measureText(text).width;
      if (role === 'micro') width += text.length * 10.5 * 0.08;
    } else width = text.length * 7;
    cache.set(key, width);
    return width;
  };
}
