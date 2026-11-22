// Agendalinks (iCal) lezen: tijdzones, zomer-/wintertijd, hele dagen, herhalingen, afgelaste lessen, opnieuw ophalen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseICal, toAgendaRows, cleanUrl } from '../supabase/functions/integrations/ical.mjs';

const cal = (...ev) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//NL', ...ev.flatMap(e => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const win = { from: '2026-10-01', until: '2026-12-31' };
const rows = (text, w = win) => toAgendaRows(parseICal(text).events, w).rows;

test('Magister-achtige les: UTC-tijden worden Nederlandse tijd (wintertijd +1)', () => {
  const r = rows(cal(['UID:les-1@magister', 'DTSTART:20261123T073000Z', 'DTEND:20261123T082000Z', 'SUMMARY:wi - BOS', 'LOCATION:1.12', 'DESCRIPTION:Huiswerk:\\nopgave 4\\, 5']));
  assert.equal(r.length, 1);
  assert.deepEqual({ ...r[0] }, { external_id: 'les-1@magister', on_date: '2026-11-23', start_time: '08:30', end_time: '09:20', title: 'wi - BOS', place: '1.12', notes: 'Huiswerk:\nopgave 4, 5', deleted: false });
});

test('zomertijd: UTC +2, en TZID wordt gerespecteerd', () => {
  const r = rows(cal(['UID:a', 'DTSTART:20261009T063000Z', 'DTEND:20261009T071500Z', 'SUMMARY:Engels'],
    ['UID:b', 'DTSTART;TZID=Europe/Amsterdam:20261009T100000', 'DTEND;TZID=Europe/Amsterdam:20261009T105000', 'SUMMARY:Duits'],
    ['UID:c', 'DTSTART;TZID=Europe/London:20261009T100000', 'DURATION:PT45M', 'SUMMARY:Londen'],
    ['UID:d', 'DTSTART;TZID="W. Europe Standard Time":20261009T120000', 'DTEND;TZID="W. Europe Standard Time":20261009T123000', 'SUMMARY:Outlook']));
  const by = Object.fromEntries(r.map(x => [x.external_id, x]));
  assert.equal(by.a.start_time, '08:30'); assert.equal(by.a.end_time, '09:15');
  assert.equal(by.b.start_time, '10:00'); assert.equal(by.b.end_time, '10:50');
  assert.equal(by.c.start_time, '11:00', 'Londen is een uur eerder'); assert.equal(by.c.end_time, '11:45');
  assert.equal(by.d.start_time, '12:00', 'Windows-naam van de tijdzone');
});

test('nacht van de omschakeling naar wintertijd (25 okt 2026)', () => {
  const r = rows(cal(['UID:x', 'DTSTART:20261025T013000Z', 'DTEND:20261025T020000Z', 'SUMMARY:Nacht']));
  assert.equal(r[0].start_time, '02:30'); assert.equal(r[0].end_time, '03:00');
});

test('hele dag en meerdaags; afgelast = verwijderd; zonder titel', () => {
  const r = rows(cal(['UID:dag', 'DTSTART;VALUE=DATE:20261124', 'DTEND;VALUE=DATE:20261125', 'SUMMARY:Studiedag'],
    ['UID:kamp', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261204', 'SUMMARY:Kamp'],
    ['UID:weg', 'DTSTART:20261126T080000Z', 'DTEND:20261126T090000Z', 'SUMMARY:Gym', 'STATUS:CANCELLED'],
    ['UID:leeg', 'DTSTART:20261127T080000Z']));
  const by = Object.fromEntries(r.map(x => [x.external_id, x]));
  assert.equal(by.dag.start_time, ''); assert.equal(by.dag.on_date, '2026-11-24');
  assert.deepEqual(r.filter(x => x.title === 'Kamp').map(x => x.on_date), ['2026-12-01', '2026-12-02', '2026-12-03']);
  assert.equal(by.weg.deleted, true);
  assert.equal(by.leeg.title, '(zonder titel)'); assert.equal(by.leeg.end_time, '');
});

test('alleen binnen het venster; regels die doorlopen (vouwen) en VALARM', () => {
  const text = cal(['UID:oud', 'DTSTART:20260101T080000Z', 'SUMMARY:Oud'],
    ['UID:lang', 'DTSTART:20261110T080000Z', 'SUMMARY:Lange', ' titel', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:Niet deze', 'END:VALARM']);
  const r = rows(text);
  assert.equal(r.length, 1); assert.equal(r[0].title, 'Langetitel'); assert.equal(r[0].notes, '');
});

test('herhaling: wekelijks met BYDAY, UNTIL, EXDATE en een verplaatste keer', () => {
  const text = cal(['UID:zwem', 'DTSTART;TZID=Europe/Amsterdam:20261005T160000', 'DTEND;TZID=Europe/Amsterdam:20261005T170000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261031T230000Z', 'EXDATE;TZID=Europe/Amsterdam:20261014T160000', 'SUMMARY:Zwemmen'],
    ['UID:zwem', 'RECURRENCE-ID;TZID=Europe/Amsterdam:20261019T160000', 'DTSTART;TZID=Europe/Amsterdam:20261019T180000', 'DTEND;TZID=Europe/Amsterdam:20261019T190000', 'SUMMARY:Zwemmen (later)']);
  const r = rows(text).sort((a, b) => a.on_date.localeCompare(b.on_date));
  assert.deepEqual(r.map(x => x.on_date), ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28']);
  assert.ok(r.every(x => x.start_time === (x.on_date === '2026-10-19' ? '18:00' : '16:00')), 'ook na de wintertijd 16:00; 19 okt verplaatst');
  assert.equal(new Set(r.map(x => x.external_id)).size, r.length, 'elke keer een eigen sleutel');
});

test('herhaling: dagelijks met COUNT; maandelijks wordt overgeslagen', () => {
  const { rows: r, skipped } = toAgendaRows(parseICal(cal(['UID:d', 'DTSTART:20261102T070000Z', 'RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3', 'SUMMARY:Om de dag'],
    ['UID:m', 'DTSTART:20261102T070000Z', 'RRULE:FREQ=MONTHLY', 'SUMMARY:Maandelijks'])).events, win);
  assert.deepEqual(r.map(x => x.on_date), ['2026-11-02', '2026-11-04', '2026-11-06']);
  assert.equal(skipped, 1);
});

test('opnieuw ophalen geeft dezelfde sleutels; geen agenda = geen VCALENDAR', () => {
  const text = cal(['UID:1', 'DTSTART:20261123T073000Z', 'SUMMARY:A'], ['UID:2', 'DTSTART:20261124T073000Z', 'SUMMARY:B']);
  assert.deepEqual(rows(text).map(x => x.external_id), rows(text).map(x => x.external_id));
  assert.equal(parseICal('<html>Inloggen</html>').calendar, false);
  assert.equal(parseICal(text).calendar, true);
});

test('link opschonen: webcal wordt https, geen interne adressen', () => {
  assert.equal(cleanUrl('webcal://school.magister.net/api/ical/abc123').url, 'https://school.magister.net/api/ical/abc123');
  assert.equal(cleanUrl('webcal://school.magister.net/api/ical/abc123').hint, 'school.magister.net …c123');
  assert.ok(cleanUrl('http://example.com/a.ics').error);
  assert.ok(cleanUrl('https://127.0.0.1/a.ics').error);
  assert.ok(cleanUrl('https://localhost/a.ics').error);
  assert.ok(cleanUrl('geen link').error);
  assert.equal(cleanUrl('http://host.docker.internal:8765/a.ics', { allowHttp: true }).url, 'http://host.docker.internal:8765/a.ics');
});
