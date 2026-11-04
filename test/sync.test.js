import test from 'node:test';
import assert from 'node:assert/strict';

// Un telefono finto: localStorage separato per ogni "dispositivo".
function device() {
  const mem = new Map();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
}
globalThis.localStorage = device();
await import('../js/store.js');
await import('../js/sync.js');
const { store, sync } = globalThis.ContaKM;

// Supabase finto: tabelle in memoria, updated_at sempre crescente come sul server.
function fakeSupabase() {
  const tables = { rides: new Map(), bikes: new Map(), settings: new Map() };
  const keys = { rides: (r) => r.started_at, bikes: (r) => r.id, settings: () => 'me' };
  let clock = 0;
  const iso = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
  return {
    tables,
    from(table) {
      const q = { since: null, from: 0, to: 1e9 };
      const builder = {
        select() { return builder; },
        order() { return builder; },
        range(a, b) { q.from = a; q.to = b; return builder; },
        gt(_, v) { q.since = v; return builder; },
        then(resolve) {
          const rows = [...tables[table].values()]
            .filter((r) => !q.since || r.updated_at > q.since)
            .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
            .slice(q.from, q.to + 1);
          resolve({ data: structuredClone(rows), error: null });
        },
        async upsert(rows) {
          for (const r of rows) tables[table].set(keys[table](r), { ...structuredClone(r), updated_at: iso() });
          return { error: null };
        },
      };
      return builder;
    },
  };
}

const ride = (startedAt, km) => ({ startedAt, distanceM: km * 1000, movingMs: 3600000, maxSpeedMs: 8, climbM: 0, track: [[45, 9, 0]] });
let phoneA;
let phoneB;
const server = fakeSupabase();
const on = (phone) => { globalThis.localStorage = phone; };

test('primo accesso: le uscite del telefono vanno online', async () => {
  phoneA = device();
  on(phoneA);
  store.saveHistory([ride(1000, 10), ride(2000, 20)]);
  store.saveBikes([{ id: 'b1', name: 'Graziella', createdAt: 1, maintenance: [] }]);
  await sync.syncNow(server, store, 'u1');
  assert.equal(server.tables.rides.size, 2);
  assert.equal(server.tables.bikes.get('b1').data.name, 'Graziella');
  assert.equal(server.tables.settings.size, 1);
});

test('un secondo telefono ritrova tutto', async () => {
  phoneB = device();
  on(phoneB);
  const { pulled } = await sync.syncNow(server, store, 'u1');
  assert.equal(pulled, true);
  assert.deepEqual(store.loadHistory().map((r) => r.startedAt), [2000, 1000]);
  assert.equal(store.loadBikes()[0].name, 'Graziella');
});

test('modifiche ed eliminazioni passano da un telefono all\'altro', async () => {
  on(phoneB);
  store.removeFromHistory(1000);
  const bikes = store.loadBikes();
  bikes[0].name = 'Graziella rossa';
  store.saveBikes(bikes);
  await sync.syncNow(server, store, 'u1');
  assert.equal(server.tables.rides.get(1000).deleted, true);

  on(phoneA);
  store.addToHistory(ride(3000, 30));
  await sync.syncNow(server, store, 'u1');
  assert.deepEqual(store.loadHistory().map((r) => r.startedAt), [3000, 2000], 'eliminata anche qui, nuova caricata');
  assert.equal(store.loadBikes()[0].name, 'Graziella rossa');

  on(phoneB);
  await sync.syncNow(server, store, 'u1');
  assert.deepEqual(store.loadHistory().map((r) => r.startedAt), [3000, 2000]);
});

test('vince la modifica più recente', async () => {
  on(phoneA);
  store.setRideBike(2000, 'b-vecchia');
  await new Promise((r) => setTimeout(r, 5));
  on(phoneB);
  store.setRideBike(2000, 'b-nuova');
  on(phoneA);
  await sync.syncNow(server, store, 'u1');
  on(phoneB);
  await sync.syncNow(server, store, 'u1');
  on(phoneA);
  await sync.syncNow(server, store, 'u1');
  assert.equal(store.loadHistory().find((r) => r.startedAt === 2000).bikeId, 'b-nuova');
  on(phoneB);
  assert.equal(store.loadHistory().find((r) => r.startedAt === 2000).bikeId, 'b-nuova');
});

test('impostazioni condivise, ma la bici in uso e il tema sole restano del telefono', async () => {
  on(phoneA);
  store.savePrefs({ ...store.loadPrefs(), weightKg: 82, sun: true, activeBikeId: 'b1' });
  await sync.syncNow(server, store, 'u1');
  on(phoneB);
  store.savePrefs({ ...store.loadPrefs(), activeBikeId: 'b2', sun: false }, { fromSync: true });
  await sync.syncNow(server, store, 'u1');
  const prefs = store.loadPrefs();
  assert.equal(prefs.weightKg, 82);
  assert.equal(prefs.sun, false);
  assert.equal(prefs.activeBikeId, 'b2');
});

test('niente cambiato: non si ricarica nulla', async () => {
  on(phoneA);
  await sync.syncNow(server, store, 'u1');
  const before = server.tables.rides.get(3000).updated_at;
  await sync.syncNow(server, store, 'u1');
  assert.equal(server.tables.rides.get(3000).updated_at, before);
});
