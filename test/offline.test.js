import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/offline.js';

const { offline } = globalThis.ContaKM;

test('riquadri di una zona: tutti gli zoom fino a 14, senza buchi', () => {
  const napoli = { south: 40.83, north: 40.86, west: 14.23, east: 14.27 };
  const tiles = offline.tilesFor(napoli);
  assert.ok(tiles.every(([z]) => z >= 5 && z <= 14));
  const z14 = tiles.filter(([z]) => z === 14);
  const xs = new Set(z14.map(([, x]) => x));
  const ys = new Set(z14.map(([, , y]) => y));
  assert.equal(z14.length, xs.size * ys.size, 'griglia completa');
  assert.ok(z14.length >= 4 && z14.length < 40);
  assert.equal(offline.countTiles(napoli), tiles.length);
  assert.ok(offline.countTiles({ south: 40, north: 42, west: 12, east: 15 }) > offline.MAX_TILES, 'una regione è troppo');
});

test('chiave dei riquadri salvati: non dipende dalla versione settimanale della mappa', () => {
  const a = offline.savedKey('https://tiles.openfreemap.org/planet/20261101_080013_pt/14/8843/6118.pbf');
  const b = offline.savedKey('https://tiles.openfreemap.org/planet/20261108_080013_pt/14/8843/6118.pbf');
  assert.equal(a, b);
  assert.equal(offline.savedKey('https://tiles.openfreemap.org/styles/positron'), 'https://tiles.openfreemap.org/styles/positron');
});
