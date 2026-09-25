// Renders media/icon.png (128×128): three hairline lifelines on warm ivory, one
// Prussian-ink message crossing between them and a brass pulse at its tip (spec §9.10).
// Pure Node (zlib) with 4× supersampling; run with `node scripts/make-icon.mjs`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const S = 128;
const SS = 4;
const N = S * SS;
const px = new Float32Array(N * N * 4); // premultiplied RGBA, 0..1

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const IVORY = hex('#FAF8F3');
const RULE = hex('#B9B1A1');
const INK = hex('#1F3B61');
const BRASS = hex('#8C6A3A');
const SURFACE = hex('#FFFFFF');

function blend(x, y, [r, g, b], a = 1) {
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  const i = (y * N + x) * 4;
  px[i] = r * a + px[i] * (1 - a);
  px[i + 1] = g * a + px[i + 1] * (1 - a);
  px[i + 2] = b * a + px[i + 2] * (1 - a);
  px[i + 3] = a + px[i + 3] * (1 - a);
}

function fill(test, color) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (test((x + 0.5) / SS, (y + 0.5) / SS)) blend(x, y, color);
}

const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const segment = (ax, ay, bx, by, w) => (x, y) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return (x - (ax + t * dx)) ** 2 + (y - (ay + t * dy)) ** 2 <= (w / 2) ** 2;
};
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const triangle = (p) => (x, y) => {
  const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(p[0], p[1]), d2 = s(p[1], p[2]), d3 = s(p[2], p[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// Background tile
fill(roundedRect(4, 4, 124, 124, 22), IVORY);
const cols = [34, 64, 94];
// Participant headers and dashed lifelines
for (const c of cols) {
  fill(roundedRect(c - 12, 20, c + 12, 34, 3), SURFACE);
  for (const [x0, y0, x1, y1] of [[c - 12, 20, c + 12, 21.4], [c - 12, 32.6, c + 12, 34], [c - 12, 20, c - 10.6, 34], [c + 10.6, 20, c + 12, 34]]) fill((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, RULE);
  for (let y = 38; y < 110; y += 7) fill(segment(c, y, c, y + 3.5, 2), RULE);
}
// Message from column 1 to column 3 with arrowhead
fill(segment(34, 66, 88, 66, 4), INK);
fill(triangle([[96, 66], [85, 60], [85, 72]]), INK);
// Return message (dashed)
for (let x = 90; x > 40; x -= 8) fill(segment(x, 86, x - 4.5, 86, 2.4), INK);
fill(triangle([[36, 86], [43, 82], [43, 90]]), INK);
// Brass pulse riding the first message
fill(circle(72, 66, 6.5), BRASS);
fill(circle(72, 66, 2.5), IVORY);

// Downsample with alpha and encode PNG (RGBA, 8-bit)
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const i = ((y * SS + sy) * N + (x * SS + sx)) * 4;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; a += px[i + 3];
    }
    const n = SS * SS;
    a /= n;
    const o = y * (S * 4 + 1) + 1 + x * 4;
    raw[o] = a ? Math.round((r / n / a) * 255) : 0;
    raw[o + 1] = a ? Math.round((g / n / a) * 255) : 0;
    raw[o + 2] = a ? Math.round((b / n / a) * 255) : 0;
    raw[o + 3] = Math.round(a * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(new URL('../packages/extension/media/', import.meta.url), { recursive: true });
writeFileSync(new URL('../packages/extension/media/icon.png', import.meta.url), png);
console.log(`media/icon.png written (${png.length} bytes)`);
