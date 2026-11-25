// Financiën: een export uit de bank inlezen (Rabobank CSV, CAMT.053). Alleen nepgegevens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, parseAmount, parseDate, parseCsv, decode, ibanHash, period, parseXml, at } from '../finance/import.js';

const HEAD = '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"';
const row = (iban, seq, date, amount, saldo, cpIban, cp, code, d1, d2 = '') =>
  [iban, 'EUR', 'RABONL2U', seq, date, date, amount, saldo, cpIban, cp, '', '', '', code, '', '', '', '', '', d1, d2, '', '', '', '', ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
const CSV = [HEAD,
  row('NL00RABO0000000001', '000000000000000101', '2026-01-02', '-45,10', '+1954,90', '', 'Albert Heijn 1234 UTRECHT', 'bc', 'Betaalautomaat 12:01 pasnr. 001'),
  row('NL00RABO0000000001', '000000000000000102', '2026-01-03', '+2500,00', '+4454,90', 'NL00TEST0000000099', 'Werkgever B.V.', 'cb', 'Salaris januari', 'Met "aanhalingstekens", en komma'),
  row('NL00RABO0000000001', '000000000000000103', '2026-01-03', '-500,00', '+3954,90', 'NL00RABO0000000002', 'J. Jansen', 'tb', 'Naar spaarrekening'),
  row('NL00RABO0000000002', '000000000000000007', '2026-01-03', '+500,00', '+10500,00', 'NL00RABO0000000001', 'J. Jansen', 'tb', 'Van betaalrekening'),
].join('\r\n') + '\r\n';

test('bedragen en datums', () => {
  assert.equal(parseAmount('+1.234,56'), 1234.56);
  assert.equal(parseAmount('-2,50'), -2.5);
  assert.equal(parseAmount('1234.56'), 1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('−0,01'), -0.01);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.equal(parseDate('2026-11-24'), '2026-11-24');
  assert.equal(parseDate('24-11-2026'), '2026-11-24');
  assert.equal(parseDate('20261124'), '2026-11-24');
  assert.equal(parseDate('2026-11-24T10:00:00+01:00'), '2026-11-24');
});

test('CSV: aanhalingstekens, komma in veld, regeleinden', () => {
  const r = parseCsv('a,b\n"x, y","z ""q"""\r\n"regel\nnieuw",2\n');
  assert.deepEqual(r, [['a', 'b'], ['x, y', 'z "q"'], ['regel\nnieuw', '2']]);
  assert.deepEqual(parseCsv('a;b\n1,5;2\n'), [['a', 'b'], ['1,5', '2']], 'puntkomma herkend');
});

test('Rabobank CSV: twee rekeningen, saldo, tegenpartij, omschrijving', () => {
  const f = parseFile(CSV);
  assert.equal(f.format, 'Rabobank CSV');
  assert.equal(f.accounts.length, 2);
  const [a, s] = f.accounts;
  assert.equal(a.iban, 'NL00RABO0000000001');
  assert.equal(a.rows.length, 3);
  assert.equal(a.balance, 3954.9); assert.equal(a.balanceOn, '2026-01-03');
  assert.deepEqual(a.rows[0], { ext_id: 'rabo:000000000000000101', booked_on: '2026-01-02', amount: -45.1, currency: 'EUR', counterparty: 'Albert Heijn 1234 UTRECHT', counterparty_iban: '', description: 'Betaalautomaat 12:01 pasnr. 001', code: 'bc', balance_after: 1954.9 });
  assert.equal(a.rows[1].description, 'Salaris januari Met "aanhalingstekens", en komma');
  assert.equal(a.rows[1].counterparty_iban, 'NL00TEST0000000099');
  assert.equal(s.balance, 10500); assert.equal(s.rows[0].amount, 500);
  assert.deepEqual(period(a.rows), { from: '2026-01-02', to: '2026-01-03', count: 3 });
});

test('Rabobank CSV in Windows-1252 (é in de kop) en met BOM', () => {
  const bytes = Uint8Array.from([...CSV].map(ch => ch === 'ë' ? 0xEB : ch.charCodeAt(0)));
  assert.equal(parseFile(bytes).accounts.length, 2);
  assert.equal(decode(new TextEncoder().encode('﻿abc')), 'abc');
});

test('onbekend bestand of creditcard geeft een duidelijke melding', () => {
  assert.throws(() => parseFile('Datum;Naam;Bedrag\n'), /herken ik niet/);
  assert.throws(() => parseFile('"Tegenrekening","Creditcard Nummer","Productnaam","Datum","Bedrag"\n'), /creditcard/);
  assert.throws(() => parseFile('%PDF-1.7 …'), /pdf/);
  assert.throws(() => parseFile(HEAD + '\n'), /Geen transacties/);
});

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>x</MsgId></GrpHdr>
<Stmt><Id>1</Id><Acct><Id><IBAN>NL00RABO0000000001</IBAN></Id><Ccy>EUR</Ccy></Acct>
<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-02-01</Dt></Dt></Bal>
<Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">79.50</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-02-02</Dt></Dt></Bal>
<Ntry><Amt Ccy="EUR">20.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-02-02</Dt></BookgDt><AcctSvcrRef>REF-1</AcctSvcrRef>
 <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Energie &amp; Water NV</Nm></Cdtr><CdtrAcct><Id><IBAN>NL00TEST0000000077</IBAN></Id></CdtrAcct></RltdPties>
 <RmtInf><Ustrd>Termijn februari</Ustrd><Ustrd>klant 42</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">5.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-02-02</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Dbtr><Pty><Nm>Tante Ans</Nm></Pty></Dbtr></RltdPties><RmtInf><Ustrd>Cadeautje</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">5.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-02-02</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Dbtr><Pty><Nm>Tante Ans</Nm></Pty></Dbtr></RltdPties><RmtInf><Ustrd>Cadeautje</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">9.99</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>PDNG</Sts><BookgDt><Dt>2026-02-03</Dt></BookgDt></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

test('CAMT.053: boekingen, richting, tegenpartij, eindsaldo, nog niet geboekt overgeslagen', () => {
  const f = parseFile(CAMT);
  assert.equal(f.format, 'CAMT.053');
  const [a] = f.accounts;
  assert.equal(a.iban, 'NL00RABO0000000001');
  assert.equal(a.balance, 79.5); assert.equal(a.balanceOn, '2026-02-02');
  assert.equal(a.rows.length, 3);
  assert.deepEqual(a.rows[0], { ext_id: 'camt:REF-1', booked_on: '2026-02-02', amount: -20.5, currency: 'EUR', counterparty: 'Energie & Water NV', counterparty_iban: 'NL00TEST0000000077', description: 'Termijn februari klant 42', code: '', balance_after: null });
  assert.equal(a.rows[1].counterparty, 'Tante Ans');
  assert.equal(a.rows[1].amount, 5);
  // twee gelijke boekingen zonder referentie krijgen elk een eigen, vaste sleutel
  assert.notEqual(a.rows[1].ext_id, a.rows[2].ext_id);
  assert.deepEqual(parseFile(CAMT).accounts[0].rows.map(r => r.ext_id), a.rows.map(r => r.ext_id), 'opnieuw inlezen geeft dezelfde sleutels');
});

test('XML: voorvoegsels, CDATA, lege elementen', () => {
  const x = parseXml('<a:Doc xmlns:a="x"><a:B/><a:C><![CDATA[1 < 2 & 3]]></a:C></a:Doc>');
  assert.equal(at(x, 'Doc', 'C').text, '1 < 2 & 3');
  assert.ok(at(x, 'Doc', 'B'));
  assert.throws(() => parseFile('<Document><Other/></Document>'), /geen CAMT\.053/);
});

test('hash van rekeningnummer: per gezin anders, spaties en hoofdletters maken niet uit', async () => {
  const a = await ibanHash('gezin-1', 'NL00 RABO 0000 0000 01'), b = await ibanHash('gezin-1', 'nl00rabo0000000001'), c = await ibanHash('gezin-2', 'NL00RABO0000000001');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b); assert.notEqual(a, c);
});
