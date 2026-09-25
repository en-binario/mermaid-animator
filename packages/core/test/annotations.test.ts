import { describe, expect, it } from 'vitest';
import { animatorSettings, parseAnnotations, suggestDirective } from '../src';

const parse = (lines: string) => parseAnnotations(`sequenceDiagram\n${lines}`);

describe('annotation grammar', () => {
  it('parses key=value pairs', () => {
    const { annotations, diagnostics } = parse('%% @animator speed=1.5 future=ghosted');
    expect(diagnostics).toEqual([]);
    expect(annotations[0]).toMatchObject({
      name: 'animator',
      scope: 'diagram',
      line: 1,
      args: [
        { key: 'speed', value: { kind: 'number', value: 1.5 } },
        { key: 'future', value: { kind: 'word', value: 'ghosted' } },
      ],
    });
    expect(Object.keys(animatorSettings(annotations))).toEqual(['speed', 'future']);
  });

  it('parses quoted strings with escapes, durations, numbers with x and lists', () => {
    const { annotations, diagnostics } = parse(
      ['%% @caption "Say \\"hi\\" now"', '  %%   @pause 1.5s', '%% @duration 400ms', '%% @speed 0.5x', '%% @focus A, B ,C', 'A->>B: x'].join('\n'),
    );
    expect(diagnostics).toEqual([]);
    expect(annotations.map((a) => a.args[0]?.value)).toEqual([
      { kind: 'string', value: 'Say "hi" now' },
      { kind: 'duration', ms: 1500, raw: '1.5s' },
      { kind: 'duration', ms: 400, raw: '400ms' },
      { kind: 'number', value: 0.5, raw: '0.5x' },
      { kind: 'list', items: [{ kind: 'word', value: 'A' }, { kind: 'word', value: 'B' }, { kind: 'word', value: 'C' }] },
    ]);
  });

  it('ignores directives and plain comments', () => {
    const { annotations, diagnostics } = parseAnnotations('%%{init: {"theme": "dark"}}%%\nsequenceDiagram\n%% just a comment\n%% @ nothing');
    expect(annotations).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('assigns scopes', () => {
    const { annotations } = parse('%% @id checkout\n%% @chapter "One"\n%% @iterations 3\n%% @type database');
    expect(annotations.map((a) => [a.name, a.scope])).toEqual([
      ['id', 'diagram'],
      ['chapter', 'statement'],
      ['iterations', 'fragment'],
      ['type', 'declaration'],
    ]);
  });
});

describe('annotation diagnostics', () => {
  it('warns about unknown directives with a suggestion', () => {
    const { diagnostics } = parse('%% @pasue 1s');
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'annotation/unknown', message: "Unknown annotation '@pasue'. Did you mean '@pause'?" }),
    ]);
    expect(diagnostics[0]?.range.startLine).toBe(1);
    expect(suggestDirective('zzzzzz')).toBeUndefined();
  });

  it.each([
    ['%% @pause fast', 'invalid-arguments'],
    ['%% @speed 9x', 'invalid-arguments'],
    ['%% @iterations 0', 'invalid-arguments'],
    ['%% @skip now', 'invalid-arguments'],
    ['%% @caption "unterminated', 'invalid-arguments'],
    ['%% @animator speed', 'invalid-arguments'],
    ['%% @animator colour=red', 'invalid-arguments'],
    ['%% @animator camera=spin', 'invalid-arguments'],
    ['%% @type robot', 'invalid-arguments'],
  ])('%s is an error', (line, code) => {
    const { diagnostics, annotations } = parse(line);
    expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([['error', `annotation/${code}`]]);
    expect(annotations).toEqual([]);
  });

  it('accepts later-milestone settings without warnings', () => {
    expect(parse('%% @animator view=topology layout=force').diagnostics).toEqual([]);
  });

  it('rejects duplicate step ids', () => {
    const { diagnostics } = parse('%% @step-id login\nA->>B: x\n%% @step-id login\nB->>A: y');
    expect(diagnostics.map((d) => [d.code, d.range.startLine])).toEqual([['annotation/duplicate-step-id', 3]]);
  });
});
