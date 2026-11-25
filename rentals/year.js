// Verhuur — rekenwerk voor kosten, begroting en het jaaroverzicht (testbaar, zonder scherm).
//
// Begrippen (zie docs/plan-rentals.md, deel 3):
//   opbrengst        uitbetaling van het platform (zonder toeristenbelasting die de verhuurder zelf afdraagt);
//                    directe boeking: huur + schoonmaak + bedlinnen; nog geen uitbetaling bekend: huur × payout_percent
//                    (geschat). Eigen gebruik heeft geen opbrengst, wel eventueel een bijdrage.
//   kosten per boeking  schoonmaak, bedlinnen, vaste kosten per boeking (other_costs) en de commissie van de
//                    verhuurmakelaar: (uitbetaling − schoonmaak − bedlinnen) × commission_percent, plus btw.
//                    Staan ze bij de boeking, dan gelden die bedragen; anders de standaard van het huis.
//   exploitatiekosten  werkelijke kosten (rental_costs) per kostensoort, behalve investeringen.
//   eigen gebruik    directe kosten van het verblijf + een deel van de exploitatiekosten naar rato van de nachten
//                    (eigen nachten ÷ (verhuurde + eigen nachten)), alleen soorten met own_share. Min de bijdrage.
//   resultaat        opbrengst − kosten per boeking (verhuur) − (exploitatiekosten − deel eigen gebruik).
//                    Investeringen staan apart en tellen niet mee.
//   dekking          (opbrengst − kosten per boeking, inclusief verwachte boekingen) ÷ begrote exploitatiekosten.
// Een verblijf telt mee in het jaar van aankomst (zoals de spreadsheet met een tabblad per jaar).
import { nights, num, round2, isStay } from './tax.js';

export const KINDS = [
  ['fixed', 'Vaste lasten'], ['usage', 'Verbruik'], ['tax', 'Belastingen'], ['maintenance', 'Onderhoud'],
  ['other', 'Overig en onvoorzien'], ['booking', 'Per boeking'], ['investment', 'Investeringen'],
];
export const kindName = k => (KINDS.find(x => x[0] === k) || [k, k])[1];
export const FROM_BOOKING = [['cleaning', 'Schoonmaak'], ['linen', 'Bedlinnen'], ['commission', 'Verhuurmakelaar'], ['other_costs', 'Vaste kosten per boeking']];

// Eerste set kostensoorten voor een huis (Bonhomme); per huis aan te passen.
export const DEFAULT_CATEGORIES = [
  ['Internet', 'fixed'], ['Verzekeringen', 'fixed'], ['Administratiekantoor', 'fixed'], ['Tuinman', 'fixed'],
  ['Elektra', 'usage'], ['Water', 'usage'], ['Stookolie', 'usage'], ['Brandhout', 'usage'],
  ['Taxe foncière', 'tax'], ["Taxe d'habitation", 'tax'], ['Inkomstenbelasting', 'tax', { own_share: false }],
  ['Riool', 'maintenance'], ['Ketelcontrole', 'maintenance'], ['Schoorsteenveger', 'maintenance'], ['Onderhoud overig', 'maintenance'],
  ['Onvoorzien', 'other'], ['Overig', 'other'],
  ['Schoonmaak', 'booking', { from_booking: 'cleaning' }], ['Bedlinnen', 'booking', { from_booking: 'linen' }],
  ['Verhuurmakelaar', 'booking', { from_booking: 'commission' }], ['Vaste kosten per boeking', 'booking', { from_booking: 'other_costs' }],
  ['Investeringen en renovatie', 'investment', { own_share: false }],
].map(([name, kind, x], i) => ({ name, kind, from_booking: null, own_share: true, sort: i, ...(x || {}) }));

// Standaard zolang het huis niets heeft ingesteld (rental_houses.settings.costs; bij Huis in de app, of overgenomen door de
// import van de spreadsheet). Bewust neutraal: de echte afspraken met de makelaar staan niet in deze openbare code.
export const DEFAULT_COSTS = Object.freeze({ commission_percent: 0, commission_vat: 20, other_costs: 0, payout_percent: 85 });
export const costRules = house => ({ ...DEFAULT_COSTS, ...Object.fromEntries(Object.entries((house && house.settings && house.settings.costs) || {}).filter(([, v]) => v !== null && v !== undefined)) });

export const commissionFor = (rules, payout, cleaning, linen) =>
  payout === null ? null : round2(Math.max(0, payout - (cleaning || 0) - (linen || 0)) * rules.commission_percent / 100 * (1 + rules.commission_vat / 100));

const isPlatform = b => b.source === 'booking' || b.source === 'airbnb';

// Geld van één verblijf: { revenue, estimated, contribution, cleaning, linen, commission, other_costs, costs, net }
export function bookingMoney(b, a, house) {
  a = a || {};
  const s = (house && house.settings) || {}, rules = costRules(house), own = b.source === 'own';
  const pick = (k, dflt) => { const v = num(a[k]); return v !== null ? v : dflt; };
  const cleaning = pick('cleaning', num(s.cleaning) || 0), linen = pick('linen', num(s.linen) || 0);
  let revenue = 0, estimated = false, contribution = 0;
  if (own) contribution = num(a.accommodation) || 0;
  else if (isPlatform(b)) {
    const payout = num(a.payout), acc = num(a.accommodation), tax = b.tax_by === 'host' ? num(a.tourist_tax) || 0 : 0;
    if (payout !== null) revenue = round2(payout - tax);
    else if (acc !== null) { revenue = round2(acc * rules.payout_percent / 100); estimated = true; }
    else { revenue = null; estimated = true; }
  } else {
    const payout = num(a.payout), np = num(a.night_price), acc = num(a.accommodation);
    const rent = acc !== null ? acc : np !== null ? round2(np * nights(b)) : null;
    revenue = payout !== null ? payout : rent === null ? null : round2(rent + cleaning + linen);
  }
  const commission = own ? pick('commission', 0) : pick('commission', commissionFor(rules, revenue, cleaning, linen) || 0);
  const other_costs = pick('other_costs', own ? 0 : rules.other_costs);
  const costs = round2(cleaning + linen + commission + other_costs);
  return { revenue, estimated, contribution, cleaning, linen, commission, other_costs, costs, net: revenue === null ? null : round2(revenue - costs) };
}

const sum = (list, f) => round2(list.reduce((s, x) => s + (f(x) || 0), 0));
const daysIn = y => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);

// Jaaroverzicht van één huis.
//   input: { house, year ('2026' of 2026), bookings, amounts: { booking_id: rij }, categories, costs, budgets }
export function yearOverview({ house, year, bookings, amounts, categories, costs, budgets }) {
  const y = String(year), hid = house.id;
  const all = bookings.filter(b => b.house_id === hid && !b.deleted && b.status !== 'cancelled' && String(b.arrival).slice(0, 4) === y);
  const money = b => bookingMoney(b, amounts[b.id], house);
  const rented = all.filter(b => isStay(b) && b.source !== 'own'), own = all.filter(b => isStay(b) && b.source === 'own');
  const expected = all.filter(b => !isStay(b) && b.source !== 'own');
  const M = new Map(all.map(b => [b.id, money(b)]));
  const m = b => M.get(b.id);

  const cats = categories.filter(c => c.house_id === hid && !c.deleted).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const yc = costs.filter(c => c.house_id === hid && !c.deleted && String(c.date).slice(0, 4) === y);
  const yb = budgets.filter(x => x.house_id === hid && String(x.year) === y);
  const budgetOf = id => { const r = yb.find(x => x.category_id === id); return r ? Number(r.amount) : 0; };

  const rows = cats.map(c => {
    if (c.kind === 'booking') {
      const k = c.from_booking;
      return { ...c, budget: budgetOf(c.id), actual: sum([...rented, ...own], b => m(b)[k]), expected: sum(expected, b => m(b)[k]), count: 0 };
    }
    const list = yc.filter(x => x.category_id === c.id);
    return { ...c, budget: budgetOf(c.id), actual: sum(list, x => Number(x.amount)), expected: 0, count: list.length };
  });
  const opRows = rows.filter(r => r.kind !== 'booking' && r.kind !== 'investment');
  const operating = { budget: sum(opRows, r => r.budget), actual: sum(opRows, r => r.actual) };
  const shareBase = sum(opRows.filter(r => r.own_share), r => r.actual);

  const nRented = sum(rented, nights), nOwn = sum(own, nights), nExpected = sum(expected, nights);
  const ratio = nRented + nOwn ? nOwn / (nRented + nOwn) : 0;
  const ownShare = round2(shareBase * ratio);

  const revenue = sum(rented, b => m(b).revenue), bookingCosts = sum(rented, b => m(b).costs);
  const expRevenue = sum(expected, b => m(b).revenue), expCosts = sum(expected, b => m(b).costs);
  const ownDirect = sum(own, b => m(b).costs), contribution = sum(own, b => m(b).contribution);
  const net = round2(revenue - bookingCosts), netWithExpected = round2(net + expRevenue - expCosts);
  const result = round2(net - (operating.actual - ownShare));
  const inv = rows.filter(r => r.kind === 'investment');

  const by = (list, key) => {
    const out = new Map();
    for (const b of list) { const k = key(b) || ''; const o = out.get(k) || { key: k, count: 0, nights: 0, revenue: 0 }; o.count++; o.nights += nights(b); o.revenue = round2(o.revenue + (m(b).revenue || 0)); out.set(k, o); }
    return [...out.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };

  return {
    year: y,
    nights: { rented: nRented, own: nOwn, expected: nExpected, days: daysIn(+y), empty: Math.max(0, daysIn(+y) - nRented - nOwn) },
    stays: { rented: rented.length, own: own.length, expected: expected.length },
    revenue, bookingCosts, net,
    estimated: rented.some(b => m(b).estimated) || rented.some(b => m(b).revenue === null),
    missing: rented.filter(b => m(b).revenue === null).length,
    expected: { revenue: expRevenue, costs: expCosts, net: round2(expRevenue - expCosts) },
    rows, operating,
    ownUse: { nights: nOwn, direct: ownDirect, share: ownShare, contribution, total: round2(ownDirect + ownShare - contribution), ratio: round2(ratio * 100) / 100 },
    result,
    investments: { budget: sum(inv, r => r.budget), actual: sum(inv, r => r.actual) },
    // begroot maar nog geen enkele factuur: het resultaat is dan te gunstig
    unbooked: { count: opRows.filter(r => r.budget > 0 && !r.count).length, budget: sum(opRows.filter(r => r.budget > 0 && !r.count), r => r.budget) },
    coverage: {
      budget: operating.budget, net: netWithExpected,
      pct: operating.budget ? Math.round(netWithExpected / operating.budget * 100) : null,
      toCover: round2(Math.max(0, operating.budget - netWithExpected)),
    },
    channels: by(rented, b => b.source), countries: by(rented, b => b.country),
  };
}

// Begroting van een vorig jaar overnemen: zelfde soorten, zelfde bedragen (alleen wat nog niet bestaat).
export function copyBudget(budgets, houseId, from, to) {
  const have = new Set(budgets.filter(b => b.house_id === houseId && String(b.year) === String(to)).map(b => b.category_id));
  return budgets.filter(b => b.house_id === houseId && String(b.year) === String(from) && !have.has(b.category_id) && Number(b.amount))
    .map(b => ({ house_id: houseId, year: +to, category_id: b.category_id, amount: Number(b.amount) }));
}
