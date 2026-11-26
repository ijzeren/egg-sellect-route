// Financiën → bankkoppeling (Enable Banking): ondertekenen, omzetten, saldo, ontdubbelen, fouten. Alleen nepgegevens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import * as B from '../supabase/functions/integrations/bank.mjs';
import { dropKnown as dropKnownClient, ibanHash as clientHash } from '../finance/import.js';

const keys = (type) => generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type, format: 'pem' } });
const verify = (jwt, pub) => { const [h, b, s] = jwt.split('.'); const v = createVerify('RSA-SHA256'); v.update(`${h}.${b}`); return v.verify(pub, Buffer.from(s, 'base64url')); };
const part = (jwt, i) => JSON.parse(Buffer.from(jwt.split('.')[i], 'base64url').toString());

test('JWT: RS256 met kid = app-id, ook met een PKCS#1-sleutel', async () => {
  for (const type of ['pkcs8', 'pkcs1']) {
    const k = keys(type), now = Date.UTC(2026, 10, 25, 12);
    const jwt = await B.signJwt('app-123', k.privateKey, now);
    assert.ok(verify(jwt, k.publicKey), `handtekening klopt (${type})`);
    assert.deepEqual(part(jwt, 0), { typ: 'JWT', alg: 'RS256', kid: 'app-123' });
    assert.deepEqual(part(jwt, 1), { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now / 1000, exp: now / 1000 + 3600 });
  }
  const k = keys('pkcs8');
  assert.ok(verify(await B.signJwt('a', k.privateKey.replace(/\n/g, '\\n')), k.publicKey), 'sleutel met \\n in één regel (zoals in een secret)');
  await assert.rejects(B.signJwt('', 'x'), /niet ingesteld/);
});

test('toestemming: 180 dagen of korter, Rabobank vinden', () => {
  const now = Date.UTC(2026, 10, 25, 12);
  assert.equal(B.validUntil(now), '2027-05-24T11:00:00.000+00:00');
  assert.equal(B.validUntil(now, 90 * 86400), '2027-02-23T11:00:00.000+00:00');
  const list = { aspsps: [{ name: 'ING', country: 'NL' }, { name: 'Rabobank', country: 'BE' }, { name: 'Rabobank', country: 'NL', maximum_consent_validity: 15552000 }] };
  assert.equal(B.findAspsp(list).country, 'NL');
  assert.equal(B.findAspsp({ aspsps: [] }), null);
  const s = B.sessionAccounts({ accounts: [{ uid: 'u1', account_id: { iban: 'NL00 RABO 0000 0000 01' }, currency: 'EUR', cash_account_type: 'CACC', name: 'Gezamenlijk' }, { uid: 'u2', account_id: { iban: 'NL00RABO0000000002' }, cash_account_type: 'SVGS', product: 'Spaarrekening' }, { uid: 'u3', account_id: {} }] });
  assert.deepEqual(s.map(a => [a.uid, a.iban, a.kind, a.name]), [['u1', 'NL00RABO0000000001', 'current', 'Gezamenlijk'], ['u2', 'NL00RABO0000000002', 'savings', 'Spaarrekening']]);
});

const T = (o) => ({ status: 'BOOK', credit_debit_indicator: 'DBIT', booking_date: '2026-11-20', transaction_amount: { currency: 'EUR', amount: '45.10' }, ...o });

test('transacties omzetten: richting, tegenpartij, omschrijving, alleen geboekt', () => {
  const rows = B.mapTransactions([
    T({ entry_reference: 'R1', creditor: { name: 'Albert  Heijn 1234' }, creditor_account: { iban: 'nl00test0000000099' }, remittance_information: ['Betaalautomaat', '12:01'], balance_after_transaction: { amount: '954.90' }, bank_transaction_code: { code: 'bc' } }),
    T({ entry_reference: 'R2', credit_debit_indicator: 'CRDT', transaction_amount: { currency: 'EUR', amount: '812.40' }, debtor: { name: 'Airbnb Payments' }, remittance_information: ['Payout'] }),
    T({ status: 'PDNG', entry_reference: 'R3' }),
    T({ creditor: { name: 'Bakker' } }), T({ creditor: { name: 'Bakker' } }),
  ]);
  assert.deepEqual(rows[0], { ext_id: 'eb:R1', booked_on: '2026-11-20', amount: -45.1, currency: 'EUR', counterparty: 'Albert Heijn 1234', counterparty_iban: 'NL00TEST0000000099', description: 'Betaalautomaat 12:01', code: 'bc', balance_after: 954.9 });
  assert.equal(rows[1].amount, 812.4); assert.equal(rows[1].counterparty, 'Airbnb Payments');
  assert.equal(rows.length, 4, 'nog niet geboekt overgeslagen');
  assert.notEqual(rows[2].ext_id, rows[3].ext_id, 'twee gelijke zonder referentie: elk een eigen sleutel');
  assert.deepEqual(B.mapTransactions([T({ creditor: { name: 'Bakker' } }), T({ creditor: { name: 'Bakker' } })]).map(r => r.ext_id), [rows[2].ext_id, rows[3].ext_id], 'opnieuw ophalen: dezelfde sleutels');
});

test('vanaf welke datum ophalen en welk saldo', () => {
  assert.equal(B.dateFrom(null, '2026-11-25'), '2026-08-28');
  assert.equal(B.dateFrom('2026-11-20', '2026-11-25'), '2026-11-13');
  assert.equal(B.dateFrom('2026-01-05', '2026-11-25'), '2026-08-28', 'nooit verder terug dan de bank toestaat');
  assert.deepEqual(B.pickBalance({ balances: [{ balance_type: 'ITAV', balance_amount: { amount: '10.00' } }, { balance_type: 'CLBD', balance_amount: { amount: '954.90' }, reference_date: '2026-11-24' }] }, '2026-11-25'), { amount: 954.9, on: '2026-11-24' });
  assert.deepEqual(B.pickBalance({ balances: [{ balance_type: 'ITAV', balance_amount: { amount: '-3.5' } }] }, '2026-11-25'), { amount: -3.5, on: '2026-11-25' });
  assert.equal(B.pickBalance({ balances: [] }), null);
});

test('ontdubbelen: export en bank tellen elkaar niet dubbel, server en app doen hetzelfde', () => {
  const existing = [
    { ext_id: 'rabo:101', booked_on: '2026-11-20', amount: -2.5 }, { ext_id: 'rabo:102', booked_on: '2026-11-20', amount: -2.5 },
    { ext_id: 'rabo:103', booked_on: '2026-11-21', amount: 812.4 }, { ext_id: 'eb:R9', booked_on: '2026-11-22', amount: -10 },
  ];
  const incoming = [
    { ext_id: 'eb:A', booked_on: '2026-11-20', amount: -2.5 }, { ext_id: 'eb:B', booked_on: '2026-11-20', amount: -2.5 }, { ext_id: 'eb:C', booked_on: '2026-11-20', amount: -2.5 },
    { ext_id: 'eb:D', booked_on: '2026-11-21', amount: 812.4 }, { ext_id: 'eb:R9', booked_on: '2026-11-22', amount: -10 }, { ext_id: 'eb:E', booked_on: '2026-11-22', amount: -10 },
  ];
  assert.deepEqual(B.dropKnown(incoming, existing).map(r => r.ext_id), ['eb:C', 'eb:E'], 'twee koffies uit de export + drie van de bank = één nieuwe; zelfde bron telt niet als dubbel');
  assert.deepEqual(dropKnownClient(incoming, existing), B.dropKnown(incoming, existing));
  const exp = [{ ext_id: 'rabo:200', booked_on: '2026-11-22', amount: -10 }, { ext_id: 'rabo:201', booked_on: '2026-11-23', amount: -1 }];
  assert.deepEqual(dropKnownClient(exp, existing).map(r => r.ext_id), ['rabo:201'], 'export na de bank: wat de bank al bracht, slaat de app over');
});

test('zelfde hash van rekeningnummer als in de app', async () => {
  assert.equal(await B.ibanHash('gezin-1', 'nl00 rabo 0000 0000 01'), await clientHash('gezin-1', 'NL00RABO0000000001'));
});

test('fouten op code van Enable Banking', () => {
  assert.equal(B.errorKind(401, { error: 'EXPIRED_SESSION' }), 'consent');
  assert.equal(B.errorKind(400, { error: 'WRONG_AUTHORIZATION_CODE' }), 'code');
  assert.equal(B.errorKind(429, {}), 'rate');
  assert.equal(B.errorKind(400, { error: 'REDIRECT_URI_NOT_ALLOWED' }), 'redirect');
  assert.equal(B.errorKind(401, { error: 'X' }), 'app');
  assert.equal(B.errorKind(500, null), 'other');
  for (const k of ['consent', 'code', 'rate', 'psu', 'redirect', 'noaccounts', 'app', 'other']) assert.ok(B.ERROR_TEXT[k]);
});
