"use strict";

/* Bell notifications. Staff write them from the admin panel and everyone reads them from
   Realtime Database at notifications/. The active global announcement is pinned on top. */
(function initSiteNotifications() {
    const NOTIFICATIONS_PATH = "notifications";
    const ANNOUNCEMENT_PATH = "globalAnnouncements/current";
    const LAST_READ_KEY = "ss.notifications.lastReadAt";
    const MAX_ITEMS = 30;
    const LEVELS = ["info", "warning", "critical"];
    const DISMISSED_KEY = "ss.notifications.dismissed";
    const MAX_DISMISSED = 200;
    const LEVEL_ICONS = { info: "fa-circle-info", warning: "fa-triangle-exclamation", critical: "fa-circle-exclamation" };

    let notifications = [];
    let announcement = null;
    let panel = null;
    let openedFrom = null;
    let started = false;

    function getDb() {
        try {
            return typeof firebase !== "undefined" && firebase.apps && firebase.apps.length ? firebase.database() : null;
        } catch (_err) {
            return null;
        }
    }

    function getLastReadAt() {
        try {
            return Number(localStorage.getItem(LAST_READ_KEY)) || 0;
        } catch (_err) {
            return 0;
        }
    }

    function setLastReadAt(value) {
        try {
            localStorage.setItem(LAST_READ_KEY, String(value));
        } catch (_err) {
            // Without storage the dot just comes back on the next visit.
        }
    }

    function getDismissed() {
        try {
            const stored = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
            return Array.isArray(stored) ? stored : [];
        } catch (_err) {
            return [];
        }
    }

    function setDismissed(ids) {
        try {
            localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-MAX_DISMISSED)));
        } catch (_err) {
            // Without storage a dismissed notification comes back on the next visit.
        }
    }

    function canDeleteForEveryone() {
        const role = typeof window.getStaffRole === "function" ? window.getStaffRole() : "";
        return role === "admin" || role === "owner";
    }

    function normalizeLevel(value) {
        return LEVELS.includes(value) ? value : "info";
    }

    /* Only site pages and https links can be opened from a notification. */
    function normalizeLink(value) {
        const link = String(value || "").trim();
        return /^(https:\/\/|[a-z0-9-]+\.html(?:[?#].*)?$)/i.test(link) ? link : "";
    }

    function timeAgo(timestamp) {
        const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
        if (seconds < 60) return "Just now";
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return minutes + "m ago";
        const hours = Math.round(minutes / 60);
        if (hours < 24) return hours + "h ago";
        const days = Math.round(hours / 24);
        if (days < 7) return days + "d ago";
        return new Date(timestamp).toLocaleDateString();
    }

    function getActiveAnnouncement() {
        if (!announcement || !announcement.active || !String(announcement.message || "").trim()) return null;
        const expiresAt = announcement.expiresAt ? Date.parse(announcement.expiresAt) : 0;
        if (expiresAt && Date.now() > expiresAt) return null;
        return {
            id: "announcement-" + String(announcement.updatedAt || ""),
            pinned: true,
            title: String(announcement.title || "Announcement"),
            message: String(announcement.message),
            level: normalizeLevel(announcement.level),
            link: "",
            createdAt: Date.parse(announcement.updatedAt) || 0
        };
    }

    function getItems() {
        const pinned = getActiveAnnouncement();
        const dismissed = new Set(getDismissed());
        return (pinned ? [pinned, ...notifications] : notifications).filter((item) => !dismissed.has(item.id));
    }

    function getUnreadCount() {
        const lastReadAt = getLastReadAt();
        return getItems().filter((item) => item.createdAt > lastReadAt).length;
    }

    function updateBadges() {
        const unread = getUnreadCount();
        document.querySelectorAll(".user__bell, .burger").forEach((element) => {
            element.classList.toggle("has-unread", unread > 0);
        });
        document.querySelectorAll(".user__bell").forEach((bell) => {
            bell.setAttribute("aria-label", unread > 0 ? "Notifications, " + unread + " unread" : "Notifications");
        });
        document.querySelectorAll(".js-notification-count").forEach((count) => {
            count.textContent = unread > 9 ? "9+" : String(unread);
            count.hidden = unread === 0;
        });
    }

    function buildItem(item) {
        const element = document.createElement("div");
        element.className = "notification-item is-" + item.level;
        element.dataset.notificationId = item.id;
        if (item.createdAt > getLastReadAt()) element.classList.add("is-unread");

        const body = document.createElement(item.link ? "a" : "div");
        body.className = "notification-item__body";
        if (item.link) {
            body.href = item.link;
            if (/^https:/i.test(item.link)) {
                body.target = "_blank";
                body.rel = "noopener noreferrer";
            }
        }

        const icon = document.createElement("span");
        icon.className = "notification-item__icon";
        icon.innerHTML = '<i class="fa-solid ' + (item.pinned ? "fa-bullhorn" : LEVEL_ICONS[item.level]) + '" aria-hidden="true"></i>';

        const copy = document.createElement("span");
        copy.className = "notification-item__copy";
        if (item.title) {
            const title = document.createElement("b");
            title.textContent = item.title;
            copy.appendChild(title);
        }
        const message = document.createElement("span");
        message.textContent = item.message;
        copy.appendChild(message);
        const meta = document.createElement("small");
        meta.textContent = item.pinned ? "Announcement" : timeAgo(item.createdAt);
        copy.appendChild(meta);
        body.append(icon, copy);

        const actions = document.createElement("span");
        actions.className = "notification-item__actions";
        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.dataset.notificationAction = "dismiss";
        dismiss.title = "Remove from my notifications";
        dismiss.setAttribute("aria-label", "Remove from my notifications");
        dismiss.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        actions.appendChild(dismiss);
        if (!item.pinned && canDeleteForEveryone()) {
            const removeAll = document.createElement("button");
            removeAll.type = "button";
            removeAll.className = "is-danger";
            removeAll.dataset.notificationAction = "delete";
            removeAll.title = "Delete for everyone";
            removeAll.setAttribute("aria-label", "Delete for everyone");
            removeAll.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
            actions.appendChild(removeAll);
        }

        element.append(body, actions);
        return element;
    }

    function renderPanel() {
        if (!panel) return;
        const list = panel.querySelector(".notification-panel__list");
        const items = getItems();
        panel.querySelector(".notification-panel__clear").hidden = items.length === 0;
        list.innerHTML = "";
        if (items.length === 0) {
            const empty = document.createElement("p");
            empty.className = "notification-panel__empty";
            empty.textContent = "You're all caught up.";
            list.appendChild(empty);
            return;
        }
        items.forEach((item) => list.appendChild(buildItem(item)));
    }

    function ensurePanel() {
        if (panel) return panel;
        panel = document.createElement("div");
        panel.className = "notification-panel";
        panel.id = "notificationPanel";
        panel.hidden = true;
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Notifications");
        panel.innerHTML = '<div class="notification-panel__head"><h2>Notifications</h2>'
            + '<button type="button" class="notification-panel__clear">Clear all</button>'
            + '<button type="button" class="notification-panel__close" aria-label="Close notifications"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>'
            + '<div class="notification-panel__list"></div>';
        panel.querySelector(".notification-panel__close").addEventListener("click", closePanel);
        panel.querySelector(".notification-panel__clear").addEventListener("click", () => {
            dismissItems(getItems().map((item) => item.id));
        });
        panel.querySelector(".notification-panel__list").addEventListener("click", (event) => {
            const button = event.target.closest("[data-notification-action]");
            if (!button) return;
            const id = button.closest("[data-notification-id]").dataset.notificationId;
            if (button.dataset.notificationAction === "dismiss") {
                dismissItems([id]);
            } else {
                void deleteForEveryone(id);
            }
        });
        // Removing a row detaches the clicked button, so the outside-click check can't see it.
        panel.addEventListener("click", (event) => event.stopPropagation());
        document.body.appendChild(panel);
        return panel;
    }

    function dismissItems(ids) {
        setDismissed([...getDismissed(), ...ids]);
        updateBadges();
        renderPanel();
    }

    function openPanel(trigger) {
        ensurePanel();
        openedFrom = trigger || null;
        renderPanel();
        panel.hidden = false;
        if (trigger) trigger.setAttribute("aria-expanded", "true");

        // The unread highlight stays until the panel closes, but the badge clears straight away.
        const newest = getItems().reduce((latest, item) => Math.max(latest, item.createdAt), 0);
        if (newest > getLastReadAt()) setLastReadAt(newest);
        updateBadges();
    }

    function closePanel() {
        if (!panel || panel.hidden) return;
        panel.hidden = true;
        if (openedFrom) {
            openedFrom.setAttribute("aria-expanded", "false");
            openedFrom.focus();
            openedFrom = null;
        }
    }

    function togglePanel(trigger) {
        if (panel && !panel.hidden) closePanel();
        else openPanel(trigger);
    }

    function bindBell() {
        document.querySelectorAll(".user__bell").forEach((bell) => {
            bell.setAttribute("aria-haspopup", "dialog");
            bell.setAttribute("aria-expanded", "false");
            bell.addEventListener("click", (event) => {
                event.stopPropagation();
                togglePanel(bell);
            });
        });
        document.addEventListener("click", (event) => {
            if (panel && !panel.hidden && !panel.contains(event.target)) closePanel();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closePanel();
        });
    }

    function applyList(snapshot) {
        const next = [];
        snapshot.forEach((child) => {
            const value = child.val() || {};
            if (!value.message) return;
            next.push({
                id: child.key,
                title: String(value.title || ""),
                message: String(value.message),
                level: normalizeLevel(value.level),
                link: normalizeLink(value.link),
                createdAt: Number(value.createdAt) || 0
            });
        });
        notifications = next.reverse();
        updateBadges();
        renderPanel();
        renderAdminList();
    }

    function subscribe() {
        const db = getDb();
        if (!db || started) return;
        started = true;
        db.ref(NOTIFICATIONS_PATH).orderByChild("createdAt").limitToLast(MAX_ITEMS).on("value", applyList, (err) => {
            console.warn("Notifications unavailable:", err && err.message);
        });
        db.ref(ANNOUNCEMENT_PATH).on("value", (snapshot) => {
            announcement = snapshot.val();
            updateBadges();
            renderPanel();
        }, () => {});
    }

    /* ---------- Staff composer (System tab of the admin panel) ---------- */
    function setAdminStatus(text, isError) {
        const status = document.getElementById("adminNotificationStatus");
        if (!status) return;
        status.textContent = text;
        status.classList.toggle("is-error", !!isError);
    }

    async function publishNotification({ title, message, level, link }) {
        const db = getDb();
        const user = typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
        if (!db || !user) throw new Error("Sign in first.");
        await db.ref(NOTIFICATIONS_PATH).push({
            title: String(title || "").trim().slice(0, 100),
            message: String(message || "").trim().slice(0, 500),
            level: normalizeLevel(level),
            link: normalizeLink(link),
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            createdByUid: user.uid
        });
    }

    async function deleteNotification(id) {
        const db = getDb();
        if (!db) throw new Error("Notifications are unavailable.");
        await db.ref(NOTIFICATIONS_PATH + "/" + id).remove();
    }

    /* Asks first, because it removes the notification from everyone's bell. */
    async function deleteForEveryone(id) {
        const confirmed = typeof window.showInHouseConfirm === "function"
            ? await window.showInHouseConfirm("Delete this notification for everyone?", "Delete Notification")
            : window.confirm("Delete this notification for everyone?");
        if (!confirmed) return false;
        const allowed = typeof window.ensureAdminElevation === "function"
            ? await window.ensureAdminElevation("delete a notification")
            : false;
        if (!allowed) return false;
        try {
            await deleteNotification(id);
            return true;
        } catch (err) {
            console.error("Failed to delete notification:", err);
            setAdminStatus("Couldn't delete it.", true);
            if (typeof window.showInHouseAlert === "function") {
                void window.showInHouseAlert("Couldn't delete that notification. Check your admin access and try again.", "Notifications");
            }
            return false;
        }
    }

    function renderAdminList() {
        const list = document.getElementById("adminNotificationList");
        if (!list) return;
        list.innerHTML = "";
        notifications.slice(0, 10).forEach((item) => {
            const row = document.createElement("div");
            row.className = "notification-admin-row";
            const copy = document.createElement("span");
            copy.textContent = (item.title ? item.title + ": " : "") + item.message;
            const when = document.createElement("small");
            when.textContent = timeAgo(item.createdAt);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn-danger";
            remove.textContent = "Delete";
            remove.dataset.notificationId = item.id;
            row.append(copy, when, remove);
            list.appendChild(row);
        });
    }

    function bindAdminComposer() {
        const form = document.getElementById("adminNotificationForm");
        if (!form || form.__bound) return;
        form.__bound = true;

        const elevate = async (action) => (
            typeof window.ensureAdminElevation === "function" ? window.ensureAdminElevation(action) : false
        );

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const message = form.elements.message.value.trim();
            if (!message) {
                setAdminStatus("Write a message first.", true);
                return;
            }
            const rawLink = form.elements.link.value.trim();
            if (rawLink && !normalizeLink(rawLink)) {
                setAdminStatus("Links must start with https:// or be a site page like vault.html.", true);
                return;
            }
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                if (!(await elevate("send a notification"))) {
                    setAdminStatus("Notification not sent.", true);
                    return;
                }
                await publishNotification({
                    title: form.elements.title.value,
                    message,
                    level: form.elements.level.value,
                    link: rawLink
                });
                form.reset();
                setAdminStatus("Sent to everyone.");
            } catch (err) {
                console.error("Failed to send notification:", err);
                setAdminStatus("Couldn't send it. Check your admin access and try again.", true);
            } finally {
                submit.disabled = false;
            }
        });

        document.getElementById("adminNotificationList")?.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-notification-id]");
            if (!button) return;
            button.disabled = true;
            try {
                if (await deleteForEveryone(button.dataset.notificationId)) {
                    setAdminStatus("Notification deleted.");
                }
            } finally {
                button.disabled = false;
            }
        });

        renderAdminList();
    }

    let booted = false;
    function boot() {
        if (booted) return;
        booted = true;
        bindBell();
        updateBadges();
    }

    document.addEventListener("DOMContentLoaded", boot);
    // account.js sets up Firebase and account-modals.html (the composer) arrives with this event.
    document.addEventListener("navbar:loaded", () => {
        boot();
        bindAdminComposer();
        subscribe();
    });

    window.SiteNotifications = { open: openPanel, close: closePanel, toggle: togglePanel };
})();
