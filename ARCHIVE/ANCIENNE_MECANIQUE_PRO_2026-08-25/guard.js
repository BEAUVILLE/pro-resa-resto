// guard.js — DIGIY RESA PRO — session PIN stricte 8 h
(() => {
  "use strict";

  const MODULE = "RESA";
  const VERSION = "resa-guard-strict-pin-v4-20260716";
  const MAX_AGE = 8 * 60 * 60 * 1000;
  const CLOCK_SKEW = 60 * 1000;
  const LOGIN_URL = String(window.DIGIY_LOGIN_URL || "./pin.html");
  const SESSION_KEYS = [
    "DIGIY_RESA_PIN_SESSION",
    "DIGIY_RESA_SESSION",
    "DIGIY_SESSION_RESA",
    "DIGIY_RESA_ACCESS",
    "digiy_resa_session",
    "digiy_resa_guard_session",
    "digiy_guard_resa_session"
  ];
  const SENSITIVE_PARAMS = [
    "slug","phone","tel","owner_phone","owner_id","p_phone","resa_tel","resa_phone",
    "business_phone","whatsapp","pin","code","token","session","access","auth","ok",
    "redirect","redirect_url","return","url","from","module","keybox_code","keybox_location","access_note"
  ];
  const ALLOWED_RETURN_FILES = new Set([
    "hub.html","atelier.html","cockpit.html","dashboard-pro.html","planning.html",
    "etablissement.html","fiche.html","qr.html","action-directe.html","action-direct.html"
  ]);

  const state = {
    module: MODULE,
    access: false,
    access_ok: false,
    pin_session_ok: false,
    slug: "",
    phone: "",
    owner_id: null,
    verified_at: null,
    validated_at: null,
    expires_at: null,
    ready_flag: false,
    error: null,
    build_id: VERSION
  };
  let pending = null;

  function parse(raw) {
    try { return JSON.parse(raw || "null"); } catch (_) { return null; }
  }
  function parseTime(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value < 100000000000 ? value * 1000 : value;
    const s = String(value).trim();
    if (!s) return 0;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? (n < 100000000000 ? n * 1000 : n) : 0;
    }
    const n = Date.parse(s);
    return Number.isFinite(n) ? n : 0;
  }
  function normPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 9) return "221" + digits;
    return digits;
  }
  function normSlug(value) {
    return String(value || "").trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "")
      .replace(/-+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "");
  }
  function isPinPage() {
    return /(^|\/)pin\.html$/i.test(String(location.pathname || ""));
  }
  function hidePage() {
    try { document.documentElement.style.visibility = "hidden"; } catch (_) {}
  }
  function showPage() {
    try { document.documentElement.style.visibility = ""; } catch (_) {}
  }
  function cleanUrl() {
    try {
      const url = new URL(location.href);
      let changed = false;
      SENSITIVE_PARAMS.forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
      if (changed) history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (_) {}
  }
  function clearSession() {
    SESSION_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });
    Object.assign(state, {
      access: false, access_ok: false, pin_session_ok: false,
      slug: "", phone: "", owner_id: null,
      verified_at: null, validated_at: null, expires_at: null,
      ready_flag: false, error: null
    });
  }
  function validSession(session) {
    if (!session || typeof session !== "object") return null;
    if (String(session.module || session.module_code || "").trim().toUpperCase() !== MODULE) return null;

    const phone = normPhone(session.phone || session.p_phone || "");
    if (phone.length < 9) return null;

    const access = session.access === true || session.access_ok === true || session.ok === true ||
      session.verified === true || session.pin_session_ok === true || session.has_access === true;
    if (!access) return null;

    const validatedAt = parseTime(
      session.validated_at_ms || session.verified_at || session.validated_at || session.created_at || session.ts
    );
    const expiresAt = parseTime(session.expires_at || session.expiresAt);
    const now = Date.now();

    if (!validatedAt || !expiresAt) return null;
    if (validatedAt > now + CLOCK_SKEW) return null;
    if (now - validatedAt > MAX_AGE) return null;
    if (expiresAt <= now) return null;
    if (expiresAt > validatedAt + MAX_AGE + CLOCK_SKEW) return null;

    return {
      module: MODULE,
      access: true,
      access_ok: true,
      pin_session_ok: true,
      slug: normSlug(session.slug || session.pro_slug || session.resa_slug || ""),
      phone,
      owner_id: session.owner_id || null,
      verified_at: validatedAt,
      validated_at: new Date(validatedAt).toISOString(),
      expires_at: expiresAt,
      session_token: String(session.session_token || "")
    };
  }
  function readSession() {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of SESSION_KEYS) {
        let raw = "";
        try { raw = storage.getItem(key) || ""; } catch (_) {}
        if (!raw) continue;
        const session = validSession(parse(raw));
        if (session) return session;
        try { storage.removeItem(key); } catch (_) {}
      }
    }
    return null;
  }
  function rememberReturnTarget() {
    if (isPinPage()) return;
    try {
      const file = String(location.pathname.split("/").pop() || "hub.html").toLowerCase();
      if (!ALLOWED_RETURN_FILES.has(file)) return;
      sessionStorage.setItem("digiy_resa_return_after_pin", file + (location.hash || ""));
    } catch (_) {}
  }
  function buildPinUrl() {
    try {
      const url = new URL(LOGIN_URL, location.href);
      SENSITIVE_PARAMS.forEach((key) => url.searchParams.delete(key));
      return url.origin === location.origin ? "./" + (url.pathname.split("/").pop() || "pin.html") : url.toString();
    } catch (_) {
      return "./pin.html";
    }
  }
  function goPin() {
    if (isPinPage()) { showPage(); return; }
    rememberReturnTarget();
    location.replace(buildPinUrl());
  }
  async function check(options = {}) {
    const redirect = options.redirect !== false;
    cleanUrl();
    const session = readSession();
    if (!session) {
      clearSession();
      state.ready_flag = true;
      state.error = "Session PIN RESA absente ou expirée.";
      if (redirect && !isPinPage()) goPin();
      else showPage();
      return { ...state };
    }
    Object.assign(state, session, { ready_flag: true, error: null });
    showPage();
    return { ...state };
  }
  function ready(options = {}) {
    if (state.ready_flag && state.access_ok) return Promise.resolve({ ...state });
    if (!pending) pending = check(options).finally(() => { pending = null; });
    return pending;
  }
  async function requireSession(options = {}) {
    const result = await ready({ ...options, redirect: true });
    if (!result.access_ok) throw new Error(result.error || "Accès RESA refusé.");
    return result;
  }
  function getSb() {
    if (window._digiyResaSb) return window._digiyResaSb;
    const url = window.DIGIY_SUPABASE_URL || "";
    const key = window.DIGIY_SUPABASE_ANON_KEY || window.DIGIY_SUPABASE_ANON || "";
    if (!url || !key || !window.supabase?.createClient) return null;
    window._digiyResaSb = window.supabase.createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return window._digiyResaSb;
  }
  function logout() {
    clearSession();
    goPin();
  }

  window.DIGIY_GUARD = {
    VERSION,
    state,
    ready,
    boot: ready,
    refresh(options = {}) { state.ready_flag = false; pending = null; return ready(options); },
    requireSession,
    getSession() { return { ...state }; },
    getSlug() { return state.slug || ""; },
    getPhone() { return state.phone || ""; },
    getOwnerId() { return state.owner_id || null; },
    getModule() { return MODULE; },
    getBuildId() { return VERSION; },
    isAuthenticated() { return !!state.access_ok; },
    clearSession,
    clearAll: clearSession,
    logout,
    buildPinUrl,
    goPin,
    cleanUrl,
    getSb,
    async checkAccess() { return !!(await ready({ redirect: false })).access_ok; }
  };

  cleanUrl();
  if (isPinPage()) {
    showPage();
  } else {
    hidePage();
    ready({ redirect: true }).catch(goPin);
  }
})();