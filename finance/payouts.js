// Uitbetalingen van Booking.com en Airbnb herkennen en koppelen aan boekingen in Verhuur. Zonder scherm, testbaar.
// Gebruikt door finance/app.js (koppelen) en rentals/app.js (wat is er nog niet uitbetaald).
//   - een uitbetaling = bijschrijving met "Airbnb" of "Booking.com" in naam of omschrijving
//   - voorstel: 1) boekingsnummer in de omschrijving, 2) één boeking met precies het verwachte bedrag,
//     3) een paar boekingen die samen precies het bedrag geven (Booking.com betaalt vaak in één keer uit)
//   - het verwachte bedrag per boeking is de uitbetaling die in Verhuur bij de boeking staat
// Bedragen in centen. Datums als 'jjjj-mm-dd'.

export const PLATFORMS = [['airbnb', 'Airbnb'], ['booking', 'Booking.com']];
export const platformName = p => (PLATFORMS.find(x => x[0] === p) || [p, p])[1];
const cents = x => (x === null || x === undefined || x === '' ? null : Math.round(Number(x) * 100));
const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
export const addDays = (s, n) => new Date((day(s) + n) * 864e5).toISOString().slice(0, 10);

// Van welk platform komt deze bijschrijving? '' = geen uitbetaling van een platform.
export function platformOf(t) {
  if (!t || !(Number(t.amount) > 0)) return '';
  const s = `${t.counterparty || ''} ${t.description || ''}`.toLowerCase();
  if (s.includes('airbnb')) return 'airbnb';
  if (/booking\s*\.?\s*com|bookingcom/.test(s)) return 'booking';
  return '';
}

// Wanneer komt het geld ongeveer binnen? Airbnb: een dag na aankomst. Booking.com: na vertrek (soms per maand).
export const expectedOn = b => (b.source === 'airbnb' ? addDays(b.arrival, 1) : b.source === 'booking' ? b.departure : b.arrival);
// Vanaf wanneer is het laat? Airbnb 5 dagen na aankomst, Booking.com 35 dagen na vertrek.
export const lateFrom = b => (b.source === 'airbnb' ? addDays(b.arrival, 5) : b.source === 'booking' ? addDays(b.departure, 35) : null);
const linkable = b => b && !b.deleted && b.status === 'booked' && b.source !== 'own';

// Wat is er al uitbetaald per boeking (centen), eventueel zonder één transactie (die we nu opnieuw koppelen).
export function paidByBooking(payouts, exceptTx = null) {
  const m = new Map();
  for (const p of payouts || []) if (p.transaction_id !== exceptTx || exceptTx === null) m.set(p.booking_id, (m.get(p.booking_id) || 0) + cents(p.amount));
  return m;
}

// Boekingen die bij deze bijschrijving kunnen horen, de meest waarschijnlijke eerst.
// all = ook boekingen buiten de periode rond de datum (voor "toon alle boekingen").
export function candidates(t, bookings, amounts, payouts, all = false) {
  const plat = platformOf(t), paid = paidByBooking(payouts, t.id), on = day(t.booked_on);
  const out = [];
  for (const b of bookings || []) {
    if (!linkable(b)) continue;
    const near = on >= day(b.arrival) - 30 && on <= day(b.departure) + 70;
    if (!all && !near) continue;
    const exp = cents(((amounts || {})[b.id] || {}).payout), done = paid.get(b.id) || 0;
    out.push({ booking: b, expectedC: exp, paidC: done, leftC: exp === null ? null : exp - done, same: !!plat && b.source === plat, near, dist: Math.abs(on - day(expectedOn(b))) });
  }
  return out.sort((x, y) => (y.same - x.same) || (y.near - x.near) || (x.dist - y.dist) || x.booking.arrival.localeCompare(y.booking.arrival));
}

const normRef = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Voorstel: { ids: [booking_id…], by: 'ref' | 'amount' | 'sum' } of null.
export function suggest(t, cands) {
  const txC = cents(t.amount), desc = normRef(`${t.description || ''} ${t.counterparty || ''}`);
  if (!(txC > 0)) return null;
  // 1. boekingsnummer in de omschrijving
  const byRef = cands.filter(c => normRef(c.booking.external_id).length >= 4 && desc.includes(normRef(c.booking.external_id)));
  if (byRef.length) return { ids: byRef.map(c => c.booking.id), by: 'ref' };
  // alleen boekingen van hetzelfde platform (of: geen platform herkend), in de buurt, met een bekend en open bedrag
  const pool = cands.filter(c => (c.same || !platformOf(t)) && c.near && c.leftC !== null && c.leftC > 0).slice(0, 15);
  // 2. één boeking met precies dit bedrag
  const one = pool.find(c => Math.abs(c.leftC - txC) <= 1);
  if (one) return { ids: [one.booking.id], by: 'amount' };
  // 3. de kleinste combinatie die samen precies dit bedrag geeft
  const n = pool.length;
  for (let k = 2; k <= Math.min(n, 8); k++) {
    const pick = [];
    const walk = (start, sum) => {
      if (pick.length === k) return Math.abs(sum - txC) <= k ? pick.slice() : null;
      for (let i = start; i < n; i++) {
        if (sum + pool[i].leftC > txC + k) continue;
        pick.push(i); const r = walk(i + 1, sum + pool[i].leftC); pick.pop();
        if (r) return r;
      }
      return null;
    };
    const hit = walk(0, 0);
    if (hit) return { ids: hit.map(i => pool[i].booking.id), by: 'sum' };
  }
  return null;
}

// Het bedrag van de bijschrijving verdelen over de gekozen boekingen (centen, samen precies txC, elk minstens 1).
// Alle verwachte bedragen bekend: naar verhouding (klopt de som, dan precies het verwachte bedrag).
// Anders: bekende krijgen hun verwachte bedrag, de rest wordt gelijk verdeeld over de onbekende.
export function allocate(txC, expected) {
  const n = expected.length;
  if (!n || txC < n) return expected.map(() => 0);
  if (n === 1) return [txC];
  const known = expected.filter(e => e !== null && e > 0), split = (total, k) => Array.from({ length: k }, (_, i) => Math.floor(total / k) + (i < total % k ? 1 : 0));
  let out;
  if (known.length === n) {
    const sum = known.reduce((s, e) => s + e, 0);
    out = expected.map(e => Math.floor(e * txC / sum));
    let rest = txC - out.reduce((s, x) => s + x, 0);
    for (let i = 0; rest > 0; i = (i + 1) % n, rest--) out[i]++;
  } else {
    out = expected.map(e => (e !== null && e > 0 ? e : null));
    const used = out.reduce((s, x) => s + (x || 0), 0), unknown = out.filter(x => x === null).length;
    if (used + unknown > txC) return split(txC, n);
    const share = split(txC - used, unknown);
    out = out.map(x => (x === null ? share.shift() : x));
  }
  return out.some(x => x < 1) ? split(txC, n) : out;
}

// Platformboekingen waarvan het geld al binnen had moeten zijn en die nog aan geen uitbetaling hangen.
// Alleen het afgelopen jaar, zodat oude boekingen (van vóór Financiën) niet blijven staan.
export function unpaid(bookings, payouts, today) {
  const paid = paidByBooking(payouts);
  return (bookings || []).filter(b => linkable(b) && (b.source === 'airbnb' || b.source === 'booking') && !paid.get(b.id)
    && lateFrom(b) <= today && day(today) - day(lateFrom(b)) <= 365)
    .sort((a, b) => a.arrival.localeCompare(b.arrival));
}
