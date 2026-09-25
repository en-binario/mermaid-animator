/**
 * Mermaid-equivalent preprocessing that preserves offsets: front matter, `%%{…}%%`
 * directives and whole-line `%%` comments are blanked (newlines kept), and entity
 * codes `#name;` are masked with same-length private-use characters so `#` and `;`
 * inside them do not start comments or end statements (as Mermaid's encodeEntities does).
 */

export const ENTITY_OPEN = '';
export const ENTITY_CLOSE = '';

export interface Preprocessed {
  /** Same length as the input; safe to lex. */
  text: string;
  /** Raw YAML of the front matter, if any. */
  frontMatter?: string;
  /** Contents of each `%%{ … }%%` directive, in order. */
  directives: { text: string; offset: number }[];
  /** Whole-line `%%` comments (candidates for annotations), with offsets of the `%%`. */
  comments: { text: string; offset: number }[];
}

const blank = (s: string) => s.replace(/[^\n]/g, ' ');

export function preprocess(input: string): Preprocessed {
  let text = input;
  let frontMatter: string | undefined;
  const directives: Preprocessed['directives'] = [];
  const comments: Preprocessed['comments'] = [];

  const fm = /^-{3}\s*[\n\r]([\s\S]*?)[\n\r]-{3}\s*[\n\r]+/.exec(text);
  if (fm) {
    frontMatter = fm[1];
    text = blank(fm[0]) + text.slice(fm[0].length);
  }

  text = text.replace(/%{2}{\s*([\s\S]*?)\s*}%{2}/g, (m, inner: string, offset: number) => {
    directives.push({ text: inner, offset });
    return blank(m);
  });

  text = text.replace(/^([ \t]*)(%%(?!\{)[^\n]*)/gm, (m, indent: string, comment: string, offset: number) => {
    comments.push({ text: comment, offset: offset + indent.length });
    return blank(m);
  });

  text = text.replace(/#(\w+);/g, (_m, name: string) => `${ENTITY_OPEN}${name}${ENTITY_CLOSE}`);

  return { text, frontMatter, directives, comments };
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ', semi: ';', num: '#', colon: ':',
  hearts: '♥', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', check: '✓', times: '×', divide: '÷', deg: '°',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', para: '¶', sect: '§', euro: '€',
  pound: '£', yen: '¥', cent: '¢', infin: '∞', ne: '≠', le: '≤', ge: '≥', plusmn: '±', micro: 'µ',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', omega: 'ω',
  equals: '=', lpar: '(', rpar: ')', excl: '!', quest: '?', commat: '@', plus: '+', comma: ',', sol: '/', bsol: '\\', vert: '|',
};

/** Decodes masked entity codes (`#9829;` → ♥, `#quot;` → ") back into characters. */
export function decodeEntities(text: string): string {
  return text.replace(new RegExp(`${ENTITY_OPEN}(\\w+)${ENTITY_CLOSE}`, 'g'), (m, name: string) => {
    if (/^\d+$/.test(name)) {
      const code = Number(name);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[name] ?? `&${name};`;
  });
}

/** Restores the original `#…;` spelling of masked entities (for identifiers). */
export function unmaskEntities(text: string): string {
  return text.replace(new RegExp(`${ENTITY_OPEN}(\\w+)${ENTITY_CLOSE}`, 'g'), '#$1;');
}
