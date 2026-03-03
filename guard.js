/* DIGIY GUARD — RESA (slug-first, page-safe) */

const MODULE = "RESA";

/** ✅ Mets tes clés ici (ou définis window.DIGIY_SUPABASE_URL / window.DIGIY_SUPABASE_ANON ailleurs) */
const SUPABASE_URL = window.DIGIY_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = window.DIGIY_SUPABASE_ANON || "YOUR_SUPABASE_ANON_KEY";

/** URL “Commencer à payer / ABOS” (ton hub). Adapte si besoin. */
const PAY_URL_BASE = "https://beauville.github.io/commencer-a-payer";

function getSlug() {
  const u = new URL(location.href);
  return (u.searchParams.get("slug") || "").trim();
}

function buildPayUrl(slug) {
  const u = new URL(PAY_URL_BASE);
  // On passe module + slug pour préremplir côté ABOS si tu veux
  u.searchParams.set("module", MODULE);
  if (slug) u.searchParams.set("slug", slug);
  return u.toString();
}

function ensureSupabase() {
  if (!window.supabase?.createClient) {
    throw new Error("Supabase SDK manquant. Ajoute <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> dans <head>.");
  }
  if (!SUPABASE_URL.includes("supabase.co") || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
    throw new Error("Clés Supabase non configurées (SUPABASE_URL / SUPABASE_ANON_KEY).");
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { "x-digiy-module": MODULE } },
  });
}

async function resolvePhoneFromSlug(sb, slug) {
  // View publique minimaliste: digiy_subscriptions_public (slug, phone, module)
  const { data, error } = await sb
    .from("digiy_subscriptions_public")
    .select("phone,module,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data?.phone) return null;

  // Si la view expose module, on filtre soft (pas bloquant si null)
  if (data.module && data.module !== MODULE) {
    // slug d’un autre module → on laisse cockpit gérer (message)
    return null;
  }
  return data.phone;
}

async function hasAccess(sb, phone) {
  const { data, error } = await sb.rpc("digiy_has_access", { p_phone: phone, p_module: MODULE });
  if (error) throw error;
  return !!data;
}

function readPinSession() {
  try {
    const raw = localStorage.getItem("DIGIY_ACCESS");
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Session PIN = autorise la personne, pas l’abonnement
    if (!s?.slug) return null;
    return s;
  } catch {
    return null;
  }
}

async function guardCheck() {
  const sb = ensureSupabase();
  const slug = getSlug();
  const pinSession = readPinSession();

  const state = {
    ok: true,
    module: MODULE,
    slug: slug || null,
    phone: null,
    pin_ok: false,
    access_ok: false,
    pay_url: buildPayUrl(slug),
    reason: null,
  };

  // PIN: si on a une session et qu’elle correspond au slug → pin_ok=true
  if (pinSession?.slug && slug && pinSession.slug === slug) state.pin_ok = true;

  if (!slug) {
    state.reason = "missing_slug";
    return state; // page-safe: on ne casse pas, on laisse l’UI afficher “passe par QR”
  }

  const phone = await resolvePhoneFromSlug(sb, slug);
  if (!phone) {
    state.reason = "slug_unknown";
    return state;
  }
  state.phone = phone;

  // Accès abonnement (module)
  state.access_ok = await hasAccess(sb, phone);
  if (!state.access_ok) state.reason = "no_subscription";

  return state;
}

/** API publique */
window.DIGIY_GUARD = {
  ready: null,
  state: null,
  refresh: async () => {
    window.DIGIY_GUARD.state = await guardCheck();
    return window.DIGIY_GUARD.state;
  },
};

window.digiyRequireAccess = async function digiyRequireAccess() {
  const st = await window.DIGIY_GUARD.refresh();
  return st;
};

// Auto-run (page-safe)
window.DIGIY_GUARD.ready = window.digiyRequireAccess().catch((e) => {
  window.DIGIY_GUARD.state = { ok: false, module: MODULE, error: String(e?.message || e) };
  return window.DIGIY_GUARD.state;
});
