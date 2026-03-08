/* DIGIY GUARD — UNIVERSAL (slug-first, page-safe, preview-safe)
   VERSION: single shared Supabase client
*/
(() => {
  "use strict";

  /* ===== Supabase ===== */
  const SUPABASE_URL =
    window.DIGIY_SUPABASE_URL ||
    "https://wesqmwjjtsefyjnluosj.supabase.co";

  const SUPABASE_ANON =
    window.DIGIY_SUPABASE_ANON_KEY ||
    window.DIGIY_SUPABASE_ANON ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  const PAY_URL_BASE = "https://commencer-a-payer.digiylyfe.com/";

  /* ===== Mode =====
     true  = sans identité => aperçu autorisé
     false = sans identité => non exploitable
  */
  const ALLOW_PREVIEW_WITHOUT_IDENTITY = true;

  /* ===== Helpers ===== */

  function getQuery() {
    return new URL(location.href).searchParams;
  }

  function normPhone(v) {
    const d = String(v || "").replace(/[^\d]/g, "");
    return d.length >= 9 ? d : "";
  }

  function normSlug(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normModule(v) {
    const raw = String(v || "").trim().toUpperCase();
    const alias = {
      CAISSE: "POS",
      POS: "POS",
      DRIVER: "DRIVER",
      LOC: "LOC",
      RESTO: "RESTO",
      RESA: "RESA",
      RESA_TABLE: "RESA",
      MARKET: "MARKET",
      BUILD: "BUILD",
      EXPLORE: "EXPLORE",
      FRET_PRO: "FRET_PRO",
      FRET_CHAUF: "FRET_PRO",
      FRET_CLIENT: "FRET_CLIENT_PRO",
      FRET_CLIENT_PRO: "FRET_CLIENT_PRO"
    };
    return alias[raw] || raw || "";
  }

  function safeJsonParse(v) {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }

  function moduleStorageBase(moduleName) {
    const m = normModule(moduleName);
    return m ? `digiy_${m.toLowerCase()}` : "digiy_module";
  }

  function readPinSession(moduleHint = "") {
    const m = normModule(moduleHint);
    const keyBase = moduleStorageBase(m);

    const raw = localStorage.getItem("DIGIY_ACCESS");
    const s = safeJsonParse(raw);

    if (s && typeof s === "object") {
      const payload = {
        slug: normSlug(s.slug || ""),
        module: normModule(s.module || m),
        phone: normPhone(s.phone || "")
      };

      if (payload.slug || payload.phone) return payload;
    }

    const sessionSlug =
      normSlug(sessionStorage.getItem(`${keyBase}_slug`) || "") ||
      normSlug(sessionStorage.getItem(`${keyBase}_last_slug`) || "") ||
      normSlug(localStorage.getItem(`${keyBase}_last_slug`) || "");

    const sessionPhone =
      normPhone(sessionStorage.getItem(`${keyBase}_phone`) || "") ||
      normPhone(localStorage.getItem(`${keyBase}_phone`) || "") ||
      normPhone(localStorage.getItem("digiy_last_phone") || "");

    if (!sessionSlug && !sessionPhone && !m) return null;

    return {
      slug: sessionSlug,
      module: m,
      phone: sessionPhone
    };
  }

  function buildPayUrl({ module, slug, phone }) {
    const u = new URL(PAY_URL_BASE);

    const m = normModule(module);
    const s = normSlug(slug);
    const p = normPhone(phone);

    if (m) u.searchParams.set("module", m);
    if (s) u.searchParams.set("slug", s);
    if (p) u.searchParams.set("phone", p);

    u.searchParams.set("return", location.href);
    return u.toString();
  }

  function createClient() {
    if (!window.supabase?.createClient) {
      throw new Error("Supabase SDK manquant.");
    }

    if (window.DIGIY_SB) return window.DIGIY_SB;

    window.DIGIY_SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {}
        }
      }
    });

    return window.DIGIY_SB;
  }

  async function resolveIdentityBySlug(sb, slug, moduleHint = "") {
    const s = normSlug(slug);
    const m = normModule(moduleHint);
    if (!s) return null;

    let query = sb
      .from("digiy_subscriptions_public")
      .select("phone,slug,module")
      .eq("slug", s)
      .limit(1);

    if (m) query = query.eq("module", m);

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      slug: normSlug(data.slug || ""),
      phone: normPhone(data.phone || ""),
      module: normModule(data.module || m)
    };
  }

  async function resolveIdentityByPhone(sb, phone, moduleHint = "") {
    const p = normPhone(phone);
    const m = normModule(moduleHint);
    if (!p || !m) return null;

    const { data, error } = await sb
      .from("digiy_subscriptions_public")
      .select("phone,slug,module")
      .eq("phone", p)
      .eq("module", m)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      slug: normSlug(data.slug || ""),
      phone: normPhone(data.phone || ""),
      module: normModule(data.module || m)
    };
  }

  async function hasAccess(sb, phone, module) {
    const p = normPhone(phone);
    const m = normModule(module);
    if (!p || !m) return false;

    const { data, error } = await sb.rpc("digiy_has_access", {
      p_phone: p,
      p_module: m
    });

    if (error) throw error;
    return data === true;
  }

  function rememberIdentity({ slug, phone, module }) {
    const s = normSlug(slug);
    const p = normPhone(phone);
    const m = normModule(module);
    const keyBase = moduleStorageBase(m);

    if (s) {
      sessionStorage.setItem(`${keyBase}_slug`, s);
      sessionStorage.setItem(`${keyBase}_last_slug`, s);
      localStorage.setItem(`${keyBase}_last_slug`, s);
    }

    if (p) {
      sessionStorage.setItem(`${keyBase}_phone`, p);
      localStorage.setItem(`${keyBase}_phone`, p);
      localStorage.setItem("digiy_last_phone", p);
    }

    localStorage.setItem("DIGIY_ACCESS", JSON.stringify({
      slug: s,
      phone: p,
      module: m
    }));
  }

  function enrichUrlIfMissingSlug(slug) {
    const s = normSlug(slug);
    if (!s) return;

    const u = new URL(location.href);
    const currentSlug = normSlug(u.searchParams.get("slug") || "");
    if (currentSlug === s) return;

    u.searchParams.set("slug", s);
    history.replaceState(null, "", u.toString());
  }

  function fallbackSnapshot() {
    const qs = getQuery();
    const moduleHint = normModule(qs.get("module") || window.DIGIY_MODULE || "");
    const pinSession = readPinSession(moduleHint);

    return {
      slug:
        normSlug(qs.get("slug") || "") ||
        normSlug(pinSession?.slug || ""),
      phone:
        normPhone(qs.get("phone") || "") ||
        normPhone(pinSession?.phone || ""),
      module:
        moduleHint ||
        normModule(pinSession?.module || "")
    };
  }

  /* ===== Core ===== */

  async function guardCheck() {
    const sb = createClient();
    const qs = getQuery();

    const moduleHint = normModule(qs.get("module") || window.DIGIY_MODULE || "");
    const pinSession = readPinSession(moduleHint);

    const slugQ = normSlug(qs.get("slug") || "") || normSlug(pinSession?.slug || "");
    const phoneQ = normPhone(qs.get("phone") || "") || normPhone(pinSession?.phone || "");
    const moduleQ = moduleHint || normModule(pinSession?.module || "");

    const state = {
      ok: true,
      preview: false,
      has_identity: false,
      slug: "",
      phone: "",
      module: "",
      pin_ok: false,
      access_ok: false,
      should_pay: false,
      pay_url: buildPayUrl({ module: moduleQ, slug: slugQ, phone: phoneQ }),
      reason: null,
      error: null
    };

    if (!slugQ && !phoneQ) {
      state.preview = !!ALLOW_PREVIEW_WITHOUT_IDENTITY;
      state.reason = ALLOW_PREVIEW_WITHOUT_IDENTITY ? "preview_no_identity" : "missing_identity";
      state.ok = ALLOW_PREVIEW_WITHOUT_IDENTITY;
      return state;
    }

    let identity = null;

    if (slugQ) {
      identity = await resolveIdentityBySlug(sb, slugQ, moduleQ);
      if (!identity && !moduleQ) {
        identity = await resolveIdentityBySlug(sb, slugQ, "");
      }
    }

    if (!identity && phoneQ && moduleQ) {
      identity = await resolveIdentityByPhone(sb, phoneQ, moduleQ);
    }

    if (!identity) {
      state.ok = false;
      state.preview = false;
      state.slug = slugQ;
      state.phone = phoneQ;
      state.module = moduleQ;
      state.has_identity = !!(slugQ || phoneQ);
      state.reason = "unknown_identity";
      state.should_pay = !!(slugQ || phoneQ);
      state.pay_url = buildPayUrl({
        module: moduleQ,
        slug: slugQ,
        phone: phoneQ
      });
      return state;
    }

    state.slug = identity.slug;
    state.phone = identity.phone;
    state.module = identity.module;
    state.has_identity = true;
    state.pay_url = buildPayUrl(identity);

    rememberIdentity(identity);
    enrichUrlIfMissingSlug(identity.slug);

    if (
      pinSession &&
      (
        (pinSession.slug && pinSession.slug === identity.slug) ||
        (pinSession.phone && pinSession.phone === identity.phone)
      ) &&
      (!pinSession.module || normModule(pinSession.module) === identity.module)
    ) {
      state.pin_ok = true;
    }

    const access = await hasAccess(sb, identity.phone, identity.module);
    state.access_ok = access;

    if (!access) {
      state.ok = false;
      state.reason = "no_subscription";
      state.should_pay = true;
      return state;
    }

    state.reason = "access_ok";
    return state;
  }

  /* ===== Public API ===== */

  async function refresh() {
    try {
      const state = await guardCheck();
      window.DIGIY_GUARD.state = state;
      return state;
    } catch (e) {
      const snap = fallbackSnapshot();

      const fallback = {
        ok: false,
        preview: !!ALLOW_PREVIEW_WITHOUT_IDENTITY,
        has_identity: !!(snap.slug || snap.phone),
        slug: snap.slug,
        phone: snap.phone,
        module: snap.module,
        pin_ok: false,
        access_ok: false,
        should_pay: false,
        pay_url: buildPayUrl(snap),
        reason: "guard_error",
        error: String(e?.message || e)
      };

      window.DIGIY_GUARD.state = fallback;
      return fallback;
    }
  }

  async function requirePaidAccess() {
    const state = await refresh();

    if (state.preview) return state;
    if (state.access_ok) return state;

    if (state.should_pay && state.pay_url) {
      location.replace(state.pay_url);
      return state;
    }

    return state;
  }

  window.DIGIY_GUARD = {
    state: null,
    ready: null,
    refresh,
    requirePaidAccess
  };

  window.digiyRequireAccess = async () => await window.DIGIY_GUARD.refresh();
  window.DIGIY_GUARD.ready = window.digiyRequireAccess();
})();
