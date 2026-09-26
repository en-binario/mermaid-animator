/**
 * ELK in a web worker (M2b D2), started from a blob that holds the worker's source (see
 * workers/embedded.ts; the CSP allows `worker-src blob:`).
 */
import ElkConstructor, { type ELK } from 'elkjs/lib/elk-api.js';
import { elkWorkerUrl } from '../workers/embedded';

let instance: Promise<ELK> | undefined;

/** The shared ELK instance, started on first use. */
export function elk(): Promise<ELK> {
  instance ??= elkWorkerUrl().then((url) => new ElkConstructor({ workerFactory: () => new Worker(url) }));
  return instance;
}
