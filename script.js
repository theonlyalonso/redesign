/* =========================================================
   Simulator Superstars — homepage behaviour
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Config: swap in your real user data here ---------- */
  var USER = { name: "Daniel Morton", avatar: "" }; // avatar: URL of a photo, or "" for the default icon

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var state = { contestants: 0 };

  /* ---------- Toast ---------- */
  var toastEl = $("#toast");
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 2200);
  }

  /* ---------- Theme toggle ---------- */
  var root = document.documentElement;
  var themeBtns = $$(".js-theme-toggle");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeBtns.forEach(function (b) {
      b.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    });
    try { localStorage.setItem("ss-theme", theme); } catch (e) {}
  }
  applyTheme(root.getAttribute("data-theme") || "light");

  themeBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  });

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
        toast("Cache refreshed");
        // TODO: call your cache-refresh endpoint here
      } else if (action === "logout") {
        toast("Logging out…");
        // TODO: redirect to your logout route, e.g. window.location.href = "/logout";
      }
      closeAll();
      closeSheet();
    });
  });

  /* ---------- Simulation settings ---------- */
  var selects = $$("select[data-key]");

  function byKey(key) { return $('select[data-key="' + key + '"]'); }
  function val(key) { return byKey(key).value; }

  function updateHints() {
    $$("[data-hint-for]").forEach(function (el) {
      var sel = byKey(el.getAttribute("data-hint-for"));
      var opt = sel.options[sel.selectedIndex];
      el.textContent = opt.getAttribute("data-hint") || "";
    });
  }

  function updateSummary() {
    var n = state.contestants;
    var text = [
      n + (n === 1 ? " contestant" : " contestants"),
      val("premiereType") + " / " + val("premiereStyle"),
      val("format"),
      val("finaleSize") + " / " + val("finaleStyle"),
      val("episodes") === "No forcing" ? "No episode forcing" : val("episodes")
    ].join(" · ");
    $("#summaryText").textContent = text;
  }

  function refresh() { updateHints(); updateSummary(); }

  selects.forEach(function (s) { s.addEventListener("change", refresh); });

  function randomize(key) {
    var sel = byKey(key);
    sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
  }

  // Per-row dice buttons
  $$(".dice").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.getAttribute("data-randomize").split(",").forEach(randomize);
      refresh();
    });
  });

  // Toolbar buttons
  $("#toolReset").addEventListener("click", function () {
    selects.forEach(function (s) { s.selectedIndex = 0; });
    refresh();
    toast("Settings reset");
  });

  $("#toolShuffle").addEventListener("click", function () {
    selects.forEach(function (s) { randomize(s.getAttribute("data-key")); });
    refresh();
    toast("Settings randomized");
  });

  var summaryBtn = $("#toolSummary");
  summaryBtn.addEventListener("click", function () {
    var hidden = $("#summary").classList.toggle("is-hidden");
    summaryBtn.classList.toggle("is-off", hidden);
  });

  $("#toolPreset").addEventListener("click", function () {
    // Quick preset: a classic season
    byKey("premiereType").selectedIndex = 0;
    byKey("premiereStyle").selectedIndex = 0;
    byKey("returning").selectedIndex = 0;
    byKey("format").selectedIndex = 0;
    byKey("finaleSize").selectedIndex = 0;
    byKey("finaleStyle").selectedIndex = 0;
    byKey("episodes").selectedIndex = 1;
    state.contestants = 12;
    refresh();
    toast("Preset applied: classic 12-queen season");
  });

  /* ---------- Quick actions ---------- */
  $("#btnRandom").addEventListener("click", function () {
    state.contestants = 8 + Math.floor(Math.random() * 9); // 8–16
    refresh();
    toast(state.contestants + " random contestants selected");
    // TODO: pick real contestants from your data here
  });

  $("#btnUnclaim").addEventListener("click", function () {
    state.contestants = 0;
    refresh();
    toast("All contestants unclaimed");
  });

  $("#btnCastBuilder").addEventListener("click", function () { toast("Cast Builder coming soon"); });
  $("#btnSaveCast").addEventListener("click", function () {
    toast(state.contestants ? "Cast saved" : "Nothing to save yet");
  });

  $("#searchInput").addEventListener("input", function () {
    // TODO: filter your contestant list by this.value
  });

  /* ---------- Simulate ---------- */
  var empty = $("#emptyState");
  var out = $("#resultsOutput");

  $("#btnSimulate").addEventListener("click", function () {
    if (state.contestants < 1) {
      toast("Pick at least one contestant first");
      return;
    }

    // Placeholder output — replace with your real simulation engine
    var rows = [
      ["Contestants", state.contestants],
      ["Premiere", val("premiereType") + " / " + val("premiereStyle")],
      ["Returning", val("returning")],
      ["Format", val("format")],
      ["Finale", val("finaleSize") + " / " + val("finaleStyle")],
      ["Episodes", val("episodes")]
    ];

    out.innerHTML = "<h2>Season setup</h2><ul>" + rows.map(function (r) {
      return "<li><span>" + r[0] + "</span><span>" + r[1] + "</span></li>";
    }).join("") + "</ul>";

    empty.hidden = true;
    out.hidden = false;
    toast("Season simulated!");
  });

  /* ---------- Init ---------- */
  refresh();
})();
