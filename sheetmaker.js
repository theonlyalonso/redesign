/* Sheet Maker page.
   The real Track Record Mode code lives in index.js (openTrackRecordMode). This file only decides what to load into it:
   - opened from a season / custom cast button  -> that cast (handed over through sessionStorage, "?load=1")
   - opened from the Sheet Maker tab            -> an empty sheet; contestants are searched and added on the page. */
(function () {
  var tries = 0;

  function fillMissingImages(contestants) {
    if (typeof getContestantSearchQueens !== "function" || typeof getContestantSearchImage !== "function") return contestants;
    var pool = getContestantSearchQueens();
    return contestants.map(function (c) {
      if (c.image) return c;
      var match = pool.find(function (q) { return q && q.name === c.name; });
      return match ? Object.assign({}, c, { image: getContestantSearchImage(match) }) : c;
    });
  }

  function start() {
    var params = new URLSearchParams(window.location.search);
    var payload = params.get("load") && typeof getSheetMakerPayload === "function" ? getSheetMakerPayload() : null;
    if (payload) {
      openTrackRecordMode(fillMissingImages(payload.contestants), payload.format || "", payload.finale || "", payload.premiere || "", payload.returning || "", payload.seasonLabel || "Selected Season");
    } else {
      openTrackRecordMode([], "", "", "", "", "Sheet Maker");
    }
  }

  function boot() {
    tries += 1;
    var ready = typeof openTrackRecordMode === "function";
    // The twist menu (settings cog) is loaded asynchronously; Track Record Mode binds to its toggles, so give it a moment.
    var menuReady = !!document.getElementById("square-tr") || tries > 16;
    if (ready && menuReady) { start(); return; }
    if (tries > 120) { start(); return; }
    window.setTimeout(boot, 75);
  }

  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
