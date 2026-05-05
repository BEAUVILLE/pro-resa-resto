// guard.js — DIGIY RESA
// Doctrine : PRO = coffre sécurisé
// PIN une seule fois -> session RESA locale fraîche -> navigation interne directe
// Façade : jamais de téléphone dans les URLs visibles
// Coffre interne : phone gardé seulement pour les RPC Supabase si nécessaire
(() => {
  "use strict";

  const CFG = {
    SUPABASE_URL:
      window.DIGIY_SUPABASE_URL ||
      "https://wesqmwjjtsefyjnluosj.supabase.co",

    SUPABASE_ANON_KEY:
      window.DIGIY_SUPABASE_ANON ||
      window.DIGIY_SUPABASE_ANON_KEY ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3",

    MODULE_CODE: "RESA",
    MODULE_CODE_LOWER: "resa",

    SESSION_MAX_AGE_MS: 8 * 60 * 60 * 1000,

    PIN_PATH: window.DIGIY_LOGIN_URL || "./pin.html",
    PAY_URL: window.DIGIY_PAY_URL || "https://commencer-a-payer.digiylyfe.com/",

    ALLOW_PREVIEW_WITHOUT_IDENTITY: false,

    STORAGE: {
      SESSION_KEYS: [
        "DIGIY_RESA_PIN_SESSION",
        "DIGIY_RESA_SESSION",
        "DIGIY_SESSION_RESA",
        "digiy_resa_session",
        "DIGIY_ACCESS"
      ],
      SLUG_KEY: "digiy_resa_slug",
      PHONE_KEY: "digiy_resa_phone",
      LAST_SLUG_KEY: "digiy_resa_last_slug",
      ACTIVE_MODULE_KEY: "DIGIY_ACTIVE_MODULE"
    },

    RPC: {
      VERIFY_PIN: "digiy_verify_pin",
      HAS_ACCESS: "digiy_has_access"
    },

    TABLES: {
      SUBSCRIPTIONS_PUBLIC: "digiy_subscriptions_public"
    },

    URL: {
      KEEP_PHONE_IN_URL: false,
      KEEP_SLUG_IN_URL: false
    }
  };

  const MODULE = CFG.MODULE_CODE;
  const MODULE_LOWER = CFG.MODULE_CODE_LOWER;

  const bootUrl = new URL(location.href);
  const bootQs = new URLSearchParams(bootUrl.search);

  const legacySlugQ = bootQs.get("slug") || "";
  const legacyPhoneQ = bootQs.get("phone") || bootQs.get("tel") || bootQs.get("resa_" + "tel") || "";

  function safeJsonParse(raw) {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function normSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normPhone(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (!digits) return "";
    if (digits.startsWith("221") && digits.length === 12) return digits;
    if (digits.length === 9) return "221" + digits;
    return digits;
  }

  function normPin(value) {
    return String(value || "").trim().replace(/\s+/g, "");
  }

  function upper(value) {
    return String(value || "").trim().toUpperCase();
  }

  function nowMs() {
    return Date.now();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isRecent(ts) {
    const n = Number(ts || 0);
    if (!n) return false;
    return (nowMs() - n) <= CFG.SESSION_MAX_AGE_MS;
  }

  function hidePage() {
    try { document.documentElement.style.visibility = "hidden"; } catch (_) {}
  }

  function showPage() {
    try { document.documentElement.style.visibility = ""; } catch (_) {}
  }

  function jsonHeaders() {
    return {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  function getHeaders() {
    return {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    };
  }

  async function rpc(name, body) {
    const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body || {})
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  async function tableGet(table, paramsObj) {
    const params = new URLSearchParams(paramsObj || {});
    const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
      method: "GET",
      headers: getHeaders()
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  function cleanVisibleUrl() {
    try {
      const url = new URL(location.href);

      const slugFromUrl = normSlug(url.searchParams.get("slug") || "");
      const phoneFromUrl = normPhone(
        url.searchParams.get("phone") ||
        url.searchParams.get("tel") ||
        url.searchParams.get("resa_" + "tel") ||
        ""
      );

      if (slugFromUrl) saveSlugOnly(slugFromUrl);
      if (phoneFromUrl) savePhoneOnly(phoneFromUrl);

      [
        "slug",
        "phone",
        "tel",
        "resa_" + "tel",
        "module",
        "from"
      ].forEach((key) => url.searchParams.delete(key));

      history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function saveSlugOnly(slug) {
    const clean = normSlug(slug);
    if (!clean) return;

    try {
      localStorage.setItem(CFG.STORAGE.SLUG_KEY, clean);
      localStorage.setItem(CFG.STORAGE.LAST_SLUG_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.SLUG_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.LAST_SLUG_KEY, clean);
    } catch (_) {}
  }

  function savePhoneOnly(phone) {
    const clean = normPhone(phone);
    if (!clean) return;

    try {
      localStorage.setItem(CFG.STORAGE.PHONE_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.PHONE_KEY, clean);
    } catch (_) {}
  }

  function readSavedSlug() {
    try {
      return normSlug(
        legacySlugQ ||
        sessionStorage.getItem(CFG.STORAGE.SLUG_KEY) ||
        sessionStorage.getItem(CFG.STORAGE.LAST_SLUG_KEY) ||
        localStorage.getItem(CFG.STORAGE.SLUG_KEY) ||
        localStorage.getItem(CFG.STORAGE.LAST_SLUG_KEY) ||
        ""
      );
    } catch (_) {
      return normSlug(legacySlugQ || "");
    }
  }

  function readSavedPhone() {
    try {
      return normPhone(
        legacyPhoneQ ||
        sessionStorage.getItem(CFG.STORAGE.PHONE_KEY) ||
        localStorage.getItem(CFG.STORAGE.PHONE_KEY) ||
        ""
      );
    } catch (_) {
      return normPhone(legacyPhoneQ || "");
    }
  }

  function clearSessionsOnly() {
    for (const key of CFG.STORAGE.SESSION_KEYS) {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    }
  }

  function clearAllLocalState() {
    clearSessionsOnly();

    [
      CFG.STORAGE.SLUG_KEY,
      CFG.STORAGE.PHONE_KEY,
      CFG.STORAGE.LAST_SLUG_KEY
    ].forEach((key) => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });
  }

  function readStoredSession() {
    for (const key of CFG.STORAGE.SESSION_KEYS) {
      let parsed = null;

      try {
        parsed = safeJsonParse(sessionStorage.getItem(key));
        if (!parsed) parsed = safeJsonParse(localStorage.getItem(key));
      } catch (_) {}

      if (!parsed || typeof parsed !== "object") continue;

      const moduleName = upper(parsed.module || parsed.module_code || "");

      if (moduleName !== MODULE) continue;

      const slug = normSlug(parsed.slug || "");
      const phone = normPhone(parsed.phone || "");
      const owner_id = parsed.owner_id || null;

      const access =
        !!parsed.access ||
        !!parsed.access_ok ||
        !!parsed.ok ||
        !!parsed.has_access ||
        !!parsed.verified;

      const verifiedAt =
        Number(parsed.verified_at || parsed.validated_at_ms || parsed.ts || 0) || 0;

      const validatedAtIso = parsed.validated_at || null;

      let ageOk = false;

      if (verifiedAt && isRecent(verifiedAt)) ageOk = true;

      if (!ageOk && validatedAtIso) {
        const dt = new Date(validatedAtIso).getTime();
        if (dt && isRecent(dt)) ageOk = true;
      }

      if (!slug && !phone) continue;
      if (!ageOk) continue;
      if (!access) continue;

      return {
        key,
        slug,
        phone,
        owner_id,
        module: MODULE,
        access: true,
        verified_at: verifiedAt || (validatedAtIso ? new Date(validatedAtIso).getTime() : 0),
        validated_at: validatedAtIso || (verifiedAt ? new Date(verifiedAt).toISOString() : null)
      };
    }

    return null;
  }

  function saveSession(payload = {}) {
    const verifiedAtMs = Number(payload.verified_at || nowMs()) || nowMs();

    const validatedAtIso =
      payload.validated_at ||
      (verifiedAtMs ? new Date(verifiedAtMs).toISOString() : nowIso());

    const session = {
      slug: normSlug(payload.slug || state.slug || ""),
      phone: normPhone(payload.phone || state.phone || ""),
      owner_id: payload.owner_id || state.owner_id || null,
      module: MODULE,
      access: !!payload.access,
      access_ok: !!payload.access,
      ok: !!payload.access,
      verified: !!payload.access,
      preview: !payload.access,
      verified_at: verifiedAtMs,
      validated_at: validatedAtIso,
      validated_at_ms: verifiedAtMs,
      ts: nowMs(),
      reason: payload.reason || "resa_guard"
    };

    try {
      localStorage.setItem(CFG.STORAGE.ACTIVE_MODULE_KEY, MODULE);
      sessionStorage.setItem(CFG.STORAGE.ACTIVE_MODULE_KEY, MODULE);
    } catch (_) {}

    for (const key of CFG.STORAGE.SESSION_KEYS) {
      try { localStorage.setItem(key, JSON.stringify(session)); } catch (_) {}
      try { sessionStorage.setItem(key, JSON.stringify(session)); } catch (_) {}
    }

    saveSlugOnly(session.slug);
    savePhoneOnly(session.phone);

    try {
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, session);
    } catch (_) {}

    return session;
  }

  function cleanInternalUrl(path) {
    const baseStr = String(path || "").trim() || "./dashboard-pro.html";

    try {
      const url = /^https?:\/\//i.test(baseStr)
        ? new URL(baseStr)
        : new URL(baseStr, location.href);

      [
        "slug",
        "phone",
        "tel",
        "resa_" + "tel",
        "module",
        "from"
      ].forEach((key) => url.searchParams.delete(key));

      if (url.origin === location.origin) {
        const file = url.pathname.split("/").pop() || "dashboard-pro.html";
        return "./" + file + (url.hash || "");
      }

      return url.toString();
    } catch (_) {
      return baseStr;
    }
  }

  function currentTargetName() {
    const file = String(location.pathname.split("/").pop() || "").toLowerCase();

    if (file === "planning.html") return "planning";
    if (file === "cockpit.html") return "reserv";
    if (file === "etablissement.html") return "plus";
    if (file === "qr.html") return "qr";
    if (file === "dashboard-pro.html") return "dashboard";

    return "dashboard";
  }

  function buildPinUrl() {
    const target = currentTargetName();
    const url = new URL(CFG.PIN_PATH, location.href);

    [
      "slug",
      "phone",
      "tel",
      "resa_" + "tel",
      "module",
      "from"
    ].forEach((key) => url.searchParams.delete(key));

    url.searchParams.set("target", target);

    if (url.origin === location.origin) {
      return "./" + (url.pathname.split("/").pop() || "pin.html") + url.search;
    }

    return url.toString();
  }

  function goPin() {
    location.replace(buildPinUrl());
  }

  function buildPayUrl() {
    const url = new URL(CFG.PAY_URL);
    url.searchParams.set("module", MODULE);
    url.searchParams.set("return", cleanInternalUrl("./dashboard-pro.html"));
    return url.toString();
  }

  function goPay() {
    location.replace(buildPayUrl());
  }

  async function resolveSubBySlug(slug) {
    const s = normSlug(slug);
    if (!s) return null;

    const tries = [
      { select: "phone,slug,module", slug: `eq.${s}`, module: `eq.${MODULE}`, limit: "1" },
      { select: "phone,slug,module", slug: `eq.${s}`, module: `eq.${MODULE_LOWER}`, limit: "1" },
      { select: "phone,slug,module", slug: `eq.${s}`, limit: "1" }
    ];

    for (const params of tries) {
      const res = await tableGet(CFG.TABLES.SUBSCRIPTIONS_PUBLIC, params);

      if (!res.ok || !Array.isArray(res.data) || !res.data[0]) continue;

      const moduleName = upper(res.data[0].module || MODULE);

      if (moduleName && moduleName !== MODULE) continue;

      return {
        slug: normSlug(res.data[0].slug),
        phone: normPhone(res.data[0].phone),
        module: moduleName || MODULE
      };
    }

    return null;
  }

  async function resolveSubByPhone(phone) {
    const p = normPhone(phone);
    if (!p) return null;

    const tries = [
      { select: "phone,slug,module", phone: `eq.${p}`, module: `eq.${MODULE}`, limit: "1" },
      { select: "phone,slug,module", phone: `eq.${p}`, module: `eq.${MODULE_LOWER}`, limit: "1" },
      { select: "phone,slug,module", phone: `eq.${p}`, limit: "1" }
    ];

    for (const params of tries) {
      const res = await tableGet(CFG.TABLES.SUBSCRIPTIONS_PUBLIC, params);

      if (!res.ok || !Array.isArray(res.data) || !res.data[0]) continue;

      const moduleName = upper(res.data[0].module || MODULE);

      if (moduleName && moduleName !== MODULE) continue;

      return {
        slug: normSlug(res.data[0].slug),
        phone: normPhone(res.data[0].phone),
        module: moduleName || MODULE
      };
    }

    return null;
  }

  async function checkAccess(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    const tries = [
      { p_phone: p, p_module: MODULE },
      { p_phone: p, p_module: MODULE_LOWER },
      { phone: p, module: MODULE },
      { phone: p, module: MODULE_LOWER }
    ];

    for (const body of tries) {
      const res = await rpc(CFG.RPC.HAS_ACCESS, body);

      if (!res.ok) continue;

      if (res.data === true) return true;
      if (res.data?.ok === true) return true;
      if (res.data?.access === true) return true;
      if (res.data?.has_access === true) return true;
    }

    return false;
  }

  function parseVerifyPinPayload(data, fallbackPhone = "") {
    const raw = Array.isArray(data) ? data[0] : data;

    if (!raw) return null;

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const moduleName = upper(raw.module || raw.p_module || MODULE);

      if (raw.ok === true && moduleName === MODULE) {
        return {
          ok: true,
          phone: normPhone(raw.phone || raw.p_phone || fallbackPhone || ""),
          module: moduleName,
          owner_id: raw.owner_id || null
        };
      }

      const vals = Object.values(raw);

      if (vals.length >= 3) {
        const okLike =
          vals[0] === true ||
          vals[0] === "t" ||
          vals[0] === "true" ||
          vals[0] === 1;

        const mod = upper(vals[1] || MODULE);

        if (okLike && mod === MODULE) {
          return {
            ok: true,
            module: mod,
            phone: normPhone(vals[2] || fallbackPhone || ""),
            owner_id: vals[4] || null
          };
        }
      }
    }

    if (typeof raw === "string") {
      const txt = raw.trim();

      if (txt.startsWith("(") && txt.endsWith(")")) {
        const tupleHead = txt.match(/^\(([^,]+),([^,]+),([^,]+),?(.*)\)$/);

        if (tupleHead) {
          const okToken = String(tupleHead[1] || "").trim().replace(/^"|"$/g, "");
          const modToken = String(tupleHead[2] || "").trim().replace(/^"|"$/g, "");
          const phoneToken = String(tupleHead[3] || "").trim().replace(/^"|"$/g, "");

          const okLike =
            okToken === "t" ||
            okToken === "true" ||
            okToken === "1";

          const mod = upper(modToken || MODULE);

          if (okLike && mod === MODULE) {
            return {
              ok: true,
              module: mod,
              phone: normPhone(phoneToken || fallbackPhone || ""),
              owner_id: null
            };
          }
        }
      }
    }

    return null;
  }

  async function attemptPinLoginRPCs(slug, pin, phone) {
    const s = normSlug(slug);
    const p = normPin(pin);
    const ph = normPhone(phone);

    if (!s || !p || !ph) return null;

    const tries = [
      { p_phone: ph, p_module: MODULE, p_pin: p },
      { p_phone: ph, p_module: MODULE_LOWER, p_pin: p }
    ];

    for (const body of tries) {
      const res = await rpc(CFG.RPC.VERIFY_PIN, body);

      if (!res.ok) continue;

      const parsed = parseVerifyPinPayload(res.data, ph);

      if (!parsed?.ok) continue;

      return {
        ok: true,
        slug: s,
        phone: normPhone(parsed.phone || ph),
        owner_id: parsed.owner_id || null
      };
    }

    return null;
  }

  const stored = readStoredSession();
  const savedSlug = readSavedSlug();
  const savedPhone = readSavedPhone();

  const state = {
    module: MODULE,
    slug: normSlug(stored?.slug || savedSlug || ""),
    phone: normPhone(stored?.phone || savedPhone || ""),
    owner_id: stored?.owner_id || null,

    access: false,
    access_ok: false,
    preview: true,
    ready_flag: false,
    error: null,

    source: stored
      ? "session"
      : (savedSlug || savedPhone)
        ? "storage"
        : "none",

    verified_at: stored?.verified_at || null,
    validated_at: stored?.validated_at || null,
    pin_url: "",
    pay_url: ""
  };

  let pendingPromise = null;

  async function loginWithPin(slug, pin) {
    const s = normSlug(slug || state.slug || readSavedSlug() || "");
    const p = normPin(pin);

    if (!s) return { ok: false, error: "Identifiant RESA manquant côté coffre." };
    if (!p) return { ok: false, error: "PIN manquant." };

    let phone = normPhone(state.phone || readSavedPhone() || "");

    if (!phone) {
      const sub = await resolveSubBySlug(s);
      phone = normPhone(sub?.phone || "");
    }

    if (!phone) {
      return { ok: false, error: "Accès RESA non retrouvé sur cet appareil." };
    }

    const auth = await attemptPinLoginRPCs(s, p, phone);

    if (!auth?.ok) {
      return { ok: false, error: "PIN invalide pour RESA." };
    }

    const finalPhone = normPhone(auth.phone || phone);
    const finalOwnerId = auth.owner_id || null;

    const accessOk = await checkAccess(finalPhone);

    if (!accessOk) {
      return { ok: false, error: "Abonnement RESA inactif." };
    }

    const saved = saveSession({
      slug: s,
      phone: finalPhone,
      owner_id: finalOwnerId,
      access: true,
      verified_at: nowMs(),
      validated_at: nowIso(),
      reason: "pin_ok"
    });

    state.slug = saved.slug;
    state.phone = saved.phone;
    state.owner_id = saved.owner_id;
    state.access = true;
    state.access_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();

    cleanVisibleUrl();
    showPage();

    return {
      ok: true,
      slug: saved.slug,
      phone: saved.phone,
      owner_id: saved.owner_id || null
    };
  }

  function logout() {
    clearAllLocalState();

    state.slug = "";
    state.phone = "";
    state.owner_id = null;
    state.access = false;
    state.access_ok = false;
    state.preview = true;
    state.ready_flag = false;
    state.error = null;
    state.verified_at = null;
    state.validated_at = null;

    showPage();
    goPin();
  }

  async function check() {
    cleanVisibleUrl();

    const storedSession = readStoredSession();
    const persistedSlug = readSavedSlug();
    const persistedPhone = readSavedPhone();

    let slug = normSlug(storedSession?.slug || state.slug || persistedSlug || "");
    let phone = normPhone(storedSession?.phone || state.phone || persistedPhone || "");
    let owner_id = storedSession?.owner_id || state.owner_id || null;
    let verifiedAt = Number(storedSession?.verified_at || state.verified_at || 0) || 0;
    let validatedAt = storedSession?.validated_at || state.validated_at || null;

    state.slug = slug;
    state.phone = phone;
    state.owner_id = owner_id;
    state.verified_at = verifiedAt;
    state.validated_at = validatedAt;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();
    state.error = null;

    if (slug) saveSlugOnly(slug);
    if (phone) savePhoneOnly(phone);

    if (slug && !phone) {
      const sub = await resolveSubBySlug(slug);
      if (sub?.phone) {
        phone = normPhone(sub.phone);
        state.phone = phone;
        savePhoneOnly(phone);
      }
    }

    if (phone && !slug) {
      const sub = await resolveSubByPhone(phone);
      if (sub?.slug) {
        slug = normSlug(sub.slug);
        state.slug = slug;
        saveSlugOnly(slug);
      }
    }

    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();

    if (!slug && !phone) {
      if (CFG.ALLOW_PREVIEW_WITHOUT_IDENTITY) {
        state.access = false;
        state.access_ok = false;
        state.preview = true;
        state.ready_flag = true;
        state.error = "Accès RESA absent.";
        showPage();
        return { ...state };
      }

      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Accès RESA absent.";

      showPage();
      goPin();
      return { ...state };
    }

    if (!slug) {
      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Identifiant RESA absent côté coffre.";

      showPage();
      goPin();
      return { ...state };
    }

    const freshSession = !!verifiedAt && isRecent(verifiedAt);

    if (!freshSession) {
      clearSessionsOnly();

      if (slug) saveSlugOnly(slug);
      if (phone) savePhoneOnly(phone);

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Session PIN absente ou expirée.";

      showPage();
      goPin();
      return { ...state };
    }

    state.access = true;
    state.access_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;

    const saved = saveSession({
      slug,
      phone,
      owner_id,
      access: true,
      verified_at: verifiedAt || nowMs(),
      validated_at: validatedAt || nowIso(),
      reason: "session_fresh"
    });

    state.slug = saved.slug;
    state.phone = saved.phone;
    state.owner_id = saved.owner_id;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();

    cleanVisibleUrl();
    showPage();

    return { ...state };
  }

  function ready() {
    hidePage();

    if (state.ready_flag) {
      showPage();
      return Promise.resolve({ ...state });
    }

    if (!pendingPromise) {
      pendingPromise = check().finally(() => {
        pendingPromise = null;
      });
    }

    return pendingPromise;
  }

  window.DIGIY_GUARD = {
    state,
    ready,

    async refresh() {
      state.ready_flag = false;
      state.error = null;
      pendingPromise = null;
      return ready();
    },

    getSession() {
      return { ...state };
    },

    getSlug() {
      return normSlug(state.slug || "");
    },

    getPhone() {
      return normPhone(state.phone || "");
    },

    getOwnerId() {
      return state.owner_id || null;
    },

    getModule() {
      return MODULE;
    },

    isAuthenticated() {
      return !!state.access_ok;
    },

    saveSession(payload = {}) {
      const saved = saveSession(payload);

      state.slug = saved.slug;
      state.phone = saved.phone;
      state.owner_id = saved.owner_id || null;
      state.access = !!saved.access;
      state.access_ok = !!saved.access;
      state.preview = !saved.access;
      state.verified_at = saved.verified_at;
      state.validated_at = saved.validated_at;
      state.ready_flag = true;
      state.error = null;
      state.pin_url = buildPinUrl();
      state.pay_url = buildPayUrl();

      cleanVisibleUrl();

      return saved;
    },

    clearSession() {
      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
    },

    clearAll() {
      clearAllLocalState();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
      state.slug = "";
      state.phone = "";
      state.owner_id = null;
      state.verified_at = null;
      state.validated_at = null;
    },

    loginWithPin,
    logout,

    buildPinUrl() {
      return buildPinUrl();
    },

    goPin() {
      goPin();
    },

    buildPayUrl() {
      return buildPayUrl();
    },

    goPay() {
      goPay();
    },

    async resolveSubBySlug(slug) {
      return resolveSubBySlug(slug);
    },

    async resolveSubByPhone(phone) {
      return resolveSubByPhone(phone);
    },

    async checkAccess(phone) {
      return checkAccess(phone || state.phone || "");
    }
  };

  ready();
})();
