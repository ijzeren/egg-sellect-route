// Thuis — koppelingen ophalen (Supabase Edge Function `integrations`).
//
// Aanroepen (POST, JSON):
//   { "mode": "cron" }               elke 30 min via pg_cron (cron.sql): alle agendalinks die aan de beurt zijn
//   { "mode": "sync", "id": "…" }    "Nu bijwerken" in de app (ingelogd; alleen een koppeling die je mag zien)
//   POST …/integrations?t=<token>    Gezondheid: de opdracht op de iPhone stuurt { steps, weight, date? } (zie health.mjs);
//                                    antwoord is gewone tekst, zodat Opdrachten het kan tonen
//
// SUPABASE_URL, SUPABASE_ANON_KEY en SUPABASE_SERVICE_ROLE_KEY levert Supabase zelf.
// Zet "Verify JWT" UIT voor deze functie (config.toml): de cron-aanroep heeft geen gebruiker; "sync" controleert zelf.
// De cron-modus mag iedereen aanroepen: hij haalt alleen koppelingen op die langer dan 25 minuten niet zijn bijgewerkt,
// dus vaker aanroepen doet niets extra.
// Privacy: de link (integration_secrets) komt nooit in een antwoord, foutmelding of logboek.
// Lokaal testen met http-links: INTEGRATIONS_ALLOW_HTTP=1 (zie supabase/README.md).
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseICal, toAgendaRows, cleanUrl, localParts } from "./ical.mjs";
import { parseHealthBody } from "./health.mjs";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const ALLOW_HTTP = env("INTEGRATIONS_ALLOW_HTTP") === "1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DUE_MINUTES = 25;          // niet vaker dan dit per koppeling via cron
const WINDOW_BACK = 14, WINDOW_AHEAD = 90; // dagen terug en vooruit die we bijhouden
const MAX_BYTES = 5 * 1024 * 1024;

const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
class Fail extends Error {} // foutmelding die we de gebruiker mogen laten zien

type Integration = { id: string; team_id: string; type: string; label: string; enabled: boolean; config: any; last_sync_at: string | null };

async function fetchCalendar(id: string): Promise<string> {
  const { data: sec } = await db.from("integration_secrets").select("secret").eq("integration_id", id).maybeSingle();
  if (!sec) throw new Fail("Er is nog geen link ingesteld.");
  const c = cleanUrl(sec.secret, { allowHttp: ALLOW_HTTP });
  if (c.error) throw new Fail(c.error);
  let res: Response;
  try {
    res = await fetch(c.url!, { headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.5", "User-Agent": "Thuis-agenda/1.0" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  } catch {
    throw new Fail("De agenda was niet bereikbaar. De app probeert het later opnieuw.");
  }
  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) throw new Fail("De link werkt niet (meer). Maak een nieuwe link in de agenda waar hij vandaan komt en plak die hier.");
  if (!res.ok) throw new Fail(`Ophalen lukte niet (code ${res.status}). De app probeert het later opnieuw.`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Fail("De agenda is te groot om op te halen.");
  return new TextDecoder().decode(buf);
}

// Eén koppeling ophalen en de afspraken bijwerken. Geeft { ok, count, error? } terug.
async function syncOne(it: Integration) {
  const started = Date.now();
  let added = 0, changed = 0, removed = 0, skipped = 0;
  try {
    if (it.type !== "ical") throw new Fail("Onbekende soort koppeling.");
    const pid = it.config?.person_id, kind = it.config?.kind || "lesson";
    const { data: person } = await db.from("agenda_people").select("id").eq("id", pid).eq("team_id", it.team_id).eq("deleted", false).maybeSingle();
    if (!person) throw new Fail("De persoon staat niet meer in de agenda. Kies iemand anders of verwijder de link.");

    const text = await fetchCalendar(it.id);
    const cal = parseICal(text);
    if (!cal.calendar) throw new Fail("Dit is geen agendalink: er komt geen agenda (iCal) terug. Kijk of je de goede link hebt gekopieerd.");

    const today = localParts(Date.now()).date, from = addDays(today, -WINDOW_BACK), until = addDays(today, WINDOW_AHEAD);
    const out = toAgendaRows(cal.events, { from, until });
    skipped = out.skipped;
    const want = new Map(out.rows.map((r: any) => [r.external_id, r]));

    const { data: have, error: e1 } = await db.from("agenda_items")
      .select("id, external_id, on_date, start_time, end_time, title, place, notes, deleted, person_ids, kind")
      .eq("integration_id", it.id);
    if (e1) throw e1;
    const byExt = new Map((have || []).map((r: any) => [r.external_id, r]));

    const upserts: any[] = [];
    for (const r of want.values() as any) {
      const cur: any = byExt.get(r.external_id);
      const row = { ...r, team_id: it.team_id, integration_id: it.id, person_ids: [pid], kind, days: [] };
      if (!cur) { if (!r.deleted) { upserts.push(row); added++; } continue; }
      const same = cur.on_date === r.on_date && cur.start_time === r.start_time && cur.end_time === r.end_time && cur.title === r.title && cur.place === r.place
        && cur.notes === r.notes && cur.deleted === r.deleted && cur.kind === kind && (cur.person_ids || []).length === 1 && cur.person_ids[0] === pid;
      if (!same) { upserts.push(row); if (r.deleted && !cur.deleted) removed++; else changed++; }
    }
    // niet meer in de link (binnen het venster): verbergen; afspraken van vóór het venster blijven staan
    const gone = (have || []).filter((r: any) => !r.deleted && !want.has(r.external_id) && r.on_date >= from && r.on_date <= until).map((r: any) => r.id);
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await db.from("agenda_items").upsert(upserts.slice(i, i + 500), { onConflict: "integration_id,external_id" });
      if (error) throw error;
    }
    for (let i = 0; i < gone.length; i += 200) {
      const { error } = await db.from("agenda_items").update({ deleted: true }).in("id", gone.slice(i, i + 200));
      if (error) throw error;
    }
    removed += gone.length;
    const count = [...want.values()].filter((r: any) => !r.deleted).length;
    await db.from("integrations").update({ status: "ok", last_sync_at: new Date().toISOString(), last_error: "", last_count: count }).eq("id", it.id);
    await db.from("integration_runs").insert({ integration_id: it.id, team_id: it.team_id, ok: true, added, changed, removed, skipped });
    return { ok: true, count, added, changed, removed, skipped, ms: Date.now() - started };
  } catch (e) {
    // Alleen eigen meldingen tonen: een fout van fetch of de database kan de link bevatten.
    const msg = e instanceof Fail ? e.message : "Er ging iets mis bij het bijwerken. De app probeert het later opnieuw.";
    if (!(e instanceof Fail)) console.error("integration", it.id, (e as any)?.code ?? "", String((e as any)?.message ?? e).replace(/https?:\/\/\S+/g, "[link]").slice(0, 300));
    await db.from("integrations").update({ status: "error", last_sync_at: new Date().toISOString(), last_error: msg }).eq("id", it.id);
    await db.from("integration_runs").insert({ integration_id: it.id, team_id: it.team_id, ok: false, added, changed, removed, skipped, error: msg });
    return { ok: false, error: msg };
  }
}

async function platformOff(type: string) {
  const { data } = await db.from("platform_integrations").select("enabled").eq("type", type).maybeSingle();
  return data ? !data.enabled : false;
}

async function cron() {
  const due = new Date(Date.now() - DUE_MINUTES * 60000).toISOString();
  const { data, error } = await db.from("integrations").select("id, team_id, type, label, enabled, config, last_sync_at, teams!inner(disabled_at)")
    .eq("type", "ical").eq("enabled", true).is("teams.disabled_at", null)
    .or(`last_sync_at.is.null,last_sync_at.lt.${due}`).order("last_sync_at", { ascending: true, nullsFirst: true }).limit(60);
  if (error) throw error;
  if (await platformOff("ical")) return { checked: 0, off: true };
  const list = (data || []) as Integration[];
  const results: any[] = [];
  for (let i = 0; i < list.length; i += 4) results.push(...await Promise.all(list.slice(i, i + 4).map(syncOne)));
  // logboek kort houden: 30 dagen
  await db.from("integration_runs").delete().lt("at", new Date(Date.now() - 30 * 864e5).toISOString());
  return { checked: list.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

async function syncForUser(req: Request, id: string) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Log eerst in." }, 401);
  // Met de rechten van de gebruiker: ziet hij deze koppeling, dan mag hij hem bijwerken.
  const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: it } = await user.from("integrations").select("id, team_id, type, label, enabled, config, last_sync_at").eq("id", id).maybeSingle();
  if (!it) return json({ error: "Onbekende koppeling." }, 404);
  if (await platformOff(it.type)) return json({ error: "Deze koppeling staat (tijdelijk) uit voor iedereen." }, 409);
  if (!it.enabled) return json({ error: "Deze link staat uit." }, 409);
  return json(await syncOne(it as Integration));
}

/* ---------- Gezondheid: ontvangen van de iPhone ---------- */
const text = (body: string, status = 200) => new Response(body, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
async function sha256(s: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function ingest(token: string, body: any) {
  if (!/^[0-9a-f]{40,80}$/.test(token)) return text("Deze link klopt niet. Maak in Training → Gezondheid een nieuwe link.", 401);
  const { data: sec } = await db.from("integration_secrets").select("integration_id").eq("secret", await sha256(token)).maybeSingle();
  const { data: it } = sec ? await db.from("integrations").select("id, team_id, user_id, type, enabled, config, teams!inner(disabled_at)").eq("id", sec.integration_id).maybeSingle() : { data: null };
  if (!it || it.type !== "apple_health") return text("Deze link werkt niet meer. Maak in Training → Gezondheid een nieuwe link.", 401);
  if (!it.enabled || (it as any).teams?.disabled_at || await platformOff("apple_health")) return text("Gezondheid staat uit; er is niets opgeslagen.", 409);
  const { data: may } = await db.rpc("health_may", { p_team: it.team_id, p_user: it.user_id });
  if (!may) return text("Er is geen toestemming (meer); er is niets opgeslagen.", 403);
  const today = localParts(Date.now()).date;
  const r = parseHealthBody(body, today, (it.config?.kinds as string[]) || ["weight", "steps"]);
  if (r.samples.length) {
    const rows = r.samples.map((x: any) => ({ team_id: it.team_id, user_id: it.user_id, integration_id: it.id, kind: x.kind, day: x.day || r.day, value: x.value, unit: x.unit, updated_at: new Date().toISOString() }));
    const { error } = await db.from("health_samples").upsert(rows, { onConflict: "integration_id,kind,day" });
    if (error) { console.error("health", error.code); return text("Opslaan lukte niet. Probeer het later opnieuw.", 500); }
  }
  const { count } = await db.from("health_samples").select("id", { count: "exact", head: true }).eq("integration_id", it.id);
  const ok = r.samples.length > 0;
  if (!ok && !r.problems.length) r.problems.push(r.ignored.length ? `Onbekende gegevens (${r.ignored.slice(0, 3).join(", ")}): stuur steps en/of weight.` : r.empty.length ? `Geen meting gevonden in Gezondheid (${r.empty.map((k: string) => k === "steps" ? "stappen" : "gewicht").join(", ")}).` : "Geen gegevens ontvangen: stuur steps en/of weight.");
  // Wat er binnenkwam ("ontvangen: …") staat alleen in het antwoord aan de telefoon, niet in de database (gedeeld = gezin leest mee).
  const stored = (r.problems[0] || "").replace(/ \(ontvangen: [\s\S]*\)\.$/, ".");
  await db.from("integrations").update({ status: ok ? "ok" : "error", last_sync_at: new Date().toISOString(), last_error: ok ? "" : (stored || "Geen gegevens ontvangen."), last_count: count ?? 0 }).eq("id", it.id);
  await db.from("integration_runs").insert({ integration_id: it.id, team_id: it.team_id, ok, added: r.samples.length, skipped: r.ignored.length, error: ok ? "" : stored });
  // "Opgeslagen: 8.123 stappen (2026-11-22) en 72,4 kg (2026-11-20)."
  const said = r.samples.map((x: any) => (x.kind === "steps" ? `${Math.round(x.value).toLocaleString("nl-NL")} stappen` : `${String(x.value).replace(".", ",")} kg`) + ` (${x.day || r.day})`);
  return text(ok ? `Opgeslagen: ${said.join(" en ")}.${r.problems.length ? " " + r.problems.join(" ") : ""}` : `Niets opgeslagen. ${r.problems.join(" ")}`, ok ? 200 : 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);
  let body: any = {};
  const raw = await req.text();
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
  const token = new URL(req.url).searchParams.get("t");
  try {
    if (token) return await ingest(token, body);
    if (body?.mode === "cron") return json(await cron());
    if (body?.mode === "sync" && typeof body.id === "string") return await syncForUser(req, body.id);
    return json({ error: "Onbekende opdracht" }, 400);
  } catch (e) {
    console.error("integrations", String((e as any)?.message ?? e).replace(/https?:\/\/\S+/g, "[link]").slice(0, 300));
    return json({ error: "Er ging iets mis. Probeer het later opnieuw." }, 500);
  }
});
