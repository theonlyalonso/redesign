"use strict";

/* Awards for the History page and for each season. Everything is worked out from the seasons already
   saved, so old seasons earn awards too. An award with no qualifying queen or season stays hidden. */
(function initHistoryAwards() {
    const MIN_SEASONS_FOR_RATES = 2;
    const MIN_LIPSYNCS_FOR_RATE = 3;
    const MIN_EPISODES_FOR_CLEAN_RUN = 3;
    const FEATURED_AWARD_IDS = ["queen-of-queens", "most-crowned", "most-wins"];

    const CATEGORIES = [
        { id: "legacy", title: "Legacy", icon: "fa-crown" },
        { id: "challenges", title: "Challenges", icon: "fa-star" },
        { id: "specialists", title: "Specialists", icon: "fa-masks-theater" },
        { id: "lipsyncs", title: "Lip syncs", icon: "fa-microphone-lines" },
        { id: "drama", title: "Drama", icon: "fa-fire" },
        { id: "seasons", title: "Seasons", icon: "fa-clapperboard" }
    ];

    const ALL_STARS_CATEGORY = [{ id: "allstars", title: "All Stars", icon: "fa-star" }];

    const SEASON_CATEGORIES = [
        { id: "legacy", title: "The crown race", icon: "fa-crown" },
        { id: "challenges", title: "Challenges", icon: "fa-star" },
        { id: "specialists", title: "Specialists", icon: "fa-masks-theater" },
        { id: "lipsyncs", title: "Lip syncs", icon: "fa-microphone-lines" },
        { id: "drama", title: "Drama", icon: "fa-fire" }
    ];

    /* Challenge names are matched loosely because episodes can combine several ("Snatch Game<nl>Design"). */
    const CHALLENGE_SPECIALTIES = [
        { key: "acting", pattern: /act|film|movie|music video|commercial/i, icon: "fa-clapperboard", title: "Leading Lady", label: "acting" },
        { key: "comedy", pattern: /comedy|stand up|roast/i, icon: "fa-face-laugh-squint", title: "Comedy Queen", label: "comedy" },
        { key: "design", pattern: /design|ball|make over|makeover|sewing/i, icon: "fa-scissors", title: "Design Darling", label: "design" },
        { key: "dance", pattern: /danc|choreo|girl group|rumix/i, icon: "fa-person-running", title: "Dance Machine", label: "dance" },
        { key: "music", pattern: /sing|rusical|musical|rock group|talent/i, icon: "fa-guitar", title: "Showstopper", label: "music" },
        { key: "snatch", pattern: /snatch/i, icon: "fa-masks-theater", title: "Snatch Game Legend", label: "Snatch Game" },
        { key: "improv", pattern: /improv/i, icon: "fa-comments", title: "Quick Wit", label: "improv" },
        { key: "photo", pattern: /photo/i, icon: "fa-camera-retro", title: "Picture Perfect", label: "photo shoot" }
    ];

    function escapeText(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function stripMarkup(value) {
        const holder = document.createElement("div");
        holder.innerHTML = String(value ?? "");
        return (holder.textContent || "").replace(/\s+/g, " ").trim();
    }

    function nameKey(value) {
        return String(value || "").trim().toLowerCase();
    }

    function plural(count, word, pluralWord) {
        return count + " " + (count === 1 ? word : (pluralWord || word + "s"));
    }

    function round(value, digits = 2) {
        const factor = Math.pow(10, digits);
        return Math.round(value * factor) / factor;
    }

    function ordinal(value) {
        const number = Math.round(value);
        const tens = number % 100;
        if (tens >= 11 && tens <= 13) return number + "th";
        return number + (["th", "st", "nd", "rd"][number % 10] || "th");
    }

    function percent(value) {
        return Math.round(value * 100) + "%";
    }

    function placementCode(value) {
        return typeof window.getHistoryPlacementCode === "function"
            ? window.getHistoryPlacementCode(value)
            : String(value || "").replace(/\s+/g, "").toUpperCase();
    }

    function isWinCode(code) {
        return code === "WIN" || code === "WIN+RTRN";
    }

    function isTopCode(code) {
        return isWinCode(code) || code === "HIGH" || code === "HIGHTEAM" || code === "TOP2" || code === "TOP3";
    }

    function isBottomCode(code) {
        return code.includes("BTM") || code.startsWith("ELIM") || code === "CHOC";
    }

    function longestRun(codes, matcher) {
        let best = 0;
        let current = 0;
        codes.forEach((code) => {
            current = matcher(code) ? current + 1 : 0;
            best = Math.max(best, current);
        });
        return best;
    }

    function resolveRank(entry, season) {
        if (typeof window.resolveHistoryEntryRank !== "function") return 999;
        const rank = Number(window.resolveHistoryEntryRank(entry, season));
        return Number.isFinite(rank) && rank > 0 ? rank : 999;
    }

    function getSpecialtyTrack(season, longestTrack) {
        if (typeof window.normalizeHistoryChallengeList !== "function") return null;
        const challenges = window.normalizeHistoryChallengeList(season);
        // Only trust episode-by-episode matching when the challenge list lines up with the track records.
        if (challenges.length === 0 || challenges.length !== longestTrack) return null;
        return challenges.map((challenge) => String(challenge && (challenge.name || challenge.title) || challenge));
    }

    /* Everything one queen did in one season. Career totals and season awards both read this. */
    function analyzeSeason(season) {
        const cast = (Array.isArray(season && season.cast) ? season.cast : [])
            .filter((entry) => entry && String(entry.name || "").trim());
        if (cast.length === 0) return null;

        const alots = Array.isArray(season.alots) ? season.alots : [];
        const longestTrack = cast.reduce((longest, entry) => Math.max(longest, Array.isArray(entry.trackRecord) ? entry.trackRecord.length : 0), 0);
        const specialtyTrack = getSpecialtyTrack(season, longestTrack);
        const runwayLogs = Array.isArray(season.runwayJudgingLogs) ? season.runwayJudgingLogs : [];

        const queens = cast.map((entry) => {
            const trackRecord = Array.isArray(entry.trackRecord) ? entry.trackRecord : [];
            const codes = trackRecord.map(placementCode);
            const rank = resolveRank(entry, season);
            const firstWinIndex = codes.findIndex(isWinCode);
            const safes = codes.filter((code) => code.startsWith("SAFE")).length;
            const wins = window.countHistoryWins(trackRecord);
            const bottoms = window.countHistoryBottomTwos(trackRecord);
            const tops = window.countHistoryTopPlacements(trackRecord);
            const ppe = Number(entry.ppe);
            const episodesOn = Number(entry.episodesOn);
            const money = Number(entry.money);
            const specialtyWins = {};

            if (specialtyTrack) {
                codes.forEach((code, index) => {
                    if (!isWinCode(code)) return;
                    CHALLENGE_SPECIALTIES.forEach((specialty) => {
                        if (specialty.pattern.test(specialtyTrack[index] || "")) {
                            specialtyWins[specialty.key] = (specialtyWins[specialty.key] || 0) + 1;
                        }
                    });
                });
            }

            const historyEntry = { ...entry, alots };
            const log = typeof window.getHistoryLipsyncLog === "function" ? window.getHistoryLipsyncLog(historyEntry) : [];
            let lipsyncWinRun = 0;
            let bestLipsyncWinRun = 0;
            log.forEach((item) => {
                lipsyncWinRun = item && item.result === "win" ? lipsyncWinRun + 1 : 0;
                bestLipsyncWinRun = Math.max(bestLipsyncWinRun, lipsyncWinRun);
            });

            const lipsyncWins = window.countHistoryLipsyncWins(historyEntry);
            const lipsyncLosses = window.countHistoryLipsyncLosses(historyEntry);
            const key = nameKey(entry.name);
            const runwayCount = (field) => runwayLogs.filter((runway) => {
                const value = runway && runway[field];
                return Array.isArray(value)
                    ? value.some((name) => nameKey(name) === key)
                    : nameKey(value) === key;
            }).length;

            return {
                entry,
                key,
                name: String(entry.name).trim(),
                image: entry.image || "",
                rank,
                wins,
                tops,
                bottoms,
                safes,
                highs: codes.filter((code) => code === "HIGH" || code === "HIGHTEAM").length,
                lows: codes.filter((code) => code === "LOW").length,
                episodes: codes.filter(Boolean).length,
                premiereWin: isWinCode(codes[0] || ""),
                firstWinEpisode: firstWinIndex >= 0 ? firstWinIndex + 1 : 0,
                winRun: longestRun(codes, isWinCode),
                topRun: longestRun(codes, isTopCode),
                bottomRun: longestRun(codes, isBottomCode),
                miniWins: window.countHistoryMiniWins(entry),
                mvqWins: Array.isArray(entry.mvqWonHistory) ? entry.mvqWonHistory.length : 0,
                returns: Array.isArray(entry.retEp) ? entry.retEp.filter(Boolean).length : 0,
                money: Number.isFinite(money) && money > 0 ? money : 0,
                currency: entry.prizeCurrency || "",
                ppePoints: Number.isFinite(ppe) && ppe > 0 ? ppe : 0,
                ppeEpisodes: Number.isFinite(ppe) && ppe > 0 ? (episodesOn > 0 ? episodesOn : 1) : 0,
                seasonPPE: Number.isFinite(ppe) && ppe > 0 ? (episodesOn > 0 ? ppe / episodesOn : ppe) : NaN,
                lipsyncWins,
                lipsyncLosses,
                lipsyncs: window.countHistoryLipsyncAppearances(historyEntry),
                lipsyncWinRun: bestLipsyncWinRun,
                log,
                specialtyWins,
                runwayTop: runwayCount("topToot"),
                runwayToots: runwayCount("toots"),
                runwayBoots: runwayCount("boots")
            };
        });

        const crowned = queens.filter((queen) => queen.rank === 1);
        const crownedKeys = new Set(crowned.map((queen) => queen.key));
        const rankedTotal = queens.length;

        queens.forEach((queen) => {
            queen.isWinner = queen.rank === 1;
            queen.isFirstOut = queen.rank === rankedTotal && rankedTotal > 2;
            queen.peakedEarly = queen.premiereWin && queen.rank < 900 && queen.rank > rankedTotal / 2;
            queen.neverSafe = queen.episodes >= MIN_EPISODES_FOR_CLEAN_RUN && queen.safes === 0;
            queen.cleanRun = queen.episodes >= MIN_EPISODES_FOR_CLEAN_RUN && queen.bottoms === 0;
            queen.invisible = queen.episodes >= MIN_EPISODES_FOR_CLEAN_RUN && queen.tops === 0 && queen.bottoms === 0;
            queen.oneAndDone = queen.lipsyncs === 1 && queen.lipsyncLosses === 1;
            queen.giantKills = 0;
            queen.doubleSaves = 0;
            queen.log.forEach((item) => {
                if (!item || item.result !== "win") return;
                if ((item.opponents || []).some((opponent) => crownedKeys.has(nameKey(opponent)))) {
                    queen.giantKills += 1;
                }
                if ((item.winners || []).length > 1) {
                    queen.doubleSaves += 1;
                }
            });
        });

        const pairs = new Map();
        const songs = new Map();
        alots.forEach((alot) => {
            const winners = window.getHistoryAlotsNames(alot, "winnerNames");
            const losers = window.getHistoryAlotsNames(alot, "loserNames");
            winners.forEach((winner) => {
                losers.forEach((loser) => {
                    const pair = [winner, loser].sort((a, b) => a.localeCompare(b));
                    const pairKey = nameKey(pair.join("|"));
                    const rivalry = pairs.get(pairKey) || { key: pairKey, names: pair, count: 0 };
                    rivalry.count += 1;
                    pairs.set(pairKey, rivalry);
                });
            });
            const song = stripMarkup(alot && alot.lsSong);
            if (song) {
                const songKey = nameKey(song);
                const counted = songs.get(songKey) || { key: songKey, title: song, count: 0 };
                counted.count += 1;
                songs.set(songKey, counted);
            }
        });

        return { queens, crowned, pairs: Array.from(pairs.values()), songs: Array.from(songs.values()), alots };
    }

    function createCareer(queen) {
        return {
            name: queen.name,
            image: queen.image,
            seasons: 0,
            crowns: 0,
            currentCrownRun: 0,
            bestCrownRun: 0,
            runnerUps: 0,
            topThrees: 0,
            firstOuts: 0,
            flawlessCrowns: 0,
            winlessCrowns: 0,
            debutCrowns: 0,
            againstTheOdds: 0,
            rankTotal: 0,
            rankCount: 0,
            previousRank: 0,
            bestClimb: 0,
            bestDrop: 0,
            topHalfSeasons: 0,
            wins: 0,
            bestSeasonWins: 0,
            bestWinRun: 0,
            bestTopRun: 0,
            bestBottomRun: 0,
            premiereWins: 0,
            lateFirstWin: 0,
            peakedEarly: 0,
            tops: 0,
            highs: 0,
            lows: 0,
            safes: 0,
            bottoms: 0,
            worstSeasonBottoms: 0,
            neverSafe: 0,
            cleanRuns: 0,
            invisible: 0,
            winlessSeasons: 0,
            episodes: 0,
            miniWins: 0,
            mvqWins: 0,
            lipsyncWins: 0,
            lipsyncLosses: 0,
            lipsyncs: 0,
            bestSeasonLipsyncWins: 0,
            bestLipsyncWinRun: 0,
            giantKills: 0,
            doubleSaves: 0,
            oneAndDone: 0,
            returns: 0,
            money: 0,
            currency: "",
            ppePoints: 0,
            ppeEpisodes: 0,
            bestSeasonPPE: 0,
            runwayTop: 0,
            runwayToots: 0,
            runwayBoots: 0,
            specialtyWins: {}
        };
    }

    /* One pass over every saved season; each award below only reads the totals. */
    function collectStats(rows) {
        const careers = new Map();
        const seasons = [];
        const rivalries = new Map();
        const songs = new Map();

        rows.forEach(({ season, index }) => {
            const analysis = analyzeSeason(season);
            if (!analysis) return;
            const castSize = analysis.queens.length;
            let winnerWins = 0;
            let winnerBottoms = -1;
            let winnerName = "";
            let winnerImage = "";
            let bottomsTotal = 0;
            const challengeWinners = new Set();

            analysis.queens.forEach((queen) => {
                const career = careers.get(queen.key) || createCareer(queen);
                career.image = career.image || queen.image;

                const isDebut = career.seasons === 0;
                career.seasons += 1;
                career.wins += queen.wins;
                career.bestSeasonWins = Math.max(career.bestSeasonWins, queen.wins);
                career.bestWinRun = Math.max(career.bestWinRun, queen.winRun);
                career.bestTopRun = Math.max(career.bestTopRun, queen.topRun);
                career.bestBottomRun = Math.max(career.bestBottomRun, queen.bottomRun);
                career.tops += queen.tops;
                career.highs += queen.highs;
                career.lows += queen.lows;
                career.safes += queen.safes;
                career.bottoms += queen.bottoms;
                career.worstSeasonBottoms = Math.max(career.worstSeasonBottoms, queen.bottoms);
                career.episodes += queen.episodes;
                career.premiereWins += queen.premiereWin ? 1 : 0;
                career.lateFirstWin = Math.max(career.lateFirstWin, queen.firstWinEpisode > 1 ? queen.firstWinEpisode : 0);
                career.peakedEarly += queen.peakedEarly ? 1 : 0;
                career.neverSafe += queen.neverSafe ? 1 : 0;
                career.cleanRuns += queen.cleanRun ? 1 : 0;
                career.invisible += queen.invisible ? 1 : 0;
                career.winlessSeasons += queen.wins === 0 ? 1 : 0;
                career.miniWins += queen.miniWins;
                career.mvqWins += queen.mvqWins;
                career.lipsyncWins += queen.lipsyncWins;
                career.lipsyncLosses += queen.lipsyncLosses;
                career.lipsyncs += queen.lipsyncs;
                career.bestSeasonLipsyncWins = Math.max(career.bestSeasonLipsyncWins, queen.lipsyncWins);
                career.bestLipsyncWinRun = Math.max(career.bestLipsyncWinRun, queen.lipsyncWinRun);
                career.giantKills += queen.giantKills;
                career.doubleSaves += queen.doubleSaves;
                career.oneAndDone += queen.oneAndDone ? 1 : 0;
                career.returns += queen.returns;
                career.money += queen.money;
                career.currency = career.currency || queen.currency;
                career.ppePoints += queen.ppePoints;
                career.ppeEpisodes += queen.ppeEpisodes;
                if (Number.isFinite(queen.seasonPPE)) {
                    career.bestSeasonPPE = Math.max(career.bestSeasonPPE, queen.seasonPPE);
                }
                career.runwayTop += queen.runwayTop;
                career.runwayToots += queen.runwayToots;
                career.runwayBoots += queen.runwayBoots;
                Object.keys(queen.specialtyWins).forEach((key) => {
                    career.specialtyWins[key] = (career.specialtyWins[key] || 0) + queen.specialtyWins[key];
                });

                if (queen.rank < 900) {
                    career.rankTotal += queen.rank;
                    career.rankCount += 1;
                    if (queen.rank <= 3) career.topThrees += 1;
                    if (queen.rank === 2) career.runnerUps += 1;
                    if (queen.isFirstOut) career.firstOuts += 1;
                    if (queen.rank <= castSize / 2) career.topHalfSeasons += 1;
                    if (career.previousRank > 0) {
                        career.bestClimb = Math.max(career.bestClimb, career.previousRank - queen.rank);
                        career.bestDrop = Math.max(career.bestDrop, queen.rank - career.previousRank);
                    }
                    career.previousRank = queen.rank;
                }

                if (queen.isWinner) {
                    career.crowns += 1;
                    career.currentCrownRun += 1;
                    career.bestCrownRun = Math.max(career.bestCrownRun, career.currentCrownRun);
                    if (queen.bottoms === 0) career.flawlessCrowns += 1;
                    if (queen.wins === 0) career.winlessCrowns += 1;
                    if (isDebut) career.debutCrowns += 1;
                    career.againstTheOdds = Math.max(career.againstTheOdds, queen.bottoms);
                    if (queen.wins >= winnerWins) {
                        winnerWins = queen.wins;
                        winnerName = queen.name;
                        winnerImage = queen.image;
                    }
                    winnerBottoms = Math.max(winnerBottoms, queen.bottoms);
                } else {
                    // A crown run only breaks when a queen is cast again and doesn't win.
                    career.currentCrownRun = 0;
                }

                bottomsTotal += queen.bottoms;
                if (queen.wins > 0) challengeWinners.add(queen.key);
                careers.set(queen.key, career);
            });

            analysis.pairs.forEach((pair) => {
                const rivalry = rivalries.get(pair.key) || { names: pair.names, count: 0 };
                rivalry.count += pair.count;
                rivalries.set(pair.key, rivalry);
            });
            analysis.songs.forEach((song) => {
                const counted = songs.get(song.key) || { title: song.title, count: 0 };
                counted.count += song.count;
                songs.set(song.key, counted);
            });

            const runnerUpWins = analysis.queens
                .filter((queen) => queen.rank === 2)
                .reduce((most, queen) => Math.max(most, queen.wins), -1);
            const episodes = Number(season.episodes) || 0;
            seasons.push({
                index,
                name: String(season.name || "Season"),
                image: winnerImage || season.winnerImg || "",
                episodes,
                castSize: Number(season.castSize) || castSize,
                lipsyncs: analysis.alots.length,
                winnerName,
                winnerWins,
                winnerBottoms,
                crownCount: analysis.crowned.length,
                bottomsTotal,
                challengeWinners: challengeWinners.size,
                dominance: episodes > 0 ? winnerWins / episodes : 0,
                finalGap: winnerName && runnerUpWins >= 0 ? Math.abs(winnerWins - runnerUpWins) : NaN
            });
        });

        return {
            queens: Array.from(careers.values()),
            seasons,
            rivalries: Array.from(rivalries.values()),
            songs: Array.from(songs.values())
        };
    }

    function queenAward(id, category, icon, title, description, getValue, formatValue, options = {}) {
        return { id, category, icon, title, description, kind: "queen", getValue, formatValue, ...options };
    }

    function seasonAward(id, category, icon, title, description, getValue, formatValue, options = {}) {
        return { id, category, icon, title, description, kind: "season", getValue, formatValue, ...options };
    }

    function legacyScore(queen) {
        return queen.crowns * 10
            + queen.runnerUps * 4
            + queen.wins * 3
            + queen.highs
            + queen.lipsyncWins
            - queen.bottoms;
    }

    function seasonScore(queen) {
        return (queen.isWinner ? 10 : 0)
            + (queen.rank === 2 ? 4 : 0)
            + queen.wins * 3
            + queen.highs
            + queen.lipsyncWins
            - queen.bottoms;
    }

    function averageRank(queen) {
        return queen.rankCount > 0 ? queen.rankTotal / queen.rankCount : NaN;
    }

    function averagePPE(queen) {
        return queen.ppeEpisodes > 0 ? queen.ppePoints / queen.ppeEpisodes : NaN;
    }

    function lipsyncRate(queen) {
        const total = queen.lipsyncWins + queen.lipsyncLosses;
        return total >= MIN_LIPSYNCS_FOR_RATE ? queen.lipsyncWins / total : NaN;
    }

    const hasRepeatRuns = (queen) => queen.seasons >= MIN_SEASONS_FOR_RATES;
    const moneyLabel = (value, queen) => (queen.currency || "$") + Math.round(value).toLocaleString();
    const times = (value) => value + "x";

    const SPECIALIST_AWARDS = CHALLENGE_SPECIALTIES.map((specialty) => queenAward(
        "specialist-" + specialty.key,
        "specialists",
        specialty.icon,
        specialty.title,
        "The most " + specialty.label + " challenge wins.",
        (queen) => queen.specialtyWins[specialty.key] || 0,
        (value) => plural(value, specialty.label + " win")
    ));

    const AWARDS = [
        queenAward("queen-of-queens", "legacy", "fa-gem", "Queen of Queens", "Best overall career: crowns, finales, wins, highs and lip sync wins, minus bottoms.", legacyScore, (value) => round(value) + " pts"),
        queenAward("most-crowned", "legacy", "fa-crown", "Most Crowned", "The most season crowns.", (queen) => queen.crowns, (value) => plural(value, "crown")),
        queenAward("crown-rate", "legacy", "fa-percent", "Crown Magnet", "Best crown rate across at least 2 seasons.", (queen) => (hasRepeatRuns(queen) ? queen.crowns / queen.seasons : NaN), percent),
        queenAward("dynasty", "legacy", "fa-layer-group", "Dynasty", "Most crowns in a row, in saved order.", (queen) => (queen.bestCrownRun > 1 ? queen.bestCrownRun : 0), (value) => value + " in a row"),
        queenAward("instant-legend", "legacy", "fa-star-of-life", "Instant Legend", "Crowned on a first-ever appearance.", (queen) => queen.debutCrowns, (value) => plural(value, "debut crown")),
        queenAward("always-the-bridesmaid", "legacy", "fa-medal", "Always the Bridesmaid", "So close: the most runner-up finishes.", (queen) => queen.runnerUps, (value) => plural(value, "runner-up")),
        queenAward("finale-regular", "legacy", "fa-ranking-star", "Finale Regular", "The most top 3 finishes.", (queen) => queen.topThrees, (value) => plural(value, "finish", "finishes")),
        queenAward("always-contender", "legacy", "fa-mountain-sun", "Always a Contender", "Finished in the top half the most often.", (queen) => queen.topHalfSeasons, (value) => plural(value, "season")),
        queenAward("best-average", "legacy", "fa-arrow-up-1-9", "Consistently Up There", "Best average placement across at least 2 seasons.", (queen) => (hasRepeatRuns(queen) ? averageRank(queen) : NaN), (value) => "avg " + ordinal(value), { mode: "min" }),
        queenAward("glow-up", "legacy", "fa-arrow-up-right-dots", "Glow Up", "The biggest jump in placement between two seasons in a row.", (queen) => queen.bestClimb, (value) => "up " + plural(value, "place")),
        queenAward("most-appearances", "legacy", "fa-repeat", "Franchise Regular", "Cast in the most seasons.", (queen) => queen.seasons, (value) => plural(value, "season")),
        queenAward("screen-time", "legacy", "fa-tv", "Screen Time", "The most episodes across every season.", (queen) => queen.episodes, (value) => plural(value, "episode")),

        queenAward("most-wins", "challenges", "fa-trophy", "Challenge Beast", "The most maxi challenge wins.", (queen) => queen.wins, (value) => plural(value, "win")),
        queenAward("single-season-wins", "challenges", "fa-bolt", "Unstoppable", "The most wins in a single season.", (queen) => queen.bestSeasonWins, (value) => plural(value, "win") + " in a season"),
        queenAward("win-streak", "challenges", "fa-forward-fast", "Back to Back", "The longest run of challenge wins in a row.", (queen) => (queen.bestWinRun > 1 ? queen.bestWinRun : 0), (value) => value + " wins in a row"),
        queenAward("hot-streak", "challenges", "fa-fire-flame-simple", "Hot Streak", "The longest run of top placements in a row.", (queen) => (queen.bestTopRun > 1 ? queen.bestTopRun : 0), (value) => value + " tops in a row"),
        queenAward("flawless", "challenges", "fa-wand-magic-sparkles", "Flawless Victory", "Crowned without ever landing in the bottom.", (queen) => queen.flawlessCrowns, (value) => plural(value, "flawless crown")),
        queenAward("teflon", "challenges", "fa-shield", "Teflon", "The most seasons without a single bottom.", (queen) => queen.cleanRuns, (value) => plural(value, "clean season")),
        queenAward("premiere-queen", "challenges", "fa-rocket", "Premiere Queen", "The most wins in episode 1.", (queen) => queen.premiereWins, (value) => plural(value, "premiere win")),
        queenAward("late-bloomer", "challenges", "fa-seedling", "Late Bloomer", "Took the longest to land a first win in a season.", (queen) => queen.lateFirstWin, (value) => "first win, ep " + value),
        queenAward("most-tops", "challenges", "fa-arrow-trend-up", "Judges' Favourite", "The most top placements.", (queen) => queen.tops, (value) => plural(value, "top placement")),
        queenAward("most-highs", "challenges", "fa-thumbs-up", "Always Almost", "The most highs.", (queen) => queen.highs, (value) => plural(value, "high")),
        queenAward("highest-ppe", "challenges", "fa-chart-line", "Stat Sheet Star", "Highest average PPE.", averagePPE, (value) => round(value) + " PPE"),
        queenAward("best-season-ppe", "challenges", "fa-fire-flame-curved", "Career Year", "Highest PPE in a single season.", (queen) => queen.bestSeasonPPE, (value) => round(value) + " PPE"),
        queenAward("mini-wins", "challenges", "fa-hand-scissors", "Mini Queen", "The most mini challenge wins.", (queen) => queen.miniWins, (value) => plural(value, "mini win")),
        queenAward("mvq", "challenges", "fa-hand-sparkles", "Most Valuable Queen", "The most MVQ titles.", (queen) => queen.mvqWins, (value) => plural(value, "MVQ", "MVQs")),
        queenAward("top-earner", "challenges", "fa-sack-dollar", "Top Earner", "The most prize money.", (queen) => queen.money, moneyLabel),

        ...SPECIALIST_AWARDS,
        queenAward("runway-royalty", "specialists", "fa-person-dress", "Runway Royalty", "The most top runway scores.", (queen) => queen.runwayTop, (value) => plural(value, "top look")),
        queenAward("best-dressed", "specialists", "fa-shirt", "Best Dressed", "The most runway toots.", (queen) => queen.runwayToots, (value) => plural(value, "toot")),
        queenAward("fashion-victim", "specialists", "fa-socks", "Fashion Victim", "The most runway boots.", (queen) => queen.runwayBoots, (value) => plural(value, "boot")),

        queenAward("lipsync-assassin", "lipsyncs", "fa-microphone-lines", "Lip Sync Assassin", "The most lip sync wins.", (queen) => queen.lipsyncWins, (value) => plural(value, "win")),
        queenAward("lipsync-rate", "lipsyncs", "fa-bullseye", "Sharpshooter", "Best lip sync win rate, with at least 3 lip syncs.", lipsyncRate, percent),
        queenAward("lipsync-unbeaten", "lipsyncs", "fa-shield-halved", "Untouchable", "The most lip sync wins without a single loss.", (queen) => (queen.lipsyncLosses === 0 ? queen.lipsyncWins : 0), (value) => value + "-0"),
        queenAward("lipsync-season", "lipsyncs", "fa-bolt-lightning", "One-Woman Show", "The most lip sync wins in one season.", (queen) => queen.bestSeasonLipsyncWins, (value) => plural(value, "win") + " in a season"),
        queenAward("lipsync-run", "lipsyncs", "fa-repeat", "On a Roll", "The longest run of lip sync wins.", (queen) => (queen.bestLipsyncWinRun > 1 ? queen.bestLipsyncWinRun : 0), (value) => value + " in a row"),
        queenAward("giant-killer", "lipsyncs", "fa-khanda", "Giant Killer", "The most lip sync wins over a queen who went on to be crowned.", (queen) => queen.giantKills, (value) => plural(value, "giant") + " beaten"),
        queenAward("double-save", "lipsyncs", "fa-handshake", "Shantay You Both", "The most lip syncs where nobody went home.", (queen) => queen.doubleSaves, (value) => plural(value, "double save")),
        queenAward("lipsync-regular", "lipsyncs", "fa-music", "Lives on That Stage", "The most lip syncs overall.", (queen) => queen.lipsyncs, (value) => plural(value, "lip sync")),
        queenAward("one-and-done", "lipsyncs", "fa-person-walking-arrow-right", "One and Done", "Lost the only lip sync of a season, the most often.", (queen) => queen.oneAndDone, times),
        { id: "rivalry", category: "lipsyncs", icon: "fa-people-arrows", title: "Fiercest Rivalry", description: "The pair who lip synced against each other the most.", kind: "rivalry" },
        { id: "anthem", category: "lipsyncs", icon: "fa-compact-disc", title: "Anthem", description: "The most used lip sync song.", kind: "song" },

        queenAward("bottom-dweller", "drama", "fa-skull", "Bottom Dweller", "The most times in the bottom.", (queen) => queen.bottoms, (value) => plural(value, "bottom")),
        queenAward("rough-season", "drama", "fa-cloud-showers-heavy", "Rough Season", "The most bottoms in one season.", (queen) => queen.worstSeasonBottoms, (value) => plural(value, "bottom") + " in a season"),
        queenAward("free-fall", "drama", "fa-arrow-down-long", "Free Fall", "The longest run of bottoms in a row.", (queen) => (queen.bestBottomRun > 1 ? queen.bestBottomRun : 0), (value) => value + " in a row"),
        queenAward("danger-zone", "drama", "fa-triangle-exclamation", "Danger Zone", "The most lows.", (queen) => queen.lows, (value) => plural(value, "low")),
        queenAward("first-out", "drama", "fa-door-open", "First Out Curse", "Went home first the most often.", (queen) => queen.firstOuts, (value) => value + "x first out"),
        queenAward("fall-from-grace", "drama", "fa-person-falling", "Fall From Grace", "The biggest drop in placement between two seasons in a row.", (queen) => queen.bestDrop, (value) => "down " + plural(value, "place")),
        queenAward("peaked-early", "drama", "fa-chart-area", "Peaked Too Soon", "Won the premiere, then finished in the bottom half.", (queen) => queen.peakedEarly, times),
        queenAward("snubbed", "drama", "fa-heart-crack", "Robbed", "The most challenge wins with no crown to show for it.", (queen) => (queen.crowns === 0 ? queen.wins : 0), (value) => plural(value, "win") + ", no crown"),
        queenAward("against-the-odds", "drama", "fa-mask", "Against the Odds", "Crowned after the most bottoms in that season.", (queen) => queen.againstTheOdds, (value) => plural(value, "bottom") + " to the crown"),
        queenAward("zero-to-hero", "drama", "fa-wand-sparkles", "Zero to Hero", "Crowned without winning a single challenge.", (queen) => queen.winlessCrowns, (value) => plural(value, "winless crown")),
        queenAward("still-waiting", "drama", "fa-hourglass-end", "Still Waiting", "The most seasons without a challenge win.", (queen) => queen.winlessSeasons, (value) => plural(value, "winless season")),
        queenAward("never-safe", "drama", "fa-bomb", "Never Safe", "The most seasons without one safe placement.", (queen) => queen.neverSafe, (value) => plural(value, "season")),
        queenAward("safe-and-sound", "drama", "fa-umbrella", "Safe and Sound", "The most safe placements.", (queen) => queen.safes, (value) => value + "x safe"),
        queenAward("invisible", "drama", "fa-ghost", "Who?", "The most seasons with no tops and no bottoms.", (queen) => queen.invisible, (value) => plural(value, "season")),
        queenAward("comeback", "drama", "fa-rotate-left", "Comeback Queen", "The most returns after going home.", (queen) => queen.returns, (value) => plural(value, "return")),
        queenAward("lowest-ppe", "drama", "fa-arrow-trend-down", "Tough Crowd", "Lowest average PPE across at least 2 seasons.", (queen) => (hasRepeatRuns(queen) ? averagePPE(queen) : NaN), (value) => round(value) + " PPE", { mode: "min" }),

        seasonAward("dominant-winner", "seasons", "fa-hand-fist", "Total Domination", "The winner who took the biggest share of the challenges.", (season) => (season.winnerWins > 0 ? season.dominance : NaN), (value, season) => season.winnerName + " · " + percent(value)),
        seasonAward("underdog", "seasons", "fa-dog", "Underdog Story", "The winner who survived the most bottoms.", (season) => season.winnerBottoms, (value, season) => season.winnerName + " · " + plural(value, "bottom")),
        seasonAward("photo-finish", "seasons", "fa-flag-checkered", "Photo Finish", "The closest race: the fewest wins between winner and runner-up.", (season) => season.finalGap, (value) => (value === 0 ? "tied on wins" : plural(value, "win") + " apart"), { mode: "min" }),
        seasonAward("anyones-game", "seasons", "fa-shuffle", "Anyone's Game", "The most different queens winning challenges.", (season) => season.challengeWinners, (value) => plural(value, "challenge winner")),
        seasonAward("bloodbath", "seasons", "fa-droplet", "Bloodbath", "The most bottoms across the cast.", (season) => season.bottomsTotal, (value) => plural(value, "bottom")),
        seasonAward("double-crown", "seasons", "fa-crown", "Double Crown", "More than one winner crowned.", (season) => (season.crownCount > 1 ? season.crownCount : 0), (value) => value + " winners"),
        seasonAward("longest-season", "seasons", "fa-hourglass-half", "The Long Haul", "The most episodes in one season.", (season) => season.episodes, (value) => plural(value, "episode")),
        seasonAward("shortest-season", "seasons", "fa-stopwatch", "Short and Sweet", "The fewest episodes in one season.", (season) => (season.episodes > 0 ? season.episodes : NaN), (value) => plural(value, "episode"), { mode: "min" }),
        seasonAward("biggest-cast", "seasons", "fa-users", "Packed Werkroom", "The biggest cast.", (season) => season.castSize, (value) => plural(value, "queen")),
        seasonAward("smallest-cast", "seasons", "fa-user-group", "Intimate Werkroom", "The smallest cast.", (season) => (season.castSize > 0 ? season.castSize : NaN), (value) => plural(value, "queen"), { mode: "min" }),
        seasonAward("lipsync-season-total", "seasons", "fa-headphones", "Lip Sync Season", "The most lip syncs in one season.", (season) => season.lipsyncs, (value) => plural(value, "lip sync"))
    ];

    const SEASON_SPECIALIST_AWARDS = CHALLENGE_SPECIALTIES.map((specialty) => queenAward(
        "season-specialist-" + specialty.key,
        "specialists",
        specialty.icon,
        specialty.title,
        "The most " + specialty.label + " challenge wins this season.",
        (queen) => queen.specialtyWins[specialty.key] || 0,
        (value) => plural(value, specialty.label + " win")
    ));

    /* The same ideas scoped to one season, reading one season's numbers instead of a whole career. */
    const SEASON_AWARDS = [
        queenAward("season-mvp", "legacy", "fa-gem", "Season MVP", "Best all-round season: crown, wins, highs and lip sync wins, minus bottoms.", seasonScore, (value) => round(value) + " pts"),
        queenAward("season-runner-up", "legacy", "fa-medal", "So Close", "Runner-up this season.", (queen) => (queen.rank === 2 ? 1 : 0), () => "runner-up", { hideDetail: true }),
        queenAward("season-flawless", "legacy", "fa-wand-magic-sparkles", "Flawless Victory", "Crowned without ever landing in the bottom.", (queen) => (queen.isWinner && queen.episodes > 0 && queen.bottoms === 0 ? 1 : 0), () => "no bottoms", { hideDetail: true }),
        queenAward("season-odds", "legacy", "fa-mask", "Against the Odds", "Crowned after landing in the bottom.", (queen) => (queen.isWinner ? queen.bottoms : 0), (value) => plural(value, "bottom")),
        queenAward("season-zero", "legacy", "fa-wand-sparkles", "Zero to Hero", "Crowned without winning a challenge.", (queen) => (queen.isWinner && queen.episodes > 0 && queen.wins === 0 ? 1 : 0), () => "no wins", { hideDetail: true }),
        queenAward("season-robbed", "legacy", "fa-heart-crack", "Robbed", "The most challenge wins without the crown.", (queen) => (queen.isWinner ? 0 : queen.wins), (value) => plural(value, "win")),
        queenAward("season-first-out", "legacy", "fa-door-open", "First Out", "First queen to go home.", (queen) => (queen.isFirstOut ? 1 : 0), () => "first out", { hideDetail: true }),

        queenAward("season-wins", "challenges", "fa-trophy", "Challenge Beast", "The most challenge wins.", (queen) => queen.wins, (value) => plural(value, "win")),
        queenAward("season-win-streak", "challenges", "fa-forward-fast", "Back to Back", "The longest run of wins in a row.", (queen) => (queen.winRun > 1 ? queen.winRun : 0), (value) => value + " in a row"),
        queenAward("season-hot-streak", "challenges", "fa-fire-flame-simple", "Hot Streak", "The longest run of top placements in a row.", (queen) => (queen.topRun > 1 ? queen.topRun : 0), (value) => value + " in a row"),
        queenAward("season-premiere", "challenges", "fa-rocket", "Premiere Queen", "Won episode 1.", (queen) => (queen.premiereWin ? 1 : 0), () => "episode 1", { hideDetail: true }),
        queenAward("season-late-bloomer", "challenges", "fa-seedling", "Late Bloomer", "Took the longest to land a first win.", (queen) => (queen.firstWinEpisode > 1 ? queen.firstWinEpisode : 0), (value) => "ep " + value),
        queenAward("season-teflon", "challenges", "fa-shield", "Teflon", "Went the furthest without a single bottom.", (queen) => (queen.cleanRun ? queen.episodes : 0), (value) => plural(value, "episode")),
        queenAward("season-tops", "challenges", "fa-arrow-trend-up", "Judges' Favourite", "The most top placements.", (queen) => queen.tops, (value) => plural(value, "top")),
        queenAward("season-highs", "challenges", "fa-thumbs-up", "Always Almost", "The most highs.", (queen) => queen.highs, (value) => plural(value, "high")),
        queenAward("season-ppe", "challenges", "fa-chart-line", "Stat Sheet Star", "Highest PPE.", (queen) => queen.seasonPPE, (value) => round(value) + " PPE"),
        queenAward("season-mini", "challenges", "fa-hand-scissors", "Mini Queen", "The most mini challenge wins.", (queen) => queen.miniWins, (value) => plural(value, "mini win")),
        queenAward("season-mvq", "challenges", "fa-hand-sparkles", "Most Valuable Queen", "The most MVQ titles.", (queen) => queen.mvqWins, (value) => plural(value, "MVQ", "MVQs")),
        queenAward("season-money", "challenges", "fa-sack-dollar", "Top Earner", "The most prize money.", (queen) => queen.money, moneyLabel),

        ...SEASON_SPECIALIST_AWARDS,
        queenAward("season-runway-top", "specialists", "fa-person-dress", "Runway Royalty", "The most top runway scores.", (queen) => queen.runwayTop, (value) => plural(value, "top look")),
        queenAward("season-toots", "specialists", "fa-shirt", "Best Dressed", "The most runway toots.", (queen) => queen.runwayToots, (value) => plural(value, "toot")),
        queenAward("season-boots", "specialists", "fa-socks", "Fashion Victim", "The most runway boots.", (queen) => queen.runwayBoots, (value) => plural(value, "boot")),

        queenAward("season-assassin", "lipsyncs", "fa-microphone-lines", "Lip Sync Assassin", "The most lip sync wins.", (queen) => queen.lipsyncWins, (value) => plural(value, "win")),
        queenAward("season-unbeaten", "lipsyncs", "fa-shield-halved", "Untouchable", "The most lip sync wins without a loss.", (queen) => (queen.lipsyncLosses === 0 ? queen.lipsyncWins : 0), (value) => value + "-0"),
        queenAward("season-lipsync-run", "lipsyncs", "fa-repeat", "On a Roll", "The longest run of lip sync wins.", (queen) => (queen.lipsyncWinRun > 1 ? queen.lipsyncWinRun : 0), (value) => value + " in a row"),
        queenAward("season-giant", "lipsyncs", "fa-khanda", "Giant Killer", "Beat the eventual winner in a lip sync.", (queen) => queen.giantKills, times),
        queenAward("season-double", "lipsyncs", "fa-handshake", "Shantay You Both", "The most lip syncs where nobody went home.", (queen) => queen.doubleSaves, times),
        queenAward("season-lipsyncs", "lipsyncs", "fa-music", "Lives on That Stage", "The most lip syncs.", (queen) => queen.lipsyncs, (value) => plural(value, "lip sync")),
        queenAward("season-losses", "lipsyncs", "fa-face-sad-tear", "Sent Packing", "The most lip sync losses.", (queen) => queen.lipsyncLosses, (value) => plural(value, "loss", "losses")),
        { id: "season-rivalry", category: "lipsyncs", icon: "fa-people-arrows", title: "Fiercest Rivalry", description: "The pair who lip synced against each other the most.", kind: "rivalry" },
        { id: "season-anthem", category: "lipsyncs", icon: "fa-compact-disc", title: "Anthem", description: "The most used lip sync song.", kind: "song" },

        queenAward("season-bottoms", "drama", "fa-skull", "Bottom Dweller", "The most times in the bottom.", (queen) => queen.bottoms, (value) => plural(value, "bottom")),
        queenAward("season-free-fall", "drama", "fa-arrow-down-long", "Free Fall", "The longest run of bottoms in a row.", (queen) => (queen.bottomRun > 1 ? queen.bottomRun : 0), (value) => value + " in a row"),
        queenAward("season-lows", "drama", "fa-triangle-exclamation", "Danger Zone", "The most lows.", (queen) => queen.lows, (value) => plural(value, "low")),
        queenAward("season-peaked", "drama", "fa-chart-area", "Peaked Too Soon", "Won the premiere, then finished in the bottom half.", (queen) => (queen.peakedEarly ? 1 : 0), () => "premiere winner", { hideDetail: true }),
        queenAward("season-never-safe", "drama", "fa-bomb", "Never Safe", "Not one safe placement all season, in the longest run.", (queen) => (queen.neverSafe ? queen.episodes : 0), (value) => plural(value, "episode")),
        queenAward("season-safe", "drama", "fa-umbrella", "Safe and Sound", "The most safe placements.", (queen) => queen.safes, (value) => value + "x safe"),
        queenAward("season-invisible", "drama", "fa-ghost", "Who?", "No tops and no bottoms, in the longest run.", (queen) => (queen.invisible ? queen.episodes : 0), (value) => plural(value, "episode")),
        queenAward("season-comeback", "drama", "fa-rotate-left", "Comeback Queen", "Came back after going home.", (queen) => queen.returns, (value) => plural(value, "return")),
        queenAward("season-low-ppe", "drama", "fa-arrow-trend-down", "Tough Crowd", "Lowest PPE.", (queen) => queen.seasonPPE, (value) => round(value) + " PPE", { mode: "min" })
    ];

    function findLeaders(items, getValue, mode) {
        let best = mode === "min" ? Infinity : -Infinity;
        let leaders = [];
        items.forEach((item) => {
            const value = Number(getValue(item));
            if (!Number.isFinite(value)) return;
            if (mode === "min" ? value < best : value > best) {
                best = value;
                leaders = [item];
            } else if (value === best) {
                leaders.push(item);
            }
        });
        if (leaders.length === 0) return null;
        if (mode !== "min" && best <= 0) return null;
        return { value: best, leaders };
    }

    function resolveAward(award, stats) {
        if (award.kind === "rivalry") {
            const result = findLeaders(stats.rivalries, (rivalry) => rivalry.count);
            if (!result || result.value < 2) return null;
            const top = result.leaders[0];
            return {
                ...award,
                holders: top.names.map((name) => stats.queens.find((queen) => nameKey(queen.name) === nameKey(name)) || { name }),
                joiner: "vs",
                detail: result.value + " lip syncs"
            };
        }

        if (award.kind === "song") {
            const result = findLeaders(stats.songs, (song) => song.count);
            if (!result || result.value < 2) return null;
            return { ...award, text: result.leaders[0].title, detail: "used " + result.value + " times" };
        }

        const items = award.kind === "season" ? stats.seasons : stats.queens;
        const result = findLeaders(items, award.getValue, award.mode);
        if (!result) return null;
        return {
            ...award,
            holders: result.leaders,
            detail: award.hideDetail ? "" : award.formatValue(result.value, result.leaders[0])
        };
    }

    // An award shared by everyone says nothing about anyone.
    function isSharedByEveryone(award, total) {
        return !!award.holders && total >= 3 && award.holders.length >= total;
    }

    function buildAwards(rows) {
        const stats = collectStats(rows);
        return AWARDS
            .map((award) => resolveAward(award, stats))
            .filter(Boolean)
            .filter((award) => !isSharedByEveryone(award, award.kind === "season" ? stats.seasons.length : stats.queens.length));
    }

    function buildSeasonAwards(season) {
        const analysis = analyzeSeason(season);
        if (!analysis) return [];
        const stats = {
            queens: analysis.queens,
            seasons: [],
            rivalries: analysis.pairs,
            songs: analysis.songs
        };
        const castSize = analysis.queens.length;
        return SEASON_AWARDS
            .map((award) => resolveAward(award, stats))
            .filter(Boolean)
            .filter((award) => !isSharedByEveryone(award, castSize));
    }

    function renderAvatars(holders, kind) {
        const shown = holders.slice(0, 3);
        const fallback = "image/queens/noimage.jpg";
        return '<span class="history-award-avatars" aria-hidden="true">'
            + shown.map((holder) => '<img src="' + escapeText(holder.image || fallback) + '" alt="" loading="lazy" decoding="async" class="' + (kind === "season" ? "is-season" : "") + '">').join("")
            + "</span>";
    }

    function renderHolderNames(award, linked) {
        const holders = award.holders || [];
        const shown = holders.slice(0, linked ? 2 : 3);
        const labels = shown.map((holder) => {
            if (!linked) {
                return '<span class="history-award-plain">' + escapeText(holder.name) + "</span>";
            }
            const data = award.kind === "season"
                ? 'data-award-season="' + holder.index + '"'
                : 'data-award-queen="' + escapeText(holder.name) + '"';
            return '<button type="button" class="history-award-name" ' + data + ">" + escapeText(holder.name) + "</button>";
        });
        const joiner = award.joiner ? " " + award.joiner + " " : ", ";
        const extra = holders.length > shown.length ? ' <span class="history-award-more">+' + (holders.length - shown.length) + "</span>" : "";
        return labels.join(joiner) + extra;
    }

    function renderFeatured(award) {
        const holder = award.holders[0];
        const portrait = escapeText(holder.image || "image/queens/noimage.jpg");
        return '<article class="history-award-feature">'
            + '<img class="history-award-feature-photo" src="' + portrait + '" alt="" decoding="async">'
            + '<div class="history-award-feature-copy">'
            + '<p class="history-award-kicker"><i class="fa-solid ' + award.icon + '" aria-hidden="true"></i> ' + escapeText(award.title) + "</p>"
            + '<p class="history-award-feature-name">' + renderHolderNames(award, true) + "</p>"
            + '<p class="history-award-feature-value">' + escapeText(award.detail) + "</p>"
            + "</div>"
            + "</article>";
    }

    function renderCard(award, linked) {
        const who = award.holders
            ? renderAvatars(award.holders, award.kind) + '<span class="history-award-who">' + renderHolderNames(award, linked) + "</span>"
            : '<span class="history-award-who"><span class="history-award-text">' + escapeText(award.text) + "</span></span>";
        return '<article class="history-award-card" title="' + escapeText(award.description) + '">'
            + '<span class="history-award-icon"><i class="fa-solid ' + award.icon + '" aria-hidden="true"></i></span>'
            + '<div class="history-award-body">'
            + '<h4 class="history-award-title">' + escapeText(award.title) + "</h4>"
            + '<p class="history-award-desc">' + escapeText(award.description) + "</p>"
            + '<div class="history-award-holder">' + who + "</div>"
            + "</div>"
            + (award.detail ? '<p class="history-award-value">' + escapeText(award.detail) + "</p>" : "")
            + "</article>";
    }

    function renderSections(categories, awards, linked) {
        return categories.map((category) => {
            const items = awards.filter((award) => award.category === category.id);
            if (items.length === 0) return "";
            return '<section class="history-award-section">'
                + '<h3 class="history-award-section-title"><i class="fa-solid ' + category.icon + '" aria-hidden="true"></i> ' + category.title
                + ' <span class="history-award-count">' + items.length + "</span></h3>"
                + '<div class="history-award-grid">' + items.map((award) => renderCard(award, linked)).join("") + "</div>"
                + "</section>";
        }).join("");
    }

    /* All Stars awards compare each returnee's first run in the parent franchise with their All Stars run. */
    function buildAllStarsAwards(parentRows, childRows) {
        const runs = (rows) => {
            const byQueen = new Map();
            rows.forEach(({ season }) => {
                const analysis = analyzeSeason(season);
                if (!analysis) return;
                analysis.queens.forEach((queen) => {
                    const run = byQueen.get(queen.key) || { name: queen.name, image: queen.image, best: 999, crowns: 0, seasons: 0, ranks: [] };
                    run.image = run.image || queen.image;
                    run.seasons += 1;
                    if (queen.rank < 900) {
                        run.best = Math.min(run.best, queen.rank);
                        run.ranks.push(queen.rank);
                    }
                    if (queen.isWinner) run.crowns += 1;
                    byQueen.set(queen.key, run);
                });
            });
            return byQueen;
        };
        const original = runs(parentRows);
        const allStars = runs(childRows);
        const returnees = [];
        allStars.forEach((run, key) => {
            const first = original.get(key);
            if (first) returnees.push({ name: run.name, image: run.image || first.image, first, run });
        });
        if (returnees.length === 0) return [];

        const award = (id, icon, title, description, getValue, formatValue, options = {}) => ({ id, category: "allstars", icon, title, description, kind: "queen", getValue, formatValue, ...options });
        const stats = { queens: returnees, seasons: [], rivalries: [], songs: [] };
        return [
            award("as-redemption", "fa-wand-magic-sparkles", "Redemption Arc", "Never won the first time, crowned on All Stars.", (queen) => (queen.first.crowns === 0 ? queen.run.crowns : 0), (value) => plural(value, "All Stars crown")),
            award("as-double", "fa-crown", "Double Royalty", "Crowned in the original franchise and on All Stars.", (queen) => (queen.first.crowns > 0 ? queen.run.crowns : 0), (value) => plural(value, "All Stars crown")),
            award("as-glow-up", "fa-arrow-up-right-dots", "All Stars Glow Up", "The biggest jump from first-run placement to All Stars placement.", (queen) => (queen.first.best < 900 && queen.run.best < 900 ? queen.first.best - queen.run.best : NaN), (value, queen) => "from " + ordinal(queen.first.best) + " to " + ordinal(queen.run.best)),
            award("as-unfinished", "fa-hourglass-half", "Unfinished Business", "Came back the most times without an All Stars crown.", (queen) => (queen.run.crowns === 0 && queen.run.seasons > 1 ? queen.run.seasons : 0), (value) => plural(value, "return")),
            award("as-deja-vu", "fa-clone", "Déjà Vu", "Finished exactly where they did the first time.", (queen) => (queen.first.ranks.some((rank) => queen.run.ranks.includes(rank)) ? 1 : 0), (_value, queen) => ordinal(queen.run.ranks.find((rank) => queen.first.ranks.includes(rank))) + " again", { hideDetail: false }),
            award("as-returnees", "fa-users", "Most Returns", "Cast on All Stars the most times.", (queen) => queen.run.seasons, (value) => plural(value, "All Stars season"))
        ].map((entry) => resolveAward(entry, stats)).filter(Boolean)
            .filter((entry) => !isSharedByEveryone(entry, returnees.length));
    }

    function renderAwards(host, options) {
        const { activeRows, allRows, activeFranchise } = options;
        const hasOtherFranchises = allRows.length > activeRows.length;
        const scope = host.dataset.awardScope === "all" && hasOtherFranchises ? "all" : "franchise";

        host.dataset.awardScope = scope;
        const rows = scope === "all" ? allRows : activeRows;
        // Inside an All Stars franchise every crown is a returnee's, so "first appearance" awards would mislead.
        const awards = buildAwards(rows).filter((award) => !(scope === "franchise" && options.allStarsParent && award.id === "instant-legend"));

        const scopeControl = hasOtherFranchises
            ? '<div class="history-award-scope" role="group" aria-label="Award scope">'
                + '<button type="button" data-award-scope="franchise" class="' + (scope === "franchise" ? "is-active" : "") + '">' + escapeText(activeFranchise) + "</button>"
                + '<button type="button" data-award-scope="all" class="' + (scope === "all" ? "is-active" : "") + '">All franchises</button>'
                + "</div>"
            : "";

        if (awards.length === 0) {
            host.innerHTML = '<div class="history-awards-head">' + scopeControl + "</div>"
                + '<div class="history-season-empty"><p>Finish and save a season to start earning awards.</p></div>';
        } else {
            const featured = FEATURED_AWARD_IDS
                .map((id) => awards.find((award) => award.id === id))
                .filter(Boolean);
            host.innerHTML = '<div class="history-awards-head">'
                + '<p class="history-awards-summary">' + plural(awards.length, "award") + " from " + plural(rows.length, "season") + ". Ties share the award.</p>"
                + scopeControl
                + "</div>"
                + (featured.length ? '<div class="history-award-features">' + featured.map(renderFeatured).join("") + "</div>" : "")
                + (scope === "franchise" && options.allStarsParent
                    ? renderSections(ALL_STARS_CATEGORY, buildAllStarsAwards(options.parentRows || [], activeRows), true)
                    : "")
                + renderSections(CATEGORIES, awards.filter((award) => !featured.includes(award)), true);
        }

        host.__historyAwardsRender = () => renderAwards(host, host.__historyAwardsOptions);
        host.__historyAwardsOptions = options;
        if (!host.__historyAwardsBound) {
            host.__historyAwardsBound = true;
            host.addEventListener("click", (event) => {
                const target = event.target.closest("button");
                if (!target) return;
                if (target.dataset.awardScope) {
                    host.dataset.awardScope = target.dataset.awardScope;
                    host.__historyAwardsRender();
                } else if (target.dataset.awardQueen) {
                    host.__historyAwardsOptions.onOpenQueen(target.dataset.awardQueen);
                } else if (target.dataset.awardSeason !== undefined) {
                    host.__historyAwardsOptions.onOpenSeason(Number(target.dataset.awardSeason));
                }
            });
        }
    }

    /* Season page: closed by default, and the awards are only worked out the first time it opens. */
    function createSeasonPanel(season) {
        if (!Array.isArray(season && season.cast) || season.cast.length === 0) return null;

        const panel = document.createElement("details");
        panel.className = "history-season-awards";
        panel.innerHTML = '<summary><i class="fa-solid fa-trophy" aria-hidden="true"></i> Season awards'
            + '<span class="history-season-awards-state">Show all</span>'
            + '<i class="fa-solid fa-chevron-down history-season-awards-chevron" aria-hidden="true"></i></summary>'
            + '<div class="history-season-awards-body"></div>';

        const state = panel.querySelector(".history-season-awards-state");
        const body = panel.querySelector(".history-season-awards-body");
        let rendered = false;

        panel.addEventListener("toggle", () => {
            if (panel.open && !rendered) {
                rendered = true;
                const awards = buildSeasonAwards(season);
                body.innerHTML = awards.length > 0
                    ? '<p class="history-awards-summary">' + plural(awards.length, "award") + " this season. Ties share the award.</p>"
                        + renderSections(SEASON_CATEGORIES, awards, false)
                    : '<div class="history-season-empty"><p>No awards to give out for this season yet.</p></div>';
            }
            state.textContent = panel.open ? "Hide" : "Show all";
        });

        return panel;
    }

    window.HistoryAwards = {
        render: renderAwards,
        build: buildAwards,
        buildSeason: buildSeasonAwards,
        createSeasonPanel
    };
})();
