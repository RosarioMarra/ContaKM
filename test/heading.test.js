import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/heading.js';

const { compassHeading, smoothAngle, bestHeading } = globalThis.ContaKM.heading;
const near = (a, b, msg) => assert.ok(Math.abs(((a - b + 540) % 360) - 180) < 0.5, `${msg}: ${a} invece di ${b}`);

test('telefono in piano: conta il lato alto dello schermo', () => {
  near(compassHeading(0, 0, 0), 0, 'verso nord');
  near(compassHeading(90, 0, 0), 270, 'alpha 90 = ovest');
  near(compassHeading(270, 0, 0), 90, 'alpha 270 = est');
});

test('telefono dritto sul manubrio: conta il retro del telefono', () => {
  near(compassHeading(0, 90, 0), 0, 'retro verso nord');
  near(compassHeading(270, 90, 0), 90, 'retro verso est');
  near(compassHeading(180, 80, 0), 180, 'quasi dritto, verso sud');
});

test('schermo in orizzontale: ruota la direzione del lato alto', () => {
  near(compassHeading(0, 0, 0, 90), 90, 'girato a sinistra, il lato alto dello schermo guarda a est');
  near(compassHeading(0, 0, 0, 270), 270, 'girato a destra, guarda a ovest');
});

test('dati mancanti: nessuna direzione', () => {
  assert.equal(compassHeading(null, 0, 0), null);
});

test('filtro circolare: da 350 a 10 passa per 0', () => {
  near(smoothAngle(350, 10, 0.5), 0, 'a metà strada');
  assert.equal(smoothAngle(null, 42), 42);
});

test('GPS quando si pedala, bussola da fermi', () => {
  assert.equal(bestHeading({ gps: 120, speedMs: 5, compass: 80 }), 120);
  assert.equal(bestHeading({ gps: 120, speedMs: 1, compass: 80 }), 80);
  assert.equal(bestHeading({ gps: 120, speedMs: 1, compass: null }), 120);
  assert.equal(bestHeading({ gps: null, speedMs: 0, compass: null }), null);
});
