/* Vault page: the Convert tab.
   This is the logic of the old convert.html, unchanged except that it lives in a closure (the page also loads index.js, whose globals
   it must not overwrite), buttons are wired by id, and results use the new status / card styling.
   The Codes tab uses the real redeemCode() / loadCodesPage() from index.js; the Cloud Vault tab is driven by the real vault script. */
(function () {
  var convertedQueens = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var ICONS = { success: "i-check", error: "i-x-circle", info: "i-info" };
  var statusTimer = null;

  function showStatus(type, message, isHtml) {
    var box = $("statusContainer");
    if (!box) return;
    box.innerHTML =
      '<div class="status-message status-' + type + '" role="status">' +
        '<svg class="icon"><use href="#' + (ICONS[type] || ICONS.info) + '"/></svg>' +
        "<span>" + (isHtml ? message : esc(message)) + "</span>" +
      "</div>";
    clearTimeout(statusTimer);
    if (type === "success") statusTimer = setTimeout(function () { box.innerHTML = ""; }, 5000);
  }

  function ensureStatRange(stat, defaultValue) {
    if (defaultValue === undefined) defaultValue = 7;
    var num = parseInt(stat);
    if (isNaN(num)) return defaultValue;
    return Math.max(0, Math.min(15, num));
  }

  function convertQueen(q) {
    var converted = {
      _name: q._name || "Unnamed Queen",
      _actingStat: ensureStatRange(q._actingStat, 7),
      _comedyStat: ensureStatRange(q._comedyStat, 7),
      _danceStat: ensureStatRange(q._danceStat, 7),
      _designStat: ensureStatRange(q._designStat, 7),
      _improvStat: ensureStatRange(q._improvStat, 7),
      _runwayStat: ensureStatRange(q._runwayStat, 7),
      _lipsyncStat: ensureStatRange(q._lipsyncStat, 7),
      images: [],
      customqueen: true,
      country: q.country || null,
      isDuo: q.isDuo || false,
      name1: q.name1 || "",
      name2: q.name2 || ""
    };
    if (q.image) {
      converted.images.push(q.image !== "image/queens/noimage.jpg" ? q.image : "image/queens/noimage.jpg");
    } else if (q.images && Array.isArray(q.images)) {
      converted.images = q.images;
    } else {
      converted.images.push("image/queens/noimage.jpg");
    }
    return converted;
  }

  function displayPreview(queens) {
    var section = $("previewSection");
    var holder = $("chosenKweens");
    holder.innerHTML = "";
    queens.forEach(function (queen) {
      var card = document.createElement("div");
      card.className = "card";

      var cardImage = document.createElement("div");
      cardImage.className = "data-image";
      var img = document.createElement("img");
      img.src = queen.images && queen.images.length > 0 ? queen.images[0] : "image/queens/noimage.jpg";
      img.alt = "";
      img.onerror = function () { this.onerror = null; this.src = "image/queens/noimage.jpg"; };
      cardImage.appendChild(img);

      var header = document.createElement("div");
      header.className = "data-header";
      header.textContent = queen._name;

      card.appendChild(cardImage);
      card.appendChild(header);
      holder.appendChild(card);
    });
    section.style.display = "flex";
  }

  function displayOutput(queens) {
    $("outputJSON").value = JSON.stringify(queens, null, 2);
    $("outputSection").style.display = "flex";
  }

  function convertQueens() {
    var input = $("inputJSON").value.trim();
    if (!input) { showStatus("error", "Please paste your MYRAINBOW JSON first!"); return; }
    try {
      var parsed = JSON.parse(input);
      if (!Array.isArray(parsed)) { showStatus("error", "Invalid format: JSON must be an array of queens!"); return; }
      if (parsed.length === 0) { showStatus("error", "The array is empty! Please provide at least one queen."); return; }
      convertedQueens = parsed.map(convertQueen);
      displayPreview(convertedQueens);
      displayOutput(convertedQueens);
      showStatus("success", "Successfully converted " + convertedQueens.length + " queen(s)!");
    } catch (error) {
      showStatus("error", "Error parsing JSON: " + error.message);
      console.error(error);
    }
  }

  function clearInput() {
    $("inputJSON").value = "";
    $("outputJSON").value = "";
    $("statusContainer").innerHTML = "";
    $("previewSection").style.display = "none";
    $("outputSection").style.display = "none";
    convertedQueens = [];
  }

  function loadExample() {
    var example = [{
      trackRecord: [], friends: [], allies: [], enemies: [], sisters: [], miniEpisode: [], gftdS: [], tCaptain: [], voteHerstory: [], immuneEp: [],
      runwayScore: 0, lipsyncScore: 0, performanceScore: 0, finaleScore: 0, favoritism: 0, unfavoritism: 0, ppe: 0, stars: 0, episodesOn: 0,
      votes: 0, rankP: 0, retEp: 0, ogPlace: 0, minqdd: 0, blocked: false, queenDisqOrDept: false, customqueen: true, immune: false,
      immPotion: false, chocolate: false, maxiT: false,
      _name: "Example Queen", _actingStat: 8, _comedyStat: 10, _danceStat: 12, _designStat: 9, _improvStat: 7, _runwayStat: 11, _lipsyncStat: 13,
      image: "image/queens/noimage.jpg"
    }];
    $("inputJSON").value = JSON.stringify(example, null, 2);
    showStatus("info", 'Example loaded! Click "Convert" to see the result.');
  }

  function downloadJSON() {
    if (convertedQueens.length === 0) { showStatus("error", "No queens to download!"); return; }
    var blob = new Blob([JSON.stringify(convertedQueens, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "converted-queens-" + Date.now() + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showStatus("success", "JSON file downloaded successfully!");
  }

  function copyToClipboard() {
    var out = $("outputJSON");
    if (!out.value) { showStatus("error", "Nothing to copy!"); return; }
    function done() { showStatus("success", "JSON copied to clipboard!"); }
    function legacy() { out.select(); try { document.execCommand("copy"); } catch (e) {} done(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out.value).then(done, legacy);
    else legacy();
  }

  function importToLocalStorage() {
    if (convertedQueens.length === 0) { showStatus("error", "No queens to import!"); return; }
    try {
      var existing = [];
      var stored = localStorage.getItem("customQueens");
      if (stored) existing = JSON.parse(stored);
      var added = 0, skipped = 0;
      convertedQueens.forEach(function (nq) {
        var dup = existing.find(function (q) { return q._name === nq._name; });
        if (!dup) { existing.push(nq); added++; } else { skipped++; }
      });
      localStorage.setItem("customQueens", JSON.stringify(existing));
      showStatus("success",
        "Import complete! Added " + added + " queen(s). " + (skipped > 0 ? "Skipped " + skipped + " duplicate(s)." : "") +
        '<br>Go to the <a href="custom.html">Custom Queens page</a> to see your queens!', true);
    } catch (error) {
      showStatus("error", "Error importing queens: " + error.message);
      console.error(error);
    }
  }

  function bind(id, fn) { var el = $(id); if (el) el.addEventListener("click", fn); }
  bind("convConvert", convertQueens);
  bind("convClear", clearInput);
  bind("convLoadExample", loadExample);
  bind("convDownload", downloadJSON);
  bind("convCopy", copyToClipboard);
  bind("convImport", importToLocalStorage);
})();
