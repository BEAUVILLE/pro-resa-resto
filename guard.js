/* DIGIY GUARD — UNIVERSAL (slug-first, page-safe) */

/* ===== Supabase ===== */
const SUPABASE_URL  = window.DIGIY_SUPABASE_URL  || "https://wesqmwjjtsefyjnluosj.supabase.co";
const SUPABASE_ANON = window.DIGIY_SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

const PAY_URL_BASE = "https://commencer-a-payer.digiylyfe.com/";

/* ===== Helpers ===== */

function getSlug() {
  return (new URL(location.href).searchParams.get("slug") || "").trim().toLowerCase();
}

function moduleFromSlug(slug){
  const p = (slug || "").split("-")[0] || "";
  const map = { resa:"RESA", resto:"RESTO", pos:"POS", loc:"LOC", driver:"DRIVER" };
  return map[p] || null;
}

function readPinSession() {
  try {
    const raw = localStorage.getItem("DIGIY_ACCESS");
    if (!raw) return null;
    const s = JSON.parse(raw);
    // normalise
    if (s?.slug) s.slug = String(s.slug).toLowerCase();
    return s;
  } catch {
    return null;
  }
}

function buildPayUrl(module, slug) {
  const u = new URL(PAY_URL_BASE);
  if (module) u.searchParams.set("module", module);
  if (slug) u.searchParams.set("slug", slug);
  return u.toString();
}

function createClient() {
  if (!window.supabase?.createClient) throw new Error("Supabase SDK manquant.");
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false }
  });
}

/* ===== Core Guard ===== */

async function resolvePhoneFromSlug(sb, slug) {
  const { data, error } = await sb
    .from("digiy_subscriptions_public")
    .select("phone,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data?.phone || null;
}

async function hasAccess(sb, phone, module) {
  const { data, error } = await sb.rpc("digiy_has_access", {
    p_phone: phone,
    p_module: module
  });

  if (error) throw error;
  return !!data;
}

async function guardCheck() {
  const sb = createClient();
  const slug = getSlug();
  const module = moduleFromSlug(slug);
  const pinSession = readPinSession();

  const state = {
    ok: true,
    module: module || null,
    slug: slug || null,
    phone: null,
    pin_ok: false,
    access_ok: false,
    pay_url: buildPayUrl(module, slug),
    reason: null
  };

  if (!slug) {
    state.reason = "missing_slug";
    return state;
  }

  if (!module) {
    state.reason = "unknown_module";
    return state;
  }

  // PIN OK si session correspond au slug
  if (pinSession?.slug && pinSession.slug === slug) {
    state.pin_ok = true;
  }

  const phone = await resolvePhoneFromSlug(sb, slug);
  if (!phone) {
    state.reason = "slug_unknown";
    return state;
  }

  state.phone = phone;

  const access = await hasAccess(sb, phone, module);
  state.access_ok = access;

  if (!access) state.reason = "no_subscription";

  return state;
}

/* ===== Public API ===== */

window.DIGIY_GUARD = {
  ready: null,
  state: null,
  refresh: async () => {
    window.DIGIY_GUARD.state = await guardCheck();
    return window.DIGIY_GUARD.state;
  }
};

window.digiyRequireAccess = async () => await window.DIGIY_GUARD.refresh();

window.DIGIY_GUARD.ready = window.digiyRequireAccess().catch(e => {
  window.DIGIY_GUARD.state = {
    ok: false,
    module: null,
    error: String(e?.message || e)
  };
  return window.DIGIY_GUARD.state;
});
