/* =========================================================
   Simulator Superstars — seasons page behaviour
   Needs script.js loaded first (theme, menus, toast).
   All season data below is MOCK data: replace COUNTRIES / the
   card() builder with your real season list when it's ready.
   ========================================================= */
(function () {
  "use strict";

  var SS = window.SS || {};
  var toast = SS.toast || function () {};

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }

  var tabsEl = $("#countryTabs");
  var gridEl = $("#seasonGrid");
  if (!tabsEl || !gridEl) return;

  var searchEl = $("#seasonSearch");
  var emptyEl = $("#seasonEmpty");
  var leftBtn = $("#tabsLeft");
  var rightBtn = $("#tabsRight");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Flags: tiny inline SVGs (24x24, clipped to a circle by CSS) ---------- */
  var UK =
    '<rect width="24" height="24" fill="#012169"/>' +
    '<path d="M0 0L24 24M24 0L0 24" stroke="#fff" stroke-width="4.5"/>' +
    '<path d="M0 0L24 24M24 0L0 24" stroke="#c8102e" stroke-width="1.6"/>' +
    '<path d="M12 0V24M0 12H24" stroke="#fff" stroke-width="7"/>' +
    '<path d="M12 0V24M0 12H24" stroke="#c8102e" stroke-width="4"/>';

  var FLAGS = {
    us:
      '<rect width="24" height="24" fill="#fff"/>' +
      '<g fill="#b22234"><rect y="0" width="24" height="3.43"/><rect y="6.86" width="24" height="3.43"/>' +
      '<rect y="13.71" width="24" height="3.43"/><rect y="20.57" width="24" height="3.43"/></g>' +
      '<rect width="11" height="13.7" fill="#3c3b6e"/>' +
      '<g fill="#fff"><circle cx="3" cy="3" r=".8"/><circle cx="7.5" cy="3" r=".8"/><circle cx="5.2" cy="6.8" r=".8"/>' +
      '<circle cx="3" cy="10.5" r=".8"/><circle cx="7.5" cy="10.5" r=".8"/></g>',
    uk: UK,
    ca:
      '<rect width="24" height="24" fill="#fff"/><rect width="6" height="24" fill="#d52b1e"/><rect x="18" width="6" height="24" fill="#d52b1e"/>' +
      '<polygon points="12,5 13.4,8.2 16.2,7.2 15.2,11 17.4,10.6 14.4,13.6 14.8,14.6 12.8,14.4 12.8,18 11.2,18 11.2,14.4 9.2,14.6 9.6,13.6 6.6,10.6 8.8,11 7.8,7.2 10.6,8.2" fill="#d52b1e"/>',
    es: '<rect width="24" height="24" fill="#aa151b"/><rect y="6" width="24" height="12" fill="#f1bf00"/>',
    au:
      '<rect width="24" height="24" fill="#012169"/><g transform="scale(.5)">' + UK + '</g>' +
      '<polygon points="7,15 7.9,17.2 10.3,17.3 8.4,18.8 9.1,21.1 7,19.8 4.9,21.1 5.6,18.8 3.7,17.3 6.1,17.2" fill="#fff"/>' +
      '<g fill="#fff"><circle cx="17" cy="6" r="1"/><circle cx="19.5" cy="12" r="1"/><circle cx="15" cy="13" r="1"/><circle cx="17.5" cy="19" r="1"/></g>',
    fr: '<rect width="24" height="24" fill="#fff"/><rect width="8" height="24" fill="#0055a4"/><rect x="16" width="8" height="24" fill="#ef4135"/>',
    it: '<rect width="24" height="24" fill="#fff"/><rect width="8" height="24" fill="#009246"/><rect x="16" width="8" height="24" fill="#ce2b37"/>',
    ph:
      '<rect width="24" height="12" fill="#0038a8"/><rect y="12" width="24" height="12" fill="#ce1126"/>' +
      '<polygon points="0,0 14,12 0,24" fill="#fff"/><circle cx="4.6" cy="12" r="2" fill="#fcd116"/>',
    th:
      '<rect width="24" height="24" fill="#a51931"/><rect y="4" width="24" height="16" fill="#f4f5f8"/><rect y="8" width="24" height="8" fill="#2d2a4a"/>',
    nl: '<rect width="24" height="8" fill="#ae1c28"/><rect y="8" width="24" height="8" fill="#fff"/><rect y="16" width="24" height="8" fill="#21468b"/>',
    be: '<rect width="8" height="24" fill="#000"/><rect x="8" width="8" height="24" fill="#fae042"/><rect x="16" width="8" height="24" fill="#ed2939"/>',
    mx:
      '<rect width="8" height="24" fill="#006847"/><rect x="8" width="8" height="24" fill="#fff"/><rect x="16" width="8" height="24" fill="#ce1126"/>' +
      '<circle cx="12" cy="12" r="2.4" fill="#a8703a"/>',
    br:
      '<rect width="24" height="24" fill="#009c3b"/><polygon points="12,3 22,12 12,21 2,12" fill="#ffdf00"/>' +
      '<circle cx="12" cy="12" r="4.6" fill="#002776"/><path d="M7.6 11.2q4.6-1.8 8.8 1.2" stroke="#fff" stroke-width="1" fill="none"/>',
    de: '<rect width="24" height="8" fill="#000"/><rect y="8" width="24" height="8" fill="#dd0000"/><rect y="16" width="24" height="8" fill="#ffce00"/>',
    cl:
      '<rect width="24" height="24" fill="#fff"/><rect y="12" width="24" height="12" fill="#d52b1e"/><rect width="12" height="12" fill="#0039a6"/>' +
      '<polygon points="6,2.6 7,5 9.6,5.1 7.5,6.7 8.2,9.2 6,7.8 3.8,9.2 4.5,6.7 2.4,5.1 5,5" fill="#fff"/>'
  };

  function flagHTML(c) {
    if (c.flag) {
      return '<span class="flag" aria-hidden="true"><svg viewBox="0 0 24 24">' + FLAGS[c.flag] + "</svg></span>";
    }
    return '<span class="flag flag--icon" aria-hidden="true"><svg class="icon"><use href="#' + c.icon + '"/></svg></span>';
  }

  /* ---------- Mock data ---------- */
  function T(prefix) { return function (n) { return prefix + " " + n; }; }

  var COUNTRIES = [
    { id: "usa",          label: "USA",          flag: "us", count: 18, title: T("US Season"),            sub: "United States" },
    { id: "all-stars",    label: "All Stars",    icon: "i-star",         count: 10, title: T("All Stars"),            sub: "All Stars" },
    { id: "global",       label: "Global",       icon: "i-globe",        count: 6,  title: T("Global Season"),        sub: "International" },
    { id: "uk",           label: "UK",           flag: "uk", count: 6,  title: T("UK Season"),            sub: "United Kingdom" },
    { id: "canada",       label: "Canada",       flag: "ca", count: 6,  title: T("Canada Season"),        sub: "Canada" },
    { id: "espana",       label: "España",       flag: "es", count: 5,  title: T("España Temporada"),     sub: "España" },
    { id: "down-under",   label: "Down Under",   flag: "au", count: 4,  title: T("Down Under Season"),    sub: "Australia & New Zealand" },
    { id: "france",       label: "France",       flag: "fr", count: 3,  title: T("France Saison"),        sub: "France" },
    { id: "italia",       label: "Italia",       flag: "it", count: 4,  title: T("Italia Stagione"),      sub: "Italia" },
    { id: "philippines",  label: "Philippines",  flag: "ph", count: 3,  title: T("Philippines Season"),   sub: "Philippines" },
    { id: "thailand",     label: "Thailand",     flag: "th", count: 8,  title: T("Thailand Season"),      sub: "Thailand" },
    { id: "holland",      label: "Holland",      flag: "nl", count: 3,  title: T("Holland Seizoen"),      sub: "Netherlands" },
    { id: "belgique",     label: "Belgique",     flag: "be", count: 3,  title: T("Belgique Saison"),      sub: "Belgium" },
    { id: "mexico",       label: "México",       flag: "mx", count: 3,  title: T("México Temporada"),     sub: "México" },
    { id: "brasil",       label: "Brasil",       flag: "br", count: 2,  title: T("Brasil Temporada"),     sub: "Brasil" },
    { id: "germany",      label: "Germany",      flag: "de", count: 2,  title: T("Germany Staffel"),      sub: "Germany" },
    { id: "the-switch",   label: "The Switch",   flag: "cl", count: 3,  title: T("The Switch Temporada"), sub: "Chile" },
    { id: "la-mas-draga", label: "La Más Draga", flag: "mx", count: 6,  title: T("La Más Draga Temporada"), sub: "México" },
    { id: "dragula",      label: "Dragula",      icon: "i-skull",        count: 5,  title: T("Dragula Season"),       sub: "Dragula" },
    { id: "other-shows",  label: "Other Shows",  icon: "i-tv",           count: 4,  title: T("Other Show"),           sub: "Other shows" },
    { id: "custom-casts", label: "Custom Casts", icon: "i-user-plus",    count: 4,  title: T("Custom Cast"),          sub: "Your custom casts" }
  ];

  var byId = {};
  COUNTRIES.forEach(function (c, i) { c.index = i; byId[c.id] = c; });

  /* Season thumbnails: every season uses the same generic pink tile with a star for now.
     To use a real image later, add an entry such as  "usa-1": "images/seasons/usa-1.jpg"  here. */
  var THUMBS = {};

  function thumbHTML(c, n) {
    var url = THUMBS[c.id + "-" + n];
    return url
      ? '<div class="season-thumb season-thumb--img"><img src="' + esc(url) + '" alt="" loading="lazy" /></div>'
      : '<div class="season-thumb"><svg class="icon" aria-hidden="true"><use href="#i-star"/></svg></div>';
  }

  function card(c, n, position) {
    var title = c.title(n);
    var popular = n === 1;
    var featured = position === 0;

    return (
      '<article class="season-card' + (featured ? " is-featured" : "") + '">' +
        thumbHTML(c, n) +
        '<div class="season-body">' +
          '<div class="season-head">' +
            flagHTML(c) +
            '<div class="season-titles"><h3 class="season-title">' + esc(title) + '</h3><p class="season-sub">' + esc(c.sub) + "</p></div>" +
            (popular
              ? '<span class="season-badge"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-flame"/></svg>Popular</span>'
              : '<svg class="icon icon--sm season-chev" aria-hidden="true"><use href="#i-chev-right"/></svg>') +
          "</div>" +
          '<div class="season-actions">' +
            '<button type="button" class="btn-play" data-act="play" data-name="' + esc(title) + '"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-play"/></svg>Play</button>' +
            '<button type="button" class="btn-icon-sq" data-act="edit" data-name="' + esc(title) + '" aria-label="Edit ' + esc(title) + '" title="Edit"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-edit"/></svg></button>' +
            '<button type="button" class="btn-icon-sq" data-act="settings" data-name="' + esc(title) + '" aria-label="Settings for ' + esc(title) + '" title="Settings"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-sliders"/></svg></button>' +
          "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- Rendering ---------- */
  var active = COUNTRIES[0].id;

  function renderTabs() {
    tabsEl.innerHTML = COUNTRIES.map(function (c) {
      return (
        '<button type="button" class="country-tab" role="tab" id="tab-' + c.id + '" data-id="' + c.id + '" aria-selected="false">' +
          flagHTML(c) + "<span>" + esc(c.label) + "</span>" +
        "</button>"
      );
    }).join("");
  }

  function renderGrid() {
    var c = byId[active];
    var q = (searchEl.value || "").trim().toLowerCase();
    var out = [];
    for (var n = 1; n <= c.count; n++) {
      var title = c.title(n).toLowerCase();
      if (q && title.indexOf(q) === -1 && c.sub.toLowerCase().indexOf(q) === -1) continue;
      out.push(card(c, n, out.length));
    }
    gridEl.innerHTML = out.join("");
    gridEl.setAttribute("aria-labelledby", "tab-" + c.id);
    emptyEl.hidden = out.length > 0;
  }

  function updateArrows() {
    var max = tabsEl.scrollWidth - tabsEl.clientWidth;
    leftBtn.hidden = tabsEl.scrollLeft <= 4;
    rightBtn.hidden = tabsEl.scrollLeft >= max - 4;
  }

  function selectCountry(id, opts) {
    if (!byId[id]) id = COUNTRIES[0].id;
    active = id;
    var tabs = tabsEl.querySelectorAll(".country-tab");
    Array.prototype.forEach.call(tabs, function (t) {
      var on = t.getAttribute("data-id") === id;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (on && !(opts && opts.noScroll)) {
        var target = t.offsetLeft - (tabsEl.clientWidth - t.offsetWidth) / 2;
        tabsEl.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
      }
    });
    renderGrid();
    if (!(opts && opts.noHash)) {
      try { history.replaceState(null, "", "#" + id); } catch (e) {}
    }
  }

  /* ---------- Events ---------- */
  tabsEl.addEventListener("click", function (e) {
    var t = e.target.closest(".country-tab");
    if (t) selectCountry(t.getAttribute("data-id"));
  });

  tabsEl.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var i = byId[active].index + (e.key === "ArrowRight" ? 1 : -1);
    i = Math.max(0, Math.min(COUNTRIES.length - 1, i));
    selectCountry(COUNTRIES[i].id);
    var t = $("#tab-" + COUNTRIES[i].id);
    if (t) t.focus();
    e.preventDefault();
  });

  tabsEl.addEventListener("scroll", updateArrows, { passive: true });
  window.addEventListener("resize", updateArrows);
  leftBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: -Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });
  rightBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });

  searchEl.addEventListener("input", renderGrid);

  gridEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var name = b.getAttribute("data-name");
    var act = b.getAttribute("data-act");
    // TODO: hook these up to your real season pages / editors
    if (act === "play") toast("Starting " + name + "…");
    else if (act === "edit") toast("Editing " + name + " (coming soon)");
    else toast("Settings for " + name + " (coming soon)");
  });

  /* ---------- Init ---------- */
  renderTabs();
  var fromHash = (location.hash || "").slice(1);
  selectCountry(byId[fromHash] ? fromHash : active, { noHash: true, noScroll: !byId[fromHash] });
  updateArrows();
})();
