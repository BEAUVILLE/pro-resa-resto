(function(){
  "use strict";

  const MODULE = "RESA";
  const FILE_VERSION = "claw-tools-resa-v2-url-clean-lisibilite";
  const STORAGE_LAST_SLUG   = "digiy_resa_last_slug";
  const STORAGE_MODULE_SLUG = "digiy_resa_slug";
  const STORAGE_GENERIC_SLUG= "digiy_last_slug";
  const STORAGE_DIGIY_SLUG  = "DIGIY_SLUG";
  const STORAGE_PANEL_STATE = "digiy_claw_resa_panel_open";

  const PATHS = {
    cockpit:   "./cockpit.html",
    dashboard: "./dashboard-pro.html",
    planning:  "./planning.html",
    profile:   "./etablissement.html",
    qr:        "./qr.html",
    claw:      "./claw.html"
  };

  const SENSITIVE_URL_KEYS = [
    "slug",
    "phone",
    "tel",
    "owner_phone",
    "owner_id",
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
    "keybox_code",
    "keybox_location",
    "access_note"
  ];

  const THEME = {
    bg: "#f4ead2",
    card: "#fff7e6",
    card2: "#fffaf0",
    line: "rgba(83,58,26,.22)",
    text: "#1f2a1f",
    muted: "#3d3324",
    gold: "#facc15",
    accent: "#4f46e5",
    ok: "#16a34a",
    shadow: "0 12px 28px rgba(77,52,22,.16)"
  };

  function normalizeSlug(v){
    return String(v||"").trim().toLowerCase()
      .replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")
      .replace(/-+/g,"-").replace(/^-|-$/g,"");
  }

  function safeJsonParse(raw){ try{ return JSON.parse(raw); }catch(_){ return null; } }

  function storageGet(key){
    try{ const s=sessionStorage.getItem(key); if(s)return s; }catch(_){}
    try{ const l=localStorage.getItem(key); if(l)return l; }catch(_){}
    return "";
  }

  function storageSet(key,value){
    try{sessionStorage.setItem(key,String(value??""));}catch(_){}
    try{localStorage.setItem(key,String(value??""));}catch(_){}
  }

  function getQuery(){
    try{ return new URL(location.href).searchParams; }catch(_){ return new URLSearchParams(); }
  }

  function queryValue(name){ return getQuery().get(name)||""; }

  function getSessionSlug(){
    const r=safeJsonParse(storageGet("DIGIY_RESA_PRO_SESSION")); if(r?.slug)return normalizeSlug(r.slug);
    const g=safeJsonParse(storageGet("DIGIY_PRO_SESSION")); if(g?.module===MODULE&&g?.slug)return normalizeSlug(g.slug);
    const guardState=window.DIGIY_GUARD?.state||null; if(guardState?.slug)return normalizeSlug(guardState.slug);
    return "";
  }

  function resolveSlug(){
    return normalizeSlug(queryValue("slug")||storageGet(STORAGE_MODULE_SLUG)||storageGet(STORAGE_LAST_SLUG)||storageGet(STORAGE_GENERIC_SLUG)||storageGet(STORAGE_DIGIY_SLUG)||getSessionSlug()||"");
  }

  function persistSlug(slug){
    const clean=normalizeSlug(slug); if(!clean)return "";
    storageSet(STORAGE_LAST_SLUG,clean); storageSet(STORAGE_MODULE_SLUG,clean);
    storageSet(STORAGE_GENERIC_SLUG,clean); storageSet(STORAGE_DIGIY_SLUG,clean);
    return clean;
  }

  function getPageName(){
    const file=(location.pathname.split("/").pop()||"").toLowerCase();
    if(file==="cockpit.html")       return "cockpit";
    if(file==="dashboard-pro.html") return "dashboard";
    if(file==="planning.html")      return "planning";
    if(file==="etablissement.html") return "profile";
    if(file==="qr.html")            return "qr";
    if(file==="claw.html")          return "claw";
    return file||"page";
  }

  function removeSensitiveParams(url){
    try{
      SENSITIVE_URL_KEYS.forEach((key)=>url.searchParams.delete(key));
    }catch(_){}
    return url;
  }

  function buildSafeUrl(base, params){
    const baseStr=(base==null?"":String(base)).trim();
    if(!baseStr)return "./dashboard-pro.html";

    let u;
    try{
      u=/^https?:\/\//i.test(baseStr) ? new URL(baseStr) : new URL(baseStr, location.href);
    }catch(e){
      console.warn("[DIGIY claw-tools] buildSafeUrl KO:",baseStr,e.message);
      return baseStr;
    }

    removeSensitiveParams(u);

    try{
      Object.entries(params||{}).forEach(([k,v])=>{
        if(SENSITIVE_URL_KEYS.includes(k)) return;
        if(v!==null&&v!==undefined&&String(v)!=="")u.searchParams.set(k,String(v));
      });
    }catch(e){}

    removeSensitiveParams(u);

    if(u.origin===location.origin){
      const file=u.pathname.split("/").pop()||"dashboard-pro.html";
      return "./"+file+(u.search||"")+(u.hash||"");
    }

    return u.toString();
  }

  function withSlug(path, slug="", extra={}){
    return buildSafeUrl(path,extra);
  }

  function esc(v){
    return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function shortText(v,max=180){
    const s=String(v||"").trim().replace(/\s+/g," ");
    if(!s)return "";
    return s.length>max?s.slice(0,max-1)+"…":s;
  }

  function copyText(text){
    const value=String(text||"").trim();
    if(!value)return Promise.resolve(false);
    if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(value).then(()=>true).catch(()=>fallbackCopy(value));
    return Promise.resolve(fallbackCopy(value));
  }

  function fallbackCopy(value){
    try{
      const ta=document.createElement("textarea");
      ta.value=value;
      ta.setAttribute("readonly","readonly");
      ta.style.position="fixed";
      ta.style.opacity="0";
      ta.style.pointerEvents="none";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0,ta.value.length);
      const ok=document.execCommand("copy");
      ta.remove();
      return !!ok;
    }catch(_){
      return false;
    }
  }

  function isInternalPage(){
    const page=getPageName();
    return ["cockpit","dashboard","planning","profile","qr","claw"].includes(page);
  }

  function selectedBookingCard(){
    const active=document.querySelector(".booking.is-selected, .booking[data-selected='true']");
    if(active)return active;
    return document.querySelector(".booking:focus-within")||null;
  }

  function readBookingContext(){
    const card=selectedBookingCard();
    if(!card)return null;

    const clean={
      booking_id:       shortText(card.getAttribute("data-booking-id")||"",80),
      customer_name:    shortText(card.getAttribute("data-customer-name")||card.querySelector(".booking-name")?.textContent||"",80),
      customer_phone:   "",
      status:           shortText(card.getAttribute("data-status")||card.querySelector(".badge")?.textContent||"",40),
      service_name:     shortText(card.getAttribute("data-service-name")||card.querySelector(".service-pill")?.textContent||"",80),
      when:             shortText(card.getAttribute("data-booking-date")||card.querySelector(".meta")?.textContent||"",160),
      note:             shortText(card.getAttribute("data-note")||card.querySelector(".note")?.textContent||"",200)
    };

    if(!clean.booking_id&&!clean.customer_name&&!clean.customer_phone&&!clean.status&&!clean.service_name&&!clean.when&&!clean.note) return null;
    return clean;
  }

  function resolveBusinessName(){
    return (
      document.getElementById("heroName")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "Accueil"
    );
  }

  function resolveCity(){
    const pill=document.getElementById("heroCity")?.textContent||"";
    const m=pill.match(/Ville\s*:\s*(.+)$/i);
    return m?m[1].trim():"";
  }

  function resolveActivity(){
    const pill=document.getElementById("heroType")?.textContent||"";
    const m=pill.match(/Activité\s*:\s*(.+)$/i);
    return m?m[1].trim():"";
  }

  function buildContext(){
    const slug=persistSlug(resolveSlug());
    const page=getPageName();
    const business=resolveBusinessName();
    const city=resolveCity();
    const activity=resolveActivity();
    const selected=readBookingContext();

    return{
      module:MODULE,
      version:FILE_VERSION,
      slug,
      page,
      business_name:business,
      city,
      activity,
      selected_booking:selected,
      links:{
        cockpit:withSlug(PATHS.cockpit,slug),
        dashboard:withSlug(PATHS.dashboard,slug),
        planning:withSlug(PATHS.planning,slug),
        profile:withSlug(PATHS.profile,slug),
        qr:withSlug(PATHS.qr,slug),
        claw:withSlug(PATHS.claw,slug)
      }
    };
  }

  function buildPrompt(kind="general"){
    const ctx=buildContext();
    const lines=[];

    lines.push(`MODULE: ${ctx.module}`);
    lines.push(`PAGE: ${ctx.page}`);
    lines.push(`SESSION: ${ctx.slug ? "détectée" : "non détectée"}`);
    lines.push(`ÉTABLISSEMENT: ${ctx.business_name||"non détecté"}`);
    if(ctx.city) lines.push(`VILLE: ${ctx.city}`);
    if(ctx.activity) lines.push(`ACTIVITÉ: ${ctx.activity}`);

    if(ctx.selected_booking){
      lines.push("");
      lines.push("RÉSERVATION CIBLÉE:");
      if(ctx.selected_booking.booking_id) lines.push(`- ID: ${ctx.selected_booking.booking_id}`);
      if(ctx.selected_booking.customer_name) lines.push(`- Client: ${ctx.selected_booking.customer_name}`);
      if(ctx.selected_booking.status) lines.push(`- Statut: ${ctx.selected_booking.status}`);
      if(ctx.selected_booking.service_name) lines.push(`- Service: ${ctx.selected_booking.service_name}`);
      if(ctx.selected_booking.when) lines.push(`- Quand: ${ctx.selected_booking.when}`);
      if(ctx.selected_booking.note) lines.push(`- Note: ${ctx.selected_booking.note}`);
    }

    lines.push("");
    lines.push("MISSION:");

    if(kind==="booking_diagnostic"){
      lines.push("Fais-moi un diagnostic métier de cette réservation.");
      lines.push("Donne-moi:");
      lines.push("1. le risque ou point d'attention,");
      lines.push("2. l'action terrain immédiate,");
      lines.push("3. le message court à envoyer au client,");
      lines.push("4. la prochaine étape interne.");
    }else if(kind==="day_brief"){
      lines.push("Donne-moi un brief terrain pour ma journée.");
      lines.push("Je veux:");
      lines.push("1. ce qu'il faut surveiller,");
      lines.push("2. les réservations sensibles,");
      lines.push("3. les actions à faire maintenant,");
      lines.push("4. les trous à combler si le planning est vide.");
    }else if(kind==="client_message"){
      lines.push("Rédige un message client court, humain et pro.");
      lines.push("Adapte le ton au contexte de la réservation ci-dessus.");
      lines.push("Je veux 3 versions: confirmation, rappel, report / ajustement.");
    }else if(kind==="profile_improve"){
      lines.push("Aide ma page profil établissement.");
      lines.push("Propose des améliorations concrètes pour attirer plus de réservations.");
      lines.push("Je veux: titre, promesse, confiance, CTA, et clarté des services.");
    }else{
      lines.push("Aide-moi à piloter mon espace depuis cette page.");
      lines.push("Réponds de manière terrain, simple, exploitable.");
      lines.push("Priorité: actions concrètes, pas théorie.");
    }

    return lines.join("\n");
  }

  function buildFloatingStyles(){
    return `
      .digiy-claw-fab{
        position:fixed;right:16px;bottom:calc(92px + env(safe-area-inset-bottom,0px));z-index:100020;
        appearance:none;border:2px solid rgba(121,83,12,.28);
        background:linear-gradient(135deg,#facc15,#fff3c4);
        color:#241a0d;border-radius:999px;min-height:62px;padding:0 20px;
        font-weight:900;font-size:17px;letter-spacing:.01em;cursor:pointer;
        box-shadow:${THEME.shadow};display:inline-flex;align-items:center;gap:10px;
      }
      .digiy-claw-fab:hover{transform:translateY(-1px);}
      .digiy-claw-panel{
        position:fixed;right:16px;bottom:calc(164px + env(safe-area-inset-bottom,0px));z-index:100019;
        width:min(460px, calc(100vw - 24px));max-height:min(74vh, 760px);
        overflow:auto;border:2px solid ${THEME.line};
        background:linear-gradient(160deg,rgba(255,250,238,.98),rgba(246,232,202,.96));
        color:${THEME.text};border-radius:24px;box-shadow:${THEME.shadow};display:none;
      }
      .digiy-claw-panel.open{display:block;}
      .digiy-claw-head{padding:18px;border-bottom:1px solid rgba(83,58,26,.20);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
      .digiy-claw-title{display:grid;gap:6px;}
      .digiy-claw-eyebrow{font-size:.92rem;text-transform:uppercase;letter-spacing:.10em;color:#6b4e09;font-weight:900;}
      .digiy-claw-head h3{margin:0;font-size:1.35rem;line-height:1.12;color:#241a0d;font-weight:900;}
      .digiy-claw-head p{margin:0;color:${THEME.muted};line-height:1.55;font-size:1.02rem;font-weight:900;}
      .digiy-claw-close{appearance:none;border:1px solid ${THEME.line};background:rgba(255,255,255,.70);color:${THEME.text};border-radius:14px;min-width:46px;min-height:46px;cursor:pointer;font-weight:900;font-size:1.2rem;}
      .digiy-claw-body{padding:16px;display:grid;gap:14px;}
      .digiy-claw-box{border:1px solid rgba(83,58,26,.20);background:rgba(255,255,255,.66);border-radius:20px;padding:15px;display:grid;gap:11px;}
      .digiy-claw-box h4{margin:0;font-size:1.18rem;color:#241a0d;font-weight:900;}
      .digiy-claw-meta{display:flex;gap:8px;flex-wrap:wrap;}
      .digiy-claw-pill{display:inline-flex;align-items:center;gap:8px;border:1px solid ${THEME.line};background:rgba(255,255,255,.72);color:${THEME.muted};border-radius:999px;padding:9px 11px;font-size:.92rem;font-weight:900;}
      .digiy-claw-actions{display:grid;gap:9px;}
      .digiy-claw-btn{appearance:none;border:1px solid ${THEME.line};background:rgba(255,255,255,.72);color:${THEME.text};border-radius:16px;min-height:54px;padding:12px 13px;font-weight:900;cursor:pointer;text-align:left;font-size:1rem;}
      .digiy-claw-btn:hover{transform:translateY(-1px);}
      .digiy-claw-btn.primary{background:linear-gradient(135deg,#16a34a,#bbf7d0);color:#052215;border-color:rgba(22,101,52,.28);}
      .digiy-claw-btn.gold{background:linear-gradient(135deg,#facc15,#fff3c4);color:#241a0d;border-color:rgba(121,83,12,.28);}
      .digiy-claw-btn.secondary{background:rgba(255,255,255,.55);}
      .digiy-claw-status{font-size:.98rem;color:${THEME.muted};min-height:1.2em;font-weight:900;line-height:1.5;}
      .digiy-claw-textarea{width:100%;min-height:190px;resize:vertical;border:2px solid ${THEME.line};background:rgba(255,255,255,.82);color:${THEME.text};border-radius:18px;padding:13px;outline:none;font:inherit;line-height:1.55;font-size:1rem;font-weight:900;}
      .digiy-claw-links{display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:9px;}
      .digiy-claw-link{display:inline-flex;align-items:center;justify-content:center;min-height:52px;border-radius:16px;border:1px solid ${THEME.line};background:rgba(255,255,255,.72);color:${THEME.text};text-decoration:none;font-weight:900;padding:10px 12px;font-size:1rem;}
      .digiy-claw-link:hover{transform:translateY(-1px);}
      .digiy-claw-audio-line{color:${THEME.muted};font-size:1rem;line-height:1.55;font-weight:900;}
      @media(max-width:640px){
        .digiy-claw-fab{right:12px;left:12px;bottom:calc(86px + env(safe-area-inset-bottom,0px));justify-content:center;}
        .digiy-claw-panel{right:12px;left:12px;bottom:calc(154px + env(safe-area-inset-bottom,0px));width:auto;max-height:72vh;}
        .digiy-claw-links{grid-template-columns:1fr;}
        .digiy-claw-btn,.digiy-claw-link{min-height:58px;font-size:1.04rem;}
      }
    `;
  }

  function ensureStyles(){
    if(document.getElementById("digiy-claw-resa-styles"))return;
    const style=document.createElement("style");
    style.id="digiy-claw-resa-styles";
    style.textContent=buildFloatingStyles();
    document.head.appendChild(style);
  }

  function createPanelHtml(){
    const ctx=buildContext();
    const selected=ctx.selected_booking;

    return `
      <div class="digiy-claw-head">
        <div class="digiy-claw-title">
          <div class="digiy-claw-eyebrow">DIGIY ANALYSE</div>
          <h3>Atelier d'aide terrain</h3>
          <p>Lecture terrain, messages client, diagnostic réservation et navigation propre.</p>
        </div>
        <button class="digiy-claw-close" type="button" data-claw-close>×</button>
      </div>

      <div class="digiy-claw-body">
        <section class="digiy-claw-box">
          <h4>Contexte détecté</h4>
          <div class="digiy-claw-meta">
            <span class="digiy-claw-pill">Module : ${esc(ctx.module)}</span>
            <span class="digiy-claw-pill">Page : ${esc(ctx.page)}</span>
            <span class="digiy-claw-pill">Session : ${ctx.slug ? "détectée" : "—"}</span>
          </div>
          <div class="digiy-claw-meta">
            <span class="digiy-claw-pill">Établissement : ${esc(ctx.business_name||"—")}</span>
            ${ctx.city?`<span class="digiy-claw-pill">Ville : ${esc(ctx.city)}</span>`:""}
            ${ctx.activity?`<span class="digiy-claw-pill">Activité : ${esc(ctx.activity)}</span>`:""}
          </div>
          ${selected?`
            <div class="digiy-claw-meta">
              ${selected.customer_name?`<span class="digiy-claw-pill">Client : ${esc(selected.customer_name)}</span>`:""}
              ${selected.status?`<span class="digiy-claw-pill">Statut : ${esc(selected.status)}</span>`:""}
              ${selected.service_name?`<span class="digiy-claw-pill">Service : ${esc(selected.service_name)}</span>`:""}
            </div>`
          :`<div class="digiy-claw-status">Aucune réservation ciblée pour l'instant. Tu peux quand même demander un brief général.</div>`}
        </section>

        <section class="digiy-claw-box">
          <h4>Écouter DIGIY</h4>
          <div class="digiy-claw-audio-line">Une explication courte pour comprendre quoi faire depuis cette page.</div>
          <button class="digiy-claw-btn gold" type="button" data-claw-audio>🎧 Écouter l’aide</button>
        </section>

        <section class="digiy-claw-box">
          <h4>Actions</h4>
          <div class="digiy-claw-actions">
            <button class="digiy-claw-btn gold" type="button" data-claw-action="general">Préparer une aide générale</button>
            <button class="digiy-claw-btn" type="button" data-claw-action="day_brief">Brief du service</button>
            <button class="digiy-claw-btn primary" type="button" data-claw-action="client_message">Messages client prêts</button>
            <button class="digiy-claw-btn" type="button" data-claw-action="profile_improve">Améliorer la fiche</button>
            <button class="digiy-claw-btn ${selected?"":"secondary"}" type="button" data-claw-action="booking_diagnostic">Diagnostic réservation</button>
          </div>
          <div class="digiy-claw-status" id="digiyClawStatus">Prêt.</div>
        </section>

        <section class="digiy-claw-box">
          <h4>Texte prêt à copier</h4>
          <textarea class="digiy-claw-textarea" id="digiyClawTextarea" spellcheck="false">${esc(buildPrompt("general"))}</textarea>
          <div class="digiy-claw-actions">
            <button class="digiy-claw-btn" type="button" data-claw-copy>Copier le texte</button>
            <button class="digiy-claw-btn secondary" type="button" data-claw-refresh>Recharger</button>
          </div>
        </section>

        <section class="digiy-claw-box">
          <h4>Navigation</h4>
          <div class="digiy-claw-links">
            <a class="digiy-claw-link" href="${esc(ctx.links.cockpit)}">Réservations</a>
            <a class="digiy-claw-link" href="${esc(ctx.links.dashboard)}">Accueil</a>
            <a class="digiy-claw-link" href="${esc(ctx.links.planning)}">Planning</a>
            <a class="digiy-claw-link" href="${esc(ctx.links.profile)}">Plus</a>
            <a class="digiy-claw-link" href="${esc(ctx.links.qr)}">QR</a>
            <a class="digiy-claw-link" href="${esc(ctx.links.claw)}">Aide</a>
          </div>
        </section>
      </div>
    `;
  }

  function createFab(){
    const btn=document.createElement("button");
    btn.type="button";
    btn.className="digiy-claw-fab";
    btn.id="digiyClawFab";
    btn.innerHTML=`<span>🦅</span><span>Aide DIGIY</span>`;
    return btn;
  }

  function createPanel(){
    const panel=document.createElement("aside");
    panel.className="digiy-claw-panel";
    panel.id="digiyClawPanel";
    panel.setAttribute("aria-label","DIGIY Aide");
    panel.innerHTML=createPanelHtml();
    return panel;
  }

  function panelOpen(){
    return document.getElementById("digiyClawPanel")?.classList.contains("open");
  }

  function setPanelOpen(flag){
    const panel=document.getElementById("digiyClawPanel");
    if(!panel)return;
    panel.classList.toggle("open",!!flag);
    storageSet(STORAGE_PANEL_STATE,flag?"1":"0");
  }

  function refreshPanel(){
    const panel=document.getElementById("digiyClawPanel");
    if(!panel)return;
    const wasOpen=panel.classList.contains("open");
    panel.innerHTML=createPanelHtml();
    bindPanelEvents(panel);
    if(wasOpen)panel.classList.add("open");
  }

  function setStatus(text){
    const el=document.getElementById("digiyClawStatus");
    if(el)el.textContent=text||"";
  }

  function setTextarea(value){
    const ta=document.getElementById("digiyClawTextarea");
    if(ta)ta.value=String(value||"");
  }

  function canSpeak(){
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function getFrenchVoice(){
    try{
      const voices=speechSynthesis.getVoices()||[];
      return voices.find(v=>/fr[-_]?fr/i.test(v.lang||"")) ||
             voices.find(v=>/^fr/i.test(v.lang||"")) ||
             voices[0] ||
             null;
    }catch(_){
      return null;
    }
  }

  function stopAudio(){
    try{ if(canSpeak()) speechSynthesis.cancel(); }catch(_){}
    const btn=document.querySelector("[data-claw-audio]");
    if(btn) btn.textContent="🎧 Écouter l’aide";
  }

  function speakAudio(){
    if(!canSpeak()) return;
    stopAudio();

    const text=
      "Bienvenue dans l’aide flottante RESA by DIGIY. Ce petit atelier accompagne le professionnel sans le faire écrire longtemps. Tu peux préparer une aide générale, un brief de service, des messages client, une amélioration de fiche ou un diagnostic de réservation. Les liens restent propres : aucun téléphone, aucun identifiant sensible dans l’adresse. Le pro clique, DIGIY formule, le terrain valide.";

    const run=()=>{
      const u=new SpeechSynthesisUtterance(text);
      const voice=getFrenchVoice();
      if(voice) u.voice=voice;
      u.lang=voice?.lang||"fr-FR";
      u.rate=.86;
      u.pitch=1.04;
      u.volume=1;

      const btn=document.querySelector("[data-claw-audio]");
      if(btn) btn.textContent="⏹ Stop";

      u.onend=()=>{ if(btn) btn.textContent="🎧 Écouter l’aide"; };
      u.onerror=()=>{ if(btn) btn.textContent="🎧 Écouter l’aide"; };

      speechSynthesis.speak(u);
    };

    const voices=speechSynthesis.getVoices();
    if(voices&&voices.length) run();
    else{
      speechSynthesis.onvoiceschanged=run;
      setTimeout(run,650);
    }
  }

  function bindPanelEvents(panel){
    panel.querySelector("[data-claw-close]")?.addEventListener("click",()=>{
      stopAudio();
      setPanelOpen(false);
    });

    panel.querySelector("[data-claw-audio]")?.addEventListener("click",()=>{
      if(canSpeak() && speechSynthesis.speaking) stopAudio();
      else speakAudio();
    });

    panel.querySelector("[data-claw-copy]")?.addEventListener("click",async()=>{
      const value=document.getElementById("digiyClawTextarea")?.value||"";
      const ok=await copyText(value);
      setStatus(ok?"Prompt copié.":"Copie impossible sur ce navigateur.");
    });

    panel.querySelector("[data-claw-refresh]")?.addEventListener("click",()=>{
      refreshPanel();
      setStatus("Contexte rechargé.");
    });

    panel.querySelectorAll("[data-claw-action]").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const kind=btn.getAttribute("data-claw-action")||"general";
        const prompt=buildPrompt(kind);
        setTextarea(prompt);

        if(kind==="booking_diagnostic"&&!buildContext().selected_booking){
          setStatus("Aucune réservation ciblée. Sélectionne une carte si tu veux un diagnostic précis.");
          return;
        }

        if(kind==="day_brief") setStatus("Brief de journée préparé.");
        else if(kind==="client_message") setStatus("Messages client préparés.");
        else if(kind==="profile_improve") setStatus("Aide profil préparée.");
        else if(kind==="booking_diagnostic") setStatus("Diagnostic réservation préparé.");
        else setStatus("Prompt général préparé.");
      });
    });
  }

  function markBookingSelection(){
    document.addEventListener("click",event=>{
      const card=event.target.closest(".booking");
      if(!card)return;

      document.querySelectorAll(".booking.is-selected").forEach(node=>{
        if(node!==card){
          node.classList.remove("is-selected");
          node.removeAttribute("data-selected");
        }
      });

      card.classList.add("is-selected");
      card.setAttribute("data-selected","true");

      if(panelOpen()){
        refreshPanel();
        setStatus("Réservation ciblée chargée.");
      }
    },true);
  }

  function mount(options={}){
    if(document.getElementById("digiyClawFab"))return window.DIGIY_CLAW_RESA;
    if(!document.body)return window.DIGIY_CLAW_RESA;
    if(options.internalOnly!==false&&!isInternalPage())return window.DIGIY_CLAW_RESA;

    ensureStyles();

    const fab=createFab();
    const panel=createPanel();

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    fab.addEventListener("click",()=>{
      const next=!panel.classList.contains("open");
      if(next)refreshPanel();
      setPanelOpen(next);
    });

    bindPanelEvents(panel);
    markBookingSelection();

    if(storageGet(STORAGE_PANEL_STATE)==="1")setPanelOpen(true);

    return window.DIGIY_CLAW_RESA;
  }

  function open(){
    if(!document.getElementById("digiyClawFab"))mount();
    refreshPanel();
    setPanelOpen(true);
  }

  function close(){
    stopAudio();
    setPanelOpen(false);
  }

  function copyPrompt(kind="general"){
    const prompt=buildPrompt(kind);
    return copyText(prompt).then(ok=>{
      if(panelOpen()){
        setTextarea(prompt);
        setStatus(ok?"Prompt copié.":"Copie impossible sur ce navigateur.");
      }
      return{ok,prompt};
    });
  }

  function go(pathKey){
    const ctx=buildContext();
    const href=ctx.links[pathKey];
    if(!href)return false;
    location.href=href;
    return true;
  }

  window.DIGIY_CLAW_RESA={
    module:MODULE,
    version:FILE_VERSION,
    resolveSlug,
    buildContext,
    buildPrompt,
    copyPrompt,
    mount,
    open,
    close,
    goCockpit:()=>go("cockpit"),
    goDashboard:()=>go("dashboard"),
    goPlanning:()=>go("planning"),
    goProfile:()=>go("profile"),
    goQr:()=>go("qr"),
    goClaw:()=>go("claw")
  };

  window.addEventListener("pagehide",stopAudio);
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden) stopAudio();
  });

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>mount());
  }else{
    mount();
  }
})();
