// Gezondheid: wat de opdracht op de iPhone stuurt (Nederlandse getallen, eenheden, lijsten) en het overzicht in Training.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, parseHealthBody } from '../supabase/functions/integrations/health.mjs';
import { summary } from '../training/health.js';

const T = '2026-11-22';

test('getallen zoals de iPhone ze schrijft', () => {
  assert.equal(parseNumber('72,4 kg', 'weight'), 72.4);
  assert.equal(parseNumber('72.4', 'weight'), 72.4);
  assert.equal(parseNumber(72.43, 'weight'), 72.43);
  assert.equal(parseNumber('160 lb', 'weight'), 72.57);
  assert.equal(parseNumber('8.123', 'steps'), 8123);
  assert.equal(parseNumber('8,123', 'steps'), 8123);
  assert.equal(parseNumber('12.345 stappen', 'steps'), 12345);
  assert.equal(parseNumber('8123.0', 'steps'), 8123);
  assert.equal(parseNumber('812', 'steps'), 812);
  assert.equal(parseNumber('geen', 'steps'), null);
});

test('opdracht met stappen en gewicht; lijst van stappen wordt opgeteld, van gewicht telt de eerste', () => {
  const r = parseHealthBody({ steps: '3.000\n2.500\n100', weight: '72,4 kg\n73,0 kg' }, T);
  assert.equal(r.day, T);
  assert.deepEqual(r.samples, [{ kind: 'steps', value: 5600, unit: 'stappen', day: T }, { kind: 'weight', value: 72.4, unit: 'kg', day: T }]);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(parseHealthBody({ Stappen: [1000, '2.000'] }, T).samples, [{ kind: 'steps', value: 3000, unit: 'stappen', day: T }], 'Nederlandse veldnaam en een echte lijst');
});

test('datum: optioneel, niet in de toekomst, niet ouder dan een maand', () => {
  assert.equal(parseHealthBody({ steps: 10, date: '2026-11-20' }, T).day, '2026-11-20');
  const fut = parseHealthBody({ steps: 10, date: '2026-11-25' }, T);
  assert.equal(fut.day, T); assert.equal(fut.problems.length, 1);
  const old = parseHealthBody({ steps: 10, date: '2026-09-01' }, T);
  assert.equal(old.samples.length, 0);
});

test('gewicht met eigen datum: een weging van eergisteren komt op eergisteren', () => {
  const r = parseHealthBody({ steps: '8.123', weight: '72,4 kg', weight_date: '2026-11-20T07:12:00+01:00' }, T);
  assert.deepEqual(r.samples.map(s => [s.kind, s.day]), [['steps', T], ['weight', '2026-11-20']]);
  assert.deepEqual(r.ignored, []);
  assert.equal(parseHealthBody({ gewicht: 70, gewicht_datum: '2026-11-21' }, T).samples[0].day, '2026-11-21', 'Nederlandse veldnamen');
  assert.equal(parseHealthBody({ weight: 70, weightDate: '2026-11-21' }, T).samples[0].day, '2026-11-21');
  const old = parseHealthBody({ steps: 10, weight: 70, weight_date: '2026-08-01' }, T);
  assert.deepEqual(old.samples.map(s => s.kind), ['steps'], 'te oude weging niet, stappen wel');
  assert.equal(old.problems.length, 1);
});

test('geen getal: de melding laat zien wat er binnenkwam', () => {
  const r = parseHealthBody({ weight: 'Gezondheidswaarden' }, T);
  assert.deepEqual(r.problems, ['Geen getal gevonden voor gewicht (ontvangen: "Gezondheidswaarden").']);
  assert.match(parseHealthBody({ weight: { foo: 'bar' } }, T).problems[0], /ontvangen: /);
});

test('leeg veld (geen weegschaal) is geen fout', () => {
  const r = parseHealthBody({ steps: '4000', weight: '' }, T);
  assert.equal(r.samples.length, 1); assert.deepEqual(r.problems, []); assert.deepEqual(r.empty, ['weight']);
  assert.deepEqual(parseHealthBody({ weight: '  ', weight_date: '' }, T).problems, []);
});

test('alleen toegestane soorten; onmogelijke waarden en onbekende velden worden overgeslagen', () => {
  const r = parseHealthBody({ steps: 900000, weight: '5 kg', hartslag: 60 }, T);
  assert.equal(r.samples.length, 0); assert.equal(r.problems.length, 2); assert.deepEqual(r.ignored, ['hartslag']);
  assert.deepEqual(parseHealthBody({ steps: 100, weight: 70 }, T, ['steps']).samples.map(s => s.kind), ['steps']);
  assert.equal(parseHealthBody(null, T).problems.length, 1);
});

test('overzicht in Training: laatste gewicht met verschil, stappen vandaag en de afgelopen week', () => {
  const rows = [
    { user_id: 'u1', kind: 'weight', day: '2026-10-20', value: 74 },
    { user_id: 'u1', kind: 'weight', day: '2026-11-21', value: 72.6 },
    { user_id: 'u1', kind: 'weight', day: '2026-11-22', value: 72.4 },
    { user_id: 'u1', kind: 'steps', day: '2026-11-22', value: 8000 },
    { user_id: 'u1', kind: 'steps', day: '2026-11-20', value: 6000 },
    { user_id: 'u2', kind: 'steps', day: '2026-11-22', value: 1 },
  ];
  const s = summary(rows, 'u1', T);
  assert.equal(s.weight.value, 72.4); assert.equal(s.weight.day, T);
  assert.equal(s.weight.delta, -1.6, 'verschil met ongeveer een maand geleden');
  assert.equal(s.steps.today, 8000);
  assert.equal(s.steps.week.length, 7); assert.equal(s.steps.week[6].value, 8000); assert.equal(s.steps.week[4].value, 6000); assert.equal(s.steps.week[5].value, null);
  assert.equal(s.steps.avg, 7000, 'gemiddelde over de dagen met een meting');
  const none = summary([], 'u1', T);
  assert.equal(none.weight, null); assert.equal(none.steps.today, null); assert.equal(none.empty, true);
});
