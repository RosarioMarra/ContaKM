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

test('record battuti da una nuova uscita', () => {
  const { newRecords } = globalThis.ContaKM;
  const old = [{ startedAt: 1, distanceM: 10000, movingMs: 1800000, maxSpeedMs: 9 }];
  assert.deepEqual(newRecords([], old[0]), [], 'la prima uscita non è un record');
  assert.deepEqual(newRecords(old, { distanceM: 12000, movingMs: 1800000, maxSpeedMs: 8 }), ['uscita più lunga', 'media più alta']);
  assert.deepEqual(newRecords(old, { distanceM: 1500, movingMs: 120000, maxSpeedMs: 10 }), ['velocità massima'], 'media su meno di 2 km non conta');
});

test('km delle ultime settimane', () => {
  const { weeklyTotals, startOfWeek } = globalThis.ContaKM;
  const now = new Date(2026, 10, 4, 12).getTime(); // mercoledì
  const monday = startOfWeek(now);
  const weeks = weeklyTotals([{ startedAt: monday + 3600e3, distanceM: 5000 }, { startedAt: monday - 3600e3, distanceM: 7000 }], now, 8);
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7].km, 5);
  assert.equal(weeks[6].km, 7);
});

test('profilo della velocità dai punti registrati', () => {
  const { speedProfile } = globalThis.ContaKM;
  const track = Array.from({ length: 6 }, (_, i) => [40 + (i * 50) / 111195, 14, i * 10]); // 50 m ogni 10 s = 18 km/h
  const profile = speedProfile(track, (t) => [t], (a, b) => Math.abs(b.lat - a.lat) * 111195);
  assert.equal(profile.length, 5);
  assert.ok(profile.every((p) => Math.abs(p.kmh - 18) < 0.01));
});
