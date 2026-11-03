import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/geo.js';
import '../js/ride.js';

const { Ride } = globalThis.ContaKM;

const T0 = 1_700_000_000_000;
const METER_LAT = 1 / 111195; // gradi di latitudine per metro

const fix = (second, meters, speed, extra = {}) => ({
  lat: 40 + meters * METER_LAT, lon: 14, speed, accuracy: 5, altitude: null, time: T0 + second * 1000, ...extra,
});

function ride60s(ride, speedMs) {
  for (let s = 0; s <= 60; s++) {
    ride.update(fix(s, s * speedMs, speedMs));
    ride.tick(T0 + s * 1000);
  }
}

test('conta distanza, tempo e media pedalando a velocità costante', () => {
  const ride = new Ride();
  ride.start(T0);
  ride60s(ride, 7);
  assert.ok(Math.abs(ride.distanceM - 420) < 10, `distanza ${ride.distanceM}`);
  assert.ok(Math.abs(ride.movingMs - 60000) <= 1000, `tempo ${ride.movingMs}`);
  assert.ok(Math.abs(ride.avgSpeedMs - 7) < 0.2, `media ${ride.avgSpeedMs}`);
});

test('da fermo il GPS che balla non aggiunge km né tempo', () => {
  const ride = new Ride();
  ride.start(T0);
  for (let s = 0; s <= 120; s++) {
    ride.update(fix(s, s % 2 ? 6 : -6, 0));
    ride.tick(T0 + s * 1000);
  }
  assert.equal(ride.distanceM, 0);
  assert.equal(ride.movingMs, 0);
});

test('un salto del GPS non cambia distanza e velocità massima', () => {
  const ride = new Ride();
  ride.start(T0);
  ride.update(fix(0, 0, 7));
  ride.update(fix(1, 7, 7));
  const before = ride.distanceM;
  ride.update(fix(2, 5000, 400));
  assert.equal(ride.distanceM, before);
  assert.ok(ride.maxSpeedMs < 10);
  ride.update(fix(3, 21, 7));
  assert.ok(Math.abs(ride.distanceM - 21) < 2, `distanza ${ride.distanceM}`);
});

test('scarta i punti troppo imprecisi', () => {
  const ride = new Ride();
  ride.start(T0);
  ride.update(fix(0, 0, 7));
  ride.update(fix(1, 300, 7, { accuracy: 80 }));
  assert.equal(ride.distanceM, 0);
});

test('senza coords.speed la velocità viene calcolata dagli spostamenti', () => {
  const ride = new Ride();
  ride.update(fix(0, 0, null));
  for (let s = 1; s <= 5; s++) ride.update(fix(s, s * 6, null));
  assert.ok(Math.abs(ride.speedMs - 6) < 0.5, `velocità ${ride.speedMs}`);
});

test('in pausa non conta nulla; dopo la ripresa non conta il tratto fatto in pausa', () => {
  const ride = new Ride();
  ride.start(T0);
  ride.update(fix(0, 0, 7));
  ride.update(fix(1, 7, 7));
  ride.pause();
  const before = ride.distanceM;
  ride.update(fix(2, 14, 7));
  ride.update(fix(3, 21, 7));
  assert.equal(ride.distanceM, before);
  ride.start(T0 + 4000);
  ride.update(fix(4, 28, 7));
  ride.update(fix(5, 35, 7));
  assert.ok(Math.abs(ride.distanceM - before - 7) < 1, `distanza ${ride.distanceM}`);
});

test('il dislivello ignora il rumore e somma le salite vere', () => {
  const ride = new Ride();
  for (let i = 0; i < 100; i++) ride.updateClimb(100 + (i % 2 ? 1 : -1));
  assert.equal(ride.climbM, 0);
  for (let i = 0; i < 100; i++) ride.updateClimb(100 + i);
  assert.ok(ride.climbM > 80 && ride.climbM < 100, `salita ${ride.climbM}`);
});

test('senza Avvia i km non vengono contati', () => {
  const ride = new Ride();
  for (let s = 0; s <= 30; s++) {
    ride.update(fix(s, s * 7, 7));
    ride.tick(T0 + s * 1000);
  }
  assert.ok(ride.speedMs > 6, `velocità ${ride.speedMs}`);
  assert.equal(ride.distanceM, 0);
  assert.equal(ride.movingMs, 0);
});

test('una uscita salvata riparte in pausa con i suoi dati', () => {
  const ride = new Ride();
  ride.start(T0);
  ride60s(ride, 7);
  const restored = new Ride(JSON.parse(JSON.stringify(ride)));
  assert.equal(restored.state, 'paused');
  assert.equal(restored.distanceM, ride.distanceM);
  assert.equal(restored.startedAt, T0);
});
