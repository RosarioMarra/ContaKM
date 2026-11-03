import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/stats.js';

const { caloriesFor, startOfWeek, summarize } = globalThis.ContaKM;

test('la settimana comincia di lunedì, anche se oggi è domenica', () => {
  const sunday = new Date(2026, 10, 8, 18, 30).getTime();
  assert.equal(startOfWeek(sunday), new Date(2026, 10, 2).getTime());
  const monday = new Date(2026, 10, 2, 6, 0).getTime();
  assert.equal(startOfWeek(monday), new Date(2026, 10, 2).getTime());
});

test('somma settimana, mese e totale e trova i record', () => {
  const now = new Date(2026, 10, 4, 12).getTime(); // mercoledì 4 novembre
  const ride = (date, km, hours, maxKmh) => ({
    startedAt: date.getTime(), distanceM: km * 1000, movingMs: hours * 3600000, maxSpeedMs: maxKmh / 3.6,
  });
  const s = summarize([
    ride(new Date(2026, 10, 3), 20, 1, 40),
    ride(new Date(2026, 10, 1), 30, 2, 35), // domenica: stesso mese, settimana prima
    ride(new Date(2026, 9, 10), 50, 2, 55), // mese prima
  ], now);
  assert.equal(s.rides, 3);
  assert.equal(s.weekM, 20000);
  assert.equal(s.monthM, 50000);
  assert.equal(s.totalM, 100000);
  assert.equal(s.longestM, 50000);
  assert.ok(Math.abs(s.bestAvgMs * 3.6 - 25) < 0.001);
  assert.ok(Math.abs(s.topSpeedMs * 3.6 - 55) < 0.001);
});

test('senza uscite i totali sono zero', () => {
  const s = summarize([]);
  assert.equal(s.totalM, 0);
  assert.equal(s.longestM, 0);
  assert.equal(s.bestAvgMs, 0);
});

test('le calorie crescono con peso e velocità; da fermi sono zero', () => {
  assert.equal(caloriesFor(0, 0, 75), 0);
  assert.equal(caloriesFor(20000, 3600000, 75), 8 * 75);
  assert.ok(caloriesFor(20000, 3600000, 90) > caloriesFor(20000, 3600000, 60));
  assert.ok(caloriesFor(30000, 3600000, 75) > caloriesFor(15000, 3600000, 75));
});
