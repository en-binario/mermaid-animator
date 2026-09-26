/**
 * Base URL of the webview bundle (the directory of `main.js`). Set once by the entry module,
 * because lazily loaded chunks live in `chunks/` and their `import.meta.url` differs.
 */
let base = '';

export function setAssetBase(url: string): void {
  base = url;
}

/** Absolute URL of a file shipped next to `main.js`, e.g. `workers/elk-worker.min.js`. */
export function assetUrl(relative: string): string {
  return new URL(relative, base || document.baseURI).href;
}
