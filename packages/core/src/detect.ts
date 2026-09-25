import { preprocess } from './preprocess';

export type DiagramType =
  | 'sequence' | 'flowchart' | 'state' | 'class' | 'er' | 'gantt' | 'journey' | 'gitGraph' | 'pie' | 'mindmap'
  | 'timeline' | 'quadrant' | 'requirement' | 'c4' | 'sankey' | 'xychart' | 'block' | 'packet' | 'architecture'
  | 'kanban' | 'radar' | 'treemap' | 'unknown';

/** Keyword detectors in Mermaid's order (case-sensitive, like Mermaid's own detectors). */
const DETECTORS: [DiagramType, RegExp][] = [
  ['sequence', /^\s*sequenceDiagram/],
  ['flowchart', /^\s*(?:flowchart|flowchart-elk|flowchart-v2|graph)\b/],
  ['state', /^\s*stateDiagram(?:-v2)?/],
  ['class', /^\s*classDiagram(?:-v2)?/],
  ['er', /^\s*erDiagram/],
  ['gantt', /^\s*gantt/],
  ['journey', /^\s*journey/],
  ['gitGraph', /^\s*gitGraph/],
  ['pie', /^\s*pie/],
  ['mindmap', /^\s*mindmap/],
  ['timeline', /^\s*timeline/],
  ['quadrant', /^\s*quadrantChart/],
  ['requirement', /^\s*requirement(?:Diagram)?/],
  ['c4', /^\s*C4(?:Context|Container|Component|Dynamic|Deployment)/],
  ['sankey', /^\s*sankey(?:-beta)?/],
  ['xychart', /^\s*xychart(?:-beta)?/],
  ['block', /^\s*block(?:-beta)?/],
  ['packet', /^\s*packet(?:-beta)?/],
  ['architecture', /^\s*architecture(?:-beta)?/],
  ['kanban', /^\s*kanban/],
  ['radar', /^\s*radar-beta/],
  ['treemap', /^\s*treemap(?:-beta)?/],
];

/** Detects the diagram type after removing front matter, directives and comments. */
export function detectDiagramType(source: string): DiagramType {
  const text = preprocess(source).text.replace(/^\s*(?:#|%)[^\n]*$/gm, '');
  for (const [type, re] of DETECTORS) if (re.test(text)) return type;
  return 'unknown';
}

/** Diagram title from front matter (`title:`), when present. */
export function frontMatterTitle(source: string): string | undefined {
  const fm = preprocess(source).frontMatter;
  if (!fm) return undefined;
  const m = /^title:\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/m.exec(fm);
  const title = (m?.[1] ?? m?.[2] ?? m?.[3])?.trim();
  return title || undefined;
}
