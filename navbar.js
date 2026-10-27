"use strict";

const GLOBAL_ACCESS_CHECK_INTERVAL_MS = 300;
const DRAG_NAVBAR_VERSION = "v5.1.0";

let globalAccessOverlayEl = null;
let globalAccessStatusEl = null;
let globalAccessTitleEl = null;
let globalAccessSpinnerEl = null;
let globalAccessCardEl = null;
let globalAccessOpenBtnEl = null;
let globalAccessHideTimer = null;
let globalAccessAuthUnsub = null;
let globalAccessLinkRef = null;
let globalAccessLinkHandler = null;

function attachRefreshCacheButton(root) {
	const buttons = Array.from(root.querySelectorAll('#navRefreshCacheBtn, [data-action="refresh"]'));
	buttons.forEach((refreshBtn) => {
		refreshBtn.addEventListener("click", async (event) => {
			event.preventDefault();
			if (refreshBtn.getAttribute("aria-disabled") === "true") return;
			// keep the icon: only the text node changes
			const labelNode = Array.from(refreshBtn.childNodes).reverse().find((node) => node.nodeType === 3 && node.textContent.trim());
			const originalLabel = labelNode ? labelNode.textContent : "";
			if (labelNode) labelNode.textContent = "Refreshing...";
			refreshBtn.setAttribute("aria-disabled", "true");
			refreshBtn.style.pointerEvents = "none";

			try {
				if ("caches" in window) {
					const cacheKeys = await caches.keys();
					await Promise.all(cacheKeys.map((key) => caches.delete(key)));
				}
			} catch (_cacheErr) {
				// Ignore cleanup errors and continue with cache-busting reload.
			}

			const cacheBust = String(Date.now());
			const targetUrl = new URL(window.location.href);
			targetUrl.searchParams.set("cacheBust", cacheBust);
			targetUrl.searchParams.set("refresh", "1");
			window.location.replace(targetUrl.toString());

			window.setTimeout(() => {
				if (labelNode) labelNode.textContent = originalLabel || "Refresh Cache";
				refreshBtn.removeAttribute("aria-disabled");
				refreshBtn.style.pointerEvents = "";
			}, 1500);
		});
	});
}

function attachContestantSearchButton(root) {
	const searchLink = root.querySelector('[data-open-contestant-search="1"]');
	if (!searchLink) return;

	searchLink.addEventListener("click", (event) => {
		event.preventDefault();
		const targetUrl = new URL(searchLink.getAttribute("href") || "index.html#contestants", window.location.href);
		const currentUrl = new URL(window.location.href);
		const samePath = targetUrl.pathname === currentUrl.pathname;
		const hasInlineContestantSearch = typeof window.openContestantSearchModal === "function";

		if (hasInlineContestantSearch) {
			if (window.location.hash === "#contestants") {
				window.openContestantSearchModal({ syncHash: samePath });
			} else {
				if (samePath) {
					window.location.hash = "contestants";
				} else {
					window.openContestantSearchModal({ syncHash: false });
				}
			}
			return;
		}

		window.location.assign(targetUrl.toString());
	});
}

function setCloudFeatureNavVisibility(hasAccess) {
	const vaultItems = document.querySelectorAll('[data-nav-gate="vault"]');
	vaultItems.forEach((item) => { item.style.display = hasAccess ? "" : "none"; });
	const vaultItem = document.getElementById("navVaultItem");
	if (vaultItem) vaultItem.style.display = hasAccess ? "" : "none";
}

function setHistoryNavVisibility(hasAccess) {
	document.querySelectorAll('[data-nav-gate="history"]').forEach((item) => { item.style.display = hasAccess ? "" : "none"; });
	const historyLink = document.getElementById("navHistoryItem");
	if (historyLink) historyLink.style.display = hasAccess ? "" : "none";
}

async function refreshHistoryNavVisibility() {
	if (isLocalAccessBypassHost()) {
		setHistoryNavVisibility(true);
		return;
	}
	const user = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
	const isStaff = typeof window.getIsStaff === "function" ? window.getIsStaff() : false;
	const isOwner = !!(user && typeof window.isOwnerEmail === "function" && window.isOwnerEmail(user.email));

	if (isStaff || isOwner) {
		setHistoryNavVisibility(true);
		return;
	}

	if (typeof window.getUserHistoryAccess !== "function") {
		setHistoryNavVisibility(false);
		return;
	}

	try {
		const access = await window.getUserHistoryAccess();
		setHistoryNavVisibility(!access.blocked);
	} catch (_err) {
		setHistoryNavVisibility(false);
	}
}

function refreshCurrentHistoryPageIfOpen() {
	const currentPage = window.location.pathname.split("/").pop() || "";
	if (currentPage !== "history.html") return;
	if (typeof window.viewSeasonHistory !== "function") return;
	void window.viewSeasonHistory();
}

async function refreshCloudFeatureNavVisibility() {
	if (isLocalAccessBypassHost()) {
		setCloudFeatureNavVisibility(true);
		return;
	}
	const user = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
	const isStaff = typeof window.getIsStaff === "function" ? window.getIsStaff() : false;
	const isOwner = !!(user && typeof window.isOwnerEmail === "function" && window.isOwnerEmail(user.email));

	if (isStaff || isOwner) {
		setCloudFeatureNavVisibility(true);
		return;
	}

	if (typeof window.getUserCloudAccess !== "function") {
		// Default closed while account runtime initializes.
		setCloudFeatureNavVisibility(false);
		return;
	}

	try {
		const access = await window.getUserCloudAccess();
		setCloudFeatureNavVisibility(!access.blocked);
	} catch (_err) {
		setCloudFeatureNavVisibility(false);
	}
}

function isLocalAccessBypassHost() {
	const localHosts = ["127.0.0.1", "localhost", "[::1]", "::1"];
	return localHosts.includes(window.location.hostname);
}

async function revokeDiscordAccess(userUid, status, reason) {
	const db = window.accountDb;
	if (!db || !userUid) return;

	try {
		await db.ref(`users/${userUid}/profile/discordLink`).update({
			accessStatus: status,
			accessReason: reason,
			accessRevokedAt: new Date().toISOString()
		});
	} catch (err) {
		console.error("Failed to revoke Discord access:", err);
	}
}

function ensureGlobalAccessOverlay() {
	if (globalAccessOverlayEl) return;

	if (!document.getElementById("globalAccessOverlayStyles")) {
		const style = document.createElement("style");
		style.id = "globalAccessOverlayStyles";
		style.textContent = `
			@keyframes globalAccessSpinner {
				to { transform: rotate(360deg); }
			}
			#globalAccessOverlay .global-access-card {
				max-width: 560px;
				width: min(92vw, 560px);
				background: linear-gradient(145deg, rgba(55, 20, 44, 0.96) 0%, rgba(33, 12, 28, 0.96) 58%, rgba(24, 9, 22, 0.98) 100%);
				border: 1px solid rgba(255, 182, 224, 0.22);
				border-radius: 24px;
				padding: 26px 24px 22px;
				color: #ffe7f4;
				text-align: center;
				box-shadow: 0 24px 56px rgba(11, 2, 9, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.08);
				transition: transform 0.2s ease, opacity 0.2s ease;
			}
			#globalAccessOverlay .global-access-spinner {
				width: 42px;
				height: 42px;
				margin: 0 auto 14px;
				border-radius: 999px;
				border: 3px solid rgba(255, 191, 231, 0.28);
				border-top-color: #ff6ec4;
				animation: globalAccessSpinner 0.9s linear infinite;
				display: none;
			}
			#globalAccessOverlay .global-access-title {
				margin: 0 0 10px;
				font-size: 1.45rem;
				font-weight: 700;
				color: #ffd8ee;
			}
			#globalAccessOverlay .global-access-status {
				margin: 0 0 16px;
				color: rgba(255, 232, 245, 0.88);
				line-height: 1.5;
			}
			#globalAccessOverlay .global-access-action {
				border: 0;
				border-radius: 12px;
				padding: 10px 16px;
				background: linear-gradient(135deg, #c21e78 0%, #8d1f74 100%);
				color: #fff;
				font-weight: 700;
				cursor: pointer;
				box-shadow: 0 10px 22px rgba(123, 22, 92, 0.36);
				transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
			}
			#globalAccessOverlay .global-access-action:hover {
				transform: translateY(-1px);
				box-shadow: 0 14px 26px rgba(123, 22, 92, 0.44);
				filter: brightness(1.04);
			}
		`;
		document.head.appendChild(style);
	}

	const overlay = document.createElement("div");
	overlay.id = "globalAccessOverlay";
	overlay.style.position = "fixed";
	overlay.style.inset = "0";
	overlay.style.background = "rgba(20, 7, 19, 0.72)";
	overlay.style.backdropFilter = "blur(10px)";
	overlay.style.zIndex = "999998";
	overlay.style.display = "none";
	overlay.style.opacity = "0";
	overlay.style.transition = "opacity 0.24s ease";
	overlay.style.alignItems = "center";
	overlay.style.justifyContent = "center";
	overlay.style.padding = "20px";
	overlay.style.pointerEvents = "auto";

	overlay.innerHTML = `
		<div id="globalAccessOverlayCard" class="global-access-card">
			<div id="globalAccessOverlaySpinner" class="global-access-spinner" aria-hidden="true"></div>
			<h2 id="globalAccessOverlayTitle" class="global-access-title">Access Locked</h2>
			<p id="globalAccessOverlayStatus" class="global-access-status">Sign in and link Discord to continue.</p>
			<button id="globalAccessOpenAccountBtn" class="global-access-action" type="button">Open Account</button>
		</div>
	`;

	document.body.appendChild(overlay);
	globalAccessOverlayEl = overlay;
	globalAccessCardEl = overlay.querySelector("#globalAccessOverlayCard");
	globalAccessSpinnerEl = overlay.querySelector("#globalAccessOverlaySpinner");
	globalAccessTitleEl = overlay.querySelector("#globalAccessOverlayTitle");
	globalAccessStatusEl = overlay.querySelector("#globalAccessOverlayStatus");
	globalAccessOpenBtnEl = overlay.querySelector("#globalAccessOpenAccountBtn");

	globalAccessOpenBtnEl?.addEventListener("click", () => {
		const accountButton = document.getElementById("accountButton");
		if (accountButton) accountButton.click();
	});
}

function setGlobalAccessOverlayVisible(visible, message, options = {}) {
	ensureGlobalAccessOverlay();
	if (!globalAccessOverlayEl) return;
	const isLoading = !!options.loading;
	if (globalAccessHideTimer) {
		window.clearTimeout(globalAccessHideTimer);
		globalAccessHideTimer = null;
	}

	if (visible) {
		globalAccessOverlayEl.style.display = "flex";
		globalAccessOverlayEl.style.pointerEvents = "auto";
		requestAnimationFrame(() => {
			if (globalAccessOverlayEl) globalAccessOverlayEl.style.opacity = "1";
		});
	} else {
		globalAccessOverlayEl.style.opacity = "0";
		globalAccessOverlayEl.style.pointerEvents = "none";
		globalAccessHideTimer = window.setTimeout(() => {
			if (globalAccessOverlayEl && globalAccessOverlayEl.style.opacity === "0") {
				globalAccessOverlayEl.style.display = "none";
			}
			globalAccessHideTimer = null;
		}, 240);
	}
	if (globalAccessSpinnerEl) {
		globalAccessSpinnerEl.style.display = visible && isLoading ? "block" : "none";
	}
	if (globalAccessOpenBtnEl) {
		globalAccessOpenBtnEl.style.display = visible && !isLoading ? "inline-flex" : "none";
	}
	if (globalAccessTitleEl) {
		globalAccessTitleEl.textContent = isLoading ? "Checking Access" : "Access Locked";
	}
	if (globalAccessCardEl) {
		globalAccessCardEl.style.transform = visible ? "scale(1)" : "scale(0.98)";
		globalAccessCardEl.style.opacity = visible ? "1" : "0";
	}
	if (globalAccessStatusEl && message) {
		globalAccessStatusEl.textContent = message;
	}
}

function clearGlobalAccessLinkListener() {
	if (globalAccessLinkRef && globalAccessLinkHandler) {
		globalAccessLinkRef.off("value", globalAccessLinkHandler);
	}
	globalAccessLinkRef = null;
	globalAccessLinkHandler = null;
}

function evaluateGlobalAccessFromDiscordLink(userUid, discordLink, userEmail = "") {
	const ownerAccess = typeof window.isOwnerEmail === "function" && window.isOwnerEmail(userEmail);
	if (ownerAccess) {
		setGlobalAccessOverlayVisible(false, "");
		return;
	}

	if (!discordLink || !discordLink.id) {
		setGlobalAccessOverlayVisible(true, "Sign in and link your Discord account to continue.");
		return;
	}

	const accessStatus = (discordLink.accessStatus || "").toString().toUpperCase();
	const expiresAtRaw = discordLink.verificationExpiresAt || "";
	const expiresAtMs = expiresAtRaw ? Date.parse(expiresAtRaw) : NaN;

	if (!Number.isNaN(expiresAtMs) && Date.now() > expiresAtMs) {
		if (accessStatus !== "EXPIRED") {
			revokeDiscordAccess(userUid, "EXPIRED", "Verification window expired. Relink required.");
		}
		setGlobalAccessOverlayVisible(true, "Access EXPIRED. Please relink your Discord account.");
		return;
	}
	if (accessStatus !== "ACCEPTED") {
		setGlobalAccessOverlayVisible(true, "Access DENIED. Sign in and link a valid Discord account to continue.");
		return;
	}

	const accessMode = typeof window.getDiscordAccessMode === "function"
		? window.getDiscordAccessMode()
		: "ALL_PAID_ROLES";
	if (accessMode === "SPONSOR_ONLY") {
		const accessTier = (discordLink.accessTier || "").toString().toUpperCase();
		const sponsorRoleId = (discordLink.roleCheck?.sponsorRoleId || "").toString().trim();
		const linkedRoles = Array.isArray(discordLink.roleCheck?.roles) ? discordLink.roleCheck.roles : [];
		const hasSponsorRole = Boolean(
			(accessTier === "SPONSOR")
			|| (sponsorRoleId && linkedRoles.includes(sponsorRoleId))
			|| discordLink.permissions?.canUseBanner === true
		);

		if (!hasSponsorRole) {
			setGlobalAccessOverlayVisible(true, "Sponsor access required. This simulator is in Sponsor-only mode.");
			return;
		}
	}

	setGlobalAccessOverlayVisible(false, "");
}

function initGlobalAccessOverlayGate() {
	if (window.DRAG_ACCESS_GATE === false) return; // account scripts not deployed on this copy
	ensureGlobalAccessOverlay();

	if (isLocalAccessBypassHost()) {
		setGlobalAccessOverlayVisible(false, "");
		return;
	}

	const bindAuth = () => {
		const auth = window.accountAuth;
		const db = window.accountDb;
		if (!auth || !db) return false;

		if (globalAccessAuthUnsub) return true;

		globalAccessAuthUnsub = auth.onAuthStateChanged((user) => {
			clearGlobalAccessLinkListener();
			void refreshHistoryNavVisibility();
			void refreshCloudFeatureNavVisibility();
			refreshCurrentHistoryPageIfOpen();

			if (!user) {
				setGlobalAccessOverlayVisible(true, "Sign in and link your Discord account to continue.");
				return;
			}

			globalAccessLinkRef = db.ref(`users/${user.uid}/profile/discordLink`);
			globalAccessLinkHandler = (snapshot) => {
				evaluateGlobalAccessFromDiscordLink(user.uid, snapshot.val(), user.email || "");
				void refreshHistoryNavVisibility();
				refreshCurrentHistoryPageIfOpen();
			};
			globalAccessLinkRef.on("value", globalAccessLinkHandler);
		});

		return true;
	};

	if (bindAuth()) return;

	setGlobalAccessOverlayVisible(true, "Checking Discord access...", { loading: true });
	const timer = setInterval(() => {
		if (bindAuth()) {
			clearInterval(timer);
		}
	}, 300);
}

/* Design header: the header/nav/mobile sheet are written into index.html (no navbar.html fetch any more).
   This block only wires up what navbar.js used to do to that markup. */
function markActiveNavLinks() {
	const current = window.location.pathname.split("/").pop() || "index.html";
	document.querySelectorAll(".nav__link[href], .tabbar__item[href]").forEach((link) => {
		if (link.hasAttribute("data-open-contestant-search")) return;
		const target = (link.getAttribute("href") || "").split("#")[0].split("?")[0];
		link.classList.toggle("is-active", !!target && target === current);
	});
}

document.addEventListener("DOMContentLoaded", () => {
	initGlobalAccessOverlayGate();
	window.DRAG_NAVBAR_ACTIVE = true;

	const root = document.getElementById("navbar-root") || document.querySelector(".header");
	if (!root) return;

	const navbarVersion = String(window.DRAG_NAVBAR_VERSION || DRAG_NAVBAR_VERSION || root.dataset.navbarVersion || "").trim();

	// Hide gated links by default, then show only when access checks pass.
	setHistoryNavVisibility(false);
	setCloudFeatureNavVisibility(false);
	void refreshHistoryNavVisibility();
	void refreshCloudFeatureNavVisibility();
	attachRefreshCacheButton(document);
	// "Contestants" links (data-open-contestant-search) are handled by index.js itself.

	const versionLabel = document.getElementById("navVersionLabel") || root.querySelector(".brand__version");
	if (versionLabel) {
		if (navbarVersion) {
			versionLabel.textContent = navbarVersion;
		} else {
			versionLabel.textContent = "";
			versionLabel.style.display = "none";
		}
	}

	markActiveNavLinks();
	document.dispatchEvent(new CustomEvent("navbar:loaded"));
});
