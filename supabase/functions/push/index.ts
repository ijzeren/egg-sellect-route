// Egg-sellent — meldingen versturen (Supabase Edge Function).
//
// Aanroepen (POST, JSON):
//   { "mode": "cron" }                                   elke 15 min via pg_cron: herinneringen die nu aan de beurt zijn
//   { "mode": "team", "type": "absence", "date": "2026-11-24", "on": true }   teamgenoten laten weten (ingelogd)
//   { "mode": "test" }                                   testmelding naar je eigen telefoon(s) (ingelogd)
//
// Geheimen (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY levert Supabase zelf.
// Zet "Verify JWT" UIT voor deze functie: de cron-aanroep heeft geen gebruiker; ingelogde modi controleren zelf.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";
webpush.setVapidDetails(env("VAPID_SUBJECT") || "https://ijzeren.github.io/egg-sellect-route/", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const DSH = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Sub = { endpoint: string; user_id: string; team_id: string; p256dh: string; auth: string; prefs: any; tz: string };

// Lokale datum/tijd in de tijdzone van de telefoon
function localNow(tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const d = new Date(`${date}T12:00:00Z`);
  return { date, hm: `${parts.hour}:${parts.minute}`, dow: d.getUTCDay() };
}
const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (s: string) => { const d = new Date(`${s}T12:00:00Z`); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
const fmtShort = (s: string) => { const d = new Date(`${s}T12:00:00Z`); return `${DSH[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const inWindow = (hm: string, at: string) => { // tot 3 uur na het gekozen tijdstip, voor als een ronde van cron gemist is
  const m = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  return m(hm) >= m(at) && m(hm) < m(at) + 180;
};

async function deliver(sub: Sub, payload: Record<string, unknown>, kind?: string, day?: string): Promise<string> {
  if (kind && day) {
    const { error } = await db.from("push_log").insert({ endpoint: sub.endpoint, kind, day });
    if (error) return "al verstuurd";
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "normal" });
    return "verstuurd";
  } catch (e: any) {
    const code = e?.statusCode;
    if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); // telefoon heeft meldingen uitgezet
    else if (kind && day) await db.from("push_log").delete().match({ endpoint: sub.endpoint, kind, day }); // volgende ronde opnieuw proberen
    return `fout ${code ?? e?.message}`;
  }
}

async function cron() {
  const { data: subs } = await db.from("push_subscriptions").select("*");
  if (!subs?.length) return { subs: 0 };
  const teamIds = [...new Set(subs.map((s: Sub) => s.team_id))];
  const { data: teams } = await db.from("teams").select("id, walk_days").in("id", teamIds);
  const walkDays = new Map((teams ?? []).map((t: any) => [t.id, t.walk_days ?? []]));
  const results: string[] = [];
  for (const sub of subs as Sub[]) {
    const now = localNow(sub.tz), p = sub.prefs || {};
    // ochtend van een loopdag
    if (p.walkday && inWindow(now.hm, p.walkday) && (walkDays.get(sub.team_id) ?? []).includes(now.dow)) {
      const [{ data: abs }, { data: dig }] = await Promise.all([
        db.from("absences").select("date").eq("team_id", sub.team_id).eq("date", now.date).eq("deleted", false),
        db.from("team_digest").select("payload").eq("team_id", sub.team_id).eq("key", `day:${now.date}`).maybeSingle(),
      ]);
      if (!abs?.length) {
        const d = dig?.payload;
        const body = d && d.open != null
          ? `${d.open} ${d.open === 1 ? "adres" : "adressen"} vandaag. Neem ongeveer ${d.eggs} eieren mee.`
          : "Vandaag is het loopdag. Open de app voor je ronde.";
        results.push(await deliver(sub, { title: `Ronde ${DAYS[now.dow]}`, body, tag: `walk-${now.date}`, url: "./" }, "walkday", now.date));
      }
    }
    // bestelherinnering
    if (p.order && p.order.dow === now.dow && inWindow(now.hm, p.order.time || "18:00")) {
      const next = addDays(weekStart(now.date), 7);
      const { data: dig } = await db.from("team_digest").select("payload").eq("team_id", sub.team_id).eq("key", `week:${next}`).maybeSingle();
      const d = dig?.payload;
      const body = d && d.advice != null ? `Advies voor week ${d.week}: ${d.advice} eieren.` : "Tijd om de eieren voor volgende week te bestellen.";
      results.push(await deliver(sub, { title: "Bestellen", body, tag: `order-${next}`, url: "./?v=order" }, "order", now.date));
    }
  }
  return { subs: subs.length, results };
}

async function asUser(req: Request) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data?.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* leeg */ }
  try {
    if (body.mode === "cron") return json(await cron());

    const user = await asUser(req);
    if (!user) return json({ error: "Niet ingelogd" }, 401);

    if (body.mode === "test") {
      const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", user.id);
      const results = await Promise.all((subs ?? []).map((s: Sub) => deliver(s, { title: "Egg-sellent", body: "Meldingen werken. Vers aan de deur, slim gepland.", tag: "test", url: "./" })));
      return json({ subs: subs?.length ?? 0, results });
    }

    if (body.mode === "team" && body.type === "absence" && /^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) {
      const { data: me } = await db.from("team_members").select("team_id, name").eq("user_id", user.id).eq("team_id", body.team_id).maybeSingle();
      if (!me) return json({ error: "Geen lid van dit team" }, 403);
      const { data: subs } = await db.from("push_subscriptions").select("*").eq("team_id", me.team_id).neq("user_id", user.id);
      const who = me.name || "Een teamgenoot";
      const text = body.on ? `${who}: geen ronde op ${fmtShort(body.date)}.` : `${who}: ${fmtShort(body.date)} gaat de ronde toch door.`;
      const targets = (subs ?? []).filter((s: Sub) => s.prefs?.team !== false);
      const results = await Promise.all(targets.map((s: Sub) => deliver(s, { title: "Afwezigheid", body: text, tag: `abs-${body.date}`, url: "./?v=order" })));
      return json({ subs: targets.length, results });
    }
    return json({ error: "Onbekende opdracht" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
