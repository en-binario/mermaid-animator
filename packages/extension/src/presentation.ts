import * as vscode from 'vscode';
import { config } from './environment';

/** Workbench commands used for the presentation layout (spec presentation-mode). */
export const LAYOUT_COMMANDS = {
  maximize: 'workbench.action.maximizeEditorHideSidebar',
  restore: 'workbench.action.toggleMaximizeEditorGroup',
  enterZen: 'workbench.action.toggleZenMode',
  exitZen: 'workbench.action.exitZenMode',
} as const;

type Execute = (command: string) => Thenable<unknown>;

/**
 * Editor layout for presentations: maximises the editor area on entry and restores it on exit,
 * entering Zen Mode only when `presentation.zenMode` is on. Leaving uses `exitZenMode`, which acts
 * only while Zen Mode is still active — so a Zen Mode left early is never re-entered. At most one
 * panel presents at a time; missing commands degrade to a webview-only presentation.
 */
export class PresentationLayout {
  private owner: object | undefined;
  private maximized = false;
  private zen = false;
  private available: Set<string> | undefined;

  constructor(
    private readonly execute: Execute = (command) => vscode.commands.executeCommand(command),
    private readonly commands: () => Thenable<string[]> = () => vscode.commands.getCommands(true),
  ) {}

  get presenting(): boolean {
    return this.owner !== undefined;
  }

  isOwner(owner: object): boolean {
    return this.owner === owner;
  }

  private async has(command: string): Promise<boolean> {
    this.available ??= new Set(await this.commands());
    return this.available.has(command);
  }

  private async run(command: string): Promise<boolean> {
    if (!(await this.has(command))) return false;
    try {
      await this.execute(command);
      return true;
    } catch {
      return false;
    }
  }

  /** Enters the presentation layout for `owner`; another presenting owner is ended first. */
  async enter(owner: object): Promise<void> {
    if (this.owner === owner) return;
    if (this.owner) await this.exit(this.owner);
    this.owner = owner;
    this.maximized = await this.run(LAYOUT_COMMANDS.maximize);
    this.zen = config('presentation.zenMode', false) ? await this.run(LAYOUT_COMMANDS.enterZen) : false;
  }

  /** Restores the layout if `owner` is presenting. */
  async exit(owner: object): Promise<void> {
    if (this.owner !== owner) return;
    this.owner = undefined;
    if (this.zen) await this.run(LAYOUT_COMMANDS.exitZen);
    if (this.maximized) await this.run(LAYOUT_COMMANDS.restore);
    this.zen = false;
    this.maximized = false;
  }
}
