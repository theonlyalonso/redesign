/* =========================================================
   Simulator Superstars — redesign glue (Home + Seasons)
   Load LAST (after index.min.js, predef-home-settings.js, account.min.js …).
   It never replaces your logic: it only drives the new header, the
   theme switch, the mobile sheet and the seasons tabs/search.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Config: nav targets (edit these to your real pages) ---------- */
  var LINKS = {
    home: "index.html",
    seasons: "seasons.html",        // was predef.html
    contestants: "#",
    custom: "#",
    about: "#",
    changelog: "#",
    help: "#"
  };

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Toast ---------- */
  var toastEl = $("#ss-toast");
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("ss-is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("ss-is-visible"); }, 2200);
  }
  window.SS = window.SS || {};
  window.SS.toast = toast;

  /* ---------- Nav links ---------- */
  $$("[data-ss-link]").forEach(function (a) {
    var k = a.getAttribute("data-ss-link");
    if (LINKS[k]) a.setAttribute("href", LINKS[k]);
  });

  /* ---------- Theme toggle ---------- */
  var themeBtns = $$(".js-theme-toggle");
  var bridge = window.ssTheme;

  function isDark() { return document.documentElement.getAttribute("data-ss-theme") === "dark"; }
  function labelButtons() {
    themeBtns.forEach(function (b) {
      b.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode");
    });
  }
  labelButtons();
  new MutationObserver(labelButtons).observe(document.documentElement, { attributes: true, attributeFilter: ["data-ss-theme"] });

  themeBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var before = isDark();
      // 1) give your own theme.min.js a moment to react to the click (class .theme-toggle-navbar)
      setTimeout(function () {
        if (bridge) bridge.sync();
        if (isDark() !== before) return;
        // 2) it did not react: fall back to a manual switch that is remembered on this browser
        var next = before ? "light" : "dark";
        try { localStorage.setItem("ss-theme-manual", next); } catch (e) {}
        if (bridge) bridge.sync(); else document.documentElement.setAttribute("data-ss-theme", next);
        if (before && isDark()) {   // site is forcing dark and we cannot undo it
          toast("Theme is controlled by the site setting");
        }
      }, 120);
    });
  });

  /* ---------- Dropdowns (More + user menu) ---------- */
  var dropdowns = $$(".ss-dropdown");
  function closeAll(except) {
    dropdowns.forEach(function (d) {
      if (d !== except) {
        d.classList.remove("ss-is-open");
        var t = $(".ss-dropdown__toggle", d);
        if (t) t.setAttribute("aria-expanded", "false");
      }
    });
  }
  dropdowns.forEach(function (d) {
    var toggle = $(".ss-dropdown__toggle", d);
    if (!toggle) return;
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !d.classList.contains("ss-is-open");
      closeAll(d);
      d.classList.toggle("ss-is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".ss-dropdown")) closeAll();
  });

  /* ---------- Mobile sheet ---------- */
  var sheet = $("#ss-sheet");
  var burger = $("#ss-burgerBtn");
  var tabMore = $("#ss-tabMore");

  function openSheet() {
    if (!sheet) return;
    sheet.classList.add("ss-is-open");
    sheet.setAttribute("aria-hidden", "false");
    if (burger) burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("ss-no-scroll");
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("ss-is-open");
    sheet.setAttribute("aria-hidden", "true");
    if (burger) burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("ss-no-scroll");
  }
  function toggleSheet(e) {
    e.stopPropagation();
    if (sheet.classList.contains("ss-is-open")) closeSheet(); else openSheet();
  }
  if (burger) burger.addEventListener("click", toggleSheet);
  if (tabMore) tabMore.addEventListener("click", toggleSheet);
  $$("[data-close-sheet]").forEach(function (el) { el.addEventListener("click", closeSheet); });
  $$(".ss-sheet a.ss-dropdown__item[data-ss-link]").forEach(function (a) { a.addEventListener("click", closeSheet); });
  window.addEventListener("resize", function () { if (window.innerWidth > 1024) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); closeSheet(); } });

  /* ---------- Account / logout / refresh ---------- */
  var headerEl = $(".ss-header");
  function refreshCache() {
    toast("Refreshing cache…");
    var jobs = [];
    try {
      if (window.caches && caches.keys) {
        jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
      }
    } catch (e) {}
    Promise.all(jobs).catch(function () {}).then(function () { setTimeout(function () { location.reload(); }, 350); });
  }

  // Sheet copies of account/logout forward the click to the header element so
  // account.min.js (bound to .account-link / .logout-link) handles them.
  $$(".ss-sheet [data-ss-action], .ss-sheet a[href='#']:not([data-ss-link])").forEach(function (el) {
    el.addEventListener("click", function (e) {
      var act = el.getAttribute("data-ss-action");
      var isAccount = !act && /account/i.test(el.textContent);
      closeSheet();
      if (act === "refresh") { refreshCache(); return; }
      var target = null;
      if (act === "logout") target = headerEl && $(".logout-link", headerEl);
      else if (isAccount) target = headerEl && $(".account-link", headerEl);
      if (target) { e.preventDefault(); target.click(); }
    });
  });
  $$(".ss-header [data-ss-action='refresh']").forEach(function (el) {
    el.addEventListener("click", function () { closeAll(); refreshCache(); });
  });
  $$(".ss-header .ss-dropdown__item:not([data-ss-action])").forEach(function (el) {
    el.addEventListener("click", function (e) {
      closeAll();
      if (el.getAttribute("href") === "#") e.preventDefault();
    });
  });
  var bell = $(".ss-user__bell");
  if (bell) bell.addEventListener("click", function (e) { e.stopPropagation(); toast("No new notifications"); });

  /* ---------- User info (name + photo) ---------- */
  var pic = $("#navProfilePic");
  function syncPic() {
    var avs = $$(".ss-user__avatar");
    var src = pic && pic.getAttribute("src");
    avs.forEach(function (av) {
      var svg = $("svg", av);
      var img = $(".ss-user__img", av);
      if (!img && src) {
        img = document.createElement("img");
        img.className = "ss-user__img";
        img.alt = "";
        av.appendChild(img);
      }
      if (img && av !== (pic && pic.parentNode)) { if (src) img.src = src; }
      var show = !!src && img && img.style.display !== "none";
      if (img) img.style.display = src ? "block" : "none";
      if (svg) svg.style.display = src ? "none" : "";
    });
  }
  if (pic) {
    pic.addEventListener("error", function () { pic.removeAttribute("src"); syncPic(); });
    new MutationObserver(syncPic).observe(pic, { attributes: true, attributeFilter: ["src"] });
  }
  syncPic();

  function applyUser(u) {
    if (!u) return;
    var name = u.displayName || (u.email ? u.email.split("@")[0] : "");
    if (name) $$(".js-user-name").forEach(function (n) { n.textContent = name; });
    if (u.photoURL && pic && !pic.getAttribute("src")) { pic.setAttribute("src", u.photoURL); syncPic(); }
  }
  function watchAuth() {
    try {
      if (window.firebase && firebase.apps && firebase.apps.length && firebase.auth) {
        firebase.auth().onAuthStateChanged(applyUser);
        return true;
      }
    } catch (e) {}
    return false;
  }
  if (!watchAuth()) window.addEventListener("load", function () { setTimeout(watchAuth, 300); });

  /* ---------- SEASONS PAGE ---------- */
  var tabsEl = $("#countryTabs");
  if (tabsEl) (function () {
    var tabs = $$(".tab-btn", tabsEl);
    var panes = $$(".content-tab-box > .content-tab");
    var searchEl = $("#seasonSearch");
    var emptyEl = $("#seasonEmpty");
    var leftBtn = $("#tabsLeft");
    var rightBtn = $("#tabsRight");

    function activeIndex() {
      for (var i = 0; i < tabs.length; i++) if (tabs[i].classList.contains("active")) return i;
      return 0;
    }

    function applyFilter() {
      var q = (searchEl && searchEl.value || "").trim().toLowerCase();
      var idx = activeIndex();
      var visible = 0;
      panes.forEach(function (p) {
        $$(".content-season", p).forEach(function (c) {
          var t = (($(".content-season-title", c) || {}).textContent || c.textContent || "").toLowerCase();
          var sub = (($(".ss-season-sub", c) || {}).textContent || "").toLowerCase();
          var hit = !q || t.indexOf(q) !== -1 || sub.indexOf(q) !== -1;
          c.classList.toggle("ss-is-filtered", !hit);
        });
        $$(".ss-season-section", p).forEach(function (s) {
          var cards = $$(".content-season", s);
          var any = cards.some(function (c) { return !c.classList.contains("ss-is-filtered"); });
          s.classList.toggle("ss-is-filtered", !!q && !any);
        });
      });
      var cur = panes[idx];
      if (cur) visible = $$(".content-season:not(.ss-is-filtered)", cur).length;
      if (emptyEl) emptyEl.hidden = !(q && visible === 0);
    }

    function syncState(opts) {
      var idx = activeIndex();
      tabs.forEach(function (t, i) {
        var on = i === idx;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      panes.forEach(function (p, i) { if (p.classList.contains("active") !== (i === idx)) p.classList.toggle("active", i === idx); });
      if (!(opts && opts.noScroll) && tabs[idx]) {
        var t = tabs[idx];
        var target = t.offsetLeft - (tabsEl.clientWidth - t.offsetWidth) / 2;
        try { tabsEl.scrollTo({ left: Math.max(0, target), behavior: "smooth" }); } catch (e) { tabsEl.scrollLeft = Math.max(0, target); }
      }
      applyFilter();
    }

    function updateArrows() {
      var max = tabsEl.scrollWidth - tabsEl.clientWidth;
      if (leftBtn) leftBtn.hidden = tabsEl.scrollLeft <= 4;
      if (rightBtn) rightBtn.hidden = tabsEl.scrollLeft >= max - 4;
    }

    function select(i, opts) {
      if (i < 0 || i >= tabs.length) return;
      tabs[i].click();                       // lets the site's own tab handler run first
      setTimeout(function () {
        if (!tabs[i].classList.contains("active")) {   // fallback when no handler is bound
          tabs.forEach(function (t) { t.classList.remove("active"); });
          tabs[i].classList.add("active");
        }
        syncState(opts);
        try { history.replaceState(null, "", "#" + tabs[i].getAttribute("data-id")); } catch (e) {}
      }, 0);
    }

    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () {
        setTimeout(function () {
          if (!t.classList.contains("active")) {
            tabs.forEach(function (x) { x.classList.remove("active"); });
            t.classList.add("active");
          }
          syncState();
          try { history.replaceState(null, "", "#" + t.getAttribute("data-id")); } catch (e) {}
        }, 0);
      });
    });

    // keep ARIA/panes in sync if the site's script changes tabs on its own
    var mo = new MutationObserver(function () { syncState({ noScroll: true }); });
    tabs.forEach(function (t) { mo.observe(t, { attributes: true, attributeFilter: ["class"] }); });

    tabsEl.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var i = Math.max(0, Math.min(tabs.length - 1, activeIndex() + (e.key === "ArrowRight" ? 1 : -1)));
      if (i === activeIndex()) return;
      tabs[i].click();
      setTimeout(function () { tabs[i].focus(); }, 5);
      e.preventDefault();
    });

    tabsEl.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    if (leftBtn) leftBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: -Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });
    if (rightBtn) rightBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });
    if (searchEl) searchEl.addEventListener("input", applyFilter);

    // Cards created later by your scripts (Custom Casts) also get filtered
    var holder = $("#custom-cast-holder");
    if (holder) new MutationObserver(applyFilter).observe(holder, { childList: true });

    // Edit / settings buttons (placeholders until those screens exist)
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-ss-act]");
      if (!b) return;
      var name = b.getAttribute("data-name") || "this season";
      toast((b.getAttribute("data-ss-act") === "edit" ? "Editing " : "Settings for ") + name + " (coming soon)");
    });

    // Init (+ #hash deep link)
    var want = (location.hash || "").slice(1);
    var wantIdx = -1;
    tabs.forEach(function (t, i) { if (t.getAttribute("data-id") === want) wantIdx = i; });
    if (wantIdx > 0) select(wantIdx, { noScroll: false }); else syncState({ noScroll: true });
    updateArrows();
    setTimeout(updateArrows, 300);
  })();
})();
