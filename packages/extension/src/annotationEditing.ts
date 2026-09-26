/**
 * Editor support for `%% @…` annotations (spec annotation-editing): completions, hovers, a quick
 * fix for unknown directives, *Insert Annotation…* and directive highlighting. Everything works
 * only inside located Mermaid diagrams (Mermaid files and Mermaid fences in Markdown/MDX).
 */
import * as vscode from 'vscode';
import {
  ANIMATOR_KEYS, ANIMATOR_VALUES, annotationTargets, compileDiagram, DIRECTIVE_DOCS, parseAnnotations, PARTICIPANT_KINDS, suggestDirective,
  type DiagramInfo, type SequenceModel, type Step,
} from '@mermaid-animator/core';
import { diagramsIn } from './diagrams';
import { config } from './environment';

/** The diagram containing a document line, if any. */
function diagramAt(document: vscode.TextDocument, line: number): DiagramInfo | undefined {
  return diagramsIn(document).find((d) => line >= d.contentStartLine && line < d.contentEndLine);
}

const ANNOTATION = /^(\s*%%\s*)@([A-Za-z][\w-]*)/;

function sequenceOf(diagram: DiagramInfo): { model: SequenceModel; steps: Step[] } | undefined {
  const compiled = compileDiagram(diagram.source).sequence;
  return compiled ? { model: compiled.model, steps: compiled.compiled.steps } : undefined;
}

/** The statement line text of a diagram-relative range, trimmed. */
function statementText(diagram: DiagramInfo, line: number): string {
  return (diagram.source.split(/\r?\n/)[line] ?? '').trim();
}

// -- completions ------------------------------------------------------------------------------------------------

function item(label: string, kind: vscode.CompletionItemKind, range: vscode.Range, detail?: string, documentation?: string, insertText?: string | vscode.SnippetString): vscode.CompletionItem {
  const completion = new vscode.CompletionItem(label, kind);
  completion.range = range;
  if (detail) completion.detail = detail;
  if (documentation) completion.documentation = new vscode.MarkdownString(documentation);
  if (insertText) completion.insertText = insertText;
  return completion;
}

/** Branch labels of the next alt/critical/opt fragment after a diagram-relative line. */
function nextBranches(model: SequenceModel, line: number): string[] {
  const fragments: { line: number; kind: string; branches: string[] }[] = [];
  const visit = (nodes: SequenceModel['body']) => {
    for (const n of nodes) {
      if (n.type !== 'fragment') continue;
      fragments.push({ line: n.fragment.range.startLine, kind: n.fragment.kind, branches: n.fragment.branches.map((b) => b.label) });
      n.fragment.branches.forEach((b) => visit(b.children));
    }
  };
  visit(model.body);
  const next = fragments.sort((a, b) => a.line - b.line).find((f) => f.line > line && (f.kind === 'alt' || f.kind === 'critical' || f.kind === 'opt'));
  return next ? next.branches.filter(Boolean) : [];
}

export class AnnotationCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
    const diagram = diagramAt(document, position.line);
    if (!diagram) return undefined;
    const prefix = document.lineAt(position.line).text.slice(0, position.character);
    const word = /[\w.-]*$/.exec(prefix)?.[0] ?? '';
    const range = new vscode.Range(position.line, position.character - word.length, position.line, position.character);

    // Directive names after `%% @`.
    if (/^\s*%%\s*@[\w-]*$/.test(prefix)) {
      return Object.entries(DIRECTIVE_DOCS).map(([name, doc]) => item(name, vscode.CompletionItemKind.Keyword, range, `@${name} ${doc.args}`.trim(), `${doc.summary}\n\n*${doc.scope}*`));
    }
    const directive = /^\s*%%\s*@([\w-]+)\s+(.*)$/.exec(prefix);
    if (!directive) return undefined;
    const [, name, rest] = directive as unknown as [string, string, string];
    const sequence = () => sequenceOf(diagram);
    const relative = position.line - diagram.contentStartLine;

    if (name === 'animator') {
      const value = /([\w.]+)=([\w.-]*)$/.exec(rest);
      if (value) return (ANIMATOR_VALUES[value[1] as string] ?? []).map((v) => item(v, vscode.CompletionItemKind.EnumMember, range));
      if (/(^|\s)[\w.]*$/.test(rest)) {
        const keys = [...new Set([...Object.keys(ANIMATOR_VALUES), ...Object.keys(ANIMATOR_KEYS)])];
        return keys.map((k) => {
          const completion = item(k, vscode.CompletionItemKind.Property, range, ANIMATOR_VALUES[k]?.join(' | '), undefined, `${k}=`);
          completion.command = { title: '', command: 'editor.action.triggerSuggest' };
          return completion;
        });
      }
      return undefined;
    }
    if (name === 'focus') {
      if (!/(^|,)\s*[\w.-]*$/.test(rest)) return undefined;
      return sequence()?.model.participants.map((p) => item(p.id, vscode.CompletionItemKind.Variable, range, p.label === p.id ? undefined : p.label.replace(/\n/g, ' ')));
    }
    if (name === 'type') return PARTICIPANT_KINDS.map((k) => item(k, vscode.CompletionItemKind.EnumMember, range));
    if (name === 'branch') {
      const labels = sequence() ? nextBranches(sequence()!.model, relative) : [];
      return [
        ...labels.map((l, i) => item(`"${l}"`, vscode.CompletionItemKind.Value, range, vscode.l10n.t('Branch {0}', i + 1), undefined, `"${l}"`)),
        ...['all', 'ask', 'skip'].map((k) => item(k, vscode.CompletionItemKind.EnumMember, range)),
      ];
    }
    return undefined;
  }
}

// -- hovers -----------------------------------------------------------------------------------------------------

export class AnnotationHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const diagram = diagramAt(document, position.line);
    if (!diagram) return undefined;
    const text = document.lineAt(position.line).text;
    const m = ANNOTATION.exec(text);
    if (!m) return undefined;
    const start = (m[1] as string).length;
    const end = start + 1 + (m[2] as string).length;
    if (position.character < start || position.character > end) return undefined;
    const name = m[2] as string;
    const doc = DIRECTIVE_DOCS[name];
    const markdown = new vscode.MarkdownString();
    if (!doc) {
      const suggestion = suggestDirective(name);
      markdown.appendMarkdown(vscode.l10n.t('Unknown annotation `@{0}`.', name));
      if (suggestion) markdown.appendMarkdown(` ${vscode.l10n.t('Did you mean `@{0}`?', suggestion)}`);
      return new vscode.Hover(markdown, new vscode.Range(position.line, start, position.line, end));
    }
    markdown.appendCodeblock(`%% @${name} ${doc.args}`.trim(), 'mermaid');
    markdown.appendMarkdown(`${doc.summary}\n\n`);
    markdown.appendMarkdown(`*${vscode.l10n.t('Scope: {0}', doc.scope)}*`);
    if (doc.scope === 'statement' || doc.scope === 'fragment' || doc.scope === 'declaration') {
      const relative = position.line - diagram.contentStartLine;
      const sequence = sequenceOf(diagram);
      const annotation = parseAnnotations(diagram.source).annotations.find((a) => a.line === relative && a.name === name);
      const target = sequence && annotation ? annotationTargets(sequence.model, [annotation]).targets[0] : undefined;
      if (target) {
        const statement = statementText(diagram, target.range.startLine);
        const step =
          doc.scope === 'fragment'
            ? sequence!.steps.find((s) => s.fragmentPath.some((f) => f.fragmentId === target.id))
            : sequence!.steps.find((s) => s.sources.some((r) => r.startLine <= target.range.startLine && target.range.startLine <= r.endLine));
        markdown.appendMarkdown('\n\n');
        markdown.appendMarkdown(step ? vscode.l10n.t('Applies to `{0}` (step {1}).', statement, step.index + 1) : vscode.l10n.t('Applies to `{0}`.', statement));
      } else if (sequence) {
        markdown.appendMarkdown(`\n\n${vscode.l10n.t('No statement follows this annotation.')}`);
      }
    }
    return new vscode.Hover(markdown, new vscode.Range(position.line, start, position.line, end));
  }
}

// -- quick fix ----------------------------------------------------------------------------------------------------

export class AnnotationCodeActionProvider implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code !== 'annotation/unknown') continue;
      const line = diagnostic.range.start.line;
      const m = ANNOTATION.exec(document.lineAt(line).text);
      if (!m) continue;
      const suggestion = suggestDirective(m[2] as string);
      if (!suggestion) continue;
      const start = (m[1] as string).length + 1;
      const action = new vscode.CodeAction(vscode.l10n.t('Change to @{0}', suggestion), vscode.CodeActionKind.QuickFix);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, new vscode.Range(line, start, line, start + (m[2] as string).length), suggestion);
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      actions.push(action);
    }
    return actions;
  }
}

// -- insert annotation ------------------------------------------------------------------------------------------

const KIND_CHOICES = PARTICIPANT_KINDS.join(',');

/** Snippet arguments for each directive; `$1` placeholders select the text to replace. */
export const DIRECTIVE_SNIPPETS: Record<string, string> = {
  animator: '${1:camera}=${2:follow}',
  id: '${1:identifier}',
  title: '"${1:Title}"',
  chapter: '"${1:Title}"',
  caption: '"${1:…}"',
  pause: '${1:1s}',
  duration: '${1:400ms}',
  latency: '${1:120ms}',
  speed: '${1:0.5x}',
  emphasis: '',
  skip: '',
  'with-next': '${1:1}',
  'step-id': '${1:identifier}',
  focus: '${1:A}, ${2:B}',
  choose: '${1:label}',
  iterations: '${1:3}',
  branch: '${1|1,all,ask,skip|}',
  collapse: '',
  type: `\${1|${KIND_CHOICES}|}`,
  group: '"${1:label}": ${2:A}, ${3:B}',
  order: '${1|topological,source,bfs,path,token|}',
  path: '${1:A}, ${2:B}',
  start: '${1:A}',
  events: '${1:event}',
};

/** Inserts a chosen directive above the cursor's statement (spec annotation-editing). */
export async function insertAnnotation(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const line = editor.selection.active.line;
  if (!diagramAt(editor.document, line)) {
    void vscode.window.showInformationMessage(vscode.l10n.t('Place the cursor inside a Mermaid diagram to insert an annotation.'));
    return;
  }
  const pick = await vscode.window.showQuickPick(
    Object.entries(DIRECTIVE_DOCS).map(([name, doc]) => ({ label: `@${name}`, description: doc.args, detail: doc.summary, name })),
    { placeHolder: vscode.l10n.t('Choose an annotation to insert'), matchOnDescription: true, matchOnDetail: true },
  );
  if (!pick) return;
  await insertDirective(editor, pick.name, line);
}

/** Inserts `%% @name args` as a snippet on a new line above `line`, matching its indentation. */
export async function insertDirective(editor: vscode.TextEditor, name: string, line: number): Promise<boolean> {
  const indent = /^\s*/.exec(editor.document.lineAt(line).text)?.[0] ?? '';
  const args = DIRECTIVE_SNIPPETS[name] ?? '$1';
  const snippet = new vscode.SnippetString(`${indent.replace(/\$/g, '\\$')}%% @${name}${args ? ` ${args}` : ''}\n`);
  return editor.insertSnippet(snippet, new vscode.Position(line, 0));
}

// -- highlighting -----------------------------------------------------------------------------------------------

/** Decorates directive names on annotation lines in the link colour (`annotations.highlight`). */
export class AnnotationHighlighter implements vscode.Disposable {
  private readonly type = vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor('textLink.foreground') });
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Ranges decorated per editor document (test hook). */
  readonly applied = new Map<string, vscode.Range[]>();

  refresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.apply(), 80);
  }

  apply(): void {
    const on = config('annotations.highlight', true);
    for (const editor of vscode.window.visibleTextEditors) {
      const ranges: vscode.Range[] = [];
      if (on) {
        for (const d of diagramsIn(editor.document)) {
          for (let line = d.contentStartLine; line < d.contentEndLine && line < editor.document.lineCount; line++) {
            const m = ANNOTATION.exec(editor.document.lineAt(line).text);
            if (m) ranges.push(new vscode.Range(line, (m[1] as string).length, line, (m[1] as string).length + 1 + (m[2] as string).length));
          }
        }
      }
      editor.setDecorations(this.type, ranges);
      this.applied.set(editor.document.uri.toString(), ranges);
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.type.dispose();
  }
}
