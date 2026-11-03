// Genera il logo con la bici in movimento (icons/logo.svg e i PNG) senza dipendenze: node tools/make-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [255, 122, 26];
const BIKE = [15, 27, 45];
const SPEED = [255, 255, 255];
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// Disegno su una griglia 0..100. La bici è inclinata in avanti per dare l'idea della velocità.
const LEAN = 0.2;
const LEAN_BASE_Y = 58;
const WHEELS = [{ x: 37, y: 58, r: 13 }, { x: 74, y: 58, r: 13 }];
const WHEEL_WIDTH = 5.5;
const FRAME_WIDTH = 5;
const FRAME_LINES = [
  [37, 58, 52, 58], // fodero basso
  [52, 58, 46, 36], // piantone
  [46, 36, 37, 58], // fodero alto
  [46, 36, 67, 36], // tubo orizzontale
  [67, 36, 52, 58], // tubo obliquo
  [74, 58, 65, 29], // forcella e sterzo
  [65, 29, 74, 28], // manubrio
  [40, 32, 50, 32], // sella
];
const SPEED_WIDTH = 4.5;
const SPEED_LINES = [
  [22, 29, 38, 29],
  [15, 38, 33, 38],
  [12, 47, 24, 47],
];
const CORNER = 22;
const MASKABLE_SCALE = 0.86;
const SAFE_RADIUS = 40; // Android non ritaglia mai dentro questo cerchio

function logoSvg() {
  const wheels = WHEELS
    .map((w) => `<circle cx="${w.x}" cy="${w.y}" r="${w.r}" stroke-width="${WHEEL_WIDTH}"/>`)
    .join('');
  const path = (lines) => lines.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join('');
  const lean = `matrix(1 0 ${-LEAN} 1 ${LEAN * LEAN_BASE_Y} 0)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${CORNER}" fill="${hex(BG)}"/><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${path(SPEED_LINES)}" stroke="${hex(SPEED)}" stroke-width="${SPEED_WIDTH}"/><g transform="${lean}" stroke="${hex(BIKE)}">${wheels}<path d="${path(FRAME_LINES)}" stroke-width="${FRAME_WIDTH}"/></g></g></svg>\n`;
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

const nearLines = (x, y, lines, width) =>
  lines.some(([x1, y1, x2, y2]) => segmentDist(x, y, x1, y1, x2, y2) < width / 2);

/** Colore del disegno nel punto (x, y) della griglia; null = sfondo. */
function artColor(x, y) {
  const bx = x + LEAN * (y - LEAN_BASE_Y);
  if (nearLines(bx, y, FRAME_LINES, FRAME_WIDTH)) return BIKE;
  if (WHEELS.some((w) => Math.abs(Math.hypot(bx - w.x, y - w.y) - w.r) < WHEEL_WIDTH / 2)) return BIKE;
  if (nearLines(x, y, SPEED_LINES, SPEED_WIDTH)) return SPEED;
  return null;
}

function insideRoundedSquare(x, y) {
  const dx = Math.max(CORNER - x, x - (100 - CORNER), 0);
  const dy = Math.max(CORNER - y, y - (100 - CORNER), 0);
  return Math.hypot(dx, dy) <= CORNER;
}

/** rounded: angoli trasparenti, per l'icona normale. Altrimenti sfondo pieno, per quella adattiva di Android. */
function shade(x, y, { rounded, scale }) {
  if (rounded && !insideRoundedSquare(x, y)) return null;
  const art = artColor(50 + (x - 50) / scale, 50 + (y - 50) / scale);
  return art || BG;
}

function png(size, options) {
  const samples = 3;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(size * 4 + 1);
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0];
      let covered = 0;
      for (let i = 0; i < samples; i++) {
        for (let j = 0; j < samples; j++) {
          const c = shade(((px + (i + 0.5) / samples) / size) * 100, ((py + (j + 0.5) / samples) / size) * 100, options);
          if (!c) continue;
          covered++;
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      const at = 1 + px * 4;
      for (let k = 0; k < 3; k++) row[at + k] = covered ? Math.round(sum[k] / covered) : 0;
      row[at + 3] = Math.round((covered / samples ** 2) * 255);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Si ferma se il disegno adattivo esce dalla zona che Android lascia sempre visibile. */
function checkSafeZone() {
  let farthest = 0;
  for (let x = 0; x <= 100; x += 0.25) {
    for (let y = 0; y <= 100; y += 0.25) {
      if (artColor(50 + (x - 50) / MASKABLE_SCALE, 50 + (y - 50) / MASKABLE_SCALE)) {
        farthest = Math.max(farthest, Math.hypot(x - 50, y - 50));
      }
    }
  }
  if (farthest > SAFE_RADIUS) throw new Error(`Il logo esce dalla zona sicura: ${farthest.toFixed(1)} > ${SAFE_RADIUS}`);
  console.log(`Zona sicura rispettata: ${farthest.toFixed(1)} su ${SAFE_RADIUS}`);
}

checkSafeZone();
mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
writeFileSync(new URL('../icons/logo.svg', import.meta.url), logoSvg());
for (const size of [192, 512]) {
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size, { rounded: true, scale: 1 }));
  writeFileSync(new URL(`../icons/maskable-${size}.png`, import.meta.url), png(size, { rounded: false, scale: MASKABLE_SCALE }));
}
