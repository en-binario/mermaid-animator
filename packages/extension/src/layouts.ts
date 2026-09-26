import type * as vscode from 'vscode';

export type Positions = Record<string, { x: number; y: number }>;

/**
 * Manual topology layouts (spec host-webview-protocol, M2b D8), stored per document and diagram
 * in workspace state under `layout:<uri>#<diagram id or #index>`. M3 migrates them into sidecars.
 */
export class LayoutStore {
  constructor(private readonly memento: vscode.Memento) {}

  static key(uri: vscode.Uri, diagram: { id?: string; index: number }): string {
    return `layout:${uri.toString()}#${diagram.id ?? `#${diagram.index}`}`;
  }

  get(uri: vscode.Uri, diagram: { id?: string; index: number }): Positions | undefined {
    return this.memento.get<Positions>(LayoutStore.key(uri, diagram));
  }

  async set(uri: vscode.Uri, diagram: { id?: string; index: number }, positions: Positions): Promise<void> {
    await this.memento.update(LayoutStore.key(uri, diagram), positions);
  }

  async clear(uri: vscode.Uri, diagram: { id?: string; index: number }): Promise<void> {
    await this.memento.update(LayoutStore.key(uri, diagram), undefined);
  }
}
