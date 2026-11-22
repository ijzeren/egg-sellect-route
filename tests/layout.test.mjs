// Nooit breder dan de telefoon: het vangnet in shared/theme.css blijft staan, en geen vaste breedtes die
// op een smalle iPhone (320 px) niet passen. Controle in de browser: alle schermen op 320 px breed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const read = p => readFileSync(join(root, p), 'utf8');

test('vangnet tegen horizontaal scrollen staat in het gedeelde thema', () => {
  const css = read('shared/theme.css');
  assert.match(css, /main\{overflow-x:clip\}/, 'overflow-x:clip op de inhoud (main)');
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(plain, /(^|[},\s])(html|body)(,(html|body))?\{[^}]*overflow-x:clip/, 'geen overflow-x:clip op html/body: op iOS verdwijnen dan de vaste balken onderaan');
  assert.match(css, /body\{overflow-wrap:break-word/, 'lange woorden breken af');
  assert.match(css, /hyphens:auto/, 'afbreekstreepjes in koppen');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /(html|body)[^{]*\{[^}]*overflow-x:hidden/, 'geen overflow-x:hidden op html/body: dat breekt de vaste kopbalk');
});

test('elke pagina laadt het gedeelde thema', () => {
  for (const p of ['index.html', 'eggs/index.html', 'training/index.html', 'recipes/index.html', 'agenda/index.html'])
    assert.match(read(p), /shared\/theme\.css/, p);
});

test('geen vaste breedtes van 320 px of meer, geen 100vw', () => {
  const files = [];
  const walk = d => { for (const f of readdirSync(join(root, d))) { const p = join(d, f); if (statSync(join(root, p)).isDirectory()) walk(p); else if (/\.(css|html|js)$/.test(f)) files.push(p); } };
  for (const d of ['shared', 'hub', 'eggs', 'training', 'recipes', 'agenda']) walk(d);
  files.push('index.html');
  for (const f of files) {
    const s = read(f);
    for (const m of s.matchAll(/(?:^|[^-\w])(min-)?width:\s*(\d+)px/g)) assert.ok(+m[2] < 320, `${f}: ${m[0].trim()}`);
    assert.doesNotMatch(s, /\b100vw\b/, `${f}: 100vw`);
  }
});

test('nooit zoomen: elke pagina met maximum-scale=1 en shared/nozoom.js', () => {
  for (const p of ['index.html', 'eggs/index.html', 'training/index.html', 'recipes/index.html', 'agenda/index.html']) {
    const s = read(p);
    assert.match(s, /name="viewport" content="[^"]*maximum-scale=1[^"]*"/, `${p}: maximum-scale=1`);
    assert.match(s, /shared\/nozoom\.js/, `${p}: nozoom.js`);
  }
  assert.match(read('sw.js'), /shared\/nozoom\.js/, 'nozoom.js in ASSETS (offline)');
});

