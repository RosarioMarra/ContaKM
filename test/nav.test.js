import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/geo.js';
import '../js/nav.js';

const { NavSession, arrowAngle, decodePolyline6, fetchRoute, maneuverIcon } = globalThis.ContaKM;

const METER_LAT = 1 / 111195;
const point = (meters, side = 0) => ({ lat: 40 + meters * METER_LAT, lon: 14 + side * METER_LAT * 1.305 });

// Percorso rettilineo di 1 km, con una svolta a 500 m e l'arrivo in fondo.
const coords = Array.from({ length: 11 }, (_, i) => point(i * 100));
const route = {
  coords,
  maneuvers: [
    { type: 1, text: 'Parti', alert: 'Parti', spoken: 'Parti', index: 0 },
    { type: 10, text: 'Svolta a destra', alert: 'Svolta a destra', spoken: 'Svolta a destra', index: 5 },
    { type: 4, text: 'Arrivo', alert: 'Sei arrivato', spoken: 'Sei arrivato', index: 10 },
  ],
};

test('indica la manovra successiva e le distanze giuste', () => {
  const s = new NavSession(route).update({ ...point(100), accuracy: 5 });
  assert.equal(s.next.text, 'Svolta a destra');
  assert.ok(Math.abs(s.toNextM - 400) < 2, `alla svolta ${s.toNextM}`);
  assert.ok(Math.abs(s.remainingM - 900) < 2, `restanti ${s.remainingM}`);
  assert.equal(s.arrived, false);
});

test('annuncia ogni manovra due volte: una da lontano, una da vicino', () => {
  const nav = new NavSession(route);
  const said = [];
  for (let m = 0; m <= 520; m += 7) {
    const { say } = nav.update({ ...point(m), accuracy: 5 });
    if (say) said.push(say);
  }
  assert.equal(said.length, 2);
  assert.match(said[0], /^Tra \d+ metri, Svolta a destra$/);
  assert.equal(said[1], 'Svolta a destra');
});

test('dopo la svolta passa alla manovra seguente', () => {
  const nav = new NavSession(route);
  for (let m = 0; m <= 600; m += 50) nav.update({ ...point(m), accuracy: 5 });
  const s = nav.update({ ...point(620), accuracy: 5 });
  assert.equal(s.next.type, 4);
});

test('segnala il fuori percorso solo dopo più punti consecutivi', () => {
  const nav = new NavSession(route);
  assert.equal(nav.update({ ...point(100, 80), accuracy: 5 }).offRoute, false);
  assert.equal(nav.update({ ...point(110, 80), accuracy: 5 }).offRoute, false);
  assert.equal(nav.update({ ...point(120, 80), accuracy: 5 }).offRoute, true);
  assert.equal(nav.update({ ...point(130), accuracy: 5 }).offRoute, false);
});

test('un GPS impreciso non fa scattare il fuori percorso', () => {
  const nav = new NavSession(route);
  for (let i = 0; i < 5; i++) {
    assert.equal(nav.update({ ...point(100, 50), accuracy: 40 }).offRoute, false);
  }
});

test('riconosce l\'arrivo', () => {
  const nav = new NavSession(route);
  for (let m = 0; m <= 900; m += 100) nav.update({ ...point(m), accuracy: 5 });
  assert.equal(nav.update({ ...point(985), accuracy: 5 }).arrived, true);
});

test('se il percorso con la direzione di marcia fallisce, riprova senza', async (t) => {
  const starts = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const body = JSON.parse(decodeURIComponent(url.split('json=')[1]));
    starts.push(body.locations[0]);
    if (body.locations[0].heading != null) return { ok: false, status: 400 };
    return {
      ok: true,
      json: async () => ({
        trip: {
          summary: { length: 1, time: 240 },
          legs: [{ shape: '_izlhA~rlgdF_{geC~ywl@', maneuvers: [] }],
        },
      }),
    };
  });
  const route = await fetchRoute({ lat: 40, lon: 14 }, { lat: 41, lon: 15 }, { heading: 236.4 });
  assert.equal(starts.length, 2);
  assert.equal(starts[0].heading, 236);
  assert.equal(starts[1].heading, undefined);
  assert.equal(route.distanceM, 1000);
});

test('frecce e icone delle manovre', () => {
  assert.equal(arrowAngle(10), 90);
  assert.equal(arrowAngle(15), -90);
  assert.equal(arrowAngle(8), 0);
  assert.equal(maneuverIcon(4), 'destination');
  assert.equal(maneuverIcon(26), 'roundabout');
  assert.equal(maneuverIcon(10), 'arrow');
});

test('decodifica una polyline a 6 cifre', () => {
  const [a, b] = decodePolyline6('_izlhA~rlgdF_{geC~ywl@');
  assert.deepEqual(a, { lat: 38.5, lon: -120.2 });
  assert.deepEqual(b, { lat: 40.7, lon: -120.95 });
});
