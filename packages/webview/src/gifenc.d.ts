/** Minimal typings for gifenc 1.0.3 (the package ships none). */
declare module 'gifenc' {
  export type Format = 'rgb565' | 'rgb444' | 'rgba4444';
  export interface QuantizeOptions {
    format?: Format;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: QuantizeOptions): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: Format): Uint8Array;
  export interface FrameOptions {
    palette?: number[][];
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
  }
  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder;
}
