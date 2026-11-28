// shared/features.js: functies aan/uit per app. De lijst klopt en de standen werken zoals beschreven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../shared/features.js';
import { APPS } from '../shared/apps.js';

const root = new URL('../', import.meta.url).pathname;
const F = globalThis.ThuisFeatures;

test('elke functie hoort bij een bestaande app, met een unieke id en een geldige standaard', () => {
  const seen = new Set();
  for (const f of F.FEATURES) {
    assert.ok(APPS.some(a => a.id === f.app), `app ${f.app}`);
    assert.ok(!seen.has(f.app + ':' + f.id), `dubbel: ${f.id}`); seen.add(f.app + ':' + f.id);
    assert.ok(f.def in F.STATES, `${f.id}: def`);
    assert.ok(f.name && f.about, `${f.id}: naam en uitleg`);
    if (f.parent) assert.ok(F.FEATURES.some(p => p.app === f.app && p.id === f.parent && !p.parent), `${f.id}: parent ${f.parent}`);
  }
});

test('standen: aan, test (alleen beheerders), uit; een uitbreiding volgt haar functie', () => {
  const s = features => ({ features });
  assert.equal(F.on({}, 'eggs', 'boxes', false), true);
  assert.equal(F.on(s({ boxes: 'off' }), 'eggs', 'boxes', true), false);
  assert.equal(F.on(s({ boxes: 'test' }), 'eggs', 'boxes', false), false);
  assert.equal(F.on(s({ boxes: 'test' }), 'eggs', 'boxes', true), true);
  assert.equal(F.on(s({ wafels: 'off' }), 'eggs', 'wafelAnnounce', true), false);
  assert.equal(F.on(s({ wafels: 'test' }), 'eggs', 'wafelAnnounce', false), false);
  assert.equal(F.on({}, 'eggs', 'bestaatniet', true), false);
  assert.deepEqual(F.set(s({ boxes: 'off' }), 'eggs', 'boxes', 'on'), {}, 'standaard wordt niet bewaard');
  assert.deepEqual(F.set({}, 'eggs', 'boxes', 'test'), { boxes: 'test' });
});

test('elke functie wordt in haar app nagevraagd, en features.js werkt offline', () => {
  const eggs = readFileSync(join(root, 'eggs/index.html'), 'utf8');
  assert.match(eggs, /<script src="\.\.\/shared\/features\.js"><\/script>/);
  for (const f of F.list('eggs')) assert.match(eggs, new RegExp(`feat\\('${f.id}'\\)`), f.id);
  assert.match(readFileSync(join(root, 'sw.js'), 'utf8'), /'\.\/shared\/features\.js'/);
});
