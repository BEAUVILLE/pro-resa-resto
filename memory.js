/* =========================================================
   DIGIY RESA PRO — MÉMOIRE LOCALE RÉSERVATIONS
   Version terrain V1 — 2026-05-20

   Même doctrine que DIGIY DRIVER PRO MEMORY.
   Deux blocs :
     1) Réservations reçues  → pense-bête établissement
     2) Disponibilités posées → planning public / fiche client

   Local robuste d'abord, Supabase ensuite.
   ========================================================= */
(function(){
  "use strict";

  if(window.DIGIY_RESA_PRO_MEMORY_READY) return;
  window.DIGIY_RESA_PRO_MEMORY_READY = true;

  /* ── Clés PRO (courantes) ── */
  var KEYS = {
    reservations: "DIGIY_RESA_PRO_RESERVATIONS",
    planning:     "DIGIY_RESA_PRO_PLANNING",
    signals:      "DIGIY_RESA_PRO_SIGNALS",
    snapshot:     "DIGIY_RESA_PRO_SYNC_SNAPSHOT_V1"
  };

  /* ── Clés LEGACY (rétrocompat pages déjà posées) ── */
  var LEGACY = {
    reservations: "DIGIY_RESA_RESERVATIONS",
    planning:     "DIGIY_RESA_PLANNING",
    signals:      "DIGIY_RESA_SIGNALS",
    snapshot:     "DIGIY_RESA_SYNC_SNAPSHOT_V1"
  };

  /* ═══════════════════════════════════════════════════════
     UTILITAIRES
  ═══════════════════════════════════════════════════════ */

  function readJson(key, fallback){
    try{
      var raw = localStorage.getItem(key);
      if(!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    }catch(_){ return fallback; }
  }

  function writeJson(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    }catch(e){
      console.warn("[DIGIY RESA MEMORY] impossible d'écrire", key, e && e.message ? e.message : e);
      return false;
    }
  }

  function writeBoth(proKey, legacyKey, value){
    writeJson(proKey, value);
    if(legacyKey && legacyKey !== proKey) writeJson(legacyKey, value);
  }

  function readBoth(proKey, legacyKey, fallback){
    var pro = readJson(proKey, null);
    if(pro != null) return pro;
    var legacy = readJson(legacyKey, null);
    if(legacy != null) return legacy;
    return fallback;
  }

  function idFrom(text){
    return String(text || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || ("id-" + Date.now());
  }

  function now(){ return new Date().toISOString(); }

  function list(pairs){
    var out = [];
    pairs.forEach(function(pair){
      var rows = readBoth(pair[0], pair[1], []);
      if(Array.isArray(rows)) out = out.concat(rows);
    });
    return out;
  }

  function dedupe(rows){
    var map = new Map();
    rows.forEach(function(row){
      if(!row) return;
      var key = String(
        row.id ||
        row.reference ||
        row.booking_ref ||
        row.client_name + "-" + (row.checkin || row.date || "") ||
        Math.random()
      );
      map.set(key, Object.assign({}, map.get(key) || {}, row));
    });
    return Array.from(map.values());
  }

  /* ═══════════════════════════════════════════════════════
     SIGNAUX
  ═══════════════════════════════════════════════════════ */

  function rememberSignal(type, label, message, href){
    var rows = readBoth(KEYS.signals, LEGACY.signals, []);
    if(!Array.isArray(rows)) rows = [];
    rows.push({
      id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
      module: "RESA",
      side: "PRO",
      source: "resa-pro-memory",
      type:    type    || "memoire",
      label:   label   || "Mémoire RESA PRO",
      message: message || "",
      href:    href    || "./hub.html",
      created_at: now()
    });
    writeBoth(KEYS.signals, LEGACY.signals, rows.slice(-120));
  }

  /* ═══════════════════════════════════════════════════════
     SNAPSHOT
  ═══════════════════════════════════════════════════════ */

  function updateSnapshot(patch){
    var old  = readBoth(KEYS.snapshot, LEGACY.snapshot, {});
    var next = Object.assign({}, old || {}, patch || {}, {
      module:   "RESA",
      side:     "PRO",
      saved_at: now()
    });
    writeBoth(KEYS.snapshot, LEGACY.snapshot, next);
    return next;
  }

  /* ═══════════════════════════════════════════════════════
     BLOC 1 — RÉSERVATIONS REÇUES
     Pense-bête établissement : client, date, chambre/créneau
  ═══════════════════════════════════════════════════════ */

  function normalizeReservation(item){
    var r = item || {};
    var id = String(r.id || r.reference || r.booking_ref || "").trim() ||
      idFrom([r.client_name, r.checkin, r.room].filter(Boolean).join("-")) + "-" + Date.now();

    return Object.assign({}, r, {
      id:          id,
      module:      "RESA",
      side:        "PRO",
      memory_type: "reservation",
      source:      r.source || "cockpit",
      reference:   String(r.reference  || r.booking_ref || id).trim(),
      client_name: String(r.client_name || r.client     || "").trim(),
      client_phone:String(r.client_phone || r.phone     || "").trim(),
      room:        String(r.room  || r.chambre || r.logement || "").trim(),
      checkin:     String(r.checkin  || r.date_in  || r.arrival   || "").trim(),
      checkout:    String(r.checkout || r.date_out || r.departure || "").trim(),
      guests:      Number(r.guests   || r.personnes || 1) || 1,
      amount:      Number(r.amount   || r.total     || r.price || 0) || 0,
      status:      String(r.status   || "confirmed").trim(),
      note:        String(r.note     || "").trim(),
      updated_at:  now(),
      created_at:  r.created_at || now()
    });
  }

  function saveReservation(item){
    var resa = normalizeReservation(item);

    var rows = dedupe(
      list([
        [KEYS.reservations, LEGACY.reservations]
      ]).concat([resa])
    );

    writeBoth(KEYS.reservations, LEGACY.reservations, rows.slice(-200));

    var old = readBoth(KEYS.snapshot, LEGACY.snapshot, {});
    updateSnapshot({
      reservations: rows.slice(-200),
      summary: Object.assign({}, old.summary || {}, {
        counts: Object.assign({}, (old.summary || {}).counts || {}, {
          reservations: rows.length
        })
      })
    });

    rememberSignal(
      "reservation_recue",
      "Réservation gardée",
      [resa.client_name || "Client", resa.checkin, resa.room].filter(Boolean).join(" · "),
      "./cockpit.html"
    );

    try{
      window.dispatchEvent(new CustomEvent("digiy:resa:pro:reservation:saved", { detail: resa }));
    }catch(_){}

    return resa;
  }

  function readReservations(){
    return dedupe(
      list([[KEYS.reservations, LEGACY.reservations]])
    );
  }

  /* ═══════════════════════════════════════════════════════
     BLOC 2 — DISPONIBILITÉS POSÉES
     Planning public : créneaux ouverts, fermetures, tarifs
  ═══════════════════════════════════════════════════════ */

  function normalizeAvailability(item){
    var a = item || {};
    var date = String(a.date || a.day || a.date_day || "").trim();
    var id   = String(a.id || "").trim() || idFrom(date + "-" + (a.room || "")) + "-" + Date.now();

    return Object.assign({}, a, {
      id:          id,
      module:      "RESA",
      side:        "PRO",
      memory_type: "availability",
      source:      a.source || "planning",
      date:        date,
      room:        String(a.room    || a.chambre  || "").trim(),
      status:      String(a.status  || "open").trim(),
      is_closed:   !!(a.is_closed   || a.closed   || a.ferme),
      is_booked:   !!(a.is_booked   || a.booked   || a.reserved),
      price:       Number(a.price   || a.tarif    || a.amount || 0) || 0,
      note:        String(a.note    || a.label    || "").trim(),
      updated_at:  now(),
      created_at:  a.created_at || now()
    });
  }

  function saveAvailability(item){
    var avail = normalizeAvailability(item);

    var rows = dedupe(
      list([
        [KEYS.planning, LEGACY.planning]
      ]).concat([avail])
    ).filter(function(r){ return !!r.date; });

    writeBoth(KEYS.planning, LEGACY.planning, rows.slice(-365));

    updateSnapshot({
      planning: rows.slice(-365),
    });

    rememberSignal(
      "disponibilite_posee",
      "Disponibilité gardée",
      [avail.date, avail.room, avail.is_closed ? "Fermé" : "Ouvert"].filter(Boolean).join(" · "),
      "./planning.html"
    );

    try{
      window.dispatchEvent(new CustomEvent("digiy:resa:pro:availability:saved", { detail: avail }));
    }catch(_){}

    return avail;
  }

  function readAvailabilities(){
    return dedupe(
      list([[KEYS.planning, LEGACY.planning]])
    ).filter(function(r){ return !!r.date; });
  }

  /* ═══════════════════════════════════════════════════════
     API PUBLIQUE
  ═══════════════════════════════════════════════════════ */

  window.DIGIY_RESA_PRO_MEMORY = {
    keys:       KEYS,
    legacyKeys: LEGACY,

    /* lecture brute */
    readJson:   readJson,
    writeJson:  writeJson,

    /* réservations */
    readReservations:  readReservations,
    saveReservation:   saveReservation,

    /* planning */
    readAvailabilities: readAvailabilities,
    saveAvailability:   saveAvailability,

    /* signaux + snapshot */
    rememberSignal: rememberSignal,
    updateSnapshot: updateSnapshot
  };

  /* Alias court pour cohérence avec l'écosystème */
  window.DIGIY_RESA_MEMORY = window.DIGIY_RESA_PRO_MEMORY;

})();
