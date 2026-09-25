/** UTF-8 bytes of a string (no TextEncoder: `core` has no platform dependencies). */
function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return bytes;
}

/**
 * FNV-1a 64-bit hash, computed with four 16-bit limbs (no BigInt), rendered in base 36.
 * Used for stable step identities (spec §13.6.3).
 */
export function fnv1a64(text: string): string {
  let v0 = 0x2325;
  let v1 = 0x8422;
  let v2 = 0x9ce4;
  let v3 = 0xcbf2;
  for (const byte of utf8(text)) {
    v0 ^= byte;
    // multiply by the FNV prime 0x100000001b3 (limbs: 0x01b3, 0, 0x0100, 0)
    const t0 = v0 * 0x1b3;
    let t1 = v1 * 0x1b3;
    let t2 = v2 * 0x1b3;
    let t3 = v3 * 0x1b3;
    t2 += v0 << 8;
    t3 += v1 << 8;
    t1 += t0 >>> 16;
    v0 = t0 & 0xffff;
    t2 += t1 >>> 16;
    v1 = t1 & 0xffff;
    v3 = (t3 + (t2 >>> 16)) & 0xffff;
    v2 = t2 & 0xffff;
  }
  const hi = ((v3 << 16) | v2) >>> 0;
  const lo = ((v1 << 16) | v0) >>> 0;
  return hi.toString(36).padStart(7, '0') + lo.toString(36).padStart(7, '0');
}
