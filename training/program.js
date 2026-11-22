// Training — programmalogica (zonder scherm, dus ook te testen met node --test).
//
// Voortgang per programma en per account:
//   { v: 1,
//     settings: { days: [1, 3, 5], u: '2026-11-22T10:00:00.000Z' },   // vaste trainingsdagen (0 = zondag … 6 = zaterdag)
//     resetAt: null | iso-tijd,                                         // alles van vóór dit moment telt niet meer
//     log: [ { id, les, d: 'jjjj-mm-dd', bonus, manual?, at: iso-tijd } ] }
//
// - Een les is "klaar" zodra er een sessie van in de log staat. Lessen gaan op volgorde; de volgende les is de
//   eerste die nog niet klaar is.
// - Planning: de volgende les valt op de eerstvolgende trainingsdag (vandaag als je vandaag nog niet hebt getraind),
//   de lessen daarna op de trainingsdagen erna. Een gemiste dag schuift alles door, zonder strafpunten.
// - Bonustraining: een sessie op een dag die geen trainingsdag is. Die telt gewoon mee (je loopt dan voor op schema).
// - Samenvoegen (sync tussen telefoons): log = vereniging op id, settings = nieuwste wint, resetAt = laatste.

export const DSH = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
export const DAYNAMES = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MON = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // maandag eerst

/* ---------- datums (lokale tijd, nooit toISOString voor een dag) ---------- */
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const dow = s => pd(s).getDay();
export const weekStart = s => addDays(s, -((dow(s) + 6) % 7));
export const today = () => ymd(new Date());
export const fmtShort = s => { const d = pd(s); return `${DSH[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- voortgang ---------- */
export function emptyProgress() { return { v: 1, settings: { days: [], u: null }, resetAt: null, log: [] }; }

export function normalize(p) {
  const e = emptyProgress();
  if (!p || typeof p !== 'object') return e;
  const s = p.settings && typeof p.settings === 'object' ? p.settings : {};
  const days = Array.isArray(s.days) ? [...new Set(s.days.map(Number).filter(n => n >= 0 && n <= 6))].sort((a, b) => a - b) : [];
  const log = Array.isArray(p.log) ? p.log.filter(x => x && x.id && x.les >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(x.d)) : [];
  const settings = { days, u: s.u || null };
  // Circuit (Bio-circuit): eigen lijst toestellen in vaste volgorde.
  if (Array.isArray(s.stations)) settings.stations = s.stations.filter(x => x && x.id && x.n).map(x => ({ id: String(x.id), n: String(x.n) }));
  return { v: 1, settings, resetAt: p.resetAt || null, log: activeLog(log, p.resetAt) };
}
const activeLog = (log, resetAt) => (resetAt ? log.filter(x => (x.at || '') > resetAt) : log)
  .slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.at || '') < (b.at || '') ? -1 : 1));

export const hasSchedule = p => p.settings.days.length > 0;
export const isTrainingDay = (p, d) => p.settings.days.includes(dow(d));

// Les → datum waarop hij voor het eerst klaar was.
export function doneMap(p) {
  const m = {};
  for (const x of p.log) if (!m[x.les]) m[x.les] = x.d;
  return m;
}
export const doneCount = (p, total) => Object.keys(doneMap(p)).filter(n => n <= total).length;
export function nextLesson(p, total) {
  const m = doneMap(p);
  for (let i = 1; i <= total; i++) if (!m[i]) return i;
  return 0;
}
export const sessionsOn = (p, d) => p.log.filter(x => x.d === d);

// Is een sessie op deze dag een bonustraining?
export const isBonusDay = (p, d) => hasSchedule(p) && !isTrainingDay(p, d);

// Eerstvolgende trainingsdag vanaf `from` (inclusief), of null zonder schema.
export function nextTrainingDay(p, from) {
  if (!hasSchedule(p)) return null;
  for (let i = 0; i < 7; i++) { const d = addDays(from, i); if (isTrainingDay(p, d)) return d; }
  return null;
}

// Planning van de lessen die nog open staan: [{ les, d }].
export function schedule(p, total, now = today()) {
  const out = [];
  let les = nextLesson(p, total);
  if (!les || !hasSchedule(p)) return out;
  const m = doneMap(p);
  // Vandaag al getraind? Dan begint de planning morgen.
  let d = nextTrainingDay(p, sessionsOn(p, now).length ? addDays(now, 1) : now);
  for (; les <= total; les++) {
    if (m[les]) continue;
    out.push({ les, d });
    d = nextTrainingDay(p, addDays(d, 1));
  }
  return out;
}

// Trainingen op rij: aaneengesloten trainingsdagen (terug vanaf vandaag) waarop getraind is.
// Vandaag telt pas mee als er al getraind is; andere dagen (bonus) breken de reeks niet.
export function streak(p, now = today()) {
  if (!hasSchedule(p) || !p.log.length) return 0;
  const trained = new Set(p.log.map(x => x.d)), first = p.log[0].d;
  let c = 0, d = now;
  if (isTrainingDay(p, d) && !trained.has(d)) d = addDays(d, -1);
  for (let i = 0; i < 800 && d >= first; i++, d = addDays(d, -1)) {
    if (!isTrainingDay(p, d)) continue;
    if (trained.has(d)) c++; else break;
  }
  return c;
}

// Deze week: { done: trainingen deze week (incl. bonus), planned: aantal trainingsdagen }.
export function thisWeek(p, now = today()) {
  const ws = weekStart(now), we = addDays(ws, 6);
  return { done: new Set(p.log.filter(x => x.d >= ws && x.d <= we).map(x => x.d)).size, planned: p.settings.days.length };
}

export const bonusCount = p => p.log.filter(x => x.bonus).length;

// Sessie vastleggen (ook "gedaan zonder de app" met manual = true). Geeft de nieuwe log-regel terug.
export function record(p, les, d = today(), manual = false) {
  const x = { id: uid(), les, d, bonus: isBonusDay(p, d), at: new Date().toISOString() };
  if (manual) x.manual = true;
  p.log.push(x);
  p.log = activeLog(p.log, p.resetAt);
  return x;
}

export function setDays(p, days) {
  p.settings = { ...p.settings, days: [...new Set(days)].sort((a, b) => a - b), u: new Date().toISOString() };
}

export function reset(p) { p.resetAt = new Date().toISOString(); p.log = []; }

// Twee versies samenvoegen (telefoon + server). Volgorde maakt niet uit.
export function merge(a, b) {
  a = normalize(a); b = normalize(b);
  const resetAt = [a.resetAt, b.resetAt].filter(Boolean).sort().pop() || null;
  // Dezelfde sessie aan twee kanten (bijv. later gewichten ingevuld): de laatst gewijzigde wint (u, anders at).
  const byId = new Map(), ver = x => x.u || x.at || '';
  for (const x of [...a.log, ...b.log]) { const y = byId.get(x.id); if (!y || ver(x) >= ver(y)) byId.set(x.id, x); }
  const settings = (a.settings.u || '') >= (b.settings.u || '') ? a.settings : b.settings;
  return { v: 1, settings, resetAt, log: activeLog([...byId.values()], resetAt) };
}

export const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

/* ---------- circuit: steeds dezelfde training op vaste dagen (Bio-circuit) ---------- */
// Geen genummerde lessen: elke sessie krijgt gewoon het volgende volgnummer.
export const sessionCount = p => new Set(p.log.map(x => x.id)).size;
export const nextSessionNo = p => p.log.reduce((m, x) => Math.max(m, x.les), 0) + 1;
// Laatst genoteerde gewicht per toestel: { toestel-id: { w, d } }.
export function lastWeights(p) {
  const m = {};
  for (const x of p.log) for (const [id, w] of Object.entries(x.w || {})) if (w !== '' && w != null) m[id] = { w, d: x.d };
  return m;
}
// Eerstvolgende geplande circuittraining: vandaag als je vandaag nog niet hebt getraind, anders vanaf morgen.
export const nextCircuitDay = (p, now = today()) => nextTrainingDay(p, sessionsOn(p, now).length ? addDays(now, 1) : now);
export function circuitStatus(p, now = today()) {
  const n = sessionCount(p);
  if (!hasSchedule(p)) return { line: 'Kies je trainingsdagen', sub: n ? `${n} ${n === 1 ? 'training' : 'trainingen'}` : '' };
  const w = thisWeek(p, now), sub = `${n} ${n === 1 ? 'training' : 'trainingen'} · deze week ${w.done} van ${w.planned}`;
  const trainedToday = sessionsOn(p, now).length > 0, next = nextCircuitDay(p, now);
  if (isTrainingDay(p, now) && !trainedToday) return { line: 'Vandaag trainen', sub, today: true };
  if (trainedToday) return { line: `Vandaag gedaan · volgende ${fmtShort(next)}`, sub };
  return { line: `Volgende training ${fmtShort(next)}`, sub, bonus: true };
}

// Korte status voor de tegel op het startscherm en de kop van de app.
export function status(p, total, now = today()) {
  const n = doneCount(p, total), les = nextLesson(p, total);
  if (!hasSchedule(p)) return { line: n ? `Les ${les || total} van ${total}` : 'Kies je trainingsdagen', sub: `${n}/${total} lessen klaar` };
  if (!les) return { line: 'Programma voltooid 🎉', sub: `${total}/${total} lessen klaar` };
  const w = thisWeek(p, now), sub = `${n}/${total} lessen · deze week ${w.done} van ${w.planned}`;
  const trainedToday = sessionsOn(p, now).length > 0, plan = schedule(p, total, now)[0];
  if (isTrainingDay(p, now) && !trainedToday) return { line: `Vandaag: les ${les}`, sub, today: true };
  if (trainedToday) return { line: `Vandaag gedaan · les ${les} op ${fmtShort(plan.d)}`, sub };
  return { line: `Les ${les} op ${fmtShort(plan.d)}`, sub, bonus: true };
}
