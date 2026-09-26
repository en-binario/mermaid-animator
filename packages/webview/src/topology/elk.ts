/**
 * ELK in a web worker (M2b D2). Webview resources cannot be loaded as worker scripts directly, so
 * the worker is a blob that `importScripts` the shipped `workers/elk-worker.min.js` (the blob shim
 * of spec §13.2; the CSP allows `worker-src blob:` and scripts from the resource origin).
 */
import ElkConstructor, { type ELK } from 'elkjs/lib/elk-api.js';
import { assetUrl } from '../assetBase';

let instance: ELK | undefined;

export function blobWorker(scriptUrl: string): Worker {
  const source = `importScripts(${JSON.stringify(scriptUrl)});`;
  return new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
}

/** The shared ELK instance, started on first use. */
export function elk(): ELK {
  instance ??= new ElkConstructor({ workerFactory: () => blobWorker(assetUrl('workers/elk-worker.min.js')) });
  return instance;
}
