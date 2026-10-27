(function() {
    'use strict';

    const THEME_KEY = 'simulatorTheme';
    const TWIST_MENU_STORAGE_KEY = 'twistMenuStyleSettings';
    const LIGHT_THEME = 'light';
    const DARK_THEME = 'dark';
    const ANNIVERSARY_MODE_KEY = 'dragAnniversaryMode';
    const ANNIVERSARY_CONFETTI_KEY = 'dragAnniversaryConfetti';
    const ANNIVERSARY_BANNER_DISMISSED_KEY = 'dragAnniversaryBannerDismissedYear';
    let anniversaryMode = 'auto';
    let anniversaryConfetti = true;
    let anniversaryBannerDismissedYear = '';
    let anniversaryBanner;
    let anniversaryTimer;
    let anniversaryEffects;

    const dialogs = [];
    const inertElements = new Map();
    const busyActions = new Set();
    const focusableSelector = 'button, input, select, textarea, a[href], summary, [contenteditable="true"], [tabindex]';

    function dialogControls(box) {
        return Array.from(box.querySelectorAll(focusableSelector)).filter(function(element) {
            return !element.disabled && element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length > 0;
        });
    }

    function focusDialog(box) {
        const controls = dialogControls(box);
        (controls[0] || box).focus({ preventScroll: true });
    }

    function syncDialogIsolation() {
        inertElements.forEach(function(inert, element) { element.inert = inert; });
        inertElements.clear();
        const active = dialogs[dialogs.length - 1];
        if (!active) return;
        let branch = active.box;
        while (branch.parentElement) {
            Array.from(branch.parentElement.children).forEach(function(sibling) {
                if (sibling === branch || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) return;
                inertElements.set(sibling, sibling.inert);
                sibling.inert = true;
            });
            branch = branch.parentElement;
            if (branch === document.documentElement) break;
        }
    }

    function activateDialog(box, close) {
        if (dialogs.some(function(dialog) { return dialog.box === box; })) return;
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        if (!box.hasAttribute('aria-label') && !box.hasAttribute('aria-labelledby')) {
            box.setAttribute('aria-label', box.querySelector('h2, h3')?.textContent || 'Simulator dialog');
        }
        if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
        dialogs.push({ box: box, close: close, opener: document.activeElement });
        syncDialogIsolation();
        focusDialog(box);
    }

    function deactivateDialog(box) {
        const index = dialogs.findIndex(function(dialog) { return dialog.box === box; });
        if (index < 0) return;
        const wasTop = index === dialogs.length - 1;
        const dialog = dialogs.splice(index, 1)[0];
        syncDialogIsolation();
        if (!wasTop) return;
        const parent = dialogs[dialogs.length - 1];
        if (dialog.opener?.isConnected && !dialog.opener.disabled && !dialog.opener.closest('[inert]') && (!parent || parent.box.contains(dialog.opener))) {
            dialog.opener.focus({ preventScroll: true });
        } else if (parent) {
            focusDialog(parent.box);
        }
    }

    document.addEventListener('keydown', function(event) {
        const dialog = dialogs[dialogs.length - 1];
        if (!dialog || event.isComposing) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            dialog.close();
        } else if (event.key === 'Tab') {
            const controls = dialogControls(dialog.box);
            const first = controls[0] || dialog.box;
            const last = controls[controls.length - 1] || dialog.box;
            if (!controls.length || !dialog.box.contains(document.activeElement) ||
                (event.shiftKey && document.activeElement === first) ||
                (!event.shiftKey && document.activeElement === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus({ preventScroll: true });
            }
        }
    }, true);

    document.addEventListener('focusin', function(event) {
        const dialog = dialogs[dialogs.length - 1];
        if (dialog && !dialog.box.contains(event.target)) focusDialog(dialog.box);
    });

    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
            document.body.classList.contains('accessibility-reduce-motion');
    }

    const revealAnimations = new WeakMap();

    function reveal(element, slide = true) {
        if (!element) return;
        revealAnimations.get(element)?.cancel();
        revealAnimations.delete(element);
        if (prefersReducedMotion() || typeof element.animate !== 'function') return;
        const frames = slide
            ? [{ opacity: 0.65, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }]
            : [{ opacity: 0.65 }, { opacity: 1 }];
        const animation = element.animate(frames, { duration: 180, easing: 'ease-out' });
        revealAnimations.set(element, animation);
        const finish = function() {
            if (revealAnimations.get(element) === animation) revealAnimations.delete(element);
        };
        animation.onfinish = finish;
        animation.oncancel = finish;
    }

    const diceRolls = new WeakMap();
    const diceFaces = ['one', 'two', 'three', 'four', 'five', 'six'];

    function rollSettingsDice(button) {
        if (button.disabled) return;
        const icon = button.querySelector('i');
        if (!icon) return;
        diceRolls.get(icon)?.cancel();
        function showFace() {
            icon.classList.remove('fa-dice', ...diceFaces.map(function(face) { return 'fa-dice-' + face; }));
            icon.classList.add('fa-dice-' + diceFaces[Math.floor(Math.random() * diceFaces.length)]);
        }
        icon.setAttribute('aria-hidden', 'true');
        showFace();
        if (prefersReducedMotion() || typeof icon.animate !== 'function') return;
        const animation = icon.animate([
            { transform: 'perspective(120px) translateY(0) rotateX(0deg) rotateZ(0deg)' },
            { transform: 'perspective(120px) translateY(-9px) rotateX(140deg) rotateZ(110deg)', offset: 0.3 },
            { transform: 'perspective(120px) translateY(2px) rotateX(280deg) rotateZ(240deg)', offset: 0.65 },
            { transform: 'perspective(120px) translateY(-3px) rotateX(340deg) rotateZ(320deg)', offset: 0.85 },
            { transform: 'perspective(120px) translateY(0) rotateX(360deg) rotateZ(360deg)' }
        ], { duration: 560, easing: 'ease-out' });
        const timer = setInterval(showFace, 80);
        function finish() {
            clearInterval(timer);
            if (diceRolls.get(icon) === animation) diceRolls.delete(icon);
        }
        animation.onfinish = finish;
        animation.oncancel = finish;
        diceRolls.set(icon, animation);
    }

    document.addEventListener('click', function(event) {
        const button = event.target.closest('.sim-dice-btn, .sim-randomize-all-btn');
        if (!button || button.disabled) return;
        if (button.matches('.sim-dice-btn')) {
            rollSettingsDice(button);
        } else {
            button.closest('.sim-settings-panel').querySelectorAll('.sim-dice-btn').forEach(rollSettingsDice);
        }
    });

    async function runBusyAction(key, button, label, action) {
        if (busyActions.has(key)) return;
        busyActions.add(key);
        const wasDisabled = button?.disabled;
        const originalLabel = button?.innerHTML;
        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.textContent = label;
        }
        const status = button?.closest?.('[role="dialog"]')?.querySelector('[data-loading-status]') ||
            document.getElementById('sim-loading-status');
        if (status) status.textContent = label;
        try {
            await new Promise(function(resolve) { requestAnimationFrame(function() { setTimeout(resolve, 0); }); });
            return await action();
        } catch (error) {
            console.error('Drag UI action failed:', key, error);
            if (status) status.textContent = 'This action failed. Please try again.';
            if (typeof window.showInHouseAlert === 'function') {
                await window.showInHouseAlert('This action failed. Please try again.', 'Unable to complete action');
            }
            throw error;
        } finally {
            busyActions.delete(key);
            if (button) {
                button.disabled = wasDisabled;
                button.removeAttribute('aria-busy');
                button.innerHTML = originalLabel;
            }
            if (status && status.textContent === label) status.textContent = '';
        }
    }

    function updateCastCards(container, queens, render) {
        const oldCards = Array.from(container.children).filter(function(card) { return !card.classList.contains('cast-exit'); });
        const oldPositions = new Map(oldCards.map(function(card) { return [card, { left: card.offsetLeft, top: card.offsetTop }]; }));
        const animate = !prefersReducedMotion() && typeof container.animate === 'function';
        oldCards.forEach(function(card) {
            if (card._castAnimation) card._castAnimation.cancel();
        });
        const cards = queens.map(function(queen) {
            const markup = render(queen);
            let card = oldCards.find(function(item) { return item._castQueen === queen; });
            if (!card) {
                const template = document.createElement('template');
                template.innerHTML = markup;
                card = template.content.firstElementChild;
            } else if (card._castMarkup !== markup) {
                const template = document.createElement('template');
                template.innerHTML = markup;
                card.innerHTML = template.content.firstElementChild.innerHTML;
            }
            card._castQueen = queen;
            card._castMarkup = markup;
            container.appendChild(card);
            return card;
        });
        oldCards.filter(function(card) { return !cards.includes(card); }).forEach(function(card) {
            if (!animate) { card.remove(); return; }
            const position = oldPositions.get(card);
            const width = card.offsetWidth;
            card.classList.add('cast-exit');
            card.setAttribute('aria-hidden', 'true');
            card.inert = true;
            card.querySelectorAll('[id]').forEach(function(element) { element.removeAttribute('id'); });
            card.style.left = position.left + 'px';
            card.style.top = position.top + 'px';
            card.style.width = width + 'px';
            card.style.margin = '0';
            const animation = card.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 120, easing: 'ease-out' });
            animation.onfinish = animation.oncancel = function() { card.remove(); };
        });
        if (!animate) return;
        cards.forEach(function(card) {
            const previous = oldPositions.get(card);
            const from = previous
                ? { transform: 'translate(' + (previous.left - card.offsetLeft) + 'px, ' + (previous.top - card.offsetTop) + 'px)' }
                : { opacity: 0, transform: 'translateY(6px)' };
            if (previous && previous.left === card.offsetLeft && previous.top === card.offsetTop) return;
            card._castAnimation = card.animate([from, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'ease-out' });
        });
    }

    window.DragUi = {
        activateDialog: activateDialog,
        deactivateDialog: deactivateDialog,
        runBusyAction: runBusyAction,
        updateCastCards: updateCastCards,
        reveal: reveal
    };

    function initializeFixedTwistMenu() {
        const root = document.getElementById('twist-menu-root');
        if (!root) return;

        document.documentElement.appendChild(root);
        const syncTypography = function() {
            const style = window.getComputedStyle(document.body);
            root.style.fontFamily = style.fontFamily;
            root.style.fontSize = style.fontSize;
            root.style.lineHeight = style.lineHeight;
            root.style.letterSpacing = style.letterSpacing;
            root.style.color = style.color;
        };
        syncTypography();
        new MutationObserver(syncTypography).observe(document.body, {
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }

    function initializeAnniversaryEffects() {
        const canvas = document.createElement('canvas');
        canvas.id = 'anniversary-confetti';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.hidden = true;
        // The body has a theme filter, which would otherwise make a fixed canvas scroll with it.
        document.documentElement.appendChild(canvas);
        const context = canvas.getContext('2d');
        if (!context) {
            console.warn('Anniversary confetti is unavailable: canvas context could not be created.');
            return { update: function() {}, setPaused: function() {} };
        }
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const anniversaryColors = ['#ff39b1', '#ffd84d', '#a451ff', '#51e1df', '#ffffff'];
        const birthdayColors = ['#6dabe4', '#e62798', '#ffffff'];
        let particles = [];
        let frame = null;
        let enabled = false;
        let paused = false;
        let previousTime = 0;
        let emissionTime = 0;
        let lastPointerTime = 0;
        let width = 0;
        let height = 0;

        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            const scale = Math.min(window.devicePixelRatio || 1, 2);
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);
            context.setTransform(scale, 0, 0, scale, 0, 0);
        }

        function addParticle(x, y, glitter, burst = false) {
            if (particles.length >= 140) return;
            const direction = Math.random() * Math.PI * 2;
            const speed = 100 + Math.random() * 230;
            const colors = document.body.classList.contains('drag-yitzu-birthday') ? birthdayColors : anniversaryColors;
            particles.push({
                x: x, y: y, glitter: glitter,
                vx: burst ? Math.cos(direction) * speed : (Math.random() - 0.5) * (glitter ? 85 : 50),
                vy: burst ? Math.sin(direction) * speed : glitter ? 20 + Math.random() * 45 : 95 + Math.random() * 100,
                burst: burst,
                size: burst ? 3 + Math.random() * 6 : glitter ? 2 + Math.random() * 5 : 5 + Math.random() * 5,
                angle: Math.random() * Math.PI * 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: burst ? 0.8 + Math.random() * 0.5 : glitter ? 0.5 + Math.random() * 0.4 : 12,
                age: 0
            });
        }

        function animate(time) {
            frame = null;
            const seconds = Math.min((time - previousTime) / 1000, 0.04);
            previousTime = time;
            emissionTime += seconds;
            if (emissionTime >= 0.12) {
                addParticle(Math.random() * width, -12, false);
                emissionTime = 0;
            }
            context.clearRect(0, 0, width, height);
            particles = particles.filter(particle => particle.age < particle.life && particle.y < height + 20);
            particles.forEach(particle => {
                particle.age += seconds;
                if (particle.burst) {
                    particle.vx *= Math.exp(-1.4 * seconds);
                    particle.vy += 120 * seconds;
                }
                particle.x += particle.vx * seconds;
                particle.y += particle.vy * seconds;
                particle.angle += seconds * (particle.glitter ? 0.6 : 2);
                context.save();
                context.translate(particle.x, particle.y);
                context.rotate(particle.angle);
                context.fillStyle = particle.color;
                context.globalAlpha = Math.max(0, 1 - particle.age / particle.life);
                if (particle.glitter) {
                    context.beginPath();
                    context.moveTo(0, -particle.size);
                    context.lineTo(particle.size * 0.28, -particle.size * 0.28);
                    context.lineTo(particle.size, 0);
                    context.lineTo(particle.size * 0.28, particle.size * 0.28);
                    context.lineTo(0, particle.size);
                    context.lineTo(-particle.size * 0.28, particle.size * 0.28);
                    context.lineTo(-particle.size, 0);
                    context.lineTo(-particle.size * 0.28, -particle.size * 0.28);
                    context.closePath();
                    context.fill();
                } else {
                    context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.45);
                }
                context.restore();
            });
            frame = requestAnimationFrame(animate);
        }

        function update() {
            const running = enabled && !paused && !reducedMotion.matches && !document.hidden;
            canvas.hidden = !running;
            if (running && frame === null) {
                resize();
                for (let i = 0; i < 44; i++) {
                    addParticle(Math.random() * width, Math.random() * height * 0.7, false);
                }
                previousTime = performance.now();
                frame = requestAnimationFrame(animate);
            } else if (!running) {
                if (frame !== null) cancelAnimationFrame(frame);
                frame = null;
                particles = [];
                emissionTime = 0;
                context.clearRect(0, 0, width, height);
            }
        }

        window.addEventListener('resize', function() { if (frame !== null) resize(); });
        reducedMotion.addEventListener('change', update);
        document.addEventListener('pointermove', function(event) {
            if (frame === null || event.pointerType === 'touch') return;
            const now = performance.now();
            if (now - lastPointerTime < 18) return;
            lastPointerTime = now;
            for (let i = 0; i < 3; i++) {
                addParticle(event.clientX + (Math.random() - 0.5) * 12, event.clientY + (Math.random() - 0.5) * 12, true);
            }
        }, { passive: true });
        document.addEventListener('pointerdown', function(event) {
            if (frame === null || event.target?.closest('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]')) return;
            for (let i = 0; i < 14; i++) {
                addParticle(event.clientX + (Math.random() - 0.5) * 45, event.clientY + (Math.random() - 0.5) * 45, true);
            }
        }, { passive: true });
        document.addEventListener('click', function(event) {
            if (frame === null) return;
            const button = event.target.closest('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]');
            if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
            const bounds = button.getBoundingClientRect();
            const x = event.detail === 0 ? bounds.left + bounds.width / 2 : event.clientX;
            const y = event.detail === 0 ? bounds.top + bounds.height / 2 : event.clientY;
            particles = particles.slice(-104);
            for (let i = 0; i < 36; i++) {
                addParticle(x, y, true, true);
            }
        }, { capture: true, passive: true });
        return {
            update: function(active) {
                enabled = active;
                update();
            },
            setPaused: function(value) {
                paused = value;
                update();
            }
        };
    }

    function isAnniversaryDate(date) {
        return date.getMonth() === 9 && date.getDate() === 10;
    }

    function isYitzuBirthday(date) {
        return date.getMonth() === 9 && date.getDate() === 13;
    }

    function saveAnniversarySetting(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (err) {
            console.warn('Failed to save anniversary setting:', key, err);
        }
    }

    function setAnniversaryMode(mode) {
        if (!['preview', 'off', 'auto'].includes(mode)) {
            console.warn('Invalid anniversary mode:', mode);
            return;
        }
        anniversaryMode = mode;
        saveAnniversarySetting(ANNIVERSARY_MODE_KEY, mode);
        const url = new URL(window.location.href);
        if (url.searchParams.has('anniversary')) {
            url.searchParams.delete('anniversary');
            window.history.replaceState(window.history.state, '', url);
        }
        updateAnniversaryTheme();
    }

    function setAnniversaryConfetti(enabled) {
        anniversaryConfetti = enabled;
        saveAnniversarySetting(ANNIVERSARY_CONFETTI_KEY, String(enabled));
        anniversaryEffects.setPaused(!enabled);
    }

    function syncAnniversaryStyleControls() {
        const modeSelect = document.getElementById('anniversary-mode');
        const confettiToggle = document.getElementById('anniversary-confetti-toggle');
        if (modeSelect) modeSelect.value = anniversaryMode;
        if (confettiToggle) confettiToggle.checked = anniversaryConfetti;
        return !!modeSelect;
    }

    function bindAnniversaryStyleControls() {
        document.addEventListener('change', function(event) {
            if (event.target.id === 'anniversary-mode') setAnniversaryMode(event.target.value);
            else if (event.target.id === 'anniversary-confetti-toggle') setAnniversaryConfetti(event.target.checked);
        });
        // The twist menu is fetched and injected after load, so sync once its controls appear.
        if (syncAnniversaryStyleControls()) return;
        const observer = new MutationObserver(function() {
            if (syncAnniversaryStyleControls()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function updateAnniversaryTheme() {
        const now = new Date();
        const yitzuBirthday = anniversaryMode === 'preview' ||
            (anniversaryMode === 'auto' && isYitzuBirthday(now));
        const active = anniversaryMode === 'preview' ||
            (anniversaryMode === 'auto' && (isAnniversaryDate(now) || isYitzuBirthday(now)));
        document.body.classList.toggle('drag-anniversary', active);
        document.body.classList.toggle('drag-yitzu-birthday', yitzuBirthday);
        const celebrationKey = now.getFullYear() + ':' + (yitzuBirthday ? 'yitzu' : 'anniversary');
        const legacyAnniversaryDismissal = !yitzuBirthday && isAnniversaryDate(now) &&
            anniversaryBannerDismissedYear === String(now.getFullYear());
        anniversaryBanner.hidden = !active || anniversaryBannerDismissedYear === celebrationKey || legacyAnniversaryDismissal;
        anniversaryBanner.querySelector('h2').textContent = yitzuBirthday ? 'Happy birthday, Yitzu!' : "It's our birthday!";
        anniversaryBanner.querySelector('.anniversary-message').hidden = yitzuBirthday;
        anniversaryBanner.querySelector('.anniversary-message').textContent = yitzuBirthday
            ? ''
            : 'Another year of simulating drag queens instead of doing literally anything else. Thanks for sticking around <3';
        anniversaryEffects.update(active);
        clearTimeout(anniversaryTimer);
        const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        anniversaryTimer = setTimeout(updateAnniversaryTheme, nextMidnight.getTime() - now.getTime() + 100);
    }

    function initializeAnniversaryTheme() {
        const queryMode = new URL(window.location.href).searchParams.get('anniversary');
        try {
            const savedMode = localStorage.getItem(ANNIVERSARY_MODE_KEY);
            if (['preview', 'off', 'auto'].includes(savedMode)) anniversaryMode = savedMode;
            anniversaryConfetti = localStorage.getItem(ANNIVERSARY_CONFETTI_KEY) !== 'false';
            anniversaryBannerDismissedYear = localStorage.getItem(ANNIVERSARY_BANNER_DISMISSED_KEY) || '';
        } catch (err) {
            console.warn('Failed to read anniversary settings:', err);
        }
        if (['preview', 'off', 'auto'].includes(queryMode)) {
            anniversaryMode = queryMode;
            saveAnniversarySetting(ANNIVERSARY_MODE_KEY, queryMode);
        }

        const stylesheet = document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = '/sponsors/drag/css/anniversary.css?v=20261013a';
        document.head.appendChild(stylesheet);

        anniversaryBanner = document.createElement('header');
        anniversaryBanner.id = 'drag-anniversary-banner';
        anniversaryBanner.hidden = true;
        anniversaryBanner.setAttribute('aria-labelledby', 'anniversary-title');
        const party = document.createElement('div');
        party.className = 'anniversary-party';
        party.setAttribute('aria-hidden', 'true');
        party.textContent = 'PARTY!';
        const content = document.createElement('div');
        content.className = 'anniversary-content';
        const title = document.createElement('h2');
        title.id = 'anniversary-title';
        title.textContent = "It's our birthday!";
        const message = document.createElement('p');
        message.className = 'anniversary-message';
        message.textContent = "Another year of simulating drag queens instead of doing literally anything else. Thanks for sticking around <3";
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'anniversary-banner-close';
        closeButton.setAttribute('aria-label', 'Dismiss birthday banner');
        closeButton.title = 'Dismiss birthday banner';
        closeButton.textContent = '\u00d7';
        closeButton.addEventListener('click', function() {
            anniversaryBannerDismissedYear = new Date().getFullYear() + ':' +
                (document.body.classList.contains('drag-yitzu-birthday') ? 'yitzu' : 'anniversary');
            saveAnniversarySetting(ANNIVERSARY_BANNER_DISMISSED_KEY, anniversaryBannerDismissedYear);
            anniversaryBanner.hidden = true;
        });
        content.append(title, message);
        anniversaryBanner.append(party, content, closeButton);
        const navbarRoot = document.getElementById('navbar-root');
        if (navbarRoot) navbarRoot.after(anniversaryBanner);
        else document.body.prepend(anniversaryBanner);
        anniversaryEffects = initializeAnniversaryEffects();
        anniversaryEffects.setPaused(!anniversaryConfetti);

        updateAnniversaryTheme();
        bindAnniversaryStyleControls();
        document.addEventListener('visibilitychange', function() {
            updateAnniversaryTheme();
        });
    }

    function initializeTheme() {
        let savedTheme = document.documentElement.getAttribute('data-theme') === DARK_THEME ? DARK_THEME : LIGHT_THEME;
        let hasSaved = false;

        try {
            const twistMenuData = localStorage.getItem(TWIST_MENU_STORAGE_KEY);
            if (twistMenuData) {
                const data = JSON.parse(twistMenuData);
                if (typeof data.nightMode === 'boolean') {
                    savedTheme = data.nightMode ? DARK_THEME : LIGHT_THEME;
                    hasSaved = true;
                }
            }
        } catch (err) {
            console.warn("Failed to read twist menu storage:", err);
        }

        if (!hasSaved) {
            const legacyTheme = localStorage.getItem(THEME_KEY);
            if (legacyTheme === DARK_THEME || legacyTheme === LIGHT_THEME) {
                savedTheme = legacyTheme;
            }
        }

        applyTheme(savedTheme);
    }

    function applyTheme(theme) {
        theme = theme === DARK_THEME ? DARK_THEME : LIGHT_THEME;

        // New design: light/dark is a data-theme attribute on <html> (tokens live in styles.css),
        // so there is no style.light.css / style.dark.css to swap any more.
        document.documentElement.setAttribute('data-theme', theme);
        applyBackgroundFilter(theme);
        document.documentElement.dataset.anniversaryBaseTheme = theme === DARK_THEME ? DARK_THEME : LIGHT_THEME;

        try {
            const storageKey = TWIST_MENU_STORAGE_KEY;
            const raw = localStorage.getItem(storageKey);
            let data = {};
            if (raw) {
                try {
                    data = JSON.parse(raw);
                } catch (err) {
                    console.warn("Failed to parse existing storage:", err);
                }
            }
            data.nightMode = theme === DARK_THEME;
            localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (err) {
            console.warn("Failed to save theme preference:", err);
        }

        try {
            localStorage.setItem(THEME_KEY, theme);
            localStorage.setItem('ss-theme', theme); // read by the no-flash script in <head>
        } catch (err) {
            console.warn("Failed to save theme preference:", err);
        }

        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }

    function applyBackgroundFilter() {
        // The old site darkened the page with a body filter; the new dark theme has its own colours.
        document.body.style.filter = '';
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || LIGHT_THEME;
        const newTheme = currentTheme === LIGHT_THEME ? DARK_THEME : LIGHT_THEME;
        applyTheme(newTheme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializeFixedTwistMenu();
            initializeTheme();
            initializeAnniversaryTheme();
        });
    } else {
        initializeFixedTwistMenu();
        initializeTheme();
        initializeAnniversaryTheme();
    }

    window.changeTheme = applyTheme;
    window.toggleTheme = toggleTheme;
    window.getCurrentTheme = function() {
        return document.documentElement.getAttribute('data-theme') || LIGHT_THEME;
    };
})();
