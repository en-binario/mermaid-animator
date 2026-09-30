/**
 * Ink & Ivory tokens from a Mermaid theme's variables (spec visual-theme: Mermaid theme palettes).
 * Pure: `scripts/mermaid-themes.mjs` runs it over the pinned Mermaid's themes to generate
 * `mermaidPalettes.generated.ts`, and a test re-runs it to keep that table in sync.
 */
import type { ColorToken } from './theme';

const NAMED: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  lightgrey: '#D3D3D3',
  lightgray: '#D3D3D3',
  grey: '#808080',
  gray: '#808080',
  transparent: '#FFFFFF',
};

const channel = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase();

/** `#RRGGBB` for a Mermaid colour: a name, `#rgb`, `#rrggbb`, `rgb()`/`rgba()` or `hsl()`/`hsla()`. */
export function toHex(value: string): string {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(0, 7).toUpperCase();
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(v);
  if (rgb) return `#${channel(Number(rgb[1]))}${channel(Number(rgb[2]))}${channel(Number(rgb[3]))}`;
  const hsl = /^hsla?\(\s*(-?[\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(v);
  if (hsl) {
    const h = (((Number(hsl[1]) % 360) + 360) % 360) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t: number) => {
      const x = ((t % 1) + 1) % 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return `#${channel(hue(h + 1 / 3) * 255)}${channel(hue(h) * 255)}${channel(hue(h - 1 / 3) * 255)}`;
  }
  throw new Error(`Unsupported Mermaid colour: ${value}`);
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The Mermaid theme variables the mapping reads. */
export const MERMAID_THEME_KEYS = [
  'background', 'actorBkg', 'actorBorder', 'actorTextColor', 'signalColor', 'labelBoxBkgColor',
  'activationBkgColor', 'noteBkgColor', 'noteBorderColor', 'primaryBorderColor',
] as const;
export type MermaidThemeVariables = Record<(typeof MERMAID_THEME_KEYS)[number], string>;

/**
 * Maps a Mermaid theme's variables to Ink & Ivory tokens. Emphasis, critical and success colours
 * (which Mermaid has no counterpart for) come from `light` or `dark`, by the canvas luminance.
 */
export function mermaidPalette(vars: MermaidThemeVariables, light: Record<ColorToken, string>, dark: Record<ColorToken, string>): Record<ColorToken, string> {
  const canvas = toHex(vars.background);
  const surface = toHex(vars.actorBkg);
  const border = toHex(vars.actorBorder);
  const ink = toHex(vars.actorTextColor);
  const signal = toHex(vars.signalColor);
  // The current-step highlight reaches 3:1 against the canvas.
  const accent = [vars.actorBorder, vars.primaryBorderColor, vars.signalColor].map(toHex).find((c) => contrast(c, canvas) >= 3) ?? ink;
  // Note text (ink-1) reaches 4.5:1 against the note fill, or the note takes the participant fill.
  const note = toHex(vars.noteBkgColor);
  const base = luminance(canvas) >= 0.5 ? light : dark;
  return {
    canvas,
    surface,
    'surface-sunken': toHex(vars.labelBoxBkgColor),
    hairline: border,
    rule: border,
    'ink-1': ink,
    'ink-2': signal,
    'ink-3': signal,
    accent,
    'accent-muted': toHex(vars.activationBkgColor),
    brass: base.brass,
    sage: base.sage,
    'note-fill': contrast(ink, note) >= 4.5 ? note : surface,
    'note-rule': toHex(vars.noteBorderColor),
    crimson: base.crimson,
    viridian: base.viridian,
  };
}

/** Whether a palette's canvas is dark (relative luminance below 0.5). */
export function isDarkCanvas(canvas: string): boolean {
  return luminance(canvas) < 0.5;
}
