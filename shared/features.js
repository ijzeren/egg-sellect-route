// Functies aan/uit per app (feature toggles). Eén lijst voor alle apps; elk gezin kiest per functie.
//
// Afspraken (zie ook CLAUDE.md):
// - Een functie die je los kunt aan- of uitzetten, of eerst wilt uitproberen, krijgt hier een regel.
//   app     id uit shared/apps.js
//   id      vaste naam (Engels, verandert niet: staat in de database)
//   parent  optioneel: uitbreiding op een andere functie van dezelfde app; staat die uit, dan deze ook
//   name    korte naam in Instellingen
//   about   één zin: wat zie je als hij aan staat
//   def     standaardstand: 'on' (aan), 'test' (alleen beheerders) of 'off' (uit)
// - De stand per gezin staat in team_apps.settings.features: { boxes: 'off', ... }. Alleen wat afwijkt van def.
// - De app vraagt het na met ThuisFeatures.on(settings, app, id, isAdmin) en de schakelaars staan in de app zelf
//   (app-specifieke instellingen blijven in de app).
// Werkt als gewoon script (window.ThuisFeatures) én als module-import: import '../shared/features.js'.
(function (g) {
  const FEATURES = [
    { app: 'eggs', id: 'boxes', name: 'Doosjes bijhouden', about: 'Lege doosjes van 6 en 10: uitgegeven, terug van klanten, gekocht en geteld.', def: 'on' },
    { app: 'eggs', id: 'wafels', name: 'Stroopwafels', about: 'Stroopwafelweken plannen, verkoop aan de deur en voorraad pakjes.', def: 'on' },
    { app: 'eggs', id: 'wafelAnnounce', parent: 'wafels', name: 'Aankondigen aan de deur', about: 'In de weken vóór een stroopwafelweek vraagt de app aan de deur hoeveel pakjes iemand wil.', def: 'on' },
    { app: 'eggs', id: 'sumup', name: 'Afrekenen met SumUp', about: 'Wie wil, zet het daarna op de eigen telefoon aan bij Afrekenen met SumUp.', def: 'on' },
  ];
  const STATES = { on: 'Aan', test: 'Test', off: 'Uit' };
  const find = (app, id) => FEATURES.find(f => f.app === app && f.id === id);
  // Stand voor dit gezin: wat het gezin koos, anders de standaard
  function state(settings, app, id){
    const f = find(app, id); if (!f) return 'off';
    const s = settings && settings.features && settings.features[id];
    return s in STATES ? s : f.def;
  }
  // Ziet deze gebruiker de functie? 'test' = alleen beheerders. Een uitbreiding werkt alleen als de functie erboven ook werkt.
  function on(settings, app, id, isAdmin){
    for (let f = find(app, id); f; f = f.parent ? find(app, f.parent) : null) {
      const s = state(settings, app, f.id);
      if (s === 'off' || (s === 'test' && !isAdmin)) return false;
    }
    return !!find(app, id);
  }
  const list = app => FEATURES.filter(f => f.app === app);
  // Nieuwe settings.features na het kiezen van een stand: de standaard hoeft niet bewaard
  function set(settings, app, id, value){
    const f = find(app, id), next = { ...((settings && settings.features) || {}) };
    if (!f || !(value in STATES)) return next;
    if (value === f.def) delete next[id]; else next[id] = value;
    return next;
  }
  g.ThuisFeatures = { FEATURES, STATES, state, on, list, set };
})(globalThis);
