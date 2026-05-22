// guard.js — DIGIY RESA
// Doctrine : PRO = coffre sécurisé
// PIN une seule fois -> session RESA locale fraîche -> navigation interne directe
// Façade : jamais de téléphone dans les URLs visibles
// Coffre interne : phone gardé seulement pour les RPC Supabase si nécessaire
// Rail ABOS : digiy_has_module_access_from_abos(phone, "RESA") d'abord
// Secours transition : digiy_has_access(phone, "RESA")

(() => {
  "use strict";

  const BUILD_ID = "resa-guard-abos-central-v1-20260522";
  const BUILD_KEY = "DIGIY_RESA_GUARD_BUILD_ID";

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
        "DIGIY_RESA_ACCESS",
        "digiy_resa_session",
        "DIGIY_ACCESS"
      ],
      SLUG_KEY: "digiy_resa_slug",
      PHONE_KEY: "digiy_resa_phone",
      LAST_SLUG_KEY: "digiy_resa_last_slug",
      LAST_PHONE_KEY: "digiy_resa_last_phone",
      HUB_PHONE_KEY: "DIGIY_RESA_HUB_PHONE",
      ACTIVE_MODULE_KEY: "DIGIY_ACTIVE_MODULE"
    },

    RPC: {
      VERIFY_PIN: "digiy_verify_pin",
      HAS_MODULE_ACCESS_FROM_ABOS: "digiy_has_module_access_from_abos",
      HAS_ACCESS_LEGACY: "digiy_has_access"
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

  const MODULE_ALIASES = Array.from(new Set([
    MODULE,
    MODULE_LOWER,
    "RESA_PRO",
    "resa_pro",
    "RESERVATION",
    "reservation",
    "RESERVATIONS",
    "reservations"
  ]));

  const bootUrl = new URL(location.href);
  const bootQs = new URLSearchParams(bootUrl.search);

  const legacySlugQ = bootQs.get("slug") || "";
  const legacyPhoneQ =
    bootQs.get("phone") ||
    bootQs.get("tel") ||
    bootQs.get("resa_" + "tel") ||
    "";

  const SENSITIVE_URL_KEYS = [
    "slug",
    "phone",
    "tel",
    "owner_phone",
    "owner_id",
    "p_phone",
    "resa_" + "tel",
    "resa_phone",
    "business_phone",
    "whatsapp",
    "module",
    "return",
    "redirect",
    "redirect_url",
    "url",
    "from",
    "v",
    "pin",
    "code",
    "token",
    "session",
    "access",
    "keybox_code",
    "keybox_location",
    "access_note"
  ];

  let pendingPromise = null;

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function normSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
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

  function parseTime(value) {
    if (value === null || value === undefined || value === "") return 0;

    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 0 && value < 100000000000 ? value * 1000 : value;
    }

    const str = String(value).trim();
    if (!str) return 0;

    if (/^\d+$/.test(str)) {
      const n = Number(str);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return n < 100000000000 ? n * 1000 : n;
    }

    const d = Date.parse(str);
    return Number.isFinite(d) ? d : 0;
  }

  function isRecent(ts) {
    const n = parseTime(ts);
    if (!n) return false;
    const age = nowMs() - n;
    return age >= 0 && age <= CFG.SESSION_MAX_AGE_MS;
  }

  function isFuture(ts) {
    const n = parseTime(ts);
    return n > nowMs();
  }

  function isSensitiveSlug(slug) {
    return /\d{7,}/.test(String(slug || ""));
  }

  function canExposeSlug(slug) {
    const s = normSlug(slug);
    return !!s && !isSensitiveSlug(s);
  }

  function isLoginPage() {
    const path = String(location.pathname || "").toLowerCase();
    return path.endsWith("/pin.html") || path.endsWith("pin.html");
  }

  function isPublicEntryPage() {
    const path = String(location.pathname || "").toLowerCase();
    return path.endsWith("/") || path.endsWith("/index.html") || path.endsWith("index.html");
  }

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

  function boolFromRpcData(data) {
    const raw = Array.isArray(data) ? data[0] : data;

    if (raw === true) return true;
    if (raw === 1) return true;

    if (typeof raw === "string") {
      const txt = raw.trim().toLowerCase();

      if (txt === "true" || txt === "t" || txt === "1" || txt === "yes" || txt === "ok") {
        return true;
      }

      if (txt.startsWith("(")) {
        const first = txt.replace(/^\(/, "").split(",")[0];
        const token = String(first || "").trim().replace(/^"|"$/g, "").toLowerCase();
        if (token === "t" || token === "true" || token === "1") return true;
      }

      return false;
    }

    if (raw && typeof raw === "object") {
      if (raw.ok === true) return true;
      if (raw.access === true) return true;
      if (raw.access_ok === true) return true;
      if (raw.has_access === true) return true;
      if (raw.allowed === true) return true;
      if (raw.active === true) return true;
      if (raw.is_active === true) return true;
      if (raw.subscribed === true) return true;
      if (raw.valid === true) return true;

      const vals = Object.values(raw);
      if (vals.some((v) => v === true || v === 1 || v === "t" || v === "true")) {
        return true;
      }
    }

    return false;
  }

  async function tryRpcBoolean(name, payloads) {
    for (const body of payloads) {
      try {
        const clean = {};
        Object.entries(body || {}).forEach(([key, value]) => {
          if (value) clean[key] = value;
        });

        if (!Object.keys(clean).length) continue;

        const res = await rpc(name, clean);
        if (!res.ok) continue;

        if (boolFromRpcData(res.data)) return true;
      } catch (_) {}
    }

    return false;
  }

  function clearGuardCacheOnce() {
    try {
      const previous = localStorage.getItem(BUILD_KEY);
      if (previous === BUILD_ID) return;

      localStorage.setItem(BUILD_KEY, BUILD_ID);

      [
        "digiy_resa_guard_cache",
        "digiy_resa_old_guard",
        "resa_guard_old_state"
      ].forEach((key) => {
        try { localStorage.removeItem(key); } catch (_) {}
        try { sessionStorage.removeItem(key); } catch (_) {}
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys
            .filter((name) => /resa|pro-resa|digiy-resa/i.test(String(name || "")))
            .forEach((name) => caches.delete(name));
        }).catch(() => {});
      }
    } catch (_) {}
  }

  function removeSensitiveParams(url) {
    try {
      SENSITIVE_URL_KEYS.forEach((key) => url.searchParams.delete(key));
    } catch (_) {}
    return url;
  }

  function saveSlugOnly(slug) {
    const clean = normSlug(slug);
    if (!clean) return;

    try {
      sessionStorage.setItem(CFG.STORAGE.SLUG_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.LAST_SLUG_KEY, clean);

      if (canExposeSlug(clean)) {
        localStorage.setItem(CFG.STORAGE.SLUG_KEY, clean);
        localStorage.setItem(CFG.STORAGE.LAST_SLUG_KEY, clean);
      } else {
        localStorage.removeItem(CFG.STORAGE.SLUG_KEY);
        localStorage.removeItem(CFG.STORAGE.LAST_SLUG_KEY);
      }
    } catch (_) {}
  }

  function savePhoneOnly(phone) {
    const clean = normPhone(phone);
    if (!clean) return;

    try {
      sessionStorage.setItem(CFG.STORAGE.PHONE_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.LAST_PHONE_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.HUB_PHONE_KEY, clean);

      // Téléphone gardé pour la session active, pas exposé durablement dans les clés simples locales.
      localStorage.removeItem(CFG.STORAGE.PHONE_KEY);
      localStorage.removeItem(CFG.STORAGE.LAST_PHONE_KEY);
      localStorage.removeItem(CFG.STORAGE.HUB_PHONE_KEY);

      window.DIGIY_RESA_HUB_PHONE = clean;
    } catch (_) {}
  }

  function readSavedSlug() {
    try {
      const clean = normSlug(
        legacySlugQ ||
        sessionStorage.getItem(CFG.STORAGE.SLUG_KEY) ||
        sessionStorage.getItem(CFG.STORAGE.LAST_SLUG_KEY) ||
        localStorage.getItem(CFG.STORAGE.SLUG_KEY) ||
        localStorage.getItem(CFG.STORAGE.LAST_SLUG_KEY) ||
        ""
      );

      if (clean && isSensitiveSlug(clean)) {
        try {
          localStorage.removeItem(CFG.STORAGE.SLUG_KEY);
          localStorage.removeItem(CFG.STORAGE.LAST_SLUG_KEY);
        } catch (_) {}
      }

      return clean;
    } catch (_) {
      return normSlug(legacySlugQ || "");
    }
  }

  function readSavedPhone() {
    try {
      return normPhone(
        legacyPhoneQ ||
        sessionStorage.getItem(CFG.STORAGE.PHONE_KEY) ||
        sessionStorage.getItem(CFG.STORAGE.LAST_PHONE_KEY) ||
        sessionStorage.getItem(CFG.STORAGE.HUB_PHONE_KEY) ||
        window.DIGIY_RESA_HUB_PHONE ||
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
      CFG.STORAGE.LAST_SLUG_KEY,
      CFG.STORAGE.LAST_PHONE_KEY,
      CFG.STORAGE.HUB_PHONE_KEY
    ].forEach((key) => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });

    try {
      delete window.DIGIY_ACCESS;
      delete window.DIGIY_RESA_HUB_PHONE;
    } catch (_) {}
  }

  function moduleMatches(moduleName) {
    const m = upper(moduleName || "");
    if (!m) return true;
    return MODULE_ALIASES.map((x) => upper(x)).includes(m);
  }

  function cleanVisibleUrl() {
    try {
      const url = new URL(location.href);

      const slugFromUrl = normSlug(url.searchParams.get("slug") || "");
      const phoneFromUrl = normPhone(
        url.searchParams.get("phone") ||
        url.searchParams.get("tel") ||
        url.searchParams.get("resa_" + "tel") ||
        url.searchParams.get("resa_phone") ||
        url.searchParams.get("business_phone") ||
        url.searchParams.get("owner_phone") ||
        url.searchParams.get("p_phone") ||
        ""
      );

      if (slugFromUrl) saveSlugOnly(slugFromUrl);
      if (phoneFromUrl) savePhoneOnly(phoneFromUrl);

      removeSensitiveParams(url);

      history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (_) {}
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
      if (!moduleMatches(moduleName)) continue;

      const slug = normSlug(parsed.slug || "");
      const phone = normPhone(parsed.phone || "");
      const owner_id = parsed.owner_id || null;

      const access =
        parsed.access === true ||
        parsed.access_ok === true ||
        parsed.ok === true ||
        parsed.has_access === true ||
        parsed.verified === true ||
        parsed.pin_session_ok === true;

      const verifiedAt =
        parseTime(parsed.verified_at) ||
        parseTime(parsed.validated_at_ms) ||
        parseTime(parsed.ts) ||
        parseTime(parsed.created_at) ||
        0;

      const expiresAt = parseTime(parsed.expires_at || parsed.expiresAt || 0);
      const validatedAtIso = parsed.validated_at || null;

      const ageOk =
        isFuture(expiresAt) ||
        isRecent(verifiedAt) ||
        isRecent(validatedAtIso);

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
        access_ok: true,
        pin_session_ok: true,
        verified_at: verifiedAt || nowMs(),
        validated_at: validatedAtIso || new Date(verifiedAt || nowMs()).toISOString(),
        expires_at: expiresAt || (nowMs() + CFG.SESSION_MAX_AGE_MS)
      };
    }

    return null;
  }

  function saveSession(payload = {}) {
    const verifiedAtMs =
      parseTime(payload.verified_at || payload.validated_at_ms || 0) ||
      nowMs();

    const expiresAtMs =
      parseTime(payload.expires_at || payload.expiresAt || 0) ||
      verifiedAtMs + CFG.SESSION_MAX_AGE_MS;

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
      pin_session_ok: !!payload.access,
      preview: !payload.access,
      verified_at: verifiedAtMs,
      validated_at: validatedAtIso,
      validated_at_ms: verifiedAtMs,
      expires_at: expiresAtMs,
      ts: nowMs(),
      reason: payload.reason || "resa_guard"
    };

    try {
      localStorage.setItem(CFG.STORAGE.ACTIVE_MODULE_KEY, MODULE);
      sessionStorage.setItem(CFG.STORAGE.ACTIVE_MODULE_KEY, MODULE);
    } catch (_) {}

    const raw = JSON.stringify(session);

    for (const key of CFG.STORAGE.SESSION_KEYS) {
      try { sessionStorage.setItem(key, raw); } catch (_) {}
      try { localStorage.setItem(key, raw); } catch (_) {}
    }

    if (session.slug) saveSlugOnly(session.slug);
    if (session.phone) savePhoneOnly(session.phone);

    try {
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, session);
    } catch (_) {}

    cleanVisibleUrl();

    return session;
  }

  function cleanInternalUrl(path) {
    const baseStr = String(path || "").trim() || "./dashboard-pro.html";

    try {
      const url = /^https?:\/\//i.test(baseStr)
        ? new URL(baseStr)
        : new URL(baseStr, location.href);

      removeSensitiveParams(url);

      const slug = normSlug(url.searchParams.get("slug") || "");
      if (slug && isSensitiveSlug(slug)) {
        url.searchParams.delete("slug");
      }

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

    try {
      sessionStorage.setItem("digiy_resa_return_target", target);
    } catch (_) {}

    const url = new URL(CFG.PIN_PATH, location.href);
    removeSensitiveParams(url);

    if (url.origin === location.origin) {
      return "./" + (url.pathname.split("/").pop() || "pin.html");
    }

    return url.toString();
  }

  function goPin() {
    if (isLoginPage()) {
      showPage();
      return;
    }

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
      if (moduleName && !moduleMatches(moduleName)) continue;

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
      if (moduleName && !moduleMatches(moduleName)) continue;

      return {
        slug: normSlug(res.data[0].slug),
        phone: normPhone(res.data[0].phone),
        module: moduleName || MODULE
      };
    }

    return null;
  }

  function buildAccessPayloads(phone) {
    const p = normPhone(phone);
    const payloads = [];

    MODULE_ALIASES.forEach((moduleCode) => {
      payloads.push({ p_phone: p, p_module: moduleCode });
      payloads.push({ phone: p, module: moduleCode });
      payloads.push({ input_phone: p, input_module: moduleCode });
    });

    return payloads;
  }

  async function checkAccessFromAbos(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    return tryRpcBoolean(
      CFG.RPC.HAS_MODULE_ACCESS_FROM_ABOS,
      buildAccessPayloads(p)
    );
  }

  async function checkAccessLegacy(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    return tryRpcBoolean(
      CFG.RPC.HAS_ACCESS_LEGACY,
      buildAccessPayloads(p)
    );
  }

  async function checkAccess(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    const abosOk = await checkAccessFromAbos(p);
    if (abosOk) return true;

    const legacyOk = await checkAccessLegacy(p);
    if (legacyOk) return true;

    return false;
  }

  function parseVerifyPinPayload(data, fallbackPhone = "") {
    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return null;

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const moduleName = upper(raw.module || raw.p_module || MODULE);

      if (
        (raw.ok === true || raw.access_ok === true || raw.valid === true) &&
        moduleMatches(moduleName)
      ) {
        return {
          ok: true,
          phone: normPhone(raw.phone || raw.p_phone || fallbackPhone || ""),
          module: moduleName,
          owner_id: raw.owner_id || null,
          slug: normSlug(raw.slug || raw.owner_slug || "")
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

        if (okLike && moduleMatches(mod)) {
          return {
            ok: true,
            module: mod,
            phone: normPhone(vals[2] || fallbackPhone || ""),
            owner_id: vals[4] || null,
            slug: ""
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

          if (okLike && moduleMatches(mod)) {
            return {
              ok: true,
              module: mod,
              phone: normPhone(phoneToken || fallbackPhone || ""),
              owner_id: null,
              slug: ""
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
        slug: normSlug(parsed.slug || s),
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
    pin_session_ok: false,
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
    expires_at: stored?.expires_at || null,
    pin_url: "",
    pay_url: "",
    build_id: BUILD_ID
  };

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
    let finalSlug = normSlug(auth.slug || s);
    const finalOwnerId = auth.owner_id || null;

    if (!finalSlug && finalPhone) {
      const sub = await resolveSubByPhone(finalPhone);
      finalSlug = normSlug(sub?.slug || "");
    }

    if (!finalSlug && finalPhone) {
      finalSlug = `${MODULE_LOWER}-${finalPhone}`;
    }

    const accessOk = await checkAccess(finalPhone);

    if (!accessOk) {
      return { ok: false, error: "Abonnement RESA inactif." };
    }

    const saved = saveSession({
      slug: finalSlug,
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
    state.pin_session_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.expires_at = saved.expires_at;
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
    state.pin_session_ok = false;
    state.preview = true;
    state.ready_flag = false;
    state.error = null;
    state.verified_at = null;
    state.validated_at = null;
    state.expires_at = null;

    showPage();
    goPin();
  }

  async function check(options = {}) {
    const opts = Object.assign(
      {
        redirect: true,
        preserve_validation: true
      },
      options || {}
    );

    cleanVisibleUrl();

    const storedSession = readStoredSession();
    const persistedSlug = readSavedSlug();
    const persistedPhone = readSavedPhone();

    let slug = normSlug(storedSession?.slug || state.slug || persistedSlug || "");
    let phone = normPhone(storedSession?.phone || state.phone || persistedPhone || "");
    let owner_id = storedSession?.owner_id || state.owner_id || null;

    const verifiedAt =
      parseTime(storedSession?.verified_at || state.verified_at || 0) || 0;

    const validatedAt =
      storedSession?.validated_at || state.validated_at || null;

    const expiresAt =
      parseTime(storedSession?.expires_at || state.expires_at || 0) || 0;

    state.slug = slug;
    state.phone = phone;
    state.owner_id = owner_id;
    state.verified_at = verifiedAt;
    state.validated_at = validatedAt;
    state.expires_at = expiresAt;
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
        state.pin_session_ok = false;
        state.preview = true;
        state.ready_flag = true;
        state.error = "Accès RESA absent.";
        showPage();
        return { ...state };
      }

      if (!opts.preserve_validation) clearSessionsOnly();
      else clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Accès RESA absent.";

      showPage();

      if (opts.redirect !== false && !isLoginPage()) {
        goPin();
      }

      return { ...state };
    }

    if (!slug) {
      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Identifiant RESA absent côté coffre.";

      showPage();

      if (opts.redirect !== false && !isLoginPage()) {
        goPin();
      }

      return { ...state };
    }

    const freshSession =
      isFuture(expiresAt) ||
      (!!verifiedAt && isRecent(verifiedAt)) ||
      (!!validatedAt && isRecent(validatedAt));

    if (!freshSession) {
      clearSessionsOnly();

      if (slug) saveSlugOnly(slug);
      if (phone) savePhoneOnly(phone);

      state.access = false;
      state.access_ok = false;
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Session PIN absente ou expirée.";

      showPage();

      if (opts.redirect !== false && !isLoginPage()) {
        goPin();
      }

      return { ...state };
    }

    state.access = true;
    state.access_ok = true;
    state.pin_session_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;

    const saved = saveSession({
      slug,
      phone,
      owner_id,
      access: true,
      verified_at: verifiedAt || nowMs(),
      expires_at: expiresAt || (nowMs() + CFG.SESSION_MAX_AGE_MS),
      validated_at: validatedAt || nowIso(),
      reason: "session_fresh"
    });

    state.slug = saved.slug;
    state.phone = saved.phone;
    state.owner_id = saved.owner_id;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.expires_at = saved.expires_at;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();

    cleanVisibleUrl();
    showPage();

    return { ...state };
  }

  function ready(options = {}) {
    const opts = Object.assign(
      {
        redirect: true,
        preserve_validation: true
      },
      options || {}
    );

    clearGuardCacheOnce();

    if (opts.redirect !== false && !isLoginPage() && !isPublicEntryPage()) {
      hidePage();
    }

    if (state.ready_flag) {
      showPage();
      return Promise.resolve({ ...state });
    }

    if (!pendingPromise) {
      pendingPromise = check(opts).finally(() => {
        pendingPromise = null;
      });
    }

    return pendingPromise;
  }

  window.DIGIY_GUARD = {
    VERSION: BUILD_ID,
    state,
    ready,

    async refresh(options = {}) {
      state.ready_flag = false;
      state.error = null;
      pendingPromise = null;
      return ready(options);
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

    getBuildId() {
      return BUILD_ID;
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
      state.pin_session_ok = !!saved.access;
      state.preview = !saved.access;
      state.verified_at = saved.verified_at;
      state.validated_at = saved.validated_at;
      state.expires_at = saved.expires_at;
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
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
    },

    clearAll() {
      clearAllLocalState();

      state.access = false;
      state.access_ok = false;
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
      state.slug = "";
      state.phone = "";
      state.owner_id = null;
      state.verified_at = null;
      state.validated_at = null;
      state.expires_at = null;
    },

    loginWithPin,
    logout,

    cleanUrl() {
      cleanVisibleUrl();
      return true;
    },

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
    },

    async checkAccessFromAbos(phone) {
      return checkAccessFromAbos(phone || state.phone || "");
    },

    async checkAccessLegacy(phone) {
      return checkAccessLegacy(phone || state.phone || "");
    }
  };

  if (isPublicEntryPage() || isLoginPage()) {
    ready({ redirect: false }).catch(() => showPage());
  } else {
    ready({ redirect: true }).catch(() => showPage());
  }
})();
