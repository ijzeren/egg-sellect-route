// Nooit in- of uitzoomen: de app heeft altijd dezelfde grootte, zoals een gewone iPhone-app.
// - knijpen met twee vingers: geblokkeerd (gesture-events van Safari, en touchmove met schaal ≠ 1)
// - dubbeltikken: uit via touch-action:manipulation (shared/theme.css)
// - automatisch inzoomen bij het tikken in een invoerveld: uit via maximum-scale=1 in de viewport-meta
// De lettergrootte van de iPhone (Instellingen → Beeldscherm → Tekstgrootte) blijft gewoon werken.
(function () {
  var stop = function (e) { e.preventDefault(); };
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });
  document.addEventListener('touchmove', function (e) { if (e.touches && e.touches.length > 1) e.preventDefault(); else if (typeof e.scale === 'number' && e.scale !== 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', function (e) { if (!e.target.closest || !e.target.closest('input,textarea,select,[contenteditable]')) e.preventDefault(); }, { passive: false });
})();
