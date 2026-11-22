// Agendalinks (iCal) lezen en omzetten naar afspraken voor de Agenda.
// Gedeeld door de Edge Function `integrations` (Deno) en tests/ical.test.mjs (node --test); geen afhankelijkheden.
//
//   parseICal(text)                      → { events: [...], calendar: true|false }
//   toAgendaRows(events, { from, until, kind, tz })
//                                        → { rows: [{ external_id, on_date, start_time, end_time, title, place, notes, deleted }], skipped }
//
// - Tijden komen in de agenda als lokale tijd in Nederland (Europe/Amsterdam), ook als de link UTC (…Z) of een andere
//   tijdzone (TZID) gebruikt. Zomer- en wintertijd gaan via Intl, dus zonder eigen tabellen.
// - Een afspraak voor een hele dag (VALUE=DATE) krijgt geen tijd; een meerdaagse komt op elke dag (max. 31).
// - Herhalingen (RRULE): DAILY en WEEKLY (INTERVAL, BYDAY, UNTIL, COUNT, EXDATE) worden uitgerold binnen het venster.
//   Andere herhalingen (maandelijks, jaarlijks) tellen als overgeslagen; Magister levert losse lessen.
// - Gewijzigde losse keer van een herhaling (RECURRENCE-ID) vervangt die keer. STATUS:CANCELLED → deleted.
// - external_id = UID (+ datum/tijd van de keer bij herhalingen): vast, dus opnieuw ophalen maakt niets dubbel.

export const TZ = 'Europe/Amsterdam';
const WIN_TZ = { 'W. Europe Standard Time': 'Europe/Amsterdam', 'Romance Standard Time': 'Europe/Brussels', 'GMT Standard Time': 'Europe/London', 'UTC': 'UTC' };
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const pad = n => String(n).padStart(2, '0');

/* ---------- regels en eigenschappen ---------- */
function unfold(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}
// "DTSTART;TZID=Europe/Amsterdam:20261123T083000" → { name, params, value }
function prop(line) {
  let i = 0, q = false;
  for (; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
  if (i >= line.length) return null;
  const [name, ...ps] = line.slice(0, i).split(';');
  const params = {};
  for (const p of ps) { const j = p.indexOf('='); if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, ''); }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}
const unescape = v => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/* ---------- tijd ---------- */
const validZone = z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; } };
const zoneOf = tzid => { if (!tzid) return null; const z = WIN_TZ[tzid] || tzid.replace(/^\/[^/]*\//, ''); return validZone(z) ? z : TZ; };
// Wandkloktijd in een tijdzone → moment (ms sinds 1970).
function offsetAt(ms, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
}
export function zonedToMs(y, mo, d, h, mi, zone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - offsetAt(guess, zone);
  ms = guess - offsetAt(ms, zone); // tweede ronde: klopt ook vlak bij de omschakeling van zomer- naar wintertijd
  return ms;
}
// Moment → { date: 'jjjj-mm-dd', time: 'HH:MM' } in een tijdzone.
export function localParts(ms, zone = TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
// iCal-datum(tijd) → { allDay, date, ms?, wall: {y,mo,d,h,mi}, zone }
function parseWhen(p) {
  if (!p) return null;
  const v = p.value.trim(), m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  const date = `${y}-${mo}-${d}`;
  if (h === undefined || p.params.VALUE === 'DATE') return { allDay: true, date };
  const zone = z ? 'UTC' : zoneOf(p.params.TZID) || TZ; // zonder tijdzone ("zwevend"): Nederlandse tijd
  const wall = { y: +y, mo: +mo, d: +d, h: +h, mi: +mi };
  return { allDay: false, date, zone, wall, ms: zonedToMs(wall.y, wall.mo, wall.d, wall.h, wall.mi, zone) };
}
const parseDuration = v => { // PT1H30M, P1D
  const m = String(v || '').match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  return m ? ((+(m[1] || 0) * 7 + +(m[2] || 0)) * 86400 + +(m[3] || 0) * 3600 + +(m[4] || 0) * 60 + +(m[5] || 0)) * 1000 : 0;
};
const addDaysStr = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowStr = s => new Date(`${s}T12:00:00Z`).getUTCDay();

/* ---------- lezen ---------- */
export function parseICal(text) {
  const lines = unfold(text), events = [];
  let cur = null, depth = 0, calendar = false;
  for (const line of lines) {
    if (/^BEGIN:VCALENDAR/i.test(line)) calendar = true;
    if (/^BEGIN:VEVENT/i.test(line)) { cur = { exdates: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; } // bijv. VALARM: overslaan
    if (/^END:/i.test(line) && depth > 0) { depth--; continue; }
    if (/^END:VEVENT/i.test(line)) { events.push(finish(cur)); cur = null; continue; }
    if (depth > 0) continue;
    const p = prop(line); if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break;
      case 'SUMMARY': cur.title = unescape(p.value).trim(); break;
      case 'LOCATION': cur.place = unescape(p.value).trim(); break;
      case 'DESCRIPTION': cur.notes = unescape(p.value).trim(); break;
      case 'STATUS': cur.status = p.value.trim().toUpperCase(); break;
      case 'DTSTART': cur.start = parseWhen(p); break;
      case 'DTEND': cur.end = parseWhen(p); break;
      case 'DURATION': cur.duration = parseDuration(p.value.trim()); break;
      case 'RRULE': cur.rrule = Object.fromEntries(p.value.split(';').map(x => x.split('=')).filter(x => x.length === 2).map(([k, v]) => [k.toUpperCase(), v])); break;
      case 'EXDATE': for (const v of p.value.split(',')) { const w = parseWhen({ params: p.params, value: v }); if (w) cur.exdates.push(w); } break;
      case 'RECURRENCE-ID': cur.recurrence = parseWhen(p); break;
    }
  }
  return { events: events.filter(e => e.uid && e.start), calendar };
}
function finish(e) {
  if (e.start && !e.end && !e.start.allDay) e.end = e.duration ? { ...e.start, ms: e.start.ms + e.duration } : null;
  if (e.start && !e.end && e.start.allDay) e.end = { allDay: true, date: addDaysStr(e.start.date, Math.max(1, Math.round((e.duration || 0) / 864e5))) };
  return e;
}

/* ---------- herhalingen ---------- */
// Alle keren (als wandkloktijd in de tijdzone van de afspraak) binnen [from, until]; null = deze herhaling kennen we niet.
function occurrences(e, from, until, max = 400) {
  const r = e.rrule, freq = (r.FREQ || '').toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return null;
  const interval = Math.max(1, +r.INTERVAL || 1), count = +r.COUNT || 0;
  const untilW = r.UNTIL ? parseWhen({ params: {}, value: r.UNTIL }) : null;
  const untilDate = untilW ? (untilW.allDay ? untilW.date : localParts(untilW.ms, e.start.zone || TZ).date) : null;
  const byday = freq === 'WEEKLY' ? (r.BYDAY ? r.BYDAY.split(',').map(x => DAYS[x.slice(-2).toUpperCase()]).filter(x => x !== undefined) : [dowStr(e.start.date)]) : null;
  const ex = new Set(e.exdates.map(w => w.allDay ? w.date : `${localParts(w.ms, e.start.zone || TZ).date}`));
  const out = [];
  const weekOf = s => { const n = (dowStr(s) + 6) % 7; return addDaysStr(s, -n); };
  const firstWeek = weekOf(e.start.date);
  let n = 0;
  for (let i = 0; i < 3660 && out.length < max; i++) { // hooguit 10 jaar vooruit kijken
    const d = addDaysStr(e.start.date, i);
    if (untilDate && d > untilDate) break;
    if (d > until) break;
    let hit;
    if (freq === 'DAILY') hit = i % interval === 0;
    else { const weeks = Math.round((new Date(`${weekOf(d)}T12:00:00Z`) - new Date(`${firstWeek}T12:00:00Z`)) / (7 * 864e5)); hit = weeks % interval === 0 && byday.includes(dowStr(d)); }
    if (!hit) continue;
    n++;
    if (count && n > count) break;
    if (!ex.has(d) && d >= from) out.push(d);
  }
  return out;
}

/* ---------- omzetten naar afspraken ---------- */
const clip = (s, n) => String(s || '').replace(/\s+\n/g, '\n').trim().slice(0, n);
export function toAgendaRows(events, { from, until, max = 2000 } = {}) {
  const rows = new Map(); let skipped = 0;
  const put = r => { if (rows.size < max || rows.has(r.external_id)) rows.set(r.external_id, r); };
  // één keer op een dag: moment → lokale datum en tijden in Nederland
  const timed = (e, startMs, endMs, id) => {
    const s = localParts(startMs), en = endMs ? localParts(endMs) : null;
    if (s.date < from || s.date > until) return;
    put(base(e, id, s.date, s.time, en && en.date === s.date ? en.time : en ? '23:59' : ''));
  };
  const allDay = (e, date, endDate, id) => {
    const last = endDate && endDate > date ? addDaysStr(endDate, -1) : date;
    for (let d = date, i = 0; d <= last && i < 31; d = addDaysStr(d, 1), i++) if (d >= from && d <= until) put(base(e, last > date ? `${id}#${d}` : id, d, '', ''));
  };
  const overrides = events.filter(e => e.recurrence);
  const overrideKey = (uid, w) => `${uid}@${w.allDay ? w.date : w.ms}`;
  const replaced = new Set(overrides.map(e => overrideKey(e.uid, e.recurrence)));
  for (const e of events) {
    if (e.recurrence) { // gewijzigde keer van een herhaling
      const id = `${e.uid}@${e.recurrence.allDay ? e.recurrence.date : new Date(e.recurrence.ms).toISOString()}`;
      if (e.start.allDay) allDay(e, e.start.date, e.end && e.end.date, id); else timed(e, e.start.ms, e.end && e.end.ms, id);
      continue;
    }
    if (e.rrule) {
      const days = occurrences(e, from, until);
      if (!days) { skipped++; continue; }
      const durMs = e.end && !e.start.allDay ? e.end.ms - e.start.ms : 0;
      for (const d of days) {
        if (e.start.allDay) {
          const id = `${e.uid}@${d}`;
          if (!replaced.has(overrideKey(e.uid, { allDay: true, date: d }))) allDay(e, d, null, id);
          continue;
        }
        const [y, mo, dd] = d.split('-').map(Number), w = e.start.wall;
        const ms = zonedToMs(y, mo, dd, w.h, w.mi, e.start.zone);
        if (replaced.has(overrideKey(e.uid, { ms }))) continue;
        timed(e, ms, durMs ? ms + durMs : null, `${e.uid}@${new Date(ms).toISOString()}`);
      }
      continue;
    }
    if (e.start.allDay) allDay(e, e.start.date, e.end && e.end.date, e.uid);
    else timed(e, e.start.ms, e.end && e.end.ms, e.uid);
  }
  return { rows: [...rows.values()], skipped };
}
function base(e, id, date, start, end) {
  return {
    external_id: id.slice(0, 500),
    on_date: date, start_time: start, end_time: end,
    title: clip(e.title, 80) || '(zonder titel)',
    place: clip(e.place, 120), notes: clip(e.notes, 1000),
    deleted: e.status === 'CANCELLED',
  };
}

// Adres van een agendalink opschonen: webcal:// → https://; alleen https (lokaal testen: http als dat aan staat).
export function cleanUrl(raw, { allowHttp = false } = {}) {
  let u = String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://');
  let url;
  try { url = new URL(u); } catch { return { error: 'Dit is geen geldige link. Plak het hele adres (begint met https:// of webcal://).' }; }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) return { error: 'De link moet beginnen met https:// of webcal://.' };
  const host = url.hostname.toLowerCase();
  if (!allowHttp && (host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':') || host.endsWith('.internal') || host.endsWith('.local'))) return { error: 'Deze link kan de app niet ophalen.' };
  if (u.length > 2000) return { error: 'De link is te lang.' };
  return { url: url.toString(), hint: `${host} …${url.toString().slice(-4)}` };
}
