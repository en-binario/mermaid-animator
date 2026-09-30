/**
 * Builds the HTML player's data document from the panel (spec html-player): precomputed layouts,
 * steps and timeline, the topology when it is laid out, or a generic diagram's drawing with its
 * reveal groups tagged. The host wraps it with the player bundle (`export/player`).
 */
import type { DiagramController } from '../controller';
import type { GenericDiagram } from '../fallback';
import { encodePlayerData, slug, type PlayerData } from '../player/data';

/** `twin`: a generic drawing rendered in the player's fixed palette (spec export-theme). */
export async function buildPlayerData(controller: DiagramController, theme: PlayerData['theme'], view: PlayerData['view'], twin?: GenericDiagram): Promise<string | undefined> {
  const material = controller.exportMaterial('sequence', twin);
  if (!material) return undefined;
  const steps = controller.stepList.value;
  const chapters = material.chapters.map((c) => ({ title: c.title, firstStep: c.firstStep, slug: slug(c.title) }));
  const base = {
    version: 1 as const,
    title: material.text.title,
    theme,
    display: material.display,
    timeline: material.timeline,
    chapters,
  };
  const source = material.source();
  if (source.kind === 'sequence') {
    let topology: PlayerData['topology'];
    if (view !== 'sequence') {
      await controller.ensureTopology();
      const t = controller.exportMaterial('topology')?.source();
      if (t?.kind === 'topology') topology = { topology: t.topology, geometry: t.geometry, labels: t.labels, weight: t.weight };
    }
    const data: PlayerData = {
      ...base,
      steps: steps.map((s, i) => ({ label: controller.stepLabels.value[i] ?? s.label, caption: material.text.captions[i] })),
      view: topology ? view : 'sequence',
      sequence: { layout: source.layout, compiled: source.compiled },
      topology,
    };
    return encodePlayerData(data);
  }
  const generic = twin ?? controller.genericDiagram;
  const inner = generic?.drawingElement;
  if (!generic || !inner) return undefined;
  const groups = generic.revealGroups();
  const restore: [Element, string | null][] = [];
  const tag = (el: Element, cls: string) => {
    restore.push([el, el.getAttribute('class')]);
    el.setAttribute('class', `${el.getAttribute('class') ?? ''} ${cls}`.trim());
  };
  groups.forEach((g, i) => {
    for (const e of [g.element, ...g.extra]) tag(e, `ma-g${i}`);
    g.paths.forEach((p, j) => tag(p.el, `ma-p${i}-${j}`));
  });
  const clone = inner.cloneNode(true) as SVGSVGElement;
  for (const [e, cls] of restore) {
    if (cls === null) e.removeAttribute('class');
    else e.setAttribute('class', cls);
  }
  for (const s of clone.querySelectorAll('style')) s.remove();
  for (const e of clone.querySelectorAll<SVGElement>('[style]')) {
    e.style.removeProperty('opacity');
    e.style.removeProperty('display');
    e.style.removeProperty('stroke-dasharray');
    e.style.removeProperty('stroke-dashoffset');
  }
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const data: PlayerData & { genericCss: string } = {
    ...base,
    steps: controller.stepLabels.value.map((label) => ({ label })),
    view: 'sequence',
    generic: {
      svg: new XMLSerializer().serializeToString(clone),
      groups: groups.map((g) => ({ kind: g.kind, paths: g.paths.map((p) => ({ length: p.dashed ? 0 : p.length })) })),
      bounds: generic.bounds,
    },
    genericCss: generic.stylesheetText,
  };
  return encodePlayerData(data);
}
