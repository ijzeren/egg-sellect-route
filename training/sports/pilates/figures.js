// Pilates — figuurtje per oefening (zie rig.js voor de hoeken). Zelfde id's als E in data.js.
// Liggend: hoofd links. Staand en zittend: kijkt naar rechts. Zijligging: vooraanzicht (bovenbeen gaat omhoog).
// Bekijken en bijstellen: tools/figures.html (alle figuren naast elkaar).
const SUP = { t: 180, n: 197, a: [0, 0], l: [-60, 55] };                 // op je rug, knieën gebogen
const LONG = { t: 180, n: 197, a: [0, 0], l: [0, 0, -90] };              // op je rug, benen gestrekt
const CURL = { t: 198, n: 225, a: [12, 12], l: [-60, 55] };              // hoofd en schouders opgekruld
const TABLE = [-90, 0, 0];                                               // been in tafelstand
const PRONE = { t: 180, n: 200, a: [180, 180], l: [0, 0, 0] };           // op je buik
const QUAD = { t: 196, n: 185, a: [90, 90], l: [90, 0, 0] };             // handen en knieën
const STAND = { t: -90, n: -90, a: [95, 88], l: [90, 90, 0] };           // staand
const SIT = { t: -90, n: -88, a: [0, 0], l: [0, 0, -90] };               // zittend, benen gestrekt
const CROSS = { t: -90, n: -90, a: [72, 100], A: [108, 80], l: [8, 172, 172], L: [172, 8, 8] }; // kleermakerszit, vooraanzicht
const HEELS = { t: -90, n: -90, a: [95, 85], l: [0, 180, 180] };        // op je hielen, zijaanzicht
const SIDE = { t: 180, n: 200, a: [8, 8], A: [180, 180], l: [0, 0, 0] }; // zijligging
const KNEEL = { t: -90, n: -90, a: [90, 90], l: [90, 180, 180] };        // geknield, rechtop
const P = (base, o) => ({ ...base, ...o });
// Hele houding draaien (bijv. rollen als een bal).
const R = (p, d) => { const o = { ...p, t: p.t + d, n: (p.n == null ? p.t : p.n) + d }; for (const k of ['a', 'A', 'l', 'L']) if (p[k]) o[k] = p[k].map((v, i) => k.toLowerCase() === 'l' && i === 3 ? v : v + d); return o; };
const BALL = { t: -115, c: -3, n: -55, a: [-25, 40], l: [-68, 118, 118] };

export const FIG = {
adem: { k: [P(SUP, { a: [5, -150] })], fx: ['ribs'] },
bekken: { k: [P(SUP, { c: 1.5 }), P(SUP, { t: 182, c: -1 })], fx: ['core'] },
kniezwaai: { k: [P(SUP, { a: [-40, -40] }), P(SUP, { a: [-40, -40], l: [-40, 45, 0, .75], L: [-35, 40, 0, .7] })], fx: ['back'] },
kat: { k: [P(QUAD, { c: 4, n: 125 }), P(QUAD, { c: -3, n: 205 })], fx: ['back'] },
nekrol: { k: [P(SUP, { n: 197 }), P(SUP, { n: 190 })], fx: ['neck'] },
armcirkels: { k: [P(STAND, { a: [-5, -5], A: [-5, -5] }), P(STAND, { a: [-18, -18], A: [-18, -18] }), P(STAND, { a: [5, 5], A: [5, 5] })], anchor: 'F', fx: ['shoulder'], ms: 700 },
heupcirkels: { k: [P(SUP, { l: [-105, 15], L: SUP.l }), P(SUP, { l: [-120, 5], L: SUP.l }), P(SUP, { l: [-135, 15], L: SUP.l }), P(SUP, { l: [-120, 25], L: SUP.l })], fx: ['hip'], ms: 800 },
rolldown: { k: [STAND, P(STAND, { t: 66, c: 2, n: 88, a: [95, 95], l: [76, 100, 0] })], anchor: 'F', fx: ['back'], ms: 2400 },
imprint: { k: [P(SUP, { c: 1.5 }), P(SUP, { t: 182, c: -1 })], fx: ['core'] },
kneefold: { k: [SUP, P(SUP, { l: TABLE, L: SUP.l })], fx: ['core'] },
bridge: { k: [SUP, P(SUP, { t: 155, n: 170, l: [-25, 75] })], anchor: 'S', fx: ['glute'] },
bridge_march: { k: [P(SUP, { t: 155, n: 170, l: [-25, 75] }), P(SUP, { t: 155, n: 170, l: [-70, 10] , L: [-25, 75] })], anchor: 'S', fx: ['glute'] },
shoulderbridge: { k: [P(SUP, { t: 155, n: 170, l: [-80, -80, -170], L: [-25, 75] }), P(SUP, { t: 155, n: 170, l: [-20, -20, -110], L: [-25, 75] })], anchor: 'S', fx: ['glute', 'hamstring'] },
chestlift: { k: [P(SUP, { a: [-95, 150] }), P(CURL, { a: [250, 116] })], fx: ['core'] },
hundredprep: { k: [P(CURL, { a: [8, 8], l: TABLE }), P(CURL, { a: [-2, -2], l: TABLE })], fx: ['core'], ms: 350 },
hundred: { k: [P(CURL, { a: [8, 8], l: [-40, -40, -40] }), P(CURL, { a: [-2, -2], l: [-40, -40, -40] })], fx: ['core'], ms: 350 },
deadbug: { k: [P(SUP, { a: [-90, -90], l: TABLE }), P(SUP, { a: [-90, -90], A: [190, 190], l: TABLE, L: [-10, -10, -10] })], fx: ['core'] },
rollup_assist: { k: [P(SIT, { t: -80, c: 3, a: [20, 30], l: [-55, 60] }), P(SIT, { t: -140, c: 5, n: -100, a: [5, 15], l: [-55, 60] })], fx: ['core'], ms: 2200 },
rollup: { k: [P(LONG, { a: [180, 180] }), P(LONG, { t: -120, c: 5, n: -100, a: [-70, -70] }), P(SIT, { t: -25, c: 6, n: 0, a: [-5, -5] })], fx: ['core'], ms: 2000 },
sls: { k: [P(CURL, { a: [-30, 60], l: [-115, -5], L: [-20, -20, -20] }), P(CURL, { a: [-20, -20], l: [-20, -20, -20], L: [-115, -5] })], fx: ['core'], ms: 900 },
dls: { k: [P(CURL, { a: [-40, 50], l: [-120, -5] }), P(CURL, { a: [195, 195], l: [-30, -30, -30] })], fx: ['core'], ms: 1500 },
crisscross: { k: [P(CURL, { t: 205, n: 230, a: [250, 116], l: [-115, -5], L: [-20, -20, -20] }), P(CURL, { t: 205, n: 230, a: [250, 116], l: [-20, -20, -20], L: [-115, -5] })], fx: ['core'], ms: 1100 },
rolling: { k: [BALL, R(BALL, -65)], anchor: 'C', fx: ['core'], ms: 1300 },
teaserprep: { k: [SUP, P(SUP, { t: -120, c: 2, n: -110, a: [-30, -30], l: [-45, 5] })], fx: ['core'], ms: 2000 },
teaser: { k: [P(LONG, { a: [180, 180], l: [0, 0, 0] }), P(LONG, { t: -125, c: 2, n: -115, a: [-35, -35], l: [-50, -50, -50] })], fx: ['core'], ms: 2000 },
sidelegs: { k: [SIDE, P(SIDE, { l: [-30, -30, -30], L: [0, 0, 0] })], fx: ['glute'] },
clam: { k: [P(SIDE, { l: [25, 150, 150, .55] }), P(SIDE, { l: [-35, 120, 120, .6], L: [25, 150, 150, .55] })], fx: ['glute'] },
sidekick: { k: [P(SIDE, { l: [-35, -35, -35, .8], L: [0, 0, 0] }), P(SIDE, { l: [-5, -5, -5], L: [0, 0, 0] })], fx: ['glute', 'hip'], ms: 1200 },
circles: { k: [P(SUP, { l: [-90, -90, -180], L: [-60, 55] }), P(SUP, { l: [-75, -75, -165], L: [-60, 55] }), P(SUP, { l: [-90, -90, -180, .8], L: [-60, 55] }), P(SUP, { l: [-105, -105, -195], L: [-60, 55] })], fx: ['hip'], ms: 700 },
donkey: { k: [P(QUAD, { l: [90, -10, -10], L: [90, 0, 0] }), P(QUAD, { l: [-5, -95, -95], L: [90, 0, 0] })], fx: ['glute'] },
squat: { k: [P(STAND, { a: [0, 0] }), P(STAND, { t: -60, n: -55, a: [-10, -10], l: [10, 115, 0] })], anchor: 'F', fx: ['glute', 'thigh'] },
birddog: { k: [QUAD, P(QUAD, { A: [190, 190], l: [10, 10, 10], L: [90, 0, 0], a: [90, 90] })], fx: ['back', 'glute'] },
swimprep: { k: [PRONE, P(PRONE, { a: [190, 190], A: [180, 180], l: [-8, -8, -8], L: [0, 0, 0] })], fx: ['back'] },
swimming: { k: [P(PRONE, { t: 175, n: 190, a: [190, 190], A: [175, 175], l: [-12, -12, -12], L: [-4, -4, -4] }), P(PRONE, { t: 175, n: 190, a: [175, 175], A: [190, 190], l: [-4, -4, -4], L: [-12, -12, -12] })], fx: ['back', 'glute'], ms: 350 },
swanprep: { k: [P(PRONE, { a: [-20, 160] }), P(PRONE, { t: 205, n: 215, a: [50, 180] })], anchor: 'Hp', fx: ['back'] },
swan: { k: [P(PRONE, { a: [-20, 160] }), P(PRONE, { t: 220, n: 228, a: [145, 145] })], anchor: 'Hp', fx: ['back'] },
spinestretch: { k: [P(SIT, { a: [-5, -5] }), P(SIT, { t: -42, c: -3, n: 20, a: [5, 5] })], fx: ['back', 'hamstring'], ms: 2000 },
saw: { k: [P(SIT, { a: [-10, -10], A: [-150, -150] }), P(SIT, { t: -42, c: -3, n: 15, a: [22, 30], A: [-140, -140] })], fx: ['back', 'hamstring'], ms: 1600 },
spinetwist: { k: [P(SUP, { a: [-40, -40] }), P(SUP, { a: [-40, -40], l: [-35, 40, 0, .7], L: [-30, 35, 0, .65] })], fx: ['back'], ms: 2200 },
threadneedle: { k: [P(QUAD, { a: [-80, -80], A: [90, 90] }), P(QUAD, { t: 190, n: 160, a: [80, 30, ], A: [90, 90] })], fx: ['shoulder'], ms: 1800 },
mermaid: { k: [P(CROSS, { A: [-100, -85] }), P(CROSS, { t: -62, n: -55, c: -2, a: [80, 110], A: [-55, -15] })], fx: ['ribs'], ms: 1800 },
plankknees: { k: [{ t: 185, n: 185, a: [90, 180], l: [12, 0, 0] }], fx: ['core'] },
plank: { k: [{ t: 188, n: 188, a: [90, 180], l: [8, 8, 60] }], fx: ['core'] },
sideplankknee: { k: [{ t: 215, n: 215, a: [-90, -90], A: [90, 180], l: [0, 0, 0, .55] }, { t: 198, n: 198, a: [-90, -90], A: [90, 180], l: [18, 18, 18, .55] }], anchor: 'F', fx: ['ribs'] },
sideplank: { k: [{ t: 215, n: 215, a: [-90, -90], A: [90, 180], l: [0, 0, 0] }, { t: 193, n: 193, a: [-90, -90], A: [90, 180], l: [13, 13, 13] }], anchor: 'F', fx: ['ribs'] },
legpullfront: { k: [{ t: 188, n: 188, a: [90, 90], l: [8, 8, 60] }, { t: 188, n: 188, a: [90, 90], l: [-5, -5, -5], L: [8, 8, 60] }], anchor: 'Hd', fx: ['core'] },
legpullback: { k: [P(SIT, { t: -120, a: [120, 120], l: [0, 0, -30] }), P(SIT, { t: -172, n: -150, a: [95, 95], l: [-20, -20, -20], L: [10, 10, -60] })], anchor: 'Hd', fx: ['glute', 'arm'] },
pushup: { k: [{ t: 188, n: 188, a: [90, 90], l: [8, 8, 60] }, { t: 186, n: 186, a: [40, 140], l: [5, 5, 60] }], anchor: 'Hd', fx: ['chest', 'arm'], ms: 1400 },
kind: { k: [{ t: 162, c: 2, n: 165, a: [176, 176], l: [150, 0, 0] }, { t: 164, c: 3, n: 167, a: [176, 176], l: [150, 0, 0] }], anchor: 'K', fx: ['back'], ms: 2600 },
hamstring: { k: [P(SUP, { a: [-70, -10], l: [-80, -80, -170], L: SUP.l }), P(SUP, { a: [-75, -5], l: [-95, -95, -185], L: SUP.l })], fx: ['hamstring'], ms: 2400 },
fig4: { k: [P(SUP, { a: [-50, 0], l: [-60, 20, 0, .7], L: [-90, -10, 0] })], fx: ['glute'] },
hipflexor: { k: [P(KNEEL, { l: [-20, 90, 0], L: [100, 180, 180] }), P(KNEEL, { l: [-30, 80, 0], L: [120, 180, 180] })], anchor: 'T', fx: ['hip'], ms: 2400 },
borst: { k: [P(HEELS, { a: [105, 95] }), P(HEELS, { a: [140, 150], n: -95 })], fx: ['chest'], ms: 2200 },
zijrek: { k: [P(CROSS, { A: [-100, -85] }), P(CROSS, { t: -65, n: -58, c: -2, a: [80, 110], A: [-58, -20] })], fx: ['ribs'], ms: 2400 },
ontspan: { k: [P(LONG, { a: [5, 5], l: [0, 0, -60] })], fx: [] },
};
