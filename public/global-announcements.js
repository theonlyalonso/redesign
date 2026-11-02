"use strict";

(function initGlobalAnnouncements() {
    const ANNOUNCEMENT_PATH = "globalAnnouncements/current";
    const DISMISS_KEY = "ss.globalAnnouncement.dismissedAt";
    const LAST_SEEN_KEY = "ss.globalAnnouncement.lastSeenUpdatedAt";
    const REACTION_STATE_KEY = "ss.globalAnnouncement.reactionState";
    const CUSTOM_SOUND_KEY = "ss.globalAnnouncement.customSoundUrl";
    const DEFAULT_SOUND_URL = "public/ping.mp3";
    const DEFAULT_REACTIONS = [
        { key: "like", emoji: "👍", label: "Like" },
        { key: "love", emoji: "❤️", label: "Love" },
        { key: "fire", emoji: "🔥", label: "Fire" },
        { key: "wow", emoji: "😮", label: "Wow" },
        { key: "dislike", emoji: "👎", label: "Dislike" },
        { key: "angry", emoji: "😡", label: "Angry" }
    ];
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDYU3_sg6va6RQAynL_WXv6WR8pOsbKaLY",
        authDomain: "simulatorsupe.firebaseapp.com",
        databaseURL: "https://simulatorsupe-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "simulatorsupe",
        storageBucket: "simulatorsupe.firebasestorage.app",
        messagingSenderId: "200924043045",
        appId: "1:200924043045:web:cd04a0b425cbd199b36ccc",
        measurementId: "G-56SWZ9GFLH"
    };

    let bannerRoot = null;
    let unsubscribe = null;
    let latestAnnouncement = null;
    let reactionUpdateQueue = Promise.resolve();

    function escapeText(value) {
        return String(value || "").replace(/[&<>"']/g, function(ch) {
            switch (ch) {
                case "&": return "&amp;";
                case "<": return "&lt;";
                case ">": return "&gt;";
                case '"': return "&quot;";
                case "'": return "&#39;";
                default: return ch;
            }
        });
    }

    function injectStyles() {
        if (document.getElementById("globalAnnouncementStyles")) return;
        const style = document.createElement("style");
        style.id = "globalAnnouncementStyles";
        style.textContent = ""
            + ".global-announcement{position:sticky;top:0;z-index:9999;display:none;padding:10px 12px 0;pointer-events:none;}"
            + ".global-announcement.is-visible{display:block;}"
            + ".global-announcement-inner{max-width:1200px;margin:0 auto;display:flex;gap:10px;align-items:flex-start;justify-content:space-between;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(20,10,22,0.82);color:#fff;font-family:inherit;box-shadow:0 10px 22px rgba(0,0,0,0.28);pointer-events:auto;}"
            + ".global-announcement.info .global-announcement-inner{border-left:4px solid rgba(134,78,191,0.95);}"
            + ".global-announcement.warning .global-announcement-inner{border-left:4px solid rgba(230,165,56,0.96);}"
            + ".global-announcement.critical .global-announcement-inner{border-left:4px solid rgba(232,84,109,0.97);}"
            + ".global-announcement-copy{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;}"
            + ".global-announcement-title{font-weight:700;font-size:0.95rem;line-height:1.32;letter-spacing:0.01em;}"
            + ".global-announcement-message{font-size:0.86rem;line-height:1.38;opacity:0.95;word-break:break-word;}"
            + ".global-announcement-reactions{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}"
            + ".global-announcement-reaction{display:inline-flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.08);color:#fff;border-radius:999px;padding:3px 8px;font-size:0.78rem;line-height:1;cursor:pointer;transition:background 0.2s ease,border-color 0.2s ease,transform 0.1s ease;}"
            + ".global-announcement-reaction:hover{background:rgba(255,255,255,0.14);border-color:rgba(255,255,255,0.38);}"
            + ".global-announcement-reaction:active{transform:translateY(1px);}"
            + ".global-announcement-reaction.is-active{background:rgba(255,255,255,0.22);border-color:rgba(255,255,255,0.56);}"
            + ".global-announcement-reaction-count{font-weight:600;min-width:0.8rem;text-align:center;}"
            + ".global-announcement-close{width:24px;height:24px;min-width:24px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#fff;font-size:15px;font-weight:600;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background 0.2s ease,border-color 0.2s ease;}"
            + ".global-announcement-close:hover{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.28);}"
            + ".global-announcement-close:focus-visible{outline:2px solid rgba(255,255,255,0.95);outline-offset:2px;}"
            + "@media (max-width: 640px){.global-announcement{padding:6px 6px 0;}.global-announcement-inner{padding:9px 10px;gap:8px;border-radius:8px;}.global-announcement-title{font-size:0.9rem;}.global-announcement-message{font-size:0.82rem;}.global-announcement-close{width:22px;height:22px;min-width:22px;font-size:13px;}}";
        document.head.appendChild(style);
    }

    function ensureBannerRoot() {
        if (bannerRoot && document.body.contains(bannerRoot)) return bannerRoot;

        bannerRoot = document.createElement("div");
        bannerRoot.id = "globalAnnouncementBanner";
        bannerRoot.className = "global-announcement";
        bannerRoot.innerHTML = ""
            + "<div class=\"global-announcement-inner\">"
            + "<div class=\"global-announcement-copy\">"
            + "<span class=\"global-announcement-title\"></span>"
            + "<span class=\"global-announcement-message\"></span>"
            + "<div class=\"global-announcement-reactions\" role=\"group\" aria-label=\"Announcement reactions\"></div>"
            + "</div>"
            + "<button type=\"button\" class=\"global-announcement-close\" aria-label=\"Dismiss announcement\">x</button>"
            + "</div>";

        bannerRoot.querySelector(".global-announcement-close")?.addEventListener("click", function() {
            bannerRoot.classList.remove("is-visible");
            try {
                localStorage.setItem(DISMISS_KEY, String(Date.now()));
            } catch (_err) {}
        });

        bannerRoot.querySelector(".global-announcement-reactions")?.addEventListener("click", function(event) {
            const button = event.target && event.target.closest
                ? event.target.closest(".global-announcement-reaction[data-reaction-key]")
                : null;
            if (!button) return;
            const reactionKey = button.getAttribute("data-reaction-key") || "";
            if (!reactionKey) return;
            void toggleReaction(reactionKey);
        });

        const bodyFirstChild = document.body.firstElementChild;
        if (bodyFirstChild) {
            document.body.insertBefore(bannerRoot, bodyFirstChild);
        } else {
            document.body.appendChild(bannerRoot);
        }

        return bannerRoot;
    }

    function normalizeLevel(level) {
        const normalized = String(level || "info").trim().toLowerCase();
        if (normalized === "critical" || normalized === "warning") return normalized;
        return "info";
    }

    function normalizeSoundUrl(rawValue) {
        const value = String(rawValue || "").trim();
        if (!value) return "";

        if (/^https?:\/\//i.test(value)) return value;
        if (/^(\/|\.\/|\.\.\/)/.test(value)) return value;
        return "";
    }

    function getLocalCustomSoundUrl() {
        try {
            return normalizeSoundUrl(localStorage.getItem(CUSTOM_SOUND_KEY) || "");
        } catch (_err) {
            return "";
        }
    }

    function setLocalCustomSoundUrl(url) {
        const normalized = normalizeSoundUrl(url);
        try {
            if (normalized) {
                localStorage.setItem(CUSTOM_SOUND_KEY, normalized);
            } else {
                localStorage.removeItem(CUSTOM_SOUND_KEY);
            }
        } catch (_err) {}
        return normalized;
    }

    function isDismissedRecently(updatedAtIso) {
        try {
            const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
            const updatedAt = Date.parse(updatedAtIso || "") || 0;
            return dismissedAt > 0 && updatedAt > 0 && dismissedAt >= updatedAt;
        } catch (_err) {
            return false;
        }
    }

    function shouldShowAnnouncement(announcement) {
        if (!announcement || typeof announcement !== "object") return false;
        if (!announcement.active) return false;
        if (!announcement.message || !String(announcement.message).trim()) return false;

        const expiresAt = announcement.expiresAt ? Date.parse(announcement.expiresAt) : 0;
        if (expiresAt && Number.isFinite(expiresAt) && Date.now() > expiresAt) return false;
        if (isDismissedRecently(announcement.updatedAt)) return false;
        return true;
    }

    function getAnnouncementIdentity(announcement) {
        if (!announcement || typeof announcement !== "object") return "";
        const updatedAt = String(announcement.updatedAt || "").trim();
        if (updatedAt) return updatedAt;
        return [announcement.title || "", announcement.message || "", announcement.level || ""].join("|");
    }

    function getReactionState() {
        try {
            const parsed = JSON.parse(localStorage.getItem(REACTION_STATE_KEY) || "{}");
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (_err) {
            return {};
        }
    }

    function setReactionState(nextState) {
        try {
            localStorage.setItem(REACTION_STATE_KEY, JSON.stringify(nextState || {}));
        } catch (_err) {}
    }

    function getSelectedReactionForAnnouncement(announcementIdentity) {
        if (!announcementIdentity) return "";
        const state = getReactionState();
        const selected = state[announcementIdentity];
        return typeof selected === "string" ? selected : "";
    }

    function setSelectedReactionForAnnouncement(announcementIdentity, reactionKey) {
        if (!announcementIdentity) return;
        const state = getReactionState();
        if (reactionKey) {
            state[announcementIdentity] = reactionKey;
        } else {
            delete state[announcementIdentity];
        }
        setReactionState(state);
    }

    function getReactionCount(announcement, reactionKey) {
        const reactions = announcement && announcement.reactions && typeof announcement.reactions === "object"
            ? announcement.reactions
            : {};
        const rawValue = Number(reactions[reactionKey] || 0);
        if (!Number.isFinite(rawValue) || rawValue < 0) return 0;
        return Math.floor(rawValue);
    }

    function renderReactions(announcement) {
        const container = bannerRoot ? bannerRoot.querySelector(".global-announcement-reactions") : null;
        if (!container) return;

        const announcementIdentity = getAnnouncementIdentity(announcement);
        const selectedReaction = getSelectedReactionForAnnouncement(announcementIdentity);

        container.innerHTML = DEFAULT_REACTIONS.map(function(reaction) {
            const count = getReactionCount(announcement, reaction.key);
            const isActive = selectedReaction === reaction.key;
            return ""
                + "<button type=\"button\" class=\"global-announcement-reaction"
                + (isActive ? " is-active" : "")
                + "\" data-reaction-key=\"" + escapeText(reaction.key) + "\" aria-pressed=\"" + (isActive ? "true" : "false") + "\" aria-label=\"React " + escapeText(reaction.label) + "\">"
                + "<span class=\"global-announcement-reaction-emoji\">" + reaction.emoji + "</span>"
                + "<span class=\"global-announcement-reaction-count\">" + count + "</span>"
                + "</button>";
        }).join("");
    }

    function markAnnouncementAsSeen(announcement) {
        const identity = getAnnouncementIdentity(announcement);
        if (!identity) return;
        try {
            localStorage.setItem(LAST_SEEN_KEY, identity);
        } catch (_err) {}
    }

    function hasSeenAnnouncement(announcement) {
        const identity = getAnnouncementIdentity(announcement);
        if (!identity) return true;
        try {
            return localStorage.getItem(LAST_SEEN_KEY) === identity;
        } catch (_err) {
            return true;
        }
    }

    function playFallbackAnnouncementBeep() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = "triangle";
            oscillator.frequency.setValueAtTime(880, ctx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.14);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.19);
            oscillator.onended = function() {
                try {
                    if (typeof ctx.close === "function") ctx.close();
                } catch (_closeErr) {}
            };
        } catch (_err) {
            // Ignore sound errors (autoplay restrictions, unsupported APIs).
        }
    }

    async function playAnnouncementSound(customSoundUrl) {
        const normalizedSoundUrl = normalizeSoundUrl(customSoundUrl);
        if (normalizedSoundUrl) {
            try {
                const audio = new Audio(normalizedSoundUrl);
                audio.preload = "auto";
                audio.volume = 0.9;
                await audio.play();
                return;
            } catch (_err) {
                // If custom sound fails, fall back to built-in beep.
            }
        }

        playFallbackAnnouncementBeep();
    }

    async function adjustReactionCount(announcementIdentity, reactionKey, delta) {
        if (!announcementIdentity || !reactionKey || !delta) return;
        const db = ensureFirebaseDb();
        if (!db) return;

        const nextUpdate = reactionUpdateQueue
            .catch(() => {})
            .then(async function() {
                const reactionRef = db.ref(ANNOUNCEMENT_PATH + "/reactions/" + reactionKey);
                await reactionRef.transaction(function(currentValue) {
                    const current = Number(currentValue || 0);
                    if (!Number.isFinite(current)) {
                        return delta > 0 ? 1 : 0;
                    }
                    const next = current + delta;
                    return next < 0 ? 0 : next;
                });
            })
            .catch(function() {
                // Ignore reaction update errors quietly for now.
            });

        reactionUpdateQueue = nextUpdate;
        await nextUpdate;
    }

    async function toggleReaction(reactionKey) {
        const announcement = latestAnnouncement;
        if (!announcement || !shouldShowAnnouncement(announcement)) return;

        const announcementIdentity = getAnnouncementIdentity(announcement);
        if (!announcementIdentity) return;
        if (getAnnouncementIdentity(announcement) !== announcementIdentity) return;

        const previousReaction = getSelectedReactionForAnnouncement(announcementIdentity);
        if (previousReaction === reactionKey) {
            setSelectedReactionForAnnouncement(announcementIdentity, "");
            renderReactions(announcement);
            await adjustReactionCount(announcementIdentity, reactionKey, -1);
            return;
        }

        setSelectedReactionForAnnouncement(announcementIdentity, reactionKey);
        renderReactions(announcement);

        if (previousReaction) {
            await adjustReactionCount(announcementIdentity, previousReaction, -1);
        }
        await adjustReactionCount(announcementIdentity, reactionKey, 1);
    }

    function renderAnnouncement(announcement) {
        const container = ensureBannerRoot();
        if (!container) return;

        latestAnnouncement = announcement && typeof announcement === "object" ? announcement : null;

        if (!shouldShowAnnouncement(announcement)) {
            container.classList.remove("is-visible", "info", "warning", "critical");
            return;
        }

        const level = normalizeLevel(announcement.level);
        const title = (announcement.title || "Global Announcement").toString().trim();
        const message = (announcement.message || "").toString().trim();

        const titleEl = container.querySelector(".global-announcement-title");
        const messageEl = container.querySelector(".global-announcement-message");
        if (titleEl) titleEl.innerHTML = escapeText(title);
        if (messageEl) messageEl.innerHTML = escapeText(message);

        renderReactions(announcement);

        container.classList.remove("info", "warning", "critical");
        container.classList.add(level, "is-visible");

        if (!hasSeenAnnouncement(announcement)) {
            const soundUrl = normalizeSoundUrl(
                announcement.soundUrl
                || getLocalCustomSoundUrl()
                || DEFAULT_SOUND_URL
            );
            void playAnnouncementSound(soundUrl);
            markAnnouncementAsSeen(announcement);
        }
    }

    function ensureFirebaseDb() {
        if (!window.firebase) return null;

        try {
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            return firebase.database();
        } catch (_err) {
            return null;
        }
    }

    async function getActiveGlobalAnnouncement() {
        const db = ensureFirebaseDb();
        if (!db) return null;

        try {
            const snapshot = await db.ref(ANNOUNCEMENT_PATH).once("value");
            return snapshot.exists() ? (snapshot.val() || null) : null;
        } catch (_err) {
            return null;
        }
    }

    async function publishGlobalAnnouncement(data) {
        const db = ensureFirebaseDb();
        if (!db) throw new Error("Firebase unavailable");

        const payload = {
            active: true,
            title: (data && data.title ? String(data.title) : "").trim() || "Global Announcement",
            message: (data && data.message ? String(data.message) : "").trim(),
            level: normalizeLevel(data && data.level),
            soundUrl: normalizeSoundUrl(data && data.soundUrl),
            expiresAt: data && data.expiresAt ? String(data.expiresAt) : null,
            updatedAt: new Date().toISOString(),
            updatedByUid: data && data.updatedByUid ? String(data.updatedByUid) : "",
            updatedByEmail: data && data.updatedByEmail ? String(data.updatedByEmail) : ""
        };

        if (!payload.message) {
            throw new Error("Announcement message is required");
        }

        await db.ref(ANNOUNCEMENT_PATH).set(payload);
        renderAnnouncement(payload);
        return payload;
    }

    async function clearGlobalAnnouncement(meta) {
        const db = ensureFirebaseDb();
        if (!db) throw new Error("Firebase unavailable");

        const payload = {
            active: false,
            title: "",
            message: "",
            level: "info",
            soundUrl: null,
            expiresAt: null,
            updatedAt: new Date().toISOString(),
            updatedByUid: meta && meta.updatedByUid ? String(meta.updatedByUid) : "",
            updatedByEmail: meta && meta.updatedByEmail ? String(meta.updatedByEmail) : ""
        };

        await db.ref(ANNOUNCEMENT_PATH).set(payload);
        renderAnnouncement(payload);
        return payload;
    }

    function subscribeToAnnouncements() {
        if (unsubscribe) return;
        const db = ensureFirebaseDb();
        if (!db) return;

        const ref = db.ref(ANNOUNCEMENT_PATH);
        const handler = function(snapshot) {
            renderAnnouncement(snapshot.exists() ? (snapshot.val() || null) : null);
        };
        ref.on("value", handler);
        unsubscribe = function() {
            ref.off("value", handler);
            unsubscribe = null;
        };
    }

    function boot() {
        injectStyles();
        ensureBannerRoot();
        subscribeToAnnouncements();
    }

    window.getActiveGlobalAnnouncement = getActiveGlobalAnnouncement;
    window.publishGlobalAnnouncement = publishGlobalAnnouncement;
    window.clearGlobalAnnouncement = clearGlobalAnnouncement;
    window.setGlobalAnnouncementSound = setLocalCustomSoundUrl;
    window.clearGlobalAnnouncementSound = function() {
        setLocalCustomSoundUrl("");
    };
    window.getGlobalAnnouncementSound = getLocalCustomSoundUrl;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
