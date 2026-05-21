/*
  DIGIYLYFE — Mémoire locale RESA
  Module : RESA / Je réserve
  Rôle : garder brouillons, demandes, réservations, fermetures et notes locales
  sans bloquer Supabase. Local robuste d'abord, Supabase ensuite.
*/
(function(){
  "use strict";

  const ROOT = "DIGIY_RESA_MEMORY_V1";
  const MODULE = "RESA";

  const LEGACY = {
    slug: ["digiy_resa_slug", "digiy_resa_last_slug", "RESA_LAST_SLUG"],
    phone: ["digiy_resa_phone", "resa_tel", "resa_phone", "RESA_PHONE"],
    bookings: ["digiy_resa_bookings", "digiy_resa_bookings_cache"],
    closures: ["digiy_resa_closures", "digiy_resa_closed_days"],
    notes: ["digiy_resa_notes"],
    draft: ["digiy_resa_draft", "digiy_resa_request_draft"]
  };

  function safeStorage(kind){
    try{
      const s = kind === "session" ? window.sessionStorage : window.localStorage;
      const k = ROOT + "_TEST";
      s.setItem(k, "1");
      s.removeItem(k);
      return s;
    }catch(_){
      return null;
    }
  }

  const local = safeStorage("local");
  const session = safeStorage("session");

  function readRaw(key){
    try{
      return (session && session.getItem(key)) || (local && local.getItem(key)) || "";
    }catch(_){ return ""; }
  }

  function writeRaw(key, value, opts){
    const target = opts && opts.session ? session : local;
    if(!target) return false;
    try{
      target.setItem(key, String(value ?? ""));
      return true;
    }catch(_){ return false; }
  }

  function removeRaw(key){
    try{ if(local) local.removeItem(key); }catch(_){}
    try{ if(session) session.removeItem(key); }catch(_){}
  }

  function readJson(key, fallback){
    const raw = readRaw(key);
    if(!raw) return fallback;
    try{
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    }catch(_){
      return fallback;
    }
  }

  function writeJson(key, value, opts){
    try{
      return writeRaw(key, JSON.stringify(value), opts);
    }catch(_){ return false; }
  }

  function normSlug(value){
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g,"-")
      .replace(/[^a-z0-9-]/g,"")
      .replace(/-+/g,"-")
      .replace(/^-|-$/g,"");
  }

  function normPhone(value){
    const digits = String(value || "").replace(/[^\d]/g,"");
    if(!digits) return "";
    if(digits.startsWith("221") && digits.length === 12) return digits;
    if(digits.length === 9) return "221" + digits;
    return digits.slice(0,15);
  }

  function first(keys){
    for(const key of keys){
      const v = readRaw(key);
      if(String(v || "").trim()) return String(v).trim();
    }
    return "";
  }

  function sessionHint(){
    let bridge = {};
    try{
      if(window.DIGIY_MODULE_BRIDGE && typeof window.DIGIY_MODULE_BRIDGE.readSession === "function"){
        bridge = window.DIGIY_MODULE_BRIDGE.readSession() || {};
      }else if(window.DIGIY_MODULE_BRIDGE && typeof window.DIGIY_MODULE_BRIDGE.getSession === "function"){
        bridge = window.DIGIY_MODULE_BRIDGE.getSession() || {};
      }
    }catch(_){}

    const slug = normSlug(
      bridge.slug ||
      bridge.workspace_slug ||
      first(LEGACY.slug)
    );

    const phone = normPhone(
      bridge.phone ||
      bridge.tel ||
      first(LEGACY.phone)
    );

    return { slug, phone, module: MODULE };
  }

  function rememberSession(data){
    const input = data || {};
    const slug = normSlug(input.slug || input.workspace_slug || "");
    const phone = normPhone(input.phone || input.tel || "");

    if(slug){
      writeRaw("digiy_resa_slug", slug);
      writeRaw("digiy_resa_last_slug", slug);
    }

    if(phone){
      writeRaw("digiy_resa_phone", phone);
      writeRaw("resa_phone", phone);
      writeRaw("resa_tel", phone);
    }

    return sessionHint();
  }

  function saveDraft(draft){
    const payload = {
      ...(draft || {}),
      updated_at: new Date().toISOString()
    };
    writeJson("digiy_resa_draft", payload);
    writeJson(ROOT + "_draft", payload);
    return payload;
  }

  function loadDraft(){
    return readJson(ROOT + "_draft", null) || readJson("digiy_resa_draft", {});
  }

  function clearDraft(){
    removeRaw(ROOT + "_draft");
    removeRaw("digiy_resa_draft");
    removeRaw("digiy_resa_request_draft");
    return true;
  }

  function listBookings(){
    const modern = readJson(ROOT + "_bookings", null);
    if(Array.isArray(modern)) return modern;

    for(const key of LEGACY.bookings){
      const rows = readJson(key, null);
      if(Array.isArray(rows)) return rows;
    }

    return [];
  }

  function saveBookings(items){
    const arr = Array.isArray(items) ? items : [];
    writeJson(ROOT + "_bookings", arr.slice(-500));
    writeJson("digiy_resa_bookings", arr.slice(-500));
    return arr;
  }

  function upsertBooking(booking){
    const item = {
      id: booking?.id || ("local_resa_" + Date.now()),
      ...booking,
      local_saved_at: new Date().toISOString()
    };
    const arr = listBookings().filter(x => String(x?.id) !== String(item.id));
    arr.unshift(item);
    saveBookings(arr);
    return item;
  }

  function listClosures(){
    const modern = readJson(ROOT + "_closures", null);
    if(Array.isArray(modern)) return modern;

    for(const key of LEGACY.closures){
      const rows = readJson(key, null);
      if(Array.isArray(rows)) return rows;
    }

    return [];
  }

  function saveClosures(items){
    const arr = Array.isArray(items) ? items : [];
    writeJson(ROOT + "_closures", arr.slice(-500));
    writeJson("digiy_resa_closures", arr.slice(-500));
    writeJson("digiy_resa_closed_days", arr.slice(-500));
    return arr;
  }

  function addClosure(closure){
    const item = {
      id: closure?.id || ("closure_" + Date.now()),
      ...closure,
      local_saved_at: new Date().toISOString()
    };
    const arr = listClosures().filter(x => String(x?.id) !== String(item.id));
    arr.unshift(item);
    saveClosures(arr);
    return item;
  }

  function isClosedDate(dateString){
    const d = String(dateString || "").slice(0,10);
    if(!d) return false;

    return listClosures().some(row => {
      const start = String(row.start || row.date || row.from || "").slice(0,10);
      const end = String(row.end || row.to || row.date || row.start || "").slice(0,10);
      if(start && end) return d >= start && d <= end;
      return start === d;
    });
  }

  function notes(){
    const arr = readJson(ROOT + "_notes", null);
    if(Array.isArray(arr)) return arr;
    const legacy = readJson("digiy_resa_notes", []);
    return Array.isArray(legacy) ? legacy : [];
  }

  function addNote(text, meta){
    const note = {
      id: "resa_note_" + Date.now(),
      text: String(text || "").trim(),
      meta: meta || {},
      created_at: new Date().toISOString()
    };
    if(!note.text) return null;
    const arr = notes();
    arr.unshift(note);
    writeJson(ROOT + "_notes", arr.slice(0,200));
    writeJson("digiy_resa_notes", arr.slice(0,200));
    return note;
  }

  function clearLocal(){
    [
      ROOT + "_draft",
      ROOT + "_bookings",
      ROOT + "_closures",
      ROOT + "_notes",
      "digiy_resa_draft",
      "digiy_resa_request_draft"
    ].forEach(removeRaw);
    return true;
  }

  window.DIGIY_RESA_MEMORY = {
    version: "resa-memory-v1-20260521",
    sessionHint,
    rememberSession,
    saveDraft,
    loadDraft,
    clearDraft,
    listBookings,
    saveBookings,
    upsertBooking,
    listClosures,
    saveClosures,
    addClosure,
    isClosedDate,
    notes,
    addNote,
    clearLocal
  };
})();
