/** esbuild inlines imported .woff2 files as data URLs (see scripts/build.mjs). */
declare module '*.woff2' {
  const dataUrl: string;
  export default dataUrl;
}

/** Worker sources embedded as text by scripts/build.mjs (see workers/embedded.ts). */
declare module 'virtual:elk-worker' {
  const source: string;
  export default source;
}
declare module 'virtual:export-worker' {
  const source: string;
  export default source;
}
