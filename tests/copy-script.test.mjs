// scripts/prod-naar-lokaal.mjs: leest productie alleen, en de lijst met overgeslagen tabellen klopt met het schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const script = readFileSync(join(root, 'scripts/prod-naar-lokaal.mjs'), 'utf8');
const schema = readFileSync(join(root, 'supabase/schema.sql'), 'utf8');

test('kopieerscript leest productie alleen (--read-only, nooit --yes)', () => {
  const calls = [...script.matchAll(/`--remote=\$\{ref\}`[^\]]*\]/g)].map(m => m[0]);
  assert.ok(calls.length >= 1, 'aanroep naar productie gevonden');
  for (const c of calls) assert.match(c, /'--read-only'/, c);
  assert.doesNotMatch(script, /'--yes'|SUPABASE_YES/, 'geen bevestigde wijzigingen op productie');
});

test('overgeslagen tabellen bestaan in het schema', () => {
  const skip = JSON.parse(script.match(/export const SKIP = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  for (const t of skip) assert.match(schema, new RegExp(`create table if not exists public\\.${t}\\b`), t);
});
