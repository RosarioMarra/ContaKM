// Genera il logo con la bici (icons/logo.svg e i PNG) senza dipendenze: node tools/make-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [15, 27, 45];
const ACCENT = [255, 122, 26];
const WHITE = [255, 255, 255];
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// Disegno della bici su una griglia 0..100, dentro la zona sicura delle icone Android.
const WHEELS = [{ x: 28, y: 62, r: 15 }, { x: 72, y: 62, r: 15 }];
const WHEEL_WIDTH = 4.5;
const FRAME_WIDTH = 4;
const FRAME = [
  [28, 62, 46, 62], // fodero basso
  [46, 62, 40, 42], // piantone
  [40, 42, 28, 62], // fodero alto
  [40, 42, 64, 42], // tubo orizzontale
  [64, 42, 46, 62], // tubo obliquo
  [72, 62, 62, 34], // forcella e sterzo
  [62, 34, 70, 32], // manubrio
  [36, 37, 46, 37], // sella
  [40, 42, 41, 37], // reggisella
];

function logoSvg() {
  const wheels = WHEELS
    .map((w) => `<circle cx="${w.x}" cy="${w.y}" r="${w.r}" stroke="${hex(ACCENT)}" stroke-width="${WHEEL_WIDTH}"/>`)
    .join('');
  const frame = FRAME.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${hex(BG)}"/><g fill="none">${wheels}<path d="${frame}" stroke="${hex(WHITE)}" stroke-width="${FRAME_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/></g></svg>\n`;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function segmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Colore del punto (x, y) sulla griglia 0..100. */
function shade(x, y) {
  if (FRAME.some(([x1, y1, x2, y2]) => segmentDist(x, y, x1, y1, x2, y2) < FRAME_WIDTH / 2)) return WHITE;
  if (WHEELS.some((w) => Math.abs(Math.hypot(x - w.x, y - w.y) - w.r) < WHEEL_WIDTH / 2)) return ACCENT;
  return BG;
}

function png(size) {
  const samples = 3;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(size * 3 + 1);
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      for (let i = 0; i < samples; i++) {
        for (let j = 0; j < samples; j++) {
          const c = shade(((px + (i + 0.5) / samples) / size) * 100, ((py + (j + 0.5) / samples) / size) * 100);
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      for (let k = 0; k < 3; k++) row[1 + px * 3 + k] = Math.round(sum[k] / samples ** 2);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
writeFileSync(new URL('../icons/logo.svg', import.meta.url), logoSvg());
for (const size of [192, 512]) {
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size));
}
