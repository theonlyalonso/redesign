"use strict";

(function initHistoryCloudSync() {
    if (window.__historyCloudSyncInitialized) return;
    window.__historyCloudSyncInitialized = true;

    const HISTORY_FIREBASE_CONFIG = {
        apiKey: "AIzaSyDYU3_sg6va6RQAynL_WXv6WR8pOsbKaLY",
        authDomain: "simulatorsupe.firebaseapp.com",
        databaseURL: "https://simulatorsupe-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "simulatorsupe",
        storageBucket: "simulatorsupe.firebasestorage.app",
        messagingSenderId: "200924043045",
        appId: "1:200924043045:web:cd04a0b425cbd199b36ccc",
        measurementId: "G-56SWZ9GFLH"
    };
    const CLOUD_PATH = "cloudSeasonHistory";
    const CLOUD_PATH_FIRESTORE = "cloudSeasonHistoryV2";
    // Seasons live in their own documents so history is not capped by the 1 MiB Firestore document limit NOTE TO SELF: DONT DELETE.
    const CLOUD_SEASON_SUBCOLLECTION = "seasons";
    const FIRESTORE_BATCH_LIMIT = 400;
    const FIRESTORE_BATCH_BYTES_LIMIT = 8 * 1024 * 1024;
    const FIREBASE_KEY_ESCAPE_PREFIX = "__fbk__";
    const LOCAL_KEY = "seasonHistory";
    const HISTORY_TIER_CACHE_TTL_MS = 5 * 60 * 1000;
    const HISTORY_CLOUD_READ_CACHE_TTL_MS = 20 * 1000;
    const HISTORY_CLOUD_WRITE_COOLDOWN_MS = 5 * 60 * 1000;
    const HISTORY_TIER_SPOOF_STORAGE_KEY = "ssCloudHistoryTierSpoof";
    const HISTORY_CLOUD_READ_SOURCE_STORAGE_KEY = "ssCloudHistoryReadSource";
    const SIM_EVENT_DOWNTIME_DB_PATH = "runtimeConfig/simEventDowntime";
    const HISTORY_RTDB_WRITING_DB_PATH = "runtimeConfig/historyRtdbWriting";
    const SIM_EVENT_DOWNTIME_RETRY_INTERVAL_MS = 1000;
    const SIM_EVENT_COUNTDOWN_TICK_MS = 1000;
    let currentViewedSeasonId = null;
    let authReadyPromise = null;
    let historyCloudBackfillInFlight = false;
    let historyCloudAuthWatcherBound = false;
    let historyCloudTierCache = null;
    let historyViewRenderNonce = 0;
    let historyLoadReadyResolve = null;
    let historyLoadReadyPromise = new Promise((resolve) => {
        historyLoadReadyResolve = resolve;
    });
    const historyCloudLastWriteFingerprintByUid = new Map();
    const historyCloudWriteStateByUid = new Map();
    const historyCloudReadCacheByUid = new Map();
    const historyCloudReadRequestByUid = new Map();
    let historyReorderQueue = Promise.resolve();

    function parseLocalDateTime(value) {
        const raw = String(value || "").trim();
        if (!raw) return null;
        const parsed = Date.parse(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function toDateTimeLocalValue(ms) {
        if (!Number.isFinite(ms)) return "";
        const date = new Date(ms);
        const offsetMs = date.getTimezoneOffset() * 60 * 1000;
        return new Date(ms - offsetMs).toISOString().slice(0, 16);
    }

    function formatRelativeMs(ms) {
        const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
        const minutes = totalMinutes % 60;
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    function formatCountdownMs(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        }
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        }
        return `${minutes}m ${seconds}s`;
    }

    function normalizeSimEventDowntimeConfig(raw) {
        const eventName = String(raw && raw.eventName ? raw.eventName : "").trim().slice(0, 80);
        const eventTimeMs = parseLocalDateTime(raw && raw.eventTimeIso);
        const downtimeEnabled = String(raw && raw.downtimeEnabled ? raw.downtimeEnabled : "off") === "on";
        const downtimeUntilMs = parseLocalDateTime(raw && raw.downtimeUntilIso);
        const downtimeMessage = String(raw && raw.downtimeMessage ? raw.downtimeMessage : "").trim().slice(0, 120);
        return {
            eventName,
            eventTimeIso: toDateTimeLocalValue(eventTimeMs),
            eventTimeMs,
            downtimeEnabled,
            downtimeUntilIso: toDateTimeLocalValue(downtimeUntilMs),
            downtimeUntilMs,
            downtimeMessage,
            updatedAt: raw && raw.updatedAt ? String(raw.updatedAt) : "",
            updatedByEmail: raw && raw.updatedByEmail ? String(raw.updatedByEmail) : ""
        };
    }

    let simEventDowntimeRuntimeConfig = normalizeSimEventDowntimeConfig({});
    let simEventDowntimeRef = null;
    let simEventDowntimeHandler = null;
    let simEventDowntimeBindTimer = null;
    let simEventDowntimeBindingsMounted = false;
    let simEventCountdownTickTimer = null;

    function getHistoryRtdbWritingDb() {
        if (window.accountDb && typeof window.accountDb.ref === "function") {
            return window.accountDb;
        }
        return getFirebaseDb();
    }

    function normalizeHistoryRtdbWritingConfig(raw) {
        return {
            enabled: raw && (raw.enabled === true || raw.enabled === "on"),
            updatedAt: raw && raw.updatedAt ? String(raw.updatedAt) : "",
            updatedByEmail: raw && raw.updatedByEmail ? String(raw.updatedByEmail) : ""
        };
    }

    async function getHistoryRtdbWritingConfig() {
        const db = getHistoryRtdbWritingDb();
        if (!db || typeof db.ref !== "function") return normalizeHistoryRtdbWritingConfig({});
        try {
            const snapshot = await db.ref(HISTORY_RTDB_WRITING_DB_PATH).once("value");
            return normalizeHistoryRtdbWritingConfig(snapshot && snapshot.val ? snapshot.val() : {});
        } catch (_err) {
            return normalizeHistoryRtdbWritingConfig({});
        }
    }

    async function setHistoryRtdbWritingConfig(enabled, user) {
        const db = getHistoryRtdbWritingDb();
        if (!db || typeof db.ref !== "function") throw new Error("Runtime config database unavailable.");
        const config = {
            enabled: !!enabled,
            updatedAt: new Date().toISOString(),
            updatedByUid: user && user.uid ? String(user.uid) : "",
            updatedByEmail: user && user.email ? String(user.email) : ""
        };
        await db.ref(HISTORY_RTDB_WRITING_DB_PATH).set(config);
        return normalizeHistoryRtdbWritingConfig(config);
    }

    function getRuntimeDbForSimDowntime() {
        if (window.accountDb && typeof window.accountDb.ref === "function") {
            return window.accountDb;
        }
        return getFirebaseDb();
    }

    function isSimDowntimeAdminUser() {
        const user = typeof window.getCurrentUser === "function"
            ? window.getCurrentUser()
            : (window.accountAuth && window.accountAuth.currentUser ? window.accountAuth.currentUser : null);
        const ownerAccess = !!(user && typeof window.isOwnerEmail === "function" && window.isOwnerEmail(user.email || ""));
        const isStaff = typeof window.getIsStaff === "function" ? !!window.getIsStaff() : false;
        return ownerAccess || isStaff;
    }

    function getSimEventDowntimeElements() {
        return {
            eventName: document.getElementById("adminSimEventName"),
            eventTime: document.getElementById("adminSimEventTime"),
            downtimeEnabled: document.getElementById("adminSimDowntimeEnabled"),
            downtimeUntil: document.getElementById("adminSimDowntimeUntil"),
            downtimeMessage: document.getElementById("adminSimDowntimeMessage"),
            saveBtn: document.getElementById("adminSimDowntimeSaveBtn"),
            clearBtn: document.getElementById("adminSimDowntimeClearBtn"),
            status: document.getElementById("adminSimDowntimeStatus"),
            meta: document.getElementById("adminSimDowntimeMeta")
        };
    }

    function readSimEventDowntimeConfigFromAdminForm() {
        const elements = getSimEventDowntimeElements();
        if (!elements.status) return null;
        return normalizeSimEventDowntimeConfig({
            eventName: elements.eventName ? elements.eventName.value : "",
            eventTimeIso: elements.eventTime ? elements.eventTime.value : "",
            downtimeEnabled: elements.downtimeEnabled ? elements.downtimeEnabled.value : "off",
            downtimeUntilIso: elements.downtimeUntil ? elements.downtimeUntil.value : "",
            downtimeMessage: elements.downtimeMessage ? elements.downtimeMessage.value : ""
        });
    }

    function applySimEventDowntimeConfigToAdminForm(config) {
        const elements = getSimEventDowntimeElements();
        if (!elements.status) return;
        if (elements.eventName) elements.eventName.value = config.eventName || "";
        if (elements.eventTime) elements.eventTime.value = config.eventTimeIso || "";
        if (elements.downtimeEnabled) elements.downtimeEnabled.value = config.downtimeEnabled ? "on" : "off";
        if (elements.downtimeUntil) elements.downtimeUntil.value = config.downtimeUntilIso || "";
        if (elements.downtimeMessage) elements.downtimeMessage.value = config.downtimeMessage || "";
    }

    function updateSimEventDowntimeStatus(config) {
        const elements = getSimEventDowntimeElements();
        if (!elements.status) return;

        const now = Date.now();
        const hasEvent = !!config.eventName;
        const eventLive = hasEvent && Number.isFinite(config.eventTimeMs) && config.eventTimeMs <= now;
        const eventScheduled = hasEvent && Number.isFinite(config.eventTimeMs) && config.eventTimeMs > now;
        const downtimeActive = !!(config.downtimeEnabled && Number.isFinite(config.downtimeUntilMs) && config.downtimeUntilMs > now);

        if (downtimeActive) {
            const remaining = formatRelativeMs(config.downtimeUntilMs - now);
            elements.status.textContent = `Simulator runtime config: downtime active until ${new Date(config.downtimeUntilMs).toLocaleString()} (${remaining} left).`;
        } else if (eventScheduled) {
            elements.status.textContent = `Simulator runtime config: event "${config.eventName}" scheduled for ${new Date(config.eventTimeMs).toLocaleString()}.`;
        } else if (eventLive) {
            elements.status.textContent = `Simulator runtime config: event "${config.eventName}" is live.`;
        } else {
            elements.status.textContent = "Simulator runtime config: downtime off, no event scheduled.";
        }

        if (elements.meta) {
            if (config.updatedAt) {
                const dt = new Date(config.updatedAt);
                const when = Number.isNaN(dt.getTime()) ? config.updatedAt : dt.toLocaleString();
                const by = config.updatedByEmail ? ` by ${config.updatedByEmail}` : "";
                elements.meta.textContent = `Last updated: ${when}${by}`;
            } else {
                elements.meta.textContent = "Last updated: unknown";
            }
        }
    }

    function updatePublicSimRuntimeCountdown(config) {
        const countdownEl = document.getElementById("simRuntimeCountdown");
        if (!countdownEl) return;

        const now = Date.now();
        const hasEvent = !!config.eventName;
        const eventLive = hasEvent && Number.isFinite(config.eventTimeMs) && config.eventTimeMs <= now;
        const eventScheduled = hasEvent && Number.isFinite(config.eventTimeMs) && config.eventTimeMs > now;
        const downtimeActive = !!(config.downtimeEnabled && Number.isFinite(config.downtimeUntilMs) && config.downtimeUntilMs > now);

        if (downtimeActive) {
            const remaining = formatCountdownMs(config.downtimeUntilMs - now);
            countdownEl.textContent = `Update downtime ends in ${remaining}.`;
            countdownEl.style.display = "block";
            return;
        }

        if (eventScheduled) {
            const remaining = formatCountdownMs(config.eventTimeMs - now);
            countdownEl.textContent = `Event "${config.eventName}" starts in ${remaining}.`;
            countdownEl.style.display = "block";
            return;
        }

        if (eventLive) {
            countdownEl.textContent = `Event "${config.eventName}" is live now.`;
            countdownEl.style.display = "block";
            return;
        }

        countdownEl.textContent = "";
        countdownEl.style.display = "none";
    }

    function setSimDowntimeAdminButtonsBusy(isBusy) {
        const elements = getSimEventDowntimeElements();
        if (elements.saveBtn) {
            elements.saveBtn.disabled = isBusy;
            elements.saveBtn.textContent = isBusy ? "Saving..." : "Save Runtime Config";
        }
        if (elements.clearBtn) {
            elements.clearBtn.disabled = isBusy;
        }
    }

    async function saveSimEventDowntimeConfigFromAdmin(clearMode) {
        if (!isSimDowntimeAdminUser()) {
            window.alert("Admin access required.");
            return;
        }

        const db = getRuntimeDbForSimDowntime();
        if (!db || typeof db.ref !== "function") {
            window.alert("Runtime config database unavailable right now.");
            return;
        }

        if (typeof window.ensureAdminElevation === "function"
            && !(await window.ensureAdminElevation(clearMode ? "clear the runtime config" : "save the runtime config"))) {
            return;
        }

        const user = typeof window.getCurrentUser === "function"
            ? window.getCurrentUser()
            : (window.accountAuth && window.accountAuth.currentUser ? window.accountAuth.currentUser : null);
        const nextConfig = clearMode
            ? normalizeSimEventDowntimeConfig({})
            : (readSimEventDowntimeConfigFromAdminForm() || normalizeSimEventDowntimeConfig({}));

        setSimDowntimeAdminButtonsBusy(true);
        try {
            await db.ref(SIM_EVENT_DOWNTIME_DB_PATH).set({
                eventName: nextConfig.eventName,
                eventTimeIso: nextConfig.eventTimeIso,
                downtimeEnabled: nextConfig.downtimeEnabled ? "on" : "off",
                downtimeUntilIso: nextConfig.downtimeUntilIso,
                downtimeMessage: nextConfig.downtimeMessage,
                updatedAt: new Date().toISOString(),
                updatedByUid: user && user.uid ? String(user.uid) : "",
                updatedByEmail: user && user.email ? String(user.email) : ""
            });
        } catch (err) {
            console.error("Failed to save sim downtime runtime config:", err);
            window.alert("Could not save runtime config.");
        } finally {
            setSimDowntimeAdminButtonsBusy(false);
        }
    }

    function mountSimEventDowntimeAdminBindings() {
        const elements = getSimEventDowntimeElements();
        if (!elements.status || simEventDowntimeBindingsMounted) return;

        simEventDowntimeBindingsMounted = true;
        elements.saveBtn?.addEventListener("click", () => {
            void saveSimEventDowntimeConfigFromAdmin(false);
        });
        elements.clearBtn?.addEventListener("click", () => {
            void saveSimEventDowntimeConfigFromAdmin(true);
        });

        applySimEventDowntimeConfigToAdminForm(simEventDowntimeRuntimeConfig);
        updateSimEventDowntimeStatus(simEventDowntimeRuntimeConfig);
    }

    function ensureSimEventDowntimeAdminBindings() {
        mountSimEventDowntimeAdminBindings();
        if (simEventDowntimeBindingsMounted) return;

        if (simEventDowntimeBindTimer) {
            return;
        }

        let tries = 0;
        simEventDowntimeBindTimer = window.setInterval(() => {
            tries += 1;
            mountSimEventDowntimeAdminBindings();
            if (simEventDowntimeBindingsMounted || tries > 60) {
                window.clearInterval(simEventDowntimeBindTimer);
                simEventDowntimeBindTimer = null;
            }
        }, 250);
    }

    function bindSimEventDowntimeRuntimeListener() {
        if (simEventDowntimeRef && simEventDowntimeHandler) {
            return true;
        }

        const db = getRuntimeDbForSimDowntime();
        if (!db || typeof db.ref !== "function") {
            return false;
        }

        simEventDowntimeRef = db.ref(SIM_EVENT_DOWNTIME_DB_PATH);
        simEventDowntimeHandler = (snapshot) => {
            simEventDowntimeRuntimeConfig = normalizeSimEventDowntimeConfig(snapshot && snapshot.val ? snapshot.val() : {});
            applySimEventDowntimeConfigToAdminForm(simEventDowntimeRuntimeConfig);
            updateSimEventDowntimeStatus(simEventDowntimeRuntimeConfig);
            updatePublicSimRuntimeCountdown(simEventDowntimeRuntimeConfig);
        };

        simEventDowntimeRef.on("value", simEventDowntimeHandler, (err) => {
            console.warn("Failed to listen for sim downtime runtime config:", err);
        });
        return true;
    }

    function installSimEventDowntimeControls() {
        const bindAll = () => {
            ensureSimEventDowntimeAdminBindings();
            return bindSimEventDowntimeRuntimeListener();
        };

        document.addEventListener("DOMContentLoaded", bindAll, { once: true });
        document.addEventListener("navbar:loaded", bindAll);

        if (bindAll()) return;

        const retryTimer = window.setInterval(() => {
            if (bindAll()) {
                window.clearInterval(retryTimer);
            }
        }, SIM_EVENT_DOWNTIME_RETRY_INTERVAL_MS);

        if (!simEventCountdownTickTimer) {
            simEventCountdownTickTimer = window.setInterval(() => {
                updatePublicSimRuntimeCountdown(simEventDowntimeRuntimeConfig);
            }, SIM_EVENT_COUNTDOWN_TICK_MS);
        }
    }

    function getEffectiveSimEventDowntimeConfig() {
        return simEventDowntimeRuntimeConfig;
    }

    function wrapStartSimulationForDowntime() {
        const installWrapper = () => {
            if (typeof window.startSimulation !== "function") return false;
            if (window.startSimulation.__ssDowntimeWrapped) return true;

            const originalStartSimulation = window.startSimulation;
            window.startSimulation = async function(...args) {
                const config = getEffectiveSimEventDowntimeConfig();
                const now = Date.now();
                const downtimeActive = !!(config.downtimeEnabled && Number.isFinite(config.downtimeUntilMs) && config.downtimeUntilMs > now);

                if (downtimeActive) {
                    const remaining = formatRelativeMs(config.downtimeUntilMs - now);
                    const untilLabel = new Date(config.downtimeUntilMs).toLocaleString();
                    const extraMessage = config.downtimeMessage ? `\n\n${config.downtimeMessage}` : "";
                    window.alert(`Simulator is in update downtime until ${untilLabel} (${remaining} left).${extraMessage}`);
                    return;
                }

                return originalStartSimulation.apply(this, args);
            };

            window.startSimulation.__ssDowntimeWrapped = true;
            return true;
        };

        if (installWrapper()) return;
        document.addEventListener("DOMContentLoaded", installWrapper, { once: true });
        let tries = 0;
        const intervalId = window.setInterval(() => {
            tries += 1;
            if (installWrapper() || tries > 50) {
                window.clearInterval(intervalId);
            }
        }, 250);
    }

    installSimEventDowntimeControls();
    wrapStartSimulationForDowntime();

    function syncCastBuilderHistoryCache(historyState) {
        const seasons = historyState && Array.isArray(historyState.seasons)
            ? historyState.seasons
            : [];
        window.historyCloudMergedSeasons = seasons;
        window.historyCloudSyncState = {
            cloudAvailable: !!(historyState && historyState.cloudAvailable),
            cloudLoaded: !!(historyState && historyState.cloudLoaded),
            cloudExists: !!(historyState && historyState.cloudExists),
            usingLocalFallback: !!(historyState && historyState.usingLocalFallback),
            accessBlocked: !!(historyState && historyState.accessBlocked),
            updatedAt: new Date().toISOString()
        };
        try {
            window.dispatchEvent(new CustomEvent("history-cloud-sync-state", {
                detail: window.historyCloudSyncState
            }));
        } catch (_err) {
            // Ignore environments where CustomEvent dispatch fails.
        }
        updateAdminHistoryDebugChip(historyState);
    }

    function ensureFirebaseReady() {
        if (!window.firebase) {
            return null;
        }

        try {
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(HISTORY_FIREBASE_CONFIG);
            }
            return firebase;
        } catch (_err) {
            return null;
        }
    }

    function getFirebaseDb() {
        const firebaseApi = ensureFirebaseReady();
        if (!firebaseApi || !firebaseApi.apps || !firebaseApi.apps.length) {
            return null;
        }
        try {
            return firebaseApi.database();
        } catch (_err) {
            return null;
        }
    }

    function getFirebaseFirestore() {
        const firebaseApi = ensureFirebaseReady();
        if (!firebaseApi || !firebaseApi.apps || !firebaseApi.apps.length) {
            return null;
        }

        if (typeof firebaseApi.firestore !== "function") {
            return null;
        }

        try {
            return firebaseApi.firestore();
        } catch (_err) {
            return null;
        }
    }

    function getCloudHistoryFirestoreDoc(firestoreApi, uid) {
        if (!firestoreApi || !uid || typeof firestoreApi.collection !== "function") {
            return null;
        }

        try {
            return firestoreApi.collection(CLOUD_PATH_FIRESTORE).doc(uid);
        } catch (_err) {
            return null;
        }
    }

    function getCloudHistoryRtdbRef(rtdbApi, uid) {
        if (!rtdbApi || !uid || typeof rtdbApi.ref !== "function") {
            return null;
        }

        try {
            return rtdbApi.ref(CLOUD_PATH + "/" + uid);
        } catch (_err) {
            return null;
        }
    }

    function getCloudHistorySeasonsCollection(firestoreApi, uid) {
        const docRef = getCloudHistoryFirestoreDoc(firestoreApi, uid);
        if (!docRef || typeof docRef.collection !== "function") {
            return null;
        }

        try {
            return docRef.collection(CLOUD_SEASON_SUBCOLLECTION);
        } catch (_err) {
            return null;
        }
    }

    function hashCloudSeasonKey(value) {
        let hash = 0x811c9dc5;
        const text = String(value || "");
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(36);
    }

    function getCloudSeasonDocId(season, index) {
        const rawKey = getSeasonStorageKey(season, "season", index);
        const safeKey = String(rawKey).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 96);
        return `${safeKey || "season"}__${hashCloudSeasonKey(rawKey)}`;
    }

    function getFirestoreDeleteFieldValue() {
        try {
            const firebaseApi = ensureFirebaseReady();
            const fieldValue = firebaseApi && firebaseApi.firestore ? firebaseApi.firestore.FieldValue : null;
            return fieldValue && typeof fieldValue.delete === "function" ? fieldValue.delete() : null;
        } catch (_err) {
            return null;
        }
    }

    /* A save reads the seasons right before writing them. Remembering that read means the
       write doesn't have to download every season a second time. */
    const CLOUD_SEASON_DOCS_REUSE_MS = 60 * 1000;
    const cloudSeasonDocsByUid = new Map();

    function rememberCloudSeasonDocs(uid, snapshot) {
        const docs = new Map();
        if (snapshot) {
            snapshot.forEach((doc) => docs.set(doc.id, doc.data() || {}));
        }
        cloudSeasonDocsByUid.set(uid, { docs, at: Date.now() });
    }

    function takeRememberedCloudSeasonDocs(uid) {
        const remembered = cloudSeasonDocsByUid.get(uid);
        cloudSeasonDocsByUid.delete(uid);
        return remembered && Date.now() - remembered.at < CLOUD_SEASON_DOCS_REUSE_MS ? remembered.docs : null;
    }

    async function readCloudHistorySeasonDocs(firestoreApi, uid) {
        const collectionRef = getCloudHistorySeasonsCollection(firestoreApi, uid);
        if (!collectionRef) return null;

        const snapshot = await collectionRef.get();
        rememberCloudSeasonDocs(uid, snapshot);
        if (!snapshot || snapshot.empty) return null;

        const rows = [];
        snapshot.forEach((doc) => {
            const data = doc.data() || {};
            if (!data.season || typeof data.season !== "object") return;
            rows.push({
                order: Number.isFinite(data.order) ? data.order : rows.length,
                season: data.season
            });
        });

        rows.sort((a, b) => a.order - b.order);
        return rows.map((row) => hydrateSeasonFromCloudStorage(row.season)).filter(Boolean);
    }

    /* Firestore can return a document's keys in a different order, so keys are sorted to
       make sure only seasons that really changed get rewritten. */
    function getSeasonDocFingerprint(value) {
        return JSON.stringify(value, (_key, entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
            return Object.keys(entry).sort().reduce((sorted, key) => {
                sorted[key] = entry[key];
                return sorted;
            }, {});
        });
    }

    async function writeCloudHistorySeasonDocs(firestoreApi, uid, seasons) {
        const collectionRef = getCloudHistorySeasonsCollection(firestoreApi, uid);
        if (!collectionRef || typeof firestoreApi.batch !== "function") {
            throw new Error("Firestore cloud history is unavailable.");
        }

        let existingDocs = takeRememberedCloudSeasonDocs(uid);
        if (!existingDocs) {
            const existingSnapshot = await collectionRef.get();
            existingDocs = new Map();
            if (existingSnapshot) {
                existingSnapshot.forEach((doc) => existingDocs.set(doc.id, doc.data() || {}));
            }
        }

        const usedDocIds = new Set();
        const operations = [];
        seasons.forEach((season, index) => {
            let docId = getCloudSeasonDocId(season, index);
            while (usedDocIds.has(docId)) {
                docId = `${docId}_${index}`;
            }
            usedDocIds.add(docId);
            const data = { order: index, season };
            const existingData = existingDocs.get(docId);
            existingDocs.delete(docId);
            if (!existingData || getSeasonDocFingerprint(existingData) !== getSeasonDocFingerprint(data)) {
                operations.push({ ref: collectionRef.doc(docId), data });
            }
        });
        existingDocs.forEach((_data, docId) => operations.push({ ref: collectionRef.doc(docId), data: null }));

        let batchOperations = [];
        let batchBytes = 0;
        const commitBatch = async () => {
            if (batchOperations.length === 0) return;
            const batch = firestoreApi.batch();
            batchOperations.forEach((operation) => {
                if (operation.data === null) {
                    batch.delete(operation.ref);
                } else {
                    batch.set(operation.ref, operation.data);
                }
            });
            await batch.commit();
            batchOperations = [];
            batchBytes = 0;
        };

        for (const operation of operations) {
            const operationBytes = operation.data === null
                ? 256
                : JSON.stringify(operation.data).length * 3;
            if (batchOperations.length > 0 && (
                batchOperations.length >= FIRESTORE_BATCH_LIMIT
                || batchBytes + operationBytes > FIRESTORE_BATCH_BYTES_LIMIT
            )) {
                await commitBatch();
            }
            batchOperations.push(operation);
            batchBytes += operationBytes;
        }
        await commitBatch();
    }

    function normalizeRtdbHistoryPayload(rawPayload) {
        const payload = rawPayload && typeof rawPayload === "object"
            ? rawPayload
            : {};

        const directSeasonArray = Array.isArray(rawPayload)
            ? rawPayload
            : null;
        const keyedSeasonArray = !directSeasonArray && payload && typeof payload === "object"
            ? Object.keys(payload)
                .filter((key) => /^\d+$/.test(key))
                .sort((a, b) => Number(a) - Number(b))
                .map((key) => payload[key])
            : [];
        const seasonsSource = directSeasonArray
            || (Array.isArray(payload.seasons) ? payload.seasons : null)
            || keyedSeasonArray;

        return {
            seasons: Array.isArray(seasonsSource)
                ? seasonsSource.map((season) => hydrateSeasonFromCloudStorage(season)).filter(Boolean)
                : [],
            updatedAt: payload.updatedAt || null
        };
    }

    function getCurrentUid() {
        try {
            const firebaseApi = ensureFirebaseReady();
            const authService = firebaseApi && firebaseApi.auth ? firebaseApi.auth() : null;
            const authUser = authService && authService.currentUser ? authService.currentUser : null;
            if (authUser && authUser.uid) {
                return String(authUser.uid);
            }

            const accountUser = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
            if (accountUser && accountUser.uid) {
                return String(accountUser.uid);
            }

            if (window.currentUserUid) {
                return String(window.currentUserUid);
            }

            return "";
        } catch (_err) {
            try {
                const accountUser = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
                if (accountUser && accountUser.uid) {
                    return String(accountUser.uid);
                }
                if (window.currentUserUid) {
                    return String(window.currentUserUid);
                }
            } catch (_err2) {}
            return "";
        }
    }

    function normalizeCloudHistoryTier(value) {
        const normalized = String(value || "").trim().toUpperCase();
        if (!normalized) return "NONE";
        if (normalized.includes("HYPERSTAR") || normalized.includes("HYPERSPONSOR")) return "HYPERSTAR";
        if (normalized.includes("SUPERSTAR")) return "SUPERSTAR";
        if (normalized.includes("SPONSOR")) return "SPONSOR";
        if (normalized.includes("BOOSTER")) return "BOOSTER";
        if (normalized.includes("SUPPORTER")) return "SUPPORTER";
        return "NONE";
    }

    function getOwnerSpoofCloudHistoryTier() {
        try {
            const spoofValue = localStorage.getItem(HISTORY_TIER_SPOOF_STORAGE_KEY);
            const spoofTier = normalizeCloudHistoryTier(spoofValue);
            return spoofTier === "NONE" ? "" : spoofTier;
        } catch (_err) {
            return "";
        }
    }

    function canUseCloudHistoryByTier(tierName) {
        return true;
    }

    function isLocalDevHost() {
        try {
            const hostname = String(window.location && window.location.hostname || "").toLowerCase();
            return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
        } catch (_err) {
            return false;
        }
    }

    async function resolveCloudHistoryTierName() {
        const now = Date.now();
        if (historyCloudTierCache && historyCloudTierCache.expiresAt > now) {
            return historyCloudTierCache.tier;
        }

        await waitForAuthResolution();

        let tierName = "NONE";
        try {
            const firebaseApi = ensureFirebaseReady();
            const authUser = firebaseApi && firebaseApi.auth && firebaseApi.auth().currentUser
                ? firebaseApi.auth().currentUser
                : null;
            const ownerAccess = !!(authUser
                && authUser.email
                && typeof window.isOwnerEmail === "function"
                && window.isOwnerEmail(authUser.email));

            if (ownerAccess) {
                const spoofTier = getOwnerSpoofCloudHistoryTier();
                tierName = spoofTier || "SUPERSTAR";
            } else {
                const db = getFirebaseDb();
                const uid = getCurrentUid();
                if (db && uid) {
                    const snapshot = await db.ref(`users/${uid}/profile/discordLink`).once("value");
                    const linkData = snapshot.val() || {};
                    const permissions = linkData.permissions && typeof linkData.permissions === "object"
                        ? linkData.permissions
                        : {};

                    tierName = normalizeCloudHistoryTier(permissions.tier || linkData.accessTier || "");
                    if (permissions.hasHyperSponsorRole) {
                        tierName = "HYPERSTAR";
                    } else if (permissions.canUseBanner || permissions.hasSponsorRole) {
                        tierName = "SUPERSTAR";
                    } else if (permissions.hasSupporterRole || (tierName === "NONE" && String(linkData.accessStatus || "").toUpperCase() === "ACCEPTED")) {
                        tierName = "SUPPORTER";
                    } else if (permissions.hasBoosterRole) {
                        tierName = "BOOSTER";
                    }
                }
            }
        } catch (_err) {
            tierName = "NONE";
        }

        historyCloudTierCache = {
            tier: normalizeCloudHistoryTier(tierName),
            expiresAt: now + HISTORY_TIER_CACHE_TTL_MS
        };

        return historyCloudTierCache.tier;
    }

    async function resolveHistoryAccessState() {
        await waitForAuthResolution();

        // Local development should not be blocked by remote OAuth/domain requirements.
        if (isLocalDevHost()) {
            return {
                blocked: false,
                reason: ""
            };
        }

        if (!navigator.onLine) {
            return {
                blocked: true,
                reason: "You are offline. Reconnect to verify cloud history access."
            };
        }

        if (typeof window.getUserHistoryAccess !== "function") {
            return {
                blocked: true,
                reason: "History access verifier is unavailable. Reload the page and sign in again."
            };
        }

        try {
            return await window.getUserHistoryAccess();
        } catch (err) {
            const details = err && err.message ? String(err.message).trim() : "";
            return {
                blocked: true,
                reason: details
                    ? "History access verification failed: " + details
                    : "History access could not be verified right now. Reload and try again."
            };
        }
    }

    async function assertHistoryAccess() {
        await waitForAuthResolution();

        const uid = getCurrentUid();
        if (uid) {
            return;
        }

        const access = await resolveHistoryAccessState();
        if (!access || !access.blocked) return;

        const error = new Error(access.reason || "History is only available to + members.");
        error.code = "history-access-blocked";
        throw error;
    }

    window.getCloudHistoryTierSpoof = function() {
        return getOwnerSpoofCloudHistoryTier();
    };

    window.setCloudHistoryTierSpoof = function(tierName) {
        const normalizedTier = normalizeCloudHistoryTier(tierName);
        try {
            if (normalizedTier === "NONE") {
                localStorage.removeItem(HISTORY_TIER_SPOOF_STORAGE_KEY);
            } else {
                localStorage.setItem(HISTORY_TIER_SPOOF_STORAGE_KEY, normalizedTier);
            }
        } catch (_err) {}
        historyCloudTierCache = null;
        return normalizedTier;
    };

    window.clearCloudHistoryTierSpoof = function() {
        return window.setCloudHistoryTierSpoof("NONE");
    };

    function normalizeCloudHistoryReadSource(value) {
        const normalized = String(value || "").trim().toLowerCase();
        if (normalized === "firestore" || normalized === "rtdb") {
            return normalized;
        }
        return "auto";
    }

    function getCloudHistoryReadSourcePreference() {
        try {
            return normalizeCloudHistoryReadSource(localStorage.getItem(HISTORY_CLOUD_READ_SOURCE_STORAGE_KEY));
        } catch (_err) {
            return "auto";
        }
    }

    function setCloudHistoryReadSourcePreference(value) {
        const nextSource = normalizeCloudHistoryReadSource(value);
        try {
            if (nextSource === "auto") {
                localStorage.removeItem(HISTORY_CLOUD_READ_SOURCE_STORAGE_KEY);
            } else {
                localStorage.setItem(HISTORY_CLOUD_READ_SOURCE_STORAGE_KEY, nextSource);
            }
        } catch (_err) {}

        historyCloudReadRequestByUid.clear();
        historyCloudReadCacheByUid.clear();
        return nextSource;
    }

    async function waitForAuthResolution() {
        if (authReadyPromise) {
            return authReadyPromise;
        }

        authReadyPromise = new Promise((resolve) => {
            try {
                const currentUid = getCurrentUid();
                if (currentUid) {
                    resolve({ uid: currentUid });
                    return;
                }

                const firebaseApi = ensureFirebaseReady();
                if (!firebaseApi || !firebaseApi.auth) {
                    resolve(null);
                    return;
                }

                const auth = firebaseApi.auth();
                if (!auth || typeof auth.onAuthStateChanged !== "function") {
                    resolve(null);
                    return;
                }

                let settled = false;
                const finish = (user) => {
                    if (settled) return;
                    settled = true;
                    resolve(user || auth.currentUser || null);
                };

                const unsubscribe = auth.onAuthStateChanged((user) => {
                    try {
                        unsubscribe();
                    } catch (_err) {}
                    finish(user);
                }, () => finish(auth.currentUser || null));

                setTimeout(() => {
                    try {
                        unsubscribe();
                    } catch (_err) {}
                    finish(auth.currentUser || null);
                }, 4000);
            } catch (_err) {
                resolve(null);
            }
        });

        return authReadyPromise;
    }

    function clearLegacyLocalHistory() {
        try {
            localStorage.removeItem(LOCAL_KEY);
        } catch (_err) {
            // Ignore unavailable storage in strict/private contexts.
        }
    }

    function minifyHistoryMarkup(markup) {
        if (typeof markup !== "string") return "";
        return markup
            .replace(/>\s+</g, "><")
            .replace(/\s{2,}/g, " ")
            .trim();
    }

    function compactHistoryImageRef(value) {
        if (typeof value !== "string") return "";
        const image = value.trim();
        if (!image) return "";
        if (/^data:image\//i.test(image) || /^blob:/i.test(image)) return "";
        if (image.length > 600) return "";
        return image;
    }

    function compactHistoryImageList(images) {
        if (!Array.isArray(images)) return [];
        const unique = new Set();
        images.forEach((value) => {
            const image = compactHistoryImageRef(value);
            if (image) unique.add(image);
        });
        return Array.from(unique);
    }

    function compactTrackRecordHtmlForStorage(markup) {
        if (typeof markup !== "string") return "";
        let compact = minifyHistoryMarkup(markup);
        if (!compact) return "";

        compact = compact
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/\ssrc=("data:image[^"]*"|'data:image[^']*')/gi, ' src="image/queens/noimage.jpg"');

        return compact;
    }

    function canBuildHistoryTrackRecordFromData(season) {
        if (!season || typeof season !== "object") return false;
        if (!Array.isArray(season.cast) || season.cast.length === 0) return false;
        return season.cast.some((entry) => Array.isArray(entry && entry.trackRecord) && entry.trackRecord.length > 0);
    }

    function compactHistoryFlagMap(map) {
        if (!map || typeof map !== "object") {
            return {};
        }
        const compact = {};
        Object.keys(map).forEach((key) => {
            if (map[key]) {
                compact[key] = true;
            }
        });
        return compact;
    }

    function encodeTrackRecordRankCacheForCloud(rankCache) {
        if (!rankCache || typeof rankCache !== "object") {
            return {};
        }

        const encoded = {};
        Object.keys(rankCache).forEach((key) => {
            const rawKey = String(key || "");
            const needsEscape = /[.#$\/\[\]]/.test(rawKey);
            const safeKey = needsEscape
                ? FIREBASE_KEY_ESCAPE_PREFIX + rawKey
                    .replace(/%/g, "%25")
                    .replace(/[.#$\/\[\]]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)
                : rawKey;
            if (!safeKey) return;

            const numericValue = Number(rankCache[key]);
            if (Number.isFinite(numericValue)) {
                encoded[safeKey] = numericValue;
            }
        });

        return encoded;
    }

    function decodeTrackRecordRankCacheFromCloud(rankCache) {
        if (!rankCache || typeof rankCache !== "object") {
            return {};
        }

        const decoded = {};
        Object.keys(rankCache).forEach((key) => {
            let originalKey = String(key || "");
            if (!originalKey) return;

            if (originalKey.startsWith(FIREBASE_KEY_ESCAPE_PREFIX)) {
                try {
                    originalKey = decodeURIComponent(originalKey.slice(FIREBASE_KEY_ESCAPE_PREFIX.length));
                } catch (_err) {
                    originalKey = originalKey.slice(FIREBASE_KEY_ESCAPE_PREFIX.length);
                }
            }

            if (!originalKey) return;

            const numericValue = Number(rankCache[key]);
            if (Number.isFinite(numericValue)) {
                decoded[originalKey] = numericValue;
            }
        });

        return decoded;
    }

    function compactHistoryCastEntry(entry) {
        if (!entry || typeof entry !== "object") {
            return null;
        }
        const compact = {
            name: entry.name || ""
        };

        ["country", "name1", "name2"].forEach((field) => {
            if (entry[field]) compact[field] = entry[field];
        });

        const compactImage = compactHistoryImageRef(entry.image);
        if (compactImage) {
            compact.image = compactImage;
        }

        ["rankP", "acting", "comedy", "dance", "design", "improv", "runway", "lipsync", "ppe", "episodesOn"].forEach((field) => {
            const numericValue = Number(entry[field]);
            if (Number.isFinite(numericValue) && numericValue !== 0) {
                compact[field] = entry[field];
            }
        });

        ["custom", "isDuo"].forEach((field) => {
            if (entry[field] === true) compact[field] = true;
        });

        if (Array.isArray(entry.trackRecord) && entry.trackRecord.length > 0) {
            compact.trackRecord = entry.trackRecord;
        }
        if (Array.isArray(entry.lipsyncHistory) && entry.lipsyncHistory.length > 0) {
            compact.lipsyncHistory = entry.lipsyncHistory;
        }
        // Small fields the History awards read.
        ["miniEpisode", "miniLoser", "mvqWonHistory", "retEp"].forEach((field) => {
            if (Array.isArray(entry[field]) && entry[field].some(Boolean)) {
                compact[field] = entry[field];
            }
        });
        if (Number(entry.money) > 0) {
            compact.money = entry.money;
            if (entry.prizeCurrency) compact.prizeCurrency = entry.prizeCurrency;
        }

        if (Array.isArray(entry.images) && entry.images.length > 0) {
            const compactImages = compactHistoryImageList(entry.images);
            if (entry.custom === true || entry.isDuo === true) {
                if (compactImages.length > 0) {
                    compact.images = compactImages;
                }
            } else {
                compact.image = compact.image || (compactImages[0] || "");
            }
        }

        if (!compact.image && Array.isArray(compact.images) && compact.images.length > 0) {
            compact.image = compact.images[0];
        }

        if (!compact.image) {
            delete compact.image;
        }

        return compact;
    }

    function compactSeasonForStorage(season) {
        if (!season || typeof season !== "object") {
            return season;
        }

        const compact = { ...season };
        if (typeof compact.trackRecordHTML === "string") {
            compact.trackRecordHTML = compactTrackRecordHtmlForStorage(compact.trackRecordHTML);
        }
        if (compact.extraStatsHTML && typeof compact.extraStatsHTML === "object") {
            const compactedExtraStats = {};
            Object.keys(compact.extraStatsHTML).forEach((label) => {
                if (label === "Track Records") {
                    return;
                }
                const html = compactTrackRecordHtmlForStorage(compact.extraStatsHTML[label]);
                if (html) {
                    compactedExtraStats[label] = html;
                }
            });
            compact.extraStatsHTML = compactedExtraStats;
        }
        delete compact.fanReactionsWeeklyHTML;
        delete compact.episodeRatingsAllHTML;
        compact.winnerImg = compactHistoryImageRef(compact.winnerImg);
        if (Array.isArray(compact.winnerImgs)) {
            compact.winnerImgs = compactHistoryImageList(compact.winnerImgs);
        }
        compact.formatFlags = compactHistoryFlagMap(compact.formatFlags);
        compact.premiereFlags = compactHistoryFlagMap(compact.premiereFlags);
        compact.returningFlags = compactHistoryFlagMap(compact.returningFlags);
        compact.twists = compactHistoryFlagMap(compact.twists);

        if (compact.liveShare && typeof compact.liveShare === "object") {
            const compactLiveShare = {
                roomId: String(compact.liveShare.roomId || ""),
                mode: String(compact.liveShare.mode || "viewer"),
                status: String(compact.liveShare.status || ""),
                updatedAt: String(compact.liveShare.updatedAt || ""),
                watchUrl: String(compact.liveShare.watchUrl || ""),
                expiresAt: String(compact.liveShare.expiresAt || "")
            };
            if (compact.liveShare.createdAt) compactLiveShare.createdAt = String(compact.liveShare.createdAt);
            if (compact.liveShare.endedAt) compactLiveShare.endedAt = String(compact.liveShare.endedAt);
            compact.liveShare = compactLiveShare;
        }

        if (Array.isArray(compact.cast)) {
            compact.cast = compact.cast
                .map((entry) => compactHistoryCastEntry(entry))
                .filter(Boolean);
        }

        ["challenges", "alots", "saveTwist4Chart", "decidingVote4Chart", "elimKween4Chart", "safetyDecidingVote4Chart", "safetyResult4Chart", "winnerNames", "winnerImgs"].forEach((field) => {
            if (Array.isArray(compact[field]) && compact[field].length === 0) {
                delete compact[field];
            }
        });

        ["liveShare", "trackRecordRankCache"].forEach((field) => {
            if (compact[field] && typeof compact[field] === "object" && Object.keys(compact[field]).length === 0) {
                delete compact[field];
            }
        });
        delete compact.historyStorage;
        return compact;
    }

    function compactSeasonForCloudStorage(season) {
        const compact = compactSeasonForStorage(season);
        if (!compact || typeof compact !== "object") {
            return compact;
        }

        if (compact.trackRecordRankCache && typeof compact.trackRecordRankCache === "object") {
            const encodedRankCache = encodeTrackRecordRankCacheForCloud(compact.trackRecordRankCache);
            if (Object.keys(encodedRankCache).length > 0) {
                compact.trackRecordRankCache = encodedRankCache;
            } else {
                delete compact.trackRecordRankCache;
            }
        }

        return compact;
    }

    function hydrateSeasonFromCloudStorage(season) {
        const hydrated = compactSeasonForStorage(season);
        if (!hydrated || typeof hydrated !== "object") {
            return hydrated;
        }

        if (hydrated.trackRecordRankCache && typeof hydrated.trackRecordRankCache === "object") {
            const decodedRankCache = decodeTrackRecordRankCacheFromCloud(hydrated.trackRecordRankCache);
            if (Object.keys(decodedRankCache).length > 0) {
                hydrated.trackRecordRankCache = decodedRankCache;
            } else {
                delete hydrated.trackRecordRankCache;
            }
        }

        return hydrated;
    }

    function compactSeasonListForStorage(seasons) {
        if (!Array.isArray(seasons)) return [];
        return seasons.map((season) => compactSeasonForStorage(season));
    }

    function compactSeasonListForCloudStorage(seasons) {
        if (!Array.isArray(seasons)) return [];
        return seasons.map((season) => compactSeasonForCloudStorage(season));
    }

    function readLocalHistoryCache() {
        if (typeof window.getSeasonHistoryFranchiseStore === "function") {
            try {
                const store = window.getSeasonHistoryFranchiseStore();
                const flattened = Object.keys(store || {}).reduce((records, franchiseName) => {
                    const seasons = Array.isArray(store[franchiseName]) ? store[franchiseName] : [];
                    seasons.forEach((season) => {
                        if (!season || typeof season !== "object") {
                            return;
                        }
                        records.push({
                            ...season,
                            historyFranchise: season.historyFranchise || franchiseName
                        });
                    });
                    return records;
                }, []);

                const compacted = compactSeasonListForStorage(flattened);
                if (typeof window.saveSeasonHistoryFranchiseStore === "function") {
                    const compactStore = compacted.reduce((nextStore, season) => {
                        const franchiseName = typeof window.normalizeSeasonHistoryFranchiseName === "function"
                            ? window.normalizeSeasonHistoryFranchiseName(season && season.historyFranchise)
                            : String(season && season.historyFranchise || "Main").trim() || "Main";
                        if (!Array.isArray(nextStore[franchiseName])) {
                            nextStore[franchiseName] = [];
                        }
                        nextStore[franchiseName].push({
                            ...season,
                            historyFranchise: franchiseName
                        });
                        return nextStore;
                    }, Object.keys(store || {}).reduce((nextStore, franchiseName) => {
                        nextStore[franchiseName] = [];
                        return nextStore;
                    }, {}));

                    if (JSON.stringify(compactStore) !== JSON.stringify(store || {})) {
                        window.saveSeasonHistoryFranchiseStore(compactStore);
                    }
                }

                return compacted;
            } catch (_err) {
                // Fall back to legacy flat cache below.
            }
        }

        try {
            const local = JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
            if (!Array.isArray(local)) {
                return [];
            }

            const compacted = compactSeasonListForStorage(local);
            if (JSON.stringify(compacted) !== JSON.stringify(local)) {
                try {
                    localStorage.setItem(LOCAL_KEY, JSON.stringify(compacted));
                } catch (_err) {
                    // Ignore unavailable storage in strict/private contexts.
                }
            }
            return compacted;
        } catch (_err) {
            return [];
        }
    }

    function writeLocalHistoryCache(seasons) {
        if (typeof window.getSeasonHistoryFranchiseStore === "function"
            && typeof window.saveSeasonHistoryFranchiseStore === "function") {
            try {
                const currentStore = window.getSeasonHistoryFranchiseStore();
                const nextStore = Object.keys(currentStore || {}).reduce((store, franchiseName) => {
                    store[franchiseName] = [];
                    return store;
                }, {});

                compactSeasonListForStorage(seasons).forEach((season) => {
                    const franchiseName = typeof window.normalizeSeasonHistoryFranchiseName === "function"
                        ? window.normalizeSeasonHistoryFranchiseName(season && season.historyFranchise)
                        : String(season && season.historyFranchise || "Main").trim() || "Main";
                    if (!Array.isArray(nextStore[franchiseName])) {
                        nextStore[franchiseName] = [];
                    }
                    nextStore[franchiseName].push({
                        ...season,
                        historyFranchise: franchiseName
                    });
                });

                window.saveSeasonHistoryFranchiseStore(nextStore);
                return;
            } catch (_err) {
                // Fall back to legacy flat cache below.
            }
        }

        try {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(compactSeasonListForStorage(seasons)));
        } catch (_err) {
            // Ignore unavailable storage in strict/private contexts.
        }
    }

    function getHistorySeasonsFingerprint(seasons) {
        try {
            return JSON.stringify(Array.isArray(seasons) ? seasons : []);
        } catch (_err) {
            return "";
        }
    }

    function getSeasonStorageKey(season, fallbackPrefix = "season", fallbackIndex = 0) {
        if (season && season.id !== undefined && season.id !== null && season.id !== "") {
            return String(season.id);
        }

        const liveShareRoomId = season && season.liveShare && season.liveShare.roomId !== undefined
            ? String(season.liveShare.roomId)
            : "";
        const fallbackValue = [
            season && season.name ? String(season.name) : "",
            season && season.date ? String(season.date) : "",
            season && season.winner ? String(season.winner) : "",
            season && season.castSize !== undefined ? String(season.castSize) : "",
            season && season.episodes !== undefined ? String(season.episodes) : "",
            season && season.savedAt ? String(season.savedAt) : "",
            season && season.historyFranchise ? String(season.historyFranchise) : "",
            season && season.format ? String(season.format) : "",
            liveShareRoomId
        ].join("|");

        return fallbackValue || String(fallbackIndex);
    }

    function cloneHistorySeason(season, historyStorage) {
        if (!season || typeof season !== "object") {
            return season;
        }

        const cloned = { ...season };
        if (historyStorage) {
            cloned.historyStorage = historyStorage;
        } else {
            delete cloned.historyStorage;
        }
        return cloned;
    }

    function cloneHistorySeasons(seasons) {
        if (!Array.isArray(seasons)) return [];
        return seasons.map((season) => cloneHistorySeason(season));
    }

    function cloneCloudHistoryPayload(payload) {
        const safePayload = payload && typeof payload === "object" ? payload : {};
        return {
            seasons: cloneHistorySeasons(safePayload.seasons),
            updatedAt: safePayload.updatedAt || null,
            available: !!safePayload.available,
            loaded: !!safePayload.loaded,
            exists: !!safePayload.exists,
            cloudBackend: safePayload.cloudBackend || "",
            readSourceMode: normalizeCloudHistoryReadSource(safePayload.readSourceMode)
        };
    }

    function getCachedCloudHistory(uid) {
        if (!uid) return null;
        const cached = historyCloudReadCacheByUid.get(uid);
        if (!cached) return null;
        if (cached.expiresAt <= Date.now()) {
            historyCloudReadCacheByUid.delete(uid);
            return null;
        }
        return cloneCloudHistoryPayload(cached.value);
    }

    function setCachedCloudHistory(uid, payload) {
        if (!uid) return;
        historyCloudReadCacheByUid.set(uid, {
            value: cloneCloudHistoryPayload(payload),
            expiresAt: Date.now() + HISTORY_CLOUD_READ_CACHE_TTL_MS
        });
    }

    function normalizeImportedHistorySeasons(seasons) {
        if (!Array.isArray(seasons)) return [];

        const importStamp = Date.now();
        return seasons.reduce((normalized, season, index) => {
            if (!season || typeof season !== "object") {
                return normalized;
            }

            const nextSeason = cloneHistorySeason(season);
            delete nextSeason.historyStorage;

            if (nextSeason.id === undefined || nextSeason.id === null || nextSeason.id === "") {
                nextSeason.id = `imported-${importStamp}-${index}`;
            }

            normalized.push(nextSeason);
            return normalized;
        }, []);
    }

    function mergeSeasonLists(existingSeasons, incomingSeasons) {
        const next = cloneHistorySeasons(existingSeasons);
        const imported = normalizeImportedHistorySeasons(incomingSeasons);

        imported.slice().reverse().forEach((season, index) => {
            const seasonKey = getSeasonStorageKey(season, "incoming", index);
            const existingIndex = next.findIndex((currentSeason, currentIndex) => (
                getSeasonStorageKey(currentSeason, "current", currentIndex) === seasonKey
            ));

            if (existingIndex >= 0) {
                next.splice(existingIndex, 1);
            }

            next.unshift(cloneHistorySeason(season));
        });

        return next;
    }

    /* Seasons can live on this device, in the cloud, or both, so neither list alone knows the
       order. manualOrder is saved on the season itself when someone moves it. Seasons saved
       since then have none yet and stay on top, where new seasons always appear. */
    function applySavedSeasonOrder(seasons) {
        const slotsByFranchise = new Map();
        seasons.forEach((season, index) => {
            const franchise = getSeasonHistoryFranchise(season);
            if (!slotsByFranchise.has(franchise)) slotsByFranchise.set(franchise, []);
            slotsByFranchise.get(franchise).push(index);
        });

        const ordered = seasons.slice();
        slotsByFranchise.forEach((slots) => {
            const group = slots.map((slot) => seasons[slot]);
            if (!group.some((season) => Number.isFinite(season.manualOrder))) return;
            const orderOf = (season) => (Number.isFinite(season.manualOrder) ? season.manualOrder : -1);
            group
                .map((season, position) => ({ season, position }))
                .sort((a, b) => (orderOf(a.season) - orderOf(b.season)) || (a.position - b.position))
                .forEach((entry, position) => {
                    ordered[slots[position]] = entry.season;
                });
        });
        return ordered;
    }

    function buildMergedHistory(localSeasons, cloudSeasons, cloudBackend = "") {
        const merged = [];
        const pendingCloud = new Map();

        const hasSavedTrackRecordHtml = (season) => (
            !!(season
                && typeof season.trackRecordHTML === "string"
                && season.trackRecordHTML.includes('id="trackRecord"')
                && /Rank/i.test(season.trackRecordHTML)
                && /Contestant/i.test(season.trackRecordHTML))
        );

        const hasRankCache = (season) => (
            !!(season
                && season.trackRecordRankCache
                && typeof season.trackRecordRankCache === "object"
                && Object.keys(season.trackRecordRankCache).length > 0)
        );

        const hasExtraStatsHtml = (season) => (
            !!(season
                && season.extraStatsHTML
                && typeof season.extraStatsHTML === "object"
                && Object.keys(season.extraStatsHTML).length > 0)
        );

        const hasFanReactionWeeks = (season) => (
            Array.isArray(season && season.fanReactionsWeeklyHTML) && season.fanReactionsWeeklyHTML.length > 0
        );

        const hasEpisodeRatingsAll = (season) => (
            Array.isArray(season && season.episodeRatingsAllHTML) && season.episodeRatingsAllHTML.length > 0
        );

        cloneHistorySeasons(cloudSeasons).forEach((season, index) => {
            pendingCloud.set(getSeasonStorageKey(season, "cloud", index), season);
        });

        cloneHistorySeasons(localSeasons).forEach((season, index) => {
            const seasonKey = getSeasonStorageKey(season, "local", index);
            if (pendingCloud.has(seasonKey)) {
                const cloudSeason = pendingCloud.get(seasonKey);
                const mergedStorage = { local: true, cloud: true };
                if (cloudBackend) {
                    mergedStorage.cloudBackend = cloudBackend;
                }
                const mergedSeason = cloneHistorySeason(cloudSeason, mergedStorage);

                if (!hasSavedTrackRecordHtml(cloudSeason) && hasSavedTrackRecordHtml(season)) {
                    mergedSeason.trackRecordHTML = season.trackRecordHTML;
                }

                if (!hasRankCache(cloudSeason) && hasRankCache(season)) {
                    mergedSeason.trackRecordRankCache = { ...season.trackRecordRankCache };
                }

                if (!hasExtraStatsHtml(cloudSeason) && hasExtraStatsHtml(season)) {
                    mergedSeason.extraStatsHTML = { ...season.extraStatsHTML };
                }

                if (!hasFanReactionWeeks(cloudSeason) && hasFanReactionWeeks(season)) {
                    mergedSeason.fanReactionsWeeklyHTML = [...season.fanReactionsWeeklyHTML];
                }

                if (!hasEpisodeRatingsAll(cloudSeason) && hasEpisodeRatingsAll(season)) {
                    mergedSeason.episodeRatingsAllHTML = [...season.episodeRatingsAllHTML];
                }

                merged.push(mergedSeason);
                pendingCloud.delete(seasonKey);
                return;
            }

            merged.push(cloneHistorySeason(season, { local: true, cloud: false }));
        });

        pendingCloud.forEach((season) => {
            const mergedStorage = { local: false, cloud: true };
            if (cloudBackend) {
                mergedStorage.cloudBackend = cloudBackend;
            }
            merged.push(cloneHistorySeason(season, mergedStorage));
        });

        return applySavedSeasonOrder(merged);
    }

    async function readCloudHistory(options = {}) {
        await waitForAuthResolution();
        const firestoreApi = getFirebaseFirestore();
        const rtdbApi = getFirebaseDb();
        const uid = getCurrentUid();
        const forceCloudRead = !!(options && options.forceCloudRead);
        const readSourceMode = normalizeCloudHistoryReadSource(options && options.readSource
            ? options.readSource
            : getCloudHistoryReadSourcePreference());

        if (!uid || (!firestoreApi && !rtdbApi)) {
            return {
                seasons: [],
                updatedAt: null,
                available: false,
                loaded: true,
                exists: false,
                readSourceMode
            };
        }

        if (forceCloudRead) {
            historyCloudReadCacheByUid.delete(uid);
            historyCloudReadRequestByUid.delete(uid);
        } else {
            const cachedPayload = getCachedCloudHistory(uid);
            if (cachedPayload) {
                return cachedPayload;
            }

            const inFlightRead = historyCloudReadRequestByUid.get(uid);
            if (inFlightRead) {
                try {
                    const pendingPayload = await inFlightRead;
                    return cloneCloudHistoryPayload(pendingPayload);
                } catch (_err) {
                    // Fall through to a direct read.
                }
            }
        }

        const readRequest = (async () => {
            const readFromFirestore = async () => {
                const firestoreDocRef = getCloudHistoryFirestoreDoc(firestoreApi, uid);
                if (!firestoreDocRef) {
                    return null;
                }
                try {
                    const [firestoreSnapshot, seasonDocs] = await Promise.all([
                        firestoreDocRef.get(),
                        readCloudHistorySeasonDocs(firestoreApi, uid)
                    ]);
                    const firestorePayload = firestoreSnapshot && firestoreSnapshot.exists
                        ? firestoreSnapshot.data() || {}
                        : {};
                    const legacySeasons = Array.isArray(firestorePayload.seasons)
                        ? firestorePayload.seasons.map((season) => hydrateSeasonFromCloudStorage(season)).filter(Boolean)
                        : [];
                    const firestoreSeasons = seasonDocs && seasonDocs.length ? seasonDocs : legacySeasons;

                    if (firestoreSeasons.length || (firestoreSnapshot && firestoreSnapshot.exists)) {
                        return {
                            seasons: firestoreSeasons,
                            updatedAt: firestorePayload.updatedAt || null,
                            available: true,
                            loaded: true,
                            exists: true,
                            cloudBackend: "firestore"
                        };
                    }
                } catch (_err) {
                    // Firestore read failed.
                }
                return null;
            };

            const readFromRtdb = async () => {
                const rtdbRef = getCloudHistoryRtdbRef(rtdbApi, uid);
                if (!rtdbRef) {
                    return null;
                }
                try {
                    const rtdbSnapshot = await rtdbRef.once("value");
                    if (rtdbSnapshot && rtdbSnapshot.exists()) {
                        const rtdbPayload = normalizeRtdbHistoryPayload(rtdbSnapshot.val());
                        return {
                            seasons: rtdbPayload.seasons,
                            updatedAt: rtdbPayload.updatedAt,
                            available: true,
                            loaded: true,
                            exists: true,
                            cloudBackend: "rtdb"
                        };
                    }
                } catch (_err) {
                    // RTDB read failed.
                }
                return null;
            };

            if (readSourceMode === "firestore" && !firestoreApi) {
                return {
                    seasons: [],
                    updatedAt: null,
                    available: false,
                    loaded: false,
                    exists: false,
                    cloudBackend: "firestore",
                    readSourceMode
                };
            }

            if (readSourceMode === "rtdb" && !rtdbApi) {
                return {
                    seasons: [],
                    updatedAt: null,
                    available: false,
                    loaded: false,
                    exists: false,
                    cloudBackend: "rtdb",
                    readSourceMode
                };
            }

            const readOrder = readSourceMode === "firestore"
                ? [readFromFirestore]
                : readSourceMode === "rtdb"
                    ? [readFromRtdb]
                    : [readFromFirestore, readFromRtdb];

            for (const reader of readOrder) {
                const payload = await reader();
                if (payload) {
                    return {
                        ...payload,
                        readSourceMode
                    };
                }
            }

            return {
                seasons: [],
                updatedAt: null,
                available: true,
                loaded: true,
                exists: false,
                cloudBackend: readSourceMode === "auto" ? "" : readSourceMode,
                readSourceMode
            };
        })();

        historyCloudReadRequestByUid.set(uid, readRequest);

        try {
            const cloudPayload = await readRequest;
            setCachedCloudHistory(uid, cloudPayload);
            return cloneCloudHistoryPayload(cloudPayload);
        } finally {
            historyCloudReadRequestByUid.delete(uid);
        }
    }

    function isFirestoreResourceExhausted(error) {
        const code = String(error && error.code || "").toLowerCase();
        const message = String(error && error.message || error || "").toLowerCase();
        return code.includes("resource-exhausted") || message.includes("resource-exhausted") || message.includes("maximum allowed queued writes");
    }

    async function performCloudHistoryWrite(uid, firestoreApi, seasons) {
        const payload = {
            seasons: compactSeasonListForCloudStorage(seasons),
            updatedAt: new Date().toISOString()
        };
        const payloadFingerprint = getHistorySeasonsFingerprint(payload.seasons);
        const lastFingerprint = historyCloudLastWriteFingerprintByUid.get(uid);
        if (lastFingerprint && lastFingerprint === payloadFingerprint) {
            return { ...payload, skipped: true, reason: "unchanged" };
        }

        const firestoreDocRef = getCloudHistoryFirestoreDoc(firestoreApi, uid);
        if (!firestoreDocRef) {
            throw new Error("Firestore cloud history is unavailable.");
        }

        await writeCloudHistorySeasonDocs(firestoreApi, uid, payload.seasons);
        // Anything read while this write was running is already out of date.
        cloudSeasonDocsByUid.delete(uid);

        const metadata = {
            updatedAt: payload.updatedAt,
            seasonCount: payload.seasons.length,
            storageMode: "season-docs",
            migratedFrom: "rtdb"
        };
        const deleteFieldValue = getFirestoreDeleteFieldValue();
        if (deleteFieldValue) metadata.seasons = deleteFieldValue;
        await firestoreDocRef.set(metadata, { merge: true });

        historyCloudLastWriteFingerprintByUid.set(uid, payloadFingerprint);
        setCachedCloudHistory(uid, {
            seasons: payload.seasons.map((season) => hydrateSeasonFromCloudStorage(season)).filter(Boolean),
            updatedAt: payload.updatedAt,
            available: true,
            loaded: true,
            exists: true,
            cloudBackend: "firestore"
        });
        return { ...payload, cloudBackend: "firestore" };
    }

    async function writeCloudHistory(seasons) {
        await waitForAuthResolution();
        const firestoreApi = getFirebaseFirestore();
        const uid = getCurrentUid();
        const compactSeasons = compactSeasonListForCloudStorage(seasons);
        const fallbackPayload = { seasons: compactSeasons, updatedAt: new Date().toISOString() };

        if (!uid || !firestoreApi) {
            const error = new Error(!uid
                ? "Cloud history requires a signed-in account."
                : "Firestore cloud history is unavailable.");
            error.historySyncReason = !uid ? "not-signed-in" : "cloud-unavailable";
            throw error;
        }

        let state = historyCloudWriteStateByUid.get(uid);
        if (!state) {
            state = { inFlight: null, pendingSeasons: null, cooldownUntil: 0 };
            historyCloudWriteStateByUid.set(uid, state);
        }
        if (state.cooldownUntil > Date.now()) {
            const error = new Error("Cloud history is cooling down after reaching its write limit. Please try again later.");
            error.code = "resource-exhausted";
            error.historySyncReason = "resource-exhausted";
            throw error;
        }
        state.pendingSeasons = compactSeasons;
        if (!state.inFlight) {
            state.inFlight = (async () => {
                let result = fallbackPayload;
                try {
                    while (state.pendingSeasons) {
                        const nextSeasons = state.pendingSeasons;
                        state.pendingSeasons = null;
                        result = await performCloudHistoryWrite(uid, firestoreApi, nextSeasons);
                    }
                    return result;
                } catch (error) {
                    state.pendingSeasons = null;
                    if (isFirestoreResourceExhausted(error)) {
                        state.cooldownUntil = Date.now() + HISTORY_CLOUD_WRITE_COOLDOWN_MS;
                        error.historySyncReason = "resource-exhausted";
                    }
                    throw error;
                } finally {
                    state.inFlight = null;
                }
            })();
        }
        return state.inFlight;
    }

    async function readCloudHistoryForWrite() {
        await waitForAuthResolution();

        const uid = getCurrentUid();
        const firestoreApi = getFirebaseFirestore();
        const rtdbApi = getFirebaseDb();
        const firestoreDocRef = getCloudHistoryFirestoreDoc(firestoreApi, uid);
        if (!uid || !firestoreDocRef) {
            // No cloud access right now: let callers fall back to a local-only write
            // instead of failing the whole operation (reorder/rename/delete, etc).
            return {
                seasons: [],
                available: false,
                loaded: false,
                exists: false,
                cloudBackend: ""
            };
        }

        const [firestoreSnapshot, seasonDocs] = await Promise.all([
            firestoreDocRef.get(),
            readCloudHistorySeasonDocs(firestoreApi, uid)
        ]);

        const firestorePayload = firestoreSnapshot && firestoreSnapshot.exists
            ? firestoreSnapshot.data() || {}
            : {};
        const legacyFirestoreSeasons = Array.isArray(firestorePayload.seasons)
            ? firestorePayload.seasons.map((season) => hydrateSeasonFromCloudStorage(season)).filter(Boolean)
            : [];
        const firestoreSeasons = seasonDocs && seasonDocs.length ? seasonDocs : legacyFirestoreSeasons;
        let legacyRtdbSeasons = [];

        // Only access RTDB while migrating a user with no Firestore history at all.
        if (!firestoreSeasons.length && (!firestoreSnapshot || !firestoreSnapshot.exists)) {
            const rtdbRef = getCloudHistoryRtdbRef(rtdbApi, uid);
            if (rtdbRef) {
                const rtdbSnapshot = await rtdbRef.once("value");
                if (rtdbSnapshot && rtdbSnapshot.exists()) {
                    legacyRtdbSeasons = normalizeRtdbHistoryPayload(rtdbSnapshot.val()).seasons;
                }
            }
        }

        // Do not leave a write-only source in the display read cache.
        if (uid) {
            historyCloudReadCacheByUid.delete(uid);
            historyCloudReadRequestByUid.delete(uid);
        }

        return {
            seasons: mergeSeasonLists(legacyRtdbSeasons, firestoreSeasons),
            available: true,
            loaded: true,
            exists: !!(firestoreSnapshot && firestoreSnapshot.exists) || firestoreSeasons.length > 0 || legacyRtdbSeasons.length > 0,
            cloudBackend: (firestoreSnapshot && firestoreSnapshot.exists) || firestoreSeasons.length > 0 ? "firestore" : "rtdb"
        };
    }

    async function readHistoryCollectionsForWrite() {
        await assertHistoryAccess();

        const localSeasons = readLocalHistoryCache();
        const cloud = await readCloudHistoryForWrite();

        return {
            localSeasons,
            cloudSeasons: cloud.seasons,
            cloudAvailable: cloud.available,
            cloudLoaded: cloud.loaded,
            cloudExists: cloud.exists,
            cloudBackend: cloud.cloudBackend
        };
    }

    async function upsertSeasonToCloud(record) {
        await waitForAuthResolution();
        const firestoreApi = getFirebaseFirestore();
        const rtdbApi = getFirebaseDb();
        const uid = getCurrentUid();
        if (!firestoreApi || !uid || !record || typeof record !== "object") {
            const errorReason = !navigator.onLine
                ? "offline"
                : !uid
                    ? "not-signed-in"
                    : "cloud-unavailable";
            return {
                saved: false,
                reason: errorReason,
                specificError: errorReason === "offline"
                    ? "No internet connection"
                    : errorReason === "not-signed-in"
                        ? "Not signed in to cloud"
                        : "Cloud services unavailable"
            };
        }

        const nextRecord = compactSeasonForCloudStorage(record);
        const collections = await readHistoryCollectionsForWrite();
        if (!collections.cloudAvailable || !collections.cloudLoaded) {
            return {
                saved: false,
                reason: !navigator.onLine ? "offline" : "cloud-unavailable",
                specificError: !navigator.onLine
                    ? "No internet connection available"
                    : "Cloud history service is not responding"
            };
        }

        const nextCloudSeasons = mergeSeasonLists(collections.cloudSeasons, [nextRecord]);
        if (getHistorySeasonsFingerprint(nextCloudSeasons) === getHistorySeasonsFingerprint(collections.cloudSeasons)) {
            return { saved: true, skipped: true, cloudBackend: collections.cloudBackend || "" };
        }

        const writeResult = await writeCloudHistory(nextCloudSeasons);
        return {
            saved: true,
            skipped: !!(writeResult && writeResult.skipped),
            cloudBackend: writeResult && writeResult.cloudBackend
                ? writeResult.cloudBackend
                : (collections.cloudBackend || "")
        };
    }

    async function backfillLocalHistoryToCloud() {
        if (historyCloudBackfillInFlight) return;
        historyCloudBackfillInFlight = true;
        try {
            const collections = await readHistoryCollectionsForWrite();
            if (!collections.cloudAvailable || !collections.cloudLoaded) {
                return;
            }

            const localSeasons = compactSeasonListForStorage(collections.localSeasons);
            const cloudSeasons = compactSeasonListForStorage(collections.cloudSeasons);
            const mergedCloud = mergeSeasonLists(cloudSeasons, localSeasons);

            if (getHistorySeasonsFingerprint(mergedCloud) !== getHistorySeasonsFingerprint(cloudSeasons)) {
                await writeCloudHistory(mergedCloud);
            }
        } catch (_err) {
            // Silent retry on next trigger.
        } finally {
            historyCloudBackfillInFlight = false;
        }
    }

    function bindHistoryCloudAuthWatcher() {
        if (historyCloudAuthWatcherBound) return;

        try {
            const firebaseApi = ensureFirebaseReady();
            if (!firebaseApi || !firebaseApi.auth) {
                return;
            }

            const auth = firebaseApi.auth();
            if (!auth || typeof auth.onAuthStateChanged !== "function") {
                return;
            }

            historyCloudAuthWatcherBound = true;
            auth.onAuthStateChanged((user) => {
                authReadyPromise = Promise.resolve(user || null);
                historyCloudTierCache = null;
                historyCloudReadRequestByUid.clear();
                historyCloudReadCacheByUid.clear();
                if (user && user.uid) {
                    void backfillLocalHistoryToCloud();
                }
            });
        } catch (_err) {
            // Keep running without auth watcher.
        }
    }

    async function readHistoryCollections(options = {}) {
        await assertHistoryAccess();

        const localSeasons = readLocalHistoryCache();
        const cloud = await readCloudHistory(options);

        return {
            localSeasons,
            cloudSeasons: Array.isArray(cloud.seasons) ? cloud.seasons : [],
            cloudAvailable: !!cloud.available,
            cloudLoaded: !!cloud.loaded,
            cloudExists: !!cloud.exists,
            updatedAt: cloud.updatedAt || null,
            cloudBackend: cloud.cloudBackend || "",
            readSourceMode: normalizeCloudHistoryReadSource(cloud.readSourceMode)
        };
    }

    async function readMergedHistory(options = {}) {
        try {
            const collections = await readHistoryCollections(options);
            const mergedSeasons = buildMergedHistory(
                collections.localSeasons,
                collections.cloudLoaded ? collections.cloudSeasons : [],
                collections.cloudBackend
            );

            const mergedState = {
                ...collections,
                seasons: mergedSeasons,
                usingLocalFallback: collections.cloudAvailable && !collections.cloudLoaded
            };

            syncCastBuilderHistoryCache(mergedState);
            return mergedState;
        } catch (err) {
            if (!(err && err.code === "history-access-blocked")) {
                throw err;
            }

            // Mobile/auth race fallback: if cloud access cannot be verified,
            // still render any local history instead of failing the page.
            const localSeasons = readLocalHistoryCache();
            const mergedState = {
                localSeasons,
                cloudSeasons: [],
                cloudAvailable: false,
                cloudLoaded: false,
                cloudExists: false,
                updatedAt: null,
                cloudBackend: "",
                seasons: cloneHistorySeasons(localSeasons).map((season) => cloneHistorySeason(season, { local: true, cloud: false })),
                usingLocalFallback: true,
                accessBlocked: true,
                accessBlockedReason: err && err.message ? String(err.message) : "History access could not be verified."
            };

            syncCastBuilderHistoryCache(mergedState);
            return mergedState;
        }
    }

    async function withHistoryCollections(mutator) {
        const collections = await readHistoryCollectionsForWrite();
        const cloudReadyForWrite = collections.cloudAvailable && collections.cloudLoaded;
        const originalCloudFingerprint = getHistorySeasonsFingerprint(collections.cloudSeasons);

        const next = await mutator({
            localSeasons: cloneHistorySeasons(collections.localSeasons),
            cloudSeasons: cloneHistorySeasons(collections.cloudSeasons),
            cloudAvailable: cloudReadyForWrite
        });

        const resolvedLocalSeasons = next && Array.isArray(next.localSeasons)
            ? next.localSeasons
            : collections.localSeasons;
        const resolvedCloudSeasons = next && Array.isArray(next.cloudSeasons)
            ? next.cloudSeasons
            : collections.cloudSeasons;

        writeLocalHistoryCache(resolvedLocalSeasons);

        if (cloudReadyForWrite && getHistorySeasonsFingerprint(resolvedCloudSeasons) !== originalCloudFingerprint) {
            await writeCloudHistory(resolvedCloudSeasons);
        }

        return {
            localSeasons: resolvedLocalSeasons,
            cloudSeasons: resolvedCloudSeasons,
            cloudAvailable: collections.cloudAvailable
        };
    }

    function toast(message, isError = false) {
        if (typeof window.showCloudNote === "function") {
            window.showCloudNote(message, isError);
            return;
        }
        if (isError) {
            if (typeof window.showInHouseAlert === "function") {
                void window.showInHouseAlert(message, "History Notice");
            } else {
                alert(message);
            }
        }
    }

    function canShowAdminHistoryDebug() {
        try {
            if (typeof window.getIsStaff === "function" && window.getIsStaff()) {
                return true;
            }

            const firebaseApi = ensureFirebaseReady();
            const user = firebaseApi && firebaseApi.auth && firebaseApi.auth().currentUser;
            if (user && user.email && typeof window.isOwnerEmail === "function" && window.isOwnerEmail(user.email)) {
                return true;
            }
        } catch (_err) {
            return false;
        }

        return false;
    }

    function getAdminHistoryDebugChip() {
        const chipId = "ssAdminHistoryDebugChip";
        const existing = document.getElementById(chipId);
        if (existing) {
            return existing;
        }

        if (!document.body) {
            return null;
        }

        const chip = document.createElement("div");
        chip.id = chipId;
        chip.style.position = "fixed";
        chip.style.right = "10px";
        chip.style.bottom = "10px";
        chip.style.zIndex = "2147483000";
        chip.style.maxWidth = "min(92vw, 460px)";
        chip.style.padding = "8px 10px";
        chip.style.borderRadius = "10px";
        chip.style.border = "1px solid rgba(61, 10, 31, 0.25)";
        chip.style.background = "rgba(255, 245, 250, 0.95)";
        chip.style.backdropFilter = "blur(3px)";
        chip.style.fontSize = "11px";
        chip.style.lineHeight = "1.35";
        chip.style.color = "#3d0a1f";
        chip.style.boxShadow = "0 10px 24px rgba(31, 6, 17, 0.18)";
        chip.style.pointerEvents = "none";

        document.body.appendChild(chip);
        return chip;
    }

    function updateAdminHistoryDebugChip(historyState) {
        const existingChip = document.getElementById("ssAdminHistoryDebugChip");
        if (!canShowAdminHistoryDebug()) {
            if (existingChip) existingChip.remove();
            return;
        }

        const chip = existingChip || getAdminHistoryDebugChip();
        if (!chip) return;

        const seasons = historyState && Array.isArray(historyState.seasons) ? historyState.seasons : [];
        const cloudTaggedCount = seasons.filter((season) => season && season.historyStorage && season.historyStorage.cloud).length;
        const firestoreCount = seasons.filter((season) => season && season.historyStorage && season.historyStorage.cloudBackend === "firestore").length;
        const rtdbCount = seasons.filter((season) => season && season.historyStorage && season.historyStorage.cloudBackend === "rtdb").length;
        const backendLabel = historyState && historyState.cloudBackend
            ? historyState.cloudBackend.toUpperCase()
            : "UNKNOWN";

        chip.innerHTML = '<b>ADMIN DEBUG</b> · History backend '
            + backendLabel
            + '<br>seasons=' + seasons.length
            + ' cloudTagged=' + cloudTaggedCount
            + ' firestore=' + firestoreCount
            + ' rtdb=' + rtdbCount
            + '<br>available=' + (!!(historyState && historyState.cloudAvailable))
            + ' loaded=' + (!!(historyState && historyState.cloudLoaded))
            + ' exists=' + (!!(historyState && historyState.cloudExists))
            + ' fallback=' + (!!(historyState && historyState.usingLocalFallback));
    }

    function stripHistoryStorage(season) {
        const cleanSeason = cloneHistorySeason(season);
        if (cleanSeason && typeof cleanSeason === "object") {
            delete cleanSeason.historyStorage;
        }
        return cleanSeason;
    }

    async function refreshSeasonHistoryFromCloud(showNotice = true, options = {}) {
        try {
            const historyState = await readMergedHistory(options);
            const mainBlock = document.getElementById("MainBlock");
            const updatedSeasonList = mainBlock && typeof mainBlock.__updateHistorySeasonList === "function"
                ? mainBlock.__updateHistorySeasonList(historyState)
                : false;

            if (!updatedSeasonList && typeof window.viewSeasonHistory === "function") {
                await window.viewSeasonHistory(historyState);
            }

            if (showNotice) {
                if (historyState.cloudAvailable && !historyState.usingLocalFallback) {
                    toast("Season history refreshed from the cloud.");
                } else {
                    toast("Cloud history is unavailable right now. Showing local history only.", true);
                }
            }

            return historyState;
        } catch (err) {
            if (showNotice) {
                toast(err && err.message ? err.message : "Could not refresh history from the cloud.", true);
            }
            throw err;
        }
    }

    function renderHistoryStorageBadges(season) {
        const storage = season && season.historyStorage ? season.historyStorage : {};
        const backendLabel = storage.cloudBackend === "firestore"
            ? "Firestore"
            : (storage.cloudBackend === "rtdb" ? "Realtime DB" : "");
        const syncLabel = storage.local && storage.cloud
            ? "Sync: Local + Cloud"
            : (storage.cloud ? "Sync: Cloud only" : "Sync: Local only");
        const adminDebug = canShowAdminHistoryDebug();

        return '<div class="history-card-storage">'
            + '<span class="history-storage-pill is-local' + (storage.local ? ' active' : '') + '"><i class="fa-solid fa-hard-drive"></i> Local</span>'
            + '<span class="history-storage-pill is-cloud' + (storage.cloud ? ' active' : '') + '"><i class="fa-solid fa-cloud"></i> Cloud</span>'
            + (storage.cloud && backendLabel
                ? ('<span class="history-storage-pill is-cloud active"><i class="fa-solid fa-database"></i> ' + backendLabel + '</span>')
                : '')
            + (adminDebug
                ? ('<span class="history-storage-pill is-local active"><i class="fa-solid fa-user-shield"></i> ' + syncLabel + '</span>')
                : '')
            + (adminDebug && storage.cloud
                ? ('<span class="history-storage-pill is-cloud active"><i class="fa-solid fa-code-branch"></i> Backend key: ' + (storage.cloudBackend || 'unknown') + '</span>')
                : '')
            + '</div>';
    }

    async function exportHistoryData() {
        const historyState = await readMergedHistory();
        const seasons = Array.isArray(historyState.seasons)
            ? historyState.seasons.map((season) => stripHistoryStorage(season))
            : [];

        if (seasons.length === 0) {
            toast("No history to export.", true);
            return;
        }

        const exportPayload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            seasons
        };

        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const dateStamp = new Date().toISOString().slice(0, 10);

        link.href = downloadUrl;
        link.download = `season-history-${dateStamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        toast(`Exported ${seasons.length} season${seasons.length === 1 ? "" : "s"}.`);
    }

    async function importHistoryFile(file) {
        if (!file) return false;

        let parsed;
        try {
            parsed = JSON.parse(await file.text());
        } catch (_err) {
            toast("Could not read history import file.", true);
            return false;
        }

        const importedSeasons = normalizeImportedHistorySeasons(
            Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.seasons) ? parsed.seasons : []
        );

        if (importedSeasons.length === 0) {
            toast("Import file has no seasons.", true);
            return false;
        }

        const shouldImport = await window.showInHouseConfirm(
            `Import ${importedSeasons.length} season${importedSeasons.length === 1 ? "" : "s"}? Matching seasons will be replaced.`,
            "Import History"
        );
        if (!shouldImport) {
            return false;
        }

        let importedToCloud = false;
        try {
            const result = await withHistoryCollections(async ({ localSeasons, cloudSeasons, cloudAvailable }) => ({
                localSeasons: mergeSeasonLists(localSeasons, importedSeasons),
                cloudSeasons: cloudAvailable ? mergeSeasonLists(cloudSeasons, importedSeasons) : cloudSeasons
            }));

            importedToCloud = !!result.cloudAvailable;
            toast(importedToCloud
                ? `Imported ${importedSeasons.length} season${importedSeasons.length === 1 ? "" : "s"} to local and cloud.`
                : `Imported ${importedSeasons.length} season${importedSeasons.length === 1 ? "" : "s"} locally.`);

            return true;
        } catch (err) {
            toast(err && err.message ? err.message : "Could not import history.", true);
            return false;
        }
    }

    function formatHistoryBytes(bytes) {
        const value = Number(bytes);
        if (!Number.isFinite(value) || value <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        let size = value;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        const precision = unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
        return `${size.toFixed(precision)} ${units[unitIndex]}`;
    }

    function estimateHistoryLocalCacheBytes() {
        const keys = ["seasonHistoryFranchises", "seasonHistory", LOCAL_KEY];
        const seen = new Set();
        let total = 0;
        keys.forEach((key) => {
            if (!key || seen.has(key)) return;
            seen.add(key);
            const raw = localStorage.getItem(key);
            if (typeof raw !== "string") return;
            total += new Blob([raw]).size;
        });
        return total;
    }

    function renderHistoryCloudPanel(historyState) {
        const block = document.getElementById("MainBlock");
        if (!block) return;

        const existing = document.getElementById("historyCloudPanel");

        const panel = document.createElement("div");
        panel.id = "historyCloudPanel";
        panel.className = "history-storage-panel";

        const summary = document.createElement("div");
        summary.className = "history-storage-summary";

        const statusText = historyState && historyState.usingLocalFallback
            ? "Cloud is unavailable. Showing local history only."
            : historyState && historyState.cloudAvailable
                ? "Cloud sync available."
                : "Cloud sync unavailable. Using local history.";

        const mergedSeasons = historyState && Array.isArray(historyState.seasons)
            ? historyState.seasons.length
            : 0;
        const localCacheBytes = estimateHistoryLocalCacheBytes();
        const sizeText = `History size: ${mergedSeasons} season${mergedSeasons === 1 ? "" : "s"} • ${formatHistoryBytes(localCacheBytes)} local cache`;
        const cloudBackendLabel = historyState && historyState.cloudBackend === "firestore"
            ? "Firestore"
            : (historyState && historyState.cloudBackend === "rtdb" ? "Realtime DB" : "");
        const readSourceMode = normalizeCloudHistoryReadSource(historyState && historyState.readSourceMode);
        const readSourceLabel = readSourceMode === "firestore"
            ? "Firestore only"
            : (readSourceMode === "rtdb" ? "Realtime DB only" : "Auto (Firestore -> RTDB)");
        const adminDebug = canShowAdminHistoryDebug();
        const seasons = historyState && Array.isArray(historyState.seasons) ? historyState.seasons : [];
        const cloudTaggedCount = seasons.filter((season) => season && season.historyStorage && season.historyStorage.cloud).length;
        const firestoreTaggedCount = seasons.filter((season) => season && season.historyStorage && season.historyStorage.cloudBackend === "firestore").length;
        const rtdbTaggedCount = seasons.filter((season) => season && season.historyStorage && season.historyStorage.cloudBackend === "rtdb").length;

        summary.innerHTML = '<span class="history-storage-pill is-local active"><i class="fa-solid fa-hard-drive"></i> Local ' + ((historyState && historyState.localSeasons && historyState.localSeasons.length) || 0) + '</span>'
            + '<span class="history-storage-pill is-cloud' + (historyState && historyState.cloudAvailable ? ' active' : '') + '"><i class="fa-solid fa-cloud"></i> '
            + (historyState && historyState.cloudAvailable ? ('Cloud ' + ((historyState.cloudSeasons && historyState.cloudSeasons.length) || 0)) : 'Cloud Off')
            + '</span>';

        const notes = document.createElement("div");
        notes.className = "history-storage-notes";
        notes.innerHTML = '<span class="history-storage-note">' + statusText + '</span>'
            + '<span class="history-storage-note">Cloud read mode: ' + readSourceLabel + '</span>'
            + (cloudBackendLabel ? ('<span class="history-storage-note">Cloud read source: ' + cloudBackendLabel + '</span>') : '')
            + (adminDebug
                ? ('<span class="history-storage-note">Admin debug: available=' + (!!(historyState && historyState.cloudAvailable))
                    + ' loaded=' + (!!(historyState && historyState.cloudLoaded))
                    + ' exists=' + (!!(historyState && historyState.cloudExists))
                    + ' fallback=' + (!!(historyState && historyState.usingLocalFallback))
                    + '</span>')
                : '')
            + (adminDebug
                ? ('<span class="history-storage-note">Admin debug: cloud-tagged=' + cloudTaggedCount
                    + ' firestore=' + firestoreTaggedCount
                    + ' rtdb=' + rtdbTaggedCount
                    + '</span>')
                : '')
            + '<span class="history-storage-note">' + sizeText + '</span>';

        const actions = document.createElement("div");
        actions.className = "history-storage-actions";

        const readSourceSelect = document.createElement("select");
        readSourceSelect.className = "history-season-sort-select";
        readSourceSelect.title = "Choose cloud history read source";
        readSourceSelect.setAttribute("aria-label", "Choose cloud history read source");
        readSourceSelect.innerHTML = ''
            + '<option value="auto">Read: Auto</option>'
            + '<option value="firestore">Read: Firestore</option>'
            + '<option value="rtdb">Read: Realtime DB</option>';
        readSourceSelect.value = readSourceMode;
        readSourceSelect.onchange = async function onReadSourceChange() {
            const selectedSource = setCloudHistoryReadSourcePreference(readSourceSelect.value);
            readSourceSelect.value = selectedSource;
            readSourceSelect.disabled = true;
            try {
                await refreshSeasonHistoryFromCloud(true, {
                    forceCloudRead: true,
                    readSource: selectedSource
                });
            } finally {
                readSourceSelect.disabled = false;
            }
        };

        const refreshBtn = document.createElement("button");
        refreshBtn.type = "button";
        refreshBtn.className = "history-storage-icon-btn";
        refreshBtn.title = "Refresh Seasons & Franchises";
        refreshBtn.setAttribute("aria-label", "Refresh Seasons & Franchises");
        refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh';
        refreshBtn.onclick = async function onRefreshHistoryClick() {
            const defaultMarkup = '<i class="fa-solid fa-rotate-right"></i> Refresh';
            if (refreshBtn.disabled) return;

            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Refreshing';

            try {
                await refreshSeasonHistoryFromCloud(true, { forceCloudRead: true });
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = defaultMarkup;
            }
        };

        const exportBtn = document.createElement("button");
        exportBtn.type = "button";
        exportBtn.className = "history-storage-icon-btn";
        exportBtn.title = "Export history";
        exportBtn.setAttribute("aria-label", "Export history");
        exportBtn.innerHTML = '<i class="fa-solid fa-file-export"></i> Export history';
        exportBtn.onclick = function onExportHistoryClick() {
            exportHistoryData();
        };

        const importBtn = document.createElement("button");
        importBtn.type = "button";
        importBtn.className = "history-storage-icon-btn";
        importBtn.title = "Import history";
        importBtn.setAttribute("aria-label", "Import history");
        importBtn.innerHTML = '<i class="fa-solid fa-file-import"></i> Import history';

        const importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = ".json,application/json";
        importInput.className = "history-storage-file-input";
        importInput.setAttribute("aria-hidden", "true");
        importInput.tabIndex = -1;
        importInput.onchange = async function onHistoryImportChange() {
            const imported = await importHistoryFile(importInput.files && importInput.files[0]);
            importInput.value = "";
            if (imported) {
                await window.viewSeasonHistory();
            }
        };

        importBtn.onclick = function onImportHistoryClick() {
            importInput.click();
        };

        const importSeasonBtn = document.createElement("button");
        importSeasonBtn.type = "button";
        importSeasonBtn.className = "history-storage-icon-btn";
        importSeasonBtn.title = "Import season backup";
        importSeasonBtn.setAttribute("aria-label", "Import season backup");
        importSeasonBtn.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i> Import season backup';
        importSeasonBtn.onclick = function onImportSeasonBackupClick() {
            if (typeof window.importSeasonBackup === "function") {
                window.importSeasonBackup();
            }
        };

        const deleteAllBtn = document.createElement("button");
        deleteAllBtn.type = "button";
        deleteAllBtn.className = "history-storage-icon-btn danger";
        deleteAllBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete history';
        deleteAllBtn.onclick = function onDeleteHistoryClick() {
            if (typeof window.clearAllHistory === "function") {
                window.clearAllHistory();
            }
        };

        actions.appendChild(refreshBtn);
        actions.appendChild(exportBtn);
        actions.appendChild(importBtn);
        actions.appendChild(importSeasonBtn);
        actions.appendChild(deleteAllBtn);
        actions.appendChild(importInput);

        const manage = document.createElement("details");
        manage.className = "history-manage";
        const manageToggle = document.createElement("summary");
        manageToggle.innerHTML = '<i class="fa-solid fa-sliders" aria-hidden="true"></i> Manage';
        const manageMenu = document.createElement("div");
        manageMenu.className = "history-manage-menu";
        manageMenu.appendChild(notes);
        manageMenu.appendChild(readSourceSelect);
        manageMenu.appendChild(actions);
        manage.appendChild(manageToggle);
        manage.appendChild(manageMenu);

        panel.appendChild(summary);
        panel.appendChild(manage);

        if (existing) {
            existing.replaceWith(panel);
        } else {
            block.appendChild(panel);
        }
    }

    function escapeHistoryText(value) {
        if (typeof window.escapeSharedDisplayText === "function") {
            return window.escapeSharedDisplayText(value);
        }
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizeHistoryNameKey(value) {
        if (typeof window.normalizeHistoryName === "function") {
            return window.normalizeHistoryName(value);
        }
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }

    function safeHistoryMetric(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return "0.00";
        if (typeof window.formatHistoryMetricValue === "function") {
            return window.formatHistoryMetricValue(numeric);
        }
        return numeric.toFixed(2);
    }

    function formatHistoryOrdinal(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return "-";
        }

        const compact = String(Math.floor(Math.abs(numeric)));
        if (compact.length > 1 && compact.length <= 4 && /^[2-5]+$/.test(compact) && new Set(compact.split("")).size > 1) {
            return compact.split("").map((digit) => formatHistoryOrdinal(digit)).join("/");
        }

        const absoluteValue = Math.floor(Math.abs(numeric));
        const lastTwoDigits = absoluteValue % 100;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
            return absoluteValue + "th";
        }

        switch (absoluteValue % 10) {
            case 1: return absoluteValue + "st";
            case 2: return absoluteValue + "nd";
            case 3: return absoluteValue + "rd";
            default: return absoluteValue + "th";
        }
    }

    function countTrackMetric(trackRecord, keywords = []) {
        if (!Array.isArray(trackRecord) || !Array.isArray(keywords) || keywords.length === 0) {
            return 0;
        }
        return trackRecord.reduce((count, placement) => {
            const normalized = String(placement || "").toUpperCase();
            return keywords.some(keyword => normalized.includes(keyword)) ? count + 1 : count;
        }, 0);
    }

    function countHistoryWinsSafe(entry) {
        if (typeof window.countHistoryWins === "function") {
            return window.countHistoryWins(entry && entry.trackRecord);
        }
        return countTrackMetric(entry && entry.trackRecord, ["WIN"]);
    }

    function countHistoryTopsSafe(entry) {
        if (typeof window.countHistoryTopPlacements === "function") {
            return window.countHistoryTopPlacements(entry && entry.trackRecord);
        }
        return countTrackMetric(entry && entry.trackRecord, ["HIGH", "TOP", "WIN"]);
    }

    function countHistoryBottomsSafe(entry) {
        if (typeof window.countHistoryBottomTwos === "function") {
            return window.countHistoryBottomTwos(entry && entry.trackRecord);
        }
        return countTrackMetric(entry && entry.trackRecord, ["BTM", "LOW", "ELIM"]);
    }

    function countHistoryLipSyncsSafe(entry, season) {
        if (typeof window.countHistoryLipsyncAppearances === "function") {
            return window.countHistoryLipsyncAppearances({
                ...(entry || {}),
                alots: Array.isArray(season && season.alots) ? season.alots : []
            });
        }
        if (Array.isArray(entry && entry.lipsyncHistory)) {
            return entry.lipsyncHistory.length;
        }
        return countTrackMetric(entry && entry.trackRecord, ["BTM"]);
    }

    function resolveHistoryEpisodeLabel(challenge, index) {
        const text = normalizeHistoryChallengeEntry(challenge);
        if (!text) return "Ep " + (index + 1);
        const compact = text.replace(/\s+/g, " ");
        return compact.length > 32 ? (compact.slice(0, 29) + "...") : compact;
    }

    function normalizeHistoryChallengeEntry(challenge) {
        if (challenge === null || challenge === undefined) {
            return "";
        }

        if (typeof challenge === "string" || typeof challenge === "number" || typeof challenge === "boolean") {
            return String(challenge).trim();
        }

        if (Array.isArray(challenge)) {
            return challenge.map((entry) => normalizeHistoryChallengeEntry(entry)).filter(Boolean).join("<nl>");
        }

        if (typeof challenge === "object") {
            const candidateFields = [challenge.label, challenge.title, challenge.name, challenge.challenge, challenge.episode, challenge.text];
            for (const candidate of candidateFields) {
                const normalized = String(candidate || "").trim();
                if (normalized) {
                    return normalized;
                }
            }
        }

        return String(challenge).trim();
    }

    function normalizeHistoryChallengeList(season) {
        if (Array.isArray(season && season.challenges)) {
            return season.challenges.map((entry) => normalizeHistoryChallengeEntry(entry)).filter(Boolean);
        }

        if (Array.isArray(season && season.episodeChallenges)) {
            return season.episodeChallenges.map((entry) => normalizeHistoryChallengeEntry(entry)).filter(Boolean);
        }

        if (Array.isArray(season && season.episodeList)) {
            return season.episodeList.map((entry) => normalizeHistoryChallengeEntry(entry)).filter(Boolean);
        }

        if (Array.isArray(season && season.episodes)) {
            return season.episodes.map((entry) => normalizeHistoryChallengeEntry(entry)).filter(Boolean);
        }

        return [];
    }

    function resolveHistoryDisplayRank(entry, fallback = "-") {
        const numeric = resolveHistoryRankSafe(entry && entry.rankP, 999);
        if (numeric < 900) {
            return String(numeric);
        }

        const trackRecord = Array.isArray(entry && entry.trackRecord) ? entry.trackRecord : [];
        if (trackRecord.some((value) => isHistoryCrownPlacement(value))) {
            return "1";
        }

        return fallback;
    }

    function isHistoryCrownPlacement(value) {
        const normalized = String(value || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();
        if (!normalized) return false;
        if (/LIP\s*SYNC|\bLS\b|SMACKDOWN|ROUND|ASSASSIN/.test(normalized)) return false;
        return normalized === "WINNER";
    }

    function compareHistoryCastForTrackRecord(a, b) {
        const rankA = resolveHistoryRankSafe(a && a.rankP, 999);
        const rankB = resolveHistoryRankSafe(b && b.rankP, 999);
        if (rankA !== rankB) return rankA - rankB;

        const winsA = countHistoryWinsSafe(a);
        const winsB = countHistoryWinsSafe(b);
        if (winsA !== winsB) return winsB - winsA;

        return String(a && a.name || "").localeCompare(String(b && b.name || ""));
    }

    function buildHistoryTrackRecordTableFromData(season) {
        if (!canBuildHistoryTrackRecordFromData(season)) {
            return null;
        }

        const cast = Array.isArray(season.cast) ? season.cast.slice().sort(compareHistoryCastForTrackRecord) : [];
        if (cast.length === 0) {
            return null;
        }

        const challengeList = normalizeHistoryChallengeList(season);
        const maxTrackLength = cast.reduce((max, entry) => {
            const len = Array.isArray(entry && entry.trackRecord) ? entry.trackRecord.length : 0;
            return Math.max(max, len);
        }, 0);
        const explicitEpisodes = Number(season && season.episodes);
        const totalEpisodes = Math.max(challengeList.length, maxTrackLength, Number.isFinite(explicitEpisodes) ? explicitEpisodes : 0);
        if (totalEpisodes <= 0) {
            return null;
        }

        const tableWrap = document.createElement("div");
        tableWrap.className = "history-trackrecord-wrap";

        const table = document.createElement("table");
        table.id = "trackRecord";
        table.className = "trtable history-trackrecord-table";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");

        const rankHead = document.createElement("th");
        rankHead.textContent = "Rank";
        const nameHead = document.createElement("th");
        nameHead.textContent = "Contestant";
        headRow.appendChild(rankHead);
        headRow.appendChild(nameHead);

        for (let i = 0; i < totalEpisodes; i += 1) {
            const epHead = document.createElement("th");
            epHead.textContent = resolveHistoryEpisodeLabel(challengeList[i], i);
            headRow.appendChild(epHead);
        }

        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        cast.forEach((entry) => {
            const row = document.createElement("tr");

            const rankCell = document.createElement("td");
            rankCell.textContent = resolveHistoryDisplayRank(entry);
            row.appendChild(rankCell);

            const nameCell = document.createElement("td");
            nameCell.textContent = String(entry && entry.name || "Unknown");
            row.appendChild(nameCell);

            const trackRecord = Array.isArray(entry && entry.trackRecord) ? entry.trackRecord : [];
            for (let i = 0; i < totalEpisodes; i += 1) {
                const cell = document.createElement("td");
                const placement = String(trackRecord[i] || "").trim();
                cell.textContent = placement || "-";
                row.appendChild(cell);
            }

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        return tableWrap;
    }

    const HISTORY_STATS_TAB_ORDER = [
        "Track Records", "Weekly Awards", "Relationship Chart", "Lip Syncs", "FPR", "Money Tracker",
        "Popularity Chart", "Fan Reactions", "Episode Ratings", "Points TR",
        "MVQ Points Track Record", "Summit of Rebirth Stars", "RuMocracy",
        "Lipstick Choices", "Legendary Legend Stars", "Save Twist History",
        "Rate-A-Queen", "Safety Votes", "Coin Flip"
    ];

    const HISTORY_STATS_TAB_ICONS = {
        "Track Records": "fa-solid fa-table-list",
        "Weekly Awards": "fa-solid fa-award",
        "Relationship Chart": "fa-solid fa-heart",
        "Lip Syncs": "fa-solid fa-music",
        "FPR": "fa-solid fa-camera-retro",
        "Money Tracker": "fa-solid fa-dollar-sign",
        "Popularity Chart": "fa-solid fa-chart-line",
        "Fan Reactions": "fa-solid fa-comments",
        "Episode Ratings": "fa-solid fa-star",
        "Points TR": "fa-solid fa-list-check",
        "MVQ Points Track Record": "fa-solid fa-crown",
        "Summit of Rebirth Stars": "fa-solid fa-star",
        "RuMocracy": "fa-solid fa-check-to-slot",
        "Lipstick Choices": "fa-solid fa-wand-magic-sparkles",
        "Legendary Legend Stars": "fa-solid fa-certificate",
        "Save Twist History": "fa-solid fa-shield-heart",
        "Rate-A-Queen": "fa-solid fa-ranking-star",
        "Safety Votes": "fa-solid fa-shield",
        "Coin Flip": "fa-solid fa-coins"
    };

    function getOrderedHistoryStatsLabels(season) {
        const available = season && season.extraStatsHTML && typeof season.extraStatsHTML === "object"
            ? Object.keys(season.extraStatsHTML)
            : [];
        const ordered = HISTORY_STATS_TAB_ORDER.filter((label) => available.includes(label));
        available.forEach((label) => {
            if (!ordered.includes(label)) ordered.push(label);
        });
        return ordered;
    }

    function buildHistoryStatsTabBar(season, idx, activeLabel) {
        const labels = getOrderedHistoryStatsLabels(season);
        if (labels.length <= 1) {
            return null;
        }

        const tabBar = document.createElement("div");
        tabBar.className = "stat-tabs";

        const groups = [
            { label: "Season", tabs: ["Track Records", "Weekly Awards", "Relationship Chart", "Lip Syncs", "FPR", "Money Tracker", "Popularity Chart"] },
            { label: "Audience", tabs: ["Fan Reactions", "Episode Ratings", "Rate-A-Queen"] },
            { label: "Votes & Twists", tabs: ["RuMocracy", "Lipstick Choices", "Save Twist History", "Safety Votes", "Coin Flip"] },
            { label: "Format", tabs: ["Points TR", "MVQ Points Track Record", "Summit of Rebirth Stars", "Legendary Legend Stars"] }
        ];
        const groupedLabels = new Set(groups.flatMap((group) => group.tabs));
        const availableGroups = groups.map((group) => ({
            label: group.label,
            tabs: group.tabs.filter((label) => labels.includes(label))
        }));
        const otherLabels = labels.filter((label) => !groupedLabels.has(label));
        if (otherLabels.length > 0) availableGroups.push({ label: "Other", tabs: otherLabels });

        const appendButton = (label) => {
            const button = document.createElement("button");
            button.type = "button";
            const icon = document.createElement("i");
            icon.className = HISTORY_STATS_TAB_ICONS[label] || "fa-solid fa-chart-simple";
            icon.setAttribute("aria-hidden", "true");
            const text = document.createElement("span");
            text.textContent = label;
            button.append(icon, text);
            button.setAttribute("title", label);
            button.setAttribute("aria-label", label);
            button.setAttribute("aria-current", label === activeLabel ? "page" : "false");
            button.setAttribute("id", "stat");
            button.className = "statistics stat-tab" + (label === activeLabel ? " active" : "");
            button.addEventListener("click", () => window.viewSeasonHistoryStatsTab(idx, label));
            tabBar.appendChild(button);
        };

        availableGroups.filter((group) => group.tabs.length > 0).forEach((group) => {
            if (group.tabs.length === 1) {
                appendButton(group.tabs[0]);
                return;
            }

            const wrapper = document.createElement("label");
            wrapper.className = "stat-tab-group";
            const select = document.createElement("select");
            select.className = "stat-tab-select" + (group.tabs.includes(activeLabel) ? " active" : "");
            select.setAttribute("aria-label", `${group.label} saved statistics`);
            select.setAttribute("title", group.label);
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = group.label;
            placeholder.disabled = true;
            placeholder.selected = !group.tabs.includes(activeLabel);
            select.appendChild(placeholder);
            group.tabs.forEach((label) => {
                const option = document.createElement("option");
                option.value = label;
                option.textContent = label;
                option.selected = label === activeLabel;
                select.appendChild(option);
            });
            select.addEventListener("change", () => {
                if (select.value) window.viewSeasonHistoryStatsTab(idx, select.value);
            });
            wrapper.appendChild(select);
            tabBar.appendChild(wrapper);
        });

        return tabBar;
    }

    function rewireHistoryFanReactionNav(container, onNavigate, disablePrev, disableNext) {
        const navButtons = container.querySelectorAll(".fan-reaction-nav button");
        navButtons.forEach((button) => {
            const isPrev = !!button.querySelector("i.fa-chevron-left");
            button.removeAttribute("onclick");
            if (typeof onNavigate === "function") {
                button.disabled = isPrev ? disablePrev : disableNext;
                if (!button.disabled) {
                    button.addEventListener("click", () => onNavigate(isPrev));
                }
            } else {
                // No historical data to page through, so disable navigation instead of leaking to the live season.
                button.disabled = true;
            }
        });
    }

    function renderHistoryFanReactionsWeek(season, idx, weekIndex) {
        const mainBlock = document.getElementById("MainBlock");
        if (!mainBlock) return false;

        const weeks = Array.isArray(season.fanReactionsWeeklyHTML) ? season.fanReactionsWeeklyHTML : [];
        if (weeks.length === 0) return false;

        const clampedWeek = Math.max(0, Math.min(weekIndex, weeks.length - 1));
        const html = weeks[clampedWeek];
        if (!html) return false;

        mainBlock.innerHTML = "";
        setBackgroundToNormal();

        const titleEl = document.getElementById("MainTitle");
        if (titleEl) titleEl.innerHTML = (season.name || "Season Details") + " \u2014 Fan Reactions";

        const center = document.createElement("center");
        center.innerHTML = html;
        mainBlock.appendChild(center);

        rewireHistoryFanReactionNav(
            center,
            (isPrev) => renderHistoryFanReactionsWeek(season, idx, isPrev ? clampedWeek - 1 : clampedWeek + 1),
            clampedWeek <= 0,
            clampedWeek >= weeks.length - 1
        );

        const tabBar = buildHistoryStatsTabBar(season, idx, "Fan Reactions");
        if (tabBar) mainBlock.appendChild(tabBar);

        insertHistorySeasonRecap(season, idx);
        wireViewerDeleteButton(season);
        return true;
    }

    function rewireHistoryEpisodeRatingsNav(container, onSelect) {
        const items = container.querySelectorAll(".imdb-histogram-item[data-ep-idx]");
        items.forEach((item) => {
            const epIdx = Number(item.getAttribute("data-ep-idx"));
            if (typeof onSelect === "function" && Number.isFinite(epIdx)) {
                item.style.cursor = "pointer";
                item.addEventListener("click", () => onSelect(epIdx));
            }
        });
    }

    function renderHistoryEpisodeRatingsIndex(season, idx, epIndex) {
        const mainBlock = document.getElementById("MainBlock");
        if (!mainBlock) return false;

        const episodes = Array.isArray(season.episodeRatingsAllHTML) ? season.episodeRatingsAllHTML : [];
        if (episodes.length === 0) return false;

        const clampedIndex = Math.max(0, Math.min(epIndex, episodes.length - 1));
        const html = episodes[clampedIndex];
        if (!html) return false;

        mainBlock.innerHTML = "";
        setBackgroundToNormal();

        const titleEl = document.getElementById("MainTitle");
        if (titleEl) titleEl.innerHTML = (season.name || "Season Details") + " \u2014 Episode Ratings";

        const center = document.createElement("center");
        center.innerHTML = html;
        mainBlock.appendChild(center);

        rewireHistoryEpisodeRatingsNav(center, (nextIndex) => renderHistoryEpisodeRatingsIndex(season, idx, nextIndex));

        const tabBar = buildHistoryStatsTabBar(season, idx, "Episode Ratings");
        if (tabBar) mainBlock.appendChild(tabBar);

        insertHistorySeasonRecap(season, idx);
        wireViewerDeleteButton(season);
        return true;
    }

    function renderHistoryStatsTabContent(season, idx, label) {
        const mainBlock = document.getElementById("MainBlock");
        if (!mainBlock) return false;

        if (label === "Fan Reactions" && Array.isArray(season.fanReactionsWeeklyHTML) && season.fanReactionsWeeklyHTML.length > 0) {
            return renderHistoryFanReactionsWeek(season, idx, season.fanReactionsWeeklyHTML.length - 1);
        }

        if (label === "Episode Ratings" && Array.isArray(season.episodeRatingsAllHTML) && season.episodeRatingsAllHTML.length > 0) {
            return renderHistoryEpisodeRatingsIndex(season, idx, season.episodeRatingsAllHTML.length - 1);
        }

        const html = season && season.extraStatsHTML && typeof season.extraStatsHTML === "object"
            ? season.extraStatsHTML[label]
            : null;
        if (!html) {
            return false;
        }

        mainBlock.innerHTML = "";
        setBackgroundToNormal();

        const titleEl = document.getElementById("MainTitle");
        if (titleEl) titleEl.innerHTML = (season.name || "Season Details") + " \u2014 " + label;

        const center = document.createElement("center");
        center.innerHTML = html;
        mainBlock.appendChild(center);

        if (label === "Fan Reactions") {
            // Legacy saved seasons only kept a single week snapshot; disable the nav instead of calling the live season's screen.
            rewireHistoryFanReactionNav(center, null, true, true);
        }

        const tabBar = buildHistoryStatsTabBar(season, idx, label);
        if (tabBar) mainBlock.appendChild(tabBar);

        insertHistorySeasonRecap(season, idx);
        wireViewerDeleteButton(season);
        return true;
    }

    window.viewSeasonHistoryStatsTab = async function viewSeasonHistoryStatsTab(idx, label) {
        try {
            const data = await getSeasonByIndex(idx);
            const season = data.season;
            if (!season) return;
            currentViewedSeasonId = season.id || null;

            if (label === "Track Records" && !(season.extraStatsHTML && season.extraStatsHTML["Track Records"])) {
                window.viewSingleSeason(idx);
                return;
            }

            if (!renderHistoryStatsTabContent(season, idx, label)) {
                window.viewSingleSeason(idx);
            }
        } catch (err) {
            toast(err && err.message ? err.message : "Could not open season.", true);
        }
    };

    function renderRebuiltHistoryTrackRecord(season, idx) {
        const tableWrap = buildHistoryTrackRecordTableFromData(season);
        if (!tableWrap) {
            return false;
        }

        const mainBlock = document.getElementById("MainBlock");
        if (!mainBlock) {
            return false;
        }

        mainBlock.innerHTML = "";
        setBackgroundToNormal();

        const titleEl = document.getElementById("MainTitle");
        if (titleEl) titleEl.innerHTML = season.name || "Season Details";

        const center = document.createElement("center");
        center.appendChild(tableWrap);
        mainBlock.appendChild(center);

        const tabBar = buildHistoryStatsTabBar(season, idx, "Track Records");
        if (tabBar) mainBlock.appendChild(tabBar);

        insertHistorySeasonRecap(season, idx);
        return true;
    }

    function resolveHistoryRankSafe(value, fallback = 999) {
        if (typeof window.normalizeHistoryRank === "function") {
            return window.normalizeHistoryRank(value, fallback);
        }
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return numeric;
    }

    const historyTrsRankLookupCache = new WeakMap();

    function parseHistoryRankLabel(value) {
        const normalized = String(value || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();

        if (!normalized) {
            return 999;
        }

        if (isHistoryCrownPlacement(normalized)) {
            return 1;
        }

        const ordinalMatch = normalized.match(/(\d+)/);
        if (ordinalMatch) {
            const parsed = Number(ordinalMatch[1]);
            if (Number.isFinite(parsed) && parsed > 0) {
                return parsed;
            }
        }

        if (normalized.includes("RUNNER")) {
            return 2;
        }

        return 999;
    }

    function buildHistoryTrsRankLookup(season) {
        if (!season || typeof season !== "object") {
            return null;
        }

        if (historyTrsRankLookupCache.has(season)) {
            return historyTrsRankLookupCache.get(season);
        }

        const markup = typeof season.trackRecordHTML === "string" ? season.trackRecordHTML : "";
        if (!markup.includes("<table")) {
            historyTrsRankLookupCache.set(season, null);
            return null;
        }

        const temp = document.createElement("div");
        temp.innerHTML = markup;
        const table = temp.querySelector("table#trackRecord") || temp.querySelector("table");
        if (!table) {
            historyTrsRankLookupCache.set(season, null);
            return null;
        }

        const rows = Array.from(table.querySelectorAll("tr"));
        if (rows.length < 2) {
            historyTrsRankLookupCache.set(season, null);
            return null;
        }

        let headerRowIndex = -1;
        let rankColumn = -1;
        let nameColumn = -1;

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const headerCells = Array.from(rows[rowIndex].querySelectorAll("th,td")).map((cell) =>
                String(cell.textContent || "").trim().toLowerCase()
            );

            const possibleRankColumn = headerCells.findIndex((text) => (
                text.includes("rank") || text.includes("place") || text.includes("placement")
            ));
            const possibleNameColumn = headerCells.findIndex((text) => (
                text.includes("contestant") || text.includes("queen") || text.includes("name") || text.includes("player")
            ));

            if (possibleRankColumn >= 0 && possibleNameColumn >= 0) {
                headerRowIndex = rowIndex;
                rankColumn = possibleRankColumn;
                nameColumn = possibleNameColumn;
                break;
            }
        }

        if (headerRowIndex < 0 || rankColumn < 0 || nameColumn < 0) {
            historyTrsRankLookupCache.set(season, null);
            return null;
        }

        const rankLookup = new Map();

        rows.slice(headerRowIndex + 1).forEach((row) => {
            const cells = Array.from(row.querySelectorAll("th,td"));
            if (cells.length <= Math.max(rankColumn, nameColumn)) {
                return;
            }

            const nameKey = normalizeHistoryNameKey(cells[nameColumn].textContent || "");
            const parsedRank = parseHistoryRankLabel(cells[rankColumn].textContent || "");
            if (!nameKey || !Number.isFinite(parsedRank) || parsedRank > 900) {
                return;
            }

            if (!rankLookup.has(nameKey) || parsedRank < rankLookup.get(nameKey)) {
                rankLookup.set(nameKey, parsedRank);
            }
        });

        const lookupResult = rankLookup.size > 0 ? rankLookup : null;
        historyTrsRankLookupCache.set(season, lookupResult);
        return lookupResult;
    }

    function getHistoryRankFromTrs(season, contestantName) {
        const lookup = buildHistoryTrsRankLookup(season);
        if (!lookup) {
            return 999;
        }

        const key = normalizeHistoryNameKey(contestantName);
        if (!key || !lookup.has(key)) {
            return 999;
        }

        return lookup.get(key);
    }

    function getSeasonWinnerNameKeysSafe(season) {
        const keys = [];
        const pushKey = (name) => {
            const normalized = normalizeHistoryNameKey(name);
            if (!normalized || keys.includes(normalized)) {
                return;
            }
            keys.push(normalized);
        };

        if (Array.isArray(season && season.winnerNames)) {
            season.winnerNames.forEach(pushKey);
        }

        if (keys.length === 0) {
            const winnerLabel = String(season && season.winner || "").trim();
            if (winnerLabel && !/unknown|not crowned yet|in progress|abandoned/i.test(winnerLabel)) {
                winnerLabel
                    .split(/,|&|\/|\band\b/gi)
                    .forEach(pushKey);
            }
        }

        return keys;
    }

    function isSeasonWinnerEntrySafe(season, contestantName) {
        const contestantKey = normalizeHistoryNameKey(contestantName);
        if (!contestantKey) {
            return false;
        }

        const winnerKeys = getSeasonWinnerNameKeysSafe(season);
        return winnerKeys.some((winnerKey) => (
            winnerKey === contestantKey
            || winnerKey.includes(contestantKey)
            || contestantKey.includes(winnerKey)
        ));
    }

    function resolveHistorySeasonRankWithWinnerSafe(season, entry) {
        const resolvedRank = Math.min(
            getHistoryRankFromTrs(season, entry && entry.name),
            resolveHistoryRankSafe(entry && entry.rankP, 999)
        );

        if (isSeasonWinnerEntrySafe(season, entry && entry.name)) {
            return 1;
        }

        return resolvedRank;
    }

    function resolveFranchiseCode(value) {
        const raw = String(value || "").trim().toUpperCase();
        if (!raw) return "UNKNOWN";

        const aliasMap = {
            "USA": "US",
            "UNITED STATES": "US",
            "CA": "CANADA",
            "CAN": "CANADA",
            "SPAIN": "ESPANA",
            "ESPAÑA": "ESPANA",
            "PH": "PHILIPPINES",
            "TH": "THAILAND",
            "NL": "HOLLAND",
            "BE": "BELGIQUE",
            "MX": "MEXICO",
            "BR": "BRASIL",
            "SE": "SVERIGE",
            "DE": "GERMANY",
            "DU": "DOWNUNDER",
            "THE SWITCH": "THESWITCH",
            "LA MAS DRAGA": "LAMASDRAGA"
        };

        return aliasMap[raw] || raw;
    }

    function resolveFranchiseLabel(code) {
        const normalizedCode = resolveFranchiseCode(code);
        const fallbackMap = {
            ALL: "All",
            NONE: "None",
            US: "US",
            UK: "UK",
            CANADA: "Canada",
            ESPANA: "Espana",
            DOWNUNDER: "Down Under",
            FRANCE: "France",
            ITALIA: "Italia",
            PHILIPPINES: "Philippines",
            THAILAND: "Thailand",
            HOLLAND: "Holland",
            BELGIQUE: "Belgique",
            MEXICO: "Mexico",
            BRASIL: "Brasil",
            SVERIGE: "Sverige",
            GERMANY: "Germany",
            THESWITCH: "The Switch",
            LAMASDRAGA: "La Mas Draga",
            DRAGULA: "Dragula",
            CUSTOM: "Custom",
            MISC: "Misc",
            UNKNOWN: "Unknown"
        };

        const fromConfig = Array.isArray(window.DRAG_RACE_FRANCHISE_CONFIG)
            ? window.DRAG_RACE_FRANCHISE_CONFIG.find((entry) => resolveFranchiseCode(entry && entry.code) === normalizedCode)
            : null;
        if (fromConfig && fromConfig.label) return fromConfig.label;

        return fallbackMap[normalizedCode] || normalizedCode;
    }

    function gatherFranchiseAggregates(seasons = []) {
        const totals = new Map();

        seasons.forEach((season) => {
            const seasonSeenFranchises = new Set();
            const cast = Array.isArray(season && season.cast) ? season.cast : [];

            cast.forEach((entry) => {
                const code = resolveFranchiseCode(entry && entry.country);
                const label = resolveFranchiseLabel(code);
                const key = code || "UNKNOWN";
                const aggregate = totals.get(key) || {
                    code: key,
                    name: label,
                    entries: 0,
                    crowns: 0,
                    wins: 0,
                    tops: 0,
                    bottoms: 0,
                    ppeTotal: 0,
                    ppeCount: 0,
                    seasonCount: 0
                };

                aggregate.entries += 1;
                const resolvedRank = resolveHistorySeasonRankWithWinnerSafe(season, entry);
                aggregate.crowns += resolvedRank === 1 ? 1 : 0;
                aggregate.wins += countHistoryWinsSafe(entry);
                aggregate.tops += countHistoryTopsSafe(entry);
                aggregate.bottoms += countHistoryBottomsSafe(entry);

                const ppe = Number(entry && entry.ppe);
                if (Number.isFinite(ppe)) {
                    aggregate.ppeTotal += ppe;
                    aggregate.ppeCount += 1;
                }

                totals.set(key, aggregate);
                seasonSeenFranchises.add(key);
            });

            seasonSeenFranchises.forEach((key) => {
                const aggregate = totals.get(key);
                if (aggregate) {
                    aggregate.seasonCount += 1;
                }
            });
        });

        return Array.from(totals.values()).map((entry) => ({
            ...entry,
            avgPPE: entry.ppeCount > 0 ? entry.ppeTotal / entry.ppeCount : 0
        }));
    }

    function getAggregateLeaders(entries = [], valueGetter, options = {}) {
        const mode = options.mode === "min" ? "min" : "max";
        const allowZero = options.allowZero !== false;
        let leaders = [];
        let bestValue = mode === "min" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

        entries.forEach((entry) => {
            const numeric = Number(valueGetter(entry));
            if (!Number.isFinite(numeric)) return;
            const isBetter = mode === "min" ? numeric < bestValue : numeric > bestValue;
            if (isBetter) {
                bestValue = numeric;
                leaders = [entry];
                return;
            }
            if (numeric === bestValue) {
                leaders.push(entry);
            }
        });

        if (leaders.length === 0) {
            return null;
        }

        if (!allowZero && bestValue <= 0) {
            return null;
        }

        return { value: bestValue, leaders };
    }

    function buildFranchiseRecordItems(seasons = []) {
        const entries = buildQueenHistoryEntries(seasons);
        if (entries.length === 0) {
            return [];
        }

        const configs = [
            { label: "Most Crowns", getValue: (entry) => entry.crowns },
            { label: "Most Wins", getValue: (entry) => entry.wins },
            { label: "Most Top Placements", getValue: (entry) => entry.tops },
            { label: "Most Bottoms", getValue: (entry) => entry.bottoms },
            { label: "Most Appearances", getValue: (entry) => (Array.isArray(entry.appearances) ? entry.appearances.length : 0) },
            { label: "Highest Avg PPE", getValue: (entry) => entry.averagePPE }
        ];

        return configs.map((config) => {
            const result = getAggregateLeaders(entries, config.getValue, { allowZero: false });
            if (!result) return null;
            return {
                label: config.label,
                names: result.leaders.map((entry) => entry.name || "Unknown").join(", "),
                value: safeHistoryMetric(result.value),
                suffix: ""
            };
        }).filter(Boolean);
    }

    function buildQueenHistoryEntries(seasons = []) {
        const totals = new Map();

        seasons.forEach((season, seasonIndex) => {
            const cast = Array.isArray(season && season.cast) ? season.cast : [];
            cast.forEach((entry) => {
                const name = String(entry && entry.name || "").trim();
                if (!name) return;

                const key = normalizeHistoryNameKey(name);
                const aggregate = totals.get(key) || {
                    key,
                    name,
                    image: entry && entry.image ? entry.image : "",
                    country: resolveFranchiseCode(entry && entry.country),
                    crowns: 0,
                    wins: 0,
                    tops: 0,
                    bottoms: 0,
                    lipsyncs: 0,
                    ppeTotalPoints: 0,
                    ppeEpisodesTotal: 0,
                    ppeSeasonTotal: 0,
                    ppeSeasonCount: 0,
                    bestRank: 999,
                    appearances: []
                };

                aggregate.image = aggregate.image || (entry && entry.image ? entry.image : "");
                if (aggregate.country === "UNKNOWN") {
                    aggregate.country = resolveFranchiseCode(entry && entry.country);
                }

                const wins = countHistoryWinsSafe(entry);
                const tops = countHistoryTopsSafe(entry);
                const bottoms = countHistoryBottomsSafe(entry);
                const lipsyncs = countHistoryLipSyncsSafe(entry, season);
                const rank = resolveHistorySeasonRankWithWinnerSafe(season, entry);
                const ppe = Number(entry && entry.ppe);
                const episodesOnRaw = Number(entry && entry.episodesOn);
                const episodesOn = Number.isFinite(episodesOnRaw) && episodesOnRaw > 0 ? episodesOnRaw : null;
                const appearancePPE = Number.isFinite(ppe)
                    ? (episodesOn ? ppe / episodesOn : ppe)
                    : null;

                aggregate.crowns += rank === 1 ? 1 : 0;
                aggregate.wins += wins;
                aggregate.tops += tops;
                aggregate.bottoms += bottoms;
                aggregate.lipsyncs += lipsyncs;
                aggregate.bestRank = Math.min(aggregate.bestRank, rank);

                if (Number.isFinite(ppe)) {
                    aggregate.ppeSeasonTotal += ppe;
                    aggregate.ppeSeasonCount += 1;
                    if (episodesOn) {
                        aggregate.ppeTotalPoints += ppe;
                        aggregate.ppeEpisodesTotal += episodesOn;
                    }
                }

                aggregate.appearances.push({
                    seasonName: String(season && season.name || "Season"),
                    seasonDate: String(season && season.date || ""),
                    seasonIndex,
                    rank,
                    wins,
                    tops,
                    bottoms,
                    lipsyncs,
                    episodesOn,
                    ppe: appearancePPE,
                    crown: rank === 1
                });

                totals.set(key, aggregate);
            });
        });

        return Array.from(totals.values())
            .map((entry) => ({
                ...entry,
                averagePPE: entry.ppeEpisodesTotal > 0
                    ? entry.ppeTotalPoints / entry.ppeEpisodesTotal
                    : (entry.ppeSeasonCount > 0 ? entry.ppeSeasonTotal / entry.ppeSeasonCount : 0),
                bestRank: entry.bestRank < 900 ? entry.bestRank : null,
                franchiseLabel: resolveFranchiseLabel(entry.country),
                appearances: entry.appearances.sort((a, b) => a.seasonIndex - b.seasonIndex)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function renderQueenProfileCard(host, queenEntry) {
        if (!host) return;
        if (!queenEntry) {
            host.innerHTML = "";
            return;
        }

        const image = queenEntry.image || "image/queens/noimage.jpg";
        const appearancesRows = queenEntry.appearances.map((appearance) => {
            const rankLabel = formatHistoryOrdinal(appearance.rank);
            const crownLabel = appearance.crown ? " <i class=\"fa-solid fa-crown\"></i>" : "";
            return "<tr>"
                + "<td><button type=\"button\" data-open-season=\"" + appearance.seasonIndex + "\" class=\"history-storage-icon-btn history-queen-open-season-btn\" title=\"Open season\"><i class=\"fa-solid fa-eye\"></i></button></td>"
                + "<td><b>" + escapeHistoryText(appearance.seasonName) + "</b><br><small>" + escapeHistoryText(appearance.seasonDate || "") + "</small></td>"
                + "<td>" + rankLabel + crownLabel + "</td>"
                + "<td>" + appearance.wins + "</td>"
                + "<td>" + appearance.tops + "</td>"
                + "<td>" + appearance.bottoms + "</td>"
                + "<td>" + appearance.lipsyncs + "</td>"
                + "<td>" + (appearance.ppe === null ? "-" : safeHistoryMetric(appearance.ppe)) + "</td>"
                + "</tr>";
        }).join("");

        host.innerHTML = ""
            + "<div class=\"history-sim-shell history-queen-profile-shell\">"
            + "<div class=\"history-sim-hero\">"
            + "<img src=\"" + escapeHistoryText(image) + "\" alt=\"" + escapeHistoryText(queenEntry.name) + "\" class=\"history-sim-winner-image\">"
            + "<div class=\"history-sim-copy\">"
            + "<p class=\"history-sim-kicker\">Queen Profile</p>"
            + "<h2>" + escapeHistoryText(queenEntry.name) + "</h2>"
            + "<p class=\"history-sim-lead\">"
            + "Franchise: <b>" + escapeHistoryText(queenEntry.franchiseLabel) + "</b>"
            + " &middot; Appearances: <b>" + queenEntry.appearances.length + "</b>"
            + " &middot; Crowns: <b>" + queenEntry.crowns + "</b>"
            + "</p>"
            + "</div>"
            + "</div>"
            + "<div class=\"history-sim-meta\">"
            + "<span><b>Wins</b> " + queenEntry.wins + "</span>"
            + "<span><b>Tops</b> " + queenEntry.tops + "</span>"
            + "<span><b>Bottoms</b> " + queenEntry.bottoms + "</span>"
            + "<span><b>Lip Syncs</b> " + queenEntry.lipsyncs + "</span>"
            + "<span><b>Best Rank</b> " + formatHistoryOrdinal(queenEntry.bestRank) + "</span>"
            + "<span><b>Avg PPE</b> " + safeHistoryMetric(queenEntry.averagePPE) + "</span>"
            + "</div>"
            + "<div class=\"history-queen-profile-table-wrap\">"
            + "<table id=\"trackRecord\" class=\"history-queen-profile-table\">"
            + "<tr><th>Open</th><th>Season</th><th>Rank</th><th>Wins</th><th>Tops</th><th>Bottoms</th><th>Lip Syncs</th><th>PPE</th></tr>"
            + appearancesRows
            + "</table>"
            + "</div>"
            + "</div>";

        host.querySelectorAll("button[data-open-season]").forEach((button) => {
            button.addEventListener("click", () => {
                const index = Number(button.getAttribute("data-open-season"));
                if (!Number.isNaN(index) && typeof window.viewSingleSeason === "function") {
                    window.viewSingleSeason(index);
                }
            });
        });
    }

    function renderQueenSearchAndProfiles(mainBlock, storedHistory) {
        const queens = buildQueenHistoryEntries(storedHistory);
        if (!mainBlock || queens.length === 0) {
            return;
        }

        const section = document.createElement("section");
        section.className = "history-records-panel history-records-panel--standalone";
        section.innerHTML = ""
            + "<div class=\"history-records-header\">"
            + "<h3>Queen History Search & Profiles</h3>"
            + "<p>Search any queen to view their full history across all saved seasons.</p>"
            + "</div>"
            + "<div class=\"history-queen-search-wrap\">"
            + "<div class=\"history-queen-search-toolbar\">"
            + "<input type=\"search\" id=\"queen-history-search\" class=\"history-queen-search-input\" placeholder=\"Search queen name or franchise...\" aria-label=\"Search queen history\">"
            + "<button type=\"button\" id=\"queen-history-clear\" class=\"history-storage-icon-btn history-queen-search-clear\" title=\"Clear search\" aria-label=\"Clear search\"><i class=\"fa-solid fa-xmark\"></i></button>"
            + "</div>"
            + "<p id=\"queen-history-search-summary\" class=\"history-queen-search-summary\"></p>"
            + "<div class=\"history-queen-search-layout\">"
            + "<div id=\"queen-history-search-results\" class=\"history-queen-search-results\" role=\"listbox\" aria-label=\"Queen search results\"></div>"
            + "<div id=\"queen-history-profile\" class=\"history-queen-profile-host\"></div>"
            + "</div>"
            + "</div>";

        const searchInput = section.querySelector("#queen-history-search");
        const clearButton = section.querySelector("#queen-history-clear");
        const summaryHost = section.querySelector("#queen-history-search-summary");
        const resultsHost = section.querySelector("#queen-history-search-results");
        const profileHost = section.querySelector("#queen-history-profile");
        let selectedQueenKey = "";

        const renderResults = (query = "") => {
            const safeQuery = String(query || "").trim();
            const normalizedQuery = normalizeHistoryNameKey(safeQuery);
            const filtered = normalizedQuery
                ? queens.filter((entry) => {
                    const normalizedName = normalizeHistoryNameKey(entry.name);
                    const normalizedFranchise = normalizeHistoryNameKey(entry.franchiseLabel);
                    return normalizedName.includes(normalizedQuery) || normalizedFranchise.includes(normalizedQuery);
                })
                : [...queens].sort((a, b) => {
                    if (b.crowns !== a.crowns) return b.crowns - a.crowns;
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    return a.name.localeCompare(b.name);
                });

            const topMatches = normalizedQuery ? filtered : filtered.slice(0, 16);
            if (clearButton) {
                clearButton.disabled = safeQuery.length === 0;
            }

            if (topMatches.length === 0) {
                resultsHost.innerHTML = "<p class=\"history-storage-note\">No queens found for that search.</p>";
                if (summaryHost) {
                    summaryHost.textContent = safeQuery
                        ? "No matches for \"" + safeQuery + "\"."
                        : "No queens are available to display.";
                }
                renderQueenProfileCard(profileHost, null);
                return;
            }

            const selectedEntry = topMatches.find((entry) => entry.key === selectedQueenKey) || topMatches[0];
            selectedQueenKey = selectedEntry.key;

            resultsHost.innerHTML = topMatches.map((entry, index) => ""
                + "<button type=\"button\" data-queen-index=\"" + index + "\" class=\"history-queen-result" + (entry.key === selectedQueenKey ? " is-active" : "") + "\" aria-selected=\"" + (entry.key === selectedQueenKey ? "true" : "false") + "\">"
                + "<img src=\"" + escapeHistoryText(entry.image || "image/queens/noimage.jpg") + "\" alt=\"" + escapeHistoryText(entry.name) + "\" class=\"history-queen-result-avatar\">"
                + "<span class=\"history-queen-result-copy\">"
                + "<span class=\"history-queen-result-name\">" + escapeHistoryText(entry.name) + "</span>"
                + "<span class=\"history-queen-result-meta\">" + escapeHistoryText(entry.franchiseLabel) + " \u00b7 " + entry.appearances.length + (entry.appearances.length === 1 ? " season" : " seasons") + " \u00b7 " + entry.crowns + (entry.crowns === 1 ? " crown" : " crowns") + "</span>"
                + "</span>"
                + "</button>"
            ).join("");

            if (summaryHost) {
                summaryHost.textContent = normalizedQuery
                    ? "Showing " + topMatches.length + " of " + filtered.length + " matches for \"" + safeQuery + "\"."
                    : "Showing top " + topMatches.length + " queens by crowns and wins.";
            }

            resultsHost.querySelectorAll("button[data-queen-index]").forEach((button) => {
                button.addEventListener("click", () => {
                    const idx = Number(button.getAttribute("data-queen-index"));
                    if (Number.isNaN(idx)) return;
                    const selected = topMatches[idx];
                    if (!selected) return;
                    selectedQueenKey = selected.key;
                    renderQueenProfileCard(profileHost, selected);
                    resultsHost.querySelectorAll("button[data-queen-index]").forEach((candidateButton) => {
                        const candidateIndex = Number(candidateButton.getAttribute("data-queen-index"));
                        const candidate = topMatches[candidateIndex];
                        const isActive = !!candidate && candidate.key === selectedQueenKey;
                        candidateButton.classList.toggle("is-active", isActive);
                        candidateButton.setAttribute("aria-selected", isActive ? "true" : "false");
                    });
                });
            });

            renderQueenProfileCard(profileHost, selectedEntry);
        };

        renderResults("");

        clearButton.addEventListener("click", () => {
            searchInput.value = "";
            searchInput.focus();
            renderResults("");
        });

        searchInput.addEventListener("input", () => {
            renderResults(searchInput.value || "");
        });

        searchInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            renderResults(searchInput.value || "");
        });

        mainBlock.appendChild(section);
    }

    function renderFranchiseRecordsPanel(mainBlock, storedHistory) {
        if (!mainBlock || !Array.isArray(storedHistory) || storedHistory.length === 0) {
            return;
        }

        const items = buildFranchiseRecordItems(storedHistory);
        if (!Array.isArray(items) || items.length === 0) {
            return;
        }

        if (typeof window.createHistoryRecordsSection === "function") {
            const section = window.createHistoryRecordsSection(
                "Queen Wide Records",
                storedHistory.length + " saved season" + (storedHistory.length === 1 ? "" : "s"),
                items,
                "history-records-panel--standalone"
            );
            if (section) {
                const shell = document.createElement("div");
                shell.className = "history-sim-shell history-overall-shell";
                shell.appendChild(section);
                mainBlock.appendChild(shell);
                return;
            }
        }

        const fallback = document.createElement("section");
        fallback.className = "history-records-panel history-records-panel--standalone";
        fallback.innerHTML = "<div class=\"history-records-header\"><h3>Queen Wide Records</h3><p>" + storedHistory.length + " saved season" + (storedHistory.length === 1 ? "" : "s") + "</p></div>";
        const grid = document.createElement("div");
        grid.className = "history-records-grid";

        items.forEach((item) => {
            const card = document.createElement("article");
            card.className = "history-record-card";
            card.innerHTML = ""
                + "<p class=\"history-record-label\">" + escapeHistoryText(item.label) + "</p>"
                + "<p class=\"history-record-names\">" + escapeHistoryText(item.names) + "</p>"
                + "<p class=\"history-record-value\">" + escapeHistoryText(item.value) + "</p>";
            grid.appendChild(card);
        });

        fallback.appendChild(grid);
        mainBlock.appendChild(fallback);
    }

    function normalizeHistoryFranchiseName(value) {
        if (typeof window.normalizeSeasonHistoryFranchiseName === "function") {
            return window.normalizeSeasonHistoryFranchiseName(value);
        }
        const normalized = String(value || "").replace(/\s+/g, " ").trim();
        return normalized || "MAIN";
    }

    function getSeasonHistoryFranchise(season) {
        return normalizeHistoryFranchiseName(season && season.historyFranchise);
    }

    function resolveHistoryFranchiseNames(storedHistory) {
        const names = [];
        const seen = new Set();
        const pushName = (value) => {
            const normalized = normalizeHistoryFranchiseName(value);
            if (seen.has(normalized)) return;
            seen.add(normalized);
            names.push(normalized);
        };

        if (typeof window.getSeasonHistoryFranchiseStore === "function") {
            try {
                const store = window.getSeasonHistoryFranchiseStore();
                Object.keys(store || {}).forEach(pushName);
            } catch (_err) {}
        }

        if (Array.isArray(storedHistory)) {
            storedHistory.forEach((season) => pushName(getSeasonHistoryFranchise(season)));
        }

        if (names.length === 0) {
            pushName("MAIN");
        }

        return names;
    }

    function resolveActiveHistoryFranchise(franchiseNames) {
        const names = Array.isArray(franchiseNames) ? franchiseNames : [];
        let active = names[0] || "MAIN";

        if (typeof window.getCurrentSeasonHistoryFranchise === "function") {
            try {
                active = normalizeHistoryFranchiseName(window.getCurrentSeasonHistoryFranchise());
            } catch (_err) {}
        }

        if (!names.includes(active) && names.length > 0) {
            active = names[0];
        }

        if (typeof window.setCurrentSeasonHistoryFranchise === "function") {
            try {
                window.setCurrentSeasonHistoryFranchise(active);
            } catch (_err) {}
        }

        return active;
    }

    function buildHistoryFranchiseTabber(franchiseNames, activeFranchise, storedHistory) {
        const tabber = document.createElement("div");
        tabber.className = "history-franchise-tabber";

        const tabs = document.createElement("div");
        tabs.className = "history-franchise-tabs";
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "History Franchises");

        const seasonCounts = new Map();
        (Array.isArray(storedHistory) ? storedHistory : []).forEach((season) => {
            const franchise = getSeasonHistoryFranchise(season);
            seasonCounts.set(franchise, (seasonCounts.get(franchise) || 0) + 1);
        });

        franchiseNames.forEach((franchiseName) => {
            const tabBtn = document.createElement("button");
            tabBtn.type = "button";
            tabBtn.className = "history-franchise-tab";
            tabBtn.innerHTML = escapeHistoryText(franchiseName) + ' <span class="history-franchise-count">' + (seasonCounts.get(franchiseName) || 0) + "</span>";
            tabBtn.setAttribute("role", "tab");
            tabBtn.setAttribute("aria-selected", franchiseName === activeFranchise ? "true" : "false");
            tabBtn.onclick = () => {
                if (typeof window.setCurrentSeasonHistoryFranchise === "function") {
                    window.setCurrentSeasonHistoryFranchise(franchiseName);
                }
                window.viewSeasonHistory();
            };
            tabs.appendChild(tabBtn);
        });
        tabber.appendChild(tabs);

        const tools = document.createElement("div");
        tools.className = "history-franchise-tools";

        const addTool = (icon, label, handler, extraClass) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "history-franchise-tool" + (extraClass ? " " + extraClass : "");
            button.title = label;
            button.setAttribute("aria-label", label);
            button.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>';
            button.onclick = handler;
            tools.appendChild(button);
        };

        if (typeof window.createSeasonHistoryFranchise === "function") {
            addTool("fa-plus", "New franchise", () => window.createSeasonHistoryFranchise());
        }

        if (activeFranchise && franchiseNames.length > 0) {
            addTool("fa-pen", "Rename " + activeFranchise, () => {
                if (typeof window.renameSeasonHistoryFranchise === "function") {
                    window.renameSeasonHistoryFranchise(activeFranchise);
                }
            });
            addTool("fa-trash", "Remove " + activeFranchise, () => {
                if (typeof window.deleteSeasonHistoryFranchise === "function") {
                    window.deleteSeasonHistoryFranchise(activeFranchise);
                }
            }, "danger");
        }

        tabber.appendChild(tools);
        return tabber;
    }

    function buildHistoryOverviewStats(rows) {
        const queens = new Set();
        let episodes = 0;
        let lipsyncs = 0;
        rows.forEach(({ season }) => {
            episodes += Number(season && season.episodes) || 0;
            lipsyncs += Array.isArray(season && season.alots) ? season.alots.length : 0;
            (Array.isArray(season && season.cast) ? season.cast : []).forEach((entry) => {
                if (entry && entry.name) queens.add(normalizeHistoryNameKey(entry.name));
            });
        });

        const stats = document.createElement("div");
        stats.className = "history-overview-stats";
        stats.innerHTML = [
            ["fa-clapperboard", "Seasons", rows.length],
            ["fa-users", "Queens", queens.size],
            ["fa-tv", "Episodes", episodes],
            ["fa-microphone-lines", "Lip syncs", lipsyncs]
        ].map(([icon, label, value]) => '<div class="history-overview-stat">'
            + '<span class="history-overview-icon"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></span>'
            + '<span class="history-overview-copy"><b>' + value.toLocaleString() + "</b><small>" + label + "</small></span>"
            + "</div>").join("");
        return stats;
    }

    function rewriteLocalFranchiseStore(renameFrom, renameTo, deleteName) {
        if (typeof window.getSeasonHistoryFranchiseStore !== "function" || typeof window.saveSeasonHistoryFranchiseStore !== "function") {
            return;
        }

        const fromName = renameFrom ? normalizeHistoryFranchiseName(renameFrom) : "";
        const toName = renameTo ? normalizeHistoryFranchiseName(renameTo) : "";
        const removeName = deleteName ? normalizeHistoryFranchiseName(deleteName) : "";

        const store = window.getSeasonHistoryFranchiseStore();
        if (!store || typeof store !== "object") {
            return;
        }

        if (fromName && toName && fromName !== toName) {
            const fromRecords = Array.isArray(store[fromName]) ? store[fromName] : [];
            const toRecords = Array.isArray(store[toName]) ? store[toName] : [];
            store[toName] = [...fromRecords.map((record) => ({ ...record, historyFranchise: toName })), ...toRecords];
            delete store[fromName];
        }

        if (removeName) {
            delete store[removeName];
        }

        if (Object.keys(store).length === 0) {
            store.Main = [];
        }

        window.saveSeasonHistoryFranchiseStore(store);
    }

    function moveSeasonRecordBetweenFranchisesInLocalStore(seasonKey, fromName, toName) {
        if (!seasonKey) {
            return;
        }
        if (typeof window.getSeasonHistoryFranchiseStore !== "function" || typeof window.saveSeasonHistoryFranchiseStore !== "function") {
            return;
        }

        const sourceName = normalizeHistoryFranchiseName(fromName);
        const targetName = normalizeHistoryFranchiseName(toName);
        if (!sourceName || !targetName || sourceName === targetName) {
            return;
        }

        const store = window.getSeasonHistoryFranchiseStore();
        if (!store || typeof store !== "object") {
            return;
        }

        const fromRecords = Array.isArray(store[sourceName]) ? store[sourceName] : [];
        const toRecords = Array.isArray(store[targetName]) ? store[targetName] : [];
        const movingRecords = [];
        const retainedRecords = [];

        fromRecords.forEach((record, index) => {
            if (getSeasonStorageKey(record, "franchise-store", index) === seasonKey) {
                movingRecords.push({ ...record, historyFranchise: targetName });
            } else {
                retainedRecords.push(record);
            }
        });

        if (movingRecords.length === 0) {
            return;
        }

        store[sourceName] = retainedRecords;
        store[targetName] = [...movingRecords, ...toRecords];

        if (!Array.isArray(store[sourceName]) || store[sourceName].length === 0) {
            delete store[sourceName];
        }

        if (Object.keys(store).length === 0) {
            store.Main = [];
        }

        window.saveSeasonHistoryFranchiseStore(store);
    }

    window.renameSeasonHistoryFranchise = async function renameSeasonHistoryFranchise(name) {
        const currentName = normalizeHistoryFranchiseName(name);
        const nextNameInput = await window.showInHousePrompt("Rename franchise:", currentName, "Rename Franchise");
        if (nextNameInput === null) return;

        const nextName = normalizeHistoryFranchiseName(nextNameInput);
        if (!nextName || nextName === currentName) {
            return;
        }

        try {
            await withHistoryCollections(async ({ localSeasons, cloudSeasons }) => ({
                localSeasons: localSeasons.map((season) => (
                    getSeasonHistoryFranchise(season) === currentName
                        ? { ...season, historyFranchise: nextName }
                        : season
                )),
                cloudSeasons: cloudSeasons.map((season) => (
                    getSeasonHistoryFranchise(season) === currentName
                        ? { ...season, historyFranchise: nextName }
                        : season
                ))
            }));

            rewriteLocalFranchiseStore(currentName, nextName, "");
            if (typeof window.setCurrentSeasonHistoryFranchise === "function") {
                window.setCurrentSeasonHistoryFranchise(nextName);
            }
            toast('Renamed franchise to "' + nextName + '".');
            await window.viewSeasonHistory();
        } catch (err) {
            toast(err && err.message ? err.message : "Could not rename franchise.", true);
        }
    };

    window.deleteSeasonHistoryFranchise = async function deleteSeasonHistoryFranchise(name) {
        const currentName = normalizeHistoryFranchiseName(name);

        const shouldDelete = await window.showInHouseConfirm(
            'Remove franchise "' + currentName + '" and all seasons inside it?',
            "Remove Franchise"
        );
        if (!shouldDelete) return;

        try {
            await withHistoryCollections(async ({ localSeasons, cloudSeasons }) => ({
                localSeasons: localSeasons.filter((season) => getSeasonHistoryFranchise(season) !== currentName),
                cloudSeasons: cloudSeasons.filter((season) => getSeasonHistoryFranchise(season) !== currentName)
            }));

            rewriteLocalFranchiseStore("", "", currentName);

            const nextActive = typeof window.getSeasonHistoryFranchiseNames === "function"
                ? (window.getSeasonHistoryFranchiseNames(window.getSeasonHistoryFranchiseStore())[0] || "Main")
                : "Main";
            if (typeof window.setCurrentSeasonHistoryFranchise === "function") {
                window.setCurrentSeasonHistoryFranchise(nextActive);
            }

            toast('Removed franchise "' + currentName + '".');
            await window.viewSeasonHistory();
        } catch (err) {
            toast(err && err.message ? err.message : "Could not remove franchise.", true);
        }
    };

    function wireViewerDeleteButton(season) {
        const seasonId = season && season.id;
        if (!seasonId) return;
        const actions = document.querySelector("#MainBlock .history-sim-actions");
        if (!actions) return;
        const deleteBtn = actions.querySelector("button.danger");
        if (!deleteBtn) return;
        deleteBtn.onclick = function onViewerDeleteClick() {
            window.deleteFromHistory(seasonId);
        };
    }

    async function getSeasonByIndex(idx) {
        const historyState = await readMergedHistory();
        const seasons = Array.isArray(historyState.seasons) ? historyState.seasons : [];
        return { season: seasons[idx], seasons };
    }

    async function getSeasonByIdentifier(identifier) {
        const historyState = await readMergedHistory();
        const seasons = Array.isArray(historyState.seasons) ? historyState.seasons : [];
        const idx = resolveSeasonIndex(seasons, identifier);
        return {
            season: idx >= 0 ? seasons[idx] : null,
            seasons,
            idx
        };
    }

    // Realtime Database history is read-only and delete-only now; Firestore is where seasons are saved.
    async function deleteLegacyRtdbHistory() {
        const user = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
        const rtdbRef = user ? getCloudHistoryRtdbRef(getFirebaseDb(), user.uid) : null;
        if (!rtdbRef) return;
        try {
            await rtdbRef.remove();
        } catch (error) {
            console.warn("Could not delete the old Realtime Database history copy:", error);
        }
    }

    window.clearAllHistory = async function clearAllHistory() {
        const confirmed = await window.showInHouseConfirm(
            "Delete ALL history from local and cloud? This cannot be undone.",
            "Clear History"
        );
        if (!confirmed) return;
        try {
            const result = await withHistoryCollections(async ({ cloudSeasons }) => ({
                localSeasons: [],
                cloudSeasons: Array.isArray(cloudSeasons) ? [] : []
            }));
            await deleteLegacyRtdbHistory();
            toast(result.cloudAvailable ? "History cleared from local and cloud." : "Local history cleared.");
            await window.viewSeasonHistory();
        } catch (err) {
            toast(err && err.message ? err.message : "Could not clear history.", true);
        }
    };

    function resolveSeasonIndex(seasons, identifier) {
        if (!Array.isArray(seasons) || seasons.length === 0) return -1;
        const idValue = (identifier !== undefined && identifier !== null && identifier !== "")
            ? String(identifier)
            : (currentViewedSeasonId !== null && currentViewedSeasonId !== undefined ? String(currentViewedSeasonId) : "");
        if (idValue) {
            const matchedById = seasons.findIndex((season) => String(season && season.id) === idValue);
            if (matchedById >= 0) {
                return matchedById;
            }
        }
        if (typeof identifier === "number" && identifier >= 0 && identifier < seasons.length) {
            return identifier;
        }
        return -1;
    }

    window.deleteFromHistory = async function deleteFromHistory(identifier) {
        let deletedSeason = null;
        try {
            await withHistoryCollections(async ({ localSeasons, cloudSeasons, cloudAvailable }) => {
                const mergedSeasons = buildMergedHistory(localSeasons, cloudAvailable ? cloudSeasons : []);
                const idx = resolveSeasonIndex(mergedSeasons, identifier);
                const season = idx >= 0 ? mergedSeasons[idx] : null;
                if (!season) {
                    return { localSeasons, cloudSeasons };
                }
                const confirmed = await window.showInHouseConfirm(
                    'Delete "' + (season.name || "this season") + '" from history?',
                    "Delete History Season"
                );
                if (!confirmed) {
                    return { localSeasons, cloudSeasons };
                }

                const seasonKey = getSeasonStorageKey(season, "delete", idx);
                deletedSeason = season;

                return {
                    localSeasons: localSeasons.filter((entry, entryIndex) => (
                        getSeasonStorageKey(entry, "local", entryIndex) !== seasonKey
                    )),
                    cloudSeasons: cloudSeasons.filter((entry, entryIndex) => (
                        getSeasonStorageKey(entry, "cloud", entryIndex) !== seasonKey
                    ))
                };
            });

            if (deletedSeason) {
                const deletedFrom = [];
                if (deletedSeason.historyStorage && deletedSeason.historyStorage.local) deletedFrom.push("local");
                if (deletedSeason.historyStorage && deletedSeason.historyStorage.cloud) deletedFrom.push("cloud");
                toast(deletedFrom.length ? (`Deleted from ${deletedFrom.join(" and ")}.`) : "Season deleted.");
            }

            currentViewedSeasonId = null;
            await window.viewSeasonHistory();
        } catch (err) {
            toast(err && err.message ? err.message : "Could not delete season.", true);
        }
    };

    async function reorderActiveHistorySeason(sourceMergedIndex, targetMergedIndex, preloadedHistoryState = null) {
        try {
            const historyState = preloadedHistoryState || await readMergedHistory();
            const mergedSeasons = Array.isArray(historyState.seasons) ? historyState.seasons : [];
            const franchiseNames = resolveHistoryFranchiseNames(mergedSeasons);
            const activeFranchise = resolveActiveHistoryFranchise(franchiseNames);
            const source = Number(sourceMergedIndex);
            const target = Number(targetMergedIndex);

            if (!Number.isInteger(source) || !Number.isInteger(target) || source < 0 || source >= mergedSeasons.length || target < 0 || target >= mergedSeasons.length) {
                return;
            }

            const activeMergedIndices = mergedSeasons.reduce((indices, season, index) => {
                if (getSeasonHistoryFranchise(season) === activeFranchise) {
                    indices.push(index);
                }
                return indices;
            }, []);

            if (activeMergedIndices.indexOf(source) < 0 || activeMergedIndices.indexOf(target) < 0 || source === target) {
                return;
            }

            const nextMerged = mergedSeasons.slice();
            const [movedSeason] = nextMerged.splice(source, 1);
            const insertionIndex = target;
            nextMerged.splice(Math.min(nextMerged.length, insertionIndex), 0, movedSeason);

            // Match by season identity, not position: the fresh write-time cloud read can
            // differ in shape from the merged snapshot used for the UI, and a season may only
            // exist in one of the two lists.
            const nextOrder = new Map();
            nextMerged
                .filter((season) => getSeasonHistoryFranchise(season) === activeFranchise)
                .forEach((season, position) => {
                    nextOrder.set(getSeasonStorageKey(season, "reorder", position), position);
                });

            void window.viewSeasonHistory({
                ...historyState,
                seasons: nextMerged
            });

            const reorderCollection = (collection) => collection.map((season, index) => {
                if (getSeasonHistoryFranchise(season) !== activeFranchise) return season;
                const position = nextOrder.get(getSeasonStorageKey(season, "reorder", index));
                return position === undefined ? season : { ...season, manualOrder: position };
            });

            await withHistoryCollections(async ({ localSeasons, cloudSeasons, cloudAvailable }) => ({
                localSeasons: reorderCollection(localSeasons),
                cloudSeasons: cloudAvailable ? reorderCollection(cloudSeasons) : cloudSeasons
            }));
        } catch (err) {
            toast(err && err.message ? err.message : "Could not reorder season.", true);
            await window.viewSeasonHistory();
        }
    }

    window.moveHistorySeason = async function moveHistorySeason(identifier, direction) {
        const sourceIndex = Number(identifier);
        const offset = Number(direction) || 0;
        if (!Number.isInteger(sourceIndex) || offset === 0) {
            return;
        }

        historyReorderQueue = historyReorderQueue.then(async () => {
            const historyState = await readMergedHistory();
            const mergedSeasons = Array.isArray(historyState.seasons) ? historyState.seasons : [];
            const franchiseNames = resolveHistoryFranchiseNames(mergedSeasons);
            const activeFranchise = resolveActiveHistoryFranchise(franchiseNames);
            const activeMergedIndices = mergedSeasons.reduce((indices, season, index) => {
                if (getSeasonHistoryFranchise(season) === activeFranchise) {
                    indices.push(index);
                }
                return indices;
            }, []);

            const sourceActivePosition = activeMergedIndices.indexOf(sourceIndex);
            if (sourceActivePosition < 0) {
                return;
            }

            const targetActivePosition = sourceActivePosition + offset;
            if (targetActivePosition < 0 || targetActivePosition >= activeMergedIndices.length) {
                return;
            }

            await reorderActiveHistorySeason(sourceIndex, activeMergedIndices[targetActivePosition], historyState);
        }).catch((err) => {
            toast(err && err.message ? err.message : "Could not reorder season.", true);
        });

        return historyReorderQueue;
    };

    window.renameHistorySeason = async function renameHistorySeason(idx) {
        try {
            await withHistoryCollections(async ({ localSeasons, cloudSeasons, cloudAvailable }) => {
                const mergedSeasons = buildMergedHistory(localSeasons, cloudAvailable ? cloudSeasons : []);
                const season = mergedSeasons[idx];
                if (!season) {
                    return { localSeasons, cloudSeasons };
                }

                const newName = await window.showInHousePrompt(
                    "Rename season:",
                    season.name || "",
                    "Rename History Season"
                );
                if (newName === null) {
                    return { localSeasons, cloudSeasons };
                }

                const seasonKey = getSeasonStorageKey(season, "rename", idx);
                const nextName = newName.trim() || season.name;

                return {
                    localSeasons: localSeasons.map((entry, entryIndex) => (
                        getSeasonStorageKey(entry, "local", entryIndex) === seasonKey
                            ? { ...entry, name: nextName }
                            : entry
                    )),
                    cloudSeasons: cloudSeasons.map((entry, entryIndex) => (
                        getSeasonStorageKey(entry, "cloud", entryIndex) === seasonKey
                            ? { ...entry, name: nextName }
                            : entry
                    ))
                };
            });
            await window.viewSeasonHistory();
        } catch (err) {
            toast(err && err.message ? err.message : "Could not rename season.", true);
        }
    };

    window.transferHistorySeason = async function transferHistorySeason(identifier) {
        let transferResult = null;

        try {
            await withHistoryCollections(async ({ localSeasons, cloudSeasons, cloudAvailable }) => {
                const mergedSeasons = buildMergedHistory(localSeasons, cloudAvailable ? cloudSeasons : []);
                const idx = resolveSeasonIndex(mergedSeasons, identifier);
                const season = idx >= 0 ? mergedSeasons[idx] : null;
                if (!season) {
                    return { localSeasons, cloudSeasons };
                }

                const fromFranchise = getSeasonHistoryFranchise(season);
                const seasonName = season.name || "this season";
                const knownFranchises = resolveHistoryFranchiseNames(mergedSeasons);
                const suggestedTarget = knownFranchises.find((name) => name !== fromFranchise) || "";
                const targetInput = await window.showInHousePrompt(
                    'Transfer "' + seasonName + '" to franchise:',
                    suggestedTarget || fromFranchise,
                    "Transfer History Season"
                );

                if (targetInput === null) {
                    return { localSeasons, cloudSeasons };
                }

                const targetFranchise = normalizeHistoryFranchiseName(targetInput);
                if (!targetFranchise || targetFranchise === fromFranchise) {
                    transferResult = {
                        skipped: true,
                        sameFranchise: targetFranchise === fromFranchise,
                        targetFranchise
                    };
                    return { localSeasons, cloudSeasons };
                }

                const seasonKey = getSeasonStorageKey(season, "transfer", idx);
                transferResult = {
                    skipped: false,
                    seasonKey,
                    seasonName,
                    fromFranchise,
                    targetFranchise
                };

                return {
                    localSeasons: localSeasons.map((entry, entryIndex) => (
                        getSeasonStorageKey(entry, "local", entryIndex) === seasonKey
                            ? { ...entry, historyFranchise: targetFranchise }
                            : entry
                    )),
                    cloudSeasons: cloudSeasons.map((entry, entryIndex) => (
                        getSeasonStorageKey(entry, "cloud", entryIndex) === seasonKey
                            ? { ...entry, historyFranchise: targetFranchise }
                            : entry
                    ))
                };
            });

            if (!transferResult) {
                return;
            }

            if (transferResult.skipped) {
                if (transferResult.sameFranchise) {
                    toast('Season is already in "' + transferResult.targetFranchise + '".');
                }
                return;
            }

            moveSeasonRecordBetweenFranchisesInLocalStore(
                transferResult.seasonKey,
                transferResult.fromFranchise,
                transferResult.targetFranchise
            );

            if (typeof window.setCurrentSeasonHistoryFranchise === "function") {
                window.setCurrentSeasonHistoryFranchise(transferResult.targetFranchise);
            }

            toast('Moved "' + transferResult.seasonName + '" to "' + transferResult.targetFranchise + '".');
            await window.viewSeasonHistory();
        } catch (err) {
            toast(err && err.message ? err.message : "Could not transfer season.", true);
        }
    };

    window.shareHistorySeason = async function shareHistorySeason(identifier) {
        try {
            const data = await getSeasonByIdentifier(identifier);
            const season = data.season;
            if (!season) {
                return false;
            }

            const shared = await publishPublicShare("history-season", stripHistoryStorage(season), season.name || "Shared Season");
            return copyTextToClipboardWithFallback(
                getHistorySeasonShareUrl(shared.shareId),
                "Season link copied!",
                "Copy this season link:"
            );
        } catch (err) {
            showCustomStatusPopup(err && err.message ? err.message : "Could not share this season right now.", "Sharing", { modal: true });
            return false;
        }
    };

    window.copyHistorySeasonEmbed = async function copyHistorySeasonEmbed(identifier) {
        try {
            const data = await getSeasonByIdentifier(identifier);
            const season = data.season;
            if (!season) {
                return false;
            }

            const shared = await publishPublicShare("history-season", stripHistoryStorage(season), season.name || "Shared Season");
            const embedCode = buildShareEmbedMarkup(getHistorySeasonShareUrl(shared.shareId, true), "history-season");
            return copyTextToClipboardWithFallback(
                embedCode,
                "Season embed code copied!",
                "Copy this season embed code:"
            );
        } catch (err) {
            showCustomStatusPopup(err && err.message ? err.message : "Could not create the season embed right now.", "Sharing", { modal: true });
            return false;
        }
    };

    const originalReSimFromHistory = typeof window.reSimFromHistory === "function"
        ? window.reSimFromHistory
        : null;
    if (originalReSimFromHistory) {
        window.reSimFromHistory = async function reSimFromHistory(identifier) {
            const data = await getSeasonByIdentifier(identifier);
            const season = data.season;
            if (!season) {
                return;
            }

            const originalGetLocalSeasonHistoryRecords = window.getLocalSeasonHistoryRecords;
            if (typeof originalGetLocalSeasonHistoryRecords !== "function") {
                originalReSimFromHistory.call(this, identifier);
                return;
            }

            const franchiseName = typeof window.getCurrentSeasonHistoryFranchise === "function"
                ? window.getCurrentSeasonHistoryFranchise()
                : null;
            const shimmedSeason = stripHistoryStorage(season);

            window.getLocalSeasonHistoryRecords = function getLocalSeasonHistoryRecordsShim(requestedFranchise) {
                if (!requestedFranchise || requestedFranchise === franchiseName) {
                    return [shimmedSeason];
                }
                return originalGetLocalSeasonHistoryRecords.call(this, requestedFranchise);
            };

            try {
                return originalReSimFromHistory.call(this, 0);
            } finally {
                window.getLocalSeasonHistoryRecords = originalGetLocalSeasonHistoryRecords;
            }
        };
    }

    window.refreshSeasonHistoryFromCloud = async function refreshSeasonHistoryFromCloudHandler() {
        return refreshSeasonHistoryFromCloud(true, { forceCloudRead: true });
    };

    window.viewSingleSeason = async function viewSingleSeason(idx) {
        try {
            const data = await getSeasonByIndex(idx);
            const season = data.season;
            if (!season) return;
            currentViewedSeasonId = season.id || null;

            const hasSavedTR = typeof season.trackRecordHTML === "string"
                && season.trackRecordHTML.includes('id="trackRecord"')
                && /Rank/i.test(season.trackRecordHTML)
                && /Contestant/i.test(season.trackRecordHTML);

            if (hasSavedTR) {
                const mainBlock = document.getElementById("MainBlock");
                if (!mainBlock) return;
                mainBlock.innerHTML = "";
                setBackgroundToNormal();

                const titleEl = document.getElementById("MainTitle");
                if (titleEl) titleEl.innerHTML = season.name || "Season Details";

                const center = document.createElement("center");
                const temp = document.createElement("div");
                temp.innerHTML = season.trackRecordHTML;
                const table = temp.querySelector("table#trackRecord") || temp.querySelector("table");
                if (table) {
                    table.id = "trackRecord";
                    table.classList.add("trtable", "history-trackrecord-table");
                    table.removeAttribute("border");

                    const tableWrap = document.createElement("div");
                    tableWrap.className = "history-trackrecord-wrap";
                    tableWrap.appendChild(table);

                    center.appendChild(tableWrap);
                    mainBlock.appendChild(center);

                    const tabBar = buildHistoryStatsTabBar(season, idx, "Track Records");
                    if (tabBar) mainBlock.appendChild(tabBar);

                    insertHistorySeasonRecap(season, idx);
                    wireViewerDeleteButton(season);
                    return;
                }
            }

            const progressRenderer = typeof window.renderHistorySeasonProgress === "function"
                ? window.renderHistorySeasonProgress
                : (typeof renderHistorySeasonProgress === "function" ? renderHistorySeasonProgress : null);

            if (progressRenderer && Array.isArray(season.cast) && season.cast.length > 0) {
                progressRenderer(season, idx);
                wireViewerDeleteButton(season);
                return;
            }

            renderHistorySeasonProgress(season, idx);
            wireViewerDeleteButton(season);
        } catch (err) {
            toast(err && err.message ? err.message : "Could not open season.", true);
        }
    };

    const HISTORY_SEASONS_PAGE_SIZE = 24;
    const HISTORY_VIEW_PREFS_KEY = "ss.history.view";
    let historyActiveView = "seasons";

    function readHistoryViewPrefs() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(HISTORY_VIEW_PREFS_KEY) || "null");
        } catch (_err) {
            stored = null;
        }
        return {
            sort: stored && stored.sort ? String(stored.sort) : "manual",
            density: stored && stored.density === "list" ? "list" : "grid"
        };
    }

    function writeHistoryViewPrefs(changes) {
        try {
            localStorage.setItem(HISTORY_VIEW_PREFS_KEY, JSON.stringify({ ...readHistoryViewPrefs(), ...changes }));
        } catch (_err) {
            // Preferences are a convenience; the page works without them.
        }
    }

    window.viewSeasonHistory = async function viewSeasonHistory(preloadedHistoryState) {
        const renderNonce = ++historyViewRenderNonce;

        if (typeof window.applySharedEmbedMode === "function") {
            window.applySharedEmbedMode();
        }
        if (typeof window.openSharedHistorySeasonFromUrl === "function") {
            const openedShared = await window.openSharedHistorySeasonFromUrl();
            if (renderNonce !== historyViewRenderNonce) {
                return;
            }
            if (openedShared) return;
        }

        const mainBlock = document.getElementById("MainBlock");
        if (!mainBlock) return;
        delete mainBlock.__updateHistorySeasonList;
        mainBlock.innerHTML = "";
        setBackgroundToNormal();

        const titleEl = document.getElementById("MainTitle");
        if (titleEl) titleEl.innerHTML = "Season History";

        let historyState;
        try {
            historyState = preloadedHistoryState || await readMergedHistory();
        } catch (err) {
            if (renderNonce !== historyViewRenderNonce) {
                return;
            }
            const empty = document.createElement("div");
            empty.style.cssText = "text-align:center;padding:60px 20px;";
            const isAccessBlocked = err && err.code === "history-access-blocked";
            const msg = isAccessBlocked
                ? (err.message || "History is only available to + members.")
                : err && err.message === "No history found."
                    ? "No history yet."
                    : "History can't load.";
            empty.innerHTML = '<p style="font-size:1.2em;margin-bottom:20px;">' + msg + '</p>';
            mainBlock.appendChild(empty);
            return;
        }

        // Ignore stale async renders when multiple refresh calls overlap.
        if (renderNonce !== historyViewRenderNonce) {
            return;
        }

        const storedHistory = Array.isArray(historyState.seasons) ? historyState.seasons : [];
        const franchiseNames = resolveHistoryFranchiseNames(storedHistory);
        const activeFranchise = resolveActiveHistoryFranchise(franchiseNames);
        let displayedHistoryRows = storedHistory.reduce((rows, season, index) => {
            if (getSeasonHistoryFranchise(season) === activeFranchise) {
                rows.push({ season, index });
            }
            return rows;
        }, []);
        const displayedHistory = displayedHistoryRows.map((entry) => entry.season);

        renderHistoryCloudPanel(historyState);

        if (storedHistory.length === 0) {
            const empty = document.createElement("div");
            empty.className = "history-season-empty";
            empty.innerHTML = '<p>No seasons saved yet. Finish a season and save it to see it here.</p>'
                + '<a class="chip chip--filled" href="index.html"><i class="fa-solid fa-play" aria-hidden="true"></i> Simulate a season</a>';
            mainBlock.appendChild(empty);
            return;
        }

        const overview = document.createElement("div");
        overview.className = "history-overview";
        mainBlock.appendChild(overview);

        const renderOverview = (franchiseNames, seasons, rows) => {
            overview.innerHTML = "";
            overview.appendChild(buildHistoryFranchiseTabber(franchiseNames, activeFranchise, seasons));
            overview.appendChild(buildHistoryOverviewStats(rows));
        };

        const tabsShell = document.createElement("section");
        tabsShell.className = "history-tab-shell";
        tabsShell.innerHTML = ""
            + '<div class="tabs-container">'
            + '<div class="tab-box" role="tablist" aria-label="History views">'
            + '<button type="button" class="tab-btn" data-history-tab="seasons" role="tab"><i class="fa-solid fa-clapperboard" aria-hidden="true"></i> Seasons</button>'
            + '<button type="button" class="tab-btn" data-history-tab="awards" role="tab"><i class="fa-solid fa-trophy" aria-hidden="true"></i> Awards</button>'
            + '<button type="button" class="tab-btn" data-history-tab="queens" role="tab"><i class="fa-solid fa-user-group" aria-hidden="true"></i> Queens</button>'
            + '</div>'
            + '</div>'
            + '<div class="history-tab-pane" data-history-pane="seasons"></div>'
            + '<div class="history-tab-pane" data-history-pane="awards" hidden></div>'
            + '<div class="history-tab-pane" data-history-pane="queens" hidden></div>';
        mainBlock.appendChild(tabsShell);

        const seasonsPane = tabsShell.querySelector('[data-history-pane="seasons"]');
        const awardsPane = tabsShell.querySelector('[data-history-pane="awards"]');
        const queensPane = tabsShell.querySelector('[data-history-pane="queens"]');
        const tabButtons = Array.from(tabsShell.querySelectorAll("button[data-history-tab]"));

        let currentHistory = storedHistory;
        // Awards and queen profiles scan every season, so they only run when their tab is open.
        let awardsStale = true;
        let queensStale = true;

        const getAllRows = () => currentHistory.map((season, index) => ({ season, index }));

        const refreshOpenPane = (tabName) => {
            if (tabName === "awards" && awardsStale && window.HistoryAwards) {
                awardsStale = false;
                window.HistoryAwards.render(awardsPane, {
                    activeRows: displayedHistoryRows,
                    allRows: getAllRows(),
                    activeFranchise,
                    onOpenQueen: openQueenProfile,
                    onOpenSeason: (index) => window.viewSingleSeason(index)
                });
            }
            if (tabName === "queens" && queensStale) {
                queensStale = false;
                queensPane.innerHTML = "";
                renderQueenSearchAndProfiles(queensPane, currentHistory);
            }
        };

        const setActiveTab = (tabName) => {
            historyActiveView = tabName;
            tabButtons.forEach((button) => {
                const isActive = button.getAttribute("data-history-tab") === tabName;
                button.classList.toggle("active", isActive);
                button.setAttribute("aria-selected", isActive ? "true" : "false");
            });

            tabsShell.querySelectorAll("[data-history-pane]").forEach((pane) => {
                const isActive = pane.getAttribute("data-history-pane") === tabName;
                pane.classList.toggle("is-active", isActive);
                pane.hidden = !isActive;
            });
            refreshOpenPane(tabName);
        };

        function openQueenProfile(queenName) {
            setActiveTab("queens");
            const search = queensPane.querySelector("#queen-history-search");
            if (!search) return;
            search.value = queenName;
            search.dispatchEvent(new Event("input", { bubbles: true }));
            tabsShell.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        tabButtons.forEach((button) => {
            button.addEventListener("click", () => {
                setActiveTab(button.getAttribute("data-history-tab") || "seasons");
            });
        });

        renderOverview(franchiseNames, storedHistory, displayedHistoryRows);

        const viewPrefs = readHistoryViewPrefs();
        const seasonsToolbar = document.createElement("section");
        seasonsToolbar.className = "history-seasons-toolbar";
        seasonsToolbar.innerHTML = ""
            + '<div class="history-seasons-toolbar-group">'
            + '<input type="search" id="history-season-search" class="history-season-search-input" placeholder="Search season, winner, or date..." aria-label="Search seasons">'
            + '<select id="history-season-sort" class="history-season-sort-select" aria-label="Sort seasons">'
            + '<option value="manual">Your order</option>'
            + '<option value="newest">Newest first</option>'
            + '<option value="oldest">Oldest first</option>'
            + '<option value="name">Season name A-Z</option>'
            + '<option value="cast">Largest cast first</option>'
            + '</select>'
            + '<div class="history-density" role="group" aria-label="Season layout">'
            + '<button type="button" data-density="grid" title="Cards" aria-label="Cards"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i></button>'
            + '<button type="button" data-density="list" title="Compact list" aria-label="Compact list"><i class="fa-solid fa-list" aria-hidden="true"></i></button>'
            + '</div>'
            + '</div>'
            + '<p id="history-season-summary" class="history-season-summary"></p>';
        seasonsPane.appendChild(seasonsToolbar);

        const searchInput = seasonsToolbar.querySelector("#history-season-search");
        const sortSelect = seasonsToolbar.querySelector("#history-season-sort");
        const summary = seasonsToolbar.querySelector("#history-season-summary");
        const densityButtons = Array.from(seasonsToolbar.querySelectorAll("[data-density]"));
        sortSelect.value = viewPrefs.sort;
        if (!sortSelect.value) sortSelect.value = "manual";

        const emptyFranchise = document.createElement("div");
        emptyFranchise.className = "history-season-empty";

        const grid = document.createElement("div");
        grid.className = "history-season-grid";
        seasonsPane.appendChild(emptyFranchise);
        seasonsPane.appendChild(grid);

        const moreWrap = document.createElement("div");
        moreWrap.className = "history-season-more";
        seasonsPane.appendChild(moreWrap);

        const applyDensity = (density) => {
            grid.classList.toggle("history-season-grid--list", density === "list");
            densityButtons.forEach((button) => {
                const isActive = button.dataset.density === density;
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
        };
        applyDensity(viewPrefs.density);
        densityButtons.forEach((button) => {
            button.addEventListener("click", () => {
                applyDensity(button.dataset.density);
                writeHistoryViewPrefs({ density: button.dataset.density });
            });
        });

        const getSeasonTimestamp = (season) => {
            const parsed = Date.parse(String(season && season.date || ""));
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const getSeasonNumeric = (value) => {
            const num = Number(value);
            return Number.isFinite(num) ? num : 0;
        };

        const getSeasonSearchKey = (season) => normalizeHistoryNameKey([
            season && season.name,
            season && season.winner,
            season && season.date
        ].filter(Boolean).join(" "));

        const sortRows = (rows, mode) => {
            const sorted = rows.slice();
            if (mode === "manual") {
                return sorted;
            }
            if (mode === "oldest") {
                sorted.sort((a, b) => getSeasonTimestamp(a.season) - getSeasonTimestamp(b.season));
                return sorted;
            }
            if (mode === "name") {
                sorted.sort((a, b) => String(a.season && a.season.name || "Season").localeCompare(String(b.season && b.season.name || "Season"), undefined, { numeric: true, sensitivity: "base" }));
                return sorted;
            }
            if (mode === "cast") {
                sorted.sort((a, b) => getSeasonNumeric(b.season && b.season.castSize) - getSeasonNumeric(a.season && a.season.castSize));
                return sorted;
            }
            sorted.sort((a, b) => getSeasonTimestamp(b.season) - getSeasonTimestamp(a.season));
            return sorted;
        };

        let visibleLimit = HISTORY_SEASONS_PAGE_SIZE;
        let visibleRows = [];

        const buildSeasonCard = ({ season, index: seasonIndex }, position, total, isManualSort) => {
            const card = document.createElement("article");
            card.className = "history-season-card";
            card.draggable = isManualSort;
            card.dataset.historySeasonIndex = String(seasonIndex);

            const seasonName = escapeHistoryText(season.name || ("Season " + (position + 1)));
            const winnerThumbMarkup = typeof buildHistoryWinnerThumbMarkup === "function"
                ? buildHistoryWinnerThumbMarkup(season)
                : '<div class="history-winner-thumb" style="background:url(\'' + (season.winnerImg || "") + '\') center/cover no-repeat"></div>';
            const winnerLabel = typeof buildHistoryWinnerLabel === "function"
                ? buildHistoryWinnerLabel(season)
                : (season.winner || "Unknown");
            const storage = season.historyStorage || {};
            const canMoveUp = !isManualSort || position > 0;
            const canMoveDown = !isManualSort || position < total - 1;

            card.innerHTML = ""
                + '<div class="history-season-cover" role="button" tabindex="0" data-season-action="open" aria-label="Open ' + seasonName + '">'
                +   winnerThumbMarkup
                +   '<span class="history-season-sync" title="' + (storage.cloud ? "Saved in the cloud" : "Saved on this device") + '"><i class="fa-solid ' + (storage.cloud ? "fa-cloud" : "fa-hard-drive") + '" aria-hidden="true"></i></span>'
                + '</div>'
                + '<div class="history-card-body">'
                +   '<h3 class="history-card-title">' + seasonName + '</h3>'
                +   '<p class="history-card-winner"><i class="fa-solid fa-crown" aria-hidden="true"></i> ' + winnerLabel + '</p>'
                +   '<p class="history-card-stats">' + (season.castSize || "?") + ' queens &middot; ' + (season.episodes || "?") + ' episodes' + (season.date ? ' &middot; ' + escapeHistoryText(season.date) : '') + '</p>'
                +   (canShowAdminHistoryDebug() ? renderHistoryStorageBadges(season) : '')
                +   '<div class="history-season-drop-indicator" hidden></div>'
                + '</div>'
                + '<div class="history-card-buttons">'
                +   '<button type="button" class="history-card-open" data-season-action="open"><i class="fa-solid fa-eye" aria-hidden="true"></i> Open</button>'
                +   '<button type="button" data-season-action="share" title="Share" aria-label="Share"><i class="fa-solid fa-link" aria-hidden="true"></i></button>'
                +   '<button type="button" data-season-action="resim" title="Simulate again" aria-label="Simulate again"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>'
                +   '<details class="history-card-menu">'
                +     '<summary title="More" aria-label="More"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></summary>'
                +     '<div class="history-card-menu-list">'
                +       '<button type="button" data-season-action="rename"><i class="fa-solid fa-pen" aria-hidden="true"></i> Rename</button>'
                +       '<button type="button" data-season-action="up"' + (canMoveUp ? '' : ' disabled') + '><i class="fa-solid fa-arrow-up" aria-hidden="true"></i> Move up</button>'
                +       '<button type="button" data-season-action="down"' + (canMoveDown ? '' : ' disabled') + '><i class="fa-solid fa-arrow-down" aria-hidden="true"></i> Move down</button>'
                +       '<button type="button" data-season-action="transfer"><i class="fa-solid fa-right-left" aria-hidden="true"></i> Move to franchise</button>'
                +       '<button type="button" class="danger" data-season-action="delete"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>'
                +     '</div>'
                +   '</details>'
                + '</div>';
            return card;
        };

        const appendVisibleCards = (from, to) => {
            const isManualSort = sortSelect.value === "manual";
            const fragment = document.createDocumentFragment();
            for (let position = from; position < to; position += 1) {
                fragment.appendChild(buildSeasonCard(visibleRows[position], position, visibleRows.length, isManualSort));
            }
            grid.appendChild(fragment);
        };

        const renderMoreButton = () => {
            const remaining = visibleRows.length - grid.children.length;
            moreWrap.innerHTML = remaining > 0
                ? '<button type="button" class="history-season-more-btn">Show ' + Math.min(remaining, HISTORY_SEASONS_PAGE_SIZE) + ' more <span>(' + remaining + ' left)</span></button>'
                : "";
        };

        const renderSeasonCards = () => {
            const query = String(searchInput && searchInput.value || "").trim();
            const normalizedQuery = normalizeHistoryNameKey(query);
            const sortMode = String(sortSelect && sortSelect.value || "newest");
            const filteredRows = normalizedQuery
                ? displayedHistoryRows.filter(({ season }) => getSeasonSearchKey(season).includes(normalizedQuery))
                : displayedHistoryRows;
            visibleRows = sortRows(filteredRows, sortMode);

            if (summary) {
                summary.textContent = normalizedQuery
                    ? visibleRows.length + " of " + displayedHistoryRows.length + " seasons match \"" + query + "\""
                    : "";
            }

            grid.innerHTML = "";
            moreWrap.innerHTML = "";
            if (visibleRows.length === 0) {
                emptyFranchise.innerHTML = '<p>No seasons found in <b>' + escapeHistoryText(activeFranchise) + '</b>' + (normalizedQuery ? ' for "' + escapeHistoryText(query) + '"' : '') + '.</p>';
                emptyFranchise.hidden = false;
                return;
            }
            emptyFranchise.hidden = true;
            // Searching shows every match; paging only applies to the full list.
            appendVisibleCards(0, normalizedQuery ? visibleRows.length : Math.min(visibleLimit, visibleRows.length));
            renderMoreButton();
        };

        moreWrap.addEventListener("click", (event) => {
            if (!event.target.closest(".history-season-more-btn")) return;
            const from = grid.children.length;
            visibleLimit = from + HISTORY_SEASONS_PAGE_SIZE;
            appendVisibleCards(from, Math.min(visibleLimit, visibleRows.length));
            renderMoreButton();
        });

        // One listener for every card, however many seasons are saved.
        grid.addEventListener("click", (event) => {
            const actionEl = event.target.closest("[data-season-action]");
            if (!actionEl || actionEl.disabled) return;
            const card = actionEl.closest(".history-season-card");
            if (!card) return;
            const seasonIndex = Number(card.dataset.historySeasonIndex);
            const season = currentHistory[seasonIndex];
            const openMenu = actionEl.closest("details");
            if (openMenu) openMenu.open = false;

            const action = actionEl.dataset.seasonAction;
            if ((action === "up" || action === "down") && sortSelect.value !== "manual") {
                sortSelect.value = "manual";
                writeHistoryViewPrefs({ sort: "manual" });
                renderSeasonCards();
                toast("Switched to Your order. Move it from here.");
                return;
            }

            switch (action) {
                case "open": window.viewSingleSeason(seasonIndex); break;
                case "share": window.shareHistorySeason(seasonIndex); break;
                case "resim": window.reSimFromHistory(seasonIndex); break;
                case "rename": window.renameHistorySeason(seasonIndex); break;
                case "up": window.moveHistorySeason(seasonIndex, -1); break;
                case "down": window.moveHistorySeason(seasonIndex, 1); break;
                case "transfer":
                    window.transferHistorySeason(season && season.id !== undefined && season.id !== null && season.id !== "" ? season.id : seasonIndex);
                    break;
                case "delete": window.deleteFromHistory(seasonIndex); break;
                default: break;
            }
        });

        grid.addEventListener("keydown", (event) => {
            if ((event.key === "Enter" || event.key === " ") && event.target.classList.contains("history-season-cover")) {
                event.preventDefault();
                event.target.click();
            }
        });

        grid.addEventListener("toggle", (event) => {
            if (!event.target.open) return;
            grid.querySelectorAll("details.history-card-menu[open]").forEach((menu) => {
                if (menu !== event.target) menu.open = false;
            });
        }, true);

        const clearDropTarget = (card) => {
            card.classList.remove("history-season-card--drop-target");
            const indicator = card.querySelector(".history-season-drop-indicator");
            if (indicator) indicator.hidden = true;
        };

        grid.addEventListener("dragstart", (event) => {
            const card = event.target.closest && event.target.closest(".history-season-card");
            if (!card || !card.draggable) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", card.dataset.historySeasonIndex);
            card.classList.add("history-season-card--dragging");
        });
        grid.addEventListener("dragend", (event) => {
            const card = event.target.closest && event.target.closest(".history-season-card");
            if (card) {
                card.classList.remove("history-season-card--dragging");
                clearDropTarget(card);
            }
        });
        grid.addEventListener("dragover", (event) => {
            const card = event.target.closest(".history-season-card");
            if (!card || sortSelect.value !== "manual") return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            card.classList.add("history-season-card--drop-target");
        });
        grid.addEventListener("dragleave", (event) => {
            const card = event.target.closest(".history-season-card");
            if (card && !card.contains(event.relatedTarget)) clearDropTarget(card);
        });
        grid.addEventListener("drop", (event) => {
            const card = event.target.closest(".history-season-card");
            if (!card || sortSelect.value !== "manual") return;
            event.preventDefault();
            clearDropTarget(card);
            const fromIndex = Number(event.dataTransfer.getData("text/plain"));
            const toIndex = Number(card.dataset.historySeasonIndex);
            if (Number.isInteger(fromIndex) && fromIndex !== toIndex) {
                void reorderActiveHistorySeason(fromIndex, toIndex);
            }
        });

        let searchTimer = null;
        searchInput.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                visibleLimit = HISTORY_SEASONS_PAGE_SIZE;
                renderSeasonCards();
            }, 120);
        });
        sortSelect.addEventListener("change", () => {
            visibleLimit = HISTORY_SEASONS_PAGE_SIZE;
            writeHistoryViewPrefs({ sort: sortSelect.value });
            renderSeasonCards();
        });
        renderSeasonCards();
        setActiveTab(historyActiveView);

        mainBlock.__updateHistorySeasonList = (nextHistoryState) => {
            const nextStoredHistory = nextHistoryState && Array.isArray(nextHistoryState.seasons)
                ? nextHistoryState.seasons
                : [];
            const nextFranchiseNames = resolveHistoryFranchiseNames(nextStoredHistory);
            if (!nextFranchiseNames.includes(activeFranchise)) {
                return false;
            }

            currentHistory = nextStoredHistory;
            displayedHistoryRows = nextStoredHistory.reduce((rows, season, index) => {
                if (getSeasonHistoryFranchise(season) === activeFranchise) {
                    rows.push({ season, index });
                }
                return rows;
            }, []);
            window.historyCloudMergedSeasons = nextStoredHistory;
            renderHistoryCloudPanel(nextHistoryState);
            updateAdminHistoryDebugChip(nextHistoryState);
            renderOverview(nextFranchiseNames, nextStoredHistory, displayedHistoryRows);
            awardsStale = true;
            queensStale = true;
            renderSeasonCards();
            refreshOpenPane(historyActiveView);
            return true;
        };
    };

    const originalAddSeasonRecordToHistory = window.addSeasonRecordToHistory;
    if (typeof originalAddSeasonRecordToHistory === "function" && !window.__historyCloudPatchedAddSeasonRecord) {
        window.__historyCloudPatchedAddSeasonRecord = true;

        function showHistorySavePopup(message) {
            const text = String(message || "Could not save this season right now.");
            if (typeof showCustomStatusPopup === "function") {
                showCustomStatusPopup(text, "Season History", { modal: true });
                return;
            }
            if (typeof window.alert === "function") {
                window.alert(text);
            }
        }

        function prepareCloudOnlyRecord(record, options) {
            if (!record || typeof record !== "object") {
                return null;
            }

            const nextRecord = cloneHistorySeason(record);
            if (nextRecord.id === undefined || nextRecord.id === null || nextRecord.id === "") {
                nextRecord.id = "season-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
            }

            const requestedFranchise = options && options.franchise ? options.franchise : "";
            const activeFranchise = typeof window.getCurrentSeasonHistoryFranchise === "function"
                ? window.getCurrentSeasonHistoryFranchise()
                : "Main";
            const rawFranchise = requestedFranchise || nextRecord.historyFranchise || activeFranchise || "Main";
            const normalizedFranchise = typeof window.normalizeSeasonHistoryFranchiseName === "function"
                ? window.normalizeSeasonHistoryFranchiseName(rawFranchise)
                : (String(rawFranchise || "Main").trim() || "Main");

            nextRecord.historyFranchise = normalizedFranchise;
            nextRecord.savedAt = nextRecord.savedAt || new Date().toISOString();
            return nextRecord;
        }

        function hasMatchingHistorySeason(seasons, record) {
            if (!Array.isArray(seasons) || !record || typeof record !== "object") {
                return false;
            }
            const compactRecord = compactSeasonForCloudStorage(record);
            const recordId = compactRecord && compactRecord.id !== undefined && compactRecord.id !== null
                ? String(compactRecord.id)
                : "";
            const recordKey = getSeasonStorageKey(compactRecord || record, "verify", 0);
            const recordName = String((compactRecord && compactRecord.name) || "").trim().toLowerCase();
            const recordDate = String((compactRecord && compactRecord.date) || "");
            const recordWinner = String((compactRecord && compactRecord.winner) || "").trim().toLowerCase();
            const recordEpisodes = Number((compactRecord && compactRecord.episodes) || 0);
            const recordCastSize = Number((compactRecord && compactRecord.castSize) || 0);
            const recordFranchise = String((compactRecord && compactRecord.historyFranchise) || "").trim().toLowerCase();

            return seasons.some((season, index) => {
                if (!season || typeof season !== "object") {
                    return false;
                }

                if (recordId) {
                    const seasonId = season.id !== undefined && season.id !== null
                        ? String(season.id)
                        : "";
                    if (seasonId && seasonId === recordId) {
                        return true;
                    }
                }

                if (getSeasonStorageKey(season, "list", index) === recordKey) {
                    return true;
                }

                return String(season.name || "").trim().toLowerCase() === recordName
                    && String(season.date || "") === recordDate
                    && String(season.winner || "").trim().toLowerCase() === recordWinner
                    && Number(season.episodes || 0) === recordEpisodes
                    && Number(season.castSize || 0) === recordCastSize
                    && String(season.historyFranchise || "").trim().toLowerCase() === recordFranchise;
            });
        }

        async function offerLocalSeasonReplacement(record, options, failureMessage) {
            let collections;
            try {
                collections = await readHistoryCollections({ forceCloudRead: true });
            } catch (_err) {
                collections = null;
            }

            const localSeasons = collections && Array.isArray(collections.localSeasons)
                ? collections.localSeasons
                : readLocalHistoryCache();
            const freshCloudSeasons = collections && Array.isArray(collections.cloudSeasons)
                ? collections.cloudSeasons
                : [];
            const cachedCloudSeasons = Array.isArray(window.historyCloudMergedSeasons)
                ? window.historyCloudMergedSeasons.filter(season => season && season.historyStorage && season.historyStorage.cloud)
                : [];
            const cloudSeasons = freshCloudSeasons.length > 0 ? freshCloudSeasons : cachedCloudSeasons;
            const candidates = localSeasons.filter(localSeason => hasMatchingHistorySeason(cloudSeasons, localSeason));

            if (candidates.length === 0) {
                showHistorySavePopup(failureMessage + " No local seasons confirmed in cloud are available to replace.");
                return false;
            }

            const existing = document.getElementById("history-local-replacement-modal");
            if (existing) existing.remove();

            const modal = document.createElement("div");
            modal.id = "history-local-replacement-modal";
            modal.className = "history-save-modal active";
            modal.setAttribute("aria-hidden", "false");

            const card = document.createElement("div");
            card.className = "history-save-modal-card generate-cast-card";
            card.setAttribute("role", "dialog");
            card.setAttribute("aria-modal", "true");
            card.setAttribute("aria-labelledby", "history-local-replacement-title");

            const title = document.createElement("h3");
            title.id = "history-local-replacement-title";
            title.textContent = "Make Room for This Season";

            const explanation = document.createElement("p");
            explanation.textContent = failureMessage + " Choose a local season that is already backed up in cloud. Only its local copy will be removed.";

            const select = document.createElement("select");
            select.setAttribute("aria-label", "Local cloud-backed season to replace");
            candidates.forEach((season, index) => {
                const option = document.createElement("option");
                option.value = String(index);
                option.textContent = (season.name || "Unnamed Season") + " - " + (season.date || "No date");
                select.appendChild(option);
            });

            const actions = document.createElement("div");
            actions.className = "history-save-modal-actions";
            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "Keep Existing Seasons";
            const replaceButton = document.createElement("button");
            replaceButton.type = "button";
            replaceButton.textContent = "Replace Local Copy";

            const close = () => {
                if (typeof window.deactivateCenteredPopup === "function") {
                    window.deactivateCenteredPopup(modal);
                }
                modal.remove();
            };

            cancelButton.onclick = close;
            replaceButton.onclick = () => {
                replaceButton.disabled = true;
                const candidate = candidates[Number(select.value) || 0];
                const candidateFranchise = String(candidate.historyFranchise || "Main");
                const targetFranchise = String((options && options.franchise) || record.historyFranchise || "Main");
                const candidateSnapshot = window.getLocalSeasonHistoryRecords(candidateFranchise).slice();
                const targetSnapshot = candidateFranchise === targetFranchise
                    ? candidateSnapshot
                    : window.getLocalSeasonHistoryRecords(targetFranchise).slice();
                const candidateKey = getSeasonStorageKey(candidate, "replacement", 0);
                const remaining = candidateSnapshot.filter((season, index) => (
                    getSeasonStorageKey(season, "local", index) !== candidateKey
                ));

                const removed = window.setLocalSeasonHistoryRecords(candidateFranchise, remaining);
                const stored = removed && originalAddSeasonRecordToHistory(record, {
                    ...(options || {}),
                    franchise: targetFranchise,
                    source: "local-replacement"
                });

                if (!stored) {
                    window.setLocalSeasonHistoryRecords(candidateFranchise, candidateSnapshot);
                    if (candidateFranchise !== targetFranchise) {
                        window.setLocalSeasonHistoryRecords(targetFranchise, targetSnapshot);
                    }
                    replaceButton.disabled = false;
                    showHistorySavePopup("Could not make enough local space. Export this season as a backup before clearing browser data.");
                    return;
                }

                window.pendingCloudOnlyHistoryRecord = null;
                close();
                toast('Saved "' + (record.name || "Season") + '" locally. The replaced season remains in cloud.');
                showHistorySavePopup('Saved "' + (record.name || "Season") + '" locally. The replaced season remains in cloud.');
            };

            actions.appendChild(cancelButton);
            actions.appendChild(replaceButton);
            card.appendChild(title);
            card.appendChild(explanation);
            card.appendChild(select);
            card.appendChild(actions);
            modal.appendChild(card);
            document.body.appendChild(modal);
            if (typeof window.activateCenteredPopup === "function") {
                window.activateCenteredPopup(modal);
            }
            return true;
        }

        window.addSeasonRecordToHistory = function patchedAddSeasonRecordToHistory(record, options) {
            const canFallbackToCloud = record && typeof record === "object";
            let injectedPendingCloudOnlyRecord = false;
            if (!window.pendingCloudOnlyHistoryRecord && canFallbackToCloud) {
                window.pendingCloudOnlyHistoryRecord = cloneHistorySeason(record);
                injectedPendingCloudOnlyRecord = true;
            }

            const stored = originalAddSeasonRecordToHistory.apply(this, arguments);
            if (stored && injectedPendingCloudOnlyRecord) {
                window.pendingCloudOnlyHistoryRecord = null;
            }
            if (!stored) {
                const pendingCloudOnlyRecord = window.pendingCloudOnlyHistoryRecord && typeof window.pendingCloudOnlyHistoryRecord === "object"
                    ? window.pendingCloudOnlyHistoryRecord
                    : null;
                const cloudOnlyRecord = prepareCloudOnlyRecord(
                    pendingCloudOnlyRecord || (canFallbackToCloud ? cloneHistorySeason(record) : null),
                    options
                );
                if (!cloudOnlyRecord || typeof cloudOnlyRecord !== "object") {
                    return stored;
                }

                showHistorySavePopup("Local history storage is full. Attempting cloud save for this season.");

                Promise.resolve().then(async () => {
                    try {
                        const result = await upsertSeasonToCloud(cloudOnlyRecord);
                        if (!result || result.saved === false) {
                            const reasonCode = result && result.reason
                                ? result.reason
                                : (!navigator.onLine ? "offline" : (!getCurrentUid() ? "not-signed-in" : "cloud-unavailable"));
                            const reason = reasonCode === "offline"
                                ? "You are offline."
                                : reasonCode === "not-signed-in"
                                    ? "You are not signed in."
                                    : reasonCode === "cloud-unavailable"
                                        ? "Cloud history is unavailable right now."
                                        : reasonCode === "resource-exhausted"
                                            ? "Cloud history has temporarily reached its write limit. Please try again in a few minutes."
                                            : "Please try again in a moment.";
                            const storageType = reasonCode === "offline" || reasonCode === "not-signed-in" || reasonCode === "cloud-unavailable"
                                ? "local storage is full and cloud upload failed"
                                : "cloud storage is unavailable";
                            toast("Cannot save season: " + storageType + ". " + reason, true);
                            await offerLocalSeasonReplacement(cloudOnlyRecord, options, "Cannot save season: " + storageType + ". " + reason);
                            return;
                        }

                        window.pendingCloudOnlyHistoryRecord = null;
                        window.historyCloudMergedSeasons = mergeSeasonLists(
                            Array.isArray(window.historyCloudMergedSeasons) ? window.historyCloudMergedSeasons : [],
                            [cloudOnlyRecord]
                        );

                        const uid = getCurrentUid();
                        if (uid) {
                            historyCloudReadCacheByUid.delete(uid);
                            historyCloudReadRequestByUid.delete(uid);
                        }

                        let cloudVisible = false;
                        try {
                            const verifiedCollections = await readHistoryCollections();
                            cloudVisible = hasMatchingHistorySeason(verifiedCollections.cloudSeasons, cloudOnlyRecord);
                        } catch (_verifyErr) {
                            cloudVisible = hasMatchingHistorySeason(window.historyCloudMergedSeasons, cloudOnlyRecord);
                        }

                        if (!cloudVisible) {
                            try {
                                const forcedCollections = await readHistoryCollections({ forceCloudRead: true });
                                cloudVisible = hasMatchingHistorySeason(forcedCollections.cloudSeasons, cloudOnlyRecord);
                            } catch (_forcedVerifyErr) {
                                // Keep optimistic success path below when visibility checks are inconclusive.
                            }
                        }

                        const backendLabel = result && result.cloudBackend === "rtdb"
                            ? "Realtime DB fallback"
                            : result && result.cloudBackend === "firestore"
                                ? "Firestore"
                                : "cloud";

                        if (!cloudVisible) {
                            toast("Cloud upload succeeded (" + backendLabel + "), but visibility may take a moment to update.");
                            showHistorySavePopup("Cloud upload successful (" + backendLabel + "). This season may take a moment to appear in history.");
                            return;
                        }

                        toast("Local history storage is full. This season was saved to cloud only (" + backendLabel + ").");
                        showHistorySavePopup("Cloud upload successful. This season was saved to cloud only (" + backendLabel + ").");
                    } catch (err) {
                        const reasonCode = err && err.historySyncReason
                            ? err.historySyncReason
                            : (!navigator.onLine ? "offline" : (!getCurrentUid() ? "not-signed-in" : "retry"));
                        const reason = reasonCode === "resource-exhausted"
                            ? "Cloud history has temporarily reached its write limit. Please try again in a few minutes."
                            : "Please check your connection and try again.";
                        const failureMessage = "Cannot save season: local storage is full and cloud upload failed. " + reason;
                        toast(failureMessage, true);
                        await offerLocalSeasonReplacement(cloudOnlyRecord, options, failureMessage);
                    }
                });
                return true;
            }

            Promise.resolve().then(async () => {
                const localSnapshot = readLocalHistoryCache();
                if (!Array.isArray(localSnapshot) || localSnapshot.length === 0) {
                    return;
                }

                const recordId = record && record.id !== undefined && record.id !== null
                    ? String(record.id)
                    : "";
                let createdRecord = recordId
                    ? localSnapshot.find((entry) => String(entry && entry.id) === recordId)
                    : null;

                if (!createdRecord && record && typeof record === "object") {
                    const name = String(record.name || "").trim().toLowerCase();
                    const date = String(record.date || "");
                    const winner = String(record.winner || "").trim().toLowerCase();
                    const episodes = Number(record.episodes || 0);
                    createdRecord = localSnapshot.find((entry) => (
                        String(entry && entry.name || "").trim().toLowerCase() === name
                        && String(entry && entry.date || "") === date
                        && String(entry && entry.winner || "").trim().toLowerCase() === winner
                        && Number(entry && entry.episodes || 0) === episodes
                    ));
                }

                if (!createdRecord) {
                    createdRecord = localSnapshot[0];
                }

                if (!createdRecord) {
                    return;
                }

                try {
                    const collections = await readHistoryCollectionsForWrite();
                    if (!collections.cloudAvailable || !collections.cloudLoaded) {
                        const syncError = new Error("Cloud history sync failed.");
                        syncError.historySyncReason = !navigator.onLine
                            ? "offline"
                            : (!getCurrentUid() ? "not-signed-in" : "cloud-unavailable");
                        throw syncError;
                    }

                    const mergedCloud = mergeSeasonLists(collections.cloudSeasons, localSnapshot);
                    if (getHistorySeasonsFingerprint(mergedCloud) !== getHistorySeasonsFingerprint(collections.cloudSeasons)) {
                        await writeCloudHistory(mergedCloud);
                    }
                } catch (err) {
                    const reasonCode = err && err.historySyncReason
                        ? err.historySyncReason
                        : (!navigator.onLine ? "offline" : (!getCurrentUid() ? "not-signed-in" : "retry"));
                    const reason = reasonCode === "offline"
                        ? "You are offline."
                        : reasonCode === "not-signed-in"
                            ? "You are not signed in."
                            : reasonCode === "cloud-unavailable"
                                ? "Cloud history is unavailable right now."
                                : reasonCode === "resource-exhausted"
                                    ? "Cloud history has temporarily reached its write limit. Please try again in a few minutes."
                                    : "Please try again in a moment.";
                    toast("Season saved locally, but cloud sync failed. " + reason, true);
                }
            });

            return stored;
        };
    }

    readMergedHistory().then(() => {
        historyLoadReadyResolve();
    }).catch(() => {
        syncCastBuilderHistoryCache({
            seasons: [],
            cloudAvailable: false,
            cloudLoaded: false,
            cloudExists: false,
            usingLocalFallback: true,
            accessBlocked: false
        });
        historyLoadReadyResolve();
    });

    window.getHistoryRtdbWritingConfig = getHistoryRtdbWritingConfig;
    window.setHistoryRtdbWritingConfig = setHistoryRtdbWritingConfig;
    window.waitForHistoryCloudLoad = async function() {
        return historyLoadReadyPromise;
    };

    bindHistoryCloudAuthWatcher();
    void backfillLocalHistoryToCloud();
    void waitForAuthResolution().then(() => backfillLocalHistoryToCloud());
    window.addEventListener("online", () => {
        void backfillLocalHistoryToCloud();
    });
})();
