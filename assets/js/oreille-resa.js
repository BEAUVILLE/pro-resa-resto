/* ==========================================================================
   DIGIYLYFE — OREILLE RESA V2
   Fichier : assets/js/oreille-resa.js
   Version : 2026-05-24 · extraction sécurisée + paiement protégé
   Dépendance : assets/js/oreille-metier-core.js

   Doctrine :
   L’Oreille écoute.
   DIGIY formule.
   Le pro valide.
   RESA range.
   Aucune réservation n’est confirmée automatiquement.
   ========================================================================== */
(function () {
  "use strict";

  var VERSION = "oreille-resa-v2-20260524";
  var CLIENTS_KEY = "DIGIY_RESA_CLIENTS_LOCAL_V1";

  var RESA_GUIDE =
    "Bienvenue dans Oreille RESA DIGIYLYFE. " +
    "Ici, le professionnel peut parler ou cliquer pour préparer une demande de réservation. " +
    "RESA aide à préciser le client, le téléphone, la date, l’heure, le nombre de personnes, le lieu ou service, le détail et le statut. " +
    "Mais RESA ne confirme jamais seule une réservation. " +
    "Le planning, la disponibilité, la fermeture ou le prix doivent être vérifiés par le professionnel. " +
    "L’Oreille prépare. DIGIY formule. Le pro relit. Le pro valide. RESA range. " +
    "Le terrain garde la main.";

  var RESA_TEMPLATES = [
    "📅 Nouvelle demande — client · téléphone · date · heure · nombre · détail.",
    "✅ Confirmation à préparer — client · téléphone · date · heure · nombre · message prêt.",
    "⛔ Fermeture / indisponible — date · raison · proposer une autre date.",
    "🕐 Modification — client · téléphone · ancienne date · nouvelle date · détail.",
    "❌ Annulation — client · téléphone · date · raison · statut.",
    "👥 Nombre à préciser — client · téléphone · date · heure · personnes.",
    "📌 Note accueil — client · téléphone · besoin · consigne · statut.",
    "💬 Message WhatsApp — phrase propre à copier avant envoi.",
    "💰 Acompte / paiement — montant · mode · client · téléphone · preuve.",
    "⚠️ Doute / brouillon — garder la demande, ne pas confirmer."
  ];

  var RESA_CONFIG = {
    module: "RESA",
    title: "Oreille RESA",
    subtitle: "Client · téléphone · date · heure · nombre · demande · statut.",
    storagePrefix: "DIGIY_OREILLE_METIER",
    guideText: RESA_GUIDE,
    templates: RESA_TEMPLATES
  };

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
  }

  function lower(value) {
    return normalizeText(value).toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findMountTarget() {
    return (
      document.querySelector("#digiy-oreille-resa") ||
      document.querySelector("[data-digiy-oreille-resa]") ||
      document.querySelector("[data-digiy-resa-oreille]") ||
      document.querySelector("#digiy-oreille-metier") ||
      document.querySelector("[data-digiy-oreille]")
    );
  }

  function extractField(text, labels) {
    var clean = normalizeText(text);
    var nextLabels =
      "client|nom|source|tel|tél|telephone|téléphone|date|jour|heure|horaire|nombre|personnes|pers|lieu|endroit|adresse|service|table|salle|chambre|zone|détail|detail|demande|besoin|statut|raison|message|note|acompte|preuve|mode|montant|paiement";

    for (var i = 0; i < labels.length; i += 1) {
      var label = escapeRegExp(labels[i]);
      var re = new RegExp(
        "(?:^|[\\s;,.|—-])" +
          label +
          "\\s*[:\\-]?\\s*([^;|\\n]+?)(?=\\s+(?:" + nextLabels + ")\\s*[:\\-]|$)",
        "i"
      );
      var match = clean.match(re);
      if (match && match[1]) return normalizeText(match[1]);
    }

    return "";
  }

  function extractPhone(text) {
    var clean = normalizeText(text);
    var explicit = clean.match(/(?:tel|tél|telephone|téléphone|phone|numéro|numero)\s*[:\-]?\s*((?:\+?\d[\d\s().-]{6,}\d))/i);
    if (explicit && explicit[1]) return normalizeText(explicit[1]);

    var any = clean.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
    return any ? normalizeText(any[0]) : "";
  }

  function extractClientName(text) {
    var explicit = extractField(text, ["client", "nom", "personne", "source"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);
    var pour = clean.match(/\b(?:pour|de la part de|chez|client)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{1,40})/i);

    if (pour && pour[1]) {
      var candidate = normalizeText(pour[1])
        .replace(/\b(?:tel|tél|date|heure|personnes|pers|à|a|le|la|demain|aujourd'hui|pour)\b.*$/i, "")
        .trim();
      if (candidate && candidate.length <= 45) return candidate;
    }

    return "";
  }

  function extractDate(text) {
    var explicit = extractField(text, ["date", "jour"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);
    var numeric = clean.match(/\b(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\b/);
    if (numeric && numeric[1]) return numeric[1];

    var natural = clean.match(/\b(aujourd'hui|demain|après-demain|apres-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i);
    return natural && natural[1] ? natural[1] : "";
  }

  function extractTime(text) {
    var explicit = extractField(text, ["heure", "horaire"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);
    var match = clean.match(/\b(\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2})\b/i);
    return match && match[1] ? normalizeText(match[1]) : "";
  }

  function extractCount(text) {
    var explicit = extractField(text, ["nombre", "personnes", "pers"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);
    var match = clean.match(/\b(\d{1,3})\s*(personnes|pers|clients|places|tables|chambres)\b/i);
    if (match && match[1]) return String(Number(match[1]));

    return "";
  }

  function extractLocation(text) {
    return extractField(text, ["lieu", "endroit", "adresse", "service", "table", "salle", "chambre", "zone"]);
  }

  function extractDetail(text) {
    return extractField(text, ["détail", "detail", "demande", "besoin", "raison", "message", "note"]);
  }

  function hasPaymentWords(text) {
    return /\b(acompte|avance|paiement|payé|paye|payer|reçu|recu|règlement|reglement|solde|montant|preuve|wave|cash|espèce|espece|liquide|virement|orange money|om\b|carte)\b/i.test(text);
  }

  function extractPaymentHint(text) {
    var clean = normalizeText(text);
    var mode = "";

    if (/\bwave|wav\b/i.test(clean)) mode = "wave";
    else if (/\bcash\b|espèce|espece|liquide/i.test(clean)) mode = "cash";
    else if (/carte|virement|orange money|\bom\b/i.test(clean)) mode = "autre";

    if (!hasPaymentWords(clean)) return { amount: "", mode: "" };

    var labeled = clean.match(/(?:montant|acompte|avance|paiement|payé|paye|reçu|recu|solde)\s*[:\-]?\s*(\d[\d\s.,]*)\s*(fcfa|f\s*cfa|xof|cfa|€|eur|euro|euros)?/i);
    var currency = clean.match(/\b(\d[\d\s.,]*)\s*(fcfa|f\s*cfa|xof|cfa|€|eur|euro|euros)\b/i);
    var amount = labeled || currency;

    return {
      amount: amount && amount[1] ? normalizeText(amount[1] + (amount[2] ? " " + amount[2] : "")) : "",
      mode: mode
    };
  }

  function guessStatus(text) {
    var t = lower(text);

    if (/fermé|ferme|fermeture|indisponible|pas disponible|complet/.test(t)) return "indisponible";
    if (/confirme|confirmé|confirmee|confirmation|ok pour|validé|valide/.test(t)) return "à confirmer par le pro";
    if (/modifier|modification|changer|décaler|decaler|reporter/.test(t)) return "modification";
    if (/annuler|annulation|annulé|annule/.test(t)) return "annulation";
    if (hasPaymentWords(t)) return "paiement à vérifier";

    return "nouvelle demande";
  }

  function missingFields(draft) {
    var missing = [];
    if (!draft.client_name) missing.push("client");
    if (!draft.client_phone) missing.push("téléphone");
    if (!draft.date) missing.push("date");
    if (!draft.time) missing.push("heure");
    if (!draft.count) missing.push("nombre");
    if (!draft.location) missing.push("lieu/service");
    if (!draft.detail) missing.push("détail");
    return missing;
  }

  function buildResaDraft(text) {
    var clean = normalizeText(text);
    var payment = extractPaymentHint(clean);
    var draft = {
      module: "RESA",
      raw_text: clean,
      client_name: extractClientName(clean),
      client_phone: extractPhone(clean),
      date: extractDate(clean),
      time: extractTime(clean),
      count: extractCount(clean),
      location: extractLocation(clean),
      detail: extractDetail(clean),
      status: guessStatus(clean),
      payment_amount: payment.amount,
      payment_mode: payment.mode,
      created_at: new Date().toISOString(),
      warning: "À vérifier par le pro avant confirmation."
    };
    draft.missing = missingFields(draft);
    return draft;
  }

  function formatResaDraftMessage(draft) {
    if (!draft || !draft.raw_text) {
      return "RESA · Note vide : préciser client, téléphone, date, heure, nombre, lieu/service et détail avant validation.";
    }

    var parts = [
      "Client : " + (draft.client_name || "à préciser"),
      "Téléphone : " + (draft.client_phone || "à préciser"),
      "Date : " + (draft.date || "à préciser"),
      "Heure : " + (draft.time || "à préciser"),
      "Nombre : " + (draft.count || "à préciser"),
      "Lieu/service : " + (draft.location || "à préciser"),
      "Détail : " + (draft.detail || "à préciser"),
      "Statut : " + (draft.status || "nouvelle demande")
    ];

    if (draft.payment_amount || draft.payment_mode) {
      parts.push(
        "Paiement/acompte : " +
          (draft.payment_amount || "montant à préciser") +
          " " +
          (draft.payment_mode || "mode à préciser")
      );
    }

    var missing = draft.missing && draft.missing.length
      ? "Manque : " + draft.missing.join(", ") + ". "
      : "Demande complète à vérifier. ";

    var warning = draft.status === "indisponible"
      ? "Période ou créneau à vérifier. Proposer une autre date si nécessaire."
      : "RESA ne confirme pas seule. Vérifier planning, disponibilité, fermeture et conditions avant réponse client.";

    return "RESA · Demande préparée — " + parts.join(" · ") + ". " + missing + warning + " Texte d’origine : " + draft.raw_text;
  }

  function formulateResa(text) {
    return formatResaDraftMessage(buildResaDraft(text));
  }

  function getClients() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CLIENTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function setClients(clients) {
    try {
      localStorage.setItem(CLIENTS_KEY, JSON.stringify((clients || []).slice(0, 200)));
    } catch (_err) {}
  }

  function upsertClientFromDraft(draft) {
    if (!draft || (!draft.client_name && !draft.client_phone)) return null;

    var clients = getClients();
    var phone = normalizeText(draft.client_phone);
    var name = normalizeText(draft.client_name) || "Client sans nom";
    var found = null;

    if (phone) {
      found = clients.find(function (c) { return normalizeText(c.phone) === phone; });
    }

    if (!found && name) {
      found = clients.find(function (c) { return lower(c.name) === lower(name); });
    }

    var now = new Date().toISOString();

    if (found) {
      found.name = found.name || name;
      found.phone = found.phone || phone;
      found.last_date = draft.date || found.last_date || "";
      found.last_time = draft.time || found.last_time || "";
      found.last_count = draft.count || found.last_count || "";
      found.last_location = draft.location || found.last_location || "";
      found.last_detail = draft.detail || found.last_detail || "";
      found.last_status = draft.status || found.last_status || "";
      found.updated_at = now;
    } else {
      found = {
        id: "resa_client_" + Date.now(),
        name: name,
        phone: phone,
        last_date: draft.date || "",
        last_time: draft.time || "",
        last_count: draft.count || "",
        last_location: draft.location || "",
        last_detail: draft.detail || "",
        last_status: draft.status || "nouvelle demande",
        notes: "",
        created_at: now,
        updated_at: now
      };
      clients.unshift(found);
    }

    setClients(clients);
    return found;
  }

  function injectResaStyles() {
    if (document.getElementById("digiyOreilleResaStyles")) return;

    var style = document.createElement("style");
    style.id = "digiyOreilleResaStyles";
    style.textContent =
      ".digiy-resa-help{margin:10px 0 0;border:1px dashed rgba(83,58,26,.24);border-radius:16px;background:rgba(220,252,231,.35);padding:10px;color:#25351f;font-weight:950;line-height:1.32;font-size:14px}" +
      ".digiy-resa-help b{color:#14532d;font-weight:1000}" +
      ".digiy-resa-client-mini{margin-top:10px;border:1px solid rgba(24,32,20,.14);border-radius:16px;background:#fffdf4;padding:10px;font-weight:900;color:#182014;line-height:1.32;font-size:14px}" +
      ".digiy-resa-client-mini b{display:block;margin-bottom:4px;color:#14532d;font-weight:1000}" +
      ".digiy-resa-chipline{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}" +
      ".digiy-resa-chipline span{display:inline-flex;border-radius:999px;background:#ecfff3;border:1px solid rgba(20,83,45,.16);padding:5px 8px;color:#14532d;font-size:12px;font-weight:1000}";
    document.head.appendChild(style);
  }

  function addResaHelp(target) {
    if (!target || target.querySelector(".digiy-resa-help")) return;

    var status = target.querySelector(".digiy-oreille-status");
    if (!status) return;

    var help = document.createElement("div");
    help.className = "digiy-resa-help";
    help.innerHTML =
      "<b>RESA prépare seulement.</b><br>" +
      "Client · téléphone · date · heure · nombre · lieu/service · détail · statut. " +
      "Aucune réservation, fermeture, prix ou paiement n’est confirmé sans validation du pro." +
      "<div class=\"digiy-resa-chipline\"><span>Brouillon</span><span>Copie WhatsApp</span><span>Validation pro</span></div>";

    status.insertAdjacentElement("afterend", help);
  }

  function addClientPreview(target) {
    if (!target || target.querySelector(".digiy-resa-client-mini")) return;

    var notes = target.querySelector(".digiy-oreille-notes");
    if (!notes) return;

    var box = document.createElement("div");
    box.className = "digiy-resa-client-mini";
    box.innerHTML =
      "<b>📇 Fichier client RESA local</b>" +
      "<span>Quand tu ranges une demande avec nom ou téléphone, RESA garde une trace client sur cet appareil.</span>";

    notes.insertAdjacentElement("beforebegin", box);
  }

  function exposeResaApi(core) {
    window.DigiyOreilleRESA = {
      version: VERSION,
      config: RESA_CONFIG,
      templates: RESA_TEMPLATES.slice(),
      guideText: RESA_GUIDE,
      clientsKey: CLIENTS_KEY,
      detect: buildResaDraft,
      formulate: formulateResa,
      getClients: getClients,
      setClients: setClients,
      saveDraft: function (text) {
        var draft = buildResaDraft(text);
        var message = formatResaDraftMessage(draft);
        upsertClientFromDraft(draft);

        if (!core || typeof core.saveNote !== "function") return null;

        return core.saveNote(RESA_CONFIG, message, {
          resa_draft: draft,
          reservation: draft
        });
      },
      speakGuide: function () {
        if (core && typeof core.speak === "function") core.speak(RESA_GUIDE);
      },
      stopVoice: function () {
        if (core && typeof core.stopVoice === "function") core.stopVoice();
      }
    };
  }

  function mountResaOreille(core) {
    var target = findMountTarget();

    exposeResaApi(core);
    injectResaStyles();

    if (!target) {
      console.info("[DIGIY Oreille RESA] Aucun conteneur trouvé. Ajoute <div id=\"digiy-oreille-resa\"></div> pour afficher l’oreille.");
      return;
    }

    if (target.getAttribute("data-digiy-oreille-mounted") === "1") return;
    target.setAttribute("data-digiy-oreille-mounted", "1");

    var instance = core.mount({
      target: target,
      module: RESA_CONFIG.module,
      title: RESA_CONFIG.title,
      subtitle: RESA_CONFIG.subtitle,
      storagePrefix: RESA_CONFIG.storagePrefix,
      guideText: RESA_CONFIG.guideText,
      templates: RESA_CONFIG.templates,
      formulate: function (text) {
        return formulateResa(text);
      },
      buildSaveExtra: function (text) {
        var draft = buildResaDraft(text);
        upsertClientFromDraft(draft);
        return {
          resa_draft: draft,
          reservation: draft,
          warning: "Brouillon RESA : validation pro obligatoire avant confirmation."
        };
      }
    });

    window.DigiyOreilleRESA.instance = instance || null;
    addResaHelp(target);
    addClientPreview(target);

    console.info("[DIGIY Oreille RESA] montée avec succès", VERSION);
  }

  function bootResaOreille() {
    var tries = 0;
    var maxTries = 30;

    function attempt() {
      tries += 1;
      var core = window.DigiyOreilleMetier;

      if (core && typeof core.mount === "function") {
        mountResaOreille(core);
        return;
      }

      if (tries >= maxTries) {
        console.warn("[DIGIY Oreille RESA] Core introuvable. Vérifie que oreille-metier-core.js est chargé avant oreille-resa.js.");
        return;
      }

      window.setTimeout(attempt, 100);
    }

    attempt();
  }

  ready(bootResaOreille);
})();
