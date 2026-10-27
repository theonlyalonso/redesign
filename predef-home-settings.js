(function () {
    const STORAGE_KEY = "ss.predefHomeSettings";
    const PRESET_STORAGE_KEY = "ss.seasonSettingsPresets";

    function readSeasonSettingsPresets() {
        try {
            const presets = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || "[]");
            return Array.isArray(presets) ? presets : [];
        } catch (_err) {
            return [];
        }
    }

    function refreshSeasonSettingsPresetOptions(scope, selectedId = "") {
        const selectId = scope === "twists" ? "twist-season-preset" : "format-season-preset";
        const select = document.getElementById(selectId);
        if (!select) return;

        const label = scope === "twists" ? "Choose a twist preset" : "Choose a format preset";
        select.replaceChildren(new Option(label, ""));
        readSeasonSettingsPresets()
            .filter((preset) => !preset.scope || preset.scope === scope)
            .forEach((preset) => select.add(new Option(preset.name, preset.id)));
        select.value = selectedId;
    }

    function closeSeasonSettingsPresetPopups() {
        const expandedButton = document.querySelector('[data-preset-menu][aria-expanded="true"]');
        closeSeasonSettingsPresetPopup("formats");
        closeSeasonSettingsPresetPopup("twists");
        return expandedButton;
    }

    function closeSeasonSettingsPresetPopup(scope) {
        const popupId = scope === "twists" ? "twist-presets-popup" : "format-presets-popup";
        const popup = document.getElementById(popupId);
        const button = document.querySelector('[data-preset-menu="' + scope + '"]');
        if (!popup) return;

        if (popup.classList.contains("active") && typeof window.deactivateCenteredPopup === "function") {
            window.deactivateCenteredPopup(popup);
        } else {
            popup.classList.remove("active");
            popup.setAttribute("aria-hidden", "true");
            popup.style.removeProperty("display");
        }
        button?.setAttribute("aria-expanded", "false");
    }

    function toggleSeasonSettingsPresetPopup(scope) {
        const popupId = scope === "twists" ? "twist-presets-popup" : "format-presets-popup";
        const popup = document.getElementById(popupId);
        const button = document.querySelector('[data-preset-menu="' + scope + '"]');
        if (!popup || !button) return;

        const shouldOpen = !popup.classList.contains("active");
        closeSeasonSettingsPresetPopups();
        if (shouldOpen) {
            if (typeof window.activateCenteredPopup === "function") {
                window.activateCenteredPopup(popup);
            } else {
                popup.classList.add("active");
                popup.setAttribute("aria-hidden", "false");
                popup.style.display = "grid";
            }
            button.setAttribute("aria-expanded", "true");
            popup.querySelector("select")?.focus();
        }
    }

    function getPresetControls() {
        const root = document.querySelector("#twist-menu-root .all-options");
        if (!root) return [];

        return Array.from(root.querySelectorAll("input, select, textarea")).filter((control) => {
            if (!control.id || control.type === "button" || control.type === "submit" || control.type === "radio") return false;
            return !/^(showOpt|twistMenuFullscreen|accessibility-|style-mode$|font-mode$|liveShare|liveStreamingToggle)/.test(control.id);
        });
    }

    function capturePresetControls() {
        return getPresetControls().reduce((settings, control) => {
            if (control.type === "checkbox") {
                settings[control.id] = { type: "checkbox", value: control.checked };
            } else {
                settings[control.id] = { type: control.type || control.tagName.toLowerCase(), value: control.value };
            }
            return settings;
        }, {});
    }

    function setPresetControlValue(control, savedValue) {
        if (!savedValue || !control) return;
        if (control.type === "checkbox") {
            control.checked = !!savedValue.value;
        } else {
            const value = String(savedValue.value ?? "");
            if (control.tagName !== "SELECT" || Array.from(control.options).some((option) => option.value === value)) {
                control.value = value;
            }
        }
        control.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function applySeasonSettingsValues(settings, scope) {
        if (!settings || typeof settings !== "object") return false;

        if (scope === "formats") {
            setSelectValue("format", settings.format);

            const premiereGroup = document.getElementById("premiere-group");
            const premiereType = document.getElementById("premiere-type");
            if (premiereGroup && premiereType && typeof window.updatePremiereTypes === "function") {
                const premiereGroupName = ["single", "late", "double", "triple"].find((groupName) => {
                    premiereGroup.value = groupName;
                    window.updatePremiereTypes(settings.premiere);
                    return Array.from(premiereType.options || []).some((option) => option.value === settings.premiere);
                });
                if (premiereGroupName) {
                    premiereGroup.value = premiereGroupName;
                    window.updatePremiereTypes(settings.premiere);
                }
            }
            setSelectValue("premiere-format", settings.premiere);
            setSelectValue("returning", settings.returning);

            const finaleSize = document.getElementById("finale-size");
            const finaleType = document.getElementById("finale-type");
            if (finaleSize && finaleType && typeof window.updateFinaleTypes === "function") {
                const finaleSizeName = ["2", "3", "4", "5", "6", "7", "8"].find((size) => {
                    finaleSize.value = size;
                    window.updateFinaleTypes(settings.finale);
                    return Array.from(finaleType.options || []).some((option) => option.value === settings.finale);
                });
                if (finaleSizeName) {
                    finaleSize.value = finaleSizeName;
                    window.updateFinaleTypes(settings.finale);
                }
            }
            setSelectValue("finale", settings.finale);
        }

        if (scope !== "twists") return true;
        const controls = getPresetControls();
        if (!controls.length) return false;

        const savedControls = settings.controls || {};
        const triggers = controls.filter((control) => control.classList.contains("twist-trigger"));
        triggers.forEach((control) => {
            if (Object.prototype.hasOwnProperty.call(savedControls, control.id)) {
                setPresetControlValue(control, savedControls[control.id]);
            }
        });

        controls.filter((control) => !control.classList.contains("twist-trigger")).forEach((control) => {
            if (!Object.prototype.hasOwnProperty.call(savedControls, control.id)) return;
            if (control.disabled && control.type === "checkbox") {
                control.checked = false;
                return;
            }
            setPresetControlValue(control, savedControls[control.id]);
        });
        return true;
    }

    async function saveSeasonSettingsPreset(scope) {
        if (scope !== "twists" && scope !== "formats") return;
        const controls = scope === "twists" ? getPresetControls() : [];
        if (scope === "twists" && !controls.length) {
            alert("The Twist Menu is still loading. Try saving again in a moment.");
            return;
        }

        if (typeof window.showInHousePrompt !== "function") return;
        const promptedName = await window.showInHousePrompt(
            "Name this " + (scope === "twists" ? "twist" : "format") + " preset",
            "",
            "Save Preset"
        );
        const name = String(promptedName || "").trim();
        if (!name) return;

        const presets = readSeasonSettingsPresets();
        const existing = presets.find((preset) => preset.scope === scope && preset.name.toLowerCase() === name.toLowerCase());
        const preset = {
            id: existing?.id || "preset-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
            scope,
            name,
            savedAt: Date.now()
        };
        if (scope === "formats") {
            preset.format = document.getElementById("format")?.value || "regular";
            preset.finale = document.getElementById("finale")?.value || "";
            preset.premiere = document.getElementById("premiere-format")?.value || "";
            preset.returning = document.getElementById("returning")?.value || "";
        } else {
            preset.controls = capturePresetControls();
        }

        const nextPresets = existing
            ? presets.map((entry) => entry.id === existing.id ? preset : entry)
            : [...presets, preset];
        try {
            localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(nextPresets));
        } catch (_err) {
            alert("Could not save this preset in local storage.");
            return;
        }

        refreshSeasonSettingsPresetOptions(scope, preset.id);
        if (typeof window.showCustomStatusPopup === "function") {
            window.showCustomStatusPopup("Season settings preset saved.", "Settings");
        }
    }

    function applySeasonSettingsPreset(scope) {
        const selectId = scope === "twists" ? "twist-season-preset" : "format-season-preset";
        const presetId = document.getElementById(selectId)?.value;
        const preset = readSeasonSettingsPresets().find((entry) => entry.id === presetId);
        if (!preset) return;
        if (!applySeasonSettingsValues(preset, scope)) {
            alert("The Twist Menu is still loading. Try applying the preset again in a moment.");
            return;
        }
        closeSeasonSettingsPresetPopup(scope);
        if (typeof window.showCustomStatusPopup === "function") {
            window.showCustomStatusPopup("Season settings preset applied.", "Settings");
        }
    }

    function deleteSeasonSettingsPreset(scope) {
        const selectId = scope === "twists" ? "twist-season-preset" : "format-season-preset";
        const select = document.getElementById(selectId);
        const presetId = select?.value;
        if (!presetId) return;
        const presets = readSeasonSettingsPresets();
        const preset = presets.find((entry) => entry.id === presetId);
        if (!preset || !window.confirm("Delete the saved preset \"" + preset.name + "\"?")) return;
        try {
            localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets.filter((entry) => entry.id !== presetId)));
        } catch (_err) {
            alert("Could not delete this preset.");
            return;
        }
        refreshSeasonSettingsPresetOptions(scope);
    }

    function resolveToken(token) {
        if (!token) return "";
        if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
            return token.slice(1, -1);
        }
        if (Object.prototype.hasOwnProperty.call(window, token)) {
            return window[token];
        }
        try {
            return Function("return (typeof " + token + " !== 'undefined') ? " + token + " : undefined;")();
        } catch (_err) {
            return undefined;
        }
    }

    function parsePredefOnclickArgs(onclickText) {
        if (!onclickText) return null;
        const match = onclickText.trim().match(/^[a-zA-Z0-9_]+\((.*)\)\s*$/);
        if (!match) return null;

        const argsText = match[1].trim();
        if (!argsText) return [];

        const args = [];
        let current = "";
        let inSingle = false;
        let inDouble = false;

        for (let i = 0; i < argsText.length; i++) {
            const ch = argsText[i];
            if (ch === "'" && !inDouble) {
                inSingle = !inSingle;
                current += ch;
                continue;
            }
            if (ch === '"' && !inSingle) {
                inDouble = !inDouble;
                current += ch;
                continue;
            }
            if (ch === "," && !inSingle && !inDouble) {
                args.push(current.trim());
                current = "";
                continue;
            }
            current += ch;
        }

        if (current.trim().length) args.push(current.trim());

        return args.map(resolveToken);
    }

    function saveHomeSettingsFromPredefButton(simButton) {
        if (!simButton) return false;
        const args = parsePredefOnclickArgs(simButton.getAttribute("onclick") || "");
        if (!args || !args.length) return false;

        const cast = Array.isArray(args[0]) ? args[0] : [];
        const imagePresets = cast && cast.imagePresets && typeof cast.imagePresets === "object"
            ? cast.imagePresets
            : null;

        const payload = {
            format: args[1] || "",
            finale: args[2] || "",
            premiere: args[3] || "",
            returning: args[4] || "",
            cast: cast.map((queen) => {
                const queenName = String(queen?._name || queen?.name || "").trim();
                const presetIndex = imagePresets && Object.prototype.hasOwnProperty.call(imagePresets, queenName)
                    ? imagePresets[queenName]
                    : queen?.currentImageIndex;

                return {
                    name: queenName,
                    imageIndex: Number.isFinite(Number(presetIndex)) ? Number(presetIndex) : 0
                };
            }).filter((queen) => queen.name),
            savedAt: Date.now()
        };

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            return true;
        } catch (_err) {
            return false;
        }
    }

    function setSelectValue(id, value) {
        const select = document.getElementById(id);
        if (!select) return;
        const targetValue = String(value || "");
        const hasOption = Array.from(select.options || []).some((option) => option.value === targetValue);
        if (!hasOption) return;
        select.value = targetValue;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function syncCastUi(castLength) {
        const big = document.getElementById("castBig");
        if (big) {
            big.classList.toggle("hide", castLength === 0);
            big.innerHTML = "Current Cast: " + castLength;
        }

        const nobody = document.querySelector(".nobody");
        if (nobody) {
            nobody.classList.toggle("hide", castLength > 0);
        }
    }

    function escapeSelector(value) {
        if (window.CSS && typeof window.CSS.escape === "function") {
            return window.CSS.escape(value);
        }
        return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    }

    function clearCurrentCastFromDom() {
        const removeButtons = Array.from(document.querySelectorAll("#chosenKweens button#remove"));
        removeButtons.forEach((button) => {
            button.click();
        });
    }

    function getSearchResultCards() {
        return Array.from(document.querySelectorAll(".search-result-card"));
    }

    function getCardByQueenName(name) {
        return getSearchResultCards().find((card) => {
            const queenName = String(card.dataset.queenName || card.id || "").trim();
            return queenName === name;
        }) || null;
    }

    function setCardPreviewImage(card, imageIndex) {
        if (!card) return;

        const stepCount = Math.max(0, Number(imageIndex) || 0);
        if (!stepCount) return;

        const rightArrow = card.querySelector(".imgArrow:last-of-type");
        if (!rightArrow) return;

        for (let i = 0; i < stepCount; i++) {
            rightArrow.click();
        }
    }

    function restoreCastFromPayload(payload) {
        if (!payload || !Array.isArray(payload.cast)) return false;

        const cards = getSearchResultCards();
        if (!cards.length) {
            return false;
        }

        const allCardsReady = payload.cast.every((entry) => !!getCardByQueenName(entry.name));
        if (!allCardsReady) {
            return false;
        }

        clearCurrentCastFromDom();

        payload.cast.forEach((entry) => {
            const card = getCardByQueenName(entry.name);
            if (!card) return;

            setCardPreviewImage(card, entry.imageIndex);
            card.click();
        });

        const chosenCards = document.querySelectorAll("#chosenKweens .card").length;
        syncCastUi(chosenCards);
        return chosenCards === payload.cast.length;
    }

    function applyPendingHomeSettings(attempt = 0, cachedPayload = null) {
        const formatEl = document.getElementById("format");
        const finaleEl = document.getElementById("finale");
        const premiereEl = document.getElementById("premiere-format");
        const returningEl = document.getElementById("returning");

        if (!formatEl || !finaleEl || !premiereEl || !returningEl) return;

        let payload = cachedPayload;
        if (!payload) {
            try {
                payload = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            } catch (_err) {
                payload = null;
            }
        }

        if (!payload || typeof payload !== "object") return;

        setSelectValue("format", payload.format);
        const premiereGroup = document.getElementById("premiere-group");
        const premiereType = document.getElementById("premiere-type");
        if (premiereGroup && premiereType && typeof window.updatePremiereTypes === "function") {
            const premiereGroupName = ["single", "late", "double", "triple"].find((groupName) => {
                premiereGroup.value = groupName;
                window.updatePremiereTypes(payload.premiere);
                return Array.from(premiereType.options || []).some((option) => option.value === payload.premiere);
            });
            if (premiereGroupName) {
                premiereGroup.value = premiereGroupName;
                window.updatePremiereTypes(payload.premiere);
            }
        }
        setSelectValue("premiere-format", payload.premiere);
        setSelectValue("returning", payload.returning);
        const finaleSize = document.getElementById("finale-size");
        const finaleType = document.getElementById("finale-type");
        if (finaleSize && finaleType && typeof window.updateFinaleTypes === "function") {
            const finaleSizeName = ["2", "3", "4", "5", "6", "7", "8"].find((size) => {
                finaleSize.value = size;
                window.updateFinaleTypes(payload.finale);
                return Array.from(finaleType.options || []).some((option) => option.value === payload.finale);
            });
            if (finaleSizeName) {
                finaleSize.value = finaleSizeName;
                window.updateFinaleTypes(payload.finale);
            }
        }
        setSelectValue("finale", payload.finale);

        const restored = restoreCastFromPayload(payload);
        if (!restored && attempt < 20) {
            window.requestAnimationFrame(() => applyPendingHomeSettings(attempt + 1, payload));
            return;
        }

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (_err) {}
    }

    function styleActionButton(button, minWidth, options = {}) {
        if (!button) return;

        const height = Number(options.height) || 42;
        const padding = options.padding || "0.6rem 0.75rem";

        button.style.display = "inline-flex";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.gap = "6px";
        button.style.minWidth = String(minWidth || 52) + "px";
        button.style.height = String(height) + "px";
        button.style.padding = padding;
        button.style.whiteSpace = "nowrap";
        button.style.fontWeight = "700";
        button.style.margin = "0";
    }

    function ensureActionRow(block, simButton) {
        let row = block.querySelector(".predef-action-row");
        if (!row) {
            row = document.createElement("div");
            row.className = "predef-action-row";
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.justifyContent = "center";
            row.style.flexWrap = "nowrap";
            row.style.gap = "6px";
            row.style.marginTop = "0.5rem";
            row.style.position = "relative";
            row.style.zIndex = "2";
            row.style.width = "max-content";
            row.style.marginLeft = "auto";
            row.style.marginRight = "auto";

            if (simButton && simButton.parentElement !== row) {
                simButton.insertAdjacentElement("beforebegin", row);
                row.appendChild(simButton);
            }
        }
        return row;
    }

    function addHomeButtonsToPredefCards() {
        const seasonBlocks = document.querySelectorAll(".content-season");
        if (!seasonBlocks.length) return;

        seasonBlocks.forEach((block) => {
            const simButton = block.querySelector("button[onclick]");
            if (!simButton) return;

            const onclickText = simButton.getAttribute("onclick") || "";
            if (!/^\s*predefCast\(/.test(onclickText)) return;

            const actionRow = ensureActionRow(block, simButton);
            simButton.title = "Use Cast";
            simButton.setAttribute("aria-label", "Use Cast");
            styleActionButton(simButton, 78, { height: 46, padding: "0.65rem 0.95rem" });
            simButton.style.fontSize = "1rem";

            const trackRecordButton = block.querySelector(".tr-mode-btn");
            if (trackRecordButton) {
                styleActionButton(trackRecordButton, 46, { height: 40, padding: "0.5rem 0.6rem" });
                trackRecordButton.style.fontSize = "0.92rem";
                if (trackRecordButton.parentElement !== actionRow) {
                    actionRow.appendChild(trackRecordButton);
                }
            }

            let homeButton = block.querySelector(".home-season-btn");
            if (!homeButton) {
                homeButton = document.createElement("button");
                homeButton.type = "button";
                homeButton.className = "home-season-btn";
                homeButton.title = "Open on Home with this cast and settings";
                homeButton.setAttribute("aria-label", "Open on Home with this cast and settings");
                homeButton.innerHTML = '<i class="fa-solid fa-sliders"></i>';
                homeButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    if (!saveHomeSettingsFromPredefButton(simButton)) {
                        alert("Could not load this cast and season settings.");
                        return;
                    }
                    window.location.href = "index.html";
                });
            }

            styleActionButton(homeButton, 64);
            if (homeButton.parentElement !== actionRow) {
                actionRow.appendChild(homeButton);
            }
        });
    }

    const path = String(window.location.pathname || "").toLowerCase();
    if (path.includes("predef.html")) {
        addHomeButtonsToPredefCards();
    }

    // Added for the new Seasons page: lets seasons.js reuse this exact function for the "open on Home" button.
    window.saveHomeSettingsFromPredefButton = saveHomeSettingsFromPredefButton;
    window.saveSeasonSettingsPreset = saveSeasonSettingsPreset;
    window.applySeasonSettingsPreset = applySeasonSettingsPreset;
    window.DragSeasonSettings = { captureTwists: capturePresetControls, applyTwists: settings => applySeasonSettingsValues({ controls: settings }, "twists") };
    window.deleteSeasonSettingsPreset = deleteSeasonSettingsPreset;
    window.toggleSeasonSettingsPresetPopup = toggleSeasonSettingsPresetPopup;
    window.closeSeasonSettingsPresetPopups = closeSeasonSettingsPresetPopups;
    window.closeSeasonSettingsPresetPopup = closeSeasonSettingsPresetPopup;
    refreshSeasonSettingsPresetOptions("formats");
    refreshSeasonSettingsPresetOptions("twists");
    document.querySelectorAll(".sim-settings-preset-popup").forEach((popup) => {
        const scope = popup.id === "twist-presets-popup" ? "twists" : "formats";
        popup.addEventListener("click", (event) => {
            if (event.target === popup) closeSeasonSettingsPresetPopup(scope);
        });
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSeasonSettingsPresetPopups()?.focus();
    });
    applyPendingHomeSettings();
})();
