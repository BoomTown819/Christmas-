declare module 'gifenc' {
  interface Encoder {
    writeFrame(index: Uint8Array, w: number, h: number, opts?: Record<string, unknown>): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  const gifenc: {
    GIFEncoder(): Encoder;
    quantize(rgba: Uint8Array, maxColors: number, opts?: Record<string, unknown>): number[][];
    applyPalette(rgba: Uint8Array, palette: number[][], format?: string): Uint8Array;
  };
  export default gifenc;
}
