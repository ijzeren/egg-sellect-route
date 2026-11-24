// Gesproken aanwijzingen tijdens een les (v3.18): de ingebouwde stem van de telefoon (Web Speech API).
// Werkt offline met de Nederlandse stem van het toestel. Geen stem beschikbaar? Dan blijft het stil, de piepjes werken gewoon.
const synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
let voice = null;
function pickVoice() {
  if (!synth) return;
  const all = synth.getVoices() || [];
  voice = all.find(v => /^nl[-_]NL/i.test(v.lang) && v.localService) || all.find(v => /^nl/i.test(v.lang)) || null;
}
if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) {} }

export const available = () => !!synth;

// Zeg iets; een nieuwe zin onderbreekt de vorige (anders loopt de stem achter op de klok).
export function say(text, { queue = false } = {}) {
  if (!synth || !text) return;
  try {
    if (!queue) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'nl-NL'; if (voice) u.voice = voice; u.rate = 1; u.pitch = 1;
    synth.speak(u);
  } catch (e) {}
}
export function stop() { try { synth && synth.cancel(); } catch (e) {} }

// "8–10 keer" → "8 tot 10 keer", "30 sec" → "30 seconden": leest prettiger voor.
export const spoken = s => String(s || '').replace(/(\d)\s*[–-]\s*(\d)/g, '$1 tot $2').replace(/\bsec\b/g, 'seconden').replace(/&/g, 'en').replace(/[“”"]/g, '');

// Houding uit de oefeningenlijst (E[id].p) als gesproken aanwijzing.
const POS = { 'Op je rug': 'op je rug', 'Handen & knieën': 'op handen en knieën', 'Staand': 'sta op', 'Zittend': 'ga zitten',
  'Zijligging': 'op je zij', 'Op je buik': 'op je buik', 'Steun': 'in steun', 'Rust': 'op je knieën', 'Knielend': 'op één knie' };
export const position = p => POS[p] || String(p || '').toLowerCase();

// Korte herinneringen halverwege een lange oefening.
export const REMINDERS = ['Let op je ademhaling.', 'Adem rustig door.', 'Houd je buik licht aan.', 'Schouders laag, weg van je oren.', 'Rustig en gecontroleerd.'];
