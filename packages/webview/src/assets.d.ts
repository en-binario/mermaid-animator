/** esbuild inlines imported .woff2 files as data URLs (see scripts/build.mjs). */
declare module '*.woff2' {
  const dataUrl: string;
  export default dataUrl;
}
