// Sport: fitness — programma "Bio-circuit" (Technogym Biocircuit in de sportschool).
// Geen lessenreeks: steeds hetzelfde circuit van 30 minuten op je vaste trainingsdagen.
// Elke sportschool heeft een eigen opstelling; de lijst hieronder is een standaard die je per training aanpast
// (training → Toestellen). Timing: 2 rondes langs alle toestellen; per toestel werken + wisselen, samen precies 30 min.

// Standaardtoestellen (id's in het Engels, namen zoals op de toestellen).
export const DEFAULT_STATIONS = [
  { id: 'leg-press', n: 'Leg press', g: 'Benen en billen', t: 'Voeten heupbreed op de plaat, knieën in lijn met je tenen. Duw rustig weg, strek niet op slot.' },
  { id: 'chest-press', n: 'Chest press', g: 'Borst en armen', t: 'Schouderbladen tegen de rugleuning, ellebogen iets onder schouderhoogte. Rustig terug.' },
  { id: 'low-row', n: 'Low row', g: 'Rug', t: 'Borst tegen het kussen, trek je ellebogen langs je lichaam naar achteren en knijp je schouderbladen samen.' },
  { id: 'leg-extension', n: 'Leg extension', g: 'Voorkant bovenbenen', t: 'Knie op het draaipunt van het toestel. Strek gecontroleerd, even vasthouden, langzaam terug.' },
  { id: 'shoulder-press', n: 'Shoulder press', g: 'Schouders', t: 'Rug tegen de leuning, buik aan. Duw omhoog zonder je onderrug hol te trekken.' },
  { id: 'leg-curl', n: 'Leg curl', g: 'Achterkant bovenbenen', t: 'Knie op het draaipunt, buig je knieën rustig en laat langzaam terugkomen.' },
  { id: 'pulldown', n: 'Lat pulldown', g: 'Rug en armen', t: 'Trek de stang naar je bovenborst, ellebogen naar beneden en naar achteren. Niet met je rug zwaaien.' },
  { id: 'ab-crunch', n: 'Abdominal crunch', g: 'Buik', t: 'Krul je ruggengraat in vanuit je buik, niet trekken met je armen. Uitademen als je inkrult.' },
  { id: 'lower-back', n: 'Lower back', g: 'Onderrug', t: 'Strek rustig naar achteren tot rechtop, niet doorstrekken. Beweeg vanuit je heupen.' },
  { id: 'rotary-torso', n: 'Rotary torso', g: 'Schuine buikspieren', t: 'Draai gecontroleerd vanuit je romp, heupen blijven stil. Beide kanten even vaak.' },
];
const INFO = Object.fromEntries(DEFAULT_STATIONS.map(x => [x.id, x]));
export const stationInfo = id => INFO[id] || null;

export const ROUNDS = 2;
export const SESSION_SECONDS = 1800;
export const PHASES = ['Werken', 'Wisselen'];

// Toestellen van een training: eigen lijst, anders de standaard.
export const stationsOf = p => (p && p.settings && Array.isArray(p.settings.stations) && p.settings.stations.length ? p.settings.stations : DEFAULT_STATIONS.map(({ id, n }) => ({ id, n })));

// Sessie: [{ id, n, s seconden, ph 0 werken / 1 wisselen, round, k volgnummer toestel }], samen precies 30 minuten.
// Per toestel een gelijk tijdvak; daarvan 30 s wisselen (20 s bij korte vakken). Het laatste vak vult aan tot 30:00.
export function planFor(stations, rounds = ROUNDS) {
  const list = stations.length ? stations : DEFAULT_STATIONS;
  const slots = list.length * rounds, slot = Math.floor(SESSION_SECONDS / slots);
  const sw = slot >= 90 ? 30 : 20;
  const out = [];
  for (let r = 1; r <= rounds; r++) list.forEach((st, k) => {
    out.push({ id: st.id, n: st.n, s: slot - sw, ph: 0, round: r, k: k + 1 });
    out.push({ id: st.id, n: st.n, s: sw, ph: 1, round: r, k: k + 1 });
  });
  out[out.length - 1].s += SESSION_SECONDS - slots * slot; // afronding
  // Na het laatste toestel hoeft je niet te wisselen: die tijd gaat naar het werken.
  const last = out.pop(); out[out.length - 1].s += last.s;
  return out;
}

export const PROGRAM = {
  id: 'biocircuit',
  kind: 'circuit',
  sport: 'Fitness',
  name: 'Bio-circuit',
  tagline: '30 minuten circuit op de toestellen · vaste dagen',
  minutes: 30,
  icon: '🏋️',
};
