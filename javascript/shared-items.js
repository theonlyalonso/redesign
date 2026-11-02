export function initSharedItemsManager(auth, db) {
    const refresh = document.getElementById("sharedItemsRefresh");
    const status = document.getElementById("sharedItemsStatus");
    const list = document.getElementById("sharedItemsList");
    if (!refresh || !status || !list) return;
    let generation = 0;
    let busy = false;

    function setBusy(value) {
        busy = value;
        refresh.disabled = value;
        list.querySelectorAll("button").forEach(button => { button.disabled = value; });
    }

    function showError(error) {
        console.error("Shared items request failed:", error);
        status.textContent = error.message || "Could not manage shares. Please retry.";
    }

    function renderItem(id, item) {
        const card = document.createElement("div");
        card.className = "setting-item";
        const title = document.createElement("h4");
        title.textContent = item.title || "Shared item";
        title.style.overflowWrap = "anywhere";
        const info = document.createElement("p");
        info.className = "account-note";
        info.style.color = "inherit";
        const expired = Date.parse(item.expiresAt) <= Date.now();
        info.textContent = `${item.kind} | Created: ${new Date(item.createdAt).toLocaleString()} | ${expired ? "Expired" : "Expires"}: ${new Date(item.expiresAt).toLocaleString()}`;
        const actions = document.createElement("div");
        actions.className = "account-actions";
        const url = location.origin + "/watch.html?share=" + encodeURIComponent(id);
        if (!expired) {
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener";
            link.style.color = "inherit";
            link.textContent = "Open share";
            const copy = document.createElement("button");
            copy.type = "button";
            copy.className = "btn-secondary";
            copy.textContent = "Copy link";
            copy.addEventListener("click", async () => {
                const current = generation;
                try {
                    await navigator.clipboard.writeText(url);
                    if (current === generation) status.textContent = "Share link copied.";
                } catch (error) {
                    if (current === generation) showError(error);
                }
            });
            actions.append(link, copy);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn-secondary";
        remove.textContent = "Delete share";
        remove.addEventListener("click", async () => {
            if (busy || !confirm("Delete this share? Its link will stop working. Downloaded copies cannot be recalled.")) return;
            const user = auth.currentUser;
            if (!user || user.isAnonymous || user.uid !== item.ownerUid) {
                status.textContent = "Sign in to the share owner's account to delete it.";
                return;
            }
            const current = generation;
            setBusy(true);
            try {
                await db.ref("sharedPages/" + id).remove();
                if (current !== generation) return;
                card.remove();
                status.textContent = "Share deleted.";
            } catch (error) {
                if (current === generation) showError(error);
            } finally {
                if (current === generation) setBusy(false);
            }
        });
        actions.append(remove);
        card.append(title, info, actions);
        return card;
    }

    async function load() {
        if (busy) return;
        const user = auth.currentUser;
        if (!user || user.isAnonymous) {
            status.textContent = "Sign in to manage your shares.";
            return;
        }
        const current = generation;
        list.replaceChildren();
        setBusy(true);
        status.textContent = "Loading shared items...";
        try {
            const snapshot = await db.ref("sharedPages").orderByChild("ownerUid").equalTo(user.uid).once("value");
            if (current !== generation) return;
            snapshot.forEach(child => {
                const item = child.val();
                if (item.ownerUid === user.uid) list.append(renderItem(child.key, item));
            });
            status.textContent = list.children.length
                ? `${list.children.length} shared items loaded.`
                : "No shares from this account yet. Older links and guest shares are not listed.";
        } catch (error) {
            if (current === generation) showError(error);
        } finally {
            if (current === generation) setBusy(false);
        }
    }

    refresh.addEventListener("click", () => { void load(); });
    auth.onAuthStateChanged(() => {
        generation += 1;
        list.replaceChildren();
        setBusy(false);
        status.textContent = auth.currentUser && !auth.currentUser.isAnonymous
            ? "Load your shares to manage links and expiry dates."
            : "Sign in to manage your shares.";
    });
}