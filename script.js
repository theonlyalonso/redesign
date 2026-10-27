/* =========================================================
   Simulator Superstars — shared UI behaviour (theme, menus, mobile sheet, toast)
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Config: swap in your real user data here ---------- */
  var USER = { name: "Yitzu", avatar: "" }; // avatar: URL of a photo, or "" for the default icon

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

    /* ---------- Toast ---------- */
  var toastEl = $("#toast");
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 2200);
  }

  /* ---------- Theme toggle ----------
     theme.js (the real file, adapted) owns light/dark: it sets data-theme on <html>, saves the
     choice and fires "themechange". This file only drives it from the header switch and keeps the
     switch labels + the twist menu's "Night Mode" box in step. */
  var root = document.documentElement;
  var themeBtns = $$(".js-theme-toggle");
  var realChangeTheme = typeof window.changeTheme === "function" ? window.changeTheme : null;

  function currentTheme() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }

  function paintTheme() {
    var theme = currentTheme();
    themeBtns.forEach(function (b) {
      b.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    });
    var box = document.getElementById("night-mode");
    if (box) box.checked = theme === "dark";
  }

  function applyTheme(theme) {
    if (realChangeTheme) {
      realChangeTheme(theme);
    } else {
      root.setAttribute("data-theme", theme);
      try { localStorage.setItem("ss-theme", theme); } catch (e) {}
    }
    paintTheme();
  }
  paintTheme();

  themeBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  });
  window.addEventListener("themechange", paintTheme);

  /* ---------- Dropdowns (More + user menu) ---------- */
  var dropdowns = $$(".dropdown");

  function closeAll(except) {
    dropdowns.forEach(function (d) {
      if (d !== except) {
        d.classList.remove("is-open");
        var t = $(".dropdown__toggle", d);
        if (t) t.setAttribute("aria-expanded", "false");
      }
    });
  }

  dropdowns.forEach(function (d) {
    var toggle = $(".dropdown__toggle", d);
    if (!toggle) return;
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !d.classList.contains("is-open");
      closeAll(d);
      d.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
  });

  document.addEventListener("click", function () { closeAll(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); closeSheet(); } });

  /* ---------- Mobile menu sheet (hamburger + bottom "More") ---------- */
  var sheet = $("#sheet");
  var burger = $("#burgerBtn");

  function openSheet() {
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  }
  function closeSheet() {
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
  }
  function toggleSheet(e) {
    e.stopPropagation();
    if (sheet.classList.contains("is-open")) closeSheet(); else openSheet();
  }

  burger.addEventListener("click", toggleSheet);
  $("#tabMore").addEventListener("click", toggleSheet);
  $$("[data-close-sheet]").forEach(function (el) { el.addEventListener("click", closeSheet); });
  $$(".sheet a.dropdown__item").forEach(function (a) { a.addEventListener("click", closeSheet); });
  window.addEventListener("resize", function () { if (window.innerWidth > 1024) closeSheet(); });

  /* ---------- User info ---------- */
  $$(".js-user-name").forEach(function (n) { n.textContent = USER.name; });
  if (USER.avatar) {
    $$(".user__avatar").forEach(function (av) {
      av.innerHTML = "";
      var img = document.createElement("img");
      img.src = USER.avatar;
      img.alt = "";
      av.appendChild(img);
    });
  }

  /* User menu actions */
  $$('[data-action]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      var action = btn.getAttribute("data-action");
      if (action === "refresh") {
        // navbar.js performs the real cache refresh; this toast only shows if it isn't loaded
        if (!window.DRAG_NAVBAR_ACTIVE) toast("Cache refreshed");
      } else if (action === "logout") {
        toast("Logging out…");
        // TODO: redirect to your logout route, e.g. window.location.href = "/logout";
      }
      closeAll();
      closeSheet();
    });
  });

  /* ---------- HOME page logic ----------
     The placeholder simulator that used to live here (mock settings, random/unclaim buttons,
     fake results) was removed: the real scripts (index.min.js, setup.min.js, ...) now drive
     the page through the ids and inline handlers in index.html. */

  /* ---------- Helpers the real scripts call ----------
     index.js expects window.DragUi (cast cards, dialogs, busy buttons) and the twist menu expects
     window.changeTheme. In the real site those come from theme.min.js. The fallbacks below are only
     filled in when that file hasn't provided them. */
  var D = (window.DragUi = window.DragUi || {});
  var busy = {};

  if (!D.reveal) D.reveal = function (el) { if (el && el.hidden) el.hidden = false; };

  if (!D.runBusyAction) D.runBusyAction = function (key, button, message, action) {
    if (busy[key]) return Promise.resolve();
    busy[key] = true;
    var status = key === "simulation" ? $("#sim-loading-status") : $("[data-loading-status]");
    if (button) { button.setAttribute("aria-busy", "true"); button.disabled = true; }
    if (status) status.textContent = message || "";
    function done() {
      busy[key] = false;
      if (button) { button.removeAttribute("aria-busy"); button.disabled = false; }
      if (status) status.textContent = "";
    }
    return Promise.resolve().then(action).then(function (r) { done(); return r; }, function (e) { done(); throw e; });
  };

  if (!D.updateCastCards) D.updateCastCards = function (container, cast, render) {
    container.innerHTML = cast.map(render).join("");
  };

  var dialogs = [];
  if (!D.activateDialog) D.activateDialog = function (box, onClose) {
    if (!box) return;
    D.deactivateDialog(box);
    var entry = { box: box, opener: document.activeElement, onClose: onClose };
    entry.onKey = function (e) {
      if (e.key === "Escape" && dialogs[dialogs.length - 1] === entry) { e.stopPropagation(); if (onClose) onClose(); }
    };
    document.addEventListener("keydown", entry.onKey, true);
    dialogs.push(entry);
  };
  if (!D.deactivateDialog) D.deactivateDialog = function (box) {
    dialogs = dialogs.filter(function (entry) {
      if (entry.box !== box) return true;
      document.removeEventListener("keydown", entry.onKey, true);
      if (entry.opener && entry.opener.focus && document.contains(entry.opener)) { try { entry.opener.focus({ preventScroll: true }); } catch (e) {} }
      return false;
    });
  };

  /* Fallback only: if theme.js is missing, the twist menu's "Night Mode" box still drives the theme. */
  var menuReady = false;
  if (!realChangeTheme) {
    window.changeTheme = function (mode) {
      if (!menuReady) return;
      root.setAttribute("data-theme", mode === "dark" ? "dark" : "light");
      try { localStorage.setItem("ss-theme", currentTheme()); } catch (e) {}
      paintTheme();
    };
  }
  document.addEventListener("drag-twist-menu-ready", function () { menuReady = true; paintTheme(); });

  /* Shared helpers for page scripts (seasons.js, ...) */
  window.SS = { toast: toast };
})();

/* ---------- Season mode flag ----------
   html.sim-mode is on while #MainBlock holds a running season (the real scripts replace the home grid / season browser
   with the season screens). CSS uses it to hide the hero and make the shell slightly transparent. */
(function () {
  var mb = document.getElementById("MainBlock");
  if (!mb) return;
  function update() {
    var browsing = mb.querySelector(":scope > .content-main, :scope > .season-toolbar");
    document.documentElement.classList.toggle("sim-mode", !browsing);
  }
  new MutationObserver(update).observe(mb, { childList: true });
  update();
})();

/* html.scene-bg = the real scripts put a scene picture (stage, werkroom, untucked...) on <body>; empty = the plain theme gradient. */
(function () {
  function update() {
    var bi = document.body.style.backgroundImage;
    document.documentElement.classList.toggle("scene-bg", !!bi && bi !== "none");
  }
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ["style"] });
  update();
})();
