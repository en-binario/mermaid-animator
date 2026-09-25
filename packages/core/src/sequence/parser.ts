/**
 * Recursive-descent parser for Mermaid 12 sequence diagrams. It follows the productions of
 * Mermaid's Jison grammar and the semantic checks of Mermaid's SequenceDB, so that it accepts
 * exactly what Mermaid accepts — but it never throws: every problem becomes a diagnostic with a
 * source range, and parsing resumes at the next statement.
 */
import { LineIndex, type Diagnostic, type SourceRange } from '../text';
import { decodeEntities, preprocess } from '../preprocess';
import { lex, type Token, type TokenKind } from './lexer';
import type {
  ArrowKind, Box, Fragment, FragmentBranch, FragmentKind, Message, Note, Participant, ParticipantKind, SequenceModel, SequenceNode,
} from './model';
import { PARTICIPANT_KINDS } from './model';
import { isCssColor } from './colors';
import { detectDiagramType } from '../detect';

export interface SequenceParseResult {
  model: SequenceModel;
  diagnostics: Diagnostic[];
}

const ARROWS: Record<string, { arrow: ArrowKind; dotted: boolean }> = {
  SOLID_OPEN_ARROW: { arrow: 'solid', dotted: false },
  DOTTED_OPEN_ARROW: { arrow: 'solid', dotted: true },
  SOLID_ARROW: { arrow: 'solidArrow', dotted: false },
  DOTTED_ARROW: { arrow: 'solidArrow', dotted: true },
  BIDIRECTIONAL_SOLID_ARROW: { arrow: 'solidBidirectional', dotted: false },
  BIDIRECTIONAL_DOTTED_ARROW: { arrow: 'solidBidirectional', dotted: true },
  SOLID_CROSS: { arrow: 'solidCross', dotted: false },
  DOTTED_CROSS: { arrow: 'solidCross', dotted: true },
  SOLID_POINT: { arrow: 'solidOpen', dotted: false },
  DOTTED_POINT: { arrow: 'solidOpen', dotted: true },
  SOLID_ARROW_TOP: { arrow: 'halfTop', dotted: false },
  SOLID_ARROW_BOTTOM: { arrow: 'halfBottom', dotted: false },
  STICK_ARROW_TOP: { arrow: 'stickTop', dotted: false },
  STICK_ARROW_BOTTOM: { arrow: 'stickBottom', dotted: false },
  SOLID_ARROW_TOP_DOTTED: { arrow: 'halfTop', dotted: true },
  SOLID_ARROW_BOTTOM_DOTTED: { arrow: 'halfBottom', dotted: true },
  STICK_ARROW_TOP_DOTTED: { arrow: 'stickTop', dotted: true },
  STICK_ARROW_BOTTOM_DOTTED: { arrow: 'stickBottom', dotted: true },
  SOLID_ARROW_TOP_REVERSE: { arrow: 'halfTopReverse', dotted: false },
  SOLID_ARROW_BOTTOM_REVERSE: { arrow: 'halfBottomReverse', dotted: false },
  STICK_ARROW_TOP_REVERSE: { arrow: 'stickTopReverse', dotted: false },
  STICK_ARROW_BOTTOM_REVERSE: { arrow: 'stickBottomReverse', dotted: false },
  SOLID_ARROW_TOP_REVERSE_DOTTED: { arrow: 'halfTopReverse', dotted: true },
  SOLID_ARROW_BOTTOM_REVERSE_DOTTED: { arrow: 'halfBottomReverse', dotted: true },
  STICK_ARROW_TOP_REVERSE_DOTTED: { arrow: 'stickTopReverse', dotted: true },
  STICK_ARROW_BOTTOM_REVERSE_DOTTED: { arrow: 'stickBottomReverse', dotted: true },
};

const BLOCKS: Partial<Record<TokenKind, { kind: FragmentKind; separator?: TokenKind; over?: boolean }>> = {
  loop: { kind: 'loop' },
  rect: { kind: 'rect' },
  opt: { kind: 'opt' },
  break: { kind: 'break' },
  alt: { kind: 'alt', separator: 'else' },
  par: { kind: 'par', separator: 'and' },
  par_over: { kind: 'par', separator: 'and', over: true },
  critical: { kind: 'critical', separator: 'option' },
};

const DESCRIBE: Partial<Record<TokenKind, string>> = {
  NEWLINE: 'end of line', EOF: 'end of input', TXT: "':' and a message text", ACTOR: 'a participant name', ARROW: 'an arrow',
  restOfLine: 'text', INVALID: 'an unexpected character',
};
const describe = (kind: TokenKind) => DESCRIBE[kind] ?? `'${kind.replace('_', ' ')}'`;

class ParseError extends Error {}

/** Removes Mermaid's `:wrap:` / `:nowrap:` prefix, decodes entities, normalises `<br>`. */
export function cleanLabel(raw: string): string {
  const text = raw.trim().replace(/^:?(?:no)?wrap:/i, '').trim();
  return decodeEntities(text).replace(/<br\s*\/?>/gi, '\n');
}

function parseMetadata(content: string): { type?: string; alias?: string } | undefined {
  const trimmed = content.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(`{${trimmed}}`) as { type?: string; alias?: string };
  } catch {
    // Minimal YAML flow-mapping support: key: value pairs separated by commas or newlines.
    const out: Record<string, string> = {};
    for (const part of trimmed.split(/,|\n/)) {
      if (!part.trim()) continue;
      const m = /^\s*(["']?)([\w-]+)\1\s*:\s*(["']?)(.*?)\3\s*$/.exec(part);
      if (!m) return undefined;
      out[m[2] as string] = m[4] as string;
    }
    return out;
  }
}

function boxData(raw: string): { color: string; label?: string } {
  const text = raw.trim();
  const m = /^((?:rgba?|hsla?)\s*\(.*\)|\w*)(.*)$/.exec(text);
  const color = m?.[1]?.trim() ?? '';
  const rest = m?.[2]?.trim() || undefined;
  if (color && isCssColor(color)) return { color, label: rest ? cleanLabel(rest) : undefined };
  return { color: 'transparent', label: text ? cleanLabel(text) : undefined };
}

class Parser {
  private i = 0;
  private readonly diagnostics: Diagnostic[] = [];
  private readonly participants = new Map<string, Participant>();
  private readonly boxes: Box[] = [];
  private currentBox: Box | undefined;
  private title?: string;
  private accTitle?: string;
  private accDescr?: string;
  private autonumber = false;
  private numbering: { next: number; step: number } | undefined;
  private readonly activations = new Map<string, number>();
  private lastCreated: string | undefined;
  private lastDestroyed: { participant: string; node: Extract<SequenceNode, { type: 'destroy' }> } | undefined;
  private lastMessage: Message | undefined;
  private counter = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly lines: LineIndex,
  ) {}

  run(): SequenceParseResult {
    while (this.peek().kind === 'NEWLINE') this.i++;
    const sd = this.peek();
    if (sd.kind !== 'SD') {
      this.error(sd, "The diagram must start with 'sequenceDiagram'.", 'parse/missing-keyword');
      return this.result([]);
    }
    this.i++;
    const body = this.document(new Set());
    if (this.lastDestroyed && this.lastDestroyed.node.attachTo === 'standalone' && this.lastMessage) {
      const m = this.lastMessage;
      if (m.from === this.lastDestroyed.participant || m.to === this.lastDestroyed.participant) this.lastDestroyed.node.attachTo = 'prev';
    }
    return this.result(body);
  }

  private result(body: SequenceNode[]): SequenceParseResult {
    return {
      model: {
        kind: 'sequence',
        title: this.title,
        accTitle: this.accTitle,
        accDescr: this.accDescr,
        participants: [...this.participants.values()],
        boxes: this.boxes,
        body,
        autonumber: this.autonumber,
      },
      diagnostics: this.diagnostics,
    };
  }

  // -- token helpers ----------------------------------------------------------------------------

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)] as Token;
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== 'EOF') this.i++;
    return t;
  }

  private expect(kind: TokenKind, context: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      this.error(t, `Expected ${describe(kind)} ${context}, found ${t.kind === 'INVALID' || t.kind === 'ACTOR' ? `'${t.text}'` : describe(t.kind)}.`, 'parse/unexpected-token');
      throw new ParseError();
    }
    return this.next();
  }

  private range(start: number, end: number): SourceRange {
    return this.lines.range(start, end);
  }

  private error(at: Token | { start: number; end: number }, message: string, code: string, severity: Diagnostic['severity'] = 'error'): void {
    const end = at.end > at.start ? at.end : Math.min(at.start + 1, this.lines.text.length);
    this.diagnostics.push({ message, severity, range: this.range(at.start, Math.max(end, at.start)), code });
  }

  private id(prefix: string): string {
    return `${prefix}${this.counter++}`;
  }

  /** Skips to the token after the next NEWLINE (statement-level recovery). */
  private recover(): void {
    while (this.peek().kind !== 'NEWLINE' && this.peek().kind !== 'EOF') this.i++;
    if (this.peek().kind === 'NEWLINE') this.i++;
  }

  // -- grammar ----------------------------------------------------------------------------------

  private document(terminators: Set<TokenKind>): SequenceNode[] {
    const nodes: SequenceNode[] = [];
    for (;;) {
      const t = this.peek();
      if (t.kind === 'EOF' || terminators.has(t.kind)) return nodes;
      if (t.kind === 'NEWLINE' || t.kind === 'INVALID') {
        this.i++;
        continue;
      }
      const start = this.i;
      try {
        const produced = this.statement();
        if (produced) nodes.push(...produced);
      } catch (error) {
        if (!(error instanceof ParseError)) throw error;
        if (this.i === start) this.i++;
        this.recover();
      }
    }
  }

  private statement(): SequenceNode[] | undefined {
    const t = this.peek();
    const block = BLOCKS[t.kind];
    if (block) return [this.fragment(block.kind, block.separator, block.over)];
    switch (t.kind) {
      case 'participant':
      case 'participant_actor':
      case 'destroy':
        return this.participantStatement(false);
      case 'create': {
        this.next();
        const kind = this.peek().kind;
        if (kind !== 'participant' && kind !== 'participant_actor' && kind !== 'destroy') {
          this.expect('participant', "after 'create'");
        }
        return this.participantStatement(true);
      }
      case 'box':
        this.box();
        return undefined;
      case 'ACTOR':
        return [this.signal()];
      case 'autonumber':
        this.autonumberStatement();
        return undefined;
      case 'activate':
      case 'deactivate':
        return this.activation();
      case 'note':
        return [this.note()];
      case 'links':
      case 'link':
      case 'properties':
      case 'details':
        this.actorMenu();
        return undefined;
      case 'title':
        this.next();
        this.title = cleanLabel(t.text.slice(6));
        return undefined;
      case 'legacy_title':
        this.next();
        this.title = cleanLabel(t.text.slice(7));
        return undefined;
      case 'acc_title':
        this.next();
        this.accTitle = this.expect('acc_title_value', "after 'accTitle:'").text.trim();
        return undefined;
      case 'acc_descr':
        this.next();
        this.accDescr = this.expect('acc_descr_value', "after 'accDescr:'").text.trim();
        return undefined;
      case 'acc_descr_multiline_value':
        this.next();
        this.accDescr = t.text.trim();
        return undefined;
      case 'end':
      case 'else':
      case 'and':
      case 'option':
        this.next();
        this.error(t, `'${t.kind}' without a matching block.`, 'parse/unmatched-keyword');
        throw new ParseError();
      default:
        this.error(t, `Unexpected ${t.kind === 'INVALID' ? `'${t.text}'` : describe(t.kind)} at the start of a statement.`, 'parse/unexpected-token');
        throw new ParseError();
    }
  }

  private ensureParticipant(id: string, at: Token, kind: ParticipantKind = 'participant'): Participant {
    let p = this.participants.get(id);
    if (!p) {
      p = { id, label: cleanLabel(id), kind, links: [], range: this.range(at.start, at.end) };
      if (this.currentBox) {
        p.boxId = this.currentBox.id;
        this.currentBox.members.push(id);
      }
      this.participants.set(id, p);
    }
    return p;
  }

  private participantStatement(created: boolean): SequenceNode[] {
    const keyword = this.next();
    if (keyword.kind === 'destroy') {
      const actor = this.expect('ACTOR', "after 'destroy'");
      this.expect('NEWLINE', 'after the participant name');
      const node: Extract<SequenceNode, { type: 'destroy' }> = { type: 'destroy', id: this.id('d'), participant: actor.text, attachTo: 'standalone', range: this.range(keyword.start, actor.end) };
      this.lastDestroyed = { participant: actor.text, node };
      const p = this.participants.get(actor.text);
      if (p) p.destroyedBy = node.id;
      return [node];
    }
    const actor = this.expect('ACTOR', `after '${keyword.text.trim()}'`);
    let meta: { type?: string; alias?: string } | undefined;
    let end = actor.end;
    if (this.peek().kind === 'CONFIG_START') {
      this.next();
      const content = this.expect('CONFIG_CONTENT', 'inside @{ }');
      const close = this.expect('CONFIG_END', 'to close @{');
      meta = parseMetadata(content.text);
      if (!meta) {
        this.error(content, 'Participant metadata must be a mapping such as { "type": "database" }.', 'parse/invalid-metadata');
        throw new ParseError();
      }
      end = close.end;
    }
    let description: string | undefined;
    if (this.peek().kind === 'AS') {
      this.next();
      const rest = this.expect('restOfLine', "after 'as'");
      description = cleanLabel(rest.text);
      end = rest.end;
    }
    this.expect('NEWLINE', 'after the participant declaration');

    const id = actor.text;
    if (created && this.participants.has(id)) {
      this.error(actor, `Participant '${id}' already exists; a created participant needs a new id (use 'as' aliases to reuse a name).`, 'semantic/duplicate-create');
      throw new ParseError();
    }
    const existing = this.participants.get(id);
    if (existing && this.currentBox && existing.boxId && existing.boxId !== this.currentBox.id) {
      this.error(actor, `Participant '${id}' can only be defined in one box.`, 'semantic/participant-in-two-boxes');
      throw new ParseError();
    }
    const declared: ParticipantKind = keyword.kind === 'participant_actor' ? 'actor' : 'participant';
    const metaKind = meta?.type && (PARTICIPANT_KINDS as readonly string[]).includes(meta.type) ? (meta.type as ParticipantKind) : undefined;
    const p = this.ensureParticipant(id, actor, metaKind ?? declared);
    if (!existing || description !== undefined || meta) {
      p.kind = metaKind ?? declared;
      p.label = description ?? (meta?.alias ? cleanLabel(meta.alias) : p.label);
      p.range = this.range(keyword.start, end);
    }
    if (this.currentBox && !p.boxId) {
      p.boxId = this.currentBox.id;
      this.currentBox.members.push(id);
    }
    if (created) {
      const node: SequenceNode = { type: 'create', id: this.id('c'), participant: id, range: this.range(keyword.start, end) };
      p.createdBy = node.id;
      this.lastCreated = id;
      return [node];
    }
    return [];
  }

  private box(): void {
    const keyword = this.next();
    const rest = this.expect('restOfLine', "after 'box'");
    const data = boxData(rest.text);
    const box: Box = { id: this.id('b'), label: data.label, color: data.color, members: [], range: this.range(keyword.start, rest.end) };
    const previous = this.currentBox;
    this.currentBox = box;
    this.boxes.push(box);
    try {
      for (;;) {
        const t = this.peek();
        if (t.kind === 'end') {
          box.range = this.range(keyword.start, t.end);
          this.next();
          return;
        }
        if (t.kind === 'NEWLINE') {
          this.next();
          continue;
        }
        if (t.kind === 'EOF') {
          this.error(keyword, "'box' is not closed with 'end'.", 'parse/unclosed-block');
          return;
        }
        if (t.kind === 'participant' || t.kind === 'participant_actor' || t.kind === 'destroy') {
          try {
            this.participantStatement(false);
          } catch (error) {
            if (!(error instanceof ParseError)) throw error;
            this.recover();
          }
          continue;
        }
        this.error(t, "Only participant declarations are allowed inside a 'box'.", 'parse/unexpected-token');
        this.recover();
      }
    } finally {
      this.currentBox = previous;
    }
  }

  private signal(): SequenceNode {
    const from = this.next();
    let centralSource = false;
    let centralTarget = false;
    let activatesTarget = false;
    let deactivatesSource = false;
    if (this.peek().kind === '()') {
      this.next();
      centralSource = true;
    }
    const arrowToken = this.expect('ARROW', 'after the sender');
    const modifier = this.peek().kind;
    if (modifier === '+' || modifier === '-' || modifier === '()') {
      if (centralSource && modifier !== '()') this.expect('ACTOR', 'after the arrow');
      this.next();
      if (modifier === '+') activatesTarget = true;
      else if (modifier === '-') deactivatesSource = true;
      else centralTarget = true;
    }
    const to = this.expect('ACTOR', 'after the arrow');
    const txt = this.expect('TXT', 'after the receiver');
    this.expect('NEWLINE', 'after the message');

    this.ensureParticipant(from.text, from);
    this.ensureParticipant(to.text, to);

    // SequenceDB checks, in Mermaid's order.
    if (this.lastCreated) {
      if (to.text !== this.lastCreated) {
        this.error(from, `The created participant '${this.lastCreated}' must receive the message that follows its creation.`, 'semantic/create-without-message');
        this.lastCreated = undefined;
        throw new ParseError();
      }
      this.lastCreated = undefined;
    } else if (this.lastDestroyed && this.lastDestroyed.node.attachTo === 'standalone') {
      const d = this.lastDestroyed;
      if (to.text !== d.participant && from.text !== d.participant) {
        this.error(from, `The destroyed participant '${d.participant}' must take part in the message that follows its destruction.`, 'semantic/destroy-without-message');
        this.lastDestroyed = undefined;
        throw new ParseError();
      }
      d.node.attachTo = 'next';
      this.lastDestroyed = undefined;
    }
    if (deactivatesSource) {
      const count = this.activations.get(from.text) ?? 0;
      if (count < 1) {
        this.error(from, `Cannot deactivate '${from.text}': it is not active.`, 'semantic/inactive-participant');
        throw new ParseError();
      }
      this.activations.set(from.text, count - 1);
    }
    if (activatesTarget) this.activations.set(to.text, (this.activations.get(to.text) ?? 0) + 1);

    const { arrow, dotted } = ARROWS[arrowToken.arrow ?? 'SOLID_ARROW'] ?? { arrow: 'solidArrow' as ArrowKind, dotted: false };
    const message: Message = {
      id: this.id('m'),
      from: from.text,
      to: to.text,
      label: cleanLabel(txt.text.slice(1)),
      arrow,
      dotted,
      activatesTarget: activatesTarget || undefined,
      deactivatesSource: deactivatesSource || undefined,
      central: centralSource && centralTarget ? 'both' : centralSource ? 'source' : centralTarget ? 'target' : undefined,
      range: this.range(from.start, txt.end),
    };
    if (this.numbering) {
      message.sequenceNumber = this.numbering.next;
      this.numbering.next += this.numbering.step;
    }
    this.lastMessage = message;
    return { type: 'message', message };
  }

  private autonumberStatement(): void {
    const keyword = this.next();
    const t = this.peek();
    if (t.kind === 'off') {
      this.next();
      this.expect('NEWLINE', "after 'autonumber off'");
      this.numbering = undefined;
      return;
    }
    let start = this.numbering?.next ?? 1;
    let step = 1;
    if (t.kind === 'NUM') {
      start = Number(this.next().text);
      if (this.peek().kind === 'NUM') step = Number(this.next().text);
    }
    this.expect('NEWLINE', "after 'autonumber'");
    this.numbering = { next: start, step };
    this.autonumber = true;
    void keyword;
  }

  private activation(): SequenceNode[] {
    const keyword = this.next();
    const actor = this.expect('ACTOR', `after '${keyword.kind}'`);
    this.expect('NEWLINE', 'after the participant name');
    const on = keyword.kind === 'activate';
    const count = this.activations.get(actor.text) ?? 0;
    if (!on && count < 1) {
      this.error(actor, `Cannot deactivate '${actor.text}': it is not active.`, 'semantic/inactive-participant');
      throw new ParseError();
    }
    this.activations.set(actor.text, on ? count + 1 : count - 1);
    return [{ type: 'activation', id: this.id('a'), participant: actor.text, on, range: this.range(keyword.start, actor.end) }];
  }

  private note(): SequenceNode {
    const keyword = this.next();
    const place = this.next();
    let placement: Note['placement'];
    let participants: Note['participants'];
    if (place.kind === 'left_of' || place.kind === 'right_of') {
      placement = place.kind === 'left_of' ? 'leftOf' : 'rightOf';
      const a = this.expect('ACTOR', 'in the note placement');
      this.ensureParticipant(a.text, a);
      participants = [a.text];
    } else if (place.kind === 'over') {
      placement = 'over';
      const a = this.expect('ACTOR', "after 'over'");
      this.ensureParticipant(a.text, a);
      participants = [a.text];
      if (this.peek().kind === ',') {
        this.next();
        const b = this.expect('ACTOR', "after ','");
        this.ensureParticipant(b.text, b);
        participants = [a.text, b.text];
      }
    } else {
      this.i--;
      this.expect('over', "after 'note' ('left of', 'right of' or 'over')");
      throw new ParseError();
    }
    const txt = this.expect('TXT', 'after the note placement');
    this.expect('NEWLINE', 'after the note');
    return { type: 'note', note: { id: this.id('n'), placement, participants, text: cleanLabel(txt.text.slice(1)), range: this.range(keyword.start, txt.end) } };
  }

  private actorMenu(): void {
    const keyword = this.next();
    const actor = this.expect('ACTOR', `after '${keyword.kind}'`);
    const txt = this.expect('TXT', 'after the participant name');
    this.expect('NEWLINE', 'at the end of the statement');
    const p = this.ensureParticipant(actor.text, actor);
    const text = decodeEntities(txt.text.slice(1).trim());
    if (keyword.kind === 'links') {
      try {
        const links = JSON.parse(text) as Record<string, string>;
        for (const [label, url] of Object.entries(links)) if (typeof url === 'string') p.links.push({ label, url });
      } catch {
        // Mermaid logs and ignores malformed link JSON.
      }
    } else if (keyword.kind === 'link') {
      const at = text.indexOf('@');
      if (at > 0) p.links.push({ label: text.slice(0, at).trim(), url: text.slice(at + 1).trim() });
    }
  }

  private fragment(kind: FragmentKind, separator: TokenKind | undefined, over: boolean | undefined): SequenceNode {
    const keyword = this.next();
    const label = this.expect('restOfLine', `after '${keyword.kind}'`);
    const fragment: Fragment = {
      id: this.id('f'),
      kind,
      over,
      label: kind === 'rect' ? label.text.trim() : cleanLabel(label.text),
      branches: [],
      range: this.range(keyword.start, label.end),
    };
    if (kind === 'rect') fragment.color = label.text.trim();
    const terminators = new Set<TokenKind>(['end']);
    if (separator) terminators.add(separator);
    let branchStart = keyword;
    let branchLabel = fragment.label;
    for (;;) {
      const children = this.document(terminators);
      const t = this.peek();
      const branch: FragmentBranch = { label: branchLabel, children, range: this.range(branchStart.start, t.start) };
      fragment.branches.push(branch);
      if (t.kind === 'EOF') {
        this.error(keyword, `'${keyword.kind}' is not closed with 'end'.`, 'parse/unclosed-block');
        fragment.range = this.range(keyword.start, t.start);
        return { type: 'fragment', fragment };
      }
      if (t.kind === 'end') {
        this.next();
        fragment.range = this.range(keyword.start, t.end);
        return { type: 'fragment', fragment };
      }
      // separator
      branchStart = this.next();
      const rest = this.expect('restOfLine', `after '${branchStart.kind}'`);
      branchLabel = cleanLabel(rest.text);
    }
  }
}

/** Parses a sequence diagram's source (the diagram text only, not a whole Markdown file). */
export function parseSequence(source: string): SequenceParseResult {
  const pre = preprocess(source);
  // Like Mermaid, normalise CRLF/CR to LF. Dropping a line-final \r keeps every line/column position.
  const text = pre.text.replace(/\r\n?/g, '\n');
  const lines = new LineIndex(text);
  const parser = new Parser(lex(text), lines);
  const result = parser.run();
  // Mermaid detects the diagram type case-sensitively before lexing (its lexer is case-insensitive).
  if (detectDiagramType(source) !== 'sequence' && !result.diagnostics.some((d) => d.code === 'parse/missing-keyword')) {
    const first = /\S/.exec(text);
    const at = first?.index ?? 0;
    result.diagnostics.unshift({
      message: "The diagram must start with 'sequenceDiagram' (spelled exactly so).",
      severity: 'error',
      range: lines.range(at, at + (/^\S+/.exec(text.slice(at))?.[0].length ?? 1)),
      code: 'parse/missing-keyword',
    });
  }
  return result;
}
