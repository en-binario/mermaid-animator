/**
 * Port of Mermaid's sequence-diagram lexer: the regular expressions come verbatim from
 * the pinned Mermaid package (lexerRules.generated.ts); the actions below mirror
 * Mermaid's `performAction` (state pushes/pops and token kinds). Matching is
 * first-match in rule order, case-insensitive, exactly like Jison without `flex`.
 */
import { RULE_SOURCES, STATE_RULES } from './lexerRules.generated';

export type TokenKind =
  | 'NEWLINE' | 'NUM' | 'CONFIG_START' | 'CONFIG_CONTENT' | 'CONFIG_END' | 'ACTOR' | 'INVALID'
  | 'box' | 'participant' | 'participant_actor' | 'create' | 'destroy' | 'AS'
  | 'loop' | 'rect' | 'opt' | 'alt' | 'else' | 'par' | 'par_over' | 'and' | 'critical' | 'option' | 'break'
  | 'restOfLine' | 'end' | 'left_of' | 'right_of' | 'links' | 'link' | 'properties' | 'details' | 'over' | 'note'
  | 'activate' | 'deactivate' | 'title' | 'legacy_title' | 'acc_title' | 'acc_title_value' | 'acc_descr'
  | 'acc_descr_value' | 'acc_descr_multiline_value' | 'SD' | 'autonumber' | 'off' | ','
  | 'ARROW' | 'TXT' | '+' | '-' | '()' | 'EOF';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  /** For ARROW tokens: Mermaid's token name, e.g. SOLID_ARROW_TOP_DOTTED. */
  arrow?: string;
}

type State = keyof typeof STATE_RULES;

interface Lexer {
  begin(state: State): void;
  pop(): void;
}

type Action = (lx: Lexer, match: string) => { kind: TokenKind; text?: string; arrow?: string } | null;

const tok = (kind: TokenKind, text?: string) => (): ReturnType<Action> => ({ kind, text });
const skip: Action = () => null;
const arrow = (name: string): Action => () => ({ kind: 'ARROW', arrow: name });

/** Actions indexed by Mermaid rule number (see lexerRules.generated.ts). */
const ACTIONS: Record<number, Action> = {
  0: tok('NEWLINE'),
  1: skip,
  2: skip,
  3: skip,
  4: skip,
  5: skip,
  6: tok('NUM'),
  7: (lx) => (lx.begin('CONFIG'), { kind: 'CONFIG_START' }),
  8: tok('CONFIG_CONTENT'),
  9: (lx) => (lx.pop(), lx.begin('ALIAS'), { kind: 'CONFIG_END' }),
  10: (lx) => (lx.pop(), lx.pop(), { kind: 'CONFIG_END' }),
  11: (_lx, m) => ({ kind: 'ACTOR', text: m.trim() }),
  12: (lx, m) => (lx.begin('ALIAS'), { kind: 'ACTOR', text: m.trim() }),
  13: (lx, m) => (lx.pop(), { kind: 'ACTOR', text: m.trim() }),
  14: (lx) => (lx.pop(), { kind: 'INVALID' }),
  15: (lx, m) => (lx.pop(), { kind: 'INVALID', text: m.trim() }),
  16: (lx) => (lx.begin('LINE'), { kind: 'box' }),
  17: (lx) => (lx.begin('ID'), { kind: 'participant' }),
  18: (lx) => (lx.begin('ID'), { kind: 'participant_actor' }),
  19: tok('create'),
  20: (lx) => (lx.begin('ID'), { kind: 'destroy' }),
  21: (lx) => (lx.pop(), lx.pop(), lx.begin('LINE'), { kind: 'AS' }),
  22: (lx) => (lx.pop(), lx.pop(), { kind: 'NEWLINE' }),
  23: (lx) => (lx.begin('LINE'), { kind: 'loop' }),
  24: (lx) => (lx.begin('LINE'), { kind: 'rect' }),
  25: (lx) => (lx.begin('LINE'), { kind: 'opt' }),
  26: (lx) => (lx.begin('LINE'), { kind: 'alt' }),
  27: (lx) => (lx.begin('LINE'), { kind: 'else' }),
  28: (lx) => (lx.begin('LINE'), { kind: 'par' }),
  29: (lx) => (lx.begin('LINE'), { kind: 'par_over' }),
  30: (lx) => (lx.begin('LINE'), { kind: 'and' }),
  31: (lx) => (lx.begin('LINE'), { kind: 'critical' }),
  32: (lx) => (lx.begin('LINE'), { kind: 'option' }),
  33: (lx) => (lx.begin('LINE'), { kind: 'break' }),
  34: (lx) => (lx.pop(), { kind: 'restOfLine' }),
  35: tok('end'),
  36: tok('left_of'),
  37: tok('right_of'),
  38: tok('links'),
  39: tok('link'),
  40: tok('properties'),
  41: tok('details'),
  42: tok('over'),
  43: tok('note'),
  44: (lx) => (lx.begin('ID'), { kind: 'activate' }),
  45: (lx) => (lx.begin('ID'), { kind: 'deactivate' }),
  46: tok('title'),
  47: tok('legacy_title'),
  48: (lx) => (lx.begin('acc_title'), { kind: 'acc_title' }),
  49: (lx) => (lx.pop(), { kind: 'acc_title_value' }),
  50: (lx) => (lx.begin('acc_descr'), { kind: 'acc_descr' }),
  51: (lx) => (lx.pop(), { kind: 'acc_descr_value' }),
  52: (lx) => (lx.begin('acc_descr_multiline'), null),
  53: (lx) => (lx.pop(), null),
  54: tok('acc_descr_multiline_value'),
  55: tok('SD'),
  56: tok('autonumber'),
  57: tok('off'),
  58: tok(','),
  59: tok('NEWLINE'),
  60: (_lx, m) => ({ kind: 'ACTOR', text: m.trim() }),
  61: arrow('SOLID_ARROW'),
  62: arrow('BIDIRECTIONAL_SOLID_ARROW'),
  63: arrow('DOTTED_ARROW'),
  64: arrow('BIDIRECTIONAL_DOTTED_ARROW'),
  65: arrow('SOLID_OPEN_ARROW'),
  66: arrow('DOTTED_OPEN_ARROW'),
  67: arrow('SOLID_CROSS'),
  68: arrow('DOTTED_CROSS'),
  69: arrow('SOLID_POINT'),
  70: arrow('DOTTED_POINT'),
  71: arrow('SOLID_ARROW_TOP_DOTTED'),
  72: arrow('SOLID_ARROW_BOTTOM_DOTTED'),
  73: arrow('STICK_ARROW_TOP_DOTTED'),
  74: arrow('STICK_ARROW_BOTTOM_DOTTED'),
  75: arrow('SOLID_ARROW_TOP_REVERSE_DOTTED'),
  76: arrow('SOLID_ARROW_BOTTOM_REVERSE_DOTTED'),
  77: arrow('STICK_ARROW_TOP_REVERSE_DOTTED'),
  78: arrow('STICK_ARROW_BOTTOM_REVERSE_DOTTED'),
  79: arrow('SOLID_ARROW_TOP'),
  80: arrow('SOLID_ARROW_BOTTOM'),
  81: arrow('STICK_ARROW_TOP'),
  82: arrow('STICK_ARROW_BOTTOM'),
  83: arrow('SOLID_ARROW_TOP_REVERSE'),
  84: arrow('SOLID_ARROW_BOTTOM_REVERSE'),
  85: arrow('STICK_ARROW_TOP_REVERSE'),
  86: arrow('STICK_ARROW_BOTTOM_REVERSE'),
  87: tok('TXT'),
  88: tok('TXT'),
  89: tok('+'),
  90: tok('-'),
  91: tok('()'),
  92: tok('NEWLINE'),
  93: tok('INVALID'),
};

const COMPILED = RULE_SOURCES.map((source) => new RegExp(source, 'iy'));

/** Tokenises preprocessed sequence-diagram text. Always terminates; ends with one EOF token. */
export function lex(text: string): Token[] {
  const tokens: Token[] = [];
  const stack: State[] = ['INITIAL'];
  const lexer: Lexer = {
    begin: (state) => void stack.push(state),
    pop: () => {
      if (stack.length > 1) stack.pop();
    },
  };
  let pos = 0;
  let done = false;
  let guard = 0;

  while (!done) {
    if (pos >= text.length) done = true;
    const state = stack[stack.length - 1] as State;
    const rules = STATE_RULES[state] ?? STATE_RULES.INITIAL ?? [];
    let matched = false;
    for (const index of rules) {
      const re = COMPILED[index] as RegExp;
      re.lastIndex = pos;
      const m = re.exec(text);
      if (!m) continue;
      const value = m[0];
      const result = (ACTIONS[index] as Action)(lexer, value);
      if (result) {
        tokens.push({ kind: result.kind, text: result.text ?? value, start: pos, end: pos + value.length, arrow: result.arrow });
      }
      pos += value.length;
      matched = true;
      break;
    }
    if (!matched) {
      // Jison would raise a lexical error; surface it as an INVALID token and move on.
      tokens.push({ kind: 'INVALID', text: text.charAt(pos), start: pos, end: pos + 1 });
      pos += 1;
    }
    if (++guard > text.length * 4 + 1000) break; // defensive: zero-length matches always change state
  }
  tokens.push({ kind: 'EOF', text: '', start: text.length, end: text.length });
  return tokens;
}
