/* DIGIY GUARD — UNIVERSAL (slug-first, page-safe, preview-safe) */
(() => {
  "use strict";

  /* ===== Supabase ===== */
  const SUPABASE_URL =
    window.DIGIY_SUPABASE_URL ||
    "https://wesqmwjjtsefyjnluosj.supabase.co";

  const SUPABASE_ANON =
    window.DIGIY_SUPABASE_ANON ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  const PAY_URL_BASE = "https://commencer-a-payer.digiylyfe.com/";

  /* ===== Mode =====
     true  = sans slug => aperçu autorisé
     false = sans slug => considéré comme non exploitable
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

  function safeJsonParse(v) {
    try { return JSON.parse(v); } catch { return null; }
  }

  function createClient() {
    if (!window.supabase?.createClient) {
      throw new Error("Supabase SDK manquant.");
    }

    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false }
    });
  }

  function readPinSession() {
    const raw = localStorage.getItem("DIGIY_ACCESS");
    const s = safeJsonParse(raw);
    if (!s || typeof s !== "object") return null;

    return {
      slug: normSlug(s.slug || ""),
      module: String(s.module || "").toUpperCase().trim(),
      phone: normPhone(s.phone || "")
    };
  }

  function buildPayUrl({ module, slug, phone }) {
    const u = new URL(PAY_URL_BASE);

    if (module) u.searchParams.set("module", String(module).toUpperCase());
    if (slug) u.searchParams.set("slug", normSlug(slug));
    if (phone) u.searchParams.set("phone", normPhone(phone));

    u.searchParams.set("return", location.href);
    return u.toString();
  }

  async function resolveIdentityBySlug(sb, slug) {
    const s = normSlug(slug);
    if (!s) return null;

    const { data, error } = await sb
      .from("digiy_subscriptions_public")
      .select("phone,slug,module")
      .eq("slug", s)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      slug: normSlug(data.slug || ""),
      phone: normPhone(data.phone || ""),
      module: String(data.module || "").toUpperCase().trim()
    };
  }

  async function resolveIdentityByPhone(sb, phone, moduleHint = "") {
    const p = normPhone(phone);
    const m = String(moduleHint || "").toUpperCase().trim();
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
      module: String(data.module || "").toUpperCase().trim()
    };
  }

  async function hasAccess(sb, phone, module) {
    const p = normPhone(phone);
    const m = String(module || "").toUpperCase().trim();
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
    const m = String(module || "").toUpperCase().trim();
    const keyBase = m ? `digiy_${m.toLowerCase()}` : "digiy_module";

    if (s) {
      sessionStorage.setItem(`${keyBase}_slug`, s);
      sessionStorage.setItem(`${keyBase}_last_slug`, s);
      localStorage.setItem(`${keyBase}_last_slug`, s);
    }

    if (p) {
      sessionStorage.setItem(`${keyBase}_phone`, p);
      localStorage.setItem(`${keyBase}_phone`, p);
    }
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

  /* ===== Core ===== */

  async function guardCheck() {
    const sb = createClient();
    const qs = getQuery();

    const slugQ = normSlug(qs.get("slug") || "");
    const phoneQ = normPhone(qs.get("phone") || "");
    const moduleQ = String(qs.get("module") || "").toUpperCase().trim();

    const pinSession = readPinSession();

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

    /* 1) Aucun slug + aucun phone => mode aperçu possible */
    if (!slugQ && !phoneQ) {
      state.preview = !!ALLOW_PREVIEW_WITHOUT_IDENTITY;
      state.reason = ALLOW_PREVIEW_WITHOUT_IDENTITY ? "preview_no_identity" : "missing_identity";
      state.ok = ALLOW_PREVIEW_WITHOUT_IDENTITY;
      return state;
    }

    let identity = null;

    /* 2) slug-first */
    if (slugQ) {
      identity = await resolveIdentityBySlug(sb, slugQ);
    }

    /* 3) fallback phone+module */
    if (!identity && phoneQ && moduleQ) {
      identity = await resolveIdentityByPhone(sb, phoneQ, moduleQ);
    }

    if (!identity) {
      state.ok = false;
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

    /* 4) enrichir URL et mémoire */
    rememberIdentity(identity);
    enrichUrlIfMissingSlug(identity.slug);

    /* 5) session PIN */
    if (
      pinSession &&
      pinSession.slug === identity.slug &&
      (!pinSession.module || pinSession.module === identity.module)
    ) {
      state.pin_ok = true;
    }

    /* 6) accès backend */
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
      const fallback = {
        ok: false,
        preview: false,
        has_identity: false,
        slug: "",
        phone: "",
        module: "",
        pin_ok: false,
        access_ok: false,
        should_pay: false,
        pay_url: buildPayUrl({ module: "", slug: "", phone: "" }),
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
