// Eggselent — koppeling met Supabase (accounts + synchronisatie).
//
// Leeg laten = de app werkt alleen op deze telefoon (zoals het prototype).
// Invullen = inloggen verplicht, gegevens worden gedeeld binnen het team.
//
// Waar vind je dit? Supabase-dashboard → Project Settings → API (of "Connect"):
//   supabaseUrl  = Project URL, bijv. https://abcdefghijkl.supabase.co
//   supabaseKey  = de "anon" / "publishable" key. Die is bedoeld om in een app te staan;
//                  de beveiliging zit in de database-regels (zie supabase/schema.sql).
//                  Zet hier NOOIT de "service_role" / "secret" key.
//
// Na het wijzigen van dit bestand: verhoog VERSION in sw.js, anders houden telefoons de oude versie.
window.EGGSELENT_CONFIG = {
  supabaseUrl: 'https://istqegonfkfrkyddfajd.supabase.co',
  supabaseKey: 'sb_publishable_antF0IJbE25Ie9I3i_KmBQ_qxF0vR8q',
};
