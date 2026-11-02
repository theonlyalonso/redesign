"use strict";

/* Trends page: reads the anonymous totals from usageStats/ and draws them.
   Names only appear if they're on the official roster, so nobody can post their own text here. */
(function initTrends() {
    const TOP_QUEENS = 15;
    const TOP_SEASONS = 12;
    const TREND_DAYS = 30;
    const QUERY_LIMIT = 60;
    const MIN_PICKS_FOR_RATE = 5;
    const FALLBACK_IMAGE = "image/queens/noimage.jpg";
    const CHART_HEIGHT = 220;

    const root = document.getElementById("trends");
    const statusEl = document.getElementById("trendsStatus");
    if (!root) return;

    const tooltip = document.createElement("div");
    tooltip.className = "trends-tooltip";
    tooltip.hidden = true;
    tooltip.setAttribute("role", "status");
    document.body.appendChild(tooltip);

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function svg(tag, attrs) {
        const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }

    function compact(value) {
        if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
        if (value >= 1e4) return (value / 1e3).toFixed(value >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
        return Math.round(value).toLocaleString();
    }

    function showTooltip(strong, detail, x, y) {
        tooltip.innerHTML = "";
        tooltip.append(el("b", "", strong), el("span", "", detail));
        tooltip.hidden = false;
        const box = tooltip.getBoundingClientRect();
        tooltip.style.left = Math.max(8, Math.min(window.innerWidth - box.width - 8, x + 12)) + "px";
        tooltip.style.top = Math.max(8, y - box.height - 10) + "px";
    }

    function hideTooltip() {
        tooltip.hidden = true;
    }

    function getRoster() {
        const roster = new Map();
        try {
            // allQueens is the simulator's own list (index.js); custom queens never reach these totals.
            (typeof allQueens !== "undefined" && Array.isArray(allQueens) ? allQueens : []).forEach((queen) => {
                if (queen && queen.name && !queen.customqueen) roster.set(String(queen.name).toLowerCase(), queen);
            });
        } catch (_err) {
            // Without a roster nothing can be verified, so no queen names are shown.
        }
        return roster;
    }

    const FRANCHISE_NAMES = {
        US: "US", USA: "US", UK: "UK", CA: "Canada", CAN: "Canada", CANADA: "Canada", ES: "Spain", ESPANA: "Spain", SPAIN: "Spain",
        AU: "Down Under", DU: "Down Under", FR: "France", FRANCE: "France", IT: "Italy", ITALY: "Italy", PH: "Philippines",
        PHILIPPINES: "Philippines", TH: "Thailand", THAILAND: "Thailand", NL: "Holland", HOLLAND: "Holland", BE: "Belgium",
        BELGIUM: "Belgium", MX: "Mexico", MEXICO: "Mexico", BR: "Brazil", BRAZIL: "Brazil", SE: "Sweden", SWEDEN: "Sweden",
        DE: "Germany", GERMANY: "Germany", CL: "Chile", CHILE: "Chile"
    };

    function franchiseLabel(key) {
        return FRANCHISE_NAMES[key] || key.charAt(0) + key.slice(1).toLowerCase();
    }

    function formatLabel(key) {
        const select = document.querySelector('select#format option[value="' + CSS.escape(key) + '"]');
        if (select) return select.textContent.trim();
        return key.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    /* ---------- Horizontal bars: one row per item, value at the tip ---------- */
    function buildBars(rows, options = {}) {
        if (rows.length === 0) return el("p", "trends-empty", options.empty || "Nothing to show yet.");
        const list = el("ol", "trends-bars");
        const max = Math.max(...rows.map((row) => row.value));
        rows.forEach((row) => {
            const item = el("li", "trends-bar" + (row.image === undefined ? " trends-bar--plain" : ""));
            item.tabIndex = 0;
            if (row.image !== undefined) {
                const photo = el("img", "trends-bar__photo");
                photo.src = row.image || FALLBACK_IMAGE;
                photo.alt = "";
                photo.loading = "lazy";
                photo.decoding = "async";
                photo.onerror = () => { photo.onerror = null; photo.src = FALLBACK_IMAGE; };
                item.appendChild(photo);
            }
            const name = el("span", "trends-bar__name", row.label);
            name.title = row.label;
            const track = el("span", "trends-bar__track");
            const fill = el("span", "trends-bar__fill");
            fill.style.width = (max > 0 ? (row.value / max) * 100 : 0) + "%";
            track.appendChild(fill);
            item.append(name, track, el("span", "trends-bar__value", row.display || compact(row.value)));

            const strong = row.display || row.value.toLocaleString();
            const detail = row.label + (row.detail ? " · " + row.detail : "");
            item.addEventListener("pointermove", (event) => showTooltip(strong, detail, event.clientX, event.clientY));
            item.addEventListener("pointerleave", hideTooltip);
            item.addEventListener("focus", () => {
                const box = item.getBoundingClientRect();
                showTooltip(strong, detail, box.left + box.width / 2, box.top);
            });
            item.addEventListener("blur", hideTooltip);
            list.appendChild(item);
        });
        return list;
    }

    function niceMax(value) {
        if (value <= 4) return 4;
        const power = Math.pow(10, Math.floor(Math.log10(value)));
        const step = [1, 2, 2.5, 5, 10].map((multiple) => multiple * power).find((candidate) => candidate * 4 >= value);
        return step * 4;
    }

    /* ---------- Line: seasons started per day ---------- */
    function buildLine(days) {
        const wrap = el("div");
        const chart = el("div", "trends-line");
        chart.tabIndex = 0;
        chart.setAttribute("role", "img");
        const total = days.reduce((sum, day) => sum + day.value, 0);
        chart.setAttribute("aria-label", total.toLocaleString() + " seasons started over the last " + days.length + " days. A table follows.");
        wrap.appendChild(chart);

        const formatDay = (day) => new Date(day + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
        let activeIndex = -1;
        let layout = null;

        function draw() {
            const width = chart.clientWidth;
            if (!width) return;
            chart.innerHTML = "";
            const margin = { top: 12, right: 28, bottom: 24, left: 38 };
            const plotWidth = width - margin.left - margin.right;
            const plotHeight = CHART_HEIGHT - margin.top - margin.bottom;
            const yMax = niceMax(Math.max(...days.map((day) => day.value), 1));
            const x = (index) => margin.left + (days.length > 1 ? (index / (days.length - 1)) * plotWidth : plotWidth / 2);
            const y = (value) => margin.top + plotHeight - (value / yMax) * plotHeight;
            layout = { x, y, margin, plotWidth };

            const canvas = svg("svg", { viewBox: `0 0 ${width} ${CHART_HEIGHT}`, "aria-hidden": "true" });
            for (let tick = 0; tick <= 4; tick += 1) {
                const value = (yMax / 4) * tick;
                canvas.appendChild(svg("line", { class: "trends-line__grid", x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value) }));
                const label = svg("text", { x: margin.left - 8, y: y(value) + 4, "text-anchor": "end" });
                label.textContent = compact(value);
                canvas.appendChild(label);
            }
            [0, Math.floor((days.length - 1) / 2), days.length - 1].forEach((index, position) => {
                const label = svg("text", { x: x(index), y: CHART_HEIGHT - 6, "text-anchor": ["start", "middle", "end"][position] });
                label.textContent = formatDay(days[index].day);
                canvas.appendChild(label);
            });

            const points = days.map((day, index) => `${x(index)},${y(day.value)}`);
            const baseline = y(0);
            canvas.appendChild(svg("polygon", { class: "trends-line__area", points: `${x(0)},${baseline} ${points.join(" ")} ${x(days.length - 1)},${baseline}` }));
            canvas.appendChild(svg("polyline", { class: "trends-line__path", points: points.join(" ") }));

            const last = days[days.length - 1];
            canvas.appendChild(svg("circle", { class: "trends-line__dot", cx: x(days.length - 1), cy: y(last.value), r: 4 }));
            const endLabel = svg("text", { class: "trends-line__end", x: x(days.length - 1) + 8, y: y(last.value) + 4 });
            endLabel.textContent = compact(last.value);
            canvas.appendChild(endLabel);

            const cross = svg("line", { class: "trends-line__cross", y1: margin.top, y2: baseline, visibility: "hidden" });
            const crossDot = svg("circle", { class: "trends-line__dot", r: 4, visibility: "hidden" });
            canvas.append(cross, crossDot);
            layout.cross = cross;
            layout.crossDot = crossDot;
            chart.appendChild(canvas);
        }

        function highlight(index) {
            if (!layout) return;
            activeIndex = Math.max(0, Math.min(days.length - 1, index));
            const day = days[activeIndex];
            const px = layout.x(activeIndex);
            const py = layout.y(day.value);
            layout.cross.setAttribute("x1", px);
            layout.cross.setAttribute("x2", px);
            layout.cross.setAttribute("visibility", "visible");
            layout.crossDot.setAttribute("cx", px);
            layout.crossDot.setAttribute("cy", py);
            layout.crossDot.setAttribute("visibility", "visible");
            const box = chart.getBoundingClientRect();
            showTooltip(day.value.toLocaleString() + " started", formatDay(day.day) + " · " + day.finished.toLocaleString() + " finished", box.left + px, box.top + py);
        }

        function clearHighlight() {
            activeIndex = -1;
            hideTooltip();
            if (layout) {
                layout.cross.setAttribute("visibility", "hidden");
                layout.crossDot.setAttribute("visibility", "hidden");
            }
        }

        chart.addEventListener("pointermove", (event) => {
            if (!layout) return;
            const box = chart.getBoundingClientRect();
            const ratio = (event.clientX - box.left - layout.margin.left) / layout.plotWidth;
            highlight(Math.round(ratio * (days.length - 1)));
        });
        chart.addEventListener("pointerleave", clearHighlight);
        chart.addEventListener("focus", () => highlight(days.length - 1));
        chart.addEventListener("blur", clearHighlight);
        chart.addEventListener("keydown", (event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                highlight((activeIndex < 0 ? days.length - 1 : activeIndex) + (event.key === "ArrowLeft" ? -1 : 1));
            }
        });

        new ResizeObserver(() => { clearHighlight(); draw(); }).observe(chart);

        const details = el("details", "trends-table");
        details.appendChild(el("summary", "", "View as table"));
        const table = el("table");
        const head = el("tr");
        ["Day", "Started", "Finished"].forEach((label) => head.appendChild(el("th", "", label)));
        table.appendChild(head);
        days.slice().reverse().forEach((day) => {
            const row = el("tr");
            [formatDay(day.day), day.value.toLocaleString(), day.finished.toLocaleString()].forEach((value) => row.appendChild(el("td", "", value)));
            table.appendChild(row);
        });
        details.appendChild(table);
        wrap.appendChild(details);
        return wrap;
    }

    function buildCard(title, subtitle, body, options = {}) {
        const card = el("section", "trends-card" + (options.wide ? " trends-card--wide" : ""));
        const head = el("div", "trends-card__head");
        const copy = el("div");
        copy.append(el("h2", "", title), el("p", "", subtitle));
        head.appendChild(copy);
        if (options.control) head.appendChild(options.control);
        card.append(head, body);
        return card;
    }

    function collect(snapshot) {
        const rows = [];
        snapshot.forEach((child) => { rows.push({ key: child.key, ...(child.val() || {}) }); });
        return rows;
    }

    function buildDays(rawDays) {
        const byDay = new Map(rawDays.map((day) => [day.key, day]));
        const days = [];
        const today = new Date();
        for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
            const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
            const key = date.toISOString().slice(0, 10);
            const entry = byDay.get(key) || {};
            days.push({ day: key, value: Number(entry.started) || 0, finished: Number(entry.finished) || 0 });
        }
        return days;
    }

    function render(data) {
        const roster = getRoster();
        const merged = new Map();
        [...data.queensByPicks, ...data.queensByCrowns].forEach((queen) => {
            const official = queen.name ? roster.get(String(queen.name).toLowerCase()) : null;
            if (official) {
                merged.set(queen.key, {
                    name: official.name,
                    image: typeof official.getCurrentImage === "function" ? official.getCurrentImage() : "",
                    picks: Number(queen.picks) || 0,
                    crowns: Number(queen.crowns) || 0
                });
            }
        });
        const queens = Array.from(merged.values());
        const totals = data.totals || {};
        const started = Number(totals.started) || 0;
        const finished = Number(totals.finished) || 0;

        root.innerHTML = "";
        if (started === 0 && queens.length === 0) {
            root.appendChild(el("p", "trends-status", "No simulations counted yet. Start a season and check back!"));
            return;
        }

        const topPick = queens.slice().sort((a, b) => b.picks - a.picks)[0];
        const seasons = data.seasons
            .filter((season) => season.title && Number(season.plays) > 0)
            .sort((a, b) => Number(b.plays) - Number(a.plays));

        const tiles = el("div", "trends-tiles");
        [
            ["Seasons started", compact(started), false, ""],
            ["Seasons finished", compact(finished), false, started ? Math.round((finished / started) * 100) + "% finish rate" : ""],
            ["Most picked queen", topPick ? topPick.name : "None yet", true, topPick ? topPick.picks.toLocaleString() + " casts" : ""],
            ["Most played season", seasons[0] ? seasons[0].title : "None yet", true, seasons[0] ? Number(seasons[0].plays).toLocaleString() + " plays" : ""]
        ].forEach(([label, value, isName, note]) => {
            const tile = el("div", "trends-tile");
            tile.append(el("p", "trends-tile__label", label), el("p", "trends-tile__value" + (isName ? " trends-tile__value--name" : ""), value));
            if (note) tile.appendChild(el("p", "trends-tile__note", note));
            tiles.appendChild(tile);
        });
        root.appendChild(tiles);

        const grid = el("div", "trends-grid");
        grid.appendChild(buildCard("Seasons started per day", "The last " + TREND_DAYS + " days, in UTC", buildLine(buildDays(data.daily)), { wide: true }));

        const QUEEN_VIEWS = {
            picks: {
                label: "Most picked", subtitle: "How often each queen gets cast",
                rows: () => queens.filter((queen) => queen.picks > 0).sort((a, b) => b.picks - a.picks).map((queen) => ({ label: queen.name, image: queen.image, value: queen.picks, detail: "cast" }))
            },
            crowns: {
                label: "Most crowned", subtitle: "Who keeps taking the crown home",
                rows: () => queens.filter((queen) => queen.crowns > 0).sort((a, b) => b.crowns - a.crowns).map((queen) => ({ label: queen.name, image: queen.image, value: queen.crowns, detail: "crowned" }))
            },
            rate: {
                label: "Crown rate", subtitle: "Crowns per cast, with at least " + MIN_PICKS_FOR_RATE + " casts",
                rows: () => queens.filter((queen) => queen.picks >= MIN_PICKS_FOR_RATE && queen.crowns > 0)
                    .map((queen) => ({ label: queen.name, image: queen.image, value: queen.crowns / queen.picks, display: Math.round((queen.crowns / queen.picks) * 100) + "%", detail: queen.crowns + " of " + queen.picks + " casts" }))
                    .sort((a, b) => b.value - a.value)
            }
        };
        const queenBody = el("div");
        const queenSubtitle = { node: null };
        const control = el("div", "trends-toggle");
        control.setAttribute("role", "group");
        control.setAttribute("aria-label", "Queen ranking");
        const showQueens = (view) => {
            queenBody.innerHTML = "";
            queenBody.appendChild(buildBars(QUEEN_VIEWS[view].rows().slice(0, TOP_QUEENS), { empty: "No queens to rank here yet." }));
            if (queenSubtitle.node) queenSubtitle.node.textContent = QUEEN_VIEWS[view].subtitle;
            control.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", button.dataset.view === view ? "true" : "false"));
        };
        Object.entries(QUEEN_VIEWS).forEach(([view, config]) => {
            const button = el("button", "", config.label);
            button.type = "button";
            button.dataset.view = view;
            button.addEventListener("click", () => showQueens(view));
            control.appendChild(button);
        });
        const queenCard = buildCard("Queens", QUEEN_VIEWS.picks.subtitle, queenBody, { control });
        queenSubtitle.node = queenCard.querySelector(".trends-card__head p");
        showQueens("picks");
        grid.appendChild(queenCard);

        const side = el("div", "trends");
        side.appendChild(buildCard("Seasons", "The most played preset casts", buildBars(seasons.slice(0, TOP_SEASONS).map((season) => ({
            label: season.title,
            value: Number(season.plays),
            detail: (Number(season.finishes) || 0).toLocaleString() + " finished"
        })), { empty: "No preset seasons played yet." })));
        const toRows = (object, labeller) => {
            // Different codes can mean the same franchise (USA and US), so totals group by label.
            const totalsByLabel = new Map();
            Object.entries(object || {}).forEach(([key, value]) => {
                const label = labeller(key);
                totalsByLabel.set(label, (totalsByLabel.get(label) || 0) + (Number(value) || 0));
            });
            return Array.from(totalsByLabel, ([label, value]) => ({ label, value }))
                .filter((row) => row.value > 0)
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);
        };
        side.appendChild(buildCard("Formats", "How people like to play", buildBars(toRows(data.formats, formatLabel), { empty: "No formats counted yet." })));
        side.appendChild(buildCard("Franchises", "Where the cast picks come from", buildBars(toRows(data.franchises, franchiseLabel), { empty: "No franchises counted yet." })));
        grid.appendChild(side);
        root.appendChild(grid);
        root.appendChild(el("p", "trends-note", "Anonymous totals from signed-in players. Custom queens aren't counted."));
    }

    async function load() {
        let db = null;
        try {
            db = firebase.apps.length ? firebase.database() : null;
        } catch (_err) {
            db = null;
        }
        if (!db) {
            statusEl.textContent = "The numbers can't load right now.";
            return;
        }
        try {
            const base = "usageStats/";
            const [totals, queensByPicks, queensByCrowns, seasons, formats, franchises, daily] = await Promise.all([
                db.ref(base + "totals").once("value"),
                db.ref(base + "queens").orderByChild("picks").limitToLast(QUERY_LIMIT).once("value"),
                db.ref(base + "queens").orderByChild("crowns").limitToLast(QUERY_LIMIT).once("value"),
                db.ref(base + "seasons").orderByChild("plays").limitToLast(QUERY_LIMIT).once("value"),
                db.ref(base + "formats").once("value"),
                db.ref(base + "franchises").once("value"),
                db.ref(base + "daily").orderByKey().limitToLast(TREND_DAYS).once("value")
            ]);
            render({
                totals: totals.val(),
                queensByPicks: collect(queensByPicks),
                queensByCrowns: collect(queensByCrowns),
                seasons: collect(seasons),
                formats: formats.val(),
                franchises: franchises.val(),
                daily: collect(daily)
            });
        } catch (err) {
            console.warn("Trends unavailable:", err && err.message);
            statusEl.textContent = "The numbers can't load right now.";
        }
    }

    document.addEventListener("navbar:loaded", load, { once: true });
    window.addEventListener("load", () => { document.title = "Trends - Simulator Superstars"; });
})();
