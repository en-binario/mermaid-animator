import { describe, expect, it } from 'vitest';
import { parseSequence } from '../src';

/** NFR-PERF-03: parse a 1,000-line sequence diagram in < 30 ms (reference hardware).
 *  Slower CI machines can scale the budget with PERF_BUDGET_FACTOR. */
const factor = Number(process.env.PERF_BUDGET_FACTOR ?? 1);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

describe('parsing performance', () => {
  it('parses 1,000 lines in under 30 ms (median of 15 runs)', () => {
    const lines = ['sequenceDiagram', 'participant Gateway', 'participant Auth'];
    for (let i = 0; lines.length < 1000; i++) {
      if (i % 25 === 0) lines.push('loop retry');
      lines.push(`    Service${i % 12}->>+Service${(i + 3) % 12}: request number ${i} with some payload text`);
      lines.push(`    Service${(i + 3) % 12}-->>-Service${i % 12}: response ${i}`);
      if (i % 25 === 24) lines.push('end');
    }
    const source = lines.slice(0, 1000).join('\n');
    const first = parseSequence(source);
    expect(first.model.body.length).toBeGreaterThan(0);

    const times: number[] = [];
    for (let run = 0; run < 15; run++) {
      const start = performance.now();
      parseSequence(source);
      times.push(performance.now() - start);
    }
    expect(median(times)).toBeLessThan(30 * factor);
  });
});
