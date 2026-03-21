/* guard.js — DIGIY RESA / RESA GUARD
   Rail attendu :
   - slug-only : ?slug=resa-221...
   - window.DIGIY_GUARD.ready()
   - window.DIGIY_GUARD.state
   - window.DIGIY_GUARD.loginWithPin(slug, pin)
*/
(() => {
  "use strict";

  const SUPABASE_URL = String(
    window.DIGIY_SUPABASE_URL || "https://wesqmwjjtsefyjnluosj.supabase.co"
  ).trim();

  const SUPABASE_ANON_KEY = String(
    window.DIGIY_SUPABASE_ANON ||
    window.DIGIY_SUPABASE_ANON_KEY ||
    "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3"
  ).trim();

  const MODULE_CODE = "RESA";
  const MODULE_PREFIX = "digiy_resa";

  const DEFAULT_LOGIN_URL = window.DIGIY_LOGIN_URL || "./pin.html";
  const DEFAULT_PAY_URL = "https://commencer-a-payer.digiylyfe.com/";
  const DEFAULT_DASHBOARD_URL = "./dashboard-pro.html";
  const DEFAULT_ALLOW_PREVIEW = true;

  const SESSION_KEY = `DIGIY_${MODULE_CODE}_SESSION`;
  const ACCESS_KEY = `DIGIY_${MODULE_CODE}_ACCESS`;

  let bootPromise = null;

  const config = {
    module: MODULE_CODE,
    pin: DEFAULT_LOGIN_URL,
    pay: DEFAULT_PAY_URL,
    dashboard: DEFAULT_DASHBOARD_URL,
    requireSlug: false,
    checkSubscription: true,
    storageSlugKey: `${MODULE_PREFIX}_slug`,
    storageLastSlugKey: `${MODULE_PREFIX}_last_slug`,
    allowPreviewWithoutIdentity: DEFAULT_ALLOW_PREVIEW
  };

  const state = {
    preview: false,
    access_ok: false,
    reason: "booting",
    slug: "",
    phone: "",
    module: MODULE_CODE
  };

  function hidePage() {
    try {
      document.documentElement.style.visibility = "hidden";
    } catch (_) {}
  }

  function showPage() {
    try {
      document.documentElement.style.visibility = "";
    } catch (_) {}
  }

  hidePage();

  function normPhone(v) {
    return String(v || "").replace(/[^\d]/g, "");
  }

  function normPin(v) {
    return String(v || "").trim().replace(/\s+/g, "");
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

  function nowIso() {
    return new Date().toISOString();
  }

  function getQs() {
    return new URLSearchParams(window.location.search);
  }

  function jsonHeaders() {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  function getHeaders() {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    };
  }

  async function rpc(name, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body || {})
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  async function tableGet(table, paramsObj) {
    const params = new URLSearchParams(paramsObj || {});
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
      method: "GET",
      headers: getHeaders()
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  function setState(patch) {
    Object.assign(state, patch || {});
    api.state = state;
    window.DIGIY_GUARD.state = state;
  }

  function safeJsonParse(v) {
    try {
      return typeof v === "string" ? JSON.parse(v) : v;
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    try { sessionStorage.setItem(key, String(value ?? "")); } catch (_) {}
    try { localStorage.setItem(key, String(value ?? "")); } catch (_) {}
  }

  function storageGet(key) {
    try {
      const s = sessionStorage.getItem(key);
      if (s) return s;
    } catch (_) {}
    try {
      const l = localStorage.getItem(key);
      if (l) return l;
    } catch (_) {}
    return "";
  }

  function storageRemove(key) {
    try { sessionStorage.removeItem(key); } catch (_) {}
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function rememberIdentity({ slug, phone }) {
    const s = normSlug(slug);
    const p = normPhone(phone);

    const sessionObj = {
      module: MODULE_CODE,
      slug: s || "",
      phone: p || "",
      at: nowIso()
    };

    try {
      if (s) {
        storageSet(config.storageSlugKey, s);
        storageSet(config.storageLastSlugKey, s);
        storageSet("digiy_last_slug", s);
        storageSet("DIGIY_SLUG", s);
        storageSet("digiy_slug", s);
      }

      if (p) {
        storageSet(`${MODULE_PREFIX}_phone`, p);
        storageSet("digiy_last_phone", p);
        storageSet("DIGIY_PHONE", p);
        storageSet(`DIGIY_${MODULE_CODE}_PHONE`, p);
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
      localStorage.setItem(ACCESS_KEY, JSON.stringify(sessionObj));
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, sessionObj);
    } catch (_) {}
  }

  function clearIdentity() {
    [
      config.storageSlugKey,
      config.storageLastSlugKey,
      `${MODULE_PREFIX}_phone`,
      "digiy_last_slug",
      "DIGIY_SLUG",
      "digiy_slug",
      "digiy_last_phone",
      "DIGIY_PHONE",
      `DIGIY_${MODULE_CODE}_PHONE`,
      SESSION_KEY,
      ACCESS_KEY
    ].forEach(storageRemove);

    try {
      delete window.DIGIY_ACCESS;
    } catch (_) {}
  }

  function getSession() {
    const qs = getQs();

    const fromUrlSlug = normSlug(qs.get("slug") || "");
    const fromUrlPhone = normPhone(
      qs.get("phone") ||
      qs.get("tel") ||
      ""
    );

    let stored = null;
    try {
      const raw = localStorage.getItem(SESSION_KEY) || localStorage.getItem(ACCESS_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (_) {}

    const generic = safeJsonParse(storageGet("DIGIY_PRO_SESSION"));

    const sessionSlug = normSlug(
      fromUrlSlug ||
      storageGet(config.storageSlugKey) ||
      storageGet(config.storageLastSlugKey) ||
      stored?.slug ||
      generic?.slug ||
      window.DIGIY_ACCESS?.slug ||
      ""
    );

    const sessionPhone = normPhone(
      fromUrlPhone ||
      storageGet(`${MODULE_PREFIX}_phone`) ||
      stored?.phone ||
      generic?.phone ||
      window.DIGIY_ACCESS?.phone ||
      ""
    );

    return {
      module: MODULE_CODE,
      slug: sessionSlug,
      phone: sessionPhone
    };
  }

  function enrichUrlIfMissingSlug(slug) {
    const s = normSlug(slug);
    if (!s) return;

    const qs = getQs();
    const current = normSlug(qs.get("slug") || "");
    if (current === s) return;

    const u = new URL(window.location.href);
    u.searchParams.set("slug", s);
    history.replaceState(null, "", u.toString());
  }

  function withSlug(path, slug) {
    const s = normSlug(slug);
    const u = new URL(path, window.location.href);
    if (s) u.searchParams.set("slug", s);
    return u.toString();
  }

  function buildLoginUrl(slug) {
    const u = new URL(config.pin || DEFAULT_LOGIN_URL, window.location.href);
    const s = normSlug(slug);

    if (s) u.searchParams.set("slug", s);
    u.searchParams.set("next", window.location.pathname + window.location.search);

    return u.toString();
  }

  function goLogin(slug) {
    window.location.replace(buildLoginUrl(slug));
  }

  function buildPayUrl({ slug, phone }) {
    const u = new URL(config.pay || DEFAULT_PAY_URL);
    const s = normSlug(slug);
    const p = normPhone(phone);

    u.searchParams.set("module", MODULE_CODE);
    if (s) u.searchParams.set("slug", s);
    if (p) u.searchParams.set("phone", p);
    u.searchParams.set("return", window.location.href);

    return u.toString();
  }

  function goPay({ slug, phone }) {
    window.location.replace(buildPayUrl({ slug, phone }));
  }

  async function resolveSubBySlug(slug) {
    const s = normSlug(slug);
    if (!s) return null;

    const res = await tableGet("digiy_subscriptions_public", {
      select: "phone,slug,module",
      slug: `eq.${s}`,
      module: `eq.${MODULE_CODE}`,
      limit: "1"
    });

    if (!res.ok || !Array.isArray(res.data) || !res.data[0]) return null;

    return {
      slug: normSlug(res.data[0].slug),
      phone: normPhone(res.data[0].phone),
      module: String(res.data[0].module || "")
    };
  }

  async function resolveSubByPhone(phone) {
    const p = normPhone(phone);
    if (!p) return null;

    const res = await tableGet("digiy_subscriptions_public", {
      select: "phone,slug,module",
      phone: `eq.${p}`,
      module: `eq.${MODULE_CODE}`,
      limit: "1"
    });

    if (!res.ok || !Array.isArray(res.data) || !res.data[0]) return null;

    return {
      slug: normSlug(res.data[0].slug),
      phone: normPhone(res.data[0].phone),
      module: String(res.data[0].module || "")
    };
  }

  async function checkAccess(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    if (config.checkSubscription === false) {
      return true;
    }

    const tries = [
      { name: "digiy_has_access", body: { p_phone: p, p_module: MODULE_CODE } },
      { name: "digiy_has_access", body: { phone: p, module: MODULE_CODE } }
    ];

    for (const t of tries) {
      const res = await rpc(t.name, t.body);
      if (!res.ok) continue;
      if (res.data === true) return true;
      if (res.data?.ok === true) return true;
      if (res.data?.access === true) return true;
    }

    return false;
  }

  async function attemptPinLoginRPCs(slug, pin, phone) {
    const s = normSlug(slug);
    const p = normPin(pin);
    const ph = normPhone(phone);

    if (!ph || !p) return null;

    const tries = [
      { name: "digiy_verify_pin", body: { p_phone: ph, p_module: MODULE_CODE, p_pin: p } },
      { name: "digiy_verify_pin", body: { p_phone: ph, p_module: MODULE_CODE.toLowerCase(), p_pin: p } },
      { name: "digiy_verify_pin", body: { phone: ph, module: MODULE_CODE, pin: p } }
    ];

    for (const t of tries) {
      const res = await rpc(t.name, t.body);
      if (!res.ok) continue;

      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (row === true) {
        return { ok: true, slug: s, phone: ph };
      }
      if (row?.ok === true || row?.access === true || row?.valid === true) {
        return {
          ok: true,
          slug: normSlug(row.slug || s),
          phone: normPhone(row.phone || ph)
        };
      }
    }

    return null;
  }

  async function attemptPinLoginTable(_slug, _pin, _phone) {
    return null;
  }

  async function loginWithPin(slug, pin, phoneHint = "") {
    let s = normSlug(slug);
    const p = normPin(pin);
    let ph = normPhone(phoneHint);

    if (!s && !ph) return { ok: false, error: "Slug manquant." };
    if (!p) return { ok: false, error: "PIN manquant." };

    if (s && !ph) {
      const sub = await resolveSubBySlug(s);
      ph = normPhone(sub?.phone);
      s = normSlug(sub?.slug || s);
    }

    if (!s && ph) {
      const sub = await resolveSubByPhone(ph);
      s = normSlug(sub?.slug || "");
      ph = normPhone(sub?.phone || ph);
    }

    if (!s) return { ok: false, error: "Slug inconnu." };
    if (!ph) return { ok: false, error: "Téléphone introuvable pour ce slug." };

    let auth = await attemptPinLoginRPCs(s, p, ph);
    if (!auth) {
      auth = await attemptPinLoginTable(s, p, ph);
    }

    if (!auth?.ok) {
      return { ok: false, error: "PIN invalide." };
    }

    const hasAccess = await checkAccess(ph);
    if (!hasAccess) {
      return { ok: false, error: "Abonnement inactif." };
    }

    rememberIdentity({ slug: s, phone: ph });
    enrichUrlIfMissingSlug(s);

    setState({
      preview: false,
      access_ok: true,
      reason: "pin_ok",
      slug: s,
      phone: ph
    });

    showPage();

    return {
      ok: true,
      slug: s,
      phone: ph,
      next: withSlug(config.dashboard || DEFAULT_DASHBOARD_URL, s)
    };
  }

  function logout() {
    const oldSlug = state.slug || "";
    clearIdentity();

    setState({
      preview: false,
      access_ok: false,
      reason: "logged_out",
      slug: "",
      phone: ""
    });

    showPage();
    goLogin(oldSlug);
  }

  async function runBoot() {
    hidePage();

    try {
      let { slug, phone } = getSession();
      const allowPreview = !!config.allowPreviewWithoutIdentity;

      if (slug && !phone) {
        const sub = await resolveSubBySlug(slug);
        if (sub?.phone) phone = normPhone(sub.phone);
        if (sub?.slug) slug = normSlug(sub.slug);
      }

      if (phone && !slug) {
        const sub = await resolveSubByPhone(phone);
        if (sub?.slug) slug = normSlug(sub.slug);
        if (sub?.phone) phone = normPhone(sub.phone);
      }

      if (slug || phone) {
        rememberIdentity({ slug, phone });
      }

      if (config.requireSlug && !slug) {
        if (allowPreview) {
          setState({
            preview: true,
            access_ok: false,
            reason: "preview_no_identity",
            slug: "",
            phone: phone || ""
          });
          showPage();
          return state;
        }

        showPage();
        goLogin("");
        return null;
      }

      if (!slug && !phone) {
        if (allowPreview) {
          setState({
            preview: true,
            access_ok: false,
            reason: "preview_no_identity",
            slug: "",
            phone: ""
          });
          showPage();
          return state;
        }

        showPage();
        goLogin("");
        return null;
      }

      if (phone) {
        const ok = await checkAccess(phone);

        if (ok) {
          if (slug) enrichUrlIfMissingSlug(slug);

          setState({
            preview: false,
            access_ok: true,
            reason: "access_ok",
            slug: normSlug(slug),
            phone: normPhone(phone)
          });

          showPage();
          return state;
        }

        if (allowPreview) {
          setState({
            preview: true,
            access_ok: false,
            reason: "no_subscription",
            slug: normSlug(slug),
            phone: normPhone(phone)
          });
          showPage();
          return state;
        }

        showPage();
        goPay({ slug, phone });
        return null;
      }

      if (allowPreview) {
        setState({
          preview: true,
          access_ok: false,
          reason: "unknown_identity",
          slug: normSlug(slug),
          phone: ""
        });
        showPage();
        return state;
      }

      showPage();
      goLogin(slug || "");
      return null;
    } catch (e) {
      console.error("DIGIY_GUARD boot error:", e);

      if (config.allowPreviewWithoutIdentity) {
        setState({
          preview: true,
          access_ok: false,
          reason: "guard_error",
          slug: normSlug(getSession().slug),
          phone: normPhone(getSession().phone)
        });
        showPage();
        return state;
      }

      setState({
        preview: false,
        access_ok: false,
        reason: "guard_error",
        slug: "",
        phone: ""
      });

      showPage();
      goLogin("");
      return null;
    }
  }

  function boot(userConfig = {}) {
    if (userConfig && typeof userConfig === "object") {
      Object.assign(config, userConfig);
    }

    if (!bootPromise) {
      bootPromise = runBoot();
    }

    return bootPromise;
  }

  function ready() {
    return boot();
  }

  ready.then = (...args) => boot().then(...args);
  ready.catch = (...args) => boot().catch(...args);
  ready.finally = (...args) => boot().finally(...args);

  const api = {
    state,
    boot,
    ready,
    getSession,
    loginWithPin,
    logout,
    getSlug: () => state.slug || "",
    getPhone: () => state.phone || "",
    getModule: () => MODULE_CODE
  };

  window.DIGIY_GUARD = api;

  setTimeout(() => {
    if (!bootPromise) boot();
  }, 0);
})();
