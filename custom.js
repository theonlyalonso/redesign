/* Custom page: design behaviour only.
   The real index.js already switches the panels (it pairs the Nth .tab-btn with the Nth .content-tab and toggles .active).
   This file keeps aria-selected in sync, scrolls the active tab into view and shows/hides the tab-row arrows. */
(function () {
  var tabsEl = document.getElementById("customTabs");
  if (!tabsEl) return;
  var leftBtn = document.getElementById("tabsLeft");
  var rightBtn = document.getElementById("tabsRight");
  var tabs = Array.prototype.slice.call(tabsEl.querySelectorAll(".tab-btn"));

  function updateArrows() {
    var max = tabsEl.scrollWidth - tabsEl.clientWidth;
    leftBtn.hidden = tabsEl.scrollLeft <= 4;
    rightBtn.hidden = max <= 4 || tabsEl.scrollLeft >= max - 4;
  }

  function sync(active) {
    tabs.forEach(function (t) {
      var on = t === active;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    var target = active.offsetLeft - (tabsEl.clientWidth - active.offsetWidth) / 2;
    tabsEl.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    try { sessionStorage.setItem("ss.customTab", String(tabs.indexOf(active))); } catch (e) {}
  }

  tabs.forEach(function (t) {
    t.addEventListener("click", function () { sync(t); });
    t.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(t);
      if (e.key === "ArrowRight") i = Math.min(tabs.length - 1, i + 1);
      else if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); t.click(); return; }
      else return;
      e.preventDefault();
      tabs[i].focus();
      tabs[i].click();
    });
  });

  tabsEl.addEventListener("scroll", updateArrows, { passive: true });
  window.addEventListener("resize", updateArrows);
  leftBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: -Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });
  rightBtn.addEventListener("click", function () { tabsEl.scrollBy({ left: Math.max(240, tabsEl.clientWidth * 0.6), behavior: "smooth" }); });

  /* remember the tab for this visit (clicking the real tab keeps the real handler's job) */
  function init() {
    var saved = -1;
    try { saved = parseInt(sessionStorage.getItem("ss.customTab"), 10); } catch (e) {}
    if (saved > 0 && tabs[saved]) tabs[saved].click();
    updateArrows();
  }
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
