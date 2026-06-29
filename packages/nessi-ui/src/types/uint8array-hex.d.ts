interface Uint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {
  toHex(): string;
}

interface Uint8ArrayConstructor {
  fromHex(hex: string): Uint8Array;
}
