// Minimal types for wawoff2 (CommonJS, no bundled types): Google's woff2 compiled to WASM.
declare module 'wawoff2' {
  const wawoff2: {
    compress(ttf: Uint8Array): Promise<Uint8Array>;
    decompress(woff2: Uint8Array): Promise<Uint8Array>;
  };
  export default wawoff2;
}
