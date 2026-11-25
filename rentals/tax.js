// Verhuur — rekenwerk (testbaar, zonder scherm): nachten, toeristenbelasting (taxe de séjour) en de aangifte per maand.
//
// Taxe de séjour (CCVK, Vallée de Kaysersberg; zie docs/plan-rentals.md):
//   - geclassificeerd (sterren): vast bedrag per volwassene per nacht, inclusief de departementale toeslag
//   - niet geclassificeerd: percent van de prijs per persoon per nacht (prijs ÷ ALLE gasten, kinderen meegeteld),
//     hooguit `cap`, plus dept_percent toeslag; elk deel afgerond op centen (zoals de voorbeelden van de CCVK)
//   - maal het aantal volwassenen (kinderen zijn vrijgesteld) en het aantal nachten
// Regels per jaar staan op het huis (rental_houses.tax = { "2026": { percent, cap, dept_percent, fixed } });
// ontbreekt een jaar, dan gelden DEFAULT_TAX.

export const DEFAULT_TAX = Object.freeze({
  percent: 5, cap: 4.6, dept_percent: 10,
  fixed: Object.freeze({ 1: 0.88, 2: 1.1, 3: 1.76, 4: 2.75, 5: 3.63 }), // per volwassene per nacht, incl. toeslag
});

export const SOURCES = [
  ['booking', 'Booking.com'], ['airbnb', 'Airbnb'], ['direct', 'Direct'], ['own', 'Eigen gebruik'], ['other', 'Anders'],
];
export const STATUSES = [['booked', 'Geboekt'], ['option', 'Optie'], ['expected', 'Verwacht'], ['cancelled', 'Geannuleerd']];
export const sourceName = s => (SOURCES.find(x => x[0] === s) || [s, s])[1];
export const statusName = s => (STATUSES.find(x => x[0] === s) || [s, s])[1];
// Wie int de taxe standaard: platforms die de betaling doen, anders de verhuurder zelf; eigen gebruik niemand.
export const defaultTaxBy = source => source === 'booking' || source === 'airbnb' ? 'platform' : source === 'own' ? 'none' : 'host';

const pd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const ymd = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
export const nights = b => (b && b.arrival && b.departure ? Math.max(0, Math.round((pd(b.departure) - pd(b.arrival)) / 864e5)) : 0);
export const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
export const num = v => { if (v === null || v === undefined || v === '') return null; const x = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };

export function rulesFor(house, year) {
  const t = (house && house.tax && house.tax[String(year)]) || {};
  return { ...DEFAULT_TAX, ...t, fixed: { ...DEFAULT_TAX.fixed, ...(t.fixed || {}) } };
}

// Prijs per nacht van het verblijf (huur zonder schoonmaak, bedlinnen en belasting).
export function nightPrice(b, a) {
  if (!a) return null;
  const n = nights(b), np = num(a.night_price), acc = num(a.accommodation);
  if (acc !== null && n) return round2(acc / n);
  return np;
}

// Taxe per volwassene per nacht. stars = 1–5 of leeg (niet geclassificeerd); price = prijs per nacht; guests = alle gasten.
export function ratePerAdultNight(rules, stars, price, guests) {
  if (stars) return round2(rules.fixed[stars] || 0);
  if (!price || !guests) return null;
  const base = round2(Math.min((price / guests) * rules.percent / 100, rules.cap));
  return round2(base + round2(base * rules.dept_percent / 100));
}

// Verwachte taxe voor een verblijf: { rate, amount, nights, adults } of null als er iets ontbreekt.
export function touristTax(b, a, house) {
  if (!b || b.source === 'own' || b.tax_by === 'none') return null;
  const n = nights(b), rules = rulesFor(house, String(b.arrival).slice(0, 4));
  const rate = ratePerAdultNight(rules, house && house.stars, nightPrice(b, a), b.guests);
  if (rate === null || !n) return null;
  return { rate, nights: n, adults: b.adults || 0, amount: round2(rate * (b.adults || 0) * n) };
}

// Telt mee als verblijf (verhuur, niet geannuleerd, niet alleen een optie of verwachting).
export const isStay = b => b && !b.deleted && b.status === 'booked';
export const isRental = b => isStay(b) && b.source !== 'own';

// Aangifte voor een maand ('2026-11'): alle verhuurde verblijven die in die maand beginnen, in volgorde van aankomst.
// Een verblijf over twee maanden staat in de maand van aankomst (het portaal verdeelt de nachten zelf).
// toPay = taxe die de verhuurder zelf int en afdraagt (platforms dragen zelf af).
export function declaration(bookings, amounts, house, month) {
  const rows = bookings.filter(b => isRental(b) && b.house_id === house.id && String(b.arrival).slice(0, 7) === month)
    .sort((x, y) => x.arrival.localeCompare(y.arrival))
    .map(b => {
      const a = amounts[b.id] || null, t = touristTax(b, a, house), entered = a ? num(a.tourist_tax) : null;
      const tax = entered !== null ? entered : t ? t.amount : null;
      const issues = [];
      if (!b.guests) issues.push('aantal personen ontbreekt');
      // uit de oude spreadsheet: daar stond geen aantal volwassenen in (bij de import gelijk aan personen)
      if (b.import_key && b.adults === b.guests && /Volwassenen onbekend/.test(b.notes || '')) issues.push('volwassenen nakijken (bij de import gelijk aan personen)');
      if (!house.stars && nightPrice(b, a) === null) issues.push('prijs ontbreekt');
      if (t && entered !== null && Math.abs(entered - t.amount) > 0.05) issues.push(`taxe wijkt af van berekend (${t.amount.toFixed(2).replace('.', ',')})`);
      return {
        booking: b, nights: nights(b), guests: b.guests, adults: b.adults, children: Math.max(0, (b.guests || 0) - (b.adults || 0)),
        nightPrice: nightPrice(b, a), calc: t, tax, byPlatform: b.tax_by === 'platform', issues,
        endsLater: String(b.departure).slice(0, 7) !== month && b.departure !== `${nextMonth(month)}-01`,
      };
    });
  const toPay = round2(rows.filter(r => !r.byPlatform && r.tax !== null).reduce((s, r) => s + r.tax, 0));
  return { month, rows, toPay, missing: rows.filter(r => r.issues.length).length };
}

export const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
export const prevMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };

// Welke aangifte is aan de beurt? Elke maand vóór de 5e over de maand ervoor.
// done = lijst van aangegeven maanden ('2026-10'). → { month, deadline ('2026-12-05'), late, open }
//   t/m de 5e: vorige maand (deadline deze maand); daarna: vorige maand als die nog openstaat (te laat), anders deze maand.
export function declarationDue(today, done) {
  const cur = today.slice(0, 7), prev = prevMonth(cur), day = +today.slice(8, 10), has = m => done.includes(m);
  if (day <= 5) return { month: prev, deadline: `${cur}-05`, late: false, open: !has(prev) };
  if (!has(prev)) return { month: prev, deadline: `${cur}-05`, late: true, open: true };
  return { month: cur, deadline: `${nextMonth(cur)}-05`, late: false, open: !has(cur) };
}

// CSV voor op de computer (puntkomma en komma als decimaalteken, zoals Excel in NL/FR verwacht).
export function declarationCsv(d) {
  const f = x => (x === null || x === undefined ? '' : String(typeof x === 'number' ? x.toFixed(2).replace('.', ',') : x).replace(/[";\n]/g, ' '));
  const head = ['Geboekt bij', 'Van', 'Tot', 'Nachten', 'Personen', 'Volwassenen', 'Kinderen', 'Gem. nachtprijs', 'Taxe', 'Geïnd door'];
  const lines = d.rows.map(r => [sourceName(r.booking.source), r.booking.arrival, r.booking.departure, r.nights, r.guests, r.adults, r.children,
    r.nightPrice === null ? '' : f(r.nightPrice), r.tax === null ? '' : f(r.tax), r.byPlatform ? 'platform' : 'zelf'].join(';'));
  return [head.join(';'), ...lines].join('\n') + '\n';
}

// Overlapt dit verblijf met een ander actief verblijf in hetzelfde huis?
export function overlaps(b, bookings) {
  return bookings.filter(x => x.id !== b.id && x.house_id === b.house_id && !x.deleted && x.status !== 'cancelled'
    && x.arrival < b.departure && b.arrival < x.departure);
}

// Directe boeking: wat betaalt de gast? { rent, cleaning, linen, tax, total }
export function directTotal(b, a, house) {
  const n = nights(b), np = num(a && a.night_price), rent = np !== null ? round2(np * n) : num(a && a.accommodation);
  const t = touristTax(b, { ...(a || {}), accommodation: rent }, house);
  const cleaning = num(a && a.cleaning) || 0, linen = num(a && a.linen) || 0, tax = t ? t.amount : 0;
  return { rent, cleaning, linen, tax, total: round2((rent || 0) + cleaning + linen + tax), calc: t };
}
