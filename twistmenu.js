function initTwistModifierToggles(e) {
    const t = Array.from(e.querySelectorAll(".twist-trigger"));
    if (!t.length) return;
    const o = t => {
        const o = t.dataset.twist;
        if (!o) return;
        const i = e.querySelector(`.twist-modifiers[data-twist="${o}"]`);
        if (!i) return;
        const n = Boolean(t.checked);
        i.classList.toggle("active", n);
        Array.from(i.querySelectorAll(".twist-modifier-checkbox")).forEach(e => {
            e.disabled = !n, n || (e.checked = !1);
        });
    };
    t.forEach(e => {
        o(e), e.addEventListener("change", () => o(e));
    });
}

function initTwistMenuTabs(root) {
    const groups = [
        { id: "gameplay", label: "Gameplay", sections: ["Twists", "Brackets", "Groups", "Special Modes", "RuPaul Mode"] },
        { id: "episodes", label: "Episodes", sections: ["Disable", "Minis", "Lipsync Challenge", "Special Episodes"] },
        { id: "judging", label: "Judging", sections: ["Judging", "Prize Customization", "Titles"] },
        { id: "preferences", label: "Preferences", sections: ["Live Streaming", "Style", "Accessibility"] }
    ];
    const content = root.querySelector(".all-options");
    const sections = Array.from(content.querySelectorAll("details.menu-section"));
    const tabs = document.createElement("div");
    tabs.className = "twist-menu-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Twist menu categories");
    const panels = [];
    const buttons = [];
    groups.forEach(group => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "twist-menu-tab";
        button.id = "twist-tab-" + group.id;
        button.textContent = group.label;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", "twist-panel-" + group.id);
        const panel = document.createElement("div");
        panel.id = "twist-panel-" + group.id;
        panel.className = "twist-menu-tab-panel";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", button.id);
        group.sections.forEach(title => {
            const section = sections.find(section => section.querySelector(":scope > summary").textContent.trim() === title);
            if (!section) throw new Error("Missing twist menu section: " + title);
            panel.appendChild(section);
        });
        tabs.appendChild(button);
        buttons.push(button);
        panels.push(panel);
    });
    if (sections.some(section => !panels.some(panel => panel.contains(section)))) {
        throw new Error("A twist menu section has no category.");
    }
    content.replaceChildren(...panels);
    content.before(tabs);
    sections.forEach(section => {
        section.addEventListener("toggle", () => {
            if (section.open && !section.closest("[hidden]")) {
                window.DragUi.reveal(section.querySelector(":scope > .menu-section-body"));
            }
        });
    });
    let selectedIndex = -1;
    const select = index => {
        if (selectedIndex === index) return;
        buttons.forEach((button, position) => {
            button.setAttribute("aria-selected", String(index === position));
            button.tabIndex = index === position ? 0 : -1;
            panels[position].hidden = index !== position;
        });
        content.scrollTop = 0;
        if (selectedIndex !== -1) window.DragUi.reveal(panels[index]);
        selectedIndex = index;
    };
    buttons.forEach((button, index) => {
        button.addEventListener("click", () => select(index));
        button.addEventListener("keydown", event => {
            let next;
            if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
            else if (event.key === "ArrowLeft") next = (index + buttons.length - 1) % buttons.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = buttons.length - 1;
            else return;
            event.preventDefault();
            select(next);
            buttons[next].focus();
        });
    });
    select(0);
}

function initTwistMenuToggle(root) {
    const checkbox = root.querySelector("#showOpt");
    const toggle = root.querySelector("#twist-menu-toggle");
    const panel = root.querySelector("#twist-menu-panel");
    const fullscreen = root.querySelector("#twistMenuFullscreen");
    if (!checkbox || !toggle || !panel) return;
    const close = () => {
        checkbox.checked = false;
        if (fullscreen) fullscreen.checked = false;
        root.querySelector(".twist-menu-expand-btn")?.setAttribute("aria-pressed", "false");
        sync();
    };
    const sync = () => {
        const open = checkbox.checked;
        toggle.setAttribute("aria-expanded", String(open));
        panel.setAttribute("aria-hidden", String(!open));
        panel.inert = !open;
        root.classList.toggle("twist-menu-open", open);
        if (open) window.DragUi.activateDialog(panel, close);
        else window.DragUi.deactivateDialog(panel);
    };
    toggle.addEventListener("click", () => {
        checkbox.checked = !checkbox.checked;
        sync();
    });
    checkbox.addEventListener("change", sync);
    root.querySelector("[data-twist-menu-close]")?.addEventListener("click", close);
    root.querySelector(".twist-menu-expand-btn")?.addEventListener("click", event => {
        fullscreen.checked = !fullscreen.checked;
        event.currentTarget.setAttribute("aria-pressed", String(fullscreen.checked));
    });
    sync();
}

function applyMobileTooltips(e) {
    const t = Array.from(e.querySelectorAll(".tooltip"));
    if (!t.length) return;
    const o = () => window.matchMedia("(max-width: 768px)").matches, i = () => {
        t.forEach(e => e.classList.remove("active"));
    }, n = e => {
        if (!o()) return;
        e.stopPropagation();
        const t = e.currentTarget, n = t.classList.contains("active");
        i(), n || t.classList.add("active");
    };
    t.forEach(e => {
        e.addEventListener("click", n);
    }), document.addEventListener("click", () => {
        o() && i();
    }), window.addEventListener("resize", () => {
        o() || i();
    });
}

function populateUnlockedCodeTwists() {
    const e = document.getElementById("unlockedCodeTwists");
    if (!e) return;
    let t = [], o = null;
    try {
        t = Array.isArray(unlockedTwists) ? unlockedTwists : [], o = twists;
    } catch (e) {
        return;
    }
    if (!t.length) return;
    if (!o || "object" != typeof o) return;
    let i = !1;
    if (t.forEach(t => {
        if (o[t]) {
            i = !0;
            const n = o[t], c = document.createElement("p"), s = document.createElement("input");
            s.type = "checkbox", s.id = t;
            const a = document.createTextNode(n.name);
            c.appendChild(s), c.appendChild(a), e.appendChild(c);
        }
    }), i) {
        const t = document.createElement("h3");
        t.textContent = "Unlocked Code Twists:", e.parentElement.insertBefore(t, e);
    }
}

function syncDevWerkroomToggle(e) {
    const t = e.querySelector("#dev-werkroom-toggle");
    if (!t) return;
    const o = "function" == typeof window.isDevModeEnabled && window.isDevModeEnabled(), i = "function" == typeof window.setDevModePanelOpen;
    t.disabled = !i, t.checked = !(!o || "function" != typeof window.isDevModePanelOpen) && window.isDevModePanelOpen();
}

function applyAccessibilitySettings(e = {}) {
    if (!document.documentElement || !document.body) return;
    const t = {
        small: "90%",
        default: "100%",
        large: "110%",
        larger: "120%"
    }, o = {
        default: "1.5",
        comfortable: "1.7",
        spacious: "1.9"
    };
    document.documentElement.style.fontSize = t[e.fontSize] || t.default, document.body.style.letterSpacing = {
        default: "",
        relaxed: "0.03em",
        wide: "0.06em"
    }[e.letterSpacing] ?? "", document.body.style.lineHeight = o[e.lineHeight] || o.default,
    document.body.classList.toggle("accessibility-high-contrast", Boolean(e.highContrast)),
    document.body.classList.toggle("accessibility-reduce-motion", Boolean(e.reduceMotion)),
    document.body.classList.toggle("accessibility-enhanced-focus", Boolean(e.enhancedFocus)),
    document.body.classList.toggle("accessibility-underline-links", Boolean(e.underlineLinks));
}

function initStyleSettingsPersistence(e) {
    const t = e.querySelector("#style-mode"), o = e.querySelector("#font-mode"), i = e.querySelector("#night-mode"), n = e.querySelector("#background"), c = e.querySelector("#square-tr"), s = e.querySelector("#round-tr"), a = e.querySelector("#tr-flags-off"), l = e.querySelector("#savedAsLow"), r = e.querySelector("#dev-werkroom-toggle"), d = e.querySelector("#accessibility-font-size"), u = e.querySelector("#accessibility-letter-spacing"), y = e.querySelector("#accessibility-line-height"), f = e.querySelector("#accessibility-high-contrast"), h = e.querySelector("#accessibility-reduce-motion"), g = e.querySelector("#accessibility-enhanced-focus"), p = e.querySelector("#accessibility-underline-links");
    if (!(t || o || i || n || c || s || a || l || r || d || u || y || f || h || g || p)) return;
    const b = "twistMenuStyleSettings", m = () => ({
        fontSize: d ? d.value : "default",
        letterSpacing: u ? u.value : "default",
        lineHeight: y ? y.value : "default",
        highContrast: !!f && f.checked,
        reduceMotion: !!h && h.checked,
        enhancedFocus: !g || g.checked,
        underlineLinks: !p || p.checked
    });
    if ([ t, o, i, n, c, s, a, l, d, u, y, f, h, g, p ].forEach(e => {
        e && e.addEventListener("change", () => {
            (() => {
                const e = {
                    styleMode: t ? t.value : "",
                    fontMode: o ? o.value : "",
                    nightMode: !!i && i.checked,
                    background: !!n && n.checked,
                    squareTr: !!c && c.checked,
                    roundTr: !!s && s.checked,
                    trFlagsOff: !!a && a.checked,
                    savedAsLow: !!l && l.checked,
                    accessibilityFontSize: d ? d.value : "default",
                    accessibilityLetterSpacing: u ? u.value : "default",
                    accessibilityLineHeight: y ? y.value : "default",
                    accessibilityHighContrast: !!f && f.checked,
                    accessibilityReduceMotion: !!h && h.checked,
                    accessibilityEnhancedFocus: !g || g.checked,
                    accessibilityUnderlineLinks: !p || p.checked
                };
                localStorage.setItem(b, JSON.stringify(e));
            })(), applyAccessibilitySettings(m());
        });
    }), o && o.addEventListener("change", e => {
        "function" == typeof applyFontMode && applyFontMode(e.target.value);
    }), i && i.addEventListener("change", e => {
        "function" == typeof window.changeTheme && window.changeTheme(e.target.checked ? "dark" : "light");
    }), r) {
        const t = () => {
            syncDevWerkroomToggle(e);
        };
        r.addEventListener("change", () => {
            "function" == typeof window.isDevModeEnabled && window.isDevModeEnabled() || !r.checked || "function" != typeof window.enableDevMode ? ("function" == typeof window.setDevModePanelOpen ? window.setDevModePanelOpen(r.checked) : "function" == typeof window.toggleDevModePanel && window.toggleDevModePanel(!r.checked),
            t()) : window.enableDevMode();
        }), window.addEventListener("ss-dev-panel-visibility", t), t();
    }
    (() => {
        const e = localStorage.getItem(b);
        if (e) try {
            const r = JSON.parse(e);
            if (t && "string" == typeof r.styleMode) {
                Array.from(t.options).some(e => e.value === r.styleMode) && (t.value = r.styleMode);
            }
            if (o && "string" == typeof r.fontMode) {
                Array.from(o.options).some(e => e.value === r.fontMode) && (o.value = r.fontMode),
                "function" == typeof applyFontMode && applyFontMode(r.fontMode);
            }
            if (i && "boolean" == typeof r.nightMode && (i.checked = r.nightMode, "function" == typeof window.changeTheme && window.changeTheme(r.nightMode ? "dark" : "light")),
            n && "boolean" == typeof r.background && (n.checked = r.background), c && "boolean" == typeof r.squareTr && (c.checked = r.squareTr),
            s && "boolean" == typeof r.roundTr && (s.checked = r.roundTr), a && "boolean" == typeof r.trFlagsOff && (a.checked = r.trFlagsOff),
            l && "boolean" == typeof r.savedAsLow && (l.checked = r.savedAsLow), d && "string" == typeof r.accessibilityFontSize) {
                Array.from(d.options).some(e => e.value === r.accessibilityFontSize) && (d.value = r.accessibilityFontSize);
            }
            if (u && "string" == typeof r.accessibilityLetterSpacing) {
                Array.from(u.options).some(e => e.value === r.accessibilityLetterSpacing) && (u.value = r.accessibilityLetterSpacing);
            }
            if (y && "string" == typeof r.accessibilityLineHeight) {
                Array.from(y.options).some(e => e.value === r.accessibilityLineHeight) && (y.value = r.accessibilityLineHeight);
            }
            f && "boolean" == typeof r.accessibilityHighContrast && (f.checked = r.accessibilityHighContrast),
            h && "boolean" == typeof r.accessibilityReduceMotion && (h.checked = r.accessibilityReduceMotion),
            g && "boolean" == typeof r.accessibilityEnhancedFocus && (g.checked = r.accessibilityEnhancedFocus),
            p && "boolean" == typeof r.accessibilityUnderlineLinks && (p.checked = r.accessibilityUnderlineLinks),
            applyAccessibilitySettings(m());
        } catch (e) {
            console.warn("Failed to load style settings:", e), applyAccessibilitySettings(m());
        } else applyAccessibilitySettings(m());
    })();
}

document.addEventListener("DOMContentLoaded", () => {
    const e = document.getElementById("twist-menu-root");
    if (!e) return;
    const t = e.dataset.src || "twist-menu.html";
    fetch(t, {
        cache: "no-cache"
    }).then(e => {
        if (!e.ok) throw new Error(`Failed to load twist menu: ${e.status}`);
        return e.text();
    }).then(t => {
        e.innerHTML = t, initTwistMenuTabs(e), populateUnlockedCodeTwists(), applyMobileTooltips(e),
        initTwistMenuToggle(e), initTwistModifierToggles(e), initStyleSettingsPersistence(e);
        document.dispatchEvent(new Event("drag-twist-menu-ready"));
        const o = document.getElementById("font-mode");
        o && "function" == typeof applyFontMode && applyFontMode(o.value);
    }).catch(t => {
        console.error(t), e.innerHTML = '<p class="twist-menu-error">Unable to load twist menu right now.</p>';
    });
});