import { detectDiagramType, frontMatterTitle, type DiagramType } from './detect';

/** A Mermaid diagram found in a host document (spec §8.1, diagram-discovery). */
export interface DiagramInfo {
  /** 0-based position among the document's diagrams. */
  index: number;
  type: DiagramType;
  /** The diagram text only. */
  source: string;
  /** Host-document line of the opening fence (equals `contentStartLine` for whole-file diagrams). */
  fenceLine: number;
  /** First host-document line of the diagram text. */
  contentStartLine: number;
  /** Host-document line after the last content line (exclusive). */
  contentEndLine: number;
  /** `@id` annotation, if any. */
  id?: string;
  /** `@title` annotation, front-matter title or `title` statement. */
  title?: string;
  /** First meaningful line, for pickers. */
  summary: string;
}

const MARKDOWN_LANGUAGES = new Set(['markdown', 'mdx', 'md']);

function annotationValue(source: string, name: string): string | undefined {
  const m = new RegExp(`^[ \\t]*%%[ \\t]*@${name}[ \\t]+(?:"((?:[^"\\\\]|\\\\.)*)"|(\\S+))`, 'm').exec(source);
  const value = m?.[1] ?? m?.[2];
  return value?.replace(/\\"/g, '"');
}

function describe(source: string): Pick<DiagramInfo, 'type' | 'id' | 'title' | 'summary'> {
  const type = detectDiagramType(source);
  const statementTitle = /^[ \t]*title:?[ \t]+([^#\n;]+)/m.exec(source)?.[1]?.trim();
  const title = annotationValue(source, 'title') ?? frontMatterTitle(source) ?? statementTitle;
  const id = annotationValue(source, 'id');
  const lines = source.split('\n').map((l) => l.trim());
  const keywordIndex = lines.findIndex((l) => l && !l.startsWith('%%') && !l.startsWith('---'));
  const summary = lines.slice(keywordIndex + 1).find((l) => l && !l.startsWith('%') && !l.startsWith('#')) ?? lines[keywordIndex] ?? '';
  return { type, id, title, summary };
}

/**
 * Finds diagrams in a document: the whole text for `mermaid` documents; every
 * ```` ```mermaid ```` / `~~~mermaid` fenced block for Markdown and MDX (CommonMark fence rules).
 */
export function locateDiagrams(text: string, languageId: string): DiagramInfo[] {
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (!MARKDOWN_LANGUAGES.has(languageId)) {
    if (languageId !== 'mermaid') return [];
    return [{ index: 0, source: lines.join('\n'), fenceLine: 0, contentStartLine: 0, contentEndLine: lines.length, ...describe(text) }];
  }

  const diagrams: DiagramInfo[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[i] as string);
    if (!open) {
      i++;
      continue;
    }
    const fence = open[2] as string;
    const info = (open[3] as string).trim();
    if (fence[0] === '`' && info.includes('`')) {
      i++;
      continue;
    }
    const closeRe = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    let end = i + 1;
    while (end < lines.length && !closeRe.test(lines[end] as string)) end++;
    const language = info.split(/\s+/)[0]?.toLowerCase() ?? '';
    if (language === 'mermaid') {
      const source = lines.slice(i + 1, end).join('\n');
      diagrams.push({ index: diagrams.length, source, fenceLine: i, contentStartLine: i + 1, contentEndLine: end, ...describe(source) });
    }
    i = end + 1;
  }
  return diagrams;
}

/** The diagram whose fence or content contains `line`, if any. */
export function diagramAtLine(diagrams: DiagramInfo[], line: number): DiagramInfo | undefined {
  return diagrams.find((d) => line >= d.fenceLine && line <= d.contentEndLine);
}
