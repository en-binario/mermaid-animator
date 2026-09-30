import { signal } from '@preact/signals';
import type { PaletteName } from '@mermaid-animator/renderer';

/**
 * The drawing's palette (spec visual-theme: diagram theme selection), set from the host settings.
 * It scopes `.ma-views` (`data-palette`) and names the palette exports use for *Current*; the
 * controls follow the UI theme on the document root (`data-ui`) instead.
 */
export const diagramPalette = signal<PaletteName>('ivory');
