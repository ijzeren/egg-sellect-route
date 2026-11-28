// Thuis — producten en prijzen voor Boodschappen (Supabase Edge Function `groceries-products`).
//
// Albert Heijn zonder inloggen (onofficiële API van de AH-app, zie docs/plan-groceries.md). De browser mag AH niet
// rechtstreeks aanroepen (CORS) en het AH-token hoort niet op de telefoon; daarom loopt alles via deze functie.
//
// Aanroepen (POST, JSON, ingelogd; alleen voor wie Boodschappen mag gebruiken in dat gezin):
//   { "mode": "search",  "team": "<uuid>", "q": "halfvolle melk" }  → { products: [...] } (ook in de cache)
//   { "mode": "refresh", "team": "<uuid>" }                          → prijzen van vandaag voor de gekozen producten
//                                                                      van het gezin, plus vergelijkbare producten
//                                                                      (zelfde AH-subcategorie) voor "goedkoper" en "gezonder"
// De app leest daarna de cache (grocery_products) gewoon via REST.
//
// Opslag: grocery_products (cache, geen gezinsgegevens), grocery_store_state (alleen de server: AH-token, wanneer een
// subcategorie is opgehaald, tellers per gezin). Zet "Verify JWT" UIT (config.toml); de functie controleert zelf.
import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeList, cleanQuery, STORE } from "./ah.mjs";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
class Fail extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const AH = "https://api.ah.nl";
// De API verwacht de iPhone-app. Weigert AH ineens alles, werk dan eerst deze versie bij.
const AH_HEADERS = { "User-Agent": "Appie/9.48 (iPhone17,3; iPhone; CPU OS 26_1 like Mac OS X)", "x-application": "AHWEBSHOP", "x-clientname": "appie-ios", "x-clientversion": "9.48", Accept: "application/json" };
const CALLS_PER_MIN = 30;        // zoeken + bijwerken per gezin per minuut
const MAX_SUBS = 25;             // subcategorieën per keer bijwerken (de rest de volgende keer)
const UNAVAILABLE = "Albert Heijn geeft nu geen prijzen. Probeer het later opnieuw.";

const localDate = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/* ---------- opslag voor de server ---------- */
async function getState(key: string) {
  const { data } = await db.from("grocery_store_state").select("value, updated_at").eq("key", key).maybeSingle();
  return data as { value: any; updated_at: string } | null;
}
async function setState(key: string, value: unknown) {
  const { error } = await db.from("grocery_store_state").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ---------- Albert Heijn ---------- */
async function ahToken(fresh = false): Promise<string> {
  if (!fresh) {
    const s = await getState("ah:token");
    if (s?.value?.access_token && Date.parse(s.value.expires_at) > Date.now() + 3600e3) return s.value.access_token;
  }
  const res = await fetch(`${AH}/mobile-auth/v1/auth/token/anonymous`, { method: "POST", headers: { ...AH_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ clientId: "appie" }), signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res || !res.ok) { console.error("ah token", res?.status); throw new Fail(UNAVAILABLE, 502); }
  const d = await res.json();
  if (!d?.access_token) throw new Fail(UNAVAILABLE, 502);
  // De duur staat in het antwoord (nu ± 7 dagen); niet zelf aannemen.
  await setState("ah:token", { access_token: d.access_token, expires_at: new Date(Date.now() + (Number(d.expires_in) || 3600) * 1000).toISOString() });
  return d.access_token;
}
async function ahGet(path: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const tok = await ahToken(attempt > 0);
    const res = await fetch(AH + path, { headers: { ...AH_HEADERS, Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (res && res.status === 401 && attempt === 0) continue; // token verlopen: één keer een nieuw token
    if (!res || !res.ok) { console.error("ah", path.split("?")[0], res?.status); throw new Fail(UNAVAILABLE, 502); }
    return await res.json();
  }
}
async function ahSearch(q: string, size: number) {
  const p = new URLSearchParams({ query: q, page: "0", size: String(size), sortOn: "RELEVANCE" });
  const d = await ahGet(`/mobile-services/product/search/v2?${p}`);
  return normalizeList(d?.products, new Date().toISOString());
}
async function ahByIds(ids: string[]) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const p = new URLSearchParams({ sortOn: "INPUT_PRODUCT_IDS" });
    for (const id of ids.slice(i, i + 50)) p.append("ids", id);
    out.push(...normalizeList(await ahGet(`/mobile-services/product/search/v2/products?${p}`), new Date().toISOString()));
  }
  return out;
}
async function saveProducts(rows: any[]) {
  if (!rows.length) return;
  const { error } = await db.from("grocery_products").upsert(rows, { onConflict: "store,product_id" });
  if (error) throw error;
}

/* ---------- wie mag dit ---------- */
async function allowed(req: Request, team: unknown) {
  if (typeof team !== "string" || !/^[0-9a-f-]{36}$/.test(team)) throw new Fail("Onbekend gezin.");
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Fail("Log eerst in.", 401);
  const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await user.rpc("has_app", { t: team, a: "groceries" });
  if (error || data !== true) throw new Fail("Boodschappen staat niet aan voor jou in dit gezin.", 403);
  return team;
}

/* ---------- opdrachten ---------- */
// Niet te vaak per gezin (zoeken en bijwerken samen).
async function limit(team: string) {
  const key = `calls:${team}`, minute = new Date().toISOString().slice(0, 16), s = await getState(key);
  const n = s?.value?.minute === minute ? Number(s.value.n) || 0 : 0;
  if (n >= CALLS_PER_MIN) throw new Fail("Even rustig aan: probeer het over een minuut opnieuw.", 429);
  await setState(key, { minute, n: n + 1 });
}

async function search(team: string, q: unknown) {
  const query = cleanQuery(q);
  if (query.length < 2) throw new Fail("Typ wat je zoekt.");
  await limit(team);
  const rows = await ahSearch(query, 30);
  await saveProducts(rows);
  return { products: rows };
}

// Alleen wat nog niet van vandaag is, gaat naar AH. Daarna nog eens aanroepen kost AH dus niets.
async function refresh(team: string) {
  await limit(team);
  const today = localDate(Date.now());
  const { data: choices, error } = await db.from("grocery_choices").select("product_id").eq("team_id", team).eq("store", STORE);
  if (error) throw error;
  const ids = [...new Set((choices || []).map((c: any) => String(c.product_id)))].slice(0, 300);
  if (!ids.length) return { products: 0, searches: 0 };
  const { data: have } = await db.from("grocery_products").select("product_id, sub_category, fetched_at").eq("store", STORE).in("product_id", ids);
  const known = new Map((have || []).map((p: any) => [p.product_id, p]));
  const stale = ids.filter((id) => { const p: any = known.get(id); return !p || localDate(Date.parse(p.fetched_at)) !== today; });
  let products = 0;
  if (stale.length) {
    const rows = await ahByIds(stale);
    await saveProducts(rows);
    products = rows.length;
    // Niet meer te krijgen bij AH: zo markeren, dan ziet de app dat.
    const back = new Set(rows.map((r: any) => r.product_id));
    const gone = stale.filter((id) => !back.has(id) && known.has(id));
    if (gone.length) await db.from("grocery_products").update({ available: false, fetched_at: new Date().toISOString() }).eq("store", STORE).in("product_id", gone);
    for (const r of rows) known.set(r.product_id, r);
  }
  // Vergelijkbare producten: dezelfde AH-subcategorie, één keer per dag (gedeeld door alle gezinnen).
  const subs = [...new Set([...known.values()].map((p: any) => p.sub_category).filter(Boolean))] as string[];
  let searches = 0;
  const keys = subs.map((s) => `ah:sub:${s.toLowerCase()}`);
  const { data: done } = keys.length ? await db.from("grocery_store_state").select("key, value").in("key", keys) : { data: [] };
  const doneToday = new Set((done || []).filter((r: any) => r.value?.date === today).map((r: any) => r.key));
  for (const sub of subs) {
    if (searches >= MAX_SUBS) break;
    const sk = `ah:sub:${sub.toLowerCase()}`;
    if (doneToday.has(sk)) continue;
    const rows = (await ahSearch(cleanQuery(sub), 60)).filter((r: any) => r.sub_category === sub);
    await saveProducts(rows);
    await setState(sk, { date: today, n: rows.length });
    searches++;
  }
  return { products, searches };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);
  let body: any = null;
  try { body = await req.json(); } catch { return json({ error: "Onbekende opdracht" }, 400); }
  try {
    const team = await allowed(req, body?.team);
    if (body.mode === "search") return json(await search(team, body.q));
    if (body.mode === "refresh") return json(await refresh(team));
    return json({ error: "Onbekende opdracht" }, 400);
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    console.error("groceries-products", String((e as any)?.message ?? e).slice(0, 300));
    return json({ error: "Er ging iets mis. Probeer het later opnieuw." }, 500);
  }
});
