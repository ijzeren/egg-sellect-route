// Thuis — koppelingen ophalen (Supabase Edge Function `integrations`).
//
// Aanroepen (POST, JSON):
//   { "mode": "cron" }               elke 30 min via pg_cron (cron.sql): alle agendalinks die aan de beurt zijn
//   { "mode": "sync", "id": "…" }    "Nu bijwerken" in de app (ingelogd; alleen een koppeling die je mag zien)
//   { "mode": "bank_info", "team" }            Financiën: mag dit gezin een bankrekening koppelen? (ingelogd)
//   { "mode": "bank_start", "team", "redirect", "id"? }  koppelen of vernieuwen: geeft de link naar de bank (ingelogd)
//   { "mode": "bank_finish", "code", "state" }  terug van de bank: sessie maken, rekeningen koppelen, eerste keer ophalen.
//                                    Zonder login: de state (eenmalig, 30 min) bewijst wie het is. Op de iPhone komt
//                                    de bank vaak terug in Safari, waar de app niet is ingelogd.
//   { "mode": "bank_unlink", "id" }  ontkoppelen (ingelogd, alleen je eigen koppeling); transacties blijven
//   POST …/integrations?t=<token>    Gezondheid: de opdracht op de iPhone stuurt { steps, weight, date? } (zie health.mjs);
//                                    antwoord is gewone tekst, zodat Opdrachten het kan tonen
//
// SUPABASE_URL, SUPABASE_ANON_KEY en SUPABASE_SERVICE_ROLE_KEY levert Supabase zelf.
// Zet "Verify JWT" UIT voor deze functie (config.toml): de cron-aanroep heeft geen gebruiker; "sync" controleert zelf.
// De cron-modus mag iedereen aanroepen: hij haalt alleen koppelingen op die langer dan 25 minuten niet zijn bijgewerkt,
// dus vaker aanroepen doet niets extra.
// Privacy: de link (integration_secrets) komt nooit in een antwoord, foutmelding of logboek.
// Lokaal testen met http-links: INTEGRATIONS_ALLOW_HTTP=1 (zie supabase/README.md).
// Bank (Enable Banking, zie bank.mjs): secrets EB_APP_ID, EB_PRIVATE_KEY (PEM), EB_TEAM_IDS (gezinnen die het mogen,
// komma's: de gratis "beperkte modus" werkt alleen voor rekeningen van de eigenaar van de Enable Banking-app),
// EB_REDIRECT_URLS (toegestane terugkeeradressen, komma's). EB_API_URL alleen voor lokaal testen met een nepbank.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseICal, toAgendaRows, cleanUrl, localParts } from "./ical.mjs";
import { parseHealthBody } from "./health.mjs";
import * as EB from "./bank.mjs";

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
async function syncOne(it: Integration, psu?: Record<string, string>) {
  if (it.type === "bank") return syncBank(it, psu);
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
  for (let i = 0; i < list.length; i += 4) results.push(...await Promise.all(list.slice(i, i + 4).map((x) => syncOne(x))));
  // bankrekeningen: één keer per dag (zonder de gebruiker erbij mag het maar 4 keer per dag); na een fout pas morgen weer
  if (EB_APP && !(await platformOff("bank"))) {
    const bankDue = new Date(Date.now() - BANK_DUE_HOURS * 3600000).toISOString();
    const { data: banks } = await db.from("integrations").select("id, team_id, user_id, type, label, enabled, config, last_sync_at, teams!inner(disabled_at)")
      .eq("type", "bank").eq("enabled", true).is("teams.disabled_at", null)
      .or(`last_sync_at.is.null,last_sync_at.lt.${bankDue}`).order("last_sync_at", { ascending: true, nullsFirst: true }).limit(20);
    for (const b of (banks || []) as Integration[]) if (b.config?.valid_until && EB_TEAMS.includes(b.team_id)) results.push(await syncBank(b));
  }
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
  if (it.type === "bank" && it.last_sync_at && Date.now() - Date.parse(it.last_sync_at) < 10 * 60000) return json({ error: "Net bijgewerkt. Probeer het over 10 minuten opnieuw." }, 429);
  return json(await syncOne(it as Integration, it.type === "bank" ? psuHeaders(req) : undefined));
}

/* ---------- Financiën: bankrekeningen via Enable Banking ---------- */
const EB_API = env("EB_API_URL") || EB.API;
const EB_APP = env("EB_APP_ID");
const EB_KEY = env("EB_PRIVATE_KEY");
const EB_TEAMS = env("EB_TEAM_IDS").split(",").map((x) => x.trim()).filter(Boolean);
const EB_REDIRECTS = env("EB_REDIRECT_URLS").split(",").map((x) => x.trim()).filter(Boolean);
const BANK_DUE_HOURS = 20;
const PENDING_MINUTES = 30;

// De gebruiker is erbij (Nu bijwerken, terug van de bank): dat mag de bank weten; telt niet mee voor de 4 per dag.
function psuHeaders(req: Request): Record<string, string> {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ua = req.headers.get("user-agent") || "";
  return { ...(ip ? { "Psu-Ip-Address": ip } : {}), ...(ua ? { "Psu-User-Agent": ua.slice(0, 200) } : {}) };
}
async function eb(path: string, opts: { method?: string; body?: unknown; psu?: Record<string, string> } = {}) {
  const jwt = await EB.signJwt(EB_APP, EB_KEY);
  let res: Response;
  try {
    res = await fetch(EB_API + path, { method: opts.method || "GET", headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json", "Content-Type": "application/json", ...(opts.psu || {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Fail("De bank was niet bereikbaar. De app probeert het later opnieuw.");
  }
  const raw = await res.text();
  let data: any = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok) {
    const kind = EB.errorKind(res.status, data);
    console.error("bank", path.split("?")[0].replace(/[0-9a-f-]{36}/g, ":id"), res.status, data?.error ?? "");
    throw Object.assign(new Fail(EB.ERROR_TEXT[kind as keyof typeof EB.ERROR_TEXT]), { kind });
  }
  return data;
}
async function asUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await client.auth.getUser(token);
  return data?.user ? { id: data.user.id, client } : null;
}
async function bankAllowed(u: { client: any }, team: string) {
  if (!EB_APP || !EB_KEY || !EB_TEAMS.includes(team) || await platformOff("bank")) return false;
  const { data } = await u.client.rpc("has_app", { t: team, a: "finance" });
  return data === true;
}

async function bankInfo(req: Request, team: string) {
  const u = await asUser(req);
  if (!u) return json({ error: "Log eerst in." }, 401);
  return json({ available: await bankAllowed(u, team) });
}

async function bankStart(req: Request, body: any) {
  const u = await asUser(req);
  if (!u) return json({ error: "Log eerst in." }, 401);
  const team = String(body.team || ""), redirect = String(body.redirect || "");
  if (!(await bankAllowed(u, team))) return json({ error: "Bankrekeningen koppelen kan (nog) niet in dit gezin." }, 403);
  if (!EB_REDIRECTS.includes(redirect)) return json({ error: "Dit adres mag niet als terugkeeradres. Open Financiën via de gewone app." }, 400);
  try {
    const bank = EB.findAspsp(await eb("/aspsps?country=NL&psu_type=personal&service=AIS"));
    if (!bank) throw new Fail("Rabobank staat niet in de lijst van Enable Banking.");
    // één bankkoppeling per persoon per gezin; opnieuw koppelen gebruikt dezelfde
    let { data: it } = await db.from("integrations").select("id, config").eq("team_id", team).eq("user_id", u.id).eq("type", "bank").maybeSingle();
    if (body.id && (!it || it.id !== body.id)) return json({ error: "Onbekende koppeling." }, 404);
    const state = EB.randomToken();
    const auth = await eb("/auth", { method: "POST", psu: psuHeaders(req), body: {
      access: { valid_until: EB.validUntil(Date.now(), bank.maximum_consent_validity), balances: true, transactions: true },
      aspsp: { name: bank.name, country: bank.country }, state, redirect_url: redirect, psu_type: "personal", language: "nl",
    } });
    const config = { ...(it?.config || {}), aspsp: bank.name, psu_headers: bank.required_psu_headers || [], pending: await EB.sha256(state), pending_at: new Date().toISOString() };
    if (it) await db.from("integrations").update({ config, updated_at: new Date().toISOString() }).eq("id", it.id);
    else {
      const { error } = await db.from("integrations").insert({ team_id: team, user_id: u.id, type: "bank", label: bank.name.slice(0, 40), config });
      if (error) throw error;
    }
    return json({ url: auth.url });
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, 400);
    throw e;
  }
}

async function bankFinish(req: Request, body: any) {
  const code = String(body.code || ""), state = String(body.state || "");
  if (!code || !/^[0-9a-f]{64}$/.test(state)) return json({ error: "Deze link klopt niet. Probeer het koppelen opnieuw." }, 400);
  const { data: it } = await db.from("integrations").select("id, team_id, user_id, type, label, enabled, config, last_sync_at").eq("type", "bank").eq("config->>pending", await EB.sha256(state)).maybeSingle();
  if (!it || !it.config?.pending_at || Date.now() - Date.parse(it.config.pending_at) > PENDING_MINUTES * 60000) return json({ error: "Het koppelen duurde te lang of is al afgerond. Probeer het opnieuw." }, 400);
  if (!EB_TEAMS.includes(it.team_id)) return json({ error: "Bankrekeningen koppelen kan (nog) niet in dit gezin." }, 403);
  const { pending, pending_at, ...rest } = it.config;
  try {
    const session = await eb("/sessions", { method: "POST", body: { code }, psu: psuHeaders(req) });
    const accounts = EB.sessionAccounts(session);
    // oude sessie bij de bank sluiten (vernieuwen)
    const { data: old } = await db.from("integration_secrets").select("secret").eq("integration_id", it.id).maybeSingle();
    if (old?.secret && old.secret !== session.session_id) await eb(`/sessions/${old.secret}`, { method: "DELETE" }).catch(() => {});
    await db.from("integration_secrets").upsert({ integration_id: it.id, secret: session.session_id, updated_at: new Date().toISOString() });
    await db.from("finance_bank_accounts").delete().eq("integration_id", it.id);
    // rekeningen: bestaande van deze persoon koppelen, nieuwe aanmaken; die van een ander overslaan
    const { data: have } = await db.from("finance_accounts").select("id, user_id, iban_hash, name").eq("team_id", it.team_id);
    const linked: string[] = [], skipped: string[] = [];
    for (const a of accounts) {
      const hash = await EB.ibanHash(it.team_id, a.iban), last4 = a.iban.slice(-4).replace(/[^A-Z0-9]/g, "");
      let acc = (have || []).find((x: any) => x.iban_hash === hash);
      if (acc && acc.user_id !== it.user_id) { skipped.push(`••${last4}`); continue; }
      if (!acc) {
        const { data: row, error } = await db.from("finance_accounts").insert({ team_id: it.team_id, user_id: it.user_id, name: (a.name || `Rabobank ${last4}`).slice(0, 40), kind: a.kind, iban_last4: last4, iban_hash: hash, currency: a.currency, integration_id: it.id }).select("id, name").single();
        if (error) throw error;
        acc = row;
      } else await db.from("finance_accounts").update({ integration_id: it.id }).eq("id", acc.id);
      await db.from("finance_bank_accounts").insert({ integration_id: it.id, account_id: acc.id, uid: a.uid });
      linked.push(acc.name);
    }
    if (!linked.length) throw new Fail(skipped.length ? `${skipped.join(", ")} heeft iemand anders in het gezin al toegevoegd. Vraag diegene om de rekening te koppelen en met je te delen.` : EB.ERROR_TEXT.noaccounts);
    const config = { ...rest, valid_until: session.access?.valid_until || null, accounts: linked.length };
    await db.from("integrations").update({ config, enabled: true, status: "new", last_error: "", last_sync_at: null, updated_at: new Date().toISOString() }).eq("id", it.id);
    const sync = linked.length ? await syncBank({ ...it, config } as Integration, psuHeaders(req)) : null;
    return json({ ok: true, linked, skipped, sync });
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    await db.from("integrations").update({ config: rest }).eq("id", it.id);
    return json({ error: e.message }, 400);
  }
}

async function bankUnlink(req: Request, id: string) {
  const u = await asUser(req);
  if (!u) return json({ error: "Log eerst in." }, 401);
  const { data: it } = await u.client.from("integrations").select("id, type, user_id").eq("id", id).maybeSingle();
  if (!it || it.type !== "bank" || it.user_id !== u.id) return json({ error: "Onbekende koppeling." }, 404);
  const { data: sec } = await db.from("integration_secrets").select("secret").eq("integration_id", id).maybeSingle();
  if (sec?.secret && EB_APP) await eb(`/sessions/${sec.secret}`, { method: "DELETE" }).catch(() => {});
  await db.from("integrations").delete().eq("id", id);
  return json({ ok: true });
}

// Alle rekeningen van één bankkoppeling bijwerken: transacties sinds de laatste (een week overlap) en het saldo.
async function syncBank(it: Integration, psu?: Record<string, string>) {
  const started = Date.now();
  let added = 0, skipped = 0;
  try {
    if (!EB_APP || !EB_KEY) throw new Fail(EB.ERROR_TEXT.app);
    if (!it.config?.valid_until) throw new Fail("Nog niet gekoppeld bij de bank.");
    if (Date.parse(it.config.valid_until) < Date.now()) throw new Fail("De toestemming bij de bank is verlopen. Koppel de rekening opnieuw.");
    if (!psu && (it.config.psu_headers || []).length) throw new Fail(EB.ERROR_TEXT.psu);
    const { data: links } = await db.from("finance_bank_accounts").select("account_id, uid").eq("integration_id", it.id);
    if (!links?.length) throw new Fail("Er is geen rekening gekoppeld. Koppel opnieuw en kies je rekening(en).");
    const { data: own } = await db.from("finance_accounts").select("iban_hash").eq("team_id", it.team_id);
    const ownHashes = new Set((own || []).map((x: any) => x.iban_hash));
    const today = localParts(Date.now()).date;
    for (const l of links) {
      const { data: last } = await db.from("finance_transactions").select("booked_on").eq("account_id", l.account_id).order("booked_on", { ascending: false }).limit(1).maybeSingle();
      const from = EB.dateFrom(last?.booked_on || null, today);
      const all: any[] = [];
      let key = "";
      for (let page = 0; page < 30; page++) {
        const q = new URLSearchParams({ date_from: from, ...(key ? { continuation_key: key } : {}) });
        const r = await eb(`/accounts/${encodeURIComponent(l.uid)}/transactions?${q}`, { psu });
        all.push(...(r?.transactions || []));
        key = r?.continuation_key || "";
        if (!key) break;
      }
      const rows = EB.mapTransactions(all);
      const { data: existing } = await db.from("finance_transactions").select("ext_id, booked_on, amount").eq("account_id", l.account_id).gte("booked_on", from);
      const fresh = EB.dropKnown(rows, existing || []);
      skipped += rows.length - fresh.length;
      const hashes = new Map<string, string>();
      const out = [];
      for (const r of fresh as any[]) {
        const { counterparty_iban, ...row } = r;
        if (counterparty_iban && !hashes.has(counterparty_iban)) hashes.set(counterparty_iban, await EB.ibanHash(it.team_id, counterparty_iban));
        const h = counterparty_iban ? hashes.get(counterparty_iban)! : "";
        out.push({ ...row, team_id: it.team_id, account_id: l.account_id, counterparty_hash: h, excluded: !!h && ownHashes.has(h) });
      }
      for (let i = 0; i < out.length; i += 500) {
        const { error } = await db.from("finance_transactions").upsert(out.slice(i, i + 500), { onConflict: "account_id,ext_id", ignoreDuplicates: true });
        if (error) throw error;
      }
      added += out.length;
      const bal = EB.pickBalance(await eb(`/accounts/${encodeURIComponent(l.uid)}/balances`, { psu }), today);
      await db.from("finance_accounts").update({ imported_at: new Date().toISOString(), ...(bal ? { balance: bal.amount, balance_on: bal.on } : {}) }).eq("id", l.account_id);
    }
    await db.from("integrations").update({ status: "ok", last_sync_at: new Date().toISOString(), last_error: "", last_count: added }).eq("id", it.id);
    await db.from("integration_runs").insert({ integration_id: it.id, team_id: it.team_id, ok: true, added, skipped });
    return { ok: true, added, skipped, ms: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Fail ? e.message : "Er ging iets mis bij het bijwerken. De app probeert het later opnieuw.";
    if (!(e instanceof Fail)) console.error("bank", it.id, (e as any)?.code ?? "", String((e as any)?.message ?? e).slice(0, 300));
    await db.from("integrations").update({ status: "error", last_sync_at: new Date().toISOString(), last_error: msg }).eq("id", it.id);
    await db.from("integration_runs").insert({ integration_id: it.id, team_id: it.team_id, ok: false, added, skipped, error: msg });
    return { ok: false, error: msg };
  }
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
    if (body?.mode === "bank_info" && typeof body.team === "string") return await bankInfo(req, body.team);
    if (body?.mode === "bank_start") return await bankStart(req, body);
    if (body?.mode === "bank_finish") return await bankFinish(req, body);
    if (body?.mode === "bank_unlink" && typeof body.id === "string") return await bankUnlink(req, body.id);
    return json({ error: "Onbekende opdracht" }, 400);
  } catch (e) {
    console.error("integrations", String((e as any)?.message ?? e).replace(/https?:\/\/\S+/g, "[link]").slice(0, 300));
    return json({ error: "Er ging iets mis. Probeer het later opnieuw." }, 500);
  }
});
