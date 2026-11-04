import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/bikes.js';

const { bikes } = globalThis.ContaKM;
const NOW = 1_780_000_000_000;
const DAY = 86400000;
const ride = (km, bikeId, startedAt = NOW) => ({ startedAt, distanceM: km * 1000, movingMs: 3600000, maxSpeedMs: 8, climbM: 0, track: [], bikeId });

test('bici nuova: nome, tipo e manutenzione appena fatta ai km che ha già', () => {
  const b = bikes.createBike({ name: '  Graziella ', type: 'City', startKm: 1200 }, NOW);
  assert.equal(b.name, 'Graziella');
  assert.equal(b.type, 'City');
  assert.equal(b.startKm, 1200);
  assert.ok(b.maintenance.every((i) => i.doneAtKm === 1200 && i.doneAt === NOW));
  assert.equal(bikes.visibleItems(b).some((i) => i.key === 'battery'), false, 'batteria solo per le elettriche');
  assert.equal(bikes.visibleItems({ ...b, electric: true }).some((i) => i.key === 'battery'), true);
});

test('km di ogni bici: km iniziali più le sue uscite', () => {
  const a = bikes.createBike({ name: 'A', startKm: 100 }, NOW);
  const b = bikes.createBike({ name: 'B' }, NOW);
  const history = [ride(10, a.id), ride(5, b.id), ride(3, undefined)];
  assert.equal(bikes.bikeKm(a, history, [a, b]), 113, 'le uscite senza bici vanno alla prima');
  assert.equal(bikes.bikeKm(b, history, [a, b]), 5);
});

test('scadenze in km e in mesi', () => {
  const b = bikes.createBike({}, NOW);
  const lube = b.maintenance.find((i) => i.key === 'chain-lube');
  assert.equal(bikes.itemStatus(lube, 150, NOW).due, false);
  assert.equal(bikes.itemStatus(lube, 150, NOW).kmLeft, 150);
  assert.equal(bikes.itemStatus(lube, 300, NOW).due, true);
  const service = b.maintenance.find((i) => i.key === 'service');
  assert.equal(bikes.itemStatus(service, 0, NOW + 300 * DAY).due, false);
  assert.equal(bikes.itemStatus(service, 0, NOW + 380 * DAY).due, true);
});

test('voci da fare e "fatto" che azzera e salva lo storico', () => {
  const b = bikes.createBike({}, NOW);
  const history = [ride(350, b.id)];
  const due = bikes.dueItems(b, history, [b], NOW);
  assert.deepEqual(due.map((i) => i.key), ['chain-lube']);
  bikes.markDone(due[0], 350, NOW + DAY);
  assert.equal(bikes.dueItems(b, history, [b], NOW + DAY).length, 0);
  assert.deepEqual(due[0].log, [{ at: NOW + DAY, km: 350 }]);
});

test('voce aggiunta a mano', () => {
  const b = bikes.createBike({}, NOW);
  const item = bikes.addItem(b, { label: 'Cambio', everyKm: 1500 }, 40, NOW);
  assert.equal(item.doneAtKm, 40);
  assert.equal(bikes.itemStatus(item, 1540, NOW).due, true);
});

test('prima apertura: "La mia bici" prende uscite e manutenzione di prima', () => {
  const history = [ride(200, undefined), ride(150, undefined, NOW - DAY)];
  const prefs = { bikeType: 'Road', serviceEveryKm: 250, serviceAtKm: 100 };
  const m = bikes.migrate([], history, prefs, NOW);
  const [b] = m.bikes;
  assert.equal(b.name, 'La mia bici');
  assert.equal(b.type, 'Road');
  assert.equal(m.activeBikeId, b.id);
  assert.ok(m.history.every((r) => r.bikeId === b.id));
  const lube = b.maintenance.find((i) => i.key === 'chain-lube');
  assert.equal(lube.everyKm, 250);
  assert.equal(bikes.itemStatus(lube, 350, NOW).kmSince, 250, 'come prima: 250 km dall\'ultima volta');
  assert.equal(bikes.itemStatus(b.maintenance.find((i) => i.key === 'chain'), 350, NOW).kmSince, 0);
  assert.equal(bikes.migrate(m.bikes, m.history, prefs, NOW), null, 'una volta sola');
});

test('backup: le bici vengono salvate e ricaricate', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  await import('../js/store.js');
  const { store } = globalThis.ContaKM;
  const b = bikes.createBike({ name: 'Graziella' }, NOW);
  store.saveBikes([b]);
  store.addToHistory(ride(12, b.id));
  const backup = JSON.parse(JSON.stringify(store.exportBackup()));
  mem.clear();
  assert.equal(store.importBackup(backup), 1);
  assert.equal(store.loadBikes()[0].name, 'Graziella');
  store.setRideBike(NOW, 'altra');
  assert.equal(store.loadHistory()[0].bikeId, 'altra');
});

test('km iniziali cambiati dopo: la manutenzione mai fatta si sposta, quella fatta no', () => {
  const b = bikes.createBike({}, NOW);
  const done = b.maintenance.find((i) => i.key === 'brakes');
  bikes.markDone(done, 0, NOW);
  bikes.setStartKm(b, 2500);
  assert.equal(b.startKm, 2500);
  assert.equal(bikes.dueItems(b, [], [b], NOW).map((i) => i.key).join(), 'brakes', 'solo la voce segnata a 0 km');
});

test('telaio e colore: scelti o dedotti dal tipo', () => {
  const b = bikes.createBike({ type: 'Mountain' }, NOW);
  assert.equal(bikes.frameOf(b), 'mtb');
  assert.equal(bikes.frameOf({ ...b, frame: 'city' }), 'city');
  assert.equal(bikes.colorOf(b, '#123456'), '#123456');
  assert.equal(bikes.colorOf({ ...b, color: '#e5484d' }), '#e5484d');
});

test('ogni voce di manutenzione sa su quale pezzo zoomare', () => {
  const b = bikes.createBike({ electric: true }, NOW);
  const part = (key) => bikes.partFor(b.maintenance.find((i) => i.key === key));
  assert.equal(part('chain-lube'), 'chain');
  assert.equal(part('brakes'), 'brakes');
  assert.equal(part('tyres'), 'tyres');
  assert.equal(part('battery'), 'battery');
  assert.equal(part('service'), 'all');
  assert.equal(bikes.partFor({ label: 'Regolazione cambio' }), 'chain');
  assert.equal(bikes.partFor({ label: 'Spurgo freni idraulici' }), 'brakes');
  assert.equal(bikes.partFor({ label: 'Cambio sella' }), 'saddle');
  assert.equal(bikes.partFor({ label: 'Lavaggio' }), 'all');
});
