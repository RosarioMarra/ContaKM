import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.ContaKM ??= {};
await import('../js/bike3d.js');
const { geometry, settle } = globalThis.ContaKM.bike3d;

test('in nessun modello le ruote entrano nel telaio', () => {
  for (const [name, base] of Object.entries(geometry)) {
    const S = settle(base);
    assert.ok(S.gaps.front >= 0.02, `${name}: ruota anteriore a ${S.gaps.front.toFixed(3)} m dal telaio`);
    assert.ok(S.gaps.rear >= 0.02, `${name}: ruota posteriore a ${S.gaps.rear.toFixed(3)} m dal piantone`);
    assert.ok(S.front - base.front <= 0.125, `${name}: ruota anteriore spostata troppo`);
    assert.ok(S.headLow[1] - base.headLow[1] <= 0.2, `${name}: tubo sterzo alzato troppo`);
  }
});

test('le due ruote non si toccano', () => {
  for (const [name, base] of Object.entries(geometry)) {
    const S = settle(base);
    const outer = (R) => R + S.tire * 2;
    assert.ok(S.front - S.rear > outer(S.R) + outer(S.rearR || S.R), name);
  }
});
