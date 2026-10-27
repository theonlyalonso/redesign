(function() {
    'use strict';

    const STORAGE_KEY = 'ss.drag.unfinishedSetup.v1';
    const statKeys = ['_actingStat', '_comedyStat', '_danceStat', '_designStat', '_improvStat', '_runwayStat', '_lipsyncStat'];
    let initialized = false;
    let pendingDraft = null;
    let restoring = false;
    let completed = false;
    let timer = null;
    let baseline = '';
    let lastSaved = '';
    let twistsReady = false;
    let queuedTwists = null;

    function status(message) {
        const element = document.getElementById('sim-draft-status');
        if (element) element.textContent = message;
    }

    function reportStorageError(error) {
        console.error('Unfinished setup storage failed:', error);
        status('Your setup could not be saved on this browser. Check browser storage before leaving.');
    }

    function capture() {
        return {
            version: 1,
            settings: readSimulationSettings(),
            locks: Array.from(lockedSimulationSettings),
            cast: currentCast.map(queen => ({
                name: queen._name,
                stats: statKeys.map(key => queen[key]),
                images: queen.images,
                imageIndex: queen.currentImageIndex,
                country: queen.country || '',
                isDuo: !!queen.isDuo,
                name1: queen.name1 || '',
                name2: queen.name2 || ''
            })),
            twists: twistsReady ? window.DragSeasonSettings.captureTwists() : queuedTwists || {}
        };
    }

    function save() {
        clearTimeout(timer);
        timer = null;
        if (!initialized || pendingDraft || restoring || completed || !document.querySelector('.sim-settings-panel')) return;
        const data = capture();
        const serialized = JSON.stringify(data);
        if ((!lastSaved && serialized === baseline) || serialized === lastSaved) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
            lastSaved = serialized;
            status('Unfinished setup saved on this browser.');
        } catch (error) {
            reportStorageError(error);
        }
    }

    function compatibilityMessages(settings, count, checked, minimumEpisodes) {
        const messages = [];
        const premiere = settings['premiere-type'];
        const format = settings.format;
        const returning = settings.returning;
        const finale = settings['finale-type'];
        const doublePremieres = ['s6-premiere', 's12-premiere', 'porkchop', 's14-premiere', 'ph2-premiere', 'global-premiere', 'rateaqueen', 's17-premiere'];
        const double = doublePremieres.includes(premiere);
        if (premiere === 'team-premiere' && count && count < 4) messages.push('Team Premiere needs at least 4 contestants.');
        if (premiere === 'team-premiere' && format === 'team') messages.push('Team Premiere cannot be combined with the permanent Teams season format.');
        if (premiere === 'ph4-premiere' && count && count < 4) messages.push('Philippines 4 Premiere needs at least 4 contestants.');
        if (premiere === 'ph4-premiere' && format === 'team') messages.push('Philippines 4 Premiere cannot be combined with the permanent Teams season format.');
        if (count && format === 'team' && count % 2 !== 0) messages.push('Teams needs an even number of contestants. Add or remove one contestant.');
        if (count === 3 && (['all-stars', 'slaysian-format', 'all-winners', 'charity-format'].includes(format) || finale === 'LFTC')) messages.push('All Stars, All Winners, and Lip Sync for the Crown need at least 4 contestants.');
        if (count && double && count < 10) messages.push('This double premiere needs at least 10 contestants.');
        if (count && double && ['top5', 'rankedtop5'].includes(finale) && count < 12) messages.push('A Top 5 finale with this double premiere needs at least 12 contestants.');
        if (count && (settings['premiere-group'] === 'late' || premiere === 'uk3-premiere') && count < 6) messages.push('This premiere needs at least 6 contestants.');
        if (count && ['queensofcomedy', 'reinasdelacomedia', 'conjoined-queens', 'kittygirlgroup', 'attentionggroup'].includes(returning) && count < 10) messages.push('This returning challenge needs at least 10 contestants.');
        if (returning === 'hellbound' && !['top3', 'rankedtop3', 'sverigetop3', 'drthtop3', 'jurytop3'].includes(finale)) messages.push('Hellbound Showdown needs a regular, ranked, Sverige, Thailand, or Jury Top 3 finale.');
        if (returning === 'redLS' && !['all-stars', 'slaysian-format'].includes(format)) messages.push('Red Lipstick returning requires Lip Sync For Your Legacy or Slaysian Royale.');
        if (returning === 'readingIF' && (checked('famegames') || (count && count < 9))) messages.push('Reading is Fundamental needs at least 9 contestants and cannot be combined with Fame Games.');
        if (format === 'team' && (double || settings['premiere-group'] === 'late' || ['uk3-premiere', 'par-premiere'].includes(premiere) || ['smackdown', 'hellbound', 'votes', 'random', 'readingIF', 'choose', 'lalaparuza', 'queensofcomedy', 'reinasdelacomedia', 'kittygirlgroup', 'attentionggroup', 'conjoined-queens'].includes(returning) || ['top5', 'rankedtop5', 'top4', 'top3', 'rankedtop3', 'top2', 'rankedtop2', 'LFTC', 'LFTF', 'jury'].includes(finale) || checked('immunity'))) messages.push('Teams conflicts with these special settings. Use the regular single premiere, no returning challenge, no immunity, and the Teams finale.');
        if (checked('esHeart') && (checked('beaver') || format === 'top2lftw')) messages.push('The Heart and Golden Beaver twists cannot be combined.');
        if (checked('immunity') && (checked('beaver') || format === 'top2lftw')) messages.push('Golden Beaver cannot be combined with immunity.');
        if (['qotu', 'sweatshopC', 'chaos-mode'].filter(checked).length > 1) messages.push('Choose only one of Singer Mode, Fashion Mode, or Chaos Mode.');
        if (['tank', 'chocolateBar', 'cow', 'loteria'].filter(checked).length > 1) messages.push('Choose only one post-elimination save: Dunk Tank, Chocolate Bar, Lucky Cow, or Loteria.');
        if (checked('lsmega') && ['s6-premiere', 's12-premiere', 's14-premiere', 'global-premiere', 'rateaqueen', 's17-premiere', 'ph2-premiere'].includes(premiere)) messages.push('Lip Sync Mega cannot be combined with this double premiere. Choose a single premiere.');
        if (checked('esJuror') && !['all-stars', 'slaysian-format'].includes(format)) messages.push('Spain Jury requires an All Stars legacy format.');
        if (count && settings['target-episodes-mode'] === 'fixed' && Number(settings['target-episodes']) < minimumEpisodes) messages.push(`This cast and finale need at least ${minimumEpisodes} episodes.`);
        return messages;
    }

    function updateCompatibility() {
        const element = document.getElementById('sim-compatibility');
        if (!element) return;
        const messages = compatibilityMessages(readSimulationSettings(), currentCast.length,
            id => !!document.getElementById(id)?.checked,
            getMinimumSeasonEpisodes(currentCast.length, getSelectedFinaleSizeFromUi(), getSelectedSemiFinaleCutFromUi(), getSelectedReturnCountFromUi()));
        const text = messages.length ? 'Check your setup: ' + messages.join(' ') : '';
        if (element.textContent !== text) element.textContent = text;
        element.hidden = !messages.length;
    }

    function changed() {
        if (!initialized || restoring) return;
        updateCompatibility();
        clearTimeout(timer);
        timer = setTimeout(save, 250);
    }

    function complete() {
        completed = true;
        clearTimeout(timer);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            reportStorageError(error);
        }
    }

    function validateDraft(draft) {
        if (!draft || draft.version !== 1 || !Array.isArray(draft.cast) || !draft.settings || !Array.isArray(draft.locks) || !draft.twists || typeof draft.twists !== 'object') throw new Error('The saved setup has an invalid format.');
        for (const id of simulationSettingIds) {
            if (typeof draft.settings[id] !== 'string') throw new Error('The saved setup is missing a setting.');
        }
        for (const queen of draft.cast) {
            if (typeof queen.name !== 'string' || !queen.name || !Array.isArray(queen.stats) || queen.stats.length !== 7 || !queen.stats.every(value => Number.isFinite(value) && value >= 0 && value <= 15) || !Array.isArray(queen.images) || !queen.images.length || !queen.images.every(image => typeof image === 'string') || typeof queen.country !== 'string' || typeof queen.isDuo !== 'boolean' || typeof queen.name1 !== 'string' || typeof queen.name2 !== 'string') throw new Error('A saved contestant has invalid data.');
        }
        if (!draft.locks.every(group => ['premiere', 'returning', 'format', 'finale', 'episodes'].includes(group))) throw new Error('The saved setup has invalid setting locks.');
        for (const id of ['premiere-group', 'returning', 'format', 'finale-size', 'target-episodes-mode']) {
            if (!Array.from(document.getElementById(id).options).some(option => option.value === draft.settings[id])) throw new Error('A saved setting is no longer available: ' + id);
        }
        if (!PREMIERE_TYPES[draft.settings['premiere-group']]?.some(type => type.value === draft.settings['premiere-type']) ||
            !FINALE_TYPES[draft.settings['finale-size']]?.some(type => type.value === draft.settings['finale-type'])) throw new Error('A saved premiere or finale is no longer available.');
        return draft;
    }

    function closePrompt() {
        window.deactivateCenteredPopup(document.getElementById('setup-restore-popup'));
    }

    function discard() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            reportStorageError(error);
            return;
        }
        pendingDraft = null;
        closePrompt();
        status('Previous unfinished setup discarded.');
        changed();
    }

    function restore() {
        try {
            restoreReady();
        } catch (error) {
            restoring = false;
            console.error('Cannot restore unfinished setup:', error);
            document.getElementById('setup-restore-description').textContent = error.message + ' You can discard this saved setup and start fresh.';
        }
    }

    function restoreReady() {
        const draft = validateDraft(pendingDraft);
        restoring = true;
        const settings = draft.settings;
        currentCast = draft.cast.map(saved => {
            const queen = allQueens.find(queen => queen._name === saved.name) || new Queen(saved.name, ...saved.stats, saved.images, true, saved.isDuo, saved.name1, saved.name2);
            statKeys.forEach((key, index) => { queen[key] = saved.stats[index]; });
            queen.country = saved.country;
            queen.images = saved.images.slice();
            queen.currentImageIndex = Number.isInteger(saved.imageIndex) && saved.imageIndex >= 0 && saved.imageIndex < queen.images.length ? saved.imageIndex : 0;
            return queen;
        });
        document.getElementById('premiere-group').value = settings['premiere-group'];
        updatePremiereTypes(settings['premiere-type']);
        document.getElementById('finale-size').value = settings['finale-size'];
        updateFinaleTypes(settings['finale-type']);
        ['returning', 'format', 'target-episodes-mode', 'target-episodes'].forEach(id => { document.getElementById(id).value = settings[id]; });
        document.querySelectorAll('.sim-setting-lock').forEach((button, index) => {
            const group = ['premiere', 'returning', 'format', 'finale', 'episodes'][index];
            if (draft.locks.includes(group) !== lockedSimulationSettings.has(group)) button.click();
        });
        queuedTwists = draft.twists;
        if (twistsReady) {
            window.DragSeasonSettings.applyTwists(queuedTwists);
            queuedTwists = null;
        }
        clearSettingsRandomizationUndo();
        updateCast();
        syncCastQuickStatsUi();
        updateTargetEpisodeControls();
        pendingDraft = null;
        restoring = false;
        closePrompt();
        status('Unfinished setup restored.');
        changed();
    }

    document.addEventListener('drag-twist-menu-ready', () => {
        const unchanged = initialized && !lastSaved && JSON.stringify(capture()) === baseline;
        twistsReady = true;
        if (unchanged) baseline = JSON.stringify(capture());
        if (queuedTwists) {
            restoring = true;
            window.DragSeasonSettings.applyTwists(queuedTwists);
            queuedTwists = null;
            restoring = false;
        }
        changed();
    });
    document.addEventListener('change', event => {
        if (event.target.closest('#twist-menu-root .all-options')) changed();
    });
    document.addEventListener('input', event => {
        if (event.target.closest('#twist-menu-root .all-options')) changed();
    });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    document.addEventListener('DOMContentLoaded', () => {
        if (!document.querySelector('.sim-settings-panel')) return;
        baseline = JSON.stringify(capture());
        initialized = true;
        updateCompatibility();
        document.getElementById('setup-restore').addEventListener('click', restore);
        document.getElementById('setup-discard').addEventListener('click', discard);
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) pendingDraft = JSON.parse(stored) || { invalid: true };
        } catch (error) {
            reportStorageError(error);
            pendingDraft = { invalid: true };
            document.getElementById('setup-restore-description').textContent = 'The saved setup could not be read. You can discard it and start fresh.';
        }
        if (pendingDraft) window.activateCenteredPopup(document.getElementById('setup-restore-popup'));
    });
    window.DragSetup = { changed, complete };
})();
