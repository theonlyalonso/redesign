/* =========================================================
   Simulator Superstars — remote "update now" refresh + unveil
   Watches runtimeConfig/siteUpdate = { version, at, byEmail, unveiledAt? }.
   - New version/at (admin panel "Refresh Everyone Now"): every open page
     fades to white and reloads into the new version.
   - No unveiledAt yet: pages with update-transition.js hold on the white
     "Now updating" screen; signed-in staff get an "Unveil now" button.
   - unveiledAt set (a staff member pressed it): everyone holding plays the intro.

   Trigger by hand (from the repo folder):
     npx firebase-tools database:set /runtimeConfig/siteUpdate --data "{\"version\":\"6.0.0\",\"at\":{\".sv\":\"timestamp\"}}" --force
   ========================================================= */
(function initSiteUpdate() {
    "use strict";

    var PATH = "runtimeConfig/siteUpdate";
    var FROM_WHITE_KEY = "ss-update-from-white";
    var FADE_MS = 900;
    var HOLD_MS = 1300;
    var FIREBASE_CONFIG = {
        apiKey: "AIzaSyDYU3_sg6va6RQAynL_WXv6WR8pOsbKaLY",
        authDomain: "simulatorsupe.firebaseapp.com",
        databaseURL: "https://simulatorsupe-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "simulatorsupe",
        storageBucket: "simulatorsupe.firebasestorage.app",
        messagingSenderId: "200924043045",
        appId: "1:200924043045:web:cd04a0b425cbd199b36ccc",
        measurementId: "G-56SWZ9GFLH"
    };

    var started = false;

    function fadeToWhiteAndReload() {
        if (started) return;
        started = true;

        var style = document.createElement("style");
        style.textContent =
            ".ss-refresh{position:fixed;inset:0;z-index:2147483647;background:#fff;opacity:0;display:grid;place-items:center;" +
            "transition:opacity " + FADE_MS + "ms cubic-bezier(.4,0,.2,1);cursor:progress;}" +
            ".ss-refresh[popover]{margin:0;padding:0;border:0;width:auto;height:auto;max-width:none;max-height:none;inset:0;color:inherit;}" +
            ".ss-refresh::backdrop{display:none;}" +
            ".ss-refresh.is-on{opacity:1;}" +
            ".ss-refresh__text{font-family:Poppins,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;font-weight:500;" +
            "letter-spacing:.04em;color:#b800bb;opacity:0;transition:opacity .6s " + (FADE_MS - 200) + "ms;}" +
            ".ss-refresh.is-on .ss-refresh__text{opacity:.8;}" +
            ".ss-refresh.is-done .ss-refresh__text{opacity:0;transition:opacity .35s;}" +
            "@media (prefers-reduced-motion:reduce){.ss-refresh{transition-duration:.2s}}";
        document.head.appendChild(style);

        var cover = document.createElement("div");
        cover.className = "ss-refresh";
        cover.setAttribute("role", "status");
        var text = document.createElement("span");
        text.className = "ss-refresh__text";
        text.textContent = "Updating Simulator Superstars…";
        cover.appendChild(text);
        // Top layer, so it covers the sim's own max-z-index panels (falls back to the end of <body>).
        if (typeof cover.showPopover === "function") {
            cover.setAttribute("popover", "manual");
            document.body.appendChild(cover);
            try { cover.showPopover(); } catch (e) { cover.removeAttribute("popover"); }
        } else {
            document.body.appendChild(cover);
        }

        // Force a style flush so the fade runs instead of snapping to white.
        void cover.offsetWidth;
        cover.classList.add("is-on");

        // Fade the text away first so the reload happens on plain white, matching the new page's first frame.
        setTimeout(function () { cover.classList.add("is-done"); }, FADE_MS + HOLD_MS - 400);
        setTimeout(function () {
            try { sessionStorage.setItem(FROM_WHITE_KEY, "1"); } catch (e) {}
            location.reload();
        }, FADE_MS + HOLD_MS);
    }

    function boot() {
        if (!window.firebase || typeof firebase.database !== "function") return;
        var db;
        try {
            if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
            db = firebase.database();
        } catch (e) {
            return;
        }

        // Pages without update-transition.js (the old sim) only do the fade-and-reload part.
        var stage = window.ssUpdate || null;

        // Only a new version/at reloads; unveiling the same update must not.
        var baseline;
        var haveBaseline = false;
        db.ref(PATH).on("value", function (snapshot) {
            var value = snapshot.val() || null;
            var key = value ? JSON.stringify([value.version, value.at]) : null;
            var holding = !!(value && value.at && !value.unveiledAt);
            if (!haveBaseline) {
                baseline = key;
                haveBaseline = true;
            } else if (key && key !== baseline) {
                fadeToWhiteAndReload();
                return;
            }
            if (!stage) return;
            if (holding) stage.hold();
            else if (value && value.unveiledAt) unveil(stage, value);
            else stage.release();
        }, function () {
            if (stage) stage.release();
        });

        if (stage && typeof firebase.auth === "function") watchForStaff(db, stage);
    }

    // A page still on an older version that was holding reloads (once per unveil) so the
    // unveil lands on the newly deployed version; everything else plays the unveil in place.
    function unveil(stage, value) {
        var reloadKey = "ss-update-unveil-reload";
        var already = false;
        try { already = sessionStorage.getItem(reloadKey) === String(value.unveiledAt); } catch (e) {}
        if (stage.isHolding() && stage.version !== value.version && !already) {
            try {
                sessionStorage.setItem(reloadKey, String(value.unveiledAt));
                sessionStorage.setItem(FROM_WHITE_KEY, "1");
                sessionStorage.setItem("ss-update-unveiling", "1");
                location.reload();
                return;
            } catch (e) {
                // No storage means no way to stop a reload loop: unveil in place instead.
            }
        }
        stage.unveil();
    }

    // Staff (anyone in /staff) can unveil a held update; the database rules check the same thing.
    function watchForStaff(db, stage) {
        firebase.auth().onAuthStateChanged(function (user) {
            if (!user) {
                stage.setUnveilAction(null);
                return;
            }
            db.ref("staff/" + user.uid).once("value").then(function (snap) {
                if (!snap.exists()) return;
                stage.setUnveilAction(function () {
                    return db.ref(PATH + "/unveiledAt").set(firebase.database.ServerValue.TIMESTAMP).catch(function () {
                        throw new Error("Couldn't unveil. Check you're signed in as staff and try again.");
                    });
                });
            }, function () {});
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
