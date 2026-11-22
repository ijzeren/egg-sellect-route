// Versies en release notes: één versie voor de hele familie-app, overal gelijk, netjes oplopend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { RELEASES, VERSION } from '../shared/releases.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const semver = v => v.split('.').map(Number);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

test('versie in sw.js en Egg-sellent gelijk aan de nieuwste release', () => {
  assert.equal(read('sw.js').match(/const VERSION = '([\d.]+)'/)[1], VERSION);
  assert.equal(read('eggs/index.html').match(/const APP_VERSION = '([\d.]+)'/)[1], VERSION);
});

test('releases: semantische versies, aflopend, met datum en notities', () => {
  for (const r of RELEASES) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/, r.version);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.version);
    assert.ok(r.title && r.notes.length, r.version);
  }
  for (let i = 1; i < RELEASES.length; i++) assert.ok(cmp(RELEASES[i - 1].version, RELEASES[i].version) > 0, `${RELEASES[i - 1].version} na ${RELEASES[i].version}`);
});

test('alle bestanden in de service worker bestaan', () => {
  const list = [...read('sw.js').match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)].map(m => m[1]);
  for (const p of list) assert.ok(existsSync(new URL(p || 'index.html', root)), p);
});

test('kennisbank: unieke slugs, verwijzingen uit release notes bestaan', async () => {
  const { KB } = await import('../shared/kb.js');
  const slugs = KB.map(a => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'dubbele slug');
  for (const a of KB) { assert.ok(a.title && a.body && a.app, a.slug); assert.match(a.updated, /^\d{4}-\d{2}-\d{2}$/, a.slug); }
  for (const r of RELEASES) for (const n of r.notes) if (n.kb) assert.ok(slugs.includes(n.kb), `${r.version}: kennisbank '${n.kb}' bestaat niet`);
});
