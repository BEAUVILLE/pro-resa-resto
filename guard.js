/* DIGIY GUARD — PRO-RESA (slug-first, page-safe) */

const MODULE = "RESA"; // ⚠️ module PAY (abonnement)

/* ===== Supabase ===== */
const SUPABASE_URL  = window.DIGIY_SUPABASE_URL  || "https://wesqmwjjtsefyjnluosj.supabase.co";
const SUPABASE_ANON = window.DIGIY_SUPABASE_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

const PAY_URL_BASE = "https://commencer-a-payer.digiylyfe.com/";

/* ===== Helpers ===== */

function getSlug() {
  return (new URL(location.href).searchParams.get("slug") || "").trim();
}

function readPinSession() {
  try {
    const raw = localStorage.getItem("DIGIY_ACCESS");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildPayUrl(slug) {
  const u = new URL(PAY_URL_BASE);
  u.searchParams.set("module", MODULE);
  if (slug) u.searchParams.set("slug", slug);
  return u.toString();
}

function createClient() {
  if (!window.supabase?.createClient) {
    throw new Error("Supabase SDK manquant.");
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false }
  });
}

/* ===== Core Guard ===== */

async function resolvePhoneFromSlug(sb, slug) {
  const { data, error } = await sb
    .from("digiy_subscriptions_public")
    .select("phone,module,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data?.phone) return null;
  return data.phone;
}

async function hasAccess(sb, phone) {
  const { data, error } = await sb.rpc("digiy_has_access", {
    p_phone: phone,
    p_module: MODULE
  });

  if (error) throw error;
  return !!data;
}

async function guardCheck() {
  const sb = createClient();
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
    reason: null
  };

  if (!slug) {
    state.reason = "missing_slug";
    return state;
  }

  if (pinSession?.slug === slug) {
    state.pin_ok = true;
  }

  const phone = await resolvePhoneFromSlug(sb, slug);
  if (!phone) {
    state.reason = "slug_unknown";
    return state;
  }

  state.phone = phone;

  const access = await hasAccess(sb, phone);
  state.access_ok = access;

  if (!access) {
    state.reason = "no_subscription";
  }

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

window.digiyRequireAccess = async function() {
  return await window.DIGIY_GUARD.refresh();
};

window.DIGIY_GUARD.ready = window.digiyRequireAccess().catch(e => {
  window.DIGIY_GUARD.state = {
    ok: false,
    module: MODULE,
    error: String(e?.message || e)
  };
  return window.DIGIY_GUARD.state;
});
