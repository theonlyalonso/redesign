/* Contestants page: the search, filters, sorting and ranking are the real functions from index.js
   (renderContestantSearchResults and friends); this file only wires the controls on this page. */
(function () {
  function init() {
    var root = document.getElementById("contestant-search-page");
    if (!root || typeof renderContestantSearchResults !== "function") return;
    ["contestant-search-input", "contestant-search-min", "contestant-search-max"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", renderContestantSearchResults);
    });
    ["contestant-search-stat-filter", "contestant-search-sort"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", renderContestantSearchResults);
    });
    renderContestantSearchResults();
  }
  /* index.js is deferred, so wait for it */
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
