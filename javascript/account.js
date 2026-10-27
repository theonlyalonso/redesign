"use strict";

const accountFirebaseConfig = {
    apiKey: "AIzaSyDYU3_sg6va6RQAynL_WXv6WR8pOsbKaLY",
    authDomain: "simulatorsupe.firebaseapp.com",
    databaseURL: "https://simulatorsupe-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "simulatorsupe",
    storageBucket: "simulatorsupe.firebasestorage.app",
    messagingSenderId: "200924043045",
    appId: "1:200924043045:web:cd04a0b425cbd199b36ccc",
    measurementId: "G-56SWZ9GFLH"
};

const STAFF_EMAILS = ["desirelesbarrantes@gmail.com", "apokocymamy@gmail.com"];
const DISCORD_OAUTH_CONFIG = {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    userApiUrl: "https://discord.com/api/v10/users/@me",
    memberApiBaseUrl: "https://discord.com/api/v10/users/@me/guilds",
    scope: "identify guilds.members.read",
    embeddedClientId: "1481234667288920104",
    verificationTtlHours: 12,
    roleCheckGuildId: "1402856023152263258",
    roleCheckSponsorRoleId: "1428803753359839345",
    roleCheckHyperSponsorRoleId: "1455216477832740918",
    roleCheckSupporterRoleId: "1428332014221660251",
    roleCheckBoosterRoleId: "1450232222039805972",
    // Optional dedicated role for cloud actions.
    // When empty, cloud access falls back to existing tier rules.
    roleCheckCloudAccessRoleId: "1517517604204445826",
    // Global access toggle for regular sim scripts.
    // - "ALL_PAID_ROLES": sponsor OR supporter OR booster.
    // - "SPONSOR_ONLY": sponsor role only.
    accessMode: "ALL_PAID_ROLES",
    githubPagesRedirectPath: "/sponsors/drag/index.html",
    githubPagesRedirectExact: false,
    stateStorageKey: "ss.discord.oauth.state",
    intentStorageKey: "ss.discord.oauth.intent",
    pendingTokenStorageKey: "ss.discord.oauth.pendingToken"
};

const DISCORD_ACCESS_MODES = {
    SPONSOR_ONLY: "SPONSOR_ONLY",
    ALL_PAID_ROLES: "ALL_PAID_ROLES"
};

function getDiscordAccessMode() {
    return DISCORD_OAUTH_CONFIG.accessMode === DISCORD_ACCESS_MODES.SPONSOR_ONLY
        ? DISCORD_ACCESS_MODES.SPONSOR_ONLY
        : DISCORD_ACCESS_MODES.ALL_PAID_ROLES;
}

window.DISCORD_ACCESS_MODES = DISCORD_ACCESS_MODES;
window.getDiscordAccessMode = getDiscordAccessMode;

function evaluateDiscordAccessByMode({ hasHyperSponsorRole, hasSponsorRole, hasSupporterRole, hasBoosterRole }) {
    const hasAnyPaidRole = hasHyperSponsorRole || hasSponsorRole || hasSupporterRole || hasBoosterRole;

    return {
        granted: hasAnyPaidRole,
        reason: hasAnyPaidRole
            ? (hasHyperSponsorRole
                ? "Hyperstar role verified."
                : hasSponsorRole
                    ? "Superstar role verified."
                    : hasSupporterRole
                        ? "Supporter role verified."
                        : "Booster role verified.")
            : "Any access role has not been found."
    };
}

const CUSTOM_LOCAL_BACKUP_STORAGE_KEY = "ss.local.custom.backup";
const CUSTOM_LOCAL_RELOAD_FLAG_KEY = "ss.local.custom.restore.reload";
const DISCORD_LINK_START_ON_HOME_KEY = "ss.discord.oauth.startOnHome";

if (typeof window.showInHouseAlert !== "function" || typeof window.showInHousePasswordPrompt !== "function") {
    const nativeAlert = typeof window.alert === "function" ? window.alert.bind(window) : () => {};
    const nativeConfirm = typeof window.confirm === "function" ? window.confirm.bind(window) : () => false;
    const nativePrompt = typeof window.prompt === "function" ? window.prompt.bind(window) : () => null;

    function escapeInHouseDialogText(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function openInHouseDialog(options = {}) {
        const mode = options.mode || "alert";
        const title = options.title || (mode === "confirm" ? "Confirm" : mode === "prompt" ? "Enter a value" : "Notice");
        const message = String(options.message ?? "");
        const confirmText = options.confirmText || (mode === "prompt" ? "Save" : "OK");
        const cancelText = options.cancelText || "Cancel";
        const defaultValue = String(options.defaultValue ?? "");

        if (!document?.body) {
            if (mode === "confirm") return Promise.resolve(nativeConfirm(message));
            if (mode === "prompt") return Promise.resolve(nativePrompt(message, defaultValue));
            nativeAlert(message);
            return Promise.resolve(undefined);
        }

        return new Promise((resolve) => {
            const modal = document.createElement("div");
            modal.className = "history-save-modal active";
            modal.setAttribute("aria-hidden", "false");
            modal.innerHTML = `
                <div class="history-save-modal-card generate-cast-card" role="dialog" aria-modal="true" aria-label="${escapeInHouseDialogText(title)}">
                    <button type="button" class="generate-cast-close" aria-label="Close dialog">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <h3>${escapeInHouseDialogText(title)}</h3>
                    <p class="generate-cast-subtitle" style="white-space: pre-wrap;">${escapeInHouseDialogText(message)}</p>
                    ${mode === "prompt" ? (options.inputType === "password"
                        ? `<input type="password" data-dialog-input autocomplete="current-password" aria-label="${escapeInHouseDialogText(title)}">`
                        : `<input type="text" data-dialog-input maxlength="160" value="${escapeInHouseDialogText(defaultValue)}">`) : ""}
                    <div class="generate-cast-actions">
                        ${mode !== "alert" ? `<button type="button" data-action="cancel">${escapeInHouseDialogText(cancelText)}</button>` : ""}
                        <button type="button" data-action="confirm">${escapeInHouseDialogText(confirmText)}</button>
                    </div>
                </div>
            `;

            const closeBtn = modal.querySelector(".generate-cast-close");
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const confirmBtn = modal.querySelector('[data-action="confirm"]');
            const input = modal.querySelector("[data-dialog-input]");

            const finish = (result) => {
                if (modal._closing) return;
                modal._closing = true;
                if (typeof deactivateCenteredPopup === "function") {
                    deactivateCenteredPopup(modal);
                }
                modal.remove();
                resolve(result);
            };

            if (typeof activateCenteredPopup === "function") {
                document.body.appendChild(modal);
                activateCenteredPopup(modal);
            } else {
                modal.style.display = "flex";
                modal.style.position = "fixed";
                modal.style.inset = "0";
                modal.style.zIndex = "2147483647";
                modal.style.pointerEvents = "auto";
                modal.style.justifyContent = "center";
                modal.style.alignItems = "center";
                document.body.appendChild(modal);
            }

            if (closeBtn) closeBtn.addEventListener("click", () => finish(mode === "confirm" ? false : mode === "prompt" ? null : undefined));
            if (cancelBtn) cancelBtn.addEventListener("click", () => finish(mode === "prompt" ? null : false));
            if (confirmBtn) confirmBtn.addEventListener("click", () => finish(mode === "prompt" ? input?.value ?? "" : true));
            modal.addEventListener("click", (event) => {
                if (event.target === modal) finish(mode === "confirm" ? false : mode === "prompt" ? null : undefined);
            });
            modal.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    finish(mode === "confirm" ? false : mode === "prompt" ? null : undefined);
                } else if (event.key === "Enter") {
                    finish(mode === "prompt" ? input?.value ?? "" : true);
                }
            });

            requestAnimationFrame(() => {
                if (input) {
                    input.focus();
                    input.select();
                } else if (confirmBtn) {
                    confirmBtn.focus();
                }
            });
        });
    }

    if (typeof window.showInHouseAlert !== "function") {
        window.showInHouseAlert = function(message, title = "Notice") {
            return openInHouseDialog({ mode: "alert", title, message });
        };

        window.showInHouseConfirm = function(message, title = "Confirm") {
            return openInHouseDialog({ mode: "confirm", title, message, confirmText: "OK", cancelText: "Cancel" });
        };

        window.showInHousePrompt = function(message, defaultValue = "", title = "Enter a value") {
            return openInHouseDialog({ mode: "prompt", title, message, defaultValue, confirmText: "Save", cancelText: "Cancel" });
        };

        window.alert = function(message) {
            void window.showInHouseAlert(message);
        };
    }

    if (typeof window.showInHousePasswordPrompt !== "function") {
        window.showInHousePasswordPrompt = function(message, title = "Confirm your password", confirmText = "Confirm") {
            return openInHouseDialog({ mode: "prompt", title, message, inputType: "password", confirmText, cancelText: "Cancel" });
        };
    }
}

function isMeaningfulLocalValue(value) {
    return value !== null && value !== "" && value !== "[]" && value !== "{}";
}

const ADBLOCK_WARNING_SESSION_KEY = "ss.adblockWarningShown";

function detectPotentialAdBlocker() {
    return new Promise((resolve) => {
        if (!document?.body) {
            resolve(false);
            return;
        }

        const bait = document.createElement("div");
        bait.className = "adsbox ad-banner ad-unit ad-placement text-ad";
        bait.setAttribute("aria-hidden", "true");
        bait.style.position = "absolute";
        bait.style.left = "-10000px";
        bait.style.top = "-10000px";
        bait.style.width = "10px";
        bait.style.height = "10px";
        bait.style.pointerEvents = "none";
        bait.style.opacity = "0";

        document.body.appendChild(bait);

        requestAnimationFrame(() => {
            const style = window.getComputedStyle ? window.getComputedStyle(bait) : null;
            const blocked = (
                bait.offsetWidth === 0 ||
                bait.offsetHeight === 0 ||
                bait.clientWidth === 0 ||
                bait.clientHeight === 0 ||
                style?.display === "none" ||
                style?.visibility === "hidden"
            );
            bait.remove();
            resolve(Boolean(blocked));
        });
    });
}

async function warnIfAdBlockerDetected() {
    let alreadyWarned = false;
    try {
        alreadyWarned = sessionStorage.getItem(ADBLOCK_WARNING_SESSION_KEY) === "1";
    } catch (_err) {}

    if (alreadyWarned) return;

    const blocked = await detectPotentialAdBlocker();
    if (!blocked) return;

    try {
        sessionStorage.setItem(ADBLOCK_WARNING_SESSION_KEY, "1");
    } catch (_err) {}

    const message = "Ad blocker detected. Ad blockers can interfere with Simulator Superstars scripts and cause bugs. Please disable your ad blocker for this site.";
    if (typeof window.showInHouseAlert === "function") {
        void window.showInHouseAlert(message, "Ad blocker detected");
        return;
    }
    if (typeof window.alert === "function") {
        window.alert(message);
    }
}

function initAdBlockerWarning() {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            void warnIfAdBlockerDetected();
        }, { once: true });
        return;
    }
    void warnIfAdBlockerDetected();
}

initAdBlockerWarning();

function snapshotCustomLocalDataForOAuth() {
    try {
        const customEntries = {};
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith("custom")) continue;
            customEntries[key] = localStorage.getItem(key);
        }
        const payload = JSON.stringify({
            savedAt: Date.now(),
            keys: customEntries
        });

        sessionStorage.setItem(CUSTOM_LOCAL_BACKUP_STORAGE_KEY, payload);

        try {
            localStorage.setItem(`${CUSTOM_LOCAL_BACKUP_STORAGE_KEY}.persistent`, payload);
        } catch (_e) {
            // Ignore localStorage failures (quota / blocked third-party storage)
        }
    } catch (err) {
        console.warn("Failed to snapshot custom local data before OAuth:", err);
    }
}

function restoreCustomLocalDataFromOAuthBackup() {
    try {
        let raw = sessionStorage.getItem(CUSTOM_LOCAL_BACKUP_STORAGE_KEY);
        if (!raw) {
            raw = localStorage.getItem(`${CUSTOM_LOCAL_BACKUP_STORAGE_KEY}.persistent`);
        }
        if (!raw) return 0;

        const parsed = JSON.parse(raw);
        const keys = parsed?.keys && typeof parsed.keys === "object" ? parsed.keys : {};
        let restoredCount = 0;

        Object.entries(keys).forEach(([key, backupValue]) => {
            if (!key || !key.startsWith("custom")) return;
            const currentValue = localStorage.getItem(key);
            if (!isMeaningfulLocalValue(currentValue) && isMeaningfulLocalValue(backupValue)) {
                localStorage.setItem(key, backupValue);
                restoredCount += 1;
            }
        });

        // Clean up both session and persistent backups
        sessionStorage.removeItem(CUSTOM_LOCAL_BACKUP_STORAGE_KEY);
        try {
            localStorage.removeItem(`${CUSTOM_LOCAL_BACKUP_STORAGE_KEY}.persistent`);
        } catch (_e) {}
        return restoredCount;
    } catch (err) {
        console.warn("Failed to restore custom local data after OAuth:", err);
        sessionStorage.removeItem(CUSTOM_LOCAL_BACKUP_STORAGE_KEY);
        try {
            localStorage.removeItem(`${CUSTOM_LOCAL_BACKUP_STORAGE_KEY}.persistent`);
        } catch (_e) {}
        return 0;
    }
}

function getDiscordProfilePermissions(linkData) {
    const ownerAccess = isOwnerEmail(currentUser?.email);
    if (ownerAccess) {
        return {
            tier: "HYPERSTAR",
            canUseBanner: true,
            canUseRichBio: true,
            canUseCloud: true,
            hasHyperSponsorRole: true,
            hasSponsorRole: true,
            hasSupporterRole: true,
            hasBoosterRole: true,
            hasCloudAccessRole: true,
            hasBothRoles: true
        };
    }

    const accessStatus = (linkData?.accessStatus || "").toString().toUpperCase();
    const roleData = linkData?.roleCheck || {};
    const linkedRoles = Array.isArray(roleData.roles) ? roleData.roles : [];
    const hyperSponsorRoleId = (DISCORD_OAUTH_CONFIG.roleCheckHyperSponsorRoleId || "").trim();
    const sponsorRoleId = (DISCORD_OAUTH_CONFIG.roleCheckSponsorRoleId || "").trim();
    const supporterRoleId = (DISCORD_OAUTH_CONFIG.roleCheckSupporterRoleId || "").trim();
    const boosterRoleId = (DISCORD_OAUTH_CONFIG.roleCheckBoosterRoleId || "").trim();
    const cloudAccessRoleId = (DISCORD_OAUTH_CONFIG.roleCheckCloudAccessRoleId || "").trim();

    const legacyTier = (linkData?.accessTier || "").toString().toUpperCase();
    const rawHasHyperSponsorRole = (hyperSponsorRoleId ? linkedRoles.includes(hyperSponsorRoleId) : false)
        || roleData.hasHyperSponsorRole === true
        || legacyTier === "HYPERSTAR";
    const rawHasSponsorRole = (sponsorRoleId ? linkedRoles.includes(sponsorRoleId) : false)
        || roleData.hasSponsorRole === true
        || legacyTier === "SUPERSTAR"
        || legacyTier === "SPONSOR";
    const rawHasSupporterRole = (supporterRoleId ? linkedRoles.includes(supporterRoleId) : false)
        || roleData.hasSupporterRole === true
        || legacyTier === "SUPPORTER";
    const rawHasBoosterRole = (boosterRoleId ? linkedRoles.includes(boosterRoleId) : false)
        || roleData.hasBoosterRole === true
        || legacyTier === "BOOSTER";
    const rawHasCloudAccessRole = rawHasHyperSponsorRole || rawHasSponsorRole;
    const rawHasBoth = rawHasSponsorRole && rawHasSupporterRole;

    const modeEvaluation = evaluateDiscordAccessByMode({
        hasHyperSponsorRole: rawHasHyperSponsorRole,
        hasSponsorRole: rawHasSponsorRole,
        hasSupporterRole: rawHasSupporterRole,
        hasBoosterRole: rawHasBoosterRole
    });
    const granted = accessStatus === "ACCEPTED" && modeEvaluation.granted;

    const hasHyperSponsorRole = granted ? rawHasHyperSponsorRole : false;
    const hasSponsorRole = granted ? rawHasSponsorRole : false;
    const hasSupporterRole = granted ? rawHasSupporterRole : false;
    const hasBoosterRole = granted ? rawHasBoosterRole : false;
    const hasCloudAccessRole = granted ? rawHasCloudAccessRole : false;
    const hasBothRoles = granted ? rawHasBoth : false;

    return {
        tier: granted ? (hasHyperSponsorRole ? "HYPERSTAR" : hasSponsorRole ? "SUPERSTAR" : hasSupporterRole ? "SUPPORTER" : hasBoosterRole ? "BOOSTER" : "NONE") : "NONE",
        canUseBanner: granted && (hasHyperSponsorRole || hasSponsorRole),
        canUseRichBio: granted && (hasHyperSponsorRole || hasSponsorRole),
        canUseCloud: granted && hasCloudAccessRole,
        hasHyperSponsorRole,
        hasSponsorRole,
        hasSupporterRole,
        hasBoosterRole,
        hasCloudAccessRole,
        hasBothRoles
    };
}

function sanitizeRichBioHtml(value) {
    const raw = (value || "").toString();
    return raw
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
        .replace(/<embed[^>]*>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/<meta[^>]*>/gi, "")
        .replace(/on\w+\s*=\s*(["']).*?\1/gi, "")
        .replace(/on\w+\s*=\s*[^\s>]+/gi, "")
        .replace(/javascript\s*:/gi, "");
}

function stripHtmlTags(value) {
    return (value || "")
        .toString()
        .replace(/<[^>]*>/g, "")
        .trim();
}

function getDiscordClientId() {
    if (DISCORD_OAUTH_CONFIG.embeddedClientId) {
        return DISCORD_OAUTH_CONFIG.embeddedClientId;
    }

    const fromWindow = typeof window.DISCORD_CLIENT_ID === "string" ? window.DISCORD_CLIENT_ID.trim() : "";
    if (fromWindow) return fromWindow;

    const fromStorage = typeof localStorage !== "undefined"
        ? (localStorage.getItem("discordClientId") || "").trim()
        : "";
    return fromStorage;
}

function getDiscordRedirect() {
    const configuredPath = (DISCORD_OAUTH_CONFIG.githubPagesRedirectPath || "").toString().trim();
    const configuredBasePath = (() => {
        let path = configuredPath || window.location.pathname;
        if (!path.startsWith("/")) path = `/${path}`;
        path = path.replace(/\/index\.html$/i, "");
        path = path.replace(/\/+$/, "");
        return path || "/";
    })();

    const sanitizeRedirect = (value) => {
        const candidate = (value || "").toString().trim();
        if (!candidate) return "";

        try {
            const url = new URL(candidate, window.location.href);
            if (url.origin !== window.location.origin) return "";

            const normalizedPath = (url.pathname || "")
                .replace(/\/index\.html$/i, "")
                .replace(/\/+$/, "") || "/";
            const matchesBase = normalizedPath === configuredBasePath;
            const isNestedUnderBase = configuredBasePath !== "/" && normalizedPath.startsWith(`${configuredBasePath}/`);
            if (!matchesBase && !isNestedUnderBase) return "";

            url.hash = "";
            return url.toString();
        } catch (_err) {
            return "";
        }
    };

    const overrideFromWindow = sanitizeRedirect(
        typeof window.DISCORD_REDIRECT_URI === "string" ? window.DISCORD_REDIRECT_URI : ""
    );
    if (overrideFromWindow) return overrideFromWindow;

    const overrideFromStorage = sanitizeRedirect(
        typeof localStorage !== "undefined" ? (localStorage.getItem("discordRedirectUri") || "") : ""
    );
    if (overrideFromStorage) return overrideFromStorage;

    if (typeof localStorage !== "undefined") {
        localStorage.removeItem("discordRedirectUri");
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.hash = "";
    currentUrl.search = "";

    return currentUrl.toString();
}

function getAccountHomePageUrl() {
    const currentUrl = new URL(window.location.href);
    const rawPath = currentUrl.pathname || "/";

    let homePath = rawPath;
    if (/\/index\.html$/i.test(homePath)) {
        // Already on home page path.
    } else if (homePath.endsWith("/")) {
        homePath = `${homePath}index.html`;
    } else if (/\/[^/]+\.[^/]+$/.test(homePath)) {
        homePath = homePath.replace(/\/[^/]+$/, "/index.html");
    } else {
        homePath = `${homePath}/index.html`;
    }

    currentUrl.pathname = homePath;
    currentUrl.search = "";
    currentUrl.hash = "";
    return currentUrl.toString();
}

function isOnIndexHtmlPage() {
    return /\/index\.html$/i.test(window.location.pathname || "");
}

function generateDiscordOAuthState() {
    const random = new Uint32Array(2);
    window.crypto.getRandomValues(random);
    return `${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
}

function captureDiscordTokenFromCallback() {
    const params = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const state = params.get("state");
    const error = params.get("error");

    if (!accessToken && !error) return { consumed: false, message: "", isError: false };

    const expectedState = sessionStorage.getItem(DISCORD_OAUTH_CONFIG.stateStorageKey);
    sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.stateStorageKey);
    sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey);
    const intent = sessionStorage.getItem(DISCORD_OAUTH_CONFIG.intentStorageKey) || "link";
    sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.intentStorageKey);

    const restoredCustomKeys = restoreCustomLocalDataFromOAuthBackup();
    if (restoredCustomKeys > 0) {
        sessionStorage.setItem(CUSTOM_LOCAL_RELOAD_FLAG_KEY, "1");
    }

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);

    if (error) {
        return { consumed: true, message: "Discord authorization cancelled or denied.", isError: true };
    }

    if (!expectedState || state !== expectedState) {
        return { consumed: true, message: "Discord authorization failed its state check. Please try again.", isError: true };
    }

    const expiresInSeconds = Number(params.get("expires_in") || "0");
    const expiresAt = Date.now() + Math.max(0, expiresInSeconds) * 1000;
    sessionStorage.setItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey, JSON.stringify({
        token: accessToken,
        intent,
        expiresAt
    }));

    return { consumed: true, message: intent === "signin" ? "Discord approved. Signing in..." : "Discord approved. Finishing link...", isError: false };
}

function initAccountFirebase() {
    const firebaseNs = window.firebase;
    if (!firebaseNs) return null;
    if (!firebaseNs.apps || !firebaseNs.apps.length) {
        firebaseNs.initializeApp(accountFirebaseConfig);
    }
    if (typeof firebaseNs.auth !== "function" || typeof firebaseNs.database !== "function") {
        return null;
    }
    return {
        auth: firebaseNs.auth(),
        db: firebaseNs.database(),
        storage: typeof firebaseNs.storage === "function" ? firebaseNs.storage() : null
    };
}

let accountUiBound = false;
let accountFirebaseRetryTimer = null;
let accountFirebaseRetryCount = 0;
let accountFirebaseWarned = false;
const ACCOUNT_FIREBASE_MAX_RETRIES = 8;
const ACCOUNT_FIREBASE_RETRY_DELAY_MS = 250;
let currentUser = null;
let cloudQueensRef = null;
const DISCORD_LINK_CACHE_TTL_MS = 60 * 1000;
const discordLinkCacheByUid = new Map();
const discordLinkRequestByUid = new Map();
const historyAccessCacheByUid = new Map();
let isStaff = false;
let staffRaw = false;
let currentStaffRole = "";
let isBanned = false;
let banStatusRef = null;
let banStatusHandler = null;
let staffStatusRef = null;
let staffStatusHandler = null;
let modalOpenCount = 0;

function lockBodyScroll() {
    modalOpenCount += 1;
    document.body.classList.add("account-modal-open");
    document.documentElement.classList.add("account-modal-open");
}

function unlockBodyScroll() {
    if (modalOpenCount > 0) {
        modalOpenCount -= 1;
    }

    if (modalOpenCount === 0) {
        document.body.classList.remove("account-modal-open");
        document.documentElement.classList.remove("account-modal-open");
    }
}

function syncPopupOverlayPosition(overlay) {
    if (!overlay) return;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.width = "100%";
    overlay.style.minHeight = `${window.innerHeight || document.documentElement.clientHeight || 0}px`;
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
}

function openAccountPopup(overlay) {
    if (!overlay) return;
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");

    if (typeof activateCenteredPopup === "function") {
        activateCenteredPopup(overlay);
    } else {
        syncPopupOverlayPosition(overlay);
    }
}

function closeAccountPopup(overlay) {
    if (!overlay) return;

    if (typeof deactivateCenteredPopup === "function") {
        deactivateCenteredPopup(overlay);
    }

    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.removeProperty("display");
}

window.accountAuth = null;
window.accountDb = null;
window.getCurrentUser = () => currentUser;

function isOwnerEmail(email) {
    const normalized = (email || "")
        .toString()
        .trim()
        .toLowerCase();

    return Boolean(normalized) && STAFF_EMAILS.some(staffEmail =>
        (staffEmail || "")
            .toString()
            .trim()
            .toLowerCase() === normalized
    );
}

window.isOwnerEmail = isOwnerEmail;

function normalizeTeamTagValue(value) {
    const cleaned = (value || "")
        .toString()
        .trim()
        .replace(/^Team(?:\s+|$)/i, "")
        .replace(/\s+/g, " ");
    return cleaned.substring(0, 24);
}

const PROFILE_EFFECTS = ["none", "glow", "sparkle", "rainbow", "pulse"];
const LEGACY_PROFILE_GLOW_EFFECTS = ["glow-blue", "glow-purple", "glow-pink", "glow-custom"];

function normalizeProfileEffect(value) {
    if (LEGACY_PROFILE_GLOW_EFFECTS.includes(value)) return "glow";
    return PROFILE_EFFECTS.includes(value) ? value : "none";
}

function applyProfileEffect(element, effect) {
    if (!element) return;
    const normalizedEffect = normalizeProfileEffect(effect);
    const previousEffectClasses = [...PROFILE_EFFECTS, ...LEGACY_PROFILE_GLOW_EFFECTS]
        .filter((value) => value !== "none")
        .map((value) => `effect-${value}`);
    element.classList.remove(...previousEffectClasses);
    if (normalizedEffect !== "none") {
        element.classList.add(`effect-${normalizedEffect}`);
    }
}
window.getIsStaff = () => isStaff;
window.currentUserUid = null;
window.currentUserEmail = null;
window.currentUsername = null;

window.getUserCloudAccess = async function() {
    const user = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
    if (!user) {
        if (typeof window.getIsStaff === "function" && window.getIsStaff()) {
            return { blocked: false, reason: "" };
        }
        return { blocked: true, reason: "Sign in to access this feature." };
    }
    if (typeof window.getIsStaff === "function" && window.getIsStaff()) {
        return { blocked: false, reason: "" };
    }
    if (typeof window.isOwnerEmail === "function" && window.isOwnerEmail(user.email)) {
        return { blocked: false, reason: "" };
    }
    // _internalGetCloudAccessState is set from inside the initAccountUi closure
    if (typeof window._internalGetCloudAccessState === "function") {
        return window._internalGetCloudAccessState(user);
    }
    return { blocked: true, reason: "Cloud access could not be verified." };
};

window.getUserHistoryAccess = async function() {
    // Local history works without OAuth; cloud operations still require authentication.
    if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname)) {
        return { blocked: false, reason: "" };
    }
    const user = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
    if (!user) {
        if (typeof window.getIsStaff === "function" && window.getIsStaff()) {
            return { blocked: false, reason: "" };
        }
        return { blocked: true, reason: "Sign in to access history." };
    }
    if (typeof window.getIsStaff === "function" && window.getIsStaff()) {
        return { blocked: false, reason: "" };
    }
    if (typeof window.isOwnerEmail === "function" && window.isOwnerEmail(user.email)) {
        return { blocked: false, reason: "" };
    }
    const cached = historyAccessCacheByUid.get(user.uid);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    if (typeof window._internalGetHistoryAccessState === "function") {
        const value = await window._internalGetHistoryAccessState(user);
        historyAccessCacheByUid.set(user.uid, {
            value,
            expiresAt: Date.now() + DISCORD_LINK_CACHE_TTL_MS
        });
        return value;
    }
    return { blocked: true, reason: "History access could not be verified." };
};

function initAccountUi() {
    if (accountUiBound) return;
    const firebaseCtx = initAccountFirebase();
    if (!firebaseCtx) {
        if (!accountFirebaseWarned) {
            accountFirebaseWarned = true;
            console.warn("Account UI init skipped: Firebase auth/database compat services are not available yet.");
        }
        if (!accountFirebaseRetryTimer && accountFirebaseRetryCount < ACCOUNT_FIREBASE_MAX_RETRIES) {
            accountFirebaseRetryCount += 1;
            accountFirebaseRetryTimer = setTimeout(() => {
                accountFirebaseRetryTimer = null;
                initAccountUi();
            }, ACCOUNT_FIREBASE_RETRY_DELAY_MS);
        }
        return;
    }
    accountFirebaseRetryCount = 0;
    accountFirebaseWarned = false;

    const { auth, db, storage } = firebaseCtx;
    
    window.accountAuth = auth;
    window.accountDb = db;
    import("/sponsors/drag/javascript/shared-items.min.js").then(module => {
        module.initSharedItemsManager(auth, db);
    }).catch(error => {
        console.error("Failed to load shared items manager:", error);
        const status = document.getElementById("sharedItemsStatus");
        if (status) status.textContent = "Shared items unavailable. Reload to retry.";
    });

    const modal = document.getElementById("accountModal");
    const openBtn = document.getElementById("accountButton");
    const closeBtn = document.getElementById("accountClose");

    const statusEl = document.getElementById("accountStatus");
    const authForm = document.getElementById("authForm");
    const emailInput = document.getElementById("accountEmail");
    const passwordInput = document.getElementById("accountPassword");
    const loginBtn = document.getElementById("loginBtn");
    const signupBtn = document.getElementById("signupBtn");
    const discordAuthBtn = document.getElementById("discordAuthBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    
    const signInFields = document.getElementById("signInFields");
    const signUpFields = document.getElementById("signUpFields");
    const toggleAuthModeUI = document.getElementById("toggleAuthMode");
    const usernameInput = document.getElementById("accountUsername");
    const emailSignupInput = document.getElementById("accountEmailSignup");
    const passwordSignupInput = document.getElementById("accountPasswordSignup");
    
    let isSignUpMode = false;
    let bannedPlayOverlay = null;

    const profileSection = document.getElementById("profileSection");
    const profilePicDisplay = document.getElementById("profilePicDisplay");
    const navProfilePic = document.getElementById("navProfilePic");
    const emailVerifyStatus = document.getElementById("emailVerifyStatus");
    const resendVerifyBtn = document.getElementById("resendVerifyBtn");
    const profilePicInput = document.getElementById("profilePicInput");
    const profilePicFileInput = document.getElementById("profilePicFileInput");
    const profilePicUrlInput = document.getElementById("profilePicUrlInput");
    const profilePicModeUploadBtn = document.getElementById("profilePicModeUploadBtn");
    const profilePicModeUrlBtn = document.getElementById("profilePicModeUrlBtn");
    const profilePicStatus = document.getElementById("profilePicStatus");
    const updateProfilePicBtn = document.getElementById("updateProfilePicBtn");
    const deleteAccountBtn = document.getElementById("deleteAccountBtn");
    const profileUsernameDisplay = document.getElementById("profileUsernameDisplay");
    const discordLinkStatus = document.getElementById("discordLinkStatus");
    const linkDiscordBtn = document.getElementById("linkDiscordBtn");
    const relinkDiscordBtn = document.getElementById("relinkDiscordBtn");
    const unlinkDiscordBtn = document.getElementById("unlinkDiscordBtn");

    const navAdminItem = document.getElementById("navAdminItem");
    const navAdminBtn = document.getElementById("navAdminBtn");
    const adminModal = document.getElementById("adminModal");
    const adminClose = document.getElementById("adminClose");
    const addStaffEmail = document.getElementById("addStaffEmail");
    const addStaffBtn = document.getElementById("addStaffBtn");
    const usersSearchInput = document.getElementById("usersSearchInput");
    const usersSearchBtn = document.getElementById("usersSearchBtn");
    const usersSearchClearBtn = document.getElementById("usersSearchClearBtn");
    const staffList = document.getElementById("staffList");
    const usersList = document.getElementById("usersList");
    const refreshSecurityLogsBtn = document.getElementById("refreshSecurityLogsBtn");
    const securityLogsList = document.getElementById("securityLogsList");
    const publishAnnouncementBtn = document.getElementById("publishAnnouncementBtn");
    const clearAnnouncementBtn = document.getElementById("clearAnnouncementBtn");
    const announcementAdminPreview = document.getElementById("announcementAdminPreview");
    const historyRtdbWritingEnabled = document.getElementById("adminHistoryRtdbWritingEnabled");
    const historyRtdbWritingSaveBtn = document.getElementById("adminHistoryRtdbWritingSaveBtn");
    const historyRtdbWritingStatus = document.getElementById("adminHistoryRtdbWritingStatus");
    const historyRtdbWritingMeta = document.getElementById("adminHistoryRtdbWritingMeta");
    const storageCleanupDaysInput = document.getElementById("storageCleanupDays");
    const storageCleanupMaxDeleteInput = document.getElementById("storageCleanupMaxDeletes");
    const previewStorageCleanupBtn = document.getElementById("previewStorageCleanupBtn");
    const runStorageCleanupBtn = document.getElementById("runStorageCleanupBtn");
    const storageCleanupResult = document.getElementById("storageCleanupResult");
    const adminTabButtons = Array.from(document.querySelectorAll(".admin-tab-btn"));
    const adminTabPanels = Array.from(document.querySelectorAll(".admin-tab-panel"));


    const queenToUpload = document.getElementById("queenToUpload");
    const uploadQueenBtn = document.getElementById("uploadQueenBtn");
    const refreshCloudQueensBtn = document.getElementById("refreshCloudQueensBtn");
    const cloudQueensList = document.getElementById("cloudQueensList");
    const cloudNote = document.getElementById("accountCloudNote");
    const discordLoginWarningEl = document.getElementById("authDiscordLoginWarning");
    const TRACKING_STORAGE_KEY = "ss.account.install.id";
    const TRACKING_MIN_WRITE_INTERVAL_MS = 45 * 1000;
    const USERS_SNAPSHOT_CACHE_TTL_MS = 30 * 1000;
    const SESSION_PING_STORAGE_KEY = "ss.account.session.ping";
    const SESSION_PING_INTERVAL_MS = 10 * 60 * 1000;
    let lastTrackingWriteAt = 0;
    let lastTrackedUid = "";
    let discordSignInPromise = null;
    let discordLinkPromise = null;
    let usersSnapshotCache = null;
    let usersSnapshotRequest = null;

    if (!modal || !openBtn || !closeBtn || !statusEl) return;

    if (discordLoginWarningEl) {
        discordLoginWarningEl.textContent = "Use email and password, or continue with Discord. Already have an email/password account? Keep using that sign-in and link Discord in Account settings.";
    }

    function setModalOpen(isOpen) {
        if (!modal) return;

        if (isOpen) {
            lockBodyScroll();
            openAccountPopup(modal);

            populateTeamTagChoices();
            populateQueenSelect();
            loadCloudQueens();
            loadProfileData(currentUser);
            if (profileBioInput) {
                const counter = profileBioInput.closest(".setting-item")?.querySelector(".character-count");
                if (counter) {
                    counter.textContent = `${profileBioInput.value.length} / 150`;
                }
            }
            switchSettingsTab("profile");
        } else {
            closeAccountPopup(modal);
            unlockBodyScroll();
        }
    }

    function setAdminModalOpen(isOpen) {
        if (!adminModal) return;

        if (isOpen) {
            lockBodyScroll();
            openAccountPopup(adminModal);

            if (isStaff) {
                const route = parseAdminHash();
                if (route?.uid) adminDetailUid = route.uid;
                switchAdminTab(route?.tab || "overview");
                if (hasAdminRole()) {
                    void refreshAnnouncementAdminPreview();
                    void refreshHistoryRtdbWritingAdmin();
                }
                updateAdminElevationStatus();
                window.clearInterval(adminElevationTimer);
                adminElevationTimer = window.setInterval(updateAdminElevationStatus, 30000);
            }
        } else {
            closeAccountPopup(adminModal);
            unlockBodyScroll();
            stopAdminLiveListeners();
            window.clearInterval(adminElevationTimer);
            toggleAdminShortcutsHelp(false);
            if (/^#admin(=|$)/.test(window.location.hash)) {
                history.replaceState(null, "", window.location.pathname + window.location.search);
            }
        }
    }

    function switchAdminTab(tabName) {
        if (!adminTabButtons.length || !adminTabPanels.length) return;
        if (!canOpenAdminTab(tabName)) tabName = "overview";
        if (tabName !== "overview") stopAdminLiveListeners();

        adminTabButtons.forEach((button) => {
            const isActive = button.getAttribute("data-admin-tab") === tabName;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
            button.tabIndex = isActive ? 0 : -1;
        });

        adminTabPanels.forEach((panel) => {
            const isActive = panel.getAttribute("data-admin-panel") === tabName;
            panel.classList.toggle("active", isActive);
            panel.setAttribute("aria-hidden", isActive ? "false" : "true");
        });

        setAdminSectionTitle(tabName);
        if (!isStaff) return;
        if (tabName !== "users" && adminDetailUid) closeAdminAccountDetail();
        if (tabName === "overview") loadAdminOverview();
        if (tabName === "reviews") loadAdminReviews();
        if (tabName === "staff") loadStaffList();
        if (tabName === "security") loadSecurityLogs();
        if (tabName === "users") loadUsersList(usersSearchInput?.value || "");
        if (tabName === "moderation") loadModerationLogs();
        if (tabName === "announcements") void loadAlertConfig();
        if (tabName === "cases") void loadCases();
        if (tabName === "performance") void loadPerformanceDashboard();
        syncAdminHash();
    }

    function getActiveSecuritySubTab() {
        const active = document.querySelector(".security-sub-tab-btn.active");
        return active ? active.getAttribute("data-security-tab") : "role-denied";
    }

    function switchSecuritySubTab(tabName) {
        document.querySelectorAll(".security-sub-tab-btn").forEach((button) => {
            const isActive = button.getAttribute("data-security-tab") === tabName;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
            button.tabIndex = isActive ? 0 : -1;
        });
        document.querySelectorAll(".security-sub-panel").forEach((panel) => {
            const isActive = panel.getAttribute("data-security-panel") === tabName;
            panel.classList.toggle("active", isActive);
            panel.setAttribute("aria-hidden", isActive ? "false" : "true");
        });
        if (isStaff) loadSecurityLogs();
    }

    function handleAdminTabKeydown(event, selector, dataAttribute, activateTab) {
        const tab = event.target.closest(selector);
        if (!tab || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;

        const tabs = Array.from(document.querySelectorAll(`${selector}[${dataAttribute}]`));
        const currentIndex = tabs.indexOf(tab);
        if (currentIndex < 0 || !tabs.length) return;
        event.preventDefault();

        const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
                ? tabs.length - 1
                : (currentIndex + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length;
        const nextTab = tabs[nextIndex];
        activateTab(nextTab.getAttribute(dataAttribute) || "");
        nextTab.focus();
    }

    adminModal?.addEventListener("keydown", (event) => {
        if (event.target.closest(".admin-tab-btn")) {
            handleAdminTabKeydown(event, ".admin-tab-btn", "data-admin-tab", switchAdminTab);
        } else if (event.target.closest(".security-sub-tab-btn")) {
            handleAdminTabKeydown(event, ".security-sub-tab-btn", "data-security-tab", switchSecuritySubTab);
        }
    });

    async function refreshAnnouncementAdminPreview() {
        if (!announcementAdminPreview) return;
        if (typeof window.getActiveGlobalAnnouncement !== "function") {
            announcementAdminPreview.textContent = "Global Announcement: system unavailable";
            return;
        }

        try {
            const active = await window.getActiveGlobalAnnouncement();
            if (!active || !active.active || !active.message) {
                announcementAdminPreview.textContent = "Global Announcement: none active";
                return;
            }

            const level = String(active.level || "info").toUpperCase();
            const title = (active.title || "Announcement").toString().trim();
            announcementAdminPreview.textContent = `Global Announcement: [${level}] ${title}`;
        } catch (_err) {
            announcementAdminPreview.textContent = "Global Announcement: unable to load";
        }
    }

    async function refreshHistoryRtdbWritingAdmin() {
        if (!historyRtdbWritingStatus || typeof window.getHistoryRtdbWritingConfig !== "function") return;
        try {
            const config = await window.getHistoryRtdbWritingConfig();
            if (historyRtdbWritingEnabled) historyRtdbWritingEnabled.value = config.enabled ? "on" : "off";
            historyRtdbWritingStatus.textContent = `History RTDB writing: ${config.enabled ? "on" : "off"}.`;
            if (historyRtdbWritingMeta) {
                const updatedAt = config.updatedAt ? new Date(config.updatedAt).toLocaleString() : "unknown";
                const by = config.updatedByEmail ? ` by ${config.updatedByEmail}` : "";
                historyRtdbWritingMeta.textContent = `Last updated: ${updatedAt}${by}`;
            }
        } catch (_err) {
            historyRtdbWritingStatus.textContent = "History RTDB writing: unavailable.";
        }
    }

    async function saveHistoryRtdbWritingFromAdmin() {
        if (!isStaff || !currentUser || typeof window.setHistoryRtdbWritingConfig !== "function") {
            return alert("you don't have permission for that");
        }
        if (!(await ensureAdminElevation("change history writing"))) return;
        if (historyRtdbWritingSaveBtn) historyRtdbWritingSaveBtn.disabled = true;
        try {
            const config = await window.setHistoryRtdbWritingConfig(historyRtdbWritingEnabled?.value === "on", currentUser);
            if (historyRtdbWritingStatus) historyRtdbWritingStatus.textContent = `History RTDB writing: ${config.enabled ? "on" : "off"}.`;
            await refreshHistoryRtdbWritingAdmin();
        } catch (err) {
            console.error("Failed to save history RTDB writing setting:", err);
            if (historyRtdbWritingStatus) historyRtdbWritingStatus.textContent = "History RTDB writing: save failed.";
        } finally {
            if (historyRtdbWritingSaveBtn) historyRtdbWritingSaveBtn.disabled = false;
        }
    }

    async function publishGlobalAnnouncementFromAdmin() {
        if (!isStaff || !currentUser) {
            return alert("you don't have permission for that");
        }
        if (typeof window.publishGlobalAnnouncement !== "function") {
            return showCloudNote("global announcement system unavailable", true);
        }

        const title = await window.showInHousePrompt("Title (optional)", "", "Announcement Title");
        if (title === null) return;

        const message = await window.showInHousePrompt("Message (required)", "", "Announcement Message");
        if (message === null) return;
        if (!message.trim()) {
            return showCloudNote("announcement message is required", true);
        }

        const levelInput = await window.showInHousePrompt(
            "Level: info, warning, or critical",
            "info",
            "Announcement Level"
        );
        if (levelInput === null) return;

        const levelNormalized = String(levelInput || "info").trim().toLowerCase();
        const level = ["info", "warning", "critical"].includes(levelNormalized) ? levelNormalized : "info";

        const minutesInput = await window.showInHousePrompt(
            "Auto-expire in minutes (optional, blank = no expiry)",
            "",
            "Announcement Expiration"
        );
        if (minutesInput === null) return;

        let expiresAt = null;
        const minutes = Number(minutesInput);
        if (String(minutesInput || "").trim() !== "" && Number.isFinite(minutes) && minutes > 0) {
            expiresAt = new Date(Date.now() + (minutes * 60 * 1000)).toISOString();
        }

        const soundUrlInput = await window.showInHousePrompt(
            "Custom sound URL (optional, http/https or /path)",
            "",
            "Announcement Sound"
        );
        if (soundUrlInput === null) return;
        if (!(await ensureAdminElevation("publish an announcement"))) return;

        try {
            await window.publishGlobalAnnouncement({
                title: title.trim(),
                message: message.trim(),
                level,
                soundUrl: String(soundUrlInput || "").trim(),
                expiresAt,
                updatedByUid: currentUser.uid,
                updatedByEmail: currentUser.email || ""
            });
            showCloudNote("global announcement published");
            await refreshAnnouncementAdminPreview();
        } catch (err) {
            console.error("Failed to publish announcement:", err);
            showCloudNote("couldn't publish global announcement", true);
        }
    }

    async function clearGlobalAnnouncementFromAdmin() {
        if (!isStaff || !currentUser) {
            return alert("you don't have permission for that");
        }
        if (typeof window.clearGlobalAnnouncement !== "function") {
            return showCloudNote("global announcement system unavailable", true);
        }

        if (!(await window.showInHouseConfirm("clear the active global announcement?", "Clear Announcement"))) {
            return;
        }
        if (!(await ensureAdminElevation("clear the announcement"))) return;

        try {
            await window.clearGlobalAnnouncement({
                updatedByUid: currentUser.uid,
                updatedByEmail: currentUser.email || ""
            });
            showCloudNote("global announcement cleared");
            await refreshAnnouncementAdminPreview();
        } catch (err) {
            console.error("Failed to clear announcement:", err);
            showCloudNote("couldn't clear global announcement", true);
        }
    }

    function getCloudFunctionEndpoint(name) {
        const projectId = String(accountFirebaseConfig?.projectId || "").trim();
        if (!projectId) {
            return "";
        }
        return `https://europe-west1-${projectId}.cloudfunctions.net/${name}`;
    }

    function getStorageCleanupEndpoint() {
        return getCloudFunctionEndpoint("storageCleanupSweep");
    }

    function setStorageCleanupButtonsDisabled(disabled) {
        if (previewStorageCleanupBtn) previewStorageCleanupBtn.disabled = !!disabled;
        if (runStorageCleanupBtn) runStorageCleanupBtn.disabled = !!disabled;
    }

    function formatSizeMb(bytes) {
        return (Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(2);
    }

    function renderStorageCleanupResult(payload, execute) {
        if (!storageCleanupResult) return;
        if (!payload || typeof payload !== "object") {
            storageCleanupResult.textContent = "No response payload.";
            return;
        }

        const previewRows = Array.isArray(payload.preview) ? payload.preview.slice(0, 20) : [];
        const previewText = previewRows.length > 0
            ? previewRows.map((entry) => `- ${entry.path} (${formatSizeMb(entry.sizeBytes)} MB, ${entry.createdAt})`).join("\n")
            : "- none";

        const errorRows = Array.isArray(payload.deleteErrors) ? payload.deleteErrors.slice(0, 10) : [];
        const errorText = errorRows.length > 0
            ? errorRows.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n")
            : "- none";

        storageCleanupResult.textContent = [
            `Mode: ${execute ? "EXECUTE" : "PREVIEW"}`,
            `Actor: ${(payload.actor && payload.actor.uid) || "unknown"} (${(payload.actor && payload.actor.role) || "unknown"})`,
            `Selected files: ${Number(payload.selectedCount || 0)}`,
            `Selected bytes: ${formatSizeMb(payload.selectedBytes || 0)} MB`,
            `Deleted files: ${Number(payload.deletedCount || 0)}`,
            `Deleted bytes: ${formatSizeMb(payload.deletedBytes || 0)} MB`,
            "",
            "Preview (first 20):",
            previewText,
            "",
            "Delete errors (first 10):",
            errorText
        ].join("\n");
    }

    async function runStorageCleanup(execute = false) {
        if (!isStaff || !currentUser) {
            alert("you don't have permission for that");
            return;
        }

        const endpoint = getStorageCleanupEndpoint();
        if (!endpoint) {
            showCloudNote("storage cleanup endpoint unavailable", true);
            return;
        }

        const maxAgeDays = Math.max(1, Number.parseInt(String(storageCleanupDaysInput?.value || "30"), 10) || 30);
        const maxDeletes = Math.max(1, Number.parseInt(String(storageCleanupMaxDeleteInput?.value || "500"), 10) || 500);

        if (execute) {
            const approved = await window.showInHouseConfirm(
                `Delete up to ${maxDeletes} Storage files older than ${maxAgeDays} day(s)?`,
                "Run Storage Cleanup"
            );
            if (!approved) {
                return;
            }
        }

        setStorageCleanupButtonsDisabled(true);
        if (storageCleanupResult) {
            storageCleanupResult.textContent = execute ? "Running cleanup..." : "Running preview...";
        }

        try {
            const token = await currentUser.getIdToken();
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    execute,
                    maxAgeDays,
                    maxDeletes,
                    prefixes: ["custom-uploads", "profile-pictures", "profile-banners", "profile-uploads"]
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || `request-failed-${response.status}`);
            }

            renderStorageCleanupResult(payload, execute);
            showCloudNote(execute
                ? `storage cleanup done: ${Number(payload.deletedCount || 0)} file(s) deleted`
                : `storage cleanup preview ready: ${Number(payload.selectedCount || 0)} file(s) match`);
        } catch (err) {
            const message = err && err.message ? err.message : "storage-cleanup-failed";
            if (storageCleanupResult) {
                storageCleanupResult.textContent = `Cleanup failed: ${message}`;
            }
            showCloudNote(`storage cleanup failed: ${message}`, true);
        } finally {
            setStorageCleanupButtonsDisabled(false);
        }
    }

    function setCloudButtonsEnabled(enabled) {
        if (uploadQueenBtn) uploadQueenBtn.disabled = !enabled;
        if (refreshCloudQueensBtn) refreshCloudQueensBtn.disabled = !enabled;
    }

    function showCloudNote(message, isError = false) {
        if (!cloudNote) return;
        cloudNote.textContent = message;
        cloudNote.style.color = isError ? "#b00020" : "#2d7a2d";
        setTimeout(() => {
            cloudNote.textContent = "";
        }, 4000);
    }

    function setProfileUploadStatus(statusElement, message, isError = false) {
        if (!statusElement) return;
        statusElement.textContent = message;
        statusElement.style.color = isError ? "#b00020" : "";
    }

    function setProfileBannerPreview(url) {
        const bannerDisplays = document.querySelectorAll("[id='profileBannerDisplay']");
        bannerDisplays.forEach((display) => {
            if (!display) return;
            if (url) {
                display.style.backgroundImage = `url('${url}')`;
                display.style.backgroundColor = "";
                display.style.backgroundSize = "cover";
                display.style.backgroundPosition = "center";
            } else {
                display.style.backgroundImage = "";
                display.style.backgroundColor = "#8b1f74";
            }
        });
    }

    async function prepareProfileImageData(file, options = {}) {
        if (!file || !String(file.type || "").startsWith("image/")) {
            throw new Error("Please upload a valid image file.");
        }
        if (file.size > 5 * 1024 * 1024) {
            throw new Error("Images must be 5 MB or smaller.");
        }
        if (typeof window.resizeImageForStorage === "function") {
            return window.resizeImageForStorage(file, options);
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Your browser could not process the image."));
            reader.readAsDataURL(file);
        });
    }

    async function getCloudAccessState(user = currentUser) {
        if (!user) {
            return {
                blocked: true,
                reason: "Sign in first to use cloud uploads and history sync."
            };
        }

        const linkData = await loadDiscordLink(user);
        const permissions = getDiscordProfilePermissions(linkData);
        if (permissions.canUseCloud) {
            return {
                blocked: false,
                reason: ""
            };
        }

        const accessStatus = String(linkData && linkData.accessStatus || "").toUpperCase();
        const accessReason = String(linkData && linkData.accessReason || "").trim();
        const isLinked = !!(linkData && (linkData.id || linkData.username || linkData.globalName));
        if (!isLinked) {
            return {
                blocked: true,
                reason: "Discord is not linked. Link Discord and verify Superstar/Hyperstar role to use cloud uploads/storage."
            };
        }

        if (["DENIED", "FAILED", "ERROR", "EXPIRED", "INVALID"].includes(accessStatus)) {
            return {
                blocked: true,
                reason: "Discord verification is " + accessStatus.toLowerCase() + (accessReason ? ": " + accessReason : ".") + " Re-link Discord and verify Superstar/Hyperstar role."
            };
        }

        if (permissions.tier === "BOOSTER") {
            return {
                blocked: true,
                reason: "Booster tier is linked, but cloud uploads/storage require Superstar or Hyperstar."
            };
        }

        if (permissions.tier === "SUPPORTER") {
            return {
                blocked: true,
                reason: "Supporter tier is linked, but cloud uploads/storage require Superstar or Hyperstar."
            };
        }

        return {
            blocked: true,
            reason: "Only Superstar+ and Hyperstar+ tiers can use cloud uploads/storage."
        };
    }

    // Expose inside closure so the module-level window.getUserCloudAccess can reach it
    window._internalGetCloudAccessState = getCloudAccessState;

    async function getHistoryAccessState(user = currentUser) {
        if (!user) {
            return {
                blocked: true,
                reason: "Sign in to access cloud history sync."
            };
        }

        const linkData = await loadDiscordLink(user);
        const permissions = getDiscordProfilePermissions(linkData);
        if (permissions.canUseCloud) {
            return {
                blocked: false,
                reason: ""
            };
        }

        const accessStatus = String(linkData && linkData.accessStatus || "").toUpperCase();
        const accessReason = String(linkData && linkData.accessReason || "").trim();
        const isLinked = !!(linkData && (linkData.id || linkData.username || linkData.globalName));
        if (!isLinked) {
            return {
                blocked: true,
                reason: "Discord is not linked. Link Discord and verify Superstar/Hyperstar role to use cloud history."
            };
        }

        if (["DENIED", "FAILED", "ERROR", "EXPIRED", "INVALID"].includes(accessStatus)) {
            return {
                blocked: true,
                reason: "Discord verification is " + accessStatus.toLowerCase() + (accessReason ? ": " + accessReason : ".") + " Re-link Discord and verify Superstar/Hyperstar role."
            };
        }

        if (permissions.tier === "BOOSTER") {
            return {
                blocked: true,
                reason: "Booster tier is linked, but cloud history requires Superstar or Hyperstar."
            };
        }

        if (permissions.tier === "SUPPORTER") {
            return {
                blocked: true,
                reason: "Supporter tier is linked, but cloud history requires Superstar or Hyperstar."
            };
        }

        return {
            blocked: true,
            reason: "Only Superstar+ and Hyperstar+ tiers can use cloud history."
        };
    }

    window._internalGetHistoryAccessState = getHistoryAccessState;

    async function applyCloudAccessState(user = currentUser) {
        if (!user) {
            setCloudButtonsEnabled(false);
            cloudQueensRef = null;
            return;
        }

        const cloudAccessState = await getCloudAccessState(user);
        if (cloudAccessState.blocked) {
            setCloudButtonsEnabled(false);
            cloudQueensRef = null;
            if (cloudQueensList) {
                cloudQueensList.innerHTML = '<p class="empty-state">Cloud uploads are not available for your current role.</p>';
            }
            showCloudNote(cloudAccessState.reason || "Cloud uploads are unavailable.", true);
            return;
        }

        setCloudButtonsEnabled(true);
        cloudQueensRef = db.ref(`cloudQueens/${user.uid}`);
    }

    function getProfileCloudUploadLimitBytes(options = {}) {
        const explicitLimit = Number(options.cloudMaxBytes);
        if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
            return explicitLimit;
        }
        return 1024 * 1024;
    }

    function getDataUrlSizeBytes(dataUrl) {
        if (!dataUrl || typeof dataUrl !== "string") return 0;
        const base64 = dataUrl.split(",")[1] || "";
        return Math.ceil((base64.length * 3) / 4);
    }

    async function uploadProfileAsset(file, options = {}) {
        const preparedImage = await prepareProfileImageData(file, options);

        if (storage && currentUser) {
            const preparedSizeBytes = getDataUrlSizeBytes(preparedImage);
            const cloudLimitBytes = getProfileCloudUploadLimitBytes(options);
            if (preparedSizeBytes > cloudLimitBytes) {
                throw new Error(`Processed image exceeds cloud upload limit (${formatSizeMb(cloudLimitBytes)} MB). Try a smaller/cropped image.`);
            }

            const folder = options.folder || "profile-uploads";
            const path = `${folder}/${currentUser.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
            const storageRef = storage.ref().child(path);

            await storageRef.putString(preparedImage, "data_url", {
                contentType: "image/jpeg",
                cacheControl: "public,max-age=31536000,immutable",
                customMetadata: {
                    owner: currentUser.uid,
                    kind: options.label || "profile-image"
                }
            });

            const url = await storageRef.getDownloadURL();
            return { url, path, cloud: true };
        }

        return { url: preparedImage, path: "", cloud: false };
    }

    function bindProfileImageUploader(fileInput, valueInput, statusElement, previewCallback, options = {}) {
        if (!fileInput || !valueInput || fileInput.dataset.uploadBound === "true") return;
        fileInput.dataset.uploadBound = "true";

        fileInput.addEventListener("change", async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;

            setProfileUploadStatus(statusElement, "Processing image...");
            try {
                const stagedPath = String(valueInput.dataset.storagePath || "").trim();
                const previousSavedPath = String(valueInput.dataset.previousStoragePath || "").trim();
                if (storage && stagedPath && stagedPath !== previousSavedPath) {
                    storage.ref().child(stagedPath).delete().catch((cleanupErr) => {
                        if (cleanupErr?.code !== "storage/object-not-found") {
                            console.warn("Failed to remove replaced staged profile image:", cleanupErr);
                        }
                    });
                }

                const uploaded = await uploadProfileAsset(file, options);
                valueInput.value = uploaded?.url || "";
                valueInput.dataset.storagePath = uploaded?.path || "";
                if (options.urlInput) {
                    options.urlInput.value = uploaded?.url || "";
                }
                if (typeof previewCallback === "function") {
                    previewCallback(uploaded?.url || "");
                }
                setProfileUploadStatus(
                    statusElement,
                    uploaded?.cloud ? "Image uploaded to Firebase Storage." : "Image ready locally."
                );
            } catch (err) {
                console.error("Profile image upload failed:", err);
                setProfileUploadStatus(statusElement, err.message || "Upload failed.", true);
                alert(err.message || "The uploaded image could not be processed.");
            } finally {
                fileInput.value = "";
            }
        });
    }

    function setProfileImageInputMode(mode, config = {}) {
        const isUrlMode = mode === "url";
        if (config.fileInput) {
            config.fileInput.style.display = isUrlMode ? "none" : "";
        }
        if (config.urlInput) {
            config.urlInput.style.display = isUrlMode ? "" : "none";
        }
        if (config.uploadBtn) {
            config.uploadBtn.classList.toggle("active", !isUrlMode);
        }
        if (config.urlBtn) {
            config.urlBtn.classList.toggle("active", isUrlMode);
        }
    }

    function inferProfileImageMode(urlValue) {
        return String(urlValue || "").trim() ? "url" : "upload";
    }

    function getProfileModeHint(mode, targetType = "image") {
        if (mode === "url") {
            return targetType === "banner"
                ? "URL mode: paste a banner image URL."
                : "URL mode: paste a profile image URL.";
        }
        return "Cloud upload: image files up to 5 MB are resized automatically.";
    }

    function detectBrowserName() {
        const ua = navigator.userAgent || "";
        if (/Edg\//.test(ua)) return "Microsoft Edge";
        if (/OPR\//.test(ua)) return "Opera";
        if (/Chrome\//.test(ua)) return "Google Chrome";
        if (/Firefox\//.test(ua)) return "Mozilla Firefox";
        if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
        return "Unknown browser";
    }

    function detectPlatformName() {
        const platform = navigator.userAgentData?.platform || navigator.platform || "Unknown platform";
        if (platform === "MacIntel" && navigator.maxTouchPoints > 1) return "iPadOS";
        return platform;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function normalizeIdValue(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "")
            .slice(0, 120);
    }

    function hashStringFNV1a(input) {
        const text = String(input || "");
        let hash = 0x811c9dc5;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, "0");
    }

    function getOrCreateInstallId() {
        let stored = "";
        try {
            stored = normalizeIdValue(localStorage.getItem(TRACKING_STORAGE_KEY));
        } catch (_err) {
            stored = "";
        }

        if (stored) return stored;

        const seed = [
            Date.now(),
            Math.random(),
            navigator.userAgent || "",
            navigator.language || "",
            window.location.origin || ""
        ].join("|");
        const created = `inst_${hashStringFNV1a(seed)}_${Math.random().toString(36).slice(2, 10)}`;

        try {
            localStorage.setItem(TRACKING_STORAGE_KEY, created);
        } catch (_err) {
            // Ignore blocked storage.
        }

        return created;
    }

    function buildTrackingSnapshot() {
        const viewportWidth = window.innerWidth || window.screen?.width || 0;
        const viewportHeight = window.innerHeight || window.screen?.height || 0;
        const timeZone = Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || "unknown";
        const language = navigator.language || "unknown";
        const ua = navigator.userAgent || "";
        const platform = detectPlatformName() || "unknown";
        const browser = detectBrowserName() || "unknown";
        const touchPoints = Number(navigator.maxTouchPoints || 0);
        const deviceMemory = Number(navigator.deviceMemory || 0);
        const hardwareConcurrency = Number(navigator.hardwareConcurrency || 0);
        const colorDepth = Number(window.screen?.colorDepth || 0);
        const pixelRatio = Number(window.devicePixelRatio || 1);
        const installId = getOrCreateInstallId();

        const browserFingerprint = hashStringFNV1a([
            ua,
            platform,
            browser,
            language,
            timeZone,
            touchPoints,
            hardwareConcurrency,
            deviceMemory,
            colorDepth
        ].join("|"));

        const environmentFingerprint = hashStringFNV1a([
            viewportWidth,
            viewportHeight,
            pixelRatio,
            colorDepth,
            touchPoints,
            language,
            timeZone
        ].join("|"));

        return {
            capturedAt: nowIso(),
            installId: normalizeIdValue(installId),
            browserFingerprint,
            environmentFingerprint,
            browser,
            platform,
            userAgent: ua,
            language,
            timezone: timeZone,
            viewport: `${viewportWidth}x${viewportHeight}`,
            pixelRatio,
            touchPoints,
            hardwareConcurrency,
            deviceMemory,
            colorDepth
        };
    }

    async function runDeepAccountTracking(user, source = "auth") {
        if (!user || !user.uid) return;
        const now = Date.now();
        if (lastTrackedUid === user.uid && now - lastTrackingWriteAt < TRACKING_MIN_WRITE_INTERVAL_MS) {
            return;
        }

        const snapshot = buildTrackingSnapshot();
        const trackingRef = db.ref(`users/${user.uid}/security/tracking`);
        let firstSeenAt = snapshot.capturedAt;
        try {
            const existingSnap = await trackingRef.once("value");
            const existing = existingSnap.val() || {};
            firstSeenAt = existing.firstSeenAt || snapshot.capturedAt;
        } catch (err) {
            console.warn("Failed to read existing tracking profile:", err);
        }

        await trackingRef.update({
            firstSeenAt,
            lastSeenAt: snapshot.capturedAt,
            lastSeenSource: source,
            installId: snapshot.installId,
            browserFingerprint: snapshot.browserFingerprint,
            environmentFingerprint: snapshot.environmentFingerprint,
            browser: snapshot.browser,
            platform: snapshot.platform,
            language: snapshot.language,
            timezone: snapshot.timezone,
            viewport: snapshot.viewport,
            pixelRatio: snapshot.pixelRatio,
            touchPoints: snapshot.touchPoints,
            hardwareConcurrency: snapshot.hardwareConcurrency,
            deviceMemory: snapshot.deviceMemory,
            colorDepth: snapshot.colorDepth,
            userAgent: snapshot.userAgent
        });

        // Cap sessions at 20 to prevent unbounded growth inflating the /users node
        const sessionsRef = db.ref(`users/${user.uid}/security/sessions`);
        const newSession = { at: snapshot.capturedAt, source, installId: snapshot.installId, browserFingerprint: snapshot.browserFingerprint, environmentFingerprint: snapshot.environmentFingerprint, browser: snapshot.browser, platform: snapshot.platform, viewport: snapshot.viewport };
        try {
            const existingSnap = await sessionsRef.limitToFirst(200).once("value");
            const keys = Object.keys(existingSnap.val() || {}).sort();
            const updates = {};
            if (keys.length >= 20) keys.slice(0, keys.length - 19).forEach(k => { updates[k] = null; });
            updates[sessionsRef.push().key] = newSession;
            await sessionsRef.update(updates);
        } catch (_sessErr) {
            await sessionsRef.push().set(newSession);
        }

        await db.ref(`users/${user.uid}/security/linkedAccounts`).set({
            updatedAt: snapshot.capturedAt,
            linkedUids: [],
            bySignal: {
                install: [],
                browser: [],
                environment: []
            }
        });

        lastTrackedUid = user.uid;
        lastTrackingWriteAt = now;
    }

    // The IP is only visible to the server, so the session is recorded by a Cloud Function.
    async function recordServerSession(user, source = "auth") {
        if (!user || !user.uid || typeof fetch !== "function") return;
        const endpoint = getCloudFunctionEndpoint("recordAccountSession");
        if (!endpoint) return;
        const pingKey = `${SESSION_PING_STORAGE_KEY}.${user.uid}`;
        try {
            if (Date.now() - Number(sessionStorage.getItem(pingKey) || 0) < SESSION_PING_INTERVAL_MS) return;
            sessionStorage.setItem(pingKey, String(Date.now()));
        } catch (_storageErr) {}
        try {
            const snapshot = buildTrackingSnapshot();
            const token = await user.getIdToken();
            await fetch(endpoint, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    source,
                    page: window.location.pathname,
                    installId: snapshot.installId,
                    browserFingerprint: snapshot.browserFingerprint
                }),
                keepalive: true
            });
        } catch (err) {
            console.debug("Session telemetry unavailable:", err);
        }
    }

    const discordCaptureResult = captureDiscordTokenFromCallback();
    if (discordCaptureResult.consumed && discordCaptureResult.message) {
        showCloudNote(discordCaptureResult.message, !!discordCaptureResult.isError);
    }
    if (sessionStorage.getItem(CUSTOM_LOCAL_RELOAD_FLAG_KEY) === "1") {
        sessionStorage.removeItem(CUSTOM_LOCAL_RELOAD_FLAG_KEY);
        window.location.reload();
        return;
    }

    async function loadProfilePicture(user) {
        if (!user) {
            if (profilePicDisplay) profilePicDisplay.src = "image/queens/noimage.jpg";
            if (navProfilePic) {
                navProfilePic.classList.add("is-hidden");
                navProfilePic.src = "";
            }
            return;
        }

        try {
            const snapshot = await db.ref(`users/${user.uid}/profile`).once("value");
            const profileData = snapshot.val();
            const profilePicUrl = profileData?.profilePicUrl || "image/queens/noimage.jpg";
            const profilePicPath = profileData?.profilePicPath || "";

            if (profilePicDisplay) profilePicDisplay.src = profilePicUrl;
            if (navProfilePic) {
                if (profilePicUrl && profilePicUrl !== "image/queens/noimage.jpg") {
                    navProfilePic.src = profilePicUrl;
                    navProfilePic.classList.remove("is-hidden");
                } else {
                    navProfilePic.classList.add("is-hidden");
                    navProfilePic.src = "";
                }
            }
            if (profilePicInput) {
                profilePicInput.value = profilePicUrl !== "image/queens/noimage.jpg" ? profilePicUrl : "";
                profilePicInput.dataset.storagePath = profilePicPath;
                profilePicInput.dataset.previousStoragePath = profilePicPath;
            }
            if (profilePicUrlInput) {
                profilePicUrlInput.value = profilePicUrl !== "image/queens/noimage.jpg" ? profilePicUrl : "";
            }
            setProfileImageInputMode(inferProfileImageMode(profilePicUrlInput?.value || ""), {
                fileInput: profilePicFileInput,
                urlInput: profilePicUrlInput,
                uploadBtn: profilePicModeUploadBtn,
                urlBtn: profilePicModeUrlBtn
            });
            setProfileUploadStatus(profilePicStatus, profilePicUrl !== "image/queens/noimage.jpg"
                ? "Saved image ready."
                : getProfileModeHint(inferProfileImageMode(profilePicUrlInput?.value || ""), "image"));
        } catch (err) {
            console.error("Failed to load profile picture:", err);
            if (profilePicDisplay) profilePicDisplay.src = "image/queens/noimage.jpg";
        }
    }

    async function updateProfilePicture() {
        if (!currentUser) return alert("sign in first");

        const newUrl = profilePicInput?.value.trim() || "image/queens/noimage.jpg";
        const newStoragePath = profilePicInput?.dataset.storagePath || "";
        const previousStoragePath = profilePicInput?.dataset.previousStoragePath || "";

        try {
            await db.ref(`users/${currentUser.uid}/profile`).update({
                profilePicUrl: newUrl,
                profilePicPath: newStoragePath || null,
                updatedAt: new Date().toISOString()
            });

            if (profilePicDisplay) profilePicDisplay.src = newUrl;
            if (navProfilePic) {
                if (newUrl && newUrl !== "image/queens/noimage.jpg") {
                    navProfilePic.src = newUrl;
                    navProfilePic.classList.remove("is-hidden");
                } else {
                    navProfilePic.classList.add("is-hidden");
                    navProfilePic.src = "";
                }
            }
            if (storage && previousStoragePath && previousStoragePath !== newStoragePath) {
                storage.ref().child(previousStoragePath).delete().catch((cleanupErr) => {
                    console.warn("Failed to remove previous profile image:", cleanupErr);
                });
            }
            if (profilePicInput) {
                profilePicInput.dataset.previousStoragePath = newStoragePath;
            }
            setProfileUploadStatus(profilePicStatus, newUrl !== "image/queens/noimage.jpg"
                ? "Saved image ready."
                : getProfileModeHint(inferProfileImageMode(profilePicUrlInput?.value || ""), "image"));
            showCloudNote("profile pic updated");
        } catch (err) {
            console.error("Failed to update profile picture:", err);
            alert("couldn't update pic");
        }
    }

    function extractStoragePathFromUrl(url) {
        const raw = String(url || "").trim();
        if (!raw || !raw.includes("/o/")) return "";
        const pathPart = raw.split("/o/")[1] || "";
        const encodedPath = pathPart.split("?")[0] || "";
        if (!encodedPath) return "";
        try {
            return decodeURIComponent(encodedPath);
        } catch (err) {
            console.warn("Failed to decode storage URL path:", err);
            return "";
        }
    }

    async function deleteStoragePathSafe(path) {
        const normalizedPath = String(path || "").trim();
        if (!storage || !normalizedPath) return false;
        try {
            await storage.ref().child(normalizedPath).delete();
            return true;
        } catch (err) {
            if (err?.code !== "storage/object-not-found") {
                console.warn("Failed to delete storage path:", normalizedPath, err);
            }
            return false;
        }
    }

    async function deleteStorageFolderRecursive(path, state) {
        const normalizedPath = String(path || "").trim().replace(/^\/+|\/+$/g, "");
        if (!storage || !normalizedPath || !state) return;

        try {
            const folderRef = storage.ref().child(normalizedPath);
            const listing = await folderRef.listAll();

            await Promise.all((listing.items || []).map(async (itemRef) => {
                try {
                    await itemRef.delete();
                    state.deletedCount += 1;
                } catch (err) {
                    if (err?.code !== "storage/object-not-found") {
                        console.warn("Failed to delete storage object:", itemRef.fullPath, err);
                    }
                }
            }));

            for (const childPrefix of (listing.prefixes || [])) {
                await deleteStorageFolderRecursive(childPrefix.fullPath, state);
            }
        } catch (err) {
            if (err?.code !== "storage/object-not-found") {
                console.warn("Failed to list storage folder:", normalizedPath, err);
            }
        }
    }

    async function deleteOwnedStorageAssets(uid, profileData = {}) {
        if (!uid || !storage) return { storageObjectsDeleted: 0 };

        const directPaths = new Set();
        [
            profileData?.profilePicPath,
            profileData?.bannerPath,
            extractStoragePathFromUrl(profileData?.profilePicUrl),
            extractStoragePathFromUrl(profileData?.bannerUrl)
        ].forEach((path) => {
            const normalized = String(path || "").trim();
            if (normalized) directPaths.add(normalized);
        });

        let deletedCount = 0;
        for (const path of directPaths) {
            const deleted = await deleteStoragePathSafe(path);
            if (deleted) deletedCount += 1;
        }

        const folderCleanupState = { deletedCount: 0 };
        for (const folder of [`profile-uploads/${uid}`, `profile-banners/${uid}`, `custom-uploads/${uid}`]) {
            await deleteStorageFolderRecursive(folder, folderCleanupState);
        }

        return {
            storageObjectsDeleted: deletedCount + folderCleanupState.deletedCount
        };
    }

    async function wipeOwnedCloudDataForUid(uid, options = {}) {
        if (!uid) {
            return { storageObjectsDeleted: 0 };
        }

        const removeStaffRecord = options.removeStaffRecord === true;
        const removeUserRecord = options.removeUserRecord === true;

        let userData = {};
        try {
            const userSnapshot = await db.ref(`users/${uid}`).once("value");
            userData = userSnapshot.val() || {};
        } catch (err) {
            console.warn("Failed to read user data before wipe:", err);
        }

        const storageCleanup = await deleteOwnedStorageAssets(uid, userData?.profile || {});

        const updates = {};
        updates[`cloudQueens/${uid}`] = null;
        updates[`usernames/${uid}`] = null;
        updates[`cloudSeasonHistory/${uid}`] = null;
        if (removeUserRecord) {
            updates[`users/${uid}`] = null;
        } else {
            updates[`users/${uid}/profile`] = null;
            updates[`users/${uid}/security`] = null;
            updates[`users/${uid}/privacy`] = null;
            updates[`users/${uid}/username`] = null;
            updates[`users/${uid}/emailVerified`] = null;
            updates[`users/${uid}/emailVerifiedManual`] = null;
        }
        if (removeStaffRecord) {
            updates[`staff/${uid}`] = null;
        }

        await db.ref().update(updates);

        return {
            storageObjectsDeleted: Number(storageCleanup?.storageObjectsDeleted || 0)
        };
    }

    async function deleteAccount() {
        if (!currentUser) return alert("sign in first");

        const confirmation = await window.showInHousePrompt(
            `type "${currentUser.email}" to confirm:`,
            "",
            "Delete Account"
        );

        if (confirmation !== currentUser.email) {
            return alert("cancelled - email didn't match");
        }

        const finalConfirm = await window.showInHouseConfirm(
            "FINAL WARNING - this can't be undone\n\nclick ok to permanently delete your account",
            "Final Warning"
        );

        if (!finalConfirm) {
            return alert("cancelled");
        }

        try {
            const uid = currentUser.uid;

            await wipeOwnedCloudDataForUid(uid, {
                removeStaffRecord: isStaff,
                removeUserRecord: true
            });

            await currentUser.delete();

            alert("account deleted permanently - signing you out now");
            
            setModalOpen(false);
            setAdminModalOpen(false);
        } catch (err) {
            console.error("Failed to delete account:", err);
            if (err.code === 'auth/requires-recent-login') {
                alert("you need to sign in again before deleting - log out and back in then try again");
            } else {
                alert("couldn't delete: " + err.message);
            }
        }
    }

    async function sendVerificationEmail(user) {
        if (!user) return;
        try {
            await user.sendEmailVerification({
                url: getAccountHomePageUrl()
            });
            showCloudNote("verification email sent - check inbox/spam", false);
            await window.showInHouseAlert(
                `Verification email sent to ${user.email || "your email"}.\n\nAfter you click the email link, you'll be sent to the home page (index.html) to finish verification. Then sign out/in (or reopen Account) to refresh your verified status.`,
                "Email Sent"
            );
        } catch (err) {
            console.error("Failed to send verification email:", err);
            alert("couldn't send email: " + err.message);
        }
    }

    async function isManualEmailVerified(uid) {
        if (!uid) return false;
        try {
            const snapshot = await db.ref(`users/${uid}/emailVerifiedManual`).once("value");
            return snapshot.val() === true;
        } catch (err) {
            console.error("Failed to load manual email verification:", err);
            return false;
        }
    }

    async function updateEmailVerificationUI(user) {
        if (!user) {
            if (emailVerifyStatus) emailVerifyStatus.classList.add("is-hidden");
            if (resendVerifyBtn) resendVerifyBtn.classList.add("is-hidden");
            return;
        }

        try {
            await user.reload();
        } catch (err) {
            console.warn("Failed to refresh auth user before verification check:", err);
        }

        const refreshedUser = auth.currentUser || user;

        const ownerAccess = isOwnerEmail(refreshedUser.email);
        const manualVerified = ownerAccess ? false : await isManualEmailVerified(refreshedUser.uid);
        const isVerified = ownerAccess || refreshedUser.emailVerified || manualVerified;

        if (isVerified) {
            if (emailVerifyStatus) {
                emailVerifyStatus.textContent = ownerAccess
                    ? "✓ Owner access granted"
                    : manualVerified && !user.emailVerified
                        ? "✓ Email verified (manual)"
                        : "✓ Email verified";
                emailVerifyStatus.style.color = "#2d7a2d";
                emailVerifyStatus.classList.remove("is-hidden");
            }
            if (resendVerifyBtn) resendVerifyBtn.classList.add("is-hidden");
        } else {
            if (emailVerifyStatus) {
                emailVerifyStatus.textContent = "⚠ Email not verified";
                emailVerifyStatus.style.color = "#b00020";
                emailVerifyStatus.classList.remove("is-hidden");
            }
            if (resendVerifyBtn) resendVerifyBtn.classList.remove("is-hidden");
        }
    }

    function toggleAuthMode() {
        isSignUpMode = !isSignUpMode;
        if (discordAuthBtn) discordAuthBtn.textContent = isSignUpMode ? "Create with Discord" : "Sign in with Discord";
        
        if (isSignUpMode) {
            if (signInFields) signInFields.classList.add("is-hidden");
            if (signUpFields) signUpFields.classList.remove("is-hidden");
            if (loginBtn) loginBtn.classList.add("is-hidden");
            if (signupBtn) signupBtn.classList.remove("is-hidden");
            if (signupBtn) signupBtn.textContent = "Create Account";
            if (toggleAuthModeUI) toggleAuthModeUI.textContent = "Already have an account? Sign in here";
            const forgotWrap = document.getElementById("forgotPasswordWrap");
            if (forgotWrap) forgotWrap.classList.add("is-hidden");
        } else {
            if (signInFields) signInFields.classList.remove("is-hidden");
            if (signUpFields) signUpFields.classList.add("is-hidden");
            if (loginBtn) loginBtn.classList.remove("is-hidden");
            if (signupBtn) signupBtn.classList.add("is-hidden");
            if (signupBtn) signupBtn.textContent = "Create account";
            if (toggleAuthModeUI) toggleAuthModeUI.textContent = "Need an account? Sign up here";
            const forgotWrap = document.getElementById("forgotPasswordWrap");
            if (forgotWrap) forgotWrap.classList.remove("is-hidden");
        }
    }

    function validateUsername(username) {
        if (!username) return "username is required";
        if (username.length < 3) return "username needs at least 3 characters";
        if (username.length > 20) return "username can't be more than 20 characters";
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return "username can only have letters, numbers, and underscores";
        return null;
    }

    async function checkUsernameAvailable(username) {
        try {
            const snapshot = await db.ref("usernames").orderByValue().equalTo(username.toLowerCase()).once("value");
            return !snapshot.exists();
        } catch (err) {
            console.error("Failed to check username:", err);
            return null;
        }
    }

    async function loadUsername(user) {
        if (!user) {
            if (profileUsernameDisplay) profileUsernameDisplay.textContent = "not signed in";
            window.currentUsername = null;
            return null;
        }

        try {
            const snapshot = await db.ref(`users/${user.uid}/username`).once("value");
            const username = snapshot.val() || user.email?.split("@")[0] || "User";
            
            if (profileUsernameDisplay) {
                profileUsernameDisplay.textContent = username;
            }

            window.currentUsername = username;
            
            return username;
        } catch (err) {
            console.error("Failed to load username:", err);
            const fallbackUsername = user.email?.split("@")[0] || "User";
            window.currentUsername = fallbackUsername;
            return fallbackUsername;
        }
    }

    async function loadProfileData(user) {
        if (!user) return;

        try {
            const profileSnapshot = await db.ref(`users/${user.uid}/profile`).once("value");
            const profile = profileSnapshot.val() || {};

            if (profileBannerInput) {
                profileBannerInput.value = profile.bannerUrl || "";
            }
            if (profileBannerUrlInput) {
                profileBannerUrlInput.value = profile.bannerUrl || "";
            }
            setProfileImageInputMode(inferProfileImageMode(profile.bannerUrl || ""), {
                fileInput: profileBannerFileInput,
                urlInput: profileBannerUrlInput,
                uploadBtn: profileBannerModeUploadBtn,
                urlBtn: profileBannerModeUrlBtn
            });

            if (profileBioInput) {
                profileBioInput.value = profile.bio || "";
            }

            if (profileEffectsSelect) {
                profileEffectsSelect.value = normalizeProfileEffect(profile.profileEffect);
            }
            updateProfileEffectPreview();
        } catch (err) {
            console.error("Failed to load profile data:", err);
        }
    }

    function isBanActive(banData) {
        if (!banData) return false;
        if (typeof banData.untilMs === "number") return banData.untilMs > Date.now();
        if (banData.until) {
            const untilDate = new Date(banData.until);
            if (!Number.isNaN(untilDate.getTime()) && untilDate < new Date()) {
                return false;
            }
        }
        return true;
    }

    function getBanPopupMessage(banData) {
        const reason = String(banData?.reason || "No reason provided").trim();
        const untilText = banData?.until
            ? (() => {
                const dt = new Date(banData.until);
                return Number.isNaN(dt.getTime()) ? "" : `Until: ${dt.toLocaleString()}`;
            })()
            : "";
        return [
            "Your account is banned from playing on this simulator.",
            `Reason: ${reason}`,
            untilText
        ].filter(Boolean).join("\n");
    }

    function hideBannedPlayOverlay() {
        if (!bannedPlayOverlay) return;
        if (typeof deactivateCenteredPopup === "function") {
            deactivateCenteredPopup(bannedPlayOverlay);
        }
        bannedPlayOverlay.remove();
        bannedPlayOverlay = null;
    }

    function showBannedPlayOverlay(banData) {
        const message = getBanPopupMessage(banData);

        if (!bannedPlayOverlay) {
            bannedPlayOverlay = document.createElement("div");
            bannedPlayOverlay.className = "history-save-modal active";
            bannedPlayOverlay.setAttribute("aria-hidden", "false");
            bannedPlayOverlay.innerHTML = `
                <div class="history-save-modal-card generate-cast-card" role="dialog" aria-modal="true" aria-label="Playing Ban Notice">
                    <h3>Playing Ban Notice</h3>
                    <p class="generate-cast-subtitle" style="white-space: pre-wrap;">${escapeInHouseDialogText(message)}</p>
                    <div class="generate-cast-actions">
                        <button type="button" data-action="appeal">Appeal this ban</button>
                        <button type="button" data-action="my-cases">My reports &amp; appeals</button>
                        <button type="button" data-action="logout">Sign out</button>
                    </div>
                </div>
            `;

            bannedPlayOverlay.querySelector('[data-action="appeal"]').addEventListener("click", () => openSupportComposer("appeals"));
            bannedPlayOverlay.querySelector('[data-action="my-cases"]').addEventListener("click", showMyCases);
            const logoutBtnEl = bannedPlayOverlay.querySelector('[data-action="logout"]');
            if (logoutBtnEl) {
                logoutBtnEl.addEventListener("click", async () => {
                    try {
                        await auth.signOut();
                    } catch (err) {
                        console.error("Failed to sign out banned user:", err);
                    }
                });
            }

            document.body.appendChild(bannedPlayOverlay);
        } else {
            const subtitle = bannedPlayOverlay.querySelector(".generate-cast-subtitle");
            if (subtitle) subtitle.textContent = message;
            if (!bannedPlayOverlay.isConnected) {
                document.body.appendChild(bannedPlayOverlay);
            }
        }

        bannedPlayOverlay.classList.add("active");
        bannedPlayOverlay.setAttribute("aria-hidden", "false");
        if (typeof activateCenteredPopup === "function") {
            activateCenteredPopup(bannedPlayOverlay);
        } else {
            syncPopupOverlayPosition(bannedPlayOverlay);
            bannedPlayOverlay.style.display = "flex";
            bannedPlayOverlay.style.pointerEvents = "auto";
        }
    }

    function applyStaffState(nextIsStaff) {
        staffRaw = nextIsStaff;
        const allowedStaff = nextIsStaff && !isBanned;
        isStaff = allowedStaff;
        if (navAdminItem) {
            navAdminItem.classList.toggle("is-hidden", !isStaff);
        }
        updateAdminRoleUi();
        if (!isStaff) {
            setAdminModalOpen(false);
        } else {
            routeAdminHashWhenStaff();
        }
    }

    function applyBanState(isActive, banData) {
        isBanned = isActive;
        if (isBanned) {
            const reason = banData?.reason ? ` reason: ${banData.reason}` : "";
            showCloudNote(`you're banned from playing${reason}`, true);
            setModalOpen(false);
            setAdminModalOpen(false);
            showBannedPlayOverlay(banData);
        } else {
            hideBannedPlayOverlay();
        }
        applyStaffState(staffRaw);
    }

    function stopBanListener() {
        if (banStatusRef && banStatusHandler) {
            banStatusRef.off("value", banStatusHandler);
        }
        banStatusRef = null;
        banStatusHandler = null;
    }

    function stopStaffListener() {
        if (staffStatusRef && staffStatusHandler) {
            staffStatusRef.off("value", staffStatusHandler);
        }
        staffStatusRef = null;
        staffStatusHandler = null;
    }

    async function checkBanStatus(user) {
        if (!user) {
            stopBanListener();
            applyBanState(false, null);
            return;
        }

        try {
            stopBanListener();
            banStatusRef = db.ref(`users/${user.uid}/ban`);
            banStatusHandler = (snapshot) => {
                const banData = snapshot.val();
                applyBanState(isBanActive(banData), banData);
            };
            banStatusRef.on("value", banStatusHandler);
        } catch (err) {
            console.error("Failed to check ban status:", err);
            applyBanState(false, null);
        }
    }

    async function checkStaffStatus(user) {
        adminElevationExpiresAt = 0;
        usersPageCursors = [null];
        usersPageIndex = 0;
        usersPageQueryKey = "";
        if (!user) {
            stopStaffListener();
            currentStaffRole = "";
            applyStaffState(false);
            return;
        }

        const isHardcodedStaff = isOwnerEmail(user.email);

        try {
            stopStaffListener();

            if (isHardcodedStaff) {
                applyStaffState(true);
                try {
                    const staffSnapshot = await db.ref(`staff/${user.uid}`).once("value");
                    if (!staffSnapshot.exists()) {
                        await db.ref(`staff/${user.uid}`).set({
                            email: user.email,
                            addedBy: "system",
                            addedAt: new Date().toISOString(),
                            role: "owner"
                        });
                    } else if (staffSnapshot.val().role !== "owner") {
                        await db.ref(`staff/${user.uid}`).update({ role: "owner" });
                    }
                } catch (syncErr) {
                    console.warn("Could not sync owner staff record:", syncErr);
                }
            }

            staffStatusRef = db.ref(`staff/${user.uid}`);
            staffStatusHandler = (snapshot) => {
                const hasStaffRecord = snapshot.exists();
                const recordRole = String(snapshot.val()?.role || (hasStaffRecord ? "staff" : "")).toLowerCase();
                currentStaffRole = isHardcodedStaff ? "owner" : recordRole;
                applyStaffState(hasStaffRecord || isHardcodedStaff);
            };
            staffStatusRef.on("value", staffStatusHandler, (listenerErr) => {
                console.error("Staff status listener failed:", listenerErr);
                currentStaffRole = isHardcodedStaff ? "owner" : "";
                applyStaffState(isHardcodedStaff);
            });
        } catch (err) {
            console.error("Failed to check staff status:", err);
            currentStaffRole = isHardcodedStaff ? "owner" : "";
            applyStaffState(isHardcodedStaff);
        }
    }

    // Applies several moderation changes and their audit log entries in one atomic update.
    async function commitModerationBatch(entries) {
        if (!isStaff || !currentUser) throw new Error("Staff access is required.");
        const updates = {};
        entries.forEach(({ action, targetUid, targetEmail, changes, details = {} }) => {
            Object.assign(updates, changes);
            const logKey = db.ref("moderationLogs").push().key;
            const cleanDetails = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== ""));
            updates[`moderationLogs/${logKey}`] = {
                action,
                actorUid: currentUser.uid,
                actorEmail: currentUser.email || "",
                targetUid,
                targetEmail: targetEmail || "",
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                ...cleanDetails
            };
        });
        await db.ref().update(updates);
    }

    async function commitModerationAction(action, targetUid, targetEmail, changes, details = {}) {
        await commitModerationBatch([{ action, targetUid, targetEmail, changes, details }]);
    }

    const STAFF_ROLE_RANK = { staff: 1, admin: 2, owner: 3 };
    const MODERATOR_MAX_BAN_DAYS = 30;
    const ADMIN_ELEVATION_GRACE_MS = 30000;
    const ADMIN_FRESH_SIGN_IN_MS = 4 * 60000;
    let adminElevationExpiresAt = 0;
    let adminElevationTimer = 0;
    let adminElevationPromise = null;

    function getStaffRoleRank(role = currentStaffRole) {
        return STAFF_ROLE_RANK[String(role || "").toLowerCase()] || (isStaff ? 1 : 0);
    }

    function hasAdminRole() {
        return isStaff && getStaffRoleRank() >= STAFF_ROLE_RANK.admin;
    }

    function getAdminApiErrorMessage(err) {
        const messages = {
            "directory-initializing": "The account index is being prepared. Try again after maintenance completes.",
            "submission-rate-limit": "Please wait a minute between submissions. Up to five submissions are allowed per day.",
            "appeal-already-submitted": "You have already appealed this ban. Check My reports & appeals for its status.",
            "case-message-too-short": "Please provide at least 10 characters of detail.",
            "case-response-required": "Add a response of at least 5 characters before resolving this case.",
            "invalid-target": "Enter another account's username or user ID.",
            "account-not-found": "That account wasn't found. Use its exact username or user ID.",
            "no-active-ban": "There is no active ban to appeal.",
            "case-assigned": "This case is assigned to another staff member.",
            "case-busy": "Another action is in progress. Refresh and try again.",
            "case-closed": "This case is already closed. Refresh to see the outcome.",
            "ban-changed": "The ban has changed since this appeal was submitted. The newer ban was not removed.",
            "reauth-required": "Please confirm your password to continue.",
            forbidden: "Your role can't do that.",
            "invalid-webhook": "That doesn't look like a Discord webhook URL.",
            "invalid-gift-role": "Enter a valid Discord role ID (17-20 digits), or leave it blank to disable gift tickets.",
            "webhook-not-configured": "Add a Discord webhook URL first.",
            "webhook-invalid": "This webhook was deleted or its token is invalid. Create a new webhook in Discord and save its URL.",
            "webhook-forbidden": "Discord denied access. Check the webhook's channel or thread permissions.",
            "webhook-rate-limited": "Discord is rate-limiting alerts. Wait a few seconds before sending another test.",
            "webhook-unavailable": "Discord could not be reached. Try sending the test again shortly.",
            "webhook-failed": "Discord rejected the test message. Check the webhook URL.",
            "admin-api-unavailable": "The admin server isn't reachable right now.",
            PERMISSION_DENIED: "Permission denied. Your role may not allow this, or your confirmation expired."
        };
        const code = String(err?.code || err?.message || "").replace(/^.*permission_denied.*$/i, "PERMISSION_DENIED");
        return messages[code] || "Something went wrong. Try again.";
    }

    async function callAdminApi(action, payload = {}, endpointName = "adminApi") {
        const endpoint = getCloudFunctionEndpoint(endpointName);
        if (!endpoint || !currentUser) {
            const err = new Error("admin-api-unavailable");
            err.code = "admin-api-unavailable";
            throw err;
        }
        const token = await currentUser.getIdToken();
        let response;
        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...payload, action })
            });
        } catch (_networkErr) {
            const err = new Error("admin-api-unavailable");
            err.code = "admin-api-unavailable";
            throw err;
        }
        let data = null;
        try {
            data = await response.json();
        } catch (_err) {
            data = null;
        }
        if (!response.ok || !data?.ok) {
            const code = data?.error || (response.status === 404 ? "admin-api-unavailable" : `http-${response.status}`);
            const err = new Error(code);
            err.code = code;
            err.status = response.status;
            throw err;
        }
        return data;
    }

    function updateAdminElevationStatus() {
        const status = document.getElementById("adminElevationStatus");
        if (!status) return;
        const remaining = adminElevationExpiresAt - Date.now();
        const unlocked = remaining > 0;
        status.classList.toggle("is-unlocked", unlocked);
        status.innerHTML = unlocked
            ? `<i class="fa-solid fa-lock-open" aria-hidden="true"></i> <span>Unlocked · ${Math.max(1, Math.ceil(remaining / 60000))} min</span>`
            : '<i class="fa-solid fa-lock" aria-hidden="true"></i> <span>Locked · click to unlock</span>';
        status.setAttribute("aria-label", unlocked
            ? `Sensitive actions unlocked for ${Math.max(1, Math.ceil(remaining / 60000))} more minutes`
            : "Sensitive actions locked. Click to confirm your password.");
    }

    async function reauthenticateStaff(actionLabel) {
        const providers = (currentUser?.providerData || []).map((provider) => provider?.providerId);
        try {
            if (providers.includes("password") && currentUser.email) {
                const password = await window.showInHousePasswordPrompt(
                    `For your security, confirm your password to ${actionLabel}. You won't be asked again for 15 minutes.`,
                    "Confirm it's you"
                );
                if (!password) return false;
                const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
                await currentUser.reauthenticateWithCredential(credential);
                return true;
            }
            if (providers.includes("google.com") && firebase.auth.GoogleAuthProvider) {
                await currentUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
                return true;
            }
            await window.showInHouseAlert("Sign out and sign back in, then try again.", "Sign in again");
            return false;
        } catch (err) {
            console.warn("Staff re-authentication failed:", err?.code || err);
            const wrongPassword = ["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(err?.code);
            showAdminToast(wrongPassword ? "That password didn't work." : "Couldn't confirm it's you. Try again.", { tone: "danger" });
            return false;
        }
    }

    async function requestAdminElevation() {
        const result = await callAdminApi("stepUp");
        adminElevationExpiresAt = Number(result.expiresAt) || 0;
        updateAdminElevationStatus();
        return adminElevationExpiresAt > Date.now();
    }

    // Sensitive writes are only allowed by the database rules while staffElevation/{uid} is in the future.
    async function ensureAdminElevation(actionLabel = "continue") {
        if (!isStaff || !currentUser) return false;
        if (adminElevationExpiresAt - Date.now() > ADMIN_ELEVATION_GRACE_MS) return true;
        if (adminElevationPromise) return adminElevationPromise;
        adminElevationPromise = (async () => {
            try {
                const stored = Number((await db.ref(`staffElevation/${currentUser.uid}`).once("value")).val()) || 0;
                if (stored - Date.now() > ADMIN_ELEVATION_GRACE_MS) {
                    adminElevationExpiresAt = stored;
                    updateAdminElevationStatus();
                    return true;
                }
            } catch (_err) {
                // Fall through to a fresh confirmation.
            }
            try {
                const tokenResult = await currentUser.getIdTokenResult();
                if (Date.now() - Date.parse(tokenResult.authTime) < ADMIN_FRESH_SIGN_IN_MS) return await requestAdminElevation();
            } catch (err) {
                if (err?.code !== "reauth-required") {
                    showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
                    return false;
                }
            }
            if (!(await reauthenticateStaff(actionLabel))) return false;
            try {
                await currentUser.getIdToken(true);
                return await requestAdminElevation();
            } catch (err) {
                showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
                return false;
            }
        })();
        try {
            return await adminElevationPromise;
        } finally {
            adminElevationPromise = null;
        }
    }

    window.ensureAdminElevation = ensureAdminElevation;

    function showAdminToast(message, options = {}) {
        const region = document.getElementById("adminToastRegion");
        if (!region || !adminModal?.classList.contains("active")) {
            if (typeof showCloudNote === "function") showCloudNote(message, options.tone === "danger");
            return null;
        }
        const toast = document.createElement("div");
        toast.className = `admin-toast${options.tone ? ` is-${options.tone}` : ""}`;
        toast.setAttribute("role", options.tone === "danger" ? "alert" : "status");
        const icon = options.tone === "danger" ? "fa-circle-exclamation" : options.tone === "warning" ? "fa-triangle-exclamation" : "fa-circle-check";
        toast.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><p></p>`;
        toast.querySelector("p").textContent = message;
        const duration = Number(options.duration) || (options.actionLabel ? 8000 : 4500);
        let timer = null;
        const dismiss = () => {
            window.clearTimeout(timer);
            toast.classList.add("is-leaving");
            window.setTimeout(() => toast.remove(), 200);
        };
        if (options.actionLabel && typeof options.onAction === "function") {
            const action = document.createElement("button");
            action.type = "button";
            action.className = "admin-toast-action";
            action.textContent = options.actionLabel;
            action.addEventListener("click", async () => {
                action.disabled = true;
                dismiss();
                await options.onAction();
            });
            toast.appendChild(action);
        }
        const close = document.createElement("button");
        close.type = "button";
        close.className = "admin-toast-close";
        close.setAttribute("aria-label", "Dismiss notification");
        close.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        close.addEventListener("click", dismiss);
        toast.appendChild(close);
        if (options.actionLabel) {
            const bar = document.createElement("span");
            bar.className = "admin-toast-timer";
            bar.style.animationDuration = `${duration}ms`;
            toast.appendChild(bar);
        }
        region.appendChild(toast);
        while (region.children.length > 4) region.firstElementChild.remove();
        timer = window.setTimeout(dismiss, duration);
        toast.addEventListener("mouseenter", () => window.clearTimeout(timer));
        toast.addEventListener("mouseleave", () => { timer = window.setTimeout(dismiss, 3000); });
        return toast;
    }

    function renderAdminSkeleton(container, kind = "cards", count = 4) {
        if (!container) return;
        const lines = '<span class="admin-skeleton-lines"><span class="admin-shimmer"></span><span class="admin-shimmer is-short"></span></span>';
        const item = {
            cards: `<div class="admin-skeleton-card"><span class="admin-shimmer admin-skeleton-avatar"></span>${lines}</div>`,
            stats: `<div class="admin-skeleton-stat"><span class="admin-shimmer admin-skeleton-icon"></span>${lines}</div>`,
            chart: '<div class="admin-skeleton-chart"><span class="admin-skeleton-lines"><span class="admin-shimmer is-short"></span></span><span class="admin-shimmer is-block"></span></div>',
            rows: `<div class="admin-skeleton-row">${lines}</div>`
        }[kind] || "";
        container.innerHTML = `<div class="admin-skeleton is-${kind}" role="status"><span class="sr-only">Loading…</span>${item.repeat(count)}</div>`;
    }

    function renderAdminEmpty(container, icon, title, text = "", tone = "") {
        if (!container) return;
        container.innerHTML = `
            <div class="admin-empty${tone ? ` is-${tone}` : ""}">
                <span class="admin-empty-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
                <p class="admin-empty-title">${escapeAdminText(title)}</p>
                ${text ? `<p class="admin-empty-text">${escapeAdminText(text)}</p>` : ""}
            </div>
        `;
    }

    function toCsvCell(value) {
        let text = String(value ?? "");
        // Stops spreadsheet apps from running cell contents as formulas.
        if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function downloadCsv(filename, headers, rows) {
        const csv = [headers, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function getAssignableStaffRoles() {
        if (!isStaff) return [];
        if (currentStaffRole === "owner") return ["staff", "admin"];
        if (currentStaffRole === "admin") return ["staff"];
        return [];
    }

    // Mirrors the staff/$uid database rule so the UI only offers allowed changes.
    function canManageStaffRecord(uid, role, email) {
        if (!isStaff || !currentUser || uid === currentUser.uid || isOwnerEmail(email)) return false;
        if (currentStaffRole === "owner") return role !== "owner";
        if (currentStaffRole === "admin") return role === "staff";
        return false;
    }

    const ADMIN_ONLY_TABS = new Set(["announcements", "staff", "performance"]);
    function canOpenAdminTab(tabName) {
        return !ADMIN_ONLY_TABS.has(tabName) || hasAdminRole();
    }

    // UI mirror of the database rules: moderators can't see raw IPs, export data, or change site settings.
    function applyAdminRoleGating() {
        const isAdmin = hasAdminRole();
        document.querySelectorAll("#adminModal [data-admin-min-role='admin']").forEach((el) => { el.hidden = !isAdmin; });
        const search = document.getElementById("adminGlobalSearch");
        if (search) search.placeholder = isAdmin ? "Search email, username, Discord, UID or IP" : "Search email, username, Discord or UID";
        if (usersSearchInput) usersSearchInput.placeholder = isAdmin ? "Search by email, username, Discord, UID or IP" : "Search by email, username, Discord or UID";
        const foot = document.querySelector(".admin-sidebar-foot");
        if (foot) foot.hidden = !isAdmin;
        [["usersBulkBanForm", () => getSelectedAccountTargets(), () => clearUsersSelection()],
            ["reviewsBulkBanForm", () => Array.from(adminSelectedReviews.values()), null]].forEach(([id, getTargets, after]) => {
            const host = document.getElementById(id);
            if (!host || host.dataset.role === currentStaffRole) return;
            host.dataset.role = currentStaffRole;
            host.innerHTML = buildBanFormHtml(id === "reviewsBulkBanForm" ? "Ban evasion" : "", "Ban selected");
            bindBanForm(host.querySelector("form"), async ({ reason, spec }) => {
                const targets = getTargets();
                if (!targets.length) return;
                const isReview = id === "reviewsBulkBanForm";
                const ok = await banTargets(targets.slice(0, 100), reason, spec, isReview
                    ? { extraChanges: (target) => reviewResolutionChanges(target.uid, "actioned") }
                    : {});
                if (ok) {
                    host.closest("details")?.removeAttribute("open");
                    after?.();
                }
            });
        });
        const activeTab = document.querySelector(".admin-tab-btn.active")?.getAttribute("data-admin-tab");
        if (activeTab && !canOpenAdminTab(activeTab) && adminModal?.classList.contains("active")) switchAdminTab("overview");
    }

    function updateAdminRoleUi() {
        applyAdminRoleGating();
        const roleChip = document.getElementById("adminRoleChip");
        if (roleChip) {
            const role = currentStaffRole || "staff";
            roleChip.textContent = `Signed in as ${role.charAt(0).toUpperCase()}${role.slice(1)}`;
        }
        const roles = getAssignableStaffRoles();
        const addRoleSelect = document.getElementById("addStaffRole");
        if (addRoleSelect) {
            Array.from(addRoleSelect.options).forEach((option) => {
                option.disabled = !roles.includes(option.value);
                option.hidden = !roles.includes(option.value);
            });
            if (!roles.includes(addRoleSelect.value)) addRoleSelect.value = roles[0] || "staff";
        }
        [addStaffEmail, addStaffBtn, addRoleSelect].forEach((control) => {
            if (control) control.disabled = roles.length === 0;
        });
        const hint = document.getElementById("addStaffPermissionHint");
        if (hint) {
            hint.textContent = roles.length
                ? `You can add: ${roles.join(" or ")}.`
                : "Only owners and admins can add or change staff.";
        }
    }

    let moderationLogEntries = [];
    async function loadModerationLogs() {
        const list = document.getElementById("moderationLogsList");
        const refresh = document.getElementById("refreshModerationLogsBtn");
        if (!isStaff || !list || refresh?.disabled) return;
        if (refresh) refresh.disabled = true;
        renderAdminSkeleton(list, "rows", 6);
        try {
            const snapshot = await db.ref("moderationLogs").orderByChild("createdAt").limitToLast(100).once("value");
            const entries = [];
            snapshot.forEach((child) => { entries.push(child.val()); });
            moderationLogEntries = entries.reverse();
            list.replaceChildren();
            if (!moderationLogEntries.length) {
                renderAdminEmpty(list, "fa-clipboard-list", "No actions yet", "Bans, verifications, notes and staff changes will be listed here.");
            }
            moderationLogEntries.forEach((entry) => {
                const card = document.createElement("article");
                card.className = `moderation-log-card is-${escapeAdminText(entry.action || "other")}`;
                const end = entry.untilMs || toTimestamp(entry.until);
                card.innerHTML = `
                    <div class="security-log-head">
                        <strong>${escapeAdminText(MODERATION_LABELS[entry.action] || entry.action)}</strong>
                        <time title="${escapeAdminText(formatLogTimestamp(entry.createdAt))}">${escapeAdminText(formatRelativeTime(entry.createdAt))}</time>
                    </div>
                    ${entry.targetUid && entry.targetUid !== "discord-alerts" ? `<p><b>Account:</b> <button type="button" class="admin-link-button" data-open-uid="${escapeAdminText(entry.targetUid)}">${escapeAdminText(entry.targetEmail || entry.targetUid)}</button></p>` : ""}
                    <p><b>${entry.actorUid === "system" ? "By" : "Moderator"}:</b> ${escapeAdminText(entry.actorUid === "system" ? "Automatic" : (entry.actorEmail || entry.actorUid))}</p>
                    ${entry.reason ? `<p><b>Reason:</b> ${escapeAdminText(entry.reason)}</p>` : ""}
                    ${entry.action === "ban" ? `<p><b>Ends:</b> ${end ? escapeAdminText(formatLogTimestamp(end)) : "Permanent"}</p>` : ""}
                    ${entry.role ? `<p><b>Role:</b> ${escapeAdminText(entry.previousRole ? `${entry.previousRole} → ${entry.role}` : entry.role)}</p>` : ""}
                    ${entry.bulkId ? '<p class="admin-card-note"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Part of a bulk action</p>' : ""}
                `;
                card.querySelector("[data-open-uid]")?.addEventListener("click", (event) => {
                    openAdminAccountFromAnywhere(event.currentTarget.getAttribute("data-open-uid"));
                });
                list.appendChild(card);
            });
        } catch (err) {
            console.error("Failed to load moderation logs:", err);
            renderAdminEmpty(list, "fa-triangle-exclamation", "Couldn't load the admin log", "Try Refresh.", "danger");
        } finally {
            if (refresh) refresh.disabled = false;
        }
    }

    function exportModerationLogsCsv() {
        if (!hasAdminRole()) return;
        if (!moderationLogEntries.length) return showAdminToast("Nothing to export yet.", { tone: "warning" });
        downloadCsv(`admin-log-${new Date().toISOString().slice(0, 10)}.csv`,
            ["when", "action", "account email", "account uid", "moderator", "reason", "ban ends", "role", "bulk id"],
            moderationLogEntries.map((entry) => [
                entry.createdAt ? new Date(toTimestamp(entry.createdAt)).toISOString() : "",
                MODERATION_LABELS[entry.action] || entry.action || "",
                entry.targetEmail || "", entry.targetUid || "",
                entry.actorEmail || entry.actorUid || "",
                entry.reason || "",
                entry.untilMs ? new Date(entry.untilMs).toISOString() : (entry.until || ""),
                entry.role ? (entry.previousRole ? `${entry.previousRole} -> ${entry.role}` : entry.role) : "",
                entry.bulkId || ""
            ]));
        showAdminToast(`Exported ${moderationLogEntries.length} entries.`);
    }

    document.getElementById("exportModerationLogsBtn")?.addEventListener("click", exportModerationLogsCsv);
    document.getElementById("refreshModerationLogsBtn")?.addEventListener("click", loadModerationLogs);

    async function addStaffMember(email) {
        if (!isStaff || !currentUser) return alert("you don't have permission for that");

        const emailToAdd = email.trim();
        if (!emailToAdd) return alert("enter an email first");

        try {
            const users = await getUsersSnapshotCached();
            
            let targetUid = null;
            if (users) {
                for (const [uid, userData] of Object.entries(users)) {
                    if (userData.email === emailToAdd) {
                        targetUid = uid;
                        break;
                    }
                }
            }

            if (!targetUid) {
                return alert("couldn't find that user - they need to make an account first");
            }

            const staffSnapshot = await db.ref(`staff/${targetUid}`).once("value");
            if (staffSnapshot.exists()) {
                return alert("they're already staff");
            }

            const addStaffRoleSelect = document.getElementById("addStaffRole");
            const selectedRole = addStaffRoleSelect?.value || "staff";
            if (!getAssignableStaffRoles().includes(selectedRole) || targetUid === currentUser.uid) {
                return alert("your role can't grant that access");
            }
            if (!(await ensureAdminElevation("add staff"))) return;

            await commitModerationAction("staff-add", targetUid, emailToAdd, { [`staff/${targetUid}`]: {
                email: emailToAdd,
                addedBy: currentUser.email,
                addedAt: new Date().toISOString(),
                role: selectedRole
            } }, { role: selectedRole });

            alert(`${selectedRole} added`);
            if (addStaffEmail) addStaffEmail.value = "";
            if (addStaffRoleSelect) addStaffRoleSelect.value = "staff";
            loadStaffList();
        } catch (err) {
            console.error("Failed to add staff member:", err);
            alert("couldn't add them");
        }
    }

    async function removeStaffMember(uid, email) {
        if (!isStaff || !currentUser) return alert("you don't have permission for that");

        if (isOwnerEmail(email)) {
            return alert("can't remove system admins");
        }

        try {
            const existing = (await db.ref(`staff/${uid}`).once("value")).val() || {};
            if (!canManageStaffRecord(uid, existing.role || "staff", email)) {
                return alert("your role can't remove this staff member");
            }
        } catch (err) {
            console.error("Failed to check staff permissions:", err);
            return alert("couldn't check permissions");
        }

        if (!(await window.showInHouseConfirm(`remove ${email}?`, "Remove Staff"))) return;
        if (!(await ensureAdminElevation("remove staff"))) return;

        try {
            await commitModerationAction("staff-remove", uid, email, { [`staff/${uid}`]: null });
            alert("removed");
            loadStaffList();
        } catch (err) {
            console.error("Failed to remove staff member:", err);
            alert("couldn't remove them");
        }
    }

    async function loadStaffList() {
        if (!isStaff || !staffList) return;

        try {
            const snapshot = await db.ref("staff").once("value");
            const staff = snapshot.val();

            staffList.innerHTML = "";

            if (!staff) {
                staffList.innerHTML = '<p class="empty-state">no staff yet</p>';
                return;
            }

            Object.entries(staff).forEach(([uid, staffData]) => {
                const staffCard = document.createElement("div");
                staffCard.className = "staff-card";
                
                const role = ["owner", "admin", "staff"].includes(staffData.role) ? staffData.role : "staff";
                const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
                const roleBadgeClass = role === "owner" ? "badge-owner-tag" : role === "admin" ? "badge-admin-tag" : "badge-staff-tag";
                const canManage = canManageStaffRecord(uid, role, staffData.email);
                const roleOptions = getAssignableStaffRoles();
                const addedAt = staffData.addedAt ? new Date(staffData.addedAt) : null;
                const addedLabel = addedAt && !Number.isNaN(addedAt.getTime()) ? addedAt.toLocaleDateString() : "unknown date";
                
                staffCard.innerHTML = `
                    <div class="staff-info">
                        <strong>${escapeAdminText(staffData.email || uid)}</strong>
                        <small>Added: ${escapeAdminText(addedLabel)} by ${escapeAdminText(staffData.addedBy || "unknown")}</small>
                        <span class="badge ${roleBadgeClass}">${roleLabel}</span>
                    </div>
                    <div class="staff-actions">
                        ${canManage ? `
                            <select class="staff-role-select" aria-label="Role for ${escapeAdminText(staffData.email || uid)}" ${roleOptions.length < 2 ? "disabled" : ""}>
                                ${["staff", "admin"].filter((option) => roleOptions.includes(option) || option === role).map((option) => `<option value="${option}" ${role === option ? "selected" : ""}>${option === "admin" ? "Admin" : "Staff"}</option>`).join("")}
                            </select>
                            <button type="button" class="cloud-btn delete-btn" title="Remove staff" aria-label="Remove ${escapeAdminText(staffData.email || uid)}">
                                <i class="fa-solid fa-trash" aria-hidden="true"></i>
                            </button>
                        ` : ""}
                    </div>
                `;
                staffCard.querySelector(".staff-role-select")?.addEventListener("change", (event) => changeStaffRole(uid, event.target.value));
                staffCard.querySelector(".delete-btn")?.addEventListener("click", () => removeStaffMember(uid, staffData.email || ""));

                staffList.appendChild(staffCard);
            });
        } catch (err) {
            console.error("Failed to load staff list:", err);
            staffList.innerHTML = '<p class="error-state">couldn\'t load staff list</p>';
        }
    }

    async function setManualEmailVerified(uid, email) {
        if (!isStaff || !currentUser) return alert("you don't have permission for that");
        if (!uid) return alert("couldn't find that user");
        if (!hasAdminRole()) return showAdminToast("Only admins can mark accounts verified.", { tone: "warning" });
        if (!(await window.showInHouseConfirm(`verify ${email || "this user"}?`, "Verify User"))) return;
        if (!(await ensureAdminElevation("mark this account verified"))) return;

        try {
            await commitModerationAction("verify", uid, email, { [`users/${uid}/emailVerifiedManual`]: true });
            showAdminToast(`Marked ${email || "account"} as verified.`);
        } catch (err) {
            console.error("Failed to verify user:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        }
        refreshAdminAfterModeration();
    }

    async function findUserByEmail(email) {
        return findUserByLookup(email);
    }

    function normalizeLookupToken(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/^@+/, "");
    }

    function collectDiscordLookupTokens(discordData) {
        if (!discordData || typeof discordData !== "object") return [];

        const username = String(discordData.username || "").trim();
        const globalName = String(discordData.globalName || discordData.displayName || "").trim();
        const id = String(discordData.id || "").trim();
        const discriminator = String(discordData.discriminator || "").trim();
        const raw = [
            username,
            globalName,
            id,
            username ? `@${username}` : "",
            username && discriminator && discriminator !== "0" ? `${username}#${discriminator}` : ""
        ];

        return raw
            .map(normalizeLookupToken)
            .filter(Boolean);
    }

    function collectUserLookupTokens(userData) {
        const email = normalizeLookupToken(userData?.email || "");
        const username = normalizeLookupToken(userData?.username || "");
        const discordTokens = collectDiscordLookupTokens(userData?.profile?.discordLink);
        return [email, username, ...discordTokens].filter(Boolean);
    }

    function invalidateUsersSnapshotCache() {
        usersSnapshotCache = null;
        usersSnapshotRequest = null;
    }

    async function getUsersSnapshotCached() {
        const now = Date.now();
        if (usersSnapshotCache && usersSnapshotCache.expiresAt > now) {
            return usersSnapshotCache.value;
        }

        if (usersSnapshotRequest) {
            return usersSnapshotRequest;
        }

        usersSnapshotRequest = (async () => {
            try {
                const snapshot = await db.ref("users").once("value");
                const users = snapshot.val() || null;
                usersSnapshotCache = {
                    value: users,
                    expiresAt: Date.now() + USERS_SNAPSHOT_CACHE_TTL_MS
                };
                return users;
            } finally {
                usersSnapshotRequest = null;
            }
        })();

        return usersSnapshotRequest;
    }

    function userMatchesLookup(userData, lookup, allowPartial = false) {
        const normalizedLookup = normalizeLookupToken(lookup);
        if (!normalizedLookup) return true;

        const tokens = collectUserLookupTokens(userData);
        return tokens.some((token) => allowPartial
            ? token.includes(normalizedLookup)
            : token === normalizedLookup);
    }

    async function findUserByLookup(identifier) {
        const lookup = normalizeLookupToken(identifier);
        if (!lookup) return null;

        const users = await getUsersSnapshotCached();
        let result = null;

        if (users) {
            Object.entries(users).some(([uid, userData]) => {
                if (userMatchesLookup(userData, lookup, false)) {
                    result = { uid, userData };
                    return true;
                }
                return false;
            });
        }

        return result;
    }

    async function findUserByUsername(username) {
        const users = await getUsersSnapshotCached();
        let result = null;

        if (users) {
            Object.entries(users).some(([uid, userData]) => {
                if ((userData.username || "").toLowerCase() === username.toLowerCase()) {
                    result = { uid, userData };
                    return true;
                }
                return false;
            });
        }

        return result;
    }

    async function openProfileByUsername(username) {
        if (!db) return;
        try {
            const found = await findUserByUsername(username);
            if (found) {
                displayProfileView(found.uid);
            }
        } catch (err) {
            console.error("couldn't open profile:", err);
        }
    }

    window.openProfileByUsername = openProfileByUsername;

    const BAN_DURATIONS = [
        { value: "1h", label: "1 hour", ms: 3600000 },
        { value: "24h", label: "24 hours", ms: 86400000 },
        { value: "3d", label: "3 days", ms: 3 * 86400000 },
        { value: "7d", label: "7 days", ms: 7 * 86400000 },
        { value: "30d", label: "30 days", ms: 30 * 86400000 },
        { value: "custom", label: "Until a date…" },
        { value: "permanent", label: "Permanent", adminOnly: true }
    ];

    function isProtectedAccountEmail(email) {
        return STAFF_EMAILS.map((entry) => entry.toLowerCase()).includes(String(email || "").toLowerCase());
    }

    function buildBanFormHtml(defaultReason = "", submitLabel = "Confirm ban") {
        const options = BAN_DURATIONS
            .filter((option) => !option.adminOnly || hasAdminRole())
            .map((option) => `<option value="${option.value}" ${option.value === "7d" ? "selected" : ""}>${escapeAdminText(option.label)}</option>`)
            .join("");
        return `
            <form class="admin-user-ban-form" novalidate>
                <label>Reason <span class="admin-required">required</span><input type="text" name="reason" maxlength="500" required placeholder="What rule did they break?" value="${escapeAdminText(defaultReason)}"></label>
                <label>Length<select name="duration">${options}</select></label>
                <label class="admin-ban-custom" hidden>Ends<input type="datetime-local" name="until"></label>
                <p class="account-note admin-ban-hint">${hasAdminRole() ? "Temporary bans lift automatically." : `Moderators can ban for up to ${MODERATOR_MAX_BAN_DAYS} days. Bans lift automatically.`}</p>
                <button type="submit" class="delete-btn">${escapeAdminText(submitLabel)}</button>
            </form>
        `;
    }

    // Wires duration toggling and returns { reason, spec } on submit via the callback.
    function bindBanForm(form, onSubmit) {
        if (!form) return;
        const duration = form.elements.namedItem("duration");
        const custom = form.querySelector(".admin-ban-custom");
        const untilInput = form.elements.namedItem("until");
        const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
        untilInput.min = now.toISOString().slice(0, 16);
        if (!hasAdminRole()) untilInput.max = new Date(now.getTime() + MODERATOR_MAX_BAN_DAYS * 86400000).toISOString().slice(0, 16);
        duration.addEventListener("change", () => {
            custom.hidden = duration.value !== "custom";
            untilInput.required = duration.value === "custom";
        });
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const reason = form.elements.namedItem("reason").value.trim();
            if (!reason) {
                form.elements.namedItem("reason").focus();
                showAdminToast("Add a reason for the ban.", { tone: "warning" });
                return;
            }
            const spec = duration.value === "custom" ? { until: untilInput.value } : { duration: duration.value };
            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            try {
                await onSubmit({ reason, spec });
            } finally {
                submitButton.disabled = false;
            }
        });
    }

    // Accepts a legacy date string, { duration }, or { until } and returns an end time in ms (null = permanent).
    function resolveBanEnd(spec) {
        const now = Date.now();
        let untilMs = null;
        if (typeof spec === "string" && spec.trim()) {
            untilMs = new Date(spec.trim()).getTime();
        } else if (spec && typeof spec === "object" && spec.until) {
            untilMs = new Date(spec.until).getTime();
        } else if (spec && typeof spec === "object" && spec.duration && spec.duration !== "permanent") {
            const preset = BAN_DURATIONS.find((option) => option.value === spec.duration && option.ms);
            if (!preset) return { error: "Pick how long the ban lasts." };
            untilMs = now + preset.ms;
        } else if (!hasAdminRole()) {
            return { error: `Moderators can ban for up to ${MODERATOR_MAX_BAN_DAYS} days.` };
        }
        if (untilMs !== null) {
            if (Number.isNaN(untilMs)) return { error: "That end date isn't valid." };
            if (untilMs <= now + 60000) return { error: "The ban must end in the future." };
            if (!hasAdminRole() && untilMs > now + MODERATOR_MAX_BAN_DAYS * 86400000) {
                return { error: `Moderators can ban for up to ${MODERATOR_MAX_BAN_DAYS} days.` };
            }
        }
        return { untilMs };
    }

    function describeBanLength(untilMs) {
        if (!untilMs) return "permanently";
        const days = (untilMs - Date.now()) / 86400000;
        if (days < 1) return `for ${Math.max(1, Math.round(days * 24))}h`;
        return `for ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
    }

    function buildBanEntry(target, reason, untilMs, extraChanges = {}, bulkId = "") {
        const banData = {
            reason: String(reason || "").trim().slice(0, 500) || "No reason provided",
            bannedBy: currentUser.email || "",
            bannedByUid: currentUser.uid,
            createdAt: new Date().toISOString(),
            active: true
        };
        if (untilMs) {
            banData.until = new Date(untilMs).toISOString();
            banData.untilMs = untilMs;
        }
        return {
            action: "ban",
            targetUid: target.uid,
            targetEmail: target.email || "",
            changes: { [`users/${target.uid}/ban`]: banData, ...extraChanges },
            details: { reason: banData.reason, until: banData.until || "", untilMs: banData.untilMs, bulkId }
        };
    }

    function refreshAdminAfterModeration() {
        invalidateUsersSnapshotCache();
        usersListFresh = true;
        const activePanel = document.querySelector(".admin-tab-panel.active")?.getAttribute("data-admin-panel");
        if (activePanel === "users") {
            if (adminDetailUid) void openAdminAccountDetail(adminDetailUid);
            else void loadUsersList(usersSearchInput?.value || "", usersPageIndex);
        }
        if (activePanel === "reviews") void loadAdminReviews();
    }

    async function undoBans(targets) {
        try {
            await commitModerationBatch(targets.map((target) => ({
                action: "unban",
                targetUid: target.uid,
                targetEmail: target.email || "",
                changes: { [`users/${target.uid}/ban`]: null },
                details: { reason: "Undo" }
            })));
            showAdminToast(targets.length === 1 ? "Ban undone." : `${targets.length} bans undone.`);
        } catch (err) {
            console.error("Failed to undo ban:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        }
        refreshAdminAfterModeration();
    }

    async function banTargets(targets, reason, spec, options = {}) {
        if (!isStaff || !currentUser) return false;
        const eligible = targets.filter((target) => target.uid && target.uid !== currentUser.uid && !isProtectedAccountEmail(target.email)
            && (hasAdminRole() || !target.staffRole) && target.staffRole !== "owner");
        if (!eligible.length) {
            showAdminToast("None of those accounts can be banned by you.", { tone: "warning" });
            return false;
        }
        const { untilMs, error } = resolveBanEnd(spec);
        if (error) {
            showAdminToast(error, { tone: "warning" });
            return false;
        }
        if (!(await ensureAdminElevation(eligible.length > 1 ? `ban ${eligible.length} accounts` : "ban this account"))) return false;
        const bulkId = eligible.length > 1 ? `bulk-${Date.now().toString(36)}` : "";
        try {
            await commitModerationBatch(eligible.map((target) => buildBanEntry(target, reason, untilMs, options.extraChanges?.(target) || {}, bulkId)));
        } catch (err) {
            console.error("Failed to ban:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
            return false;
        }
        const skipped = targets.length - eligible.length;
        const label = eligible.length === 1 ? (eligible[0].label || eligible[0].email || "Account") : `${eligible.length} accounts`;
        showAdminToast(`Banned ${label} ${describeBanLength(untilMs)}.${skipped ? ` Skipped ${skipped} protected.` : ""}`, {
            actionLabel: "Undo",
            onAction: () => undoBans(eligible)
        });
        refreshAdminAfterModeration();
        return true;
    }

    async function setUserBan(uid, email, reasonOverride, untilOverride, extraChanges = {}) {
        if (!isStaff || !currentUser) return alert("you don't have permission for that");
        if (!uid) return alert("couldn't find that user");
        const targetEmail = email || (await db.ref(`users/${uid}/email`).once("value")).val() || "";
        let staffRole = "";
        try {
            staffRole = String((await db.ref(`staff/${uid}/role`).once("value")).val() || "");
        } catch (_err) {
            staffRole = "";
        }
        return banTargets([{ uid, email: targetEmail, staffRole }], reasonOverride, untilOverride, { extraChanges: () => extraChanges });
    }

    async function clearUserBan(uid, email, options = {}) {
        if (!isStaff || !currentUser) return alert("you don't have permission for that");
        if (!uid) return alert("couldn't find that user");
        if (!options.skipConfirm && !(await window.showInHouseConfirm(`unban ${email || "this user"}?`, "Unban User"))) return;

        try {
            await commitModerationAction("unban", uid, email, { [`users/${uid}/ban`]: null }, { reason: options.reason || "" });
            if (!options.silent) showAdminToast(`Unbanned ${email || "account"}.`);
        } catch (err) {
            console.error("Failed to unban user:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        }
        refreshAdminAfterModeration();
    }

    function escapeAdminText(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatLogTimestamp(value) {
        if (!value) return "Unknown time";
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return "Unknown time";
        return dt.toLocaleString();
    }

    function renderAccessDeniedEntries(container, entries, type) {
        container.innerHTML = "";
        if (!entries.length) {
            container.innerHTML = '<p class="empty-state">no entries yet</p>';
            return;
        }
        entries.forEach((entry) => {
            const card = document.createElement("div");
            card.className = "security-log-card";
            const appUserEmail = entry.appUser?.email || "unknown";
            const appUserUid = entry.appUser?.uid || "";
            const page = entry.page || "";

            if (type === "access") {
                const reason = entry.reason || "unknown";
                const discordUsername = entry.discord?.username || "";
                const discordGlobalName = entry.discord?.globalName || "";
                const discordId = entry.discord?.id || "";
                const discordStatus = entry.discord?.accessStatus || "";
                const discordTier = entry.discord?.accessTier || "";
                const discordExpiry = entry.discord?.verificationExpiresAt || "";
                const discordLine = discordId
                    ? `@${escapeAdminText(discordUsername)}${discordGlobalName ? " (" + escapeAdminText(discordGlobalName) + ")" : ""} · ID ${escapeAdminText(discordId)}`
                    : "not linked";
                card.innerHTML = `
                    <div class="security-log-head">
                        <strong>${escapeAdminText(appUserEmail)}</strong>
                        <span>${escapeAdminText(formatLogTimestamp(entry.createdAt))}</span>
                    </div>
                    <div class="security-log-body">
                        <p><span>Reason:</span> ${escapeAdminText(reason)}</p>
                        <p><span>Discord:</span> ${discordLine}</p>
                        ${discordStatus ? `<p><span>Discord Status:</span> ${escapeAdminText(discordStatus)}${discordTier ? " · " + escapeAdminText(discordTier) : ""}</p>` : ""}
                        ${discordExpiry ? `<p><span>Expires:</span> ${escapeAdminText(formatLogTimestamp(discordExpiry))}</p>` : ""}
                        ${appUserUid ? `<p><span>UID:</span> ${escapeAdminText(appUserUid)}</p>` : ""}
                        ${page ? `<p><span>Page:</span> ${escapeAdminText(page)}</p>` : ""}
                    </div>
                `;
            } else {
                const discordUsername = entry.discord?.username || "unknown";
                const discordGlobalName = entry.discord?.globalName || "";
                const discordId = entry.discord?.id || "unknown";
                const reason = entry.denialReason || "No reason recorded";
                const roleFlags = [
                    `Sponsor: ${entry.roleCheck?.hasSponsorRole ? "yes" : "no"}`,
                    `Supporter: ${entry.roleCheck?.hasSupporterRole ? "yes" : "no"}`,
                    `Booster: ${entry.roleCheck?.hasBoosterRole ? "yes" : "no"}`
                ].join(" • ");
                card.innerHTML = `
                    <div class="security-log-head">
                        <strong>${escapeAdminText(discordGlobalName || discordUsername)}</strong>
                        <span>${escapeAdminText(formatLogTimestamp(entry.createdAt))}</span>
                    </div>
                    <div class="security-log-body">
                        <p><span>Discord:</span> @${escapeAdminText(discordUsername)} (${escapeAdminText(discordId)})</p>
                        <p><span>App User:</span> ${escapeAdminText(appUserEmail)}</p>
                        <p><span>Reason:</span> ${escapeAdminText(reason)}</p>
                        <p><span>Roles:</span> ${escapeAdminText(roleFlags)}</p>
                    </div>
                `;
            }
            container.appendChild(card);
        });
    }

    async function loadSecurityLogs() {
        if (!isStaff) return;

        const activeTab = getActiveSecuritySubTab();
        const accessRoleDeniedList = document.getElementById("accessRoleDeniedLogsList");
        const accessDeniedList = document.getElementById("accessDeniedLogsList");

        const setLoading = (el) => { if (el) el.innerHTML = '<p class="empty-state">loading…</p>'; };
        const setError = (el) => { if (el) el.innerHTML = '<p class="error-state">couldn\'t load logs</p>'; };

        const fetchEntries = async (path) => {
            try {
                const snap = await db.ref(path).limitToLast(100).once("value");
                const raw = snap.val();
                if (!raw) return [];
                return Object.entries(raw)
                    .map(([id, item]) => ({ id, ...(item || {}) }))
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            } catch (err) {
                console.error(`Failed to load ${path}:`, err);
                return null;
            }
        };

        if (activeTab === "role-denied") {
            setLoading(accessRoleDeniedList);
            const entries = await fetchEntries("securityLogs/regularLinkRoleDenied");
            if (accessRoleDeniedList) {
                if (entries === null) setError(accessRoleDeniedList);
                else renderAccessDeniedEntries(accessRoleDeniedList, entries, "access");
            }
        } else if (activeTab === "other-denied") {
            setLoading(accessDeniedList);
            const entries = await fetchEntries("securityLogs/regularLinkDenied");
            if (accessDeniedList) {
                if (entries === null) setError(accessDeniedList);
                else renderAccessDeniedEntries(accessDeniedList, entries, "access");
            }
        } else if (activeTab === "supporter-denied") {
            setLoading(securityLogsList);
            const entries = await fetchEntries("securityLogs/sponsorDeniedSupporterRole");
            if (securityLogsList) {
                if (entries === null) setError(securityLogsList);
                else renderAccessDeniedEntries(securityLogsList, entries, "supporter");
            }
        }
    }

    let usersPageIndex = 0;
    let usersPageQueryKey = "";
    let usersPageCursors = [null];
    let usersListRequestId = 0;
    let usersListFresh = false;
    const adminSelectedAccounts = new Map();

    function getUsersPageSize() {
        const size = Number(document.getElementById("usersPageSize")?.value || 25);
        return [25, 50, 100].includes(size) ? size : 25;
    }

    function getUsersFilters() {
        const status = document.getElementById("usersStatusFilter")?.value || "all";
        const sort = document.getElementById("usersSort")?.value || "newest";
        return { status, sort };
    }

    function renderUsersPagination(total, pageIndex, hasMore = false) {
        const nav = document.getElementById("usersPagination");
        if (!nav) return;
        nav.hidden = Boolean(adminDetailUid);
        const summary = document.getElementById("usersPageSummary");
        if (summary) summary.textContent = `${total} account${total === 1 ? "" : "s"} in this batch${hasMore ? " · more available" : ""}`;
        const label = document.getElementById("usersPageLabel");
        if (label) label.textContent = `Batch ${pageIndex + 1}`;
        const prev = document.getElementById("usersPagePrev");
        const next = document.getElementById("usersPageNext");
        if (prev) prev.disabled = pageIndex <= 0;
        if (next) next.disabled = !hasMore;
    }

    function getAccountStaffRole(email, staffRecord) {
        if (isProtectedAccountEmail(email)) return "owner";
        if (!staffRecord) return "";
        return STAFF_ROLE_RANK[String(staffRecord.role || "").toLowerCase()] ? String(staffRecord.role).toLowerCase() : "staff";
    }

    function isAccountVerified(user) {
        return user?.emailVerified === true || user?.emailVerifiedManual === true;
    }

    async function fetchAccounts(query, filters, pageIndex, pageSize, options = {}) {
        return callAdminApi("listAccountsPage", {
            query, status: filters.status, sort: filters.sort, pageSize,
            cursor: options.cursor === undefined ? usersPageCursors[pageIndex] : options.cursor,
            exportAll: options.exportAll === true
        });
    }

    function updateUsersBulkBar() {
        const bar = document.getElementById("usersBulkBar");
        const count = adminSelectedAccounts.size;
        if (bar) {
            bar.hidden = count === 0;
            const label = document.getElementById("usersBulkCount");
            if (label) label.textContent = `${count} selected`;
            bar.querySelectorAll("[data-admin-min-role='admin']").forEach((el) => { el.hidden = !hasAdminRole(); });
        }
        const selectAll = document.getElementById("usersSelectAll");
        if (selectAll && usersList) {
            const boxes = Array.from(usersList.querySelectorAll(".admin-select-box"));
            const checked = boxes.filter((box) => box.checked).length;
            selectAll.checked = boxes.length > 0 && checked === boxes.length;
            selectAll.indeterminate = checked > 0 && checked < boxes.length;
        }
    }

    function clearUsersSelection() {
        adminSelectedAccounts.clear();
        usersList?.querySelectorAll(".admin-select-box").forEach((box) => {
            box.checked = false;
            box.closest(".user-card")?.classList.remove("is-selected");
        });
        updateUsersBulkBar();
    }

    function formatAccountCsvRows(rows) {
        return rows.map((row) => {
            const user = row.user || {};
            const ban = user.ban;
            const banned = isBanActive(ban);
            return [
                row.uid, user.username || "", user.email || "", user.createdAt || "", user.lastLogin || "",
                row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : "",
                isAccountVerified(user) ? "yes" : "no",
                banned ? "yes" : "no",
                banned ? (ban.until || "permanent") : "",
                banned ? (ban.reason || "") : "",
                row.staffRole || "",
                user.profile?.discordLink?.id ? `@${user.profile.discordLink.username || user.profile.discordLink.id}` : "",
                row.country || "",
                row.ip || ""
            ];
        });
    }

    const ACCOUNT_CSV_HEADERS = ["uid", "username", "email", "created", "last login", "last seen", "verified", "banned", "ban until", "ban reason", "staff role", "discord", "country", "last ip"];

    async function exportAccountsCsv(selectedOnly = false) {
        if (!hasAdminRole()) return showAdminToast("Only admins can export accounts.", { tone: "warning" });
        const button = document.getElementById(selectedOnly ? "usersBulkExport" : "usersExportCsv");
        if (button) button.disabled = true;
        try {
            let rows;
            if (selectedOnly) {
                rows = Array.from(adminSelectedAccounts.values()).map((item) => item.row).filter(Boolean);
            } else {
                rows = [];
                let cursor = null;
                const query = usersSearchInput?.value || "";
                const filters = getUsersFilters();
                let result;
                do {
                    result = await fetchAccounts(query, filters, 0, 100, { exportAll: true, cursor });
                    rows.push(...result.rows);
                    cursor = result.nextCursor;
                } while (cursor && rows.length < 10000);
                rows = rows.slice(0, 10000);
                if (cursor) showAdminToast("Export limited to the first 10,000 matching accounts.", { tone: "warning" });
            }
            if (!rows.length) return showAdminToast("Nothing to export.", { tone: "warning" });
            downloadCsv(`accounts-${new Date().toISOString().slice(0, 10)}.csv`, ACCOUNT_CSV_HEADERS, formatAccountCsvRows(rows));
            showAdminToast(`Exported ${rows.length.toLocaleString()} account${rows.length === 1 ? "" : "s"}.`);
        } catch (err) {
            console.error("Account export failed:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        } finally {
            if (button) button.disabled = false;
        }
    }

    function getSelectedAccountTargets() {
        return Array.from(adminSelectedAccounts.values()).map((item) => ({
            uid: item.row.uid,
            email: item.row.user?.email || "",
            label: item.row.user?.username ? `@${item.row.user.username}` : (item.row.user?.email || item.row.uid),
            staffRole: item.row.staffRole || "",
            banned: isBanActive(item.row.user?.ban),
            verified: isAccountVerified(item.row.user)
        }));
    }

    async function bulkUnbanSelected() {
        const targets = getSelectedAccountTargets().filter((target) => target.banned);
        if (!targets.length) return showAdminToast("None of the selected accounts are banned.", { tone: "warning" });
        if (!(await window.showInHouseConfirm(`Unban ${targets.length} account${targets.length === 1 ? "" : "s"}?`, "Unban accounts"))) return;
        try {
            const bulkId = `bulk-${Date.now().toString(36)}`;
            await commitModerationBatch(targets.map((target) => ({
                action: "unban", targetUid: target.uid, targetEmail: target.email,
                changes: { [`users/${target.uid}/ban`]: null }, details: { bulkId }
            })));
            showAdminToast(`Unbanned ${targets.length} account${targets.length === 1 ? "" : "s"}.`);
            clearUsersSelection();
        } catch (err) {
            console.error("Bulk unban failed:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        }
        refreshAdminAfterModeration();
    }

    async function bulkVerifySelected() {
        if (!hasAdminRole()) return;
        const targets = getSelectedAccountTargets().filter((target) => !target.verified);
        if (!targets.length) return showAdminToast("The selected accounts are already verified.", { tone: "warning" });
        if (!(await window.showInHouseConfirm(`Mark ${targets.length} account${targets.length === 1 ? "" : "s"} as verified?`, "Verify accounts"))) return;
        if (!(await ensureAdminElevation(`verify ${targets.length} accounts`))) return;
        try {
            const bulkId = `bulk-${Date.now().toString(36)}`;
            await commitModerationBatch(targets.map((target) => ({
                action: "verify", targetUid: target.uid, targetEmail: target.email,
                changes: { [`users/${target.uid}/emailVerifiedManual`]: true }, details: { bulkId }
            })));
            showAdminToast(`Verified ${targets.length} account${targets.length === 1 ? "" : "s"}.`);
            clearUsersSelection();
        } catch (err) {
            console.error("Bulk verify failed:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        }
        refreshAdminAfterModeration();
    }

    function getAdminDeepLink(uid) {
        const url = new URL(window.location.href);
        url.hash = uid ? `admin=accounts/${uid}` : "admin=accounts";
        return url.href;
    }

    async function copyAdminDeepLink(uid, button) {
        const link = getAdminDeepLink(uid);
        try {
            await navigator.clipboard.writeText(link);
            showAdminToast("Link copied. Only staff can open it.");
            if (button) button.textContent = "Link copied";
        } catch (_err) {
            window.prompt("Copy link", link);
        }
    }

    function renderAccountCard(row) {
        const uid = row.uid;
        const userData = row.user || {};
        const userCard = document.createElement("div");
        userCard.className = "user-card";
        userCard.dataset.uid = uid;
        const username = userData.username || userData.email?.split("@")[0] || "Unknown";
        const isVerified = isAccountVerified(userData);
        const discordLink = userData.profile?.discordLink || null;
        const banData = userData.ban || null;
        const isBanCurrentlyActive = isBanActive(banData);
        const banEnd = banData?.untilMs || toTimestamp(banData?.until);
        const isProtected = isProtectedAccountEmail(userData.email);
        const canBan = !isProtected && currentUser?.uid !== uid && row.staffRole !== "owner" && (hasAdminRole() || !row.staffRole);
        const joinedLabel = userData.createdAt && toTimestamp(userData.createdAt) ? new Date(toTimestamp(userData.createdAt)).toLocaleDateString() : "unknown";
        const chips = [
            isBanCurrentlyActive
                ? `<span class="admin-chip is-danger">${banEnd ? `Banned · ends ${escapeAdminText(formatRelativeFuture(banEnd))}` : "Banned"}</span>`
                : "",
            isVerified
                ? `<span class="admin-chip is-ok">${userData.emailVerifiedManual === true && userData.emailVerified !== true ? "Verified (manual)" : "Verified"}</span>`
                : '<span class="admin-chip">Unverified</span>',
            row.staffRole ? `<span class="admin-chip is-accent">${escapeAdminText(row.staffRole)}</span>` : "",
            discordLink?.id ? `<span class="admin-chip"><i class="fa-brands fa-discord" aria-hidden="true"></i> @${escapeAdminText(discordLink.username || discordLink.id)}</span>` : ""
        ].join("");
        const meta = [
            `Joined ${joinedLabel}`,
            row.lastSeenAt ? `Seen ${formatRelativeTime(row.lastSeenAt)}` : "",
            row.country || "",
            row.ip ? row.ip : ""
        ].filter(Boolean).map((part) => escapeAdminText(part)).join(" · ");

        userCard.innerHTML = `
            <label class="admin-select" title="Select account">
                <input type="checkbox" class="admin-select-box" aria-label="Select @${escapeAdminText(username)}">
            </label>
            <img src="${escapeAdminText(sanitizeAdminImageUrl(userData.profile?.profilePicUrl))}" alt="" class="user-card-img clickable-profile-pic" title="view profile" loading="lazy">
            <div class="user-info">
                <strong><button type="button" class="clickable-username admin-link-button" data-card-primary>@${escapeAdminText(username)}</button></strong>
                <small>${escapeAdminText(userData.email || "Unknown")}</small>
                <div class="admin-chip-row">${chips}</div>
                <small class="admin-user-meta">${meta}</small>
            </div>
        `;
        const checkbox = userCard.querySelector(".admin-select-box");
        checkbox.checked = adminSelectedAccounts.has(uid);
        userCard.classList.toggle("is-selected", checkbox.checked);
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) adminSelectedAccounts.set(uid, { row });
            else adminSelectedAccounts.delete(uid);
            userCard.classList.toggle("is-selected", checkbox.checked);
            updateUsersBulkBar();
        });
        userCard.querySelector(".user-card-img").addEventListener("click", () => displayProfileView(uid));
        userCard.querySelector(".clickable-username").addEventListener("click", () => openAdminAccountDetail(uid));

        const actionsToggle = document.createElement("button");
        actionsToggle.type = "button";
        actionsToggle.className = "admin-user-actions-toggle";
        actionsToggle.setAttribute("aria-expanded", "false");
        actionsToggle.setAttribute("aria-label", `Actions for ${username}`);
        const actions = document.createElement("div");
        actions.className = "admin-user-action-list";
        actions.id = `adminUserActions-${uid}`;
        actions.hidden = true;
        actionsToggle.setAttribute("aria-controls", actions.id);
        actionsToggle.innerHTML = '<i class="fa-solid fa-ellipsis" aria-hidden="true"></i> Actions <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';
        actions.innerHTML = `
            <button type="button" data-user-action="details"><i class="fa-solid fa-magnifying-glass-chart" aria-hidden="true"></i> Details${hasAdminRole() ? ", IPs" : ""} &amp; devices</button>
            <button type="button" data-user-action="profile"><i class="fa-solid fa-user" aria-hidden="true"></i> View profile</button>
            <button type="button" data-user-action="link"><i class="fa-solid fa-link" aria-hidden="true"></i> Copy staff link</button>
            ${!isVerified && hasAdminRole() ? '<button type="button" data-user-action="verify"><i class="fa-solid fa-check" aria-hidden="true"></i> Mark verified</button>' : ""}
            ${canBan ? (isBanCurrentlyActive
                ? '<button type="button" data-user-action="unban"><i class="fa-solid fa-unlock" aria-hidden="true"></i> Unban user</button>'
                : `<details class="admin-user-ban">
                    <summary><i class="fa-solid fa-ban" aria-hidden="true"></i> Ban user</summary>
                    ${buildBanFormHtml()}
                </details>`) : ""}
        `;
        const closeActions = () => {
            actions.hidden = true;
            actionsToggle.setAttribute("aria-expanded", "false");
            actions.querySelectorAll("details").forEach((detail) => { detail.open = false; });
        };
        actionsToggle.addEventListener("click", () => {
            const opening = actions.hidden;
            usersList.querySelectorAll('.admin-user-actions-toggle[aria-expanded="true"]').forEach((toggle) => {
                if (toggle !== actionsToggle) toggle.click();
            });
            if (opening) {
                actions.hidden = false;
                actionsToggle.setAttribute("aria-expanded", "true");
            } else {
                closeActions();
            }
        });
        actions.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            closeActions();
            actionsToggle.focus();
        });
        actions.querySelector('[data-user-action="details"]').addEventListener("click", () => openAdminAccountDetail(uid));
        actions.querySelector('[data-user-action="profile"]').addEventListener("click", () => displayProfileView(uid));
        actions.querySelector('[data-user-action="link"]').addEventListener("click", (event) => copyAdminDeepLink(uid, event.currentTarget));
        actions.querySelector('[data-user-action="verify"]')?.addEventListener("click", () => setManualEmailVerified(uid, userData.email || ""));
        actions.querySelector('[data-user-action="unban"]')?.addEventListener("click", () => clearUserBan(uid, userData.email || ""));
        bindBanForm(actions.querySelector("form"), ({ reason, spec }) => banTargets([{
            uid, email: userData.email || "", label: `@${username}`, staffRole: row.staffRole
        }], reason, spec));
        userCard.append(actionsToggle, actions);
        return userCard;
    }

    // Keeps the current page when the same search is reloaded (e.g. after a ban); a new search or filter starts at page 1.
    async function loadUsersList(searchLookup = "", pageIndex = null) {
        if (!isStaff || !usersList) return;
        const requestId = ++usersListRequestId;
        const filters = getUsersFilters();
        const normalizedSearch = normalizeLookupToken(searchLookup);
        const queryKey = `${normalizedSearch}|${filters.status}|${filters.sort}|${getUsersPageSize()}`;
        if (pageIndex !== null) usersPageIndex = pageIndex;
        else if (queryKey !== usersPageQueryKey) usersPageIndex = 0;
        if (queryKey !== usersPageQueryKey || usersListFresh) {
            usersPageCursors = [null];
            usersPageIndex = 0;
            clearUsersSelection();
        }
        usersPageQueryKey = queryKey;
        usersListFresh = false;
        if (!usersList.querySelector(".user-card")) renderAdminSkeleton(usersList, "cards", 6);
        usersList.setAttribute("aria-busy", "true");
        document.querySelectorAll("[data-admin-min-role='admin']").forEach((el) => { el.hidden = !hasAdminRole(); });

        try {
            const pageSize = getUsersPageSize();
            const result = await fetchAccounts(searchLookup, filters, usersPageIndex, pageSize);
            if (requestId !== usersListRequestId) return;
            const total = result.rows.length;
            usersPageCursors[usersPageIndex + 1] = result.nextCursor;
            usersList.removeAttribute("aria-busy");
            usersList.replaceChildren();
            if (!total) {
                if (normalizedSearch || filters.status !== "all") {
                    renderAdminEmpty(usersList, "fa-magnifying-glass", result.hasMore ? "No matches in this batch" : "No accounts match", result.hasMore ? "Select Next to continue searching the directory." : "Try a different search or filter.");
                } else {
                    renderAdminEmpty(usersList, "fa-users", "No accounts yet", "New sign-ups will show up here.");
                }
                renderUsersPagination(0, usersPageIndex, result.hasMore);
                updateUsersBulkBar();
                return;
            }
            renderUsersPagination(total, usersPageIndex, result.hasMore);
            usersList.scrollTop = 0;
            (result.rows || []).forEach((row) => usersList.appendChild(renderAccountCard(row)));
            updateUsersBulkBar();
        } catch (err) {
            if (requestId !== usersListRequestId) return;
            console.error("Failed to load users list:", err);
            usersList.removeAttribute("aria-busy");
            renderAdminEmpty(usersList, "fa-triangle-exclamation", "Couldn't load accounts", getAdminApiErrorMessage(err), "danger");
            document.getElementById("usersPagination")?.setAttribute("hidden", "");
        } finally {
            if (adminDetailUid && requestId === usersListRequestId) void openAdminAccountDetail(adminDetailUid);
        }
    }

    // ---- Admin dashboard: overview, account detail, review queue ----
    const ADMIN_DEFAULT_IMAGE = "image/queens/noimage.jpg";
    const ADMIN_CHART_DAYS = 30;
    let adminDetailUid = null;
    let adminDetailRequestId = 0;
    let latestTelemetryCache = null;

    function sanitizeAdminImageUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return ADMIN_DEFAULT_IMAGE;
        if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
        try {
            const parsed = new URL(raw, window.location.href);
            if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
        } catch (_err) {
            // Fall through to the default image.
        }
        return ADMIN_DEFAULT_IMAGE;
    }

    async function readAdminPath(refOrPath) {
        try {
            const ref = typeof refOrPath === "string" ? db.ref(refOrPath) : refOrPath;
            const snapshot = await ref.once("value");
            return snapshot.val();
        } catch (err) {
            console.warn("Admin read failed:", err?.message || err);
            return undefined;
        }
    }

    async function getLatestTelemetryCached() {
        if (latestTelemetryCache && latestTelemetryCache.expiresAt > Date.now()) return latestTelemetryCache.value;
        const value = (await readAdminPath("ipTelemetry/latest")) || {};
        latestTelemetryCache = { value, expiresAt: Date.now() + 60000 };
        return value;
    }

    function toTimestamp(value) {
        if (typeof value === "number") return value;
        const parsed = new Date(value || 0).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    function utcDayKey(value) {
        const ts = toTimestamp(value);
        return ts ? new Date(ts).toISOString().slice(0, 10) : "";
    }

    function getRecentDayKeys(days) {
        const keys = [];
        const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
        for (let i = days - 1; i >= 0; i -= 1) {
            keys.push(new Date(today - i * 86400000).toISOString().slice(0, 10));
        }
        return keys;
    }

    function formatRelativeTime(value) {
        const ts = toTimestamp(value);
        if (!ts) return "never";
        const diff = Date.now() - ts;
        if (diff < 60000) return "just now";
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 30 * 86400000) return `${Math.floor(diff / 86400000)}d ago`;
        return new Date(ts).toLocaleDateString();
    }

    function formatRelativeFuture(value) {
        const ts = toTimestamp(value);
        if (!ts) return "never";
        const diff = ts - Date.now();
        if (diff <= 60000) return "in a moment";
        if (diff < 3600000) return `in ${Math.ceil(diff / 60000)}m`;
        if (diff < 86400000) return `in ${Math.round(diff / 3600000)}h`;
        if (diff < 30 * 86400000) return `in ${Math.round(diff / 86400000)}d`;
        return new Date(ts).toLocaleDateString();
    }

    function summarizeUserAgent(ua) {
        const value = String(ua || "");
        if (!value) return "Unknown device";
        const browser = /Edg\//.test(value) ? "Edge" : /OPR\//.test(value) ? "Opera" : /Firefox\//.test(value) ? "Firefox"
            : /CriOS|Chrome\//.test(value) ? "Chrome" : /Safari\//.test(value) ? "Safari" : "Browser";
        const os = /iPhone|iPad|iPod/.test(value) ? "iOS" : /Android/.test(value) ? "Android" : /Windows/.test(value) ? "Windows"
            : /Mac OS X|Macintosh/.test(value) ? "macOS" : /CrOS/.test(value) ? "ChromeOS" : /Linux/.test(value) ? "Linux" : "Unknown OS";
        return `${browser} · ${os}`;
    }

    function getAdminUserLabel(users, uid) {
        const data = users?.[uid];
        if (!data) return uid;
        return data.username ? `@${data.username}` : (data.email || uid);
    }

    function setAdminSectionTitle(tabName) {
        const sectionTitle = document.getElementById("adminSectionTitle");
        const button = document.querySelector(`.admin-tab-btn[data-admin-tab="${tabName}"] span`);
        if (sectionTitle && button) sectionTitle.textContent = button.textContent.trim();
    }

    function updateAdminReviewCount(count) {
        const badge = document.getElementById("adminReviewCount");
        if (!badge) return;
        badge.hidden = !count;
        badge.textContent = count > 99 ? "99+" : String(count || "");
        badge.setAttribute("aria-label", `${count} open reviews`);
    }

    function createAdminStatCard(key, label, value, detail, icon, tone = "") {
        const card = document.createElement("article");
        card.className = `admin-stat-card${tone ? ` is-${tone}` : ""}`;
        card.dataset.stat = key;
        card.innerHTML = `
            <span class="admin-stat-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
            <div>
                <p class="admin-stat-label">${escapeAdminText(label)}</p>
                <p class="admin-stat-value">${escapeAdminText(value)}</p>
                <p class="admin-stat-detail">${escapeAdminText(detail || "")}</p>
            </div>
        `;
        return card;
    }

    function setAdminStat(key, value, detail, tone) {
        const card = document.querySelector(`#adminStatGrid [data-stat="${key}"]`);
        if (!card) return;
        const valueEl = card.querySelector(".admin-stat-value");
        const text = typeof value === "number" ? value.toLocaleString() : String(value);
        if (valueEl.textContent !== text) {
            valueEl.textContent = text;
            card.classList.remove("is-updated");
            void card.offsetWidth;
            card.classList.add("is-updated");
        }
        if (detail !== undefined) card.querySelector(".admin-stat-detail").textContent = detail;
        if (tone !== undefined) {
            card.classList.remove("is-warning", "is-danger");
            if (tone) card.classList.add(`is-${tone}`);
        }
    }

    function describeChange(current, previous) {
        if (!previous && !current) return { text: "No change", tone: "" };
        if (!previous) return { text: "New activity", tone: "up" };
        const pct = Math.round(((current - previous) / previous) * 100);
        if (pct === 0) return { text: "No change", tone: "" };
        return { text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs previous`, tone: pct > 0 ? "up" : "down" };
    }

    function createAdminChartCard(title, dayKeys, countsByDay, note = "", previousTotal = null) {
        const values = dayKeys.map((day) => Number(countsByDay[day] || 0));
        const max = Math.max(1, ...values);
        const total = values.reduce((sum, value) => sum + value, 0);
        const change = previousTotal === null ? null : describeChange(total, previousTotal);
        const card = document.createElement("article");
        card.className = "admin-card admin-chart-card";
        const titleId = `adminChart-${Math.random().toString(36).slice(2, 9)}`;
        card.innerHTML = `
            <div class="admin-chart-head">
                <div>
                    <h4 id="${titleId}">${escapeAdminText(title)}</h4>
                    <p class="admin-chart-total">${escapeAdminText(total.toLocaleString())} <small>in ${dayKeys.length} days${note ? ` · ${escapeAdminText(note)}` : ""}</small></p>
                    ${change ? `<p class="admin-chart-change${change.tone ? ` is-${change.tone}` : ""}">${escapeAdminText(change.text)}</p>` : ""}
                </div>
                <div class="admin-chart-toggle" role="group" aria-label="${escapeAdminText(title)} view">
                    <button type="button" data-chart-view="chart" aria-pressed="true">Chart</button>
                    <button type="button" data-chart-view="table" aria-pressed="false">Table</button>
                </div>
            </div>
            <div class="admin-bar-chart${dayKeys.length > 45 ? " is-dense" : ""}" role="img" aria-labelledby="${titleId}"></div>
            <div class="admin-chart-axis"><span>${escapeAdminText(dayKeys[0].slice(5))}</span><span>${escapeAdminText(dayKeys[dayKeys.length - 1].slice(5))}</span></div>
            <div class="admin-chart-table-wrap" hidden>
                <table class="admin-table"><thead><tr><th scope="col">Day (UTC)</th><th scope="col">Count</th></tr></thead><tbody></tbody></table>
            </div>
        `;
        const chart = card.querySelector(".admin-bar-chart");
        const tbody = card.querySelector("tbody");
        dayKeys.forEach((day, index) => {
            const bar = document.createElement("span");
            bar.className = "admin-bar";
            bar.style.setProperty("--bar", `${Math.round((values[index] / max) * 100)}%`);
            bar.title = `${day}: ${values[index]}`;
            chart.appendChild(bar);
        });
        dayKeys.slice().reverse().forEach((day) => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${escapeAdminText(day)}</td><td>${escapeAdminText(Number(countsByDay[day] || 0))}</td>`;
            tbody.appendChild(row);
        });
        card.querySelectorAll("[data-chart-view]").forEach((button) => {
            button.addEventListener("click", () => {
                const showTable = button.getAttribute("data-chart-view") === "table";
                card.querySelectorAll("[data-chart-view]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
                chart.hidden = showTable;
                card.querySelector(".admin-chart-axis").hidden = showTable;
                card.querySelector(".admin-chart-table-wrap").hidden = !showTable;
            });
        });
        return card;
    }

    function countByDay(items, getValue) {
        const counts = {};
        items.forEach((item) => {
            const day = utcDayKey(getValue(item));
            if (day) counts[day] = (counts[day] || 0) + 1;
        });
        return counts;
    }

    function sumDays(counts, keys) {
        return keys.reduce((sum, day) => sum + Number(counts[day] || 0), 0);
    }

    const adminLiveListeners = [];
    function stopAdminLiveListeners() {
        while (adminLiveListeners.length) {
            const { ref, handler } = adminLiveListeners.pop();
            ref.off("value", handler);
        }
    }

    function listenAdminValue(ref, onValue) {
        const handler = (snapshot) => onValue(snapshot.val());
        ref.on("value", handler, (err) => console.warn("Admin live listener stopped:", err?.message || err));
        adminLiveListeners.push({ ref, handler });
    }

    function startOverviewLiveListeners() {
        stopAdminLiveListeners();
        const today = getRecentDayKeys(1)[0];
        listenAdminValue(db.ref("security/reviewQueue/banEvasion").orderByChild("status").equalTo("open"), (value) => {
            const open = Object.keys(value || {}).length;
            updateAdminReviewCount(open);
            setAdminStat("reviews", open, undefined, open ? "warning" : "");
        });
        listenAdminValue(db.ref(`telemetry/daily/${today}/active`), (value) => {
            setAdminStat("active", Object.keys(value || {}).length);
        });
        listenAdminValue(db.ref(`telemetry/daily/${today}/sessions`), (value) => {
            setAdminStat("sessions", Number(value) || 0);
        });
        listenAdminValue(db.ref("adminStats/totals"), (totals) => {
            if (!totals?.reconciledAt) return;
            setAdminStat("accounts", Number(totals.accounts) || 0, `${Number(totals.newThisWeek) || 0} new this week`);
            setAdminStat("banned", Number(totals.banned) || 0);
        });
    }

    async function readUserLabels(uids) {
        const labels = {};
        await Promise.all(uids.map(async (uid) => {
            const [username, email] = await Promise.all([readAdminPath(`users/${uid}/username`), readAdminPath(`users/${uid}/email`)]);
            labels[uid] = username ? `@${username}` : (email || uid);
        }));
        return labels;
    }

    let adminOverviewLoading = false;
    async function loadAdminOverview() {
        const statGrid = document.getElementById("adminStatGrid");
        const chartGrid = document.getElementById("adminChartGrid");
        const updated = document.getElementById("adminOverviewUpdated");
        const refresh = document.getElementById("adminOverviewRefresh");
        if (!isStaff || !statGrid || !chartGrid || adminOverviewLoading) return;
        adminOverviewLoading = true;
        if (refresh) refresh.disabled = true;
        if (updated) updated.textContent = "Loading dashboard...";
        if (!statGrid.childElementCount) renderAdminSkeleton(statGrid, "stats", 8);
        if (!chartGrid.querySelector(".admin-chart-card")) renderAdminSkeleton(chartGrid, "chart", 4);
        const recentList = document.getElementById("adminRecentSessions");
        const countriesList = document.getElementById("adminTopCountries");
        if (recentList && !recentList.childElementCount) renderAdminSkeleton(recentList, "rows", 5);
        if (countriesList && !countriesList.childElementCount) renderAdminSkeleton(countriesList, "rows", 5);

        const rangeDays = [7, 30, 90].includes(Number(document.getElementById("adminOverviewRange")?.value)) ? Number(document.getElementById("adminOverviewRange").value) : 30;
        const rangeLabel = document.getElementById("adminTopCountriesRange");
        if (rangeLabel) rangeLabel.textContent = `(${rangeDays} days)`;
        const allKeys = getRecentDayKeys(rangeDays * 2);
        const previousKeys = allKeys.slice(0, rangeDays);
        const dayKeys = allKeys.slice(rangeDays);
        const cutoff = Date.parse(`${allKeys[0]}T00:00:00Z`);
        const isAdmin = hasAdminRole();
        try {
            const [stats, staff, reviews, daily, modLogs, roleDenied, otherDenied, supporterDenied, latestSessions] = await Promise.all([
                readAdminPath("adminStats"),
                readAdminPath("staff"),
                readAdminPath("security/reviewQueue/banEvasion"),
                readAdminPath(db.ref("telemetry/daily").orderByKey().startAt(allKeys[0])),
                readAdminPath(db.ref("moderationLogs").orderByChild("createdAt").startAt(cutoff)),
                readAdminPath(db.ref("securityLogs/regularLinkRoleDenied").limitToLast(1000)),
                readAdminPath(db.ref("securityLogs/regularLinkDenied").limitToLast(1000)),
                readAdminPath(db.ref("securityLogs/sponsorDeniedSupporterRole").limitToLast(1000)),
                isAdmin ? readAdminPath(db.ref("ipTelemetry/latest").orderByChild("at").limitToLast(8)) : Promise.resolve(undefined)
            ]);

            const serverTotals = stats?.totals?.reconciledAt ? stats.totals : null;
            const users = serverTotals ? null : await getUsersSnapshotCached().catch(() => null);
            const userList = Object.values(users || {}).filter((u) => u && typeof u === "object");
            const weekAgo = Date.now() - 7 * 86400000;
            const totals = serverTotals || {
                accounts: userList.length,
                newThisWeek: userList.filter((u) => toTimestamp(u.createdAt) >= weekAgo).length,
                banned: userList.filter((u) => isBanActive(u.ban)).length,
                verified: userList.filter(isAccountVerified).length,
                discordLinked: userList.filter((u) => u.profile?.discordLink?.id).length
            };
            const reviewList = Object.values(reviews || {});
            const openReviews = reviewList.filter((item) => item?.status === "open").length;
            const dailyData = daily || {};
            const telemetryReady = daily !== undefined && daily !== null;
            const todayKey = dayKeys[dayKeys.length - 1];
            const activeWeek = new Set(dayKeys.slice(-7).flatMap((day) => Object.keys(dailyData[day]?.active || {}))).size;

            updateAdminReviewCount(openReviews);
            statGrid.replaceChildren(
                createAdminStatCard("accounts", "Accounts", Number(totals.accounts || 0).toLocaleString(), `${Number(totals.newThisWeek) || 0} new this week`, "fa-users"),
                createAdminStatCard("active", "Active today", telemetryReady ? Object.keys(dailyData[todayKey]?.active || {}).length.toLocaleString() : "—", telemetryReady ? `${activeWeek} in the last 7 days` : "Waiting for server telemetry", "fa-signal"),
                createAdminStatCard("sessions", "Sign-ins today", telemetryReady ? Number(dailyData[todayKey]?.sessions || 0).toLocaleString() : "—", "Server-recorded sessions", "fa-right-to-bracket"),
                createAdminStatCard("banned", "Banned", Number(totals.banned || 0).toLocaleString(), "Active bans", "fa-ban", "danger"),
                createAdminStatCard("reviews", "Open reviews", openReviews.toLocaleString(), `${reviewList.length} total flagged`, "fa-user-secret", openReviews ? "warning" : ""),
                createAdminStatCard("verified", "Verified", Number(totals.verified || 0).toLocaleString(), "Email or manual", "fa-circle-check"),
                createAdminStatCard("discord", "Discord linked", Number(totals.discordLinked || 0).toLocaleString(), "Linked profiles", "fa-brands fa-discord"),
                createAdminStatCard("staff", "Staff", Object.keys(staff || {}).length.toLocaleString(), "Owners, admins and staff", "fa-user-shield")
            );

            const signups = serverTotals ? (stats.signups || {}) : countByDay(userList, (u) => u.createdAt);
            const activeByDay = Object.fromEntries(allKeys.map((day) => [day, Object.keys(dailyData[day]?.active || {}).length]));
            const sessionsByDay = Object.fromEntries(allKeys.map((day) => [day, Number(dailyData[day]?.sessions || 0)]));
            const modByDay = countByDay(Object.values(modLogs || {}), (log) => log?.createdAt);
            const deniedByDay = countByDay([roleDenied, otherDenied, supporterDenied].flatMap((node) => Object.values(node || {})), (log) => log?.createdAt);
            const pendingNote = telemetryReady ? "" : "server telemetry pending";
            chartGrid.replaceChildren(
                createAdminChartCard("New accounts", dayKeys, signups, "", sumDays(signups, previousKeys)),
                createAdminChartCard("Active accounts", dayKeys, activeByDay, pendingNote, sumDays(activeByDay, previousKeys)),
                createAdminChartCard("Sign-ins", dayKeys, sessionsByDay, pendingNote, sumDays(sessionsByDay, previousKeys)),
                createAdminChartCard("Moderation actions", dayKeys, modByDay, "", sumDays(modByDay, previousKeys)),
                createAdminChartCard("Access denials", dayKeys, deniedByDay, "latest 1,000 per log", sumDays(deniedByDay, previousKeys))
            );

            if (recentList) {
                recentList.replaceChildren();
                if (!isAdmin) {
                    renderAdminEmpty(recentList, "fa-lock", "Admins only", "Sign-in IPs are limited to admins and owners.");
                } else {
                    const recent = Object.entries(latestSessions || {}).sort(([, a], [, b]) => toTimestamp(b?.at) - toTimestamp(a?.at));
                    if (!recent.length) renderAdminEmpty(recentList, "fa-right-to-bracket", "No sign-ins yet", "Server sign-ins appear here once accounts sign in.");
                    const labels = users ? Object.fromEntries(recent.map(([uid]) => [uid, getAdminUserLabel(users, uid)])) : await readUserLabels(recent.map(([uid]) => uid));
                    recent.forEach(([uid, info]) => {
                        const row = document.createElement("button");
                        row.type = "button";
                        row.className = "admin-mini-row";
                        row.innerHTML = `
                            <span><strong>${escapeAdminText(labels[uid] || uid)}</strong><small>${escapeAdminText(info?.ip || "IP expired")}${info?.country ? ` · ${escapeAdminText(info.country)}` : ""}</small></span>
                            <time>${escapeAdminText(formatRelativeTime(info?.at))}</time>
                        `;
                        row.addEventListener("click", () => openAdminAccountFromAnywhere(uid));
                        recentList.appendChild(row);
                    });
                }
            }

            if (countriesList) {
                const countryTotals = {};
                dayKeys.forEach((day) => {
                    Object.entries(dailyData[day]?.countries || {}).forEach(([code, count]) => {
                        countryTotals[code] = (countryTotals[code] || 0) + Number(count || 0);
                    });
                });
                const top = Object.entries(countryTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);
                const maxCount = Math.max(1, ...top.map(([, count]) => count));
                countriesList.replaceChildren();
                if (!top.length) renderAdminEmpty(countriesList, "fa-earth-americas", "No location data yet", "Countries appear after server sign-ins.");
                top.forEach(([code, count]) => {
                    const row = document.createElement("div");
                    row.className = "admin-mini-row admin-country-row";
                    row.innerHTML = `<span><strong>${escapeAdminText(code)}</strong></span><span class="admin-meter" aria-hidden="true"><span></span></span><span>${escapeAdminText(count.toLocaleString())}</span>`;
                    row.querySelector(".admin-meter span").style.width = `${Math.round((count / maxCount) * 100)}%`;
                    countriesList.appendChild(row);
                });
            }

            if (updated) {
                updated.innerHTML = `<span class="admin-live-dot" aria-hidden="true"></span> Live · loaded ${escapeAdminText(new Date().toLocaleTimeString())} · UTC days${serverTotals ? "" : " · totals counted in browser"}`;
            }
            if (document.querySelector('.admin-tab-panel.active')?.getAttribute("data-admin-panel") === "overview") startOverviewLiveListeners();
        } catch (err) {
            console.error("Failed to load admin overview:", err);
            if (updated) updated.textContent = "Could not load the dashboard. Try Refresh.";
        } finally {
            adminOverviewLoading = false;
            if (refresh) refresh.disabled = false;
        }
    }

    function openAdminAccountFromAnywhere(uid) {
        adminDetailUid = uid;
        switchAdminTab("users");
    }

    function closeAdminAccountDetail() {
        adminDetailUid = null;
        adminDetailRequestId += 1;
        const detail = document.getElementById("adminAccountDetail");
        if (detail) {
            detail.hidden = true;
            detail.replaceChildren();
        }
        if (usersList) usersList.hidden = false;
        const pagination = document.getElementById("usersPagination");
        if (pagination) pagination.hidden = !usersList?.querySelector(".user-card");
        document.querySelectorAll("#adminPanelUsers .admin-users-search, #adminPanelUsers .admin-filter-row").forEach((el) => el.removeAttribute("hidden"));
        updateUsersBulkBar();
        syncAdminHash();
    }

    function sanitizeSignalKey(value) {
        return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    }

    async function collectLinkedAccounts(uid, userData, userHashes, users) {
        const linked = new Map();
        const add = (otherUid, reason) => {
            if (!otherUid || otherUid === uid) return;
            if (!linked.has(otherUid)) linked.set(otherUid, new Set());
            linked.get(otherUid).add(reason);
        };

        const hashes = Object.entries(userHashes || {}).slice(0, 25);
        const subnetHashes = Array.from(new Set(hashes.map(([, info]) => info?.subnetHash).filter(Boolean))).slice(0, 10);
        const tracking = userData?.security?.tracking || {};
        const sessions = Object.values(userData?.security?.sessions || {});
        const installIds = new Set([tracking.installId, ...sessions.map((s) => s?.installId)].map(sanitizeSignalKey).filter((v) => v.length >= 6));
        const fingerprints = new Set([tracking.browserFingerprint, ...sessions.map((s) => s?.browserFingerprint)].map(sanitizeSignalKey).filter((v) => v.length >= 6));

        const [hashResults, subnetResults, installResults, fingerprintResults] = await Promise.all([
            Promise.all(hashes.map(([hash]) => readAdminPath(`ipTelemetry/hashes/${hash}`))),
            Promise.all(subnetHashes.map((hash) => readAdminPath(`ipTelemetry/subnets/${hash}`))),
            Promise.all(Array.from(installIds).slice(0, 10).map((id) => readAdminPath(`security/deviceSignals/installId/${id}`))),
            Promise.all(Array.from(fingerprints).slice(0, 10).map((id) => readAdminPath(`security/deviceSignals/browserFingerprint/${id}`)))
        ]);
        hashResults.forEach((node) => Object.keys(node || {}).forEach((other) => add(other, "Same IP")));
        subnetResults.forEach((node) => Object.keys(node || {}).forEach((other) => add(other, "Same network")));
        installResults.forEach((node) => Object.keys(node || {}).forEach((other) => add(other, "Same browser install")));
        fingerprintResults.forEach((node) => Object.keys(node || {}).forEach((other) => add(other, "Same device fingerprint")));

        // Also match client-side tracking so links show before server telemetry exists.
        Object.entries(users || {}).forEach(([otherUid, other]) => {
            const otherTracking = other?.security?.tracking;
            if (!otherTracking || otherUid === uid) return;
            if (installIds.has(sanitizeSignalKey(otherTracking.installId))) add(otherUid, "Same browser install");
            if (fingerprints.has(sanitizeSignalKey(otherTracking.browserFingerprint))) add(otherUid, "Same device fingerprint");
        });

        const strength = (reasons) => (reasons.has("Same browser install") ? 3 : 0) + (reasons.has("Same IP") ? 2 : 0)
            + (reasons.has("Same device fingerprint") ? 1 : 0);
        return Array.from(linked.entries())
            .map(([otherUid, reasons]) => ({ uid: otherUid, reasons, data: users?.[otherUid] || null }))
            .sort((a, b) => strength(b.reasons) - strength(a.reasons));
    }

    function buildAdminTable(headers, rows, emptyText) {
        if (!rows.length) return `<p class="empty-state">${escapeAdminText(emptyText)}</p>`;
        return `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr>${headers.map((h) => `<th scope="col">${escapeAdminText(h)}</th>`).join("")}</tr></thead>
                    <tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
                </table>
            </div>
        `;
    }

    const MODERATION_LABELS = {
        ban: "User banned", unban: "User unbanned", verify: "Email verified",
        "staff-add": "Staff added", "staff-remove": "Staff removed", "staff-role": "Staff role changed",
        "review-dismiss": "Evasion review dismissed", "review-action": "Evasion review actioned",
        "note-add": "Staff note added", "note-delete": "Staff note deleted",
        "ban-expire": "Ban expired", config: "Alert settings changed"
    };

    function renderStaffNotes(container, uid, email, notes) {
        const list = Object.entries(notes || {}).sort(([, a], [, b]) => toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt));
        container.innerHTML = `
            <form class="admin-note-form">
                <label class="sr-only" for="adminNoteText-${escapeAdminText(uid)}">New staff note</label>
                <textarea id="adminNoteText-${escapeAdminText(uid)}" name="text" maxlength="1000" rows="2" placeholder="Add context for other staff. The user never sees this." required></textarea>
                <button type="submit"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add note</button>
            </form>
            <ul class="admin-note-list"></ul>
        `;
        const ul = container.querySelector(".admin-note-list");
        if (!list.length) {
            ul.innerHTML = '<li class="empty-state">No notes yet.</li>';
        }
        list.forEach(([noteId, note]) => {
            const li = document.createElement("li");
            li.className = "admin-note";
            const canDelete = note?.byUid === currentUser?.uid || hasAdminRole();
            li.innerHTML = `
                <p>${escapeAdminText(note?.text || "")}</p>
                <footer>
                    <span>${escapeAdminText(note?.byEmail || "staff")} · <time title="${escapeAdminText(formatLogTimestamp(note?.createdAt))}">${escapeAdminText(formatRelativeTime(note?.createdAt))}</time></span>
                    ${canDelete ? '<button type="button" class="admin-link-button" data-note-delete>Delete</button>' : ""}
                </footer>
            `;
            li.querySelector("[data-note-delete]")?.addEventListener("click", async () => {
                if (!(await window.showInHouseConfirm("Delete this staff note?", "Delete note"))) return;
                try {
                    await commitModerationAction("note-delete", uid, email, { [`staffNotes/${uid}/${noteId}`]: null });
                    li.remove();
                    showAdminToast("Note deleted.");
                } catch (err) {
                    console.error("Failed to delete note:", err);
                    showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
                }
            });
            ul.appendChild(li);
        });
        container.querySelector(".admin-note-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const text = form.elements.namedItem("text").value.trim();
            if (!text) return;
            const button = form.querySelector("button");
            button.disabled = true;
            try {
                const noteId = db.ref(`staffNotes/${uid}`).push().key;
                await commitModerationAction("note-add", uid, email, {
                    [`staffNotes/${uid}/${noteId}`]: {
                        text: text.slice(0, 1000),
                        byUid: currentUser.uid,
                        byEmail: currentUser.email || "",
                        createdAt: firebase.database.ServerValue.TIMESTAMP
                    }
                });
                showAdminToast("Note added.");
                renderStaffNotes(container, uid, email, await readAdminPath(`staffNotes/${uid}`));
            } catch (err) {
                console.error("Failed to add note:", err);
                showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
                button.disabled = false;
            }
        });
    }

    async function openAdminAccountDetail(uid) {
        const detail = document.getElementById("adminAccountDetail");
        if (!isStaff || !uid || !detail) return;
        const isSameAccount = adminDetailUid === uid && detail.childElementCount > 0;
        adminDetailUid = uid;
        const requestId = ++adminDetailRequestId;
        if (usersList) usersList.hidden = true;
        document.getElementById("usersPagination")?.setAttribute("hidden", "");
        document.getElementById("usersBulkBar")?.setAttribute("hidden", "");
        document.querySelectorAll("#adminPanelUsers .admin-users-search, #adminPanelUsers .admin-filter-row").forEach((el) => el.setAttribute("hidden", ""));
        detail.hidden = false;
        if (!isSameAccount) renderAdminSkeleton(detail, "rows", 6);
        syncAdminHash();

        const isAdmin = hasAdminRole();
        const [userData, events, latest, userHashes, staffRecord, history, review, notes, users] = await Promise.all([
            readAdminPath(`users/${uid}`),
            isAdmin ? readAdminPath(db.ref(`ipTelemetry/events/${uid}`).orderByChild("at").limitToLast(50)) : Promise.resolve(null),
            isAdmin ? readAdminPath(`ipTelemetry/latest/${uid}`) : Promise.resolve(null),
            readAdminPath(`ipTelemetry/userHashes/${uid}`),
            readAdminPath(`staff/${uid}`),
            readAdminPath(db.ref("moderationLogs").orderByChild("targetUid").equalTo(uid)),
            readAdminPath(`security/reviewQueue/banEvasion/${uid}`),
            readAdminPath(`staffNotes/${uid}`),
            getUsersSnapshotCached().catch(() => null)
        ]);
        if (requestId !== adminDetailRequestId) return;
        if (!userData) {
            detail.innerHTML = '<button type="button" class="admin-back-btn"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All accounts</button>';
            const empty = document.createElement("div");
            renderAdminEmpty(empty, "fa-user-slash", "Account not found", "It may have been deleted, or it couldn't be loaded.", "danger");
            detail.append(...empty.childNodes);
            detail.querySelector(".admin-back-btn").addEventListener("click", closeAdminAccountDetail);
            return;
        }

        const linked = await collectLinkedAccounts(uid, userData, userHashes, users);
        if (requestId !== adminDetailRequestId) return;

        const email = userData.email || "";
        const username = userData.username || email.split("@")[0] || "Unknown";
        const ban = userData.ban || null;
        const banned = isBanActive(ban);
        const banEnd = ban?.untilMs || toTimestamp(ban?.until);
        const verified = isAccountVerified(userData);
        const discord = userData.profile?.discordLink || null;
        const tracking = userData.security?.tracking || {};
        const staffRole = getAccountStaffRole(email, staffRecord);
        const canBan = !isProtectedAccountEmail(email) && currentUser?.uid !== uid && staffRole !== "owner" && (isAdmin || !staffRole);
        const eventList = Object.values(events || {}).sort((a, b) => toTimestamp(b?.at) - toTimestamp(a?.at));
        const distinctIps = new Set(eventList.map((e) => e?.ipHash).filter(Boolean));
        Object.keys(userHashes || {}).forEach((hash) => distinctIps.add(hash));
        const sessions = Object.values(userData.security?.sessions || {}).sort((a, b) => toTimestamp(b?.at) - toTimestamp(a?.at));
        const devices = new Set(sessions.map((s) => s?.installId).filter(Boolean));
        if (tracking.installId) devices.add(tracking.installId);
        const historyList = Object.values(history || {}).sort((a, b) => toTimestamp(b?.createdAt) - toTimestamp(a?.createdAt));
        const location = latest?.country || eventList[0]?.country || "";
        const badges = [
            banned ? '<span class="admin-chip is-danger">Banned</span>' : '<span class="admin-chip is-ok">Active</span>',
            verified ? '<span class="admin-chip is-ok">Verified</span>' : '<span class="admin-chip">Unverified</span>',
            staffRole ? `<span class="admin-chip is-accent">${escapeAdminText(staffRole)}</span>` : "",
            discord?.id ? `<span class="admin-chip"><i class="fa-brands fa-discord" aria-hidden="true"></i> @${escapeAdminText(discord.username || discord.id)}</span>` : "",
            review?.status === "open" ? '<span class="admin-chip is-warning">Evasion review open</span>' : ""
        ].join("");
        const fact = (label, value) => `<div class="admin-fact"><dt>${escapeAdminText(label)}</dt><dd>${escapeAdminText(value || "—")}</dd></div>`;
        const lastSeen = latest?.lastSeenAt || tracking.lastSeenAt;

        detail.innerHTML = `
            <button type="button" class="admin-back-btn"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> All accounts <kbd>Esc</kbd></button>
            <header class="admin-detail-head">
                <img src="${escapeAdminText(sanitizeAdminImageUrl(userData.profile?.profilePicUrl))}" alt="" class="admin-detail-avatar">
                <div>
                    <h3>@${escapeAdminText(username)}</h3>
                    <p>${escapeAdminText(email || "No email")}</p>
                    <div class="admin-chip-row">${badges}</div>
                </div>
            </header>
            <div class="admin-uid-row">
                <code>${escapeAdminText(uid)}</code>
                <button type="button" data-detail-action="copy-uid"><i class="fa-regular fa-copy" aria-hidden="true"></i> Copy UID</button>
                <button type="button" data-detail-action="copy-link"><i class="fa-solid fa-link" aria-hidden="true"></i> Copy staff link</button>
                <button type="button" data-detail-action="profile"><i class="fa-solid fa-user" aria-hidden="true"></i> View profile</button>
                ${!verified && isAdmin ? '<button type="button" data-detail-action="verify"><i class="fa-solid fa-check" aria-hidden="true"></i> Mark verified</button>' : ""}
                ${canBan && banned ? '<button type="button" data-detail-action="unban"><i class="fa-solid fa-unlock" aria-hidden="true"></i> Unban</button>' : ""}
            </div>
            ${banned ? `<p class="admin-alert is-danger"><b>Banned</b> by ${escapeAdminText(ban.bannedBy || "staff")}: ${escapeAdminText(ban.reason || "No reason")} · ${banEnd ? `ends ${escapeAdminText(formatLogTimestamp(banEnd))} (${escapeAdminText(formatRelativeFuture(banEnd))})` : "permanent"}</p>` : ""}
            <dl class="admin-fact-grid">
                ${fact("Joined", userData.createdAt ? formatLogTimestamp(userData.createdAt) : "")}
                ${fact("Last login", userData.lastLogin ? formatLogTimestamp(userData.lastLogin) : "")}
                ${fact("Last seen", lastSeen ? formatRelativeTime(lastSeen) : "")}
                ${isAdmin ? fact("Last IP", latest?.ip || "") : ""}
                ${isAdmin ? fact("Country", location) : ""}
                ${fact("Distinct IPs", distinctIps.size ? String(distinctIps.size) : "")}
                ${fact("Devices", devices.size ? String(devices.size) : "")}
                ${fact("Linked accounts", String(linked.length))}
            </dl>
            ${canBan && !banned ? `
            <details class="admin-card admin-detail-ban">
                <summary><i class="fa-solid fa-ban" aria-hidden="true"></i> Ban this account</summary>
                ${buildBanFormHtml(review?.status === "open" ? "Ban evasion" : "")}
            </details>` : ""}
            <section class="admin-card">
                <h4>Staff notes <small>${escapeAdminText(Object.keys(notes || {}).length)}</small></h4>
                <div class="admin-notes"></div>
            </section>
            <section class="admin-card">
                <h4>Linked accounts <small>${escapeAdminText(linked.length)}</small></h4>
                <p class="admin-card-note">Shared networks can be schools, homes or mobile carriers. A shared browser install is the strongest signal.</p>
                <div class="admin-linked-list"></div>
            </section>
            <section class="admin-card">
                <h4>IP history ${isAdmin ? `<small>last ${escapeAdminText(eventList.length)} sign-ins</small>` : ""}</h4>
                ${isAdmin ? buildAdminTable(["When", "IP address", "Location", "Device", "Source"], eventList.map((e) => [
                    `<time title="${escapeAdminText(formatLogTimestamp(e.at))}">${escapeAdminText(formatRelativeTime(e.at))}</time>`,
                    `<code>${escapeAdminText(e.ip || "expired")}</code>`,
                    escapeAdminText([e.city, e.region, e.country].filter(Boolean).join(", ") || "—"),
                    escapeAdminText(summarizeUserAgent(e.userAgent)),
                    escapeAdminText([e.source, e.page].filter(Boolean).join(" · ") || "—")
                ]), "No server sign-ins recorded yet. IPs appear after the account signs in again.")
                : '<p class="empty-state"><i class="fa-solid fa-lock" aria-hidden="true"></i> Raw IP addresses are limited to admins. Linked accounts above still use them.</p>'}
            </section>
            <section class="admin-card">
                <h4>Devices &amp; sessions <small>${escapeAdminText(sessions.length)}</small></h4>
                ${buildAdminTable(["When", "Browser", "Platform", "Screen", "Install ID", "Fingerprint"], sessions.map((s) => [
                    `<time title="${escapeAdminText(formatLogTimestamp(s.at))}">${escapeAdminText(formatRelativeTime(s.at))}</time>`,
                    escapeAdminText(s.browser || "—"),
                    escapeAdminText(s.platform || "—"),
                    escapeAdminText(s.viewport || "—"),
                    `<code>${escapeAdminText(String(s.installId || "—").slice(0, 12))}</code>`,
                    `<code>${escapeAdminText(s.browserFingerprint || "—")}</code>`
                ]), "No device sessions recorded.")}
                ${tracking.userAgent ? `<p class="admin-card-note">Latest user agent: <code>${escapeAdminText(tracking.userAgent)}</code></p>` : ""}
            </section>
            <section class="admin-card">
                <h4>Moderation history <small>${escapeAdminText(historyList.length)}</small></h4>
                <div class="admin-history-list">${historyList.length ? historyList.map((entry) => `
                    <p><b>${escapeAdminText(MODERATION_LABELS[entry.action] || entry.action)}</b> by ${escapeAdminText(entry.actorEmail || entry.actorUid)} · ${escapeAdminText(formatLogTimestamp(entry.createdAt))}${entry.reason ? ` — ${escapeAdminText(entry.reason)}` : ""}</p>
                `).join("") : '<p class="empty-state">No moderation actions on this account.</p>'}</div>
            </section>
        `;

        renderStaffNotes(detail.querySelector(".admin-notes"), uid, email, notes);
        const linkedList = detail.querySelector(".admin-linked-list");
        if (!linked.length) {
            linkedList.innerHTML = '<p class="empty-state">No other accounts share an IP, network or device.</p>';
        }
        linked.slice(0, 50).forEach((item) => {
            const otherBanned = isBanActive(item.data?.ban);
            const row = document.createElement("button");
            row.type = "button";
            row.className = `admin-linked-row${otherBanned ? " is-banned" : ""}`;
            row.innerHTML = `
                <span><strong>${escapeAdminText(getAdminUserLabel(users, item.uid))}</strong><small>${escapeAdminText(item.data?.email || item.uid)}</small></span>
                <span class="admin-chip-row">${otherBanned ? '<span class="admin-chip is-danger">Banned</span>' : ""}${Array.from(item.reasons).map((reason) => `<span class="admin-chip">${escapeAdminText(reason)}</span>`).join("")}</span>
            `;
            row.addEventListener("click", () => {
                detail.replaceChildren();
                void openAdminAccountDetail(item.uid);
                detail.scrollIntoView({ block: "start", behavior: "smooth" });
            });
            linkedList.appendChild(row);
        });

        detail.querySelector(".admin-back-btn").addEventListener("click", closeAdminAccountDetail);
        detail.querySelector('[data-detail-action="copy-uid"]').addEventListener("click", async (event) => {
            const button = event.currentTarget;
            try {
                await navigator.clipboard.writeText(uid);
                button.textContent = "Copied";
            } catch (_err) {
                window.prompt("Copy UID", uid);
            }
        });
        detail.querySelector('[data-detail-action="copy-link"]').addEventListener("click", (event) => copyAdminDeepLink(uid, event.currentTarget));
        detail.querySelector('[data-detail-action="profile"]').addEventListener("click", () => displayProfileView(uid));
        detail.querySelector('[data-detail-action="verify"]')?.addEventListener("click", () => setManualEmailVerified(uid, email));
        detail.querySelector('[data-detail-action="unban"]')?.addEventListener("click", () => clearUserBan(uid, email));
        bindBanForm(detail.querySelector(".admin-detail-ban form"), ({ reason, spec }) => banTargets([{
            uid, email, label: `@${username}`, staffRole
        }], reason, spec, {
            extraChanges: () => (review?.status === "open" ? reviewResolutionChanges(uid, "actioned") : {})
        }));
    }

    function reviewResolutionChanges(uid, status) {
        return {
            [`security/reviewQueue/banEvasion/${uid}/status`]: status,
            [`security/reviewQueue/banEvasion/${uid}/resolvedBy`]: currentUser?.email || "",
            [`security/reviewQueue/banEvasion/${uid}/resolvedAt`]: firebase.database.ServerValue.TIMESTAMP
        };
    }

    const adminSelectedReviews = new Map();

    function updateReviewsBulkBar() {
        const bar = document.getElementById("reviewsBulkBar");
        if (bar) {
            bar.hidden = adminSelectedReviews.size === 0;
            const count = document.getElementById("reviewsBulkCount");
            if (count) count.textContent = `${adminSelectedReviews.size} selected`;
        }
        const selectAll = document.getElementById("reviewsSelectAll");
        const list = document.getElementById("adminReviewList");
        if (selectAll && list) {
            const boxes = Array.from(list.querySelectorAll(".admin-select-box"));
            const checked = boxes.filter((box) => box.checked).length;
            selectAll.disabled = boxes.length === 0;
            selectAll.checked = boxes.length > 0 && checked === boxes.length;
            selectAll.indeterminate = checked > 0 && checked < boxes.length;
        }
    }

    let adminReviewsLoading = false;
    async function loadAdminReviews() {
        const list = document.getElementById("adminReviewList");
        const refresh = document.getElementById("adminReviewRefresh");
        const filter = document.getElementById("adminReviewFilter")?.value || "open";
        if (!isStaff || !list || adminReviewsLoading) return;
        adminReviewsLoading = true;
        if (refresh) refresh.disabled = true;
        adminSelectedReviews.clear();
        updateReviewsBulkBar();
        renderAdminSkeleton(list, "cards", 3);
        try {
            const [reviews, users] = await Promise.all([
                readAdminPath(filter === "all"
                    ? db.ref("security/reviewQueue/banEvasion")
                    : db.ref("security/reviewQueue/banEvasion").orderByChild("status").equalTo("open")),
                getUsersSnapshotCached().catch(() => null)
            ]);
            if (reviews === undefined) throw new Error("review-read-failed");
            const entries = Object.entries(reviews || {})
                .filter(([, item]) => item && typeof item === "object")
                .sort(([, a], [, b]) => toTimestamp(b.lastDetectedAt || b.detectedAt) - toTimestamp(a.lastDetectedAt || a.detectedAt));
            const openCount = entries.filter(([, item]) => item.status === "open").length;
            updateAdminReviewCount(openCount);
            const visible = filter === "all" ? entries : entries.filter(([, item]) => item.status === "open");
            list.replaceChildren();
            if (!visible.length) {
                if (filter === "all") renderAdminEmpty(list, "fa-inbox", "Nothing flagged yet", "Accounts that share an IP or device with a banned account will show up here.");
                else renderAdminEmpty(list, "fa-circle-check", "All caught up", "No open ban-evasion reviews.", "ok");
                updateReviewsBulkBar();
                return;
            }
            visible.forEach(([uid, item]) => {
                const email = item.email || users?.[uid]?.email || "";
                const label = getAdminUserLabel(users, uid);
                const isOpen = item.status === "open";
                const card = document.createElement("article");
                card.className = `admin-review-card is-${escapeAdminText(item.status || "open")}`;
                card.dataset.uid = uid;
                const matches = Object.entries(item.matchedUids || {}).map(([otherUid, reasons]) => {
                    const labels = String(reasons || "").split(",").filter(Boolean).map((reason) => ({
                        ip: "Same IP", installId: "Same browser install", browserFingerprint: "Same device fingerprint"
                    })[reason] || reason);
                    return `<li><button type="button" class="admin-link-button" data-open-uid="${escapeAdminText(otherUid)}">${escapeAdminText(getAdminUserLabel(users, otherUid))}</button> <span class="admin-chip is-danger">Banned</span> ${labels.map((text) => `<span class="admin-chip">${escapeAdminText(text)}</span>`).join(" ")}</li>`;
                }).join("");
                card.innerHTML = `
                    <div class="security-log-head">
                        ${isOpen ? `<label class="admin-select" title="Select review"><input type="checkbox" class="admin-select-box" aria-label="Select ${escapeAdminText(label)}"></label>` : ""}
                        <strong><button type="button" class="admin-link-button" data-card-primary data-open-uid="${escapeAdminText(uid)}">${escapeAdminText(label)}</button></strong>
                        <span class="admin-chip ${isOpen ? "is-warning" : ""}">${escapeAdminText(item.status || "open")}</span>
                    </div>
                    <p class="admin-card-note">${escapeAdminText(email)} · first flagged ${escapeAdminText(formatLogTimestamp(item.detectedAt))} · last ${escapeAdminText(formatRelativeTime(item.lastDetectedAt || item.detectedAt))}</p>
                    <p><b>Matches banned account${Object.keys(item.matchedUids || {}).length === 1 ? "" : "s"}:</b></p>
                    <ul class="admin-review-matches">${matches || "<li>No match details</li>"}</ul>
                    ${item.resolvedBy ? `<p class="admin-card-note">Resolved by ${escapeAdminText(item.resolvedBy)}${item.note ? ` — ${escapeAdminText(item.note)}` : ""}</p>` : ""}
                    ${isOpen ? `
                    <div class="admin-review-actions">
                        <button type="button" data-review-action="dismiss" class="btn-secondary"><i class="fa-solid fa-check" aria-hidden="true"></i> Not evasion</button>
                        <details>
                            <summary class="delete-btn"><i class="fa-solid fa-ban" aria-hidden="true"></i> Ban &amp; close</summary>
                            ${buildBanFormHtml("Ban evasion")}
                        </details>
                    </div>` : ""}
                `;
                card.querySelectorAll("[data-open-uid]").forEach((button) => {
                    button.addEventListener("click", () => openAdminAccountFromAnywhere(button.getAttribute("data-open-uid")));
                });
                const checkbox = card.querySelector(".admin-select-box");
                checkbox?.addEventListener("change", () => {
                    if (checkbox.checked) adminSelectedReviews.set(uid, { uid, email, label });
                    else adminSelectedReviews.delete(uid);
                    card.classList.toggle("is-selected", checkbox.checked);
                    updateReviewsBulkBar();
                });
                card.querySelector('[data-review-action="dismiss"]')?.addEventListener("click", () => dismissAdminReviews([{ uid, email, label }]));
                bindBanForm(card.querySelector("form"), ({ reason, spec }) => banTargets([{ uid, email, label }], reason, spec, {
                    extraChanges: () => reviewResolutionChanges(uid, "actioned")
                }));
                list.appendChild(card);
            });
            updateReviewsBulkBar();
        } catch (err) {
            console.error("Failed to load reviews:", err);
            renderAdminEmpty(list, "fa-triangle-exclamation", "Couldn't load the review queue", "Try Refresh.", "danger");
        } finally {
            adminReviewsLoading = false;
            if (refresh) refresh.disabled = false;
        }
    }

    async function dismissAdminReviews(targets) {
        if (!isStaff || !currentUser || !targets.length) return;
        const message = targets.length === 1
            ? `Mark ${targets[0].label || targets[0].email || "this account"} as not ban evasion?`
            : `Mark ${targets.length} accounts as not ban evasion?`;
        if (!(await window.showInHouseConfirm(message, "Dismiss review"))) return;
        const bulkId = targets.length > 1 ? `bulk-${Date.now().toString(36)}` : "";
        try {
            await commitModerationBatch(targets.map((target) => ({
                action: "review-dismiss",
                targetUid: target.uid,
                targetEmail: target.email || "",
                changes: reviewResolutionChanges(target.uid, "dismissed"),
                details: { bulkId }
            })));
            showAdminToast(targets.length === 1 ? "Review dismissed." : `${targets.length} reviews dismissed.`);
        } catch (err) {
            console.error("Failed to dismiss review:", err);
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        }
        void loadAdminReviews();
    }

    async function dismissAdminReview(uid, email) {
        return dismissAdminReviews([{ uid, email }]);
    }

    document.getElementById("adminOverviewRefresh")?.addEventListener("click", () => {
        invalidateUsersSnapshotCache();
        void loadAdminOverview();
    });
    document.getElementById("adminOverviewRange")?.addEventListener("change", () => void loadAdminOverview());
    document.getElementById("adminReviewRefresh")?.addEventListener("click", () => void loadAdminReviews());
    document.getElementById("adminReviewFilter")?.addEventListener("change", () => void loadAdminReviews());
    document.getElementById("reviewsSelectAll")?.addEventListener("change", (event) => {
        document.querySelectorAll("#adminReviewList .admin-select-box").forEach((box) => {
            if (box.checked !== event.currentTarget.checked) {
                box.checked = event.currentTarget.checked;
                box.dispatchEvent(new Event("change"));
            }
        });
    });
    document.getElementById("reviewsBulkDismiss")?.addEventListener("click", () => dismissAdminReviews(Array.from(adminSelectedReviews.values())));
    document.getElementById("reviewsBulkClear")?.addEventListener("click", () => {
        document.querySelectorAll("#adminReviewList .admin-select-box:checked").forEach((box) => {
            box.checked = false;
            box.dispatchEvent(new Event("change"));
        });
    });
    document.getElementById("adminGlobalSearchForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const query = document.getElementById("adminGlobalSearch")?.value || "";
        if (usersSearchInput) usersSearchInput.value = query;
        adminDetailUid = null;
        closeAdminAccountDetail();
        switchAdminTab("users");
    });

    async function loadDiscordLink(user) {
        if (!user || !user.uid) return null;

        const uid = user.uid;
        const cached = discordLinkCacheByUid.get(uid);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value;
        }

        if (discordLinkRequestByUid.has(uid)) {
            return discordLinkRequestByUid.get(uid);
        }

        const requestPromise = (async () => {
            try {
                const snapshot = await db.ref(`users/${uid}/profile/discordLink`).once("value");
                const value = snapshot.val() || null;
                discordLinkCacheByUid.set(uid, {
                    value,
                    expiresAt: Date.now() + DISCORD_LINK_CACHE_TTL_MS
                });
                return value;
            } catch (err) {
                console.error("Failed to load Discord link:", err);
                return null;
            } finally {
                discordLinkRequestByUid.delete(uid);
            }
        })();

        discordLinkRequestByUid.set(uid, requestPromise);
        return requestPromise;
    }

    function invalidateDiscordLinkCache(uid) {
        if (uid) {
            discordLinkCacheByUid.delete(uid);
            discordLinkRequestByUid.delete(uid);
            return;
        }

        discordLinkCacheByUid.clear();
        discordLinkRequestByUid.clear();
    }

    window.getCachedDiscordLinkForUid = async function(uid) {
        const normalizedUid = String(uid || "").trim();
        if (!normalizedUid) return null;
        return loadDiscordLink({ uid: normalizedUid });
    };

    window.invalidateCachedDiscordLinkForUid = invalidateDiscordLinkCache;

    function renderDiscordLinkUi(linkData) {
        const permissions = getDiscordProfilePermissions(linkData);
        const discordAccessStatus = String(linkData?.accessStatus || "").toUpperCase();
        const isFailedDiscordLink = ["DENIED", "FAILED", "ERROR", "EXPIRED", "INVALID"].includes(discordAccessStatus);
        const hasLinkedDiscord = Boolean(linkData && (linkData.id || linkData.username || linkData.globalName));

        if (discordLinkStatus) {
            if (hasLinkedDiscord) {
                const shownName = linkData.globalName || linkData.username || linkData.id;
                const accessStatus = (linkData.accessStatus || "PENDING").toUpperCase();
                const tierLabel = permissions.tier !== "NONE" ? ` (${permissions.tier}${permissions.canUseCloud ? "+" : ""})` : "";
                discordLinkStatus.textContent = `Linked as ${shownName} · ${accessStatus}${tierLabel}`;
                discordLinkStatus.classList.add("is-linked");
            } else {
                discordLinkStatus.textContent = "Not linked";
                discordLinkStatus.classList.remove("is-linked");
            }
        }
        if (linkDiscordBtn) linkDiscordBtn.classList.toggle("is-hidden", hasLinkedDiscord);
        if (relinkDiscordBtn) relinkDiscordBtn.classList.toggle("is-hidden", !isFailedDiscordLink);
        if (unlinkDiscordBtn) unlinkDiscordBtn.classList.toggle("is-hidden", !hasLinkedDiscord);

        const bannerInputEl = document.getElementById("profileBannerInput");
        const bannerFileEl = document.getElementById("profileBannerFileInput");
        const bannerUrlInputEl = document.getElementById("profileBannerUrlInput");
        const bannerBtnEl = document.getElementById("updateProfileBannerBtn");
        const bannerStatusEl = document.getElementById("profileBannerStatus");

        if (bannerBtnEl) {
            bannerBtnEl.disabled = !permissions.canUseBanner;
            bannerBtnEl.title = permissions.canUseBanner
                ? ""
                : "Superstar role required for profile banners";
        }
        if (bannerInputEl) {
            bannerInputEl.disabled = !permissions.canUseBanner;
        }
        if (bannerFileEl) {
            bannerFileEl.disabled = !permissions.canUseBanner;
        }
        if (bannerUrlInputEl) {
            bannerUrlInputEl.disabled = !permissions.canUseBanner;
        }
        if (bannerStatusEl && !permissions.canUseBanner) {
            setProfileUploadStatus(bannerStatusEl, "Superstar role required for banners", true);
        } else if (bannerStatusEl) {
            setProfileUploadStatus(
                bannerStatusEl,
                getProfileModeHint(inferProfileImageMode(bannerUrlInputEl?.value || ""), "banner")
            );
        }
    }

    async function refreshDiscordLinkUi(user) {
        if (!user) {
            if (discordLinkStatus) {
                discordLinkStatus.textContent = "Sign in to link Discord";
                discordLinkStatus.classList.remove("is-linked");
            }
            if (linkDiscordBtn) linkDiscordBtn.classList.add("is-hidden");
            if (relinkDiscordBtn) relinkDiscordBtn.classList.add("is-hidden");
            if (unlinkDiscordBtn) unlinkDiscordBtn.classList.add("is-hidden");
            return;
        }

        const linkData = await loadDiscordLink(user);
        renderDiscordLinkUi(linkData);
        const discordAccessStatus = String(linkData?.accessStatus || "").toUpperCase();
        const isFailedDiscordLink = ["DENIED", "FAILED", "ERROR", "EXPIRED", "INVALID"].includes(discordAccessStatus);

        const canLinkFromCurrentPage = isOnIndexHtmlPage();
        if (!canLinkFromCurrentPage) {
            if (discordLinkStatus) {
                const hasLinkedDiscord = Boolean(linkData && (linkData.id || linkData.username || linkData.globalName));
                const baseText = hasLinkedDiscord
                    ? discordLinkStatus.textContent
                    : "Ready to connect your Discord account.";
                discordLinkStatus.textContent = `${baseText} Continue on Home to securely finish linking.`;
                discordLinkStatus.classList.remove("is-linked");
            }

            const hasLinkedDiscord = Boolean(linkData && (linkData.id || linkData.username || linkData.globalName));
            if (linkDiscordBtn) {
                linkDiscordBtn.classList.remove("is-hidden");
                linkDiscordBtn.disabled = false;
                linkDiscordBtn.title = "Continue Discord linking on Home";
                linkDiscordBtn.textContent = "Continue linking";
            }
            if (relinkDiscordBtn) {
                relinkDiscordBtn.classList.toggle("is-hidden", !isFailedDiscordLink);
                relinkDiscordBtn.disabled = false;
                relinkDiscordBtn.title = "Continue Discord relinking on Home";
                relinkDiscordBtn.textContent = "Continue relinking";
            }
            if (unlinkDiscordBtn) {
                unlinkDiscordBtn.classList.toggle("is-hidden", !hasLinkedDiscord);
            }
            return;
        }

        if (linkDiscordBtn) {
            linkDiscordBtn.disabled = false;
            linkDiscordBtn.title = "";
            linkDiscordBtn.textContent = "Link Discord";
        }
        if (relinkDiscordBtn) {
            relinkDiscordBtn.disabled = false;
            relinkDiscordBtn.title = "";
            relinkDiscordBtn.textContent = "Relink Discord";
        }
    }

    async function checkRequiredDiscordRole(accessToken) {
        const guildId = (DISCORD_OAUTH_CONFIG.roleCheckGuildId || "").trim();
        const hyperSponsorRoleId = (DISCORD_OAUTH_CONFIG.roleCheckHyperSponsorRoleId || "").trim();
        const sponsorRoleId = (DISCORD_OAUTH_CONFIG.roleCheckSponsorRoleId || "").trim();
        const supporterRoleId = (DISCORD_OAUTH_CONFIG.roleCheckSupporterRoleId || "").trim();
        const boosterRoleId = (DISCORD_OAUTH_CONFIG.roleCheckBoosterRoleId || "").trim();
        const cloudAccessRoleId = (DISCORD_OAUTH_CONFIG.roleCheckCloudAccessRoleId || "").trim();
        const hasRequiredRolesConfigured = !!(hyperSponsorRoleId || sponsorRoleId || supporterRoleId || boosterRoleId);

        if (!guildId || !hasRequiredRolesConfigured) {
            return {
                status: "DENIED",
                reason: "Role check is not configured in script."
            };
        }

        const endpoint = `${DISCORD_OAUTH_CONFIG.memberApiBaseUrl}/${guildId}/member`;
        let response;
        try {
            response = await fetch(endpoint, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
        } catch (_networkErr) {
            const recoverableError = new Error("Temporary Discord connectivity issue while checking your roles.");
            recoverableError.recoverable = true;
            throw recoverableError;
        }

        if (!response.ok) {
            if (response.status === 429 || response.status >= 500) {
                const recoverableError = new Error(`Discord role check is temporarily unavailable (${response.status}).`);
                recoverableError.recoverable = true;
                throw recoverableError;
            }
            return {
                status: "DENIED",
                reason: `Guild membership lookup failed (${response.status}).`
            };
        }

        const member = await response.json();
        const roles = Array.isArray(member?.roles) ? member.roles : [];
        const hasHyperSponsorRole = hyperSponsorRoleId ? roles.includes(hyperSponsorRoleId) : false;
        const hasBoosterRole = boosterRoleId ? roles.includes(boosterRoleId) : false;
        const hasSponsorRole = sponsorRoleId ? roles.includes(sponsorRoleId) : false;
        const hasSupporterRole = supporterRoleId ? roles.includes(supporterRoleId) : false;
        const hasCloudAccessRole = hasHyperSponsorRole || hasSponsorRole;
        const hasBothRoles = hasSponsorRole && hasSupporterRole;
        const modeEvaluation = evaluateDiscordAccessByMode({
            hasHyperSponsorRole,
            hasSponsorRole,
            hasSupporterRole,
            hasBoosterRole
        });
        const hasAnyAllowedRole = modeEvaluation.granted;
        const accessTier = hasHyperSponsorRole ? "HYPERSTAR" : hasSponsorRole ? "SUPERSTAR" : hasSupporterRole ? "SUPPORTER" : hasBoosterRole ? "BOOSTER" : "NONE";

        return {
            status: hasAnyAllowedRole ? "ACCEPTED" : "DENIED",
            reason: modeEvaluation.reason,
            guildId,
            hyperSponsorRoleId,
            sponsorRoleId,
            supporterRoleId,
            boosterRoleId,
            cloudAccessRoleId,
            roles,
            hasHyperSponsorRole,
            hasSponsorRole,
            hasSupporterRole,
            hasBoosterRole,
            hasCloudAccessRole,
            hasBothRoles,
            accessTier,
            permissions: {
                canUseBanner: hasHyperSponsorRole || hasSponsorRole,
                canUseRichBio: hasHyperSponsorRole || hasSponsorRole,
                canUseCloud: hasCloudAccessRole
            }
        };
    }

    async function logSponsorDeniedSupporterAttempt({ user, discordUser, avatarUrl, roleCheckResult }) {
        const deniedForSupporterOnly = roleCheckResult?.status === "DENIED"
            && !!roleCheckResult?.hasSupporterRole
            && !roleCheckResult?.hasSponsorRole;

        if (!deniedForSupporterOnly) return;

        try {
            await db.ref("securityLogs/sponsorDeniedSupporterRole").push({
                createdAt: new Date().toISOString(),
                sim: "sims/drag",
                accessMode: getDiscordAccessMode(),
                denialReason: roleCheckResult?.reason || "",
                appUser: {
                    uid: user?.uid || "",
                    email: user?.email || ""
                },
                discord: {
                    id: discordUser?.id || "",
                    username: discordUser?.username || "",
                    globalName: discordUser?.global_name || "",
                    discriminator: discordUser?.discriminator || "0",
                    avatarUrl: avatarUrl || ""
                },
                roleCheck: {
                    guildId: roleCheckResult?.guildId || "",
                    sponsorRoleId: roleCheckResult?.sponsorRoleId || "",
                    supporterRoleId: roleCheckResult?.supporterRoleId || "",
                    boosterRoleId: roleCheckResult?.boosterRoleId || "",
                    hasSponsorRole: !!roleCheckResult?.hasSponsorRole,
                    hasSupporterRole: !!roleCheckResult?.hasSupporterRole,
                    hasBoosterRole: !!roleCheckResult?.hasBoosterRole,
                    roles: Array.isArray(roleCheckResult?.roles) ? roleCheckResult.roles : []
                }
            });
        } catch (logErr) {
            console.warn("Failed to write sponsor denied supporter-role log:", logErr);
        }
    }

    function completePendingDiscordLink(user) {
        if (!discordLinkPromise) {
            discordLinkPromise = finishPendingDiscordLink(user).finally(() => { discordLinkPromise = null; });
        }
        return discordLinkPromise;
    }

    async function finishPendingDiscordLink(user) {
        if (!user) return;

        const raw = sessionStorage.getItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey);
        if (!raw) return;

        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch (_err) {
            sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey);
            return;
        }

        if (parsed?.intent === "signin") return;

        if (!parsed?.token || (parsed.expiresAt && Date.now() > parsed.expiresAt)) {
            sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey);
            showCloudNote("Discord token expired. Link again.", true);
            return;
        }

        let shouldClearPendingToken = false;

        try {
            const response = await fetch(DISCORD_OAUTH_CONFIG.userApiUrl, {
                headers: {
                    Authorization: `Bearer ${parsed.token}`
                }
            });

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    const recoverableError = new Error(`Discord API is temporarily unavailable (${response.status}).`);
                    recoverableError.recoverable = true;
                    throw recoverableError;
                }

                const fatalError = new Error(`Discord API error ${response.status}`);
                fatalError.clearPendingToken = true;
                throw fatalError;
            }

            const discordUser = await response.json();
            const avatarUrl = discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
                : null;
            const roleCheckResult = await checkRequiredDiscordRole(parsed.token);
            const now = Date.now();
            const verificationTtlMs = Math.max(1, Number(DISCORD_OAUTH_CONFIG.verificationTtlHours) || 12) * 60 * 60 * 1000;
            const verificationExpiresAt = new Date(now + verificationTtlMs).toISOString();

            await logSponsorDeniedSupporterAttempt({
                user,
                discordUser,
                avatarUrl,
                roleCheckResult
            });

            await db.ref(`users/${user.uid}/profile/discordLink`).set({
                id: discordUser.id || "",
                username: discordUser.username || "",
                globalName: discordUser.global_name || "",
                discriminator: discordUser.discriminator || "0",
                avatarUrl,
                accessStatus: roleCheckResult.status,
                accessTier: roleCheckResult.accessTier || "NONE",
                accessReason: roleCheckResult.reason || "",
                permissions: roleCheckResult.permissions || {
                    canUseBanner: false,
                    canUseRichBio: false
                },
                roleCheck: {
                    guildId: roleCheckResult.guildId || (DISCORD_OAUTH_CONFIG.roleCheckGuildId || ""),
                    hyperSponsorRoleId: roleCheckResult.hyperSponsorRoleId || (DISCORD_OAUTH_CONFIG.roleCheckHyperSponsorRoleId || ""),
                    sponsorRoleId: roleCheckResult.sponsorRoleId || (DISCORD_OAUTH_CONFIG.roleCheckSponsorRoleId || ""),
                    supporterRoleId: roleCheckResult.supporterRoleId || (DISCORD_OAUTH_CONFIG.roleCheckSupporterRoleId || ""),
                    boosterRoleId: roleCheckResult.boosterRoleId || (DISCORD_OAUTH_CONFIG.roleCheckBoosterRoleId || ""),
                    cloudAccessRoleId: roleCheckResult.cloudAccessRoleId || (DISCORD_OAUTH_CONFIG.roleCheckCloudAccessRoleId || ""),
                    hasHyperSponsorRole: !!roleCheckResult.hasHyperSponsorRole,
                    hasSponsorRole: !!roleCheckResult.hasSponsorRole,
                    hasSupporterRole: !!roleCheckResult.hasSupporterRole,
                    hasBoosterRole: !!roleCheckResult.hasBoosterRole,
                    hasCloudAccessRole: !!roleCheckResult.hasCloudAccessRole,
                    roles: Array.isArray(roleCheckResult.roles) ? roleCheckResult.roles : [],
                    checkedAt: new Date().toISOString()
                },
                verificationExpiresAt,
                linkedAt: new Date().toISOString()
            });
            invalidateDiscordLinkCache(user.uid);

            if (roleCheckResult.status === "ACCEPTED") {
                showCloudNote("Discord account linked. ACCEPTED");
            } else {
                showCloudNote(`Discord account linked but DENIED. ${roleCheckResult.reason || ""}`.trim(), true);
            }

            await refreshDiscordLinkUi(user);
            shouldClearPendingToken = true;
        } catch (err) {
            console.error("Failed to finalize Discord link:", err);
            if (err?.recoverable) {
                showCloudNote("Discord verification is temporarily unavailable. Reload shortly to retry without relinking.", true);
                shouldClearPendingToken = false;
            } else {
                showCloudNote("Couldn't link Discord. Try again.", true);
                shouldClearPendingToken = Boolean(err?.clearPendingToken);
            }
        } finally {
            if (shouldClearPendingToken) {
                sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey);
            }
        }
    }

    function startDiscordSignIn() {
        if (auth.currentUser) {
            showCloudNote("You are already signed in. Link Discord in Account settings instead.", true);
            return;
        }
        try {
            sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey);
            sessionStorage.setItem(DISCORD_OAUTH_CONFIG.intentStorageKey, "signin");
            sessionStorage.setItem(DISCORD_OAUTH_CONFIG.stateStorageKey, generateDiscordOAuthState());
            snapshotCustomLocalDataForOAuth();
            const params = new URLSearchParams({
                response_type: "token",
                client_id: getDiscordClientId(),
                scope: `${DISCORD_OAUTH_CONFIG.scope} email`,
                redirect_uri: isOnIndexHtmlPage() ? getDiscordRedirect() : getAccountHomePageUrl(),
                state: sessionStorage.getItem(DISCORD_OAUTH_CONFIG.stateStorageKey),
                prompt: "consent"
            });
            if (discordAuthBtn) discordAuthBtn.disabled = true;
            window.location.assign(`${DISCORD_OAUTH_CONFIG.authorizeUrl}?${params}`);
        } catch (err) {
            console.error("Failed to start Discord sign-in:", err);
            showCloudNote("Couldn't open Discord. Enable browser storage and try again.", true);
            if (discordAuthBtn) discordAuthBtn.disabled = false;
        }
    }

    function completePendingDiscordSignIn() {
        if (discordSignInPromise) return discordSignInPromise;
        discordSignInPromise = (async () => {
            let pending = null;
            try {
                pending = JSON.parse(sessionStorage.getItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey) || "null");
                if (pending?.intent !== "signin") return;
                if (auth.currentUser) throw new Error("Already signed in. Sign out before signing in with Discord.");
                if (!pending.token || !pending.expiresAt || pending.expiresAt <= Date.now()) {
                    throw new Error("Discord authorization expired. Please try again.");
                }
                if (discordAuthBtn) discordAuthBtn.disabled = true;
                const response = await fetch(getCloudFunctionEndpoint("discordAuth"), {
                    method: "POST",
                    headers: { Authorization: `Bearer ${pending.token}`, "Content-Type": "application/json" },
                    body: "{}",
                    signal: AbortSignal.timeout(30000)
                });
                const data = await response.json().catch(() => {
                    throw new Error("Discord sign-in is unavailable. Please try again later.");
                });
                if (!response.ok || typeof data?.customToken !== "string" || !data.customToken) {
                    throw new Error(data?.message || "Discord sign-in is unavailable. Please try again.");
                }
                if (auth.currentUser) throw new Error("Already signed in. Sign out before signing in with Discord.");
                const result = await auth.signInWithCustomToken(data.customToken);
                sessionStorage.setItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey, JSON.stringify({ ...pending, intent: "link" }));
                showCloudNote("Signed in with Discord. You can change your username in Identity.");
                await updateAuthUi(result.user);
            } catch (err) {
                console.error("Discord sign-in failed:", err.code || err.name);
                if (pending?.intent === "signin") sessionStorage.removeItem(DISCORD_OAUTH_CONFIG.pendingTokenStorageKey);
                showCloudNote(err.message || "Couldn't sign in with Discord. Please try again.", true);
                setModalOpen(true);
            } finally {
                if (discordAuthBtn) discordAuthBtn.disabled = false;
            }
        })().finally(() => { discordSignInPromise = null; });
        return discordSignInPromise;
    }

    function startDiscordLinkFlow() {
        if (!currentUser) return alert("sign in first");
        if (!isOnIndexHtmlPage()) {
            try {
                sessionStorage.setItem(DISCORD_LINK_START_ON_HOME_KEY, "1");
            } catch (err) {
                console.error("Failed to save Discord link handoff:", err);
                showCloudNote("Couldn't continue linking. Open Home and try again.", true);
                return;
            }
            showCloudNote("Taking you to Home to continue Discord linking...");
            window.location.assign(getAccountHomePageUrl());
            return;
        }

        const clientId = getDiscordClientId();
        if (!clientId) {
            return alert("Discord client ID missing. Set window.DISCORD_CLIENT_ID or localStorage.discordClientId.");
        }

        const redirectUri = getDiscordRedirect();
        let state = "";
        try {
            state = generateDiscordOAuthState();
            sessionStorage.setItem(DISCORD_OAUTH_CONFIG.intentStorageKey, "link");
            sessionStorage.setItem(DISCORD_OAUTH_CONFIG.stateStorageKey, state);
        } catch (err) {
            console.error("Failed to initialize Discord link state:", err);
            showCloudNote("Your browser blocked secure storage. Enable storage/cookies and try again.", true);
            alert("Discord link could not start because browser storage is blocked.");
            return;
        }
        snapshotCustomLocalDataForOAuth();

        const params = new URLSearchParams({
            response_type: "token",
            client_id: clientId,
            scope: DISCORD_OAUTH_CONFIG.scope,
            redirect_uri: redirectUri,
            state,
            prompt: "consent"
        });

        if (linkDiscordBtn) {
            linkDiscordBtn.disabled = true;
            linkDiscordBtn.textContent = "Opening Discord...";
        }

        try {
            window.location.assign(`${DISCORD_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`);
        } catch (err) {
            console.error("Failed to open Discord OAuth page:", err);
            showCloudNote("Couldn't open Discord OAuth. Try again.", true);
            if (linkDiscordBtn) {
                linkDiscordBtn.disabled = false;
                linkDiscordBtn.textContent = "Link Discord";
            }
        }
    }

    async function unlinkDiscordAccount() {
        if (!currentUser) return alert("sign in first");
        if (!(await window.showInHouseConfirm("unlink your Discord account?", "Unlink Discord"))) return;

        try {
            await db.ref(`users/${currentUser.uid}/profile/discordLink`).remove();
            invalidateDiscordLinkCache(currentUser.uid);
            showCloudNote("Discord account unlinked.");
            await refreshDiscordLinkUi(currentUser);
        } catch (err) {
            console.error("Failed to unlink Discord:", err);
            showCloudNote("Couldn't unlink Discord.", true);
        }
    }

    async function updateAuthUi(user) {
        const previousUid = currentUser && currentUser.uid ? currentUser.uid : "";
        currentUser = user;
        const nextUid = user && user.uid ? user.uid : "";
        if (previousUid !== nextUid) {
            if (previousUid) invalidateDiscordLinkCache(previousUid);
            if (!nextUid) invalidateDiscordLinkCache();
        }
        window.currentUserUid = user ? user.uid : null;
        window.currentUserEmail = user ? (user.email || null) : null;
        const navLogoutItem = document.getElementById("navLogoutItem");
        
        if (!user) {
            statusEl.textContent = "Not signed in.";
            if (logoutBtn) logoutBtn.classList.add("is-hidden");
            if (authForm) authForm.classList.remove("is-hidden");
            if (profileSection) profileSection.classList.add("is-hidden");
            await applyCloudAccessState(null);
            if (navLogoutItem) navLogoutItem.classList.add("is-hidden");
            loadProfilePicture(null);
            await updateEmailVerificationUI(null);
            await loadUsername(null);
            await checkBanStatus(null);
            await checkStaffStatus(null);
            await refreshDiscordLinkUi(null);
        } else {
            const username = await loadUsername(user);
            statusEl.textContent = `signed in as @${username}`;
            
            if (logoutBtn) logoutBtn.classList.remove("is-hidden");
            if (authForm) authForm.classList.add("is-hidden");
            if (profileSection) profileSection.classList.remove("is-hidden");
            if (navLogoutItem) navLogoutItem.classList.remove("is-hidden");
            
            try {
                await user.reload();
            } catch (err) {
                console.warn("Failed to refresh auth user during UI update:", err);
            }

            const refreshedUser = auth.currentUser || user;

            const authMetadataUpdates = {
                [`users/${refreshedUser.uid}/lastLogin`]: new Date().toISOString(),
                [`users/${refreshedUser.uid}/emailVerified`]: !!refreshedUser.emailVerified
            };
            if (refreshedUser.email) {
                authMetadataUpdates[`users/${refreshedUser.uid}/email`] = refreshedUser.email;
            }

            try {
                await db.ref().update(authMetadataUpdates);
            } catch (err) {
                console.warn("Skipping auth metadata sync (permission or rules):", err);
            }

            await runDeepAccountTracking(refreshedUser, "auth-state");
            void recordServerSession(refreshedUser, "auth-state");
            
            await loadProfilePicture(refreshedUser);
            await updateEmailVerificationUI(refreshedUser);
            await loadProfileData(refreshedUser);
            await checkBanStatus(refreshedUser);
            await checkStaffStatus(refreshedUser);
            await completePendingDiscordLink(refreshedUser);
            await refreshDiscordLinkUi(refreshedUser);
            await applyCloudAccessState(refreshedUser);

            if (sessionStorage.getItem(DISCORD_LINK_START_ON_HOME_KEY) === "1") {
                sessionStorage.removeItem(DISCORD_LINK_START_ON_HOME_KEY);
                showCloudNote("Opening Discord to authorize your account...");
                startDiscordLinkFlow();
            }
        }
    }

    function populateQueenSelect() {
        if (!queenToUpload) return;
        queenToUpload.innerHTML = '<option value="">-- Select a Queen --</option>';
        
        const localQueens = JSON.parse(localStorage.getItem("customQueens")) || [];
        
        if (localQueens.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "no custom queens found";
            opt.disabled = true;
            queenToUpload.appendChild(opt);
            return;
        }

        localQueens.forEach((queen, index) => {
            const opt = document.createElement("option");
            opt.value = index;
            opt.textContent = queen._name || queen.name || `Queen ${index + 1}`;
            queenToUpload.appendChild(opt);
        });
    }

    async function uploadQueenToCloud() {
        if (!currentUser || !cloudQueensRef) {
            return showCloudNote("sign in first", true);
        }
        const cloudAccessState = await getCloudAccessState(currentUser);
        if (cloudAccessState.blocked) {
            return showCloudNote(cloudAccessState.reason || "Cloud uploads are unavailable.", true);
        }

        const selectedIndex = queenToUpload?.value;
        if (selectedIndex === "" || selectedIndex === null) {
            return showCloudNote("pick a queen to upload", true);
        }

        const localQueens = JSON.parse(localStorage.getItem("customQueens")) || [];
        const queen = localQueens[selectedIndex];
        
        if (!queen) {
            return showCloudNote("couldn't find that queen", true);
        }

        const queenData = {
            _name: queen._name || queen.name || "",
            name: queen._name || queen.name || "",
            _actingStat: queen._actingStat ?? queen.acting ?? 0,
            _comedyStat: queen._comedyStat ?? queen.comedy ?? 0,
            _danceStat: queen._danceStat ?? queen.dance ?? 0,
            _designStat: queen._designStat ?? queen.design ?? 0,
            _improvStat: queen._improvStat ?? queen.improv ?? 0,
            _runwayStat: queen._runwayStat ?? queen.runway ?? 0,
            _lipsyncStat: queen._lipsyncStat ?? queen.lipsync ?? 0,
            images: Array.isArray(queen.images) ? queen.images : (queen.image ? [queen.image] : []),
            isDuo: queen.isDuo || false,
            name1: queen.name1 || "",
            name2: queen.name2 || "",
            country: queen.country || null,
            customqueen: true,
            uploadedAt: new Date().toISOString()
        };

        try {
            const snapshot = await cloudQueensRef.orderByChild("_name").equalTo(queenData._name).once("value");
            if (snapshot.exists()) {
                return showCloudNote("you already have a queen with that name", true);
            }

            await cloudQueensRef.push(queenData);
            showCloudNote(`${queenData._name} uploaded`);
            loadCloudQueens();
        } catch (err) {
            console.error(err);
            showCloudNote("couldn't upload", true);
        }
    }

    async function loadCloudQueens() {
        if (!currentUser || !cloudQueensRef || !cloudQueensList) return;
        const cloudAccessState = await getCloudAccessState(currentUser);
        if (cloudAccessState.blocked) {
            cloudQueensList.innerHTML = '<p class="empty-state">Cloud uploads are not available for your current role.</p>';
            return;
        }

        try {
            const snapshot = await cloudQueensRef.once("value");
            const queens = snapshot.val();

            cloudQueensList.innerHTML = "";

            if (!queens) {
                cloudQueensList.innerHTML = '<p class="empty-state">no queens in the cloud yet</p>';
                return;
            }

            Object.entries(queens).forEach(([queenId, queenData]) => {
                const queenCard = document.createElement("div");
                queenCard.className = "cloud-queen-card";
                
                const queenImage = Array.isArray(queenData.images) && queenData.images.length > 0
                    ? queenData.images[0]
                    : "image/queens/noimage.jpg";

                queenCard.innerHTML = `
                    <img src="${queenImage}" alt="${queenData._name || queenData.name}" class="cloud-queen-img">
                    <div class="cloud-queen-info">
                        <strong class="cloud-queen-name">${queenData._name || queenData.name || "unnamed queen"}</strong>
                        <small class="cloud-queen-date">Uploaded: ${new Date(queenData.uploadedAt).toLocaleDateString()}</small>
                    </div>
                    <div class="cloud-queen-actions">
                        <button class="cloud-btn download-btn" onclick="downloadQueenFromCloud('${queenId}')" title="Download">
                            <i class="fa-solid fa-download"></i>
                        </button>
                        <button class="cloud-btn delete-btn" onclick="deleteQueenFromCloud('${queenId}')" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;

                cloudQueensList.appendChild(queenCard);
            });
        } catch (err) {
            console.error(err);
            cloudQueensList.innerHTML = '<p class="error-state">couldn\'t load cloud queens</p>';
        }
    }

    window.downloadQueenFromCloud = async function(queenId) {
        if (!currentUser || !cloudQueensRef) {
            return alert("sign in first");
        }
        const cloudAccessState = await getCloudAccessState(currentUser);
        if (cloudAccessState.blocked) {
            return showCloudNote(cloudAccessState.reason || "Cloud uploads are unavailable.", true);
        }

        try {
            const snapshot = await cloudQueensRef.child(queenId).once("value");
            const queenData = snapshot.val();
            
            if (!queenData) {
                return showCloudNote("couldn't find that queen", true);
            }

            const localQueens = JSON.parse(localStorage.getItem("customQueens")) || [];
            
            const exists = localQueens.some(q => (q._name || q.name) === (queenData._name || queenData.name));
            
            if (exists) {
                if (!(await window.showInHouseConfirm(`${queenData._name} already exists locally - download anyway?`, "Duplicate Queen"))) {
                    return;
                }
            }

            localQueens.push(queenData);
            localStorage.setItem("customQueens", JSON.stringify(localQueens));
            
            if (window.allCustomQueens && window.Queen) {
                const queen = new window.Queen(
                    queenData._name || queenData.name,
                    queenData._actingStat,
                    queenData._comedyStat,
                    queenData._danceStat,
                    queenData._designStat,
                    queenData._improvStat,
                    queenData._runwayStat,
                    queenData._lipsyncStat,
                    queenData.images,
                    true,
                    queenData.isDuo,
                    queenData.name1,
                    queenData.name2
                );
                queen.customqueen = true;
                queen.country = queenData.country;
                window.allCustomQueens.push(queen);
                if (window.allQueens) {
                    window.allQueens.push(queen);
                }
            }

            showCloudNote(`${queenData._name} downloaded`);
            populateQueenSelect();
        } catch (err) {
            console.error(err);
            showCloudNote("couldn't download", true);
        }
    };

    window.deleteQueenFromCloud = async function(queenId) {
        if (!currentUser || !cloudQueensRef) {
            return alert("sign in first");
        }
        const cloudAccessState = await getCloudAccessState(currentUser);
        if (cloudAccessState.blocked) {
            return showCloudNote(cloudAccessState.reason || "Cloud uploads are unavailable.", true);
        }

        try {
            const snapshot = await cloudQueensRef.child(queenId).once("value");
            const queenData = snapshot.val();
            
            if (!queenData) {
                return showCloudNote("couldn't find that queen", true);
            }

            if (!(await window.showInHouseConfirm(`delete "${queenData._name || queenData.name}"? can't be undone`, "Delete Cloud Queen"))) {
                return;
            }

            await cloudQueensRef.child(queenId).remove();
            showCloudNote("deleted from cloud");
            loadCloudQueens();
        } catch (err) {
            console.error(err);
            showCloudNote("couldn't delete", true);
        }
    };
    async function changeStaffRole(uid, newRole) {
        if (!isStaff || !currentUser) return alert("you don't have permission for that");
        try {
            const snapshot = await db.ref(`staff/${uid}`).once("value");
            const staff = snapshot.val();
            if (!staff) return alert("couldn't find that staff member");
            if (isOwnerEmail(staff.email)) return alert("can't change system admin roles");
            if (!["staff", "admin"].includes(newRole)) return alert("invalid staff role");
            if (!canManageStaffRecord(uid, staff.role || "staff", staff.email) || !getAssignableStaffRoles().includes(newRole)) {
                loadStaffList();
                return alert("your role can't make that change");
            }
            if (!(await ensureAdminElevation("change a staff role"))) {
                loadStaffList();
                return;
            }
            await commitModerationAction("staff-role", uid, staff.email, { [`staff/${uid}/role`]: newRole }, {
                previousRole: staff.role || "staff", role: newRole
            });
            loadStaffList();
        } catch (err) {
            console.error("Failed to change role:", err);
            alert("couldn't change role");
        }
    }

    window.changeStaffRoleGlobal = changeStaffRole;
    window.removeStaffMemberGlobal = removeStaffMember;
    window.verifyUserEmailGlobal = setManualEmailVerified;
    window.banUserGlobal = setUserBan;
    window.unbanUserGlobal = clearUserBan;

    openBtn.addEventListener("click", (event) => {
        event.preventDefault();
        setModalOpen(true);
    });

    closeBtn.addEventListener("click", () => setModalOpen(false));

    modal?.addEventListener("click", (event) => {
        if (event.target === modal) setModalOpen(false);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modal?.classList.contains("active")) {
            setModalOpen(false);
        }
        if (event.key === "Escape" && adminModal?.classList.contains("active") && !document.querySelector(".history-save-modal.active")) {
            setAdminModalOpen(false);
        }
    });

    navAdminBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        if (isStaff) {
            setAdminModalOpen(true);
        }
    });

    publishAnnouncementBtn?.addEventListener("click", () => {
        void publishGlobalAnnouncementFromAdmin();
    });

    clearAnnouncementBtn?.addEventListener("click", () => {
        void clearGlobalAnnouncementFromAdmin();
    });

    historyRtdbWritingSaveBtn?.addEventListener("click", () => {
        void saveHistoryRtdbWritingFromAdmin();
    });

    document.getElementById("adminExportPlacementEmoji")?.addEventListener("click", async (event) => {
        if (!isStaff) return;
        const button = event.currentTarget;
        const status = document.getElementById("adminPlacementEmojiStatus");
        const sizeSelect = document.getElementById("adminPlacementEmojiSize");
        const paddingInput = document.getElementById("adminPlacementEmojiPadding");
        const size = Number(sizeSelect.value);
        const padding = paddingInput.valueAsNumber;
        button.disabled = true;
        sizeSelect.disabled = true;
        paddingInput.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
            if (typeof window.exportAllPlacementEmoji !== "function") {
                throw new Error("Open Admin from the sponsor simulator home page to export placement emoji.");
            }
            status.textContent = `Creating ${size} x ${size} placement emoji ZIP...`;
            const count = await window.exportAllPlacementEmoji(size, padding);
            status.textContent = `Downloaded ${count} placement emoji (${size} x ${size} PNGs, ${padding}% inner padding) in one ZIP.`;
        } catch (error) {
            console.error("Admin placement emoji export failed:", error);
            status.textContent = error.message || "Could not export placement emoji. Please try again.";
        } finally {
            button.disabled = false;
            sizeSelect.disabled = false;
            paddingInput.disabled = false;
            button.removeAttribute("aria-busy");
        }
    });

    previewStorageCleanupBtn?.addEventListener("click", () => {
        void runStorageCleanup(false);
    });

    runStorageCleanupBtn?.addEventListener("click", () => {
        void runStorageCleanup(true);
    });

    adminClose?.addEventListener("click", () => setAdminModalOpen(false));

    adminModal?.addEventListener("click", (event) => {
        if (event.target === adminModal) setAdminModalOpen(false);
    });

    // Settings Tab Switching
    const settingsNavItems = document.querySelectorAll(".settings-nav-item");
    const settingsSections = document.querySelectorAll(".settings-section");

    function switchSettingsTab(sectionName) {
        // Update navigation items
        settingsNavItems.forEach(item => {
            const isActive = item.getAttribute("data-section") === sectionName;
            item.classList.toggle("active", isActive);
        });

        // Update sections
        settingsSections.forEach(section => {
            const isActive = section.getAttribute("data-section") === sectionName;
            section.classList.toggle("active", isActive);
        });
    }

    settingsNavItems.forEach(item => {
        item.addEventListener("click", () => {
            const sectionName = item.getAttribute("data-section");
            switchSettingsTab(sectionName);
        });
    });

    // Character counter for bio
    const profileBioInput = document.getElementById("profileBioInput");
    if (profileBioInput) {
        profileBioInput.addEventListener("input", function() {
            const parent = this.closest(".setting-item");
            const counter = parent?.querySelector(".character-count");
            if (counter) {
                counter.textContent = `${this.value.length} / 150`;
            }
        });
    }

    // Display Name and Pronouns functionality
    const displayNameInput = document.getElementById("displayNameInput");
    const pronounsInput = document.getElementById("pronounsInput");
    const updateUsernameBtn = document.getElementById("updateUsernameBtn");
    const updateDisplayNameBtn = document.getElementById("updateDisplayNameBtn");
    const updatePronounsBtn = document.getElementById("updatePronounsBtn");
    const teamTagSelect = document.getElementById("teamTagSelect");
    const customTeamTagInput = document.getElementById("customTeamTagInput");
    const addTeamTagBtn = document.getElementById("addTeamTagBtn");
    const selectedTeamTags = document.getElementById("selectedTeamTags");
    const saveTeamTagsBtn = document.getElementById("saveTeamTagsBtn");
    const emailDisplay = document.getElementById("emailDisplay");
    let selectedTeamTagsState = [];

    function normalizeTeamTag(value) {
        return normalizeTeamTagValue(value);
    }

    function renderSelectedTeamTags() {
        if (!selectedTeamTags) return;
        selectedTeamTags.replaceChildren();
        if (!selectedTeamTagsState.length) {
            const emptyMessage = document.createElement("p");
            emptyMessage.className = "account-note";
            emptyMessage.textContent = "No team tags selected yet.";
            selectedTeamTags.appendChild(emptyMessage);
            return;
        }

        selectedTeamTagsState.forEach((tag, index) => {
            const tagItem = document.createElement("span");
            tagItem.className = "selected-team-tag-item";
            const tagName = document.createElement("span");
            tagName.textContent = `Team ${tag}`;
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.setAttribute("aria-label", `Remove Team ${tag}`);
            removeButton.textContent = "×";
            tagItem.append(tagName, removeButton);
            selectedTeamTags.appendChild(tagItem);

            removeButton.addEventListener("click", () => {
                selectedTeamTagsState.splice(index, 1);
                renderSelectedTeamTags();
            });
        });
    }

    function addTeamTagToSelection(tagValue) {
        const normalized = normalizeTeamTag(tagValue);
        if (!normalized) return;
        if (selectedTeamTagsState.includes(normalized)) return;
        selectedTeamTagsState.push(normalized);
        renderSelectedTeamTags();
    }

    function getAllQueensTeamChoices() {
        let queens = [];
        try {
            queens = Array.isArray(allQueens) ? allQueens : [];
        } catch (_err) {
            return [];
        }

        const firstNames = queens
            .map((queen) => queen?.name || queen?._name || "")
            .map((fullName) => fullName.toString().trim())
            .filter(Boolean)
            .map((fullName) => fullName.split(/\s+/)[0])
            .map((firstName) => normalizeTeamTag(firstName))
            .filter(Boolean);

        return [...new Set(firstNames)].sort((a, b) => a.localeCompare(b));
    }

    function populateTeamTagChoices() {
        if (!teamTagSelect) return;

        const teamChoices = getAllQueensTeamChoices();
        const currentValue = teamTagSelect.value;

        teamTagSelect.innerHTML = '<option value="">Choose a team...</option>';
        teamChoices.forEach((tag) => {
            const option = document.createElement("option");
            option.value = tag;
            option.textContent = `Team ${tag}`;
            teamTagSelect.appendChild(option);
        });

        if (teamChoices.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No queens loaded yet";
            option.disabled = true;
            teamTagSelect.appendChild(option);
        } else if (currentValue && teamChoices.includes(currentValue)) {
            teamTagSelect.value = currentValue;
        }
    }

    async function loadProfileData(user) {
        if (!user) return;
        try {
            const snapshot = await db.ref(`users/${user.uid}/profile`).once("value");
            const profileData = snapshot.val() || {};
            const permissions = getDiscordProfilePermissions(profileData.discordLink || null);

            if (displayNameInput) displayNameInput.value = profileData.displayName || "";
            if (pronounsInput) pronounsInput.value = profileData.pronouns || "";
            if (profileBioInput) {
                profileBioInput.value = profileData.bio || "";
                const counter = profileBioInput.closest(".setting-item")?.querySelector(".character-count");
                if (counter) counter.textContent = `${profileBioInput.value.length} / 150`;
            }
            if (profileBannerInput) {
                profileBannerInput.value = profileData.bannerUrl || "";
                profileBannerInput.dataset.storagePath = profileData.bannerPath || "";
                profileBannerInput.dataset.previousStoragePath = profileData.bannerPath || "";
            }
            if (profileBannerUrlInput) {
                profileBannerUrlInput.value = profileData.bannerUrl || "";
            }
            setProfileImageInputMode(inferProfileImageMode(profileData.bannerUrl || ""), {
                fileInput: profileBannerFileInput,
                urlInput: profileBannerUrlInput,
                uploadBtn: profileBannerModeUploadBtn,
                urlBtn: profileBannerModeUrlBtn
            });
            setProfileBannerPreview(profileData.bannerUrl || "");
            setProfileUploadStatus(profileBannerStatus, profileData.bannerUrl
                ? "Saved image ready."
                : getProfileModeHint(inferProfileImageMode(profileData.bannerUrl || ""), "banner"));
            const profilePrivacy = document.getElementById("profilePrivacy");
            if (profilePrivacy) {
                profilePrivacy.value = profileData.profilePrivacy || "public";
            }
            if (profileEffectsSelect) {
                profileEffectsSelect.value = normalizeProfileEffect(profileData.profileEffect);
            }
            updateProfileEffectPreview();
            selectedTeamTagsState = Array.isArray(profileData.teamTags)
                ? profileData.teamTags.map(normalizeTeamTag).filter(Boolean)
                : [];
            renderSelectedTeamTags();
            if (emailDisplay) emailDisplay.textContent = user.email;
        } catch (err) {
            console.error("Failed to load profile data:", err);
        }
    }

    async function saveTeamTags() {
        if (!currentUser) return alert("sign in first");

        try {
            await db.ref(`users/${currentUser.uid}/profile`).update({
                teamTags: selectedTeamTagsState,
                updatedAt: new Date().toISOString()
            });
            showCloudNote("team tags updated");
        } catch (err) {
            console.error("Failed to update team tags:", err);
            alert("couldn't update team tags");
        }
    }

    async function updateDisplayName() {
        if (!currentUser) return alert("sign in first");
        if (!displayNameInput?.value.trim()) return alert("enter a display name");

        try {
            await db.ref(`users/${currentUser.uid}/profile`).update({
                displayName: displayNameInput.value.trim(),
                updatedAt: new Date().toISOString()
            });
            showCloudNote("display name updated");
        } catch (err) {
            console.error("Failed to update display name:", err);
            alert("couldn't update display name");
        }
    }

    async function updateUsername() {
        if (!currentUser) return alert("sign in first");

        let currentUsername = "";
        try {
            const usernameSnapshot = await db.ref(`users/${currentUser.uid}/username`).once("value");
            currentUsername = String(
                usernameSnapshot.val() ||
                profileUsernameDisplay?.textContent ||
                currentUser.email?.split("@")[0] ||
                ""
            ).trim();
        } catch (err) {
            console.error("Failed to load current username:", err);
            return alert("couldn't load your current username");
        }

        const promptedUsername = typeof window.showInHousePrompt === "function"
            ? await window.showInHousePrompt(
                "Enter your new username:",
                currentUsername,
                "Change Username"
            )
            : window.prompt("Enter your new username:", currentUsername);

        if (promptedUsername === null) return;

        const nextUsername = String(promptedUsername || "").trim();
        const validationError = validateUsername(nextUsername);
        if (validationError) return alert(validationError);

        const currentLower = currentUsername.toLowerCase();
        const nextLower = nextUsername.toLowerCase();

        if (nextLower === currentLower && nextUsername === currentUsername) {
            showCloudNote("username unchanged");
            return;
        }

        if (nextLower !== currentLower) {
            const isAvailable = await checkUsernameAvailable(nextUsername);
            if (isAvailable === null) return alert("couldn't check usernames right now, try again");
            if (!isAvailable) return alert("username taken, pick another");
        }

        try {
            const updates = {};
            updates[`users/${currentUser.uid}/username`] = nextUsername;
            updates[`usernames/${currentUser.uid}`] = nextLower;
            updates[`users/${currentUser.uid}/updatedAt`] = new Date().toISOString();

            await db.ref().update(updates);

            if (profileUsernameDisplay) profileUsernameDisplay.textContent = nextUsername;
            if (statusEl) statusEl.textContent = `signed in as @${nextUsername}`;
            window.currentUsername = nextUsername;

            showCloudNote("username updated");
        } catch (err) {
            console.error("Failed to update username:", err);
            alert("couldn't update username");
        }
    }

    async function updatePronouns() {
        if (!currentUser) return alert("sign in first");

        try {
            await db.ref(`users/${currentUser.uid}/profile`).update({
                pronouns: pronounsInput?.value.trim() || "",
                updatedAt: new Date().toISOString()
            });
            showCloudNote("pronouns updated");
        } catch (err) {
            console.error("Failed to update pronouns:", err);
            alert("couldn't update pronouns");
        }
    }

    async function updateProfilePrivacy() {
        if (!currentUser) return alert("sign in first");
        const privacySelect = document.getElementById("profilePrivacy");
        if (!privacySelect) return;

        try {
            await db.ref(`users/${currentUser.uid}/profile`).update({
                profilePrivacy: privacySelect.value,
                updatedAt: new Date().toISOString()
            });
            showCloudNote("privacy settings updated");
        } catch (err) {
            console.error("Failed to update privacy settings:", err);
            alert("couldn't update privacy settings");
        }
    }

    const privacySelect = document.getElementById("profilePrivacy");
    if (privacySelect) {
        privacySelect.addEventListener("change", updateProfilePrivacy);
    }

    addTeamTagBtn?.addEventListener("click", () => {
        addTeamTagToSelection(customTeamTagInput?.value || teamTagSelect?.value || "");
        if (customTeamTagInput) customTeamTagInput.value = "";
        if (teamTagSelect) teamTagSelect.value = "";
    });

    customTeamTagInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addTeamTagToSelection(customTeamTagInput.value || "");
            customTeamTagInput.value = "";
        }
    });

    saveTeamTagsBtn?.addEventListener("click", saveTeamTags);

    populateTeamTagChoices();

    updateDisplayNameBtn?.addEventListener("click", updateDisplayName);
    updateUsernameBtn?.addEventListener("click", updateUsername);
    updatePronounsBtn?.addEventListener("click", updatePronouns);

    // Update email display when user logs in
    auth?.onAuthStateChanged((user) => {
        if (user && emailDisplay) {
            emailDisplay.textContent = user.email;
            loadProfileData(user);
        }
    });

    loginBtn?.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password) return alert("enter email and password");
        try {
            const result = await auth.signInWithEmailAndPassword(email, password);
            try {
                await result.user.reload();
            } catch (err) {
                console.warn("Failed to refresh auth user after sign-in:", err);
            }

            const refreshedUser = auth.currentUser || result.user;
            if (!refreshedUser.emailVerified && !isOwnerEmail(refreshedUser.email)) {
                showCloudNote("verify your email to unlock all features", true);
            } else {
                showCloudNote("signed in");
            }
        } catch (err) {
            alert(err.message || "couldn't sign in");
        }
    });

    signupBtn?.addEventListener("click", async () => {
        const email = isSignUpMode ? emailSignupInput?.value.trim() : emailInput.value.trim();
        const password = isSignUpMode ? passwordSignupInput?.value.trim() : passwordInput.value.trim();
        const username = isSignUpMode ? usernameInput?.value.trim() : null;
        
        if (!isSignUpMode) {
            toggleAuthMode();
            return;
        }

        if (!username || !email || !password) return alert("fill in all fields");
        if (password.length < 6) return alert("password needs at least 6 characters");
        
        const usernameError = validateUsername(username);
        if (usernameError) return alert(usernameError);
        
        const isAvailable = await checkUsernameAvailable(username);
        if (isAvailable === null) return alert("couldn't check usernames right now, try again");
        if (!isAvailable) return alert("username taken, pick another");
        
        try {
            const result = await auth.createUserWithEmailAndPassword(email, password);
            
            const isStaffEmail = STAFF_EMAILS.includes(email);
            
            if (!isStaffEmail) {
                await sendVerificationEmail(result.user);
            }
            
            await db.ref(`users/${result.user.uid}`).set({
                email: result.user.email,
                username: username,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });
            
            await db.ref(`usernames/${result.user.uid}`).set(username.toLowerCase());
            
            await db.ref(`users/${result.user.uid}/profile`).set({
                profilePicUrl: "image/queens/noimage.jpg",
                createdAt: new Date().toISOString()
            });
            
            // Auto-add staff member to database
            if (isStaffEmail) {
                await db.ref(`staff/${result.user.uid}`).set({
                    email: result.user.email,
                    addedBy: "system",
                    addedAt: new Date().toISOString(),
                    role: "owner"
                });
                showCloudNote("staff account created, you're all set");
            } else {
                showCloudNote("account created! check your email to verify");
            }
        } catch (err) {
            alert(err.message || "couldn't create account");
        }
    });

    toggleAuthModeUI?.addEventListener("click", (e) => {
        e.preventDefault();
        toggleAuthMode();
    });
    discordAuthBtn?.addEventListener("click", startDiscordSignIn);

    const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
    forgotPasswordBtn?.addEventListener("click", async (e) => {
        e.preventDefault();
        const email = (emailInput?.value || "").trim();
        const targetEmail = email || await window.showInHousePrompt("Enter your email address:", "", "Reset Password");
        if (!targetEmail) return;
        try {
            await auth.sendPasswordResetEmail(targetEmail);
            showCloudNote("password reset email sent, check your inbox");
            await window.showInHouseAlert(
                `Password reset email sent to ${targetEmail}.\n\nIf you don't see it, check spam/junk and wait a minute before trying again.`,
                "Reset Email Sent"
            );
        } catch (err) {
            const msg = err.code === "auth/user-not-found"
                ? "no account found with that email"
                : err.message || "couldn't send reset email";
            alert(msg);
        }
    });

    const performLogout = async () => {
        try {
            await auth.signOut();
            showCloudNote("signed out");
            cloudQueensList.innerHTML = "";
            setModalOpen(false);
            setAdminModalOpen(false);
        } catch (err) {
            alert("couldn't sign out");
        }
    };

    logoutBtn?.addEventListener("click", performLogout);
    
    const navLogoutBtn = document.getElementById("navLogoutBtn");
    navLogoutBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        performLogout();
    });

    resendVerifyBtn?.addEventListener("click", () => {
        if (currentUser) {
            sendVerificationEmail(currentUser);
        }
    });

    linkDiscordBtn?.addEventListener("click", startDiscordLinkFlow);
    relinkDiscordBtn?.addEventListener("click", startDiscordLinkFlow);
    unlinkDiscordBtn?.addEventListener("click", unlinkDiscordAccount);

    updateProfilePicBtn?.addEventListener("click", updateProfilePicture);
    bindProfileImageUploader(profilePicFileInput, profilePicInput, profilePicStatus, (url) => {
        if (profilePicDisplay) {
            profilePicDisplay.src = url || "image/queens/noimage.jpg";
        }
    }, {
        maxWidth: 512,
        maxHeight: 512,
        targetBytes: 350 * 1024,
        quality: 0.68,
        folder: "profile-pictures",
        label: "profile-picture",
        allowCrop: true,
        cropAspectRatio: 1,
        cropMessage: "Pick the part of the profile picture you want to use.",
        urlInput: profilePicUrlInput
    });

    profilePicModeUploadBtn?.addEventListener("click", () => {
        setProfileImageInputMode("upload", {
            fileInput: profilePicFileInput,
            urlInput: profilePicUrlInput,
            uploadBtn: profilePicModeUploadBtn,
            urlBtn: profilePicModeUrlBtn
        });
        setProfileUploadStatus(
            profilePicStatus,
            profilePicInput?.value.trim()
                ? "Saved image ready."
                : getProfileModeHint("upload", "image")
        );
    });

    profilePicModeUrlBtn?.addEventListener("click", () => {
        setProfileImageInputMode("url", {
            fileInput: profilePicFileInput,
            urlInput: profilePicUrlInput,
            uploadBtn: profilePicModeUploadBtn,
            urlBtn: profilePicModeUrlBtn
        });
        setProfileUploadStatus(
            profilePicStatus,
            profilePicInput?.value.trim()
                ? "URL image ready. Click Save Picture to apply."
                : getProfileModeHint("url", "image")
        );
    });

    profilePicUrlInput?.addEventListener("input", () => {
        const url = profilePicUrlInput.value.trim();
        const stagedPath = String(profilePicInput?.dataset.storagePath || "").trim();
        const previousSavedPath = String(profilePicInput?.dataset.previousStoragePath || "").trim();
        if (storage && stagedPath && stagedPath !== previousSavedPath) {
            storage.ref().child(stagedPath).delete().catch((cleanupErr) => {
                if (cleanupErr?.code !== "storage/object-not-found") {
                    console.warn("Failed to remove staged profile image after URL switch:", cleanupErr);
                }
            });
        }
        if (profilePicInput) {
            profilePicInput.value = url;
            profilePicInput.dataset.storagePath = "";
        }
        if (profilePicDisplay) {
            profilePicDisplay.src = url || "image/queens/noimage.jpg";
        }
        setProfileUploadStatus(profilePicStatus, url
            ? "URL image ready. Click Save Picture to apply."
            : getProfileModeHint("url", "image"));
    });

    setProfileImageInputMode("upload", {
        fileInput: profilePicFileInput,
        urlInput: profilePicUrlInput,
        uploadBtn: profilePicModeUploadBtn,
        urlBtn: profilePicModeUrlBtn
    });
    setProfileUploadStatus(
        profilePicStatus,
        profilePicInput?.value.trim()
            ? "Saved image ready."
            : getProfileModeHint(inferProfileImageMode(profilePicUrlInput?.value || ""), "image")
    );

    uploadQueenBtn?.addEventListener("click", uploadQueenToCloud);
    refreshCloudQueensBtn?.addEventListener("click", loadCloudQueens);

    addStaffBtn?.addEventListener("click", () => {
        const email = addStaffEmail?.value.trim();
        if (email) {
            addStaffMember(email);
        }
    });


    usersSearchBtn?.addEventListener("click", () => {
        loadUsersList(usersSearchInput?.value || "", 0);
    });
    usersSearchClearBtn?.addEventListener("click", () => {
        if (usersSearchInput) usersSearchInput.value = "";
        loadUsersList("", 0);
    });
    usersSearchInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadUsersList(usersSearchInput.value || "", 0);
        }
    });
    document.getElementById("usersPagePrev")?.addEventListener("click", () => {
        loadUsersList(usersSearchInput?.value || "", usersPageIndex - 1);
    });
    document.getElementById("usersPageNext")?.addEventListener("click", () => {
        loadUsersList(usersSearchInput?.value || "", usersPageIndex + 1);
    });
    document.getElementById("usersPageSize")?.addEventListener("change", () => {
        loadUsersList(usersSearchInput?.value || "", 0);
    });

    refreshSecurityLogsBtn?.addEventListener("click", loadSecurityLogs);

    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".security-sub-tab-btn");
        if (!btn) return;
        const tab = btn.getAttribute("data-security-tab") || "role-denied";
        switchSecuritySubTab(tab);
    });

    adminTabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const tab = button.getAttribute("data-admin-tab") || "overview";
            switchAdminTab(tab);
        });
    });

    function openSupportComposer(kind, targetUid = "") {
        if (!currentUser) return void window.showInHouseAlert("Sign in to submit a report.", "Sign in required");
        const appeal = kind === "appeals";
        const popup = document.createElement("div");
        popup.className = "history-save-modal active support-composer";
        popup.innerHTML = `<form class="history-save-modal-card generate-cast-card" role="dialog" aria-modal="true" aria-label="${appeal ? "Appeal your ban" : "Report an account"}">
            <h3>${appeal ? "Appeal your ban" : "Report an account"}</h3>
            <p>Staff will review your submission. Do not include passwords, tokens or other private credentials.</p>
            ${appeal ? "" : `<label>Exact username or user ID<input name="targetUid" required maxlength="128" value="${escapeAdminText(targetUid)}"></label>`}
            <label>${appeal ? "Why should your ban be reconsidered?" : "What happened?"}<textarea name="message" required minlength="10" maxlength="2000" rows="5"></textarea></label>
            <p role="status" data-support-status></p>
            <div class="generate-cast-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Submit</button></div>
        </form>`;
        document.body.appendChild(popup);
        const previousFocus = document.activeElement;
        if (typeof activateCenteredPopup === "function") activateCenteredPopup(popup);
        const close = () => {
            if (typeof deactivateCenteredPopup === "function") deactivateCenteredPopup(popup);
            popup.remove();
            previousFocus?.focus();
        };
        popup.querySelector("[data-cancel]").addEventListener("click", close);
        popup.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } });
        const form = popup.querySelector("form");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const button = form.querySelector('[type="submit"]');
            button.disabled = true;
            try {
                await callAdminApi("submitCase", {
                    kind, targetUid: form.elements.targetUid?.value.trim(),
                    message: form.elements.message.value.trim()
                }, "accountSupportApi");
                close();
                await window.showInHouseAlert("Submitted. Check My reports & appeals for the outcome.", "Thank you");
            } catch (err) {
                console.error("Support submission failed:", err.code || err);
                popup.querySelector("[data-support-status]").textContent = getAdminApiErrorMessage(err);
            } finally {
                button.disabled = false;
            }
        });
        form.querySelector("input, textarea")?.focus();
    }

    async function showMyCases() {
        try {
            const result = await callAdminApi("myCases", {}, "accountSupportApi");
            const text = result.rows.map((row) => `${row.kind === "gifts" ? `Gift ticket ${row.id}` : row.kind === "appeals" ? "Appeal" : "Report"} · ${new Date(row.createdAt).toLocaleDateString()} · ${row.status}${row.response ? `\nStaff response: ${row.response}` : ""}`).join("\n\n");
            await window.showInHouseAlert(text || "You haven't submitted any reports, appeals or gifts.", "My reports, appeals & gifts");
        } catch (err) {
            console.error("Failed to load own cases:", err.code || err);
            await window.showInHouseAlert(getAdminApiErrorMessage(err), "Couldn't load submissions");
        }
    }
    document.getElementById("reportAccountBtn")?.addEventListener("click", () => openSupportComposer("reports"));
    document.getElementById("profileReportBtn")?.addEventListener("click", (event) => openSupportComposer("reports", event.currentTarget.dataset.uid));
    document.getElementById("myCasesBtn")?.addEventListener("click", showMyCases);

    let caseCursors = [null];
    let casePage = 0;
    let caseRequest = 0;
    async function loadCases(reset = false) {
        const host = document.getElementById("adminCasesList");
        if (!isStaff || !host) return;
        if (reset) { caseCursors = [null]; casePage = 0; }
        const request = ++caseRequest;
        const pageIndex = casePage;
        const kind = document.getElementById("adminCaseKind").value;
        renderAdminSkeleton(host, "cards", 3);
        try {
            const result = await callAdminApi("listCases", { kind, cursor: caseCursors[pageIndex] });
            if (request !== caseRequest || !isStaff) return;
            host.replaceChildren();
            caseCursors[pageIndex + 1] = result.nextCursor;
            if (!result.rows.length) renderAdminEmpty(host, "fa-inbox", "Queue is empty", "New submissions will appear here.");
            for (const item of result.rows) {
                const card = document.createElement("article");
                card.className = "admin-case-card";
                const closed = !["open", "assigned", "resolving"].includes(item.status);
                const ownAssignment = !item.assignedUid || item.assignedUid === currentUser.uid;
                card.innerHTML = `<h4>${kind === "gifts" ? "Gift ticket" : kind === "appeals" ? "Ban appeal" : "User report"} <span class="admin-chip">${escapeAdminText(item.status)}</span></h4>
                    ${kind === "gifts" ? `<p>Ticket: ${escapeAdminText(item.id)} · Discord alert: ${escapeAdminText(item.notification || "pending")}</p>` : ""}
                    <p>Account: <button type="button" class="admin-link-button" data-case-account>${escapeAdminText(item.targetUid)}</button></p>
                    <p>Submitted by ${escapeAdminText(item.reporterUid)} · ${escapeAdminText(new Date(item.createdAt).toLocaleString())}</p>
                    <p class="admin-case-message">${escapeAdminText(item.message)}</p>
                    <p>Assigned to: ${escapeAdminText(item.assignedUid || "Nobody")}</p>
                    ${item.response ? `<p>Staff response: ${escapeAdminText(item.response)}</p>` : ""}
                    ${!closed && ownAssignment ? `<label>Response to submitter<textarea data-case-response maxlength="1000" rows="3">${escapeAdminText(item.pendingResponse || "")}</textarea></label><div class="admin-case-actions">
                        ${item.status === "resolving" ? `<button type="button" data-decision="${escapeAdminText(item.pendingDecision)}">Retry interrupted action</button>` : `<button type="button" data-decision="${item.assignedUid ? "unassign" : "assign"}">${item.assignedUid ? "Unassign me" : "Assign to me"}</button>
                        ${kind === "appeals" ? '<button type="button" data-decision="accepted">Accept &amp; unban</button><button type="button" data-decision="rejected">Reject</button>' : '<button type="button" data-decision="resolved">Resolve</button><button type="button" data-decision="dismissed">Dismiss</button>'}`}
                    </div>` : ""}`;
                card.querySelector("[data-case-account]").addEventListener("click", () => { switchAdminTab("users"); void openAdminAccountDetail(item.targetUid); });
                card.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", async () => {
                    const decision = button.dataset.decision;
                    if (!(await ensureAdminElevation("manage this case"))) return;
                    if (decision === "accepted" && !(await window.showInHouseConfirm("Accept this appeal and remove the matching ban? A newer ban will not be removed.", "Accept appeal"))) return;
                    card.querySelectorAll("button").forEach((el) => { el.disabled = true; });
                    try {
                        await callAdminApi("updateCase", { kind, id: item.id, decision, response: card.querySelector("[data-case-response]").value });
                        showAdminToast("Case updated.");
                        await loadCases();
                    } catch (err) {
                        console.error("Case update failed:", err.code || err);
                        showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
                        card.querySelectorAll("button").forEach((el) => { el.disabled = false; });
                    }
                }));
                host.appendChild(card);
            }
            document.getElementById("adminCasesPrev").disabled = pageIndex === 0;
            document.getElementById("adminCasesNext").disabled = !result.nextCursor;
        } catch (err) {
            if (request !== caseRequest) return;
            console.error("Case queue failed:", err.code || err);
            renderAdminEmpty(host, "fa-triangle-exclamation", "Couldn't load cases", getAdminApiErrorMessage(err), "danger");
        }
    }
    document.getElementById("adminCaseKind")?.addEventListener("change", () => void loadCases(true));
    document.getElementById("adminCasesRefresh")?.addEventListener("click", () => void loadCases(true));
    document.getElementById("adminCasesPrev")?.addEventListener("click", () => { casePage = Math.max(0, casePage - 1); void loadCases(); });
    document.getElementById("adminCasesNext")?.addEventListener("click", () => { casePage += 1; void loadCases(); });

    async function loadPerformanceDashboard() {
        const host = document.getElementById("adminPerformanceList");
        if (!hasAdminRole() || !host) return;
        renderAdminSkeleton(host, "cards", 3);
        try {
            const result = await callAdminApi("performanceOverview");
            if (!hasAdminRole()) return;
            host.replaceChildren();
            if (!result.rows.length) return renderAdminEmpty(host, "fa-gauge-high", "No samples yet", "Samples appear after signed-in sponsor visitors use the updated site.");
            for (const row of result.rows) {
                const card = document.createElement("article");
                card.className = "admin-case-card";
                const errors = Object.entries(row.errors || {}).map(([type, count]) => `${type}: ${count}`).join(" · ") || "None reported";
                card.innerHTML = `<h4>${escapeAdminText(row.page)} · ${escapeAdminText(row.device)} · ${escapeAdminText(row.browser)}</h4>
                    <p>${row.samples} sampled visits · ${Number(row.days) || 1} days represented</p>
                    <p>Load P95: ${row.loadP95 ? `≤ ${row.loadP95 / 1000}s` : "Unavailable"} · LCP P95: ${row.lcpP95 ? `≤ ${row.lcpP95 / 1000}s` : "Unavailable"}</p>
                    <p>Long tasks: ${row.longTasks} (${Math.round(row.longTaskMs)}ms total), measured on ${row.longTaskSamples} visits</p>
                    <p>Error categories: ${escapeAdminText(errors)}</p>`;
                host.appendChild(card);
            }
        } catch (err) {
            console.error("Performance dashboard failed:", err.code || err);
            renderAdminEmpty(host, "fa-triangle-exclamation", "Couldn't load performance", getAdminApiErrorMessage(err), "danger");
        }
    }
    document.getElementById("adminPerformanceRefresh")?.addEventListener("click", loadPerformanceDashboard);

    startPerformanceMonitoring();
    function startPerformanceMonitoring() {
        const optOutKey = "ss.performance.optOut";
        const checkbox = document.getElementById("performanceOptOut");
        let optedOut;
        try { optedOut = localStorage.getItem(optOutKey) === "1"; } catch (err) {
            console.warn("Optional performance tracking disabled: storage unavailable", err.name);
            return;
        }
        const observers = [];
        let timer;
        const stop = () => {
            window.clearTimeout(timer);
            observers.forEach((observer) => observer.disconnect());
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
        checkbox?.addEventListener("change", () => {
            optedOut = checkbox.checked;
            try { localStorage.setItem(optOutKey, optedOut ? "1" : "0"); } catch (err) {
                console.warn("Couldn't save performance preference", err.name);
                showCloudNote("Couldn't save your tracking preference on this device.", true);
            }
            if (optedOut) stop();
        });
        if (checkbox) checkbox.checked = optedOut;
        if (optedOut || navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true || Math.random() >= 0.2) return;
        const errors = {};
        let longTasks = 0;
        let longTaskMs = 0;
        let lcp = 0;
        const supported = typeof PerformanceObserver !== "undefined" ? PerformanceObserver.supportedEntryTypes || [] : [];
        for (const type of ["longtask", "largest-contentful-paint"]) {
            if (!supported.includes(type)) continue;
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (type === "longtask") { longTasks += 1; longTaskMs += entry.duration; }
                    else lcp = entry.startTime;
                }
            });
            observer.observe({ type, buffered: true });
            observers.push(observer);
        }
        function count(type) { errors[type] = Math.min(100, (errors[type] || 0) + 1); }
        function onError(event) {
            const name = event.error?.name;
            count(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError"].includes(name) ? name : "ScriptError");
        }
        function onRejection() { count("UnhandledRejection"); }
        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        timer = window.setTimeout(async () => {
            stop();
            if (!currentUser || optedOut) return;
            const navigation = performance.getEntriesByType("navigation")[0];
            const ua = navigator.userAgent;
            const browser = /Edg\//.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Other";
            try {
                await callAdminApi("performance", {
                    page: location.pathname.split("/").pop() || "index.html",
                    device: /iPad|Tablet/.test(ua) ? "tablet" : /Mobi|Android|iPhone/.test(ua) ? "mobile" : "desktop",
                    browser, load: navigation?.loadEventEnd || 0, lcp, longTasks, longTaskMs,
                    longTasksSupported: supported.includes("longtask"), errors
                }, "accountSupportApi");
            } catch (err) {
                console.warn("Optional performance sample failed:", err.code || err.name);
            }
        }, 60000);
    }

    // ---- Admin deep links: #admin=<tab>[/<uid>] ----
    const ADMIN_TAB_ALIASES = {
        overview: "overview", accounts: "users", users: "users", reviews: "reviews", security: "security",
        logs: "moderation", moderation: "moderation", system: "announcements", announcements: "announcements", staff: "staff",
        cases: "cases", performance: "performance"
    };
    const ADMIN_TAB_SLUGS = { users: "accounts", moderation: "logs", announcements: "system" };

    function parseAdminHash() {
        const match = /^#admin(?:=([a-z]+)(?:\/([A-Za-z0-9_-]{1,128}))?)?$/.exec(window.location.hash || "");
        if (!match) return null;
        const tab = ADMIN_TAB_ALIASES[match[1] || "overview"] || "overview";
        return { tab, uid: tab === "users" ? (match[2] || null) : null };
    }

    function syncAdminHash() {
        if (!adminModal?.classList.contains("active") || !isStaff) return;
        const tab = document.querySelector(".admin-tab-btn.active")?.getAttribute("data-admin-tab") || "overview";
        const slug = ADMIN_TAB_SLUGS[tab] || tab;
        const next = `#admin=${slug}${tab === "users" && adminDetailUid ? `/${adminDetailUid}` : ""}`;
        if (window.location.hash !== next) history.replaceState(null, "", next);
    }

    function routeAdminHash() {
        const route = parseAdminHash();
        if (!route || !isStaff) return;
        if (!adminModal?.classList.contains("active")) {
            setAdminModalOpen(true);
            return;
        }
        if (route.uid) {
            if (route.uid !== adminDetailUid) openAdminAccountFromAnywhere(route.uid);
        } else {
            if (adminDetailUid && route.tab === "users") closeAdminAccountDetail();
            switchAdminTab(route.tab);
        }
    }

    window.addEventListener("hashchange", routeAdminHash);
    let adminHashRouted = false;
    const routeAdminHashWhenStaff = () => {
        if (adminHashRouted || !isStaff) return;
        adminHashRouted = true;
        routeAdminHash();
    };

    // ---- Admin keyboard shortcuts ----
    function toggleAdminShortcutsHelp(show) {
        const help = document.getElementById("adminShortcutsHelp");
        if (!help) return;
        const next = typeof show === "boolean" ? show : help.hidden;
        help.hidden = !next;
        document.getElementById("adminShortcutsBtn")?.setAttribute("aria-expanded", String(next));
        if (next) document.getElementById("adminShortcutsClose")?.focus();
    }

    function getAdminCards() {
        const panel = document.querySelector(".admin-tab-panel.active");
        if (!panel) return [];
        return Array.from(panel.querySelectorAll(".user-card, .admin-review-card, .moderation-log-card, .security-log-card"))
            .filter((card) => card.offsetParent !== null);
    }

    function moveAdminCardFocus(step) {
        const cards = getAdminCards();
        if (!cards.length) return;
        const current = cards.findIndex((card) => card.classList.contains("is-kbd-focus"));
        const next = cards[Math.min(cards.length - 1, Math.max(0, current + step))];
        cards.forEach((card) => card.classList.remove("is-kbd-focus"));
        next.classList.add("is-kbd-focus");
        if (!next.hasAttribute("tabindex")) next.tabIndex = -1;
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest" });
    }

    document.addEventListener("keydown", (event) => {
        if (!adminModal?.classList.contains("active") || !isStaff) return;
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        if (document.querySelector(".history-save-modal.active")) return;
        const target = event.target;
        const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        if (event.key === "Escape") {
            const help = document.getElementById("adminShortcutsHelp");
            if (help && !help.hidden) {
                event.stopImmediatePropagation();
                toggleAdminShortcutsHelp(false);
                document.getElementById("adminShortcutsBtn")?.focus();
                return;
            }
            if (typing && target.value) return;
            if (adminDetailUid && document.querySelector(".admin-tab-panel.active")?.getAttribute("data-admin-panel") === "users") {
                event.stopImmediatePropagation();
                closeAdminAccountDetail();
                usersList?.querySelector(`.user-card[data-uid="${CSS.escape(String(adminDetailUid || ""))}"]`)?.focus();
            }
            return;
        }
        if (typing) return;
        if (event.key === "/") {
            event.preventDefault();
            document.getElementById("adminGlobalSearch")?.focus();
            return;
        }
        if (event.key === "?") {
            event.preventDefault();
            toggleAdminShortcutsHelp();
            return;
        }
        if (/^[1-7]$/.test(event.key)) {
            const tabs = Array.from(adminTabButtons).filter((button) => !button.hidden);
            const button = tabs[Number(event.key) - 1];
            if (button) {
                event.preventDefault();
                switchAdminTab(button.getAttribute("data-admin-tab"));
                button.focus();
            }
            return;
        }
        if (event.key === "j" || event.key === "k") {
            event.preventDefault();
            moveAdminCardFocus(event.key === "j" ? 1 : -1);
            return;
        }
        const focused = target instanceof HTMLElement ? target.closest(".is-kbd-focus") : null;
        if (!focused) return;
        if (event.key === "x") {
            const box = focused.querySelector(".admin-select-box");
            if (box) {
                event.preventDefault();
                box.checked = !box.checked;
                box.dispatchEvent(new Event("change"));
            }
        } else if (event.key === "Enter" && target === focused) {
            event.preventDefault();
            focused.querySelector("[data-card-primary]")?.click();
        }
    }, true);

    document.getElementById("adminShortcutsBtn")?.addEventListener("click", () => toggleAdminShortcutsHelp());
    document.getElementById("adminShortcutsClose")?.addEventListener("click", () => {
        toggleAdminShortcutsHelp(false);
        document.getElementById("adminShortcutsBtn")?.focus();
    });
    document.getElementById("adminElevationStatus")?.addEventListener("click", async () => {
        if (adminElevationExpiresAt > Date.now()) {
            showAdminToast(`Sensitive actions are unlocked for ${Math.max(1, Math.ceil((adminElevationExpiresAt - Date.now()) / 60000))} more minutes.`);
            return;
        }
        if (await ensureAdminElevation("unlock sensitive actions")) showAdminToast("Unlocked for 15 minutes.");
    });

    // ---- Discord alerts (System) ----
    let alertConfigConfigured = false;
    let alertConfigBusy = false;

    function updateAlertControls() {
        const form = document.getElementById("adminAlertsForm");
        const webhook = document.getElementById("adminAlertsWebhook");
        if (!form) return;
        form.querySelectorAll("input, button").forEach((control) => { control.disabled = alertConfigBusy; });
        const test = document.getElementById("adminAlertsTest");
        if (test) test.disabled = alertConfigBusy || (!alertConfigConfigured && !String(webhook?.value || "").trim());
        const remove = document.getElementById("adminAlertsRemove");
        if (remove) remove.hidden = !alertConfigConfigured;
    }

    function applyAlertConfig(config) {
        const form = document.getElementById("adminAlertsForm");
        if (!form) return;
        alertConfigConfigured = config.configured === true;
        form.querySelectorAll('input[name="alertEvent"]').forEach((box) => { box.checked = config.events?.[box.value] !== false; });
        const spike = document.getElementById("adminAlertsSpike");
        if (spike) spike.value = String(config.signupSpikeThreshold || 15);
        const giftRole = document.getElementById("adminGiftModeratorRole");
        if (giftRole) giftRole.value = config.giftModeratorRoleId || "";
        const webhook = document.getElementById("adminAlertsWebhook");
        if (webhook) {
            webhook.value = "";
            webhook.placeholder = config.configured ? `Webhook saved (ends ${config.webhookHint}). Paste a new one to replace it.` : "https://discord.com/api/webhooks/...";
        }
        const status = document.getElementById("adminAlertsStatus");
        if (status) {
            status.textContent = config.configured
                ? `Alerts are on.${config.updatedBy ? ` Last changed by ${config.updatedBy}${config.updatedAt ? ` ${formatRelativeTime(config.updatedAt)}` : ""}.` : ""}`
                : "No webhook yet. Add one to get alerts in Discord.";
        }
        updateAlertControls();
    }

    async function loadAlertConfig() {
        const form = document.getElementById("adminAlertsForm");
        const status = document.getElementById("adminAlertsStatus");
        if (!form || !hasAdminRole() || alertConfigBusy) return;
        alertConfigBusy = true;
        updateAlertControls();
        if (status) status.textContent = "Loading alert settings...";
        try {
            applyAlertConfig(await callAdminApi("getAlertConfig"));
        } catch (err) {
            if (status) status.textContent = err?.code === "admin-api-unavailable"
                ? "Deploy the adminApi function to turn on Discord alerts."
                : getAdminApiErrorMessage(err);
        } finally {
            alertConfigBusy = false;
            updateAlertControls();
        }
    }

    async function saveAlertConfig(removeWebhook = false) {
        const form = document.getElementById("adminAlertsForm");
        if (!form || !hasAdminRole() || alertConfigBusy) return false;
        const webhook = document.getElementById("adminAlertsWebhook");
        const url = removeWebhook ? "" : String(webhook?.value || "").trim();
        let invalidWebhook = false;
        alertConfigBusy = true;
        updateAlertControls();
        try {
            if (removeWebhook && !(await window.showInHouseConfirm("Remove the Discord webhook? Alerts will stop.", "Remove webhook"))) return false;
            if (!(await ensureAdminElevation("change Discord alerts"))) return false;
            const events = Object.fromEntries(Array.from(form.querySelectorAll('input[name="alertEvent"]')).map((box) => [box.value, box.checked]));
            const payload = { events, signupSpikeThreshold: Number(document.getElementById("adminAlertsSpike")?.value) || 15 };
            payload.giftModeratorRoleId = String(document.getElementById("adminGiftModeratorRole")?.value || "").trim();
            if (url || removeWebhook) payload.webhookUrl = url;
            applyAlertConfig(await callAdminApi("setAlertConfig", payload));
            showAdminToast(removeWebhook ? "Webhook removed." : "Alert settings saved.");
            return true;
        } catch (err) {
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
            invalidWebhook = err?.code === "invalid-webhook";
            return false;
        } finally {
            alertConfigBusy = false;
            updateAlertControls();
            if (invalidWebhook) webhook?.focus();
        }
    }

    document.getElementById("adminAlertsForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveAlertConfig(false);
    });
    document.getElementById("adminAlertsRemove")?.addEventListener("click", () => void saveAlertConfig(true));
    document.getElementById("adminAlertsWebhook")?.addEventListener("input", updateAlertControls);
    document.getElementById("adminAlertsTest")?.addEventListener("click", async () => {
        if (!hasAdminRole() || alertConfigBusy) return;
        const url = String(document.getElementById("adminAlertsWebhook")?.value || "").trim();
        if (url && !(await saveAlertConfig(false))) return;
        alertConfigBusy = true;
        updateAlertControls();
        try {
            await callAdminApi("testAlert");
            showAdminToast("Test alert sent. Check your Discord channel.");
        } catch (err) {
            showAdminToast(getAdminApiErrorMessage(err), { tone: "danger" });
        } finally {
            alertConfigBusy = false;
            updateAlertControls();
        }
    });
    updateAlertControls();

    // ---- Accounts filters, selection and bulk actions ----
    ["usersStatusFilter", "usersSort"].forEach((id) => {
        document.getElementById(id)?.addEventListener("change", () => loadUsersList(usersSearchInput?.value || "", 0));
    });
    document.getElementById("usersSelectAll")?.addEventListener("change", (event) => {
        usersList?.querySelectorAll(".admin-select-box").forEach((box) => {
            if (box.checked !== event.currentTarget.checked) {
                box.checked = event.currentTarget.checked;
                box.dispatchEvent(new Event("change"));
            }
        });
    });
    document.getElementById("usersBulkUnban")?.addEventListener("click", bulkUnbanSelected);
    document.getElementById("usersBulkVerify")?.addEventListener("click", bulkVerifySelected);
    document.getElementById("usersBulkExport")?.addEventListener("click", () => exportAccountsCsv(true));
    document.getElementById("usersBulkClear")?.addEventListener("click", clearUsersSelection);
    document.getElementById("usersExportCsv")?.addEventListener("click", () => exportAccountsCsv(false));

    auth.onAuthStateChanged(user => {
        updateAuthUi(user);
        void completePendingDiscordSignIn();
    });

    updateAuthUi(auth.currentUser);
    setCloudButtonsEnabled(false);

    // Profile Functions
    const profileBannerInput = document.getElementById("profileBannerInput");
    const profileBannerUrlInput = document.getElementById("profileBannerUrlInput");
    const profileBannerFileInput = document.getElementById("profileBannerFileInput");
    const profileBannerModeUploadBtn = document.getElementById("profileBannerModeUploadBtn");
    const profileBannerModeUrlBtn = document.getElementById("profileBannerModeUrlBtn");
    const profileBannerStatus = document.getElementById("profileBannerStatus");
    const profileBannerDisplay = document.getElementById("profileBannerDisplay");
    const updateProfileBannerBtn = document.getElementById("updateProfileBannerBtn");
    const updateProfileBioBtn = document.getElementById("updateProfileBioBtn");
    const profileEffectsSelect = document.getElementById("profileEffectsSelect");
    const profileEffectPreview = document.getElementById("profileEffectPreview");
    const profileEffectPreviewFrame = document.getElementById("profileEffectPreviewFrame");
    const updateProfileEffectsBtn = document.getElementById("updateProfileEffectsBtn");
    const viewMyProfileBtn = document.getElementById("viewMyProfileBtn");
    const profileViewModal = document.getElementById("profileViewModal");
    const profileViewClose = document.getElementById("profileViewClose");

    function updateProfileEffectPreview() {
        const effect = normalizeProfileEffect(profileEffectsSelect?.value);
        if (profileEffectPreview && profilePicDisplay?.src) {
            profileEffectPreview.src = profilePicDisplay.src;
        }
        applyProfileEffect(profileEffectPreview, effect);
        applyProfileEffect(profileEffectPreviewFrame, effect);
    }

    profileEffectsSelect?.addEventListener("change", updateProfileEffectPreview);
    profilePicDisplay?.addEventListener("load", updateProfileEffectPreview);
    updateProfileEffectPreview();

    bindProfileImageUploader(profileBannerFileInput, profileBannerInput, profileBannerStatus, setProfileBannerPreview, {
        maxWidth: 1600,
        maxHeight: 900,
        targetBytes: 700 * 1024,
        quality: 0.82,
        folder: "profile-banners",
        label: "profile-banner",
        allowCrop: true,
        cropAspectRatio: 16 / 5,
        cropMessage: "Choose the part of the banner you want to show.",
        urlInput: profileBannerUrlInput
    });

    profileBannerModeUploadBtn?.addEventListener("click", () => {
        setProfileImageInputMode("upload", {
            fileInput: profileBannerFileInput,
            urlInput: profileBannerUrlInput,
            uploadBtn: profileBannerModeUploadBtn,
            urlBtn: profileBannerModeUrlBtn
        });
        setProfileUploadStatus(
            profileBannerStatus,
            profileBannerInput?.value.trim()
                ? "Saved image ready."
                : getProfileModeHint("upload", "banner")
        );
    });

    profileBannerModeUrlBtn?.addEventListener("click", () => {
        setProfileImageInputMode("url", {
            fileInput: profileBannerFileInput,
            urlInput: profileBannerUrlInput,
            uploadBtn: profileBannerModeUploadBtn,
            urlBtn: profileBannerModeUrlBtn
        });
        setProfileUploadStatus(
            profileBannerStatus,
            profileBannerInput?.value.trim()
                ? "URL image ready. Click Save Banner to apply."
                : getProfileModeHint("url", "banner")
        );
    });

    profileBannerUrlInput?.addEventListener("input", () => {
        const url = profileBannerUrlInput.value.trim();
        const stagedPath = String(profileBannerInput?.dataset.storagePath || "").trim();
        const previousSavedPath = String(profileBannerInput?.dataset.previousStoragePath || "").trim();
        if (storage && stagedPath && stagedPath !== previousSavedPath) {
            storage.ref().child(stagedPath).delete().catch((cleanupErr) => {
                if (cleanupErr?.code !== "storage/object-not-found") {
                    console.warn("Failed to remove staged profile banner after URL switch:", cleanupErr);
                }
            });
        }
        if (profileBannerInput) {
            profileBannerInput.value = url;
            profileBannerInput.dataset.storagePath = "";
        }
        setProfileBannerPreview(url);
        setProfileUploadStatus(profileBannerStatus, url
            ? "URL image ready. Click Save Banner to apply."
            : getProfileModeHint("url", "banner"));
    });

    setProfileImageInputMode("upload", {
        fileInput: profileBannerFileInput,
        urlInput: profileBannerUrlInput,
        uploadBtn: profileBannerModeUploadBtn,
        urlBtn: profileBannerModeUrlBtn
    });
    setProfileUploadStatus(
        profileBannerStatus,
        profileBannerInput?.value.trim()
            ? "Saved image ready."
            : getProfileModeHint(inferProfileImageMode(profileBannerUrlInput?.value || ""), "banner")
    );

    if (updateProfileBannerBtn) {
        updateProfileBannerBtn.addEventListener("click", async () => {
            if (!currentUser) return alert("sign in first");
            const linkData = await loadDiscordLink(currentUser);
            const permissions = getDiscordProfilePermissions(linkData);
            if (!permissions.canUseBanner) {
                return alert("Only superstars and hyperstars can use profile banners.");
            }
            const bannerUrl = profileBannerInput?.value.trim() || "";
            const bannerPath = profileBannerInput?.dataset.storagePath || "";
            const previousBannerPath = profileBannerInput?.dataset.previousStoragePath || "";
            try {
                await db.ref(`users/${currentUser.uid}/profile`).update({
                    bannerUrl: bannerUrl,
                    bannerPath: bannerPath || null,
                    updatedAt: new Date().toISOString()
                });
                setProfileBannerPreview(bannerUrl);
                if (storage && previousBannerPath && previousBannerPath !== bannerPath) {
                    storage.ref().child(previousBannerPath).delete().catch((cleanupErr) => {
                        console.warn("Failed to remove previous profile banner:", cleanupErr);
                    });
                }
                if (profileBannerInput) {
                    profileBannerInput.dataset.previousStoragePath = bannerPath;
                }
                setProfileUploadStatus(profileBannerStatus, bannerUrl
                    ? "Saved image ready."
                    : getProfileModeHint(inferProfileImageMode(profileBannerUrlInput?.value || ""), "banner"));
                showCloudNote("banner updated");
            } catch (err) {
                console.error("Failed to update banner:", err);
                alert("couldn't update banner");
            }
        });
    }

    if (updateProfileBioBtn) {
        updateProfileBioBtn.addEventListener("click", async () => {
            if (!currentUser) return alert("sign in first");
            const linkData = await loadDiscordLink(currentUser);
            const permissions = getDiscordProfilePermissions(linkData);
            const rawBio = (profileBioInput?.value || "").trim();
            const preparedBio = permissions.canUseRichBio
                ? sanitizeRichBioHtml(rawBio).substring(0, 1000)
                : stripHtmlTags(rawBio).substring(0, 150);
            try {
                await db.ref(`users/${currentUser.uid}/profile`).update({
                    bio: preparedBio,
                    updatedAt: new Date().toISOString()
                });
                if (!permissions.canUseRichBio && rawBio !== preparedBio) {
                    showCloudNote("bio updated (HTML/styling requires Superstar/Hyperstar role)", true);
                } else {
                    showCloudNote("bio updated");
                }
            } catch (err) {
                console.error("Failed to update bio:", err);
                alert("couldn't update bio");
            }
        });
    }

    if (updateProfileEffectsBtn) {
        updateProfileEffectsBtn.addEventListener("click", async () => {
            if (!currentUser) return alert("sign in first");
            const effect = normalizeProfileEffect(profileEffectsSelect?.value);
            try {
                await db.ref(`users/${currentUser.uid}/profile`).update({
                    profileEffect: effect,
                    updatedAt: new Date().toISOString()
                });
                showCloudNote("effect applied");
            } catch (err) {
                console.error("Failed to update effect:", err);
                alert("couldn't apply effect");
            }
        });
    }

    if (viewMyProfileBtn) {
        viewMyProfileBtn.addEventListener("click", () => {
            if (currentUser) {
                displayProfileView(currentUser.uid);
            }
        });
    }

    if (profileViewClose) {
        profileViewClose.addEventListener("click", () => {
            closeAccountPopup(profileViewModal);
            unlockBodyScroll();
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === profileViewModal) {
            closeAccountPopup(profileViewModal);
            unlockBodyScroll();
        }
    });

    accountUiBound = true;
}

async function displayProfileView(uid) {
    const db = window.accountDb;
    if (!db) return alert("database not ready");

    try {
        const reportButton = document.getElementById("profileReportBtn");
        if (reportButton) {
            reportButton.dataset.uid = uid;
            reportButton.hidden = !window.accountAuth?.currentUser || window.accountAuth.currentUser.uid === uid;
        }
        const userSnap = await db.ref(`users/${uid}/profile`).once("value");
        const profile = userSnap.val() || {};
        const profilePermissions = getDiscordProfilePermissions(profile.discordLink || null);
        
        const profileViewModal = document.getElementById("profileViewModal");
        const profilePrivateMessage = document.getElementById("profilePrivateMessage");
        const profileContent = document.getElementById("profileContent");
        const profileNameDisplay = document.getElementById("profileNameDisplay");
        const profileAvatarDisplay = document.getElementById("profileAvatarDisplay");
        const profileBioDisplay = document.getElementById("profileBioDisplay");
        const profileDisplayNameShow = document.getElementById("profileDisplayNameShow");
        const profilePronounsShow = document.getElementById("profilePronounsShow");
        const profileDiscordShow = document.getElementById("profileDiscordShow");
        const profileBannerDisplay = document.querySelector(".profile-banner-image");
        const profileCreationsDisplay = document.getElementById("profileCreationsDisplay");

        const userSnap2 = await db.ref(`users/${uid}/username`).once("value");
        const username = userSnap2.val() || "unknown user";
        
        const isPrivate = profile.profilePrivacy === "private";
        
        if (isPrivate) {
            if (profilePrivateMessage) profilePrivateMessage.classList.remove("is-hidden");
            if (profileContent) profileContent.classList.add("is-hidden");
            lockBodyScroll();
            openAccountPopup(profileViewModal);
            return;
        }
        
        if (profilePrivateMessage) profilePrivateMessage.classList.add("is-hidden");
        if (profileContent) profileContent.classList.remove("is-hidden");
        
        profileAvatarDisplay.src = profile.profilePicUrl || "image/queens/noimage.jpg";
        
        if (profileDisplayNameShow) {
            if (profile.displayName) {
                profileDisplayNameShow.textContent = profile.displayName;
                profileDisplayNameShow.classList.remove("is-hidden");
            } else {
                profileDisplayNameShow.textContent = username || "user";
                profileDisplayNameShow.classList.remove("is-hidden");
            }
        }
        
        const profileUsernameShow = document.getElementById("profileUsernameShow");
        if (profileUsernameShow) {
            profileUsernameShow.textContent = `@${username}`;
        }

        if (profileDiscordShow) {
            const discordLink = profile.discordLink || null;
            if (discordLink?.username) {
                const prettyName = discordLink.globalName || discordLink.username;
                const handle = discordLink.discriminator && discordLink.discriminator !== "0"
                    ? `${discordLink.username}#${discordLink.discriminator}`
                    : `@${discordLink.username}`;
                profileDiscordShow.textContent = `Discord: ${prettyName} (${handle})`;
                profileDiscordShow.classList.remove("is-hidden");
            } else {
                profileDiscordShow.textContent = "";
                profileDiscordShow.classList.add("is-hidden");
            }
        }
        
        if (profilePronounsShow) {
            if (profile.pronouns) {
                profilePronounsShow.textContent = profile.pronouns;
                profilePronounsShow.classList.remove("is-hidden");
            } else {
                profilePronounsShow.classList.add("is-hidden");
            }
        }
        
        const profileTeamTagsDisplay = document.getElementById("profileTeamTagsDisplay");
        if (profileTeamTagsDisplay) {
            const teamTags = Array.isArray(profile.teamTags)
                ? profile.teamTags.map(normalizeTeamTagValue).filter(Boolean)
                : [];
            profileTeamTagsDisplay.replaceChildren();
            teamTags.forEach((teamTag) => {
                const tagElement = document.createElement("span");
                tagElement.className = "profile-team-tag";
                tagElement.dataset.team = teamTag;
                tagElement.textContent = `Team ${teamTag}`;
                profileTeamTagsDisplay.appendChild(tagElement);
            });
            profileTeamTagsDisplay.classList.toggle("is-hidden", teamTags.length === 0);
        }
        
        if (profileBioDisplay) {
            if (profile.bio) {
                if (profilePermissions.canUseRichBio) {
                    profileBioDisplay.innerHTML = sanitizeRichBioHtml(profile.bio);
                } else {
                    profileBioDisplay.textContent = stripHtmlTags(profile.bio);
                }
                profileBioDisplay.classList.remove("is-hidden");
            } else {
                profileBioDisplay.textContent = "This player hasn't added a bio yet.";
                profileBioDisplay.classList.remove("is-hidden");
            }
            profileBioDisplay.classList.toggle("is-empty", !profile.bio);
        }

        if (profile.bannerUrl && profilePermissions.canUseBanner) {
            profileBannerDisplay.style.backgroundImage = `url('${profile.bannerUrl}')`;
            profileBannerDisplay.style.backgroundColor = "";
        } else {
            profileBannerDisplay.style.backgroundImage = "";
            profileBannerDisplay.style.backgroundColor = "#8b1f74";
        }

        profileAvatarDisplay.className = "profile-avatar";
        const profileEffect = normalizeProfileEffect(profile.profileEffect);
        applyProfileEffect(profileAvatarDisplay, profileEffect);
        applyProfileEffect(profileAvatarDisplay.parentElement, profileEffect);

        const profileBadgesDisplay = document.getElementById("profileBadgesDisplay");
        if (profileBadgesDisplay) {
            const badgeDefs = {
                owner:     { icon: "fa-solid fa-crown",         tooltip: "Owner",              css: "badge-owner" },
                admin:     { icon: "fa-solid fa-shield-halved", tooltip: "Admin",              css: "badge-admin" },
                staff:     { icon: "fa-solid fa-star",          tooltip: "Staff",              css: "badge-staff" },
                veteran:   { icon: "fa-solid fa-clock",         tooltip: "Veteran",            css: "badge-veteran" },
                collector: { icon: "fa-solid fa-gem",           tooltip: "Collector",          css: "badge-collector" },
                og:        { icon: "fa-solid fa-scroll",        tooltip: "OG Player",          css: "badge-og" },
                beta:      { icon: "fa-solid fa-flask",         tooltip: "Beta Tester",        css: "badge-beta" },
                superstar: { icon: "fa-solid fa-bolt",          tooltip: "Superstar",          css: "badge-superstar" },
                diamond:   { icon: "fa-solid fa-diamond",       tooltip: "Diamond",            css: "badge-diamond" },
                heart:     { icon: "fa-solid fa-heart",         tooltip: "Heart",              css: "badge-heart" },
                ghost:     { icon: "fa-solid fa-ghost",         tooltip: "Ghost",              css: "badge-ghost" },
            };

            let badges = [];

            const staffSnap = await db.ref(`staff/${uid}`).once("value");
            if (staffSnap.exists()) {
                const staffData = staffSnap.val();
                if (staffData.role === "owner") badges.push("owner");
                else if (staffData.role === "admin") badges.push("admin");
                else badges.push("staff");
            }

            const profileBadges = profile.badges || [];
            profileBadges.forEach(b => {
                if (!badges.includes(b)) badges.push(b);
            });

            if (badges.length > 0) {
                profileBadgesDisplay.innerHTML = badges.map(id => {
                    const def = badgeDefs[id];
                    if (!def) return "";
                    return `<span class="profile-badge ${def.css}" data-tooltip="${def.tooltip}"><i class="${def.icon}"></i></span>`;
                }).join("");
            } else {
                profileBadgesDisplay.innerHTML = "";
            }
        }
        
        if (profileCreationsDisplay) {
            profileCreationsDisplay.innerHTML = '<p class="account-note">No public creations yet.</p>';
        }

        lockBodyScroll();
        openAccountPopup(profileViewModal);
    } catch (err) {
        console.error("Failed to load profile:", err);
        alert("couldn't load profile");
    }
}

document.addEventListener("DOMContentLoaded", initAccountUi);
document.addEventListener("navbar:loaded", initAccountUi);