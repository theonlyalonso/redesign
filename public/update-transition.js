/* =========================================================
   Simulator Superstars — update holding screen + "new look" intro

   Stages:
   1. Hold   — white "Now updating" screen with the star. Shown after
               site-update.js refreshes the page, and to anyone who opens
               the site while an update is on hold. Staff get an
               "Unveil now" button.
   2. Unveil — the white fades into the pink intro, then a hole opens
               from the star onto the new UI.
   First-time visitors with no update on hold just get stage 2, once per version.
   Pages of an older version use data-first-visit="off": they join the hold, but
   never play the intro themselves (an unveil reloads them into the new version).

   Include in <head>, after the theme script:
     <script src="/public/update-transition.js"
             data-version="6.0.0"
             data-title="A whole new look"
             data-subtitle="Same simulator, fresh new design."></script>

   site-update.js (deferred, needs Firebase) drives the hold/unveil through
   window.ssUpdate. Add ?update-preview to the URL to replay the intro.

   For a blink-free handoff from site-update.js, also put this as the
   very first thing in <head> (inline, so it can't wait on the network):
     <script>try{if(sessionStorage.getItem("ss-update-from-white")==="1"){document.documentElement.classList.add("ss-from-white");setTimeout(function(){document.documentElement.classList.remove("ss-from-white")},5000)}}catch(e){}</script>
     <style>html.ss-from-white,html.ss-from-white body{background:#fff!important}html.ss-from-white body{visibility:hidden}</style>
   ========================================================= */
(function () {
  "use strict";

  var script = document.currentScript;
  var data = (script && script.dataset) || {};
  var VERSION = data.version || "update";
  var TITLE = data.title || "A whole new look";
  var SUBTITLE = data.subtitle || "Same simulator, fresh new design.";
  var FIRST_VISIT = data.firstVisit !== "off"; // "off" = hold screen only, no intro on this page
  var HOLD_TITLE = data.holdTitle || "Now updating";
  var HOLD_SUBTITLE = data.holdSubtitle || "Something new is almost here. Stay on this page.";
  var STORAGE_KEY = "ss-update-seen";
  var MIN_SHOW_MS = 2400;     // how long the intro plays before revealing
  var MAX_WAIT_MS = 5000;     // never wait longer than this for the page to load
  var REVEAL_MS = 750;
  var FIRST_VISIT_WAIT_MS = 1500;  // how long a first visit waits to hear whether an update is on hold
  var REFRESH_WAIT_MS = 10000;     // after an update refresh, give up waiting for Firebase after this

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // site-update.js sets these right before reloading a page it faded to white;
  // "unveiling" means staff already pressed Unveil, so skip the hold.
  var fromWhite = false;
  var unveiling = false;
  try {
    fromWhite = sessionStorage.getItem("ss-update-from-white") === "1";
    unveiling = sessionStorage.getItem("ss-update-unveiling") === "1";
    sessionStorage.removeItem("ss-update-from-white");
    sessionStorage.removeItem("ss-update-unveiling");
  } catch (e) {}

  var forced = /[?&]update-preview\b/.test(location.search);
  var seen = true; // no storage: don't replay the intro on every visit
  try { seen = localStorage.getItem(STORAGE_KEY) === VERSION; } catch (e) {}

  var css = [
    ".ss-upd{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;overflow:hidden;",
    "font-family:Poppins,system-ui,-apple-system,'Segoe UI',sans-serif;color:#2b0f33;text-align:center;",
    "background:radial-gradient(120% 90% at 50% 40%,#fbe7f7 0%,#f7a6e6 45%,#e05fd3 100%);}",
    "html[data-theme=dark] .ss-upd{color:#f4eefc;background:radial-gradient(120% 90% at 50% 40%,#40127a 0%,#150a24 55%,#090812 100%);}",
    /* Shown as a manual popover so it sits in the top layer, above the sim's own max-z-index panels. */
    ".ss-upd[popover]{margin:0;padding:0;border:0;width:auto;height:auto;max-width:none;max-height:none;inset:0;}",
    ".ss-upd::backdrop{display:none;}",
    ".ss-upd.is-fading-in{animation:ss-upd-in .6s cubic-bezier(.4,0,.2,1) both;}",
    ".ss-upd.is-dismissing{opacity:0;transition:opacity .7s cubic-bezier(.4,0,.2,1);pointer-events:none;}",

    /* Intro (pink). Its animations wait until the intro actually starts and Poppins is ready. */
    ".ss-upd__inner{position:relative;padding:24px;max-width:520px;}",
    ".ss-upd:not(.is-playing) .ss-upd__inner *,.ss-upd:not(.is-playing) .ss-upd__skip,.ss-upd:not(.is-playing) .ss-upd__spark{animation-play-state:paused!important;}",
    ".ss-upd__logo{position:relative;width:96px;height:96px;margin:0 auto 26px;border-radius:50%;display:grid;place-items:center;",
    "color:#fff;background:linear-gradient(135deg,#c100c3 0%,#f400f5 100%);",
    "box-shadow:0 0 0 6px rgba(244,0,245,.22),0 18px 50px -10px rgba(184,0,187,.7);",
    "animation:ss-upd-pop .7s cubic-bezier(.34,1.56,.64,1) both;}",
    ".ss-upd__logo svg{width:44px;height:44px;}",
    ".ss-upd__ring{position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(244,0,245,.55);",
    "animation:ss-upd-ring 1.6s .35s ease-out infinite;}",
    ".ss-upd__ring--b{animation-delay:1.15s;}",

    ".ss-upd__eyebrow{display:inline-block;margin-bottom:10px;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:600;",
    "letter-spacing:.08em;color:#b800bb;background:rgba(255,255,255,.55);animation:ss-upd-rise .6s .25s both;}",
    "html[data-theme=dark] .ss-upd__eyebrow{color:#e255f7;background:rgba(244,0,245,.14);}",
    ".ss-upd__title{margin:0;font-size:clamp(26px,6vw,40px);line-height:1.15;font-weight:700;letter-spacing:-.02em;",
    "animation:ss-upd-rise .65s .4s both;}",
    ".ss-upd__title span{background:linear-gradient(90deg,#b800bb,#f400f5,#b800bb);background-size:200% 100%;",
    "-webkit-background-clip:text;background-clip:text;color:transparent;animation:ss-upd-shine 2.4s .6s linear infinite;}",
    "html[data-theme=dark] .ss-upd__title span{background-image:linear-gradient(90deg,#e255f7,#ff9cff,#e255f7);}",
    ".ss-upd__sub{margin:10px 0 0;font-size:15px;opacity:.75;animation:ss-upd-rise .65s .55s both;}",
    ".ss-upd__bar{width:140px;height:4px;margin:26px auto 0;border-radius:999px;overflow:hidden;background:rgba(43,15,51,.12);",
    "animation:ss-upd-rise .5s .7s both;}",
    "html[data-theme=dark] .ss-upd__bar{background:rgba(255,255,255,.12);}",
    ".ss-upd__bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#c100c3,#f400f5);",
    "animation:ss-upd-fill " + MIN_SHOW_MS + "ms ease-in-out both;}",
    ".ss-upd__spark{position:absolute;color:#f400f5;opacity:0;animation:ss-upd-twinkle 2.2s ease-in-out infinite;}",
    ".ss-upd__spark svg{width:100%;height:100%;display:block;}",

    ".ss-upd__skip{position:absolute;right:20px;bottom:calc(20px + env(safe-area-inset-bottom));padding:8px 16px;border:0;border-radius:999px;",
    "font:inherit;font-size:12px;font-weight:600;color:inherit;cursor:pointer;background:rgba(255,255,255,.45);",
    "animation:ss-upd-rise .4s .9s both;}",
    "html[data-theme=dark] .ss-upd__skip{background:rgba(255,255,255,.1);}",
    ".ss-upd__skip:focus-visible,.ss-upd__unveil:focus-visible{outline:2px solid #f400f5;outline-offset:3px;}",

    /* Holding screen (white). Covers the intro until the unveil, then fades away to reveal it. */
    ".ss-upd__hold{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;",
    "padding:24px;background:#fff;color:#2b0f33;opacity:0;pointer-events:none;transition:opacity .9s .1s cubic-bezier(.4,0,.2,1);}",
    ".ss-upd.is-white .ss-upd__hold{opacity:1;pointer-events:auto;transition:none;}",
    ".ss-upd__hold .ss-upd__logo{margin-bottom:28px;animation:ss-upd-breathe 2.6s ease-in-out infinite;}",
    ".ss-upd__hold .ss-upd__ring{animation-delay:0s;}",
    ".ss-upd__hold .ss-upd__ring--b{animation-delay:.8s;}",
    ".ss-upd__hold-text{opacity:0;transform:translateY(10px);transition:opacity .6s .15s,transform .6s .15s cubic-bezier(.2,.8,.2,1);}",
    ".ss-upd.is-holding .ss-upd__hold-text{opacity:1;transform:none;}",
    ".ss-upd__hold-title{margin:0;font-size:clamp(24px,5.5vw,34px);font-weight:700;letter-spacing:-.02em;}",
    ".ss-upd__dots{display:inline-flex;gap:5px;margin-left:8px;vertical-align:middle;}",
    ".ss-upd__dots i{width:7px;height:7px;border-radius:50%;background:#f400f5;animation:ss-upd-dot 1.2s ease-in-out infinite;}",
    ".ss-upd__dots i:nth-child(2){animation-delay:.15s;}.ss-upd__dots i:nth-child(3){animation-delay:.3s;}",
    ".ss-upd__hold-sub{margin:10px auto 0;max-width:340px;font-size:14px;color:#7d5f86;}",
    ".ss-upd__unveil{margin-top:28px;padding:12px 26px;border:0;border-radius:14px;font:inherit;font-size:15px;font-weight:600;color:#fff;cursor:pointer;",
    "background:linear-gradient(135deg,#c100c3 0%,#f400f5 100%);box-shadow:0 10px 24px -8px rgba(244,0,245,.6);transition:transform .15s,filter .2s;}",
    ".ss-upd__unveil:hover{transform:translateY(-1px);filter:brightness(1.06);}",
    ".ss-upd__unveil:disabled{opacity:.6;cursor:default;transform:none;}",
    ".ss-upd__unveil-note{margin-top:10px;font-size:12px;color:#7d5f86;}",
    ".ss-upd__unveil-note:empty{display:none;}",
    ".ss-upd.is-white .ss-upd__skip{visibility:hidden;}",

    /* Exit: a hole opens from the star outward, revealing the new UI as it zooms into place.
       Browsers without @property skip the hole and just fade (the 85%→100% opacity step). */
    "@property --ss-upd-hole{syntax:'<percentage>';inherits:false;initial-value:0%}",
    ".ss-upd.is-leaving{pointer-events:none;",
    "-webkit-mask:radial-gradient(circle at 50% 50%,transparent var(--ss-upd-hole),#000 calc(var(--ss-upd-hole) + 5%));",
    "mask:radial-gradient(circle at 50% 50%,transparent var(--ss-upd-hole),#000 calc(var(--ss-upd-hole) + 5%));",
    "animation:ss-upd-open " + REVEAL_MS + "ms cubic-bezier(.65,0,.35,1) forwards;}",
    ".ss-upd.is-leaving .ss-upd__inner{transition:transform " + REVEAL_MS + "ms cubic-bezier(.65,0,.35,1),opacity " + (REVEAL_MS / 2) + "ms;",
    "transform:scale(1.25);opacity:0;}",
    "html.ss-upd-revealing body{animation:ss-upd-settle " + (REVEAL_MS + 300) + "ms cubic-bezier(.2,.8,.2,1) both;transform-origin:50% 50vh;}",
    "html.ss-upd-lock,html.ss-upd-lock body{overflow:hidden;}",

    "@keyframes ss-upd-in{from{opacity:0}to{opacity:1}}",
    "@keyframes ss-upd-pop{from{transform:scale(.3) rotate(-25deg);opacity:0}to{transform:none;opacity:1}}",
    "@keyframes ss-upd-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}",
    "@keyframes ss-upd-ring{from{transform:scale(1);opacity:.9}to{transform:scale(2.1);opacity:0}}",
    "@keyframes ss-upd-dot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-6px);opacity:1}}",
    "@keyframes ss-upd-rise{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}",
    "@keyframes ss-upd-shine{to{background-position:-200% 0}}",
    "@keyframes ss-upd-fill{from{width:0}to{width:100%}}",
    "@keyframes ss-upd-twinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:.7;transform:scale(1) rotate(45deg)}}",
    "@keyframes ss-upd-open{0%{--ss-upd-hole:0%;opacity:1}85%{opacity:1}100%{--ss-upd-hole:101%;opacity:0}}",
    "@keyframes ss-upd-settle{from{transform:scale(1.06);filter:blur(6px)}to{transform:none;filter:none}}",

    /* Reduced motion: no movement, just short cross-fades. */
    "@media (prefers-reduced-motion:reduce){",
    ".ss-upd *,.ss-upd{animation:none!important;}",
    ".ss-upd__bar i{width:100%;}",
    ".ss-upd__spark,.ss-upd__ring{display:none;}",
    ".ss-upd__hold{transition-duration:.3s;transition-delay:0s;}",
    ".ss-upd.is-leaving{animation:none!important;transition:opacity .3s;opacity:0;}",
    "html.ss-upd-revealing body{animation:none!important;}}"
  ].join("");

  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2.8 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.6 3.1 1.2-6.3L3 9.4l6.3-.8z"/></svg>';
  var SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c.6 5.2 2.8 7.4 8 8-5.2.6-7.4 2.8-8 8-.6-5.2-2.8-7.4-8-8 5.2-.6 7.4-2.8 8-8z"/></svg>';
  var LOGO = '<div class="ss-upd__logo"><span class="ss-upd__ring"></span><span class="ss-upd__ring ss-upd__ring--b"></span>' + STAR + "</div>";

  var style = null;
  var overlay = null;
  var mode = "idle";        // idle | white | hold | intro | leaving
  var fontReady = false;
  var timers = [];
  var unveilAction = null;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { while (timers.length) clearTimeout(timers.pop()); }

  function ensureStyle() {
    if (style) return;
    style = document.createElement("style");
    style.textContent = css;
    (document.head || root).appendChild(style);
  }

  function waitForFont() {
    var readyTimer = setTimeout(markFontReady, 800);
    function markFontReady() {
      clearTimeout(readyTimer);
      fontReady = true;
      if (mode === "intro" && overlay) overlay.classList.add("is-playing");
    }
    function loadFont() {
      if (!document.fonts || !document.fonts.load) return markFontReady();
      document.fonts.load("700 40px Poppins").then(markFontReady, markFontReady);
    }
    var fontLink = document.querySelector('link[href*="fonts.googleapis.com"][rel="stylesheet"]');
    if (fontLink && !fontLink.sheet) fontLink.addEventListener("load", loadFont);
    else loadFont();
  }

  // Lift the overlay into the browser's top layer. Without popover support, fall back to the
  // highest z-index and the end of <body>, so it paints after the page's own max-z-index panels.
  function promote(el) {
    if (typeof el.showPopover === "function") {
      el.setAttribute("popover", "manual");
      try { el.showPopover(); return; } catch (e) { el.removeAttribute("popover"); }
    }
    function moveToEnd() { if (el.isConnected && document.body) document.body.appendChild(el); }
    if (document.body) moveToEnd();
    else document.addEventListener("DOMContentLoaded", moveToEnd, { once: true });
  }

  function build(fadeIn) {
    ensureStyle();
    overlay = document.createElement("div");
    overlay.className = "ss-upd is-white" + (fadeIn ? " is-fading-in" : "");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-live", "polite");

    var sparks = "";
    var spots = [[12, 18, 22], [82, 14, 16], [8, 72, 14], [88, 66, 24], [26, 88, 12], [70, 86, 18], [50, 8, 12]];
    for (var i = 0; i < spots.length; i++) {
      sparks += '<span class="ss-upd__spark" style="left:' + spots[i][0] + "%;top:" + spots[i][1] + "%;width:" + spots[i][2] +
        "px;height:" + spots[i][2] + "px;animation-delay:" + (i * 0.3).toFixed(1) + 's">' + SPARK + "</span>";
    }

    overlay.innerHTML = sparks +
      '<div class="ss-upd__inner">' + LOGO +
      '<span class="ss-upd__eyebrow"></span><h1 class="ss-upd__title"></h1><p class="ss-upd__sub"></p>' +
      '<div class="ss-upd__bar"><i></i></div></div>' +
      '<button type="button" class="ss-upd__skip">Skip</button>' +
      '<div class="ss-upd__hold">' + LOGO +
      '<div class="ss-upd__hold-text"><h2 class="ss-upd__hold-title"></h2><p class="ss-upd__hold-sub"></p>' +
      '<button type="button" class="ss-upd__unveil" hidden>Unveil now</button><p class="ss-upd__unveil-note"></p></div></div>';

    // Text goes in with textContent so data-* values can't inject markup.
    overlay.querySelector(".ss-upd__eyebrow").textContent = VERSION === "update" ? "NEW UPDATE" : "WHAT'S NEW IN V" + VERSION;
    var titleEl = overlay.querySelector(".ss-upd__title");
    var words = TITLE.split(" ");
    var last = words.pop();
    titleEl.appendChild(document.createTextNode(words.length ? words.join(" ") + " " : ""));
    var accent = document.createElement("span");
    accent.textContent = last;
    titleEl.appendChild(accent);
    overlay.querySelector(".ss-upd__sub").textContent = SUBTITLE;
    var holdTitle = overlay.querySelector(".ss-upd__hold-title");
    holdTitle.textContent = HOLD_TITLE;
    var dots = document.createElement("span");
    dots.className = "ss-upd__dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = "<i></i><i></i><i></i>";
    holdTitle.appendChild(dots);
    overlay.querySelector(".ss-upd__hold-sub").textContent = HOLD_SUBTITLE;

    overlay.querySelector(".ss-upd__skip").addEventListener("click", reveal);
    overlay.querySelector(".ss-upd__unveil").addEventListener("click", runUnveilAction);

    // Attach straight to <html> so it covers the page before <body> paints.
    root.appendChild(overlay);
    promote(overlay);
    root.classList.add("ss-upd-lock");
    root.classList.remove("ss-from-white"); // the overlay covers the page now
    renderUnveilButton();
  }

  function renderUnveilButton() {
    if (!overlay) return;
    overlay.querySelector(".ss-upd__unveil").hidden = !unveilAction;
  }

  function runUnveilAction() {
    if (!unveilAction || !overlay) return;
    var btn = overlay.querySelector(".ss-upd__unveil");
    var note = overlay.querySelector(".ss-upd__unveil-note");
    btn.disabled = true;
    btn.textContent = "Unveiling…";
    note.textContent = "";
    Promise.resolve().then(unveilAction).catch(function (err) {
      if (!overlay) return;
      btn.disabled = false;
      btn.textContent = "Unveil now";
      note.textContent = (err && err.message) || "Couldn't unveil. Try again.";
    });
  }

  function showWhite(holding) {
    if (mode === "intro" || mode === "leaving") {
      // An update went on hold mid-intro: start over on a fresh white screen.
      clearTimers();
      if (overlay) overlay.remove();
      overlay = null;
      mode = "idle";
    }
    // Built while <head> is still parsing, it must cover the page at once; built later (an update
    // went on hold while someone was browsing), it fades in over the page instead.
    if (!overlay) build(document.readyState !== "loading" && !root.classList.contains("ss-from-white"));
    overlay.classList.add("is-white");
    overlay.classList.toggle("is-holding", holding);
    overlay.setAttribute("aria-label", holding ? HOLD_TITLE : TITLE);
    mode = holding ? "hold" : "white";
  }

  function playIntro() {
    if (!overlay) build(false);
    clearTimers();
    mode = "intro";
    overlay.setAttribute("aria-label", TITLE);
    overlay.classList.remove("is-white", "is-holding");
    if (fontReady) overlay.classList.add("is-playing");
    var started = Date.now();
    var loaded = document.readyState === "complete";
    function maybeReveal() {
      var waited = Date.now() - started;
      if (waited >= MIN_SHOW_MS && (loaded || waited >= MAX_WAIT_MS)) reveal();
    }
    window.addEventListener("load", function () { loaded = true; maybeReveal(); }, { once: true });
    later(maybeReveal, MIN_SHOW_MS);
    later(reveal, MAX_WAIT_MS);
  }

  function cleanup() {
    root.classList.remove("ss-upd-lock", "ss-upd-revealing", "ss-from-white");
    if (overlay) overlay.remove();
    overlay = null;
    mode = "idle";
  }

  function reveal() {
    if (mode !== "intro" || !overlay) return;
    mode = "leaving";
    clearTimers();
    try { localStorage.setItem(STORAGE_KEY, VERSION); } catch (e) {}
    seen = true;
    root.classList.add("ss-upd-revealing");
    overlay.classList.add("is-leaving");
    // Scrolling stays locked until the zoom finishes so no scrollbars flash mid-reveal.
    later(cleanup, reduceMotion ? 350 : REVEAL_MS + 400);
  }

  // Not holding and nothing new to show: fade the white screen away once the page has loaded.
  function dismiss() {
    if (!overlay) return;
    var leaving = overlay;
    mode = "leaving";
    clearTimers();
    function go() {
      if (overlay !== leaving) return;
      leaving.classList.add("is-dismissing");
      later(cleanup, 750);
    }
    if (document.readyState === "complete") later(go, 150);
    else window.addEventListener("load", function () { later(go, 150); }, { once: true });
  }

  // Firebase answered: no update is on hold.
  function release() {
    if (mode !== "white" && mode !== "hold") return;
    if (FIRST_VISIT && (!seen || forced)) playIntro();
    else dismiss();
  }

  function unveil() {
    if (mode !== "white" && mode !== "hold") return;
    if (FIRST_VISIT) playIntro();
    else dismiss();
  }

  document.addEventListener("keydown", function (e) {
    if (mode === "intro" && (e.key === "Escape" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      reveal();
    }
  });

  window.ssUpdate = {
    version: VERSION,
    hold: function () { showWhite(true); clearTimers(); },
    release: release,
    unveil: unveil,
    isHolding: function () { return mode === "hold"; },
    setUnveilAction: function (fn) { unveilAction = typeof fn === "function" ? fn : null; renderUnveilButton(); }
  };

  waitForFont();

  if (unveiling) {
    // Reloaded by the unveil itself: straight from white into the intro.
    showWhite(false);
    unveil();
  } else if (fromWhite) {
    // Came from an update refresh: hold on white until site-update.js says otherwise.
    showWhite(true);
    later(release, REFRESH_WAIT_MS);
  } else if (FIRST_VISIT && (!seen || forced)) {
    // First visit to this version: plain white with the star while we check whether an update is on hold.
    showWhite(false);
    later(release, FIRST_VISIT_WAIT_MS);
  }
})();
