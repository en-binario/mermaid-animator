/** Zero-based position range. Line/column are relative to whichever text the range was made for. */
export interface SourceRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  message: string;
  severity: Severity;
  range: SourceRange;
  /** Stable machine-readable identifier, e.g. `parse/unexpected-token`. */
  code: string;
}

/** Maps string offsets to zero-based line/column positions. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
  }

  get lineCount(): number {
    return this.starts.length;
  }

  position(offset: number): { line: number; col: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.starts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, col: offset - (this.starts[lo] as number) };
  }

  range(start: number, end: number): SourceRange {
    const a = this.position(start);
    const b = this.position(end);
    return { startLine: a.line, startCol: a.col, endLine: b.line, endCol: b.col };
  }

  lineStart(line: number): number {
    return this.starts[Math.max(0, Math.min(line, this.starts.length - 1))] as number;
  }
}

/** Shifts a diagram-relative range into host-document coordinates. */
export function offsetRange(range: SourceRange, origin: { line: number; character: number }): SourceRange {
  return {
    startLine: range.startLine + origin.line,
    startCol: range.startLine === 0 ? range.startCol + origin.character : range.startCol,
    endLine: range.endLine + origin.line,
    endCol: range.endLine === 0 ? range.endCol + origin.character : range.endCol,
  };
}

export function rangeContains(range: SourceRange, line: number, col: number): boolean {
  if (line < range.startLine || line > range.endLine) return false;
  if (line === range.startLine && col < range.startCol) return false;
  if (line === range.endLine && col > range.endCol) return false;
  return true;
}
