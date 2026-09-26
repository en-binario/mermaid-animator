/**
 * GIF encoding helpers (M3 D2) around gifenc: a global palette quantised from sampled frames,
 * optional ordered dithering, loop count and a reserved transparent index.
 */
import { applyPalette, GIFEncoder, quantize } from 'gifenc';

export type Palette = number[][];

/** Concatenates every 3rd pixel of sampled frames into one buffer for quantisation. */
export function samplePixels(frames: Uint8ClampedArray[], stride = 3): Uint8ClampedArray {
  const pixels = frames.reduce((n, f) => n + Math.ceil(f.length / 4 / stride), 0);
  const out = new Uint8ClampedArray(pixels * 4);
  let o = 0;
  for (const f of frames) {
    for (let i = 0; i < f.length; i += 4 * stride) {
      out[o++] = f[i] as number;
      out[o++] = f[i + 1] as number;
      out[o++] = f[i + 2] as number;
      out[o++] = f[i + 3] as number;
    }
  }
  return out.subarray(0, o);
}

export function buildPalette(sample: Uint8ClampedArray, transparent: boolean): { palette: Palette; transparentIndex: number } {
  if (!transparent) {
    // 255 colours plus one reserved index that marks "unchanged since the previous frame".
    const palette = quantize(sample, 255, { format: 'rgb565' });
    while (palette.length < 255) palette.push([0, 0, 0]);
    palette.push([0, 0, 0]);
    return { palette, transparentIndex: -1 };
  }
  const palette = quantize(sample, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true, clearAlphaThreshold: 64 });
  const transparentIndex = palette.findIndex((p) => (p[3] ?? 255) === 0);
  return { palette, transparentIndex };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered (Bayer 4×4) dithering applied in place before palette mapping. */
export function dither(rgba: Uint8ClampedArray, width: number, amount = 10): void {
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const x = p % width;
    const y = (p / width) | 0;
    const d = ((BAYER[(y & 3) * 4 + (x & 3)] as number) / 15 - 0.5) * amount;
    rgba[i] = (rgba[i] as number) + d;
    rgba[i + 1] = (rgba[i + 1] as number) + d;
    rgba[i + 2] = (rgba[i + 2] as number) + d;
  }
}

/** gifenc's repeat field: 0 loops forever, -1 plays once, n repeats n more times. */
export function repeatField(loop: number): number {
  if (loop <= 0) return 0;
  if (loop === 1) return -1;
  return loop - 1;
}

export class GifWriter {
  private readonly encoder = GIFEncoder();
  private first = true;
  private previous: Uint8Array | undefined;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly palette: Palette,
    private readonly options: { fps: number; loop: number; transparentIndex: number; dither: boolean; transparent: boolean },
  ) {}

  write(rgba: Uint8ClampedArray): void {
    if (this.options.dither) dither(rgba, this.width);
    const index = applyPalette(rgba, this.options.transparent ? this.palette : this.palette.slice(0, 255), this.options.transparent ? 'rgba4444' : 'rgb565');
    const common = { palette: this.first ? this.palette : undefined, delay: 1000 / this.options.fps, repeat: this.first ? repeatField(this.options.loop) : undefined };
    if (this.options.transparent) {
      // Transparent backgrounds redraw whole frames (pixels can turn transparent again).
      this.encoder.writeFrame(index, this.width, this.height, { ...common, transparent: this.options.transparentIndex >= 0, transparentIndex: Math.max(0, this.options.transparentIndex), dispose: 2 });
    } else {
      // Opaque: unchanged pixels become the reserved index 255 over the kept previous frame.
      let frame = index;
      if (this.previous) {
        frame = new Uint8Array(index.length);
        for (let i = 0; i < index.length; i++) frame[i] = index[i] === this.previous[i] ? 255 : (index[i] as number);
      }
      this.encoder.writeFrame(frame, this.width, this.height, { ...common, transparent: !!this.previous, transparentIndex: 255, dispose: 1 });
      this.previous = index;
    }
    this.first = false;
  }

  finish(): Uint8Array {
    this.encoder.finish();
    return this.encoder.bytes();
  }
}
