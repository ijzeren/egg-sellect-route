// Egg-sellent — koppeling met Supabase (accounts + synchronisatie).
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
  // Publieke sleutel voor meldingen (web push). De bijbehorende geheime sleutel staat alleen in Supabase.
  vapidPublicKey: 'BFnKri4aJa4Wk-OPCWj1hRLbM4IKu0xmtE3EaNrrf4wAeskh83hcNEq2tV7KV2vk5vN_Mjxq7Jt66p48LYe3IxU',

  // Lokaal ontwikkelen: geldt alleen als de app op localhost / 127.0.0.1 draait.
  // Praat met de lokale Supabase uit Docker (npx supabase start): er wordt geen mail verstuurd
  // en de inlogcode is altijd devCode. Dit is de standaard publishable key van elke lokale Supabase.
  local: {
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
    devCode: '123456',
    vapidPublicKey: 'BFnKri4aJa4Wk-OPCWj1hRLbM4IKu0xmtE3EaNrrf4wAeskh83hcNEq2tV7KV2vk5vN_Mjxq7Jt66p48LYe3IxU',
  },
};
