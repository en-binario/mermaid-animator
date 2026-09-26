/**
 * Workers started from embedded source (spec §13.2 blob shim). A blob worker cannot `importScripts`
 * the extension's worker files in a VS Code webview: resource URLs are served by the webview's
 * service worker, which does not handle requests from dedicated workers. The build therefore embeds
 * each worker's source as text in a lazily loaded chunk, and the blob holds the whole script.
 */
const urls = new Map<string, Promise<string>>();

function blobUrl(key: string, load: () => Promise<{ default: string }>): Promise<string> {
  let url = urls.get(key);
  if (!url) {
    url = load().then(({ default: source }) => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    urls.set(key, url);
  }
  return url;
}

/** Blob URL of the ELK layout worker (elkjs, unmodified). */
export const elkWorkerUrl = (): Promise<string> => blobUrl('elk', () => import('virtual:elk-worker'));

/** Blob URL of the render-and-encode worker for animated exports (M3 D2). */
export const exportWorkerUrl = (): Promise<string> => blobUrl('export', () => import('virtual:export-worker'));
