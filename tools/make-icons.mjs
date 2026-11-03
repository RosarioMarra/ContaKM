// Genera il logo col tachimetro (icons/logo.svg e i PNG) senza dipendenze: node tools/make-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [11, 17, 28];
const DIAL = [255, 255, 255];
const NEEDLE = [255, 122, 26];
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// Disegno su una griglia 0..100. Il centro è più in basso di 50 per compensare l'apertura del quadrante.
const CX = 50;
const CY = 54;
const DIAL_RADIUS = 29;
const DIAL_WIDTH = 9;
const DIAL_GAP_DEG = 90; // apertura in basso
const NEEDLE_TIP = [61.3, 42.7];
const NEEDLE_WIDTH = 7;
const HUB_RADIUS = 7;
const CORNER = 22;
const ICON_SCALE = 1.15;
const MASKABLE_SCALE = 1.05;
const SAFE_RADIUS = 40; // Android non ritaglia mai dentro questo cerchio

function logoSvg() {
  const half = ((DIAL_GAP_DEG / 2) * Math.PI) / 180;
  const dx = +(DIAL_RADIUS * Math.sin(half)).toFixed(2);
  const dy = +(DIAL_RADIUS * Math.cos(half)).toFixed(2);
  const dial = `M${CX - dx} ${CY + dy}A${DIAL_RADIUS} ${DIAL_RADIUS} 0 1 1 ${CX + dx} ${CY + dy}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${CORNER}" fill="${hex(BG)}"/><g transform="translate(50 50) scale(${ICON_SCALE}) translate(-50 -50)" fill="none" stroke-linecap="round"><path d="${dial}" stroke="${hex(DIAL)}" stroke-width="${DIAL_WIDTH}"/><path d="M${CX} ${CY}L${NEEDLE_TIP[0]} ${NEEDLE_TIP[1]}" stroke="${hex(NEEDLE)}" stroke-width="${NEEDLE_WIDTH}"/><circle cx="${CX}" cy="${CY}" r="${HUB_RADIUS}" fill="${hex(NEEDLE)}"/></g></svg>\n`;
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

/** Vero se il punto cade sull'arco del quadrante, estremi arrotondati compresi. */
function onDial(x, y) {
  const half = ((DIAL_GAP_DEG / 2) * Math.PI) / 180;
  const fromBottom = Math.abs(Math.atan2(x - CX, y - CY));
  if (fromBottom >= half) return Math.abs(Math.hypot(x - CX, y - CY) - DIAL_RADIUS) < DIAL_WIDTH / 2;
  const endX = DIAL_RADIUS * Math.sin(half);
  const endY = CY + DIAL_RADIUS * Math.cos(half);
  return Math.min(Math.hypot(x - (CX - endX), y - endY), Math.hypot(x - (CX + endX), y - endY)) < DIAL_WIDTH / 2;
}

/** Colore del disegno nel punto (x, y) della griglia; null = sfondo. */
function artColor(x, y) {
  if (Math.hypot(x - CX, y - CY) < HUB_RADIUS) return NEEDLE;
  if (segmentDist(x, y, CX, CY, NEEDLE_TIP[0], NEEDLE_TIP[1]) < NEEDLE_WIDTH / 2) return NEEDLE;
  if (onDial(x, y)) return DIAL;
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
  const samples = 4;
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
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), png(size, { rounded: true, scale: ICON_SCALE }));
  writeFileSync(new URL(`../icons/maskable-${size}.png`, import.meta.url), png(size, { rounded: false, scale: MASKABLE_SCALE }));
}
