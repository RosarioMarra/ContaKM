import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/story.js';

const { story } = globalThis.ContaKM;

test('il percorso della storia sta dentro il riquadro, centrato e senza deformarlo', () => {
  const box = { x: 100, y: 200, w: 800, h: 400 };
  const pts = story.fitTrack([[40.85, 14.25], [40.86, 14.25], [40.86, 14.27]], box);
  for (const [x, y] of pts) {
    assert.ok(x >= box.x - 1e-6 && x <= box.x + box.w + 1e-6);
    assert.ok(y >= box.y - 1e-6 && y <= box.y + box.h + 1e-6);
  }
  assert.ok(pts[1][1] < pts[0][1], 'il nord è in alto');
  assert.ok(pts[2][0] > pts[1][0], "l'est è a destra");
  assert.deepEqual(story.fitTrack([[40, 14]], box), []);
});
