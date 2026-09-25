import { validateHostMessage, webviewMessage, type HostMessage, type LogLevel, type WebviewMessage } from '@mermaid-animator/protocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Thin wrapper over the VS Code webview API with protocol validation on both directions. */
export class Host {
  private readonly api: VsCodeApi;

  constructor() {
    this.api = acquireVsCodeApi();
  }

  post(message: WebviewMessage): void {
    this.api.postMessage(message);
  }

  log(level: LogLevel, message: string): void {
    this.post(webviewMessage('log', { level, message }));
  }

  getState<T>(): T | undefined {
    return this.api.getState() as T | undefined;
  }

  setState(state: unknown): void {
    this.api.setState(state);
  }

  /** Subscribes to validated host messages; invalid ones are logged and dropped. */
  listen(handler: (message: HostMessage) => void): () => void {
    const listener = (event: MessageEvent) => {
      const result = validateHostMessage(event.data);
      if (!result.ok) {
        this.log('warn', `Ignored invalid host message: ${result.error}`);
        return;
      }
      handler(result.message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }
}
