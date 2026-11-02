"use strict";

/* Tells the server when a season starts or finishes, for the anonymous totals on the Trends page.
   Only signed-in players are counted, custom queens are left out, and the Account setting
   for optional tracking turns it off. Nothing here ever gets in the way of the simulator. */
(function initUsageStats() {
    const ENDPOINT = "https://europe-west1-simulatorsupe.cloudfunctions.net/accountSupportApi";
    const OPT_OUT_KEY = "ss.performance.optOut";
    const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];
    const WINNER_SETTLE_MS = 1500;

    let pendingSeasonKey = "";
    let activeSeason = null;
    let winners = new Map();
    let winnerTimer = null;

    function isEnabled() {
        if (LOCAL_HOSTS.includes(window.location.hostname)) return false;
        try {
            return localStorage.getItem(OPT_OUT_KEY) !== "1";
        } catch (_err) {
            return false;
        }
    }

    async function send(body) {
        if (!isEnabled() || typeof firebase === "undefined" || !firebase.apps.length) return;
        const user = firebase.auth().currentUser;
        if (!user) return;
        try {
            const token = await user.getIdToken();
            await fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                body: JSON.stringify({ action: "recordUsage", ...body }),
                keepalive: true
            });
        } catch (_err) {
            // A missed count doesn't matter; the simulation carries on.
        }
    }

    function toQueen(queen) {
        return { name: queen && queen.name, country: queen && queen.country ? String(queen.country) : "" };
    }

    function setPendingSeason(seasonKey) {
        pendingSeasonKey = String(seasonKey || "");
    }

    function recordStart(cast, format) {
        const seasonKey = pendingSeasonKey;
        pendingSeasonKey = "";
        const officialQueens = (Array.isArray(cast) ? cast : []).filter((queen) => queen && !queen.customqueen);
        activeSeason = { seasonKey };
        winners = new Map();
        clearTimeout(winnerTimer);
        if (officialQueens.length === 0) return;
        void send({ kind: "start", seasonKey, format: String(format || ""), queens: officialQueens.map(toQueen) });
    }

    /* Shared crowns arrive one after another, so wait a moment and send them together. */
    function noteWinner(queen) {
        if (!activeSeason || !queen || queen.customqueen) return;
        winners.set(queen.name, toQueen(queen));
        clearTimeout(winnerTimer);
        const { seasonKey } = activeSeason;
        winnerTimer = setTimeout(() => {
            activeSeason = null;
            void send({ kind: "finish", seasonKey, winners: Array.from(winners.values()) });
        }, WINNER_SETTLE_MS);
    }

    window.UsageStats = { setPendingSeason, recordStart, noteWinner };
})();
