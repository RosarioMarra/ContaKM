import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Gli script condividono lo stesso ambito per file: due funzioni con lo stesso nome si sovrascrivono
// senza errori (è successo con drawRoute, e il navigatore non disegnava più il percorso).
test('nessuna funzione dichiarata due volte nello stesso file', () => {
  const dir = new URL('../js/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    const names = [...src.matchAll(/^\s*(?:async\s+)?function\s+(\w+)\s*\(/gm)].map((m) => m[1]);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dup, [], `${file}: ${dup.join(', ')}`);
  }
});
