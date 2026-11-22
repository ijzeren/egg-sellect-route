// Agenda — logica zonder scherm (ook te testen met node --test).
//
// Personen (agenda_people): { id, name, color, user_id? }   kinderen zonder account kan ook (user_id leeg)
// Afspraken (agenda_items):
//   { id, person_ids: [..], kind: 'lesson'|'school'|'sport'|'match'|'other', title, place, notes,
//     start: 'HH:MM', end: 'HH:MM' | '', meet: 'HH:MM' | '' (verzamelen, bij wedstrijden),
//     date: 'jjjj-mm-dd' (één keer)  óf  days: [0-6] (elke week, 0 = zondag) met from/until (bijv. het schooljaar),
//     weeks: '' | 'odd' | 'even' (alleen oneven/even weken), skip: ['jjjj-mm-dd', …] (gaat deze keer niet door) }
// Huiswerk (agenda_tasks): { id, person_id, kind: 'homework'|'test', subject, text, due: 'jjjj-mm-dd', done }
import { ymd, pd, addDays, dow, weekStart, today, DSH, DAYNAMES, WEEK_ORDER, fmtShort } from '../training/program.js';

export { ymd, pd, addDays, dow, weekStart, today, DSH, DAYNAMES, WEEK_ORDER, fmtShort };
export const KINDS = [['lesson', 'Les', '📘'], ['school', 'School', '🏫'], ['sport', 'Training', '⚽'], ['match', 'Wedstrijd', '🏆'], ['other', 'Anders', '📌']];
export const kindOf = k => KINDS.find(x => x[0] === k) || KINDS[4];
export const COLORS = ['#0A84FF', '#FF375F', '#30D158', '#FF9F0A', '#BF5AF2', '#64D2FF', '#AC8E68'];

// ISO-weeknummer (week met de eerste donderdag van het jaar = week 1).
export function isoWeek(s) {
  const d = pd(s), t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

export function occursOn(it, d) {
  if (!it || it.deleted) return false;
  if (it.date) return it.date === d;
  if (!Array.isArray(it.days) || !it.days.includes(dow(d))) return false;
  if (it.from && d < it.from) return false;
  if (it.until && d > it.until) return false;
  if ((it.skip || []).includes(d)) return false;
  if (it.weeks === 'odd' && isoWeek(d) % 2 !== 1) return false;
  if (it.weeks === 'even' && isoWeek(d) % 2 !== 0) return false;
  return true;
}
const forPerson = (it, pid) => !pid || (it.person_ids || []).includes(pid);
const byTime = (a, b) => (a.meet || a.start || '99').localeCompare(b.meet || b.start || '99') || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title, 'nl');

// Afspraken op een dag (voor één persoon, of iedereen), op tijd.
export const dayItems = (items, d, pid) => (items || []).filter(it => forPerson(it, pid) && occursOn(it, d)).sort(byTime);
// Volgende keer dat een afspraak (of een vak) plaatsvindt, vanaf `from` (inclusief), max. een half jaar vooruit.
export function nextDate(items, from, pred) {
  for (let i = 0; i < 183; i++) { const d = addDays(from, i); if ((items || []).some(it => pred(it) && occursOn(it, d))) return d; }
  return null;
}
// Eerstvolgende les van een vak voor deze persoon na vandaag: handig als inleverdatum van huiswerk.
export const nextLesson = (items, pid, subject, now = today()) => {
  const s = String(subject || '').trim().toLowerCase();
  return s ? nextDate(items, addDays(now, 1), it => it.kind === 'lesson' && forPerson(it, pid) && it.title.trim().toLowerCase() === s) : null;
};
export const subjects = (items, pid) => [...new Set((items || []).filter(it => it.kind === 'lesson' && !it.deleted && forPerson(it, pid)).map(it => it.title.trim()))].sort((a, b) => a.localeCompare(b, 'nl'));

// Huiswerk: open taken (te laat eerst, dan op datum), en wat er vandaag/morgen af moet.
export function openTasks(tasks, pid) {
  return (tasks || []).filter(t => !t.deleted && !t.done && (!pid || t.person_id === pid)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || (a.kind === 'test' ? -1 : 1));
}
export const dueSoon = (tasks, pid, now = today()) => openTasks(tasks, pid).filter(t => t.due && t.due <= addDays(now, 1));
export function dueLabel(due, now = today()) {
  if (!due) return '';
  if (due < now) return 'te laat';
  if (due === now) return 'vandaag';
  if (due === addDays(now, 1)) return 'morgen';
  return fmtShort(due);
}

// Rooster plakken: één les per regel, bijv. "8:30-9:20 Wiskunde, lokaal 12" of "8.30 - 9.20 Engels".
// → [{ start, end, title, place }] en de regels die niet herkend werden.
export function parseTimetable(text) {
  const out = [], bad = [];
  const t = s => { const [h, m] = s.replace('.', ':').split(':').map(Number); return h <= 23 && m <= 59 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null; };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const m = line.match(/^(\d{1,2}[:.]\d{2})\s*(?:[-–]\s*(\d{1,2}[:.]\d{2}))?\s+(.+)$/);
    const start = m && t(m[1]), end = m && m[2] ? t(m[2]) : '';
    if (!m || !start || end === null) { bad.push(line); continue; }
    const [title, ...place] = m[3].split(',');
    out.push({ start, end, title: title.trim(), place: place.join(',').trim() });
  }
  return { lessons: out, bad };
}

// Invoer opschonen voor de database.
const time = v => (/^\d{2}:\d{2}$/.test(v || '') ? v : '');
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
export function cleanItem(x) {
  const once = !!date(x.date);
  return {
    kind: KINDS.some(k => k[0] === x.kind) ? x.kind : 'other',
    title: String(x.title || '').trim().slice(0, 80),
    place: String(x.place || '').trim().slice(0, 120),
    notes: String(x.notes || '').trim().slice(0, 1000),
    person_ids: [...new Set(x.person_ids || [])],
    start: time(x.start), end: time(x.end), meet: time(x.meet),
    date: once ? x.date : null,
    days: once ? [] : [...new Set((x.days || []).map(Number).filter(n => n >= 0 && n <= 6))].sort(),
    from: once ? null : date(x.from), until: once ? null : date(x.until),
    weeks: !once && ['odd', 'even'].includes(x.weeks) ? x.weeks : '',
    skip: once ? [] : [...new Set((x.skip || []).filter(date))].sort(),
  };
}
export function validItem(c) {
  if (!c.title) return 'Geef de afspraak een naam.';
  if (!c.person_ids.length) return 'Kies voor wie het is.';
  if (!c.date && !c.days.length) return 'Kies een datum of de dagen waarop het elke week is.';
  if (c.end && c.start && c.end < c.start) return 'De eindtijd ligt voor de begintijd.';
  return '';
}
// Schooljaar waar een datum in valt: 1 aug t/m 31 jul (zomervakantie verschilt per regio; aan te passen per afspraak).
export function schoolYear(now = today()) {
  const y = +now.slice(0, 4), m = +now.slice(5, 7), start = m >= 8 ? y : y - 1;
  return { from: `${start}-08-01`, until: `${start + 1}-07-31` };
}
