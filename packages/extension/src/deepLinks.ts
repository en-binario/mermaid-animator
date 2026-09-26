/**
 * Deep links (spec deep-links, M3 D7): *Copy Link to Current Step* builds
 * `vscode://enbinario.mermaid-animator/open?path=…&diagram=…&step=…`, and the URI handler opens the
 * file, the diagram and the step (by step id, structural id, then the nearest step).
 */
import * as vscode from 'vscode';
import type { DiagramInfo } from '@mermaid-animator/core';
import type { AnimatorPanel, PanelManager } from './panel';
import { diagramsIn } from './diagrams';

export const EXTENSION_ID = 'enbinario.mermaid-animator';

export interface StepLink {
  path: string;
  /** `@id`, or the 1-based diagram index as a string. */
  diagram: string;
  step?: string;
  /** 1-based step number, the nearest-step fallback. */
  near?: number;
}

export function buildStepLink(scheme: string, link: StepLink): string {
  const q = new URLSearchParams({ path: link.path, diagram: link.diagram });
  if (link.step) q.set('step', link.step);
  if (link.near !== undefined) q.set('n', String(link.near));
  return `${scheme}://${EXTENSION_ID}/open?${q.toString()}`;
}

export function parseStepLink(query: string): StepLink | undefined {
  const q = new URLSearchParams(query);
  const path = q.get('path');
  const diagram = q.get('diagram');
  if (!path || !diagram) return undefined;
  const near = q.get('n');
  return { path: path.replace(/\\/g, '/').replace(/^\/+/, ''), diagram, step: q.get('step') ?? undefined, near: near && /^\d+$/.test(near) ? Number(near) : undefined };
}

/** The diagram key used in links and sidecars: `@id`, else the 1-based index. */
export function diagramKey(d: Pick<DiagramInfo, 'id' | 'index'>): string {
  return d.id ?? String(d.index + 1);
}

export function findDiagram(diagrams: DiagramInfo[], key: string): DiagramInfo | undefined {
  return diagrams.find((d) => d.id === key) ?? (/^\d+$/.test(key) ? diagrams.find((d) => d.index === Number(key) - 1) : undefined);
}

/** Workspace-relative path of a file, with forward slashes (the folder name is omitted). */
export function workspacePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
}

/** Copies the link to the active panel's current step; returns it. */
export async function copyStepLink(panel: AnimatorPanel | undefined): Promise<string | undefined> {
  if (!panel?.current) {
    void vscode.window.showInformationMessage(vscode.l10n.t('Open an animated diagram to copy a link to its step.'));
    return undefined;
  }
  const state = panel.lastState;
  const index = typeof state?.stepIndex === 'number' ? state.stepIndex : -1;
  const link = buildStepLink(vscode.env.uriScheme, {
    path: workspacePath(panel.uri),
    diagram: diagramKey(panel.current),
    step: typeof state?.stepId === 'string' ? state.stepId : undefined,
    near: index >= 0 ? index + 1 : undefined,
  });
  await vscode.env.clipboard.writeText(link);
  void vscode.window.showInformationMessage(vscode.l10n.t('Link to step {0} copied.', index + 1));
  return link;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/** Opens a deep link; resolves with the panel, or undefined after telling the user what is missing. */
export async function openStepLink(link: StepLink, panels: PanelManager): Promise<AnimatorPanel | undefined> {
  let file: vscode.Uri | undefined;
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const candidate = vscode.Uri.joinPath(folder.uri, ...link.path.split('/'));
    if (await exists(candidate)) {
      file = candidate;
      break;
    }
  }
  if (!file) {
    void vscode.window.showInformationMessage(vscode.l10n.t('The file {0} was not found in this workspace.', link.path));
    return undefined;
  }
  const document = await vscode.workspace.openTextDocument(file);
  const diagram = findDiagram(diagramsIn(document), link.diagram);
  if (!diagram) {
    void vscode.window.showInformationMessage(vscode.l10n.t('Diagram {0} was not found in {1}.', link.diagram, link.path));
    return undefined;
  }
  const panel = panels.open(file, diagram.index, false);
  if (link.step || link.near !== undefined) {
    const send = () => panel.command('goToStepId', { id: link.step ?? '', ...(link.near !== undefined ? { near: link.near } : {}) });
    if ((panel.lastState?.stepCount ?? 0) > 0) send();
    else {
      const subscription = panel.onDidReceiveState((state) => {
        if ((state.stepCount ?? 0) > 0) {
          subscription.dispose();
          send();
        }
      });
    }
  }
  return panel;
}

export class StepLinkHandler implements vscode.UriHandler {
  constructor(private readonly panels: PanelManager) {}

  async handleUri(uri: vscode.Uri): Promise<void> {
    await this.open(uri);
  }

  /** Opens a link; resolves with the panel it opened (used by tests). */
  open(uri: vscode.Uri): Promise<AnimatorPanel | undefined> {
    if (uri.path !== '/open') return Promise.resolve(undefined);
    const link = parseStepLink(uri.query);
    if (!link) {
      void vscode.window.showInformationMessage(vscode.l10n.t('This Mermaid Animator link is incomplete.'));
      return Promise.resolve(undefined);
    }
    return openStepLink(link, this.panels);
  }
}
