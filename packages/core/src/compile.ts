import type { Diagnostic } from './text';
import { detectDiagramType, frontMatterTitle, type DiagramType } from './detect';
import { parseSequence } from './sequence/parser';
import type { SequenceModel } from './sequence/model';
import { animatorSettings, parseAnnotations, valueText, type Annotation, type AnnotationValue } from './annotations';
import { compileSequence, type CompiledSequence, type CompileOptions } from './steps';
import { buildTimeline, type Timeline } from './timeline';

export interface CompiledDiagram {
  type: DiagramType;
  title?: string;
  id?: string;
  annotations: Annotation[];
  /** `@animator` settings (short names). */
  settings: Record<string, AnnotationValue>;
  diagnostics: Diagnostic[];
  /** Present for sequence diagrams that parsed without errors. */
  sequence?: { model: SequenceModel; compiled: CompiledSequence; timeline: Timeline };
  /** True when the native parser rejected the diagram (fallback candidate). */
  nativeFailed: boolean;
}

/** Parses, annotates and compiles one diagram's source — the single entry point used by host and webview. */
export function compileDiagram(source: string, options: CompileOptions = {}): CompiledDiagram {
  const type = detectDiagramType(source);
  const { annotations, diagnostics: annotationDiagnostics } = parseAnnotations(source);
  const settings = animatorSettings(annotations);
  const idAnnotation = annotations.find((a) => a.name === 'id');
  const titleAnnotation = annotations.find((a) => a.name === 'title');
  const base: CompiledDiagram = {
    type,
    id: idAnnotation ? valueText(idAnnotation.args[0]!.value) : undefined,
    title: titleAnnotation ? titleAnnotation.args.map((a) => valueText(a.value)).join(' ') : frontMatterTitle(source),
    annotations,
    settings,
    diagnostics: [...annotationDiagnostics],
    nativeFailed: false,
  };
  if (type !== 'sequence') return base;

  const parsed = parseSequence(source);
  base.diagnostics.push(...parsed.diagnostics);
  base.title ??= parsed.model.title;
  if (parsed.diagnostics.some((d) => d.severity === 'error')) {
    base.nativeFailed = true;
    return base;
  }
  const notes = settings.notes ? (valueText(settings.notes) as CompileOptions['notes']) : options.notes;
  const compiled = compileSequence(parsed.model, annotations, { ...options, notes });
  base.diagnostics.push(...compiled.diagnostics);
  base.sequence = { model: parsed.model, compiled, timeline: buildTimeline(compiled.steps) };
  return base;
}
