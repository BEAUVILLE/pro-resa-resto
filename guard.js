/* DIGIY GUARD — UNIVERSAL MASTER (slug-first, page-safe, preview-safe)
   VERSION: shared Supabase client + boot/getSb/rpc/getPinUrl/getPayUrl/go/logout
*/
(() => {
  "use strict";

  const FALLBACK_SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const FALLBACK_SUPABASE_ANON_KEY = "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

  const DEFAULT_PAY_URL = "https://commencer-a-payer.digiylyfe.com/";
  const DEFAULT_PIN_URL = "./pin.html";
  const DEFAULT_DASHBOARD_URL = "./cockpit.html";

  const ALLOW_PREVIEW_WITHOUT_IDENTITY = true;

  let _sb = null;
  let _bootPromise = null;

  const config = {
    module: "",
    pin: DEFAULT_PIN_URL,
    pay: DEFAULT_PAY_URL,
    dashboard: DEFAULT_DASHBOARD_URL,
    requireSlug: false,
    checkSubscription: true,
    storageSlugKey: "",
    storageLastSlugKey: ""
  };

  const state = {
    module: "",
    preview: true,
    access_ok: false,
    pin_ok: false,
    has_identity: false,
    slug: "",
    phone: "",
    reason: "booting",
    ts: 0
  };

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

  function qps() {
    try {
      return new URLSearchParams(location.search || "");
    } catch {
      return new URLSearchParams();
    }
  }

  function safeJsonParse(v) {
    try {
      return typeof v === "string" ? JSON.parse(v) : v;
    } catch {
      return null;
    }
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

  function normPhone(v) {
    return String(v || "").replace(/[^\d]/g, "");
  }

  function storageGet(key) {
    if (!key) return "";
    try {
      const s = sessionStorage.getItem(key);
      if (s) return s;
    } catch {}
    try {
      const l = localStorage.getItem(key);
      if (l) return l;
    } catch {}
    return "";
  }

  function storageSet(key, value) {
    if (!key) return;
    try { sessionStorage.setItem(key, String(value ?? "")); } catch {}
    try { localStorage.setItem(key, String(value ?? "")); } catch {}
  }

  function storageRemove(key) {
    if (!key) return;
    try { sessionStorage.removeItem(key); } catch {}
    try { localStorage.removeItem(key); } catch {}
  }

  function moduleStorageBase(moduleName) {
    const m = normModule(moduleName);
    return m ? `digiy_${m.toLowerCase()}` : "digiy_module";
  }

  function getModuleSessionKey(moduleName) {
    const m = normModule(moduleName);
    return m ? `DIGIY_${m}_PRO_SESSION` : "DIGIY_PRO_SESSION";
  }

  function applyOptions(opts = {}) {
    const moduleFromOpts = normModule(opts.module || "");
    const moduleFromWindow = normModule(window.DIGIY_MODULE || "");
    const moduleFromQuery = normModule(qps().get("module") || "");
    const finalModule = moduleFromOpts || moduleFromWindow || moduleFromQuery || config.module || "";

    config.module = finalModule;
    config.pin = String(opts.login || opts.pin || config.pin || DEFAULT_PIN_URL).trim() || DEFAULT_PIN_URL;
    config.pay = String(opts.pay || config.pay || DEFAULT_PAY_URL).trim() || DEFAULT_PAY_URL;
    config.dashboard = String(opts.dashboard || config.dashboard || DEFAULT_DASHBOARD_URL).trim() || DEFAULT_DASHBOARD_URL;

    if (Object.prototype.hasOwnProperty.call(opts, "requireSlug")) {
      config.requireSlug = !!opts.requireSlug;
    }

    if (Object.prototype.hasOwnProperty.call(opts, "checkSubscription")) {
      config.checkSubscription = !!opts.checkSubscription;
    }

    config.storageSlugKey =
      String(
        opts.storageSlugKey ||
        config.storageSlugKey ||
        `${moduleStorageBase(config.module)}_slug`
      ).trim();

    config.storageLastSlugKey =
      String(
        opts.storageLastSlugKey ||
        config.storageLastSlugKey ||
        `${moduleStorageBase(config.module)}_last_slug`
      ).trim();

    state.module = config.module;
  }

  function getConfig() {
    const url =
      String(window.DIGIY_SUPABASE_URL || "").trim() ||
      FALLBACK_SUPABASE_URL;

    const key =
      String(window.DIGIY_SUPABASE_ANON_KEY || window.DIGIY_SUPABASE_ANON || "").trim() ||
      FALLBACK_SUPABASE_ANON_KEY;

    return { url, key };
  }

  function ensureSupabaseClient() {
    if (_sb) return _sb;
    if (window.DIGIY_SB) {
      _sb = window.DIGIY_SB;
      return _sb;
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("supabase_lib_missing");
    }

    const { url, key } = getConfig();
    if (!url || !key) throw new Error("supabase_config_missing");

    _sb = window.supabase.createClient(url, key, {
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

    window.DIGIY_SB = _sb;
    if (!window.sb) window.sb = _sb;
    return _sb;
  }

  function readStructuredSession(moduleHint = "") {
    const m = normModule(moduleHint || config.module || "");
    const moduleSessionKey = getModuleSessionKey(m);
    const candidates = [
      moduleSessionKey,
      "DIGIY_PRO_SESSION",
      "DIGIY_ACCESS"
    ];

    for (const key of candidates) {
      const raw = storageGet(key);
      if (!raw) continue;

      const parsed = safeJsonParse(raw);
      if (!parsed || typeof parsed !== "object") continue;

      if (parsed.expires_at && Number(parsed.expires_at) > 0 && Date.now() > Number(parsed.expires_at)) {
        storageRemove(key);
        continue;
      }

      const moduleValue = normModule(parsed.module || m);
      const slugValue = normSlug(parsed.slug || "");
      const phoneValue = normPhone(parsed.phone || "");

      if (!slugValue && !phoneValue) continue;

      return {
        slug: slugValue,
        phone: phoneValue,
        module: moduleValue
      };
    }

    return null;
  }

  function readSimpleSession(moduleHint = "") {
    const m = normModule(moduleHint || config.module || "");
    const keyBase = moduleStorageBase(m);

    const slug =
      normSlug(storageGet(`${keyBase}_slug`) || "") ||
      normSlug(storageGet(`${keyBase}_last_slug`) || "") ||
      normSlug(storageGet("digiy_last_slug") || "") ||
      normSlug(storageGet("DIGIY_SLUG") || "") ||
      normSlug(storageGet("digiy_slug") || "");

    const phone =
      normPhone(storageGet(`${keyBase}_phone`) || "") ||
      normPhone(storageGet("DIGIY_PHONE") || "") ||
      normPhone(storageGet(`DIGIY_${m}_PHONE`) || "") ||
      normPhone(storageGet("digiy_last_phone") || "");

    if (!slug && !phone && !m) return null;

    return {
      slug,
      phone,
      module: m
    };
  }

  function getSession(moduleHint = "") {
    return (
      readStructuredSession(moduleHint) ||
      readSimpleSession(moduleHint) ||
      null
    );
  }

  function rememberIdentity({ slug, phone, module }) {
    const s = normSlug(slug);
    const p = normPhone(phone);
    const m = normModule(module || config.module || "");
    const keyBase = moduleStorageBase(m);

    if (s) {
      storageSet(config.storageSlugKey, s);
      storageSet(config.storageLastSlugKey, s);
      storageSet(`${keyBase}_slug`, s);
      storageSet(`${keyBase}_last_slug`, s);
      storageSet("digiy_last_slug", s);
      storageSet("DIGIY_SLUG", s);
      storageSet("digiy_slug", s);
    }

    if (p) {
      storageSet(`${keyBase}_phone`, p);
      storageSet("DIGIY_PHONE", p);
      if (m) storageSet(`DIGIY_${m}_PHONE`, p);
      storageSet("digiy_last_phone", p);
    }

    storageSet("DIGIY_ACCESS", JSON.stringify({
      slug: s,
      phone: p,
      module: m
    }));
  }

  function enrichUrlIfMissingSlug(slug) {
    const s = normSlug(slug);
    if (!s) return;

    try {
      const u = new URL(location.href);
      const current = normSlug(u.searchParams.get("slug") || "");
      if (current === s) return;
      u.searchParams.set("slug", s);
      history.replaceState({}, "", u.toString());
    } catch {}
  }

  async function resolveIdentityBySlug(sb, slug, moduleHint = "") {
    const s = normSlug(slug);
    const m = normModule(moduleHint || "");
    if (!s) return null;

    let query = sb
      .from("digiy_subscriptions_public")
      .select("phone,slug,module")
      .eq("slug", s)
      .limit(1);

    if (m) query = query.eq("module", m);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data?.phone) return null;

    return {
      slug: normSlug(data.slug || s),
      phone: normPhone(data.phone || ""),
      module: normModule(data.module || m)
    };
  }

  async function resolveIdentityByPhone(sb, phone, moduleHint = "") {
    const p = normPhone(phone);
    const m = normModule(moduleHint || "");
    if (!p || !m) return null;

    const { data, error } = await sb
      .from("digiy_subscriptions_public")
      .select("phone,slug,module")
      .eq("phone", p)
      .eq("module", m)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.phone) return null;

    return {
      slug: normSlug(data.slug || ""),
      phone: normPhone(data.phone || p),
      module: normModule(data.module || m)
    };
  }

  async function hasAccessRaw(sb, phone, module) {
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

  function resetState() {
    state.module = config.module;
    state.preview = true;
    state.access_ok = false;
    state.pin_ok = false;
    state.has_identity = false;
    state.slug = "";
    state.phone = "";
    state.reason = "booting";
    state.ts = Date.now();
  }

  function currentIdentity() {
    const qs = qps();
    const session = getSession(config.module);

    const slug =
      normSlug(qs.get("slug") || "") ||
      normSlug(session?.slug || "") ||
      normSlug(storageGet(config.storageSlugKey) || "") ||
      normSlug(storageGet(config.storageLastSlugKey) || "");

    const phone =
      normPhone(qs.get("phone") || "") ||
      normPhone(session?.phone || "");

    const module =
      normModule(qs.get("module") || "") ||
      normModule(session?.module || "") ||
      normModule(config.module || "");

    return { slug, phone, module };
  }

  function withSlug(target = "") {
    const slug = state.slug || currentIdentity().slug;
    if (!target || !slug) return target;

    try {
      const u = new URL(target, location.href);
      if (!u.searchParams.get("slug")) u.searchParams.set("slug", slug);
      if (u.origin === location.origin) return u.pathname + u.search + u.hash;
      return u.toString();
    } catch {
      const sep = String(target).includes("?") ? "&" : "?";
      return `${target}${sep}slug=${encodeURIComponent(slug)}`;
    }
  }

  function getPinUrl(slug = "") {
    const finalSlug = normSlug(slug || state.slug || currentIdentity().slug);
    try {
      const u = new URL(config.pin || DEFAULT_PIN_URL, location.href);
      if (finalSlug && !u.searchParams.get("slug")) u.searchParams.set("slug", finalSlug);
      if (u.origin === location.origin) return u.pathname + u.search + u.hash;
      return u.toString();
    } catch {
      return withSlug(config.pin || DEFAULT_PIN_URL);
    }
  }

  function getPayUrl(slug = "", phone = "") {
    const finalSlug = normSlug(slug || state.slug || currentIdentity().slug);
    const finalPhone = normPhone(phone || state.phone || currentIdentity().phone);
    const finalModule = normModule(config.module || currentIdentity().module || "");

    try {
      const u = new URL(config.pay || DEFAULT_PAY_URL, location.href);
      if (finalModule) u.searchParams.set("module", finalModule);
      if (finalSlug) u.searchParams.set("slug", finalSlug);
      if (finalPhone) u.searchParams.set("phone", finalPhone);
      u.searchParams.set("return", location.href);
      return u.toString();
    } catch {
      return config.pay || DEFAULT_PAY_URL;
    }
  }

  function setPreview(reason, extra = {}) {
    state.preview = true;
    state.access_ok = false;
    state.pin_ok = !!extra.pin_ok;
    state.has_identity = !!(extra.slug || extra.phone);
    state.slug = extra.slug ?? state.slug ?? "";
    state.phone = extra.phone ?? state.phone ?? "";
    state.reason = reason || "preview";
    state.ts = Date.now();

    return {
      ok: reason === "preview_no_identity" ? ALLOW_PREVIEW_WITHOUT_IDENTITY : false,
      preview: state.preview,
      access_ok: state.access_ok,
      pin_ok: state.pin_ok,
      has_identity: state.has_identity,
      slug: state.slug,
      phone: state.phone,
      module: config.module,
      should_pay: reason === "no_subscription" || reason === "unknown_identity",
      pay_url: getPayUrl(state.slug, state.phone),
      reason: state.reason,
      error: null
    };
  }

  function setAccessOk(extra = {}) {
    state.preview = false;
    state.access_ok = true;
    state.pin_ok = !!extra.pin_ok;
    state.has_identity = true;
    state.slug = extra.slug ?? state.slug ?? "";
    state.phone = extra.phone ?? state.phone ?? "";
    state.reason = "access_ok";
    state.ts = Date.now();

    return {
      ok: true,
      preview: state.preview,
      access_ok: state.access_ok,
      pin_ok: state.pin_ok,
      has_identity: state.has_identity,
      slug: state.slug,
      phone: state.phone,
      module: config.module,
      should_pay: false,
      pay_url: getPayUrl(state.slug, state.phone),
      reason: state.reason,
      error: null
    };
  }

  async function guardCheck() {
    applyOptions({});
    resetState();

    const sb = ensureSupabaseClient();
    const identity = currentIdentity();

    if (!identity.slug && !identity.phone) {
      return setPreview("preview_no_identity", {
        slug: "",
        phone: "",
        pin_ok: false
      });
    }

    let bridged = null;

    if (identity.slug) {
      bridged = await resolveIdentityBySlug(sb, identity.slug, identity.module);
      if (!bridged && !identity.module) {
        bridged = await resolveIdentityBySlug(sb, identity.slug, "");
      }
    }

    if (!bridged && identity.phone && identity.module) {
      bridged = await resolveIdentityByPhone(sb, identity.phone, identity.module);
    }

    if (!bridged) {
      return setPreview("unknown_identity", {
        slug: identity.slug,
        phone: identity.phone,
        pin_ok: false
      });
    }

    rememberIdentity(bridged);
    enrichUrlIfMissingSlug(bridged.slug);

    const session = getSession(bridged.module || config.module);
    const pin_ok = !!(
      session &&
      (
        (session.slug && normSlug(session.slug) === bridged.slug) ||
        (session.phone && normPhone(session.phone) === bridged.phone)
      )
    );

    if (config.checkSubscription === false) {
      return setAccessOk({
        slug: bridged.slug,
        phone: bridged.phone,
        pin_ok
      });
    }

    const access = await hasAccessRaw(sb, bridged.phone, bridged.module || config.module);

    if (!access) {
      return setPreview("no_subscription", {
        slug: bridged.slug,
        phone: bridged.phone,
        pin_ok
      });
    }

    return setAccessOk({
      slug: bridged.slug,
      phone: bridged.phone,
      pin_ok
    });
  }

  async function bootOnce(force = false, opts = {}) {
    if (_bootPromise && !force) return _bootPromise;

    applyOptions(opts);

    _bootPromise = (async () => {
      try {
        const result = await guardCheck();
        window.DIGIY_GUARD.state = result;
        return result;
      } catch (e) {
        const identity = currentIdentity();
        const fallback = {
          ok: false,
          preview: !!ALLOW_PREVIEW_WITHOUT_IDENTITY,
          access_ok: false,
          pin_ok: false,
          has_identity: !!(identity.slug || identity.phone),
          slug: identity.slug,
          phone: identity.phone,
          module: config.module,
          should_pay: false,
          pay_url: getPayUrl(identity.slug, identity.phone),
          reason: "guard_error",
          error: String(e?.message || e)
        };
        window.DIGIY_GUARD.state = fallback;
        return fallback;
      }
    })();

    window.DIGIY_GUARD.ready = _bootPromise;
    return _bootPromise;
  }

  async function refresh() {
    return bootOnce(true, {});
  }

  async function boot(opts = {}) {
    return bootOnce(true, opts);
  }

  async function checkAccess() {
    await window.DIGIY_GUARD.ready;
    return refresh();
  }

  async function rpc(fnName, args = {}) {
    const sb = ensureSupabaseClient();
    const { data, error } = await sb.rpc(fnName, args);
    if (error) throw error;
    return typeof data === "string" ? (safeJsonParse(data) ?? data) : data;
  }

  async function digiyRequireAccess(options = {}) {
    await window.DIGIY_GUARD.ready;
    const st = window.DIGIY_GUARD.state || {};

    if (st.access_ok) return st;

    const mode = options.mode || "none";

    if (mode === "pin") {
      location.assign(getPinUrl(st.slug));
      return st;
    }

    if (mode === "pay") {
      location.assign(getPayUrl(st.slug, st.phone));
      return st;
    }

    return st;
  }

  async function requirePaidAccess() {
    const st = await refresh();

    if (st.preview) return st;
    if (st.access_ok) return st;

    if (st.should_pay && st.pay_url) {
      location.replace(st.pay_url);
      return st;
    }

    return st;
  }

  function go(target, mode = "assign") {
    let finalTarget = target;

    if (!finalTarget || finalTarget === "__back__") {
      finalTarget = config.dashboard || DEFAULT_DASHBOARD_URL;
    }

    finalTarget = withSlug(finalTarget);

    if (mode === "replace") location.replace(finalTarget);
    else location.assign(finalTarget);
  }

  function logout(redirect = "") {
    const m = normModule(config.module || "");
    const keyBase = moduleStorageBase(m);

    [
      config.storageSlugKey,
      config.storageLastSlugKey,
      `${keyBase}_slug`,
      `${keyBase}_last_slug`,
      `${keyBase}_phone`,
      "DIGIY_SLUG",
      "digiy_slug",
      "digiy_last_slug",
      "DIGIY_PHONE",
      `DIGIY_${m}_PHONE`,
      "digiy_last_phone",
      getModuleSessionKey(m),
      "DIGIY_PRO_SESSION",
      "DIGIY_ACCESS"
    ].forEach(storageRemove);

    state.preview = true;
    state.access_ok = false;
    state.pin_ok = false;
    state.has_identity = false;
    state.slug = "";
    state.phone = "";
    state.reason = "logout";
    state.ts = Date.now();

    const target = redirect || getPinUrl("");
    location.replace(target);
  }

  window.DIGIY_GUARD = {
    state: null,
    ready: null,
    boot,
    refresh,
    checkAccess,
    rpc,
    requirePaidAccess,
    getSb: () => ensureSupabaseClient(),
    getSupabase: () => ensureSupabaseClient(),
    getSlug: () => state.slug || currentIdentity().slug,
    getSession: () => getSession(config.module),
    getPayUrl: (slug = "", phone = "") => getPayUrl(slug, phone),
    getPinUrl: (slug = "") => getPinUrl(slug),
    withSlug,
    go,
    logout
  };

  window.digiyRequireAccess = digiyRequireAccess;
  window.DIGIY_GUARD.ready = bootOnce(false, {});
})();
