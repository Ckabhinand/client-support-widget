/* ==========================================================================
   SETTINGS.JS — Settings Page Module
   
   Manages the Settings page including:
   - Profile information display from SDK init params
   - Notification preference toggles (localStorage)
   - Account summary (active contracts, hours)
   - Topbar user chip + avatar rendering
   - Brand color application from SDK theme
   
   Profile data is READ-ONLY — managed by Zoho accounts.
   Notification preferences stored in localStorage.
   ========================================================================== */

'use strict';

var SettingsModule = (function () {

    // =========================================================================
    // PRIVATE — State
    // =========================================================================

    var _initialized   = false;
    var _unsubscribers = [];

    // localStorage key for notification preferences
    var PREFS_KEY = 'clienthub_notification_prefs';

    // Default notification preferences
    var _defaultPrefs = {
        emailNotifications : true,
        taskUpdates        : true,
        hoursAlerts        : true
    };

    // Current preferences
    var _prefs = Object.assign({}, _defaultPrefs);

    // =========================================================================
    // PRIVATE — DOM Helpers
    // =========================================================================

    function _el(id) {
        return document.getElementById(id);
    }

    function _setText(id, text) {
        var el = _el(id);
        if (el) el.textContent = String(text || '');
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

    // =========================================================================
    // PRIVATE — Preferences Storage
    // =========================================================================

    /**
     * Load notification preferences from localStorage
     */
    function _loadPrefs() {
        try {
            var stored = localStorage.getItem(PREFS_KEY);
            if (stored) {
                var parsed = JSON.parse(stored);
                _prefs = Object.assign({}, _defaultPrefs, parsed);
                Logger.debug('SETTINGS', 'Prefs loaded from storage',
                    _prefs);
            }
        } catch (err) {
            Logger.warn('SETTINGS', 'Could not load prefs from storage',
                err);
            _prefs = Object.assign({}, _defaultPrefs);
        }
    }

    /**
     * Save notification preferences to localStorage
     */
    function _savePrefs() {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs));
            Logger.debug('SETTINGS', 'Prefs saved', _prefs);
        } catch (err) {
            Logger.warn('SETTINGS', 'Could not save prefs', err);
        }
    }

    // =========================================================================
    // PRIVATE — Render: Topbar User Chip
    // =========================================================================

    /**
     * Render the topbar user chip with live user data
     * Called once on state:ready — updates name, initials, org
     */
    function _renderTopbarUser() {
        var user = AppState.get('user');
        if (!user.email) return;

        var name     = user.name   || 'User';
        var email    = user.email  || '';
        var initials = _getInitials(name);

        // ── Avatar initials ──
        var avatarEl = document.querySelector(
            '.topbar .avatar'
        );
        if (avatarEl) {
            avatarEl.textContent = initials;
        }

        // ── User name in chip ──
        var userNameEl = document.querySelector(
            '.topbar .user-name'
        );
        if (userNameEl) {
            userNameEl.textContent = name;
        }

        // ── User org (derived from email domain) ──
        var userOrgEl = document.querySelector(
            '.topbar .user-org'
        );
        if (userOrgEl) {
            var domain = email.split('@')[1] || '';
            var org    = domain.split('.')[0] || 'Organization';
            userOrgEl.textContent = _capitalise(org);
        }

        // ── Profile dropdown user info ──
        var profileHead = document.querySelector(
            '.profile-dropdown .profile-head'
        );
        if (profileHead) {
            var profileAvatar = profileHead.querySelector('.avatar.large');
            var profileName   = profileHead.querySelector('h4');
            var profileEmail  = profileHead.querySelector('p');

            if (profileAvatar) profileAvatar.textContent = initials;
            if (profileName)   profileName.textContent   = name;
            if (profileEmail)  profileEmail.textContent  = email;
        }

        // ── Apply brand color ──
        if (user.brandColor && user.brandColor !== '#2563EB') {
            _applyBrandColor(user.brandColor);
        }

        Logger.debug('SETTINGS', 'Topbar user rendered → ' + name);
    }

    /**
     * Get initials from full name
     * "John Smith" → "JS" | "john" → "JO"
     * @param {string} name
     * @returns {string} 1-2 uppercase initials
     */
    function _getInitials(name) {
        if (!name) return 'U';
        var parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    /**
     * Capitalise first letter of a string
     * @param {string} str
     * @returns {string}
     */
    function _capitalise(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Apply brand color from SDK theme to CSS custom property
     * @param {string} color - Hex color string
     */
    function _applyBrandColor(color) {
        if (!color || !/^#[0-9A-Fa-f]{3,8}$/.test(color)) return;

        Logger.debug('SETTINGS', 'Applying brand color → ' + color);

        // We keep our own blue design system as primary
        // Brand color is applied as an accent only
        document.documentElement.style.setProperty(
            '--brand-color', color
        );
    }

    // =========================================================================
    // PRIVATE — Render: Profile Card
    // =========================================================================

    /**
     * Render profile information on the settings page
     */
    function _renderProfileCard() {
        var user = AppState.get('user');

        if (!user.email) return;

        var name   = user.name  || 'User';
        var email  = user.email || '';
        var domain = email.split('@')[1] || '';
        var org    = domain.split('.')[0] || 'Organization';

        // ── Name field ──
        var nameInput = document.querySelector(
            '#page-settings input[type="text"]:first-of-type'
        );
        if (nameInput) {
            nameInput.value = name;
            // Profile name IS editable — allow save
        }

        // ── Email field (read-only) ──
        var emailInput = document.querySelector(
            '#page-settings input[type="email"]'
        );
        if (emailInput) {
            emailInput.value    = email;
            emailInput.disabled = true;
        }

        // ── Company field (read-only — from email domain) ──
        var companyInput = document.querySelector(
            '#page-settings input[type="text"]:last-of-type'
        );
        if (companyInput) {
            companyInput.value    = _capitalise(org) + ' Corporation';
            companyInput.disabled = true;
        }

        Logger.debug('SETTINGS', 'Profile card rendered → ' + email);
    }

    // =========================================================================
    // PRIVATE — Render: Notification Toggles
    // =========================================================================

    /**
     * Render notification preference toggles
     * Restores saved preferences from localStorage
     */
    function _renderNotificationToggles() {
        var notifCard = document.querySelector(
            '#page-settings .settings-grid .card:nth-child(2)'
        );
        if (!notifCard) return;

        var switches = notifCard.querySelectorAll(
            '.switch input[type="checkbox"]'
        );

        var prefKeys = [
            'emailNotifications',
            'taskUpdates',
            'hoursAlerts'
        ];

        switches.forEach(function (switchEl, index) {
            var key = prefKeys[index];
            if (key) {
                switchEl.checked = _prefs[key] !== false;

                // ── Attach change listener ──
                switchEl.addEventListener('change', function () {
                    _prefs[key] = this.checked;
                    _savePrefs();

                    var label = switchEl
                        .closest('.setting-row')
                        .querySelector('h5');

                    showToast(
                        this.checked ? 'Enabled' : 'Disabled',
                        (label ? label.textContent : 'Notification')
                        + ' preference saved.'
                    );

                    Logger.info('SETTINGS',
                        'Pref changed: ' + key + ' → '
                        + this.checked);
                });
            }
        });

        Logger.debug('SETTINGS', 'Notification toggles rendered',
            _prefs);
    }

    // =========================================================================
    // PRIVATE — Render: Account Summary Card
    // =========================================================================

    /**
     * Render or inject an account summary card
     * Shows active contracts and total hours
     */
    function _renderAccountSummary() {
        var contractsState = AppState.get('contracts');
        var summary        = contractsState.hoursSummary;
        var activeCount    = contractsState.active.length;
        var user           = AppState.get('user');

        // Find or create the account summary card
        var settingsGrid = document.querySelector(
            '#page-settings .settings-grid'
        );
        if (!settingsGrid) return;

        // Remove existing account card if present
        var existing = _el('accountSummaryCard');
        if (existing) existing.remove();

        // ── Build account summary card ──
        var card = document.createElement('div');
        card.className = 'card';
        card.id        = 'accountSummaryCard';

        card.innerHTML = [
            '<h3 class="card-title">',
            '  <i class="fa-solid fa-chart-pie"></i>',
            '  Account Summary',
            '</h3>',

            // ── Hours overview ──
            '<div class="setting-row">',
            '  <div>',
            '    <h5>Total Hours Purchased</h5>',
            '    <p>Across all active contracts</p>',
            '  </div>',
            '  <strong style="font-size:18px;font-weight:800;',
            '    color:var(--text);letter-spacing:-0.02em">',
            '    ' + (summary.totalPurchased || 0) + ' hrs',
            '  </strong>',
            '</div>',

            '<div class="setting-row">',
            '  <div>',
            '    <h5>Hours Used</h5>',
            '    <p>Total consumed across contracts</p>',
            '  </div>',
            '  <strong style="font-size:18px;font-weight:800;',
            '    color:var(--text-3);letter-spacing:-0.02em">',
            '    ' + (summary.totalConsumed || 0) + ' hrs',
            '  </strong>',
            '</div>',

            '<div class="setting-row">',
            '  <div>',
            '    <h5>Hours Remaining</h5>',
            '    <p>Available for new tasks</p>',
            '  </div>',
            '  <strong style="font-size:18px;font-weight:800;',
            '    letter-spacing:-0.02em;color:'
                 + (summary.totalRemaining <= 0
                    ? 'var(--red)'
                    : summary.totalRemaining
                      <= CONSTANTS.UI.LOW_HOURS_THRESHOLD
                    ? 'var(--amber)'
                    : 'var(--green)') + '">',
            '    ' + (summary.totalRemaining || 0) + ' hrs',
            '  </strong>',
            '</div>',

            '<div class="setting-row">',
            '  <div>',
            '    <h5>Active Contracts</h5>',
            '    <p>Currently active support plans</p>',
            '  </div>',
            '  <strong style="font-size:18px;font-weight:800;',
            '    color:var(--primary);letter-spacing:-0.02em">',
            '    ' + activeCount,
            '  </strong>',
            '</div>',

            // ── Logged in as ──
            '<div style="margin-top:16px;padding:12px 14px;',
            'background:var(--bg);border-radius:var(--r);',
            'border:1px solid var(--border-light)">',
            '  <p style="font-size:11px;color:var(--text-4);',
            '    margin-bottom:4px;font-weight:600;',
            '    text-transform:uppercase;letter-spacing:0.5px">',
            '    Logged in as',
            '  </p>',
            '  <span style="font-size:13px;font-weight:600;',
            '    color:var(--text);font-family:monospace">',
            '    ' + _escapeHtml(user.email || '—'),
            '  </span>',
            '</div>',

            // ── Quick actions ──
            '<div style="margin-top:16px;display:flex;gap:8px">',
            '  <button class="btn btn-outline btn-sm" ',
            '    onclick="navigateTo(\''
                     + CONSTANTS.PAGES.CONTRACTS + '\')">',
            '    <i class="fa-solid fa-file-contract"></i>',
            '    View Contracts',
            '  </button>',
            '  <button class="btn btn-primary btn-sm" ',
            '    onclick="navigateTo(\''
                     + CONSTANTS.PAGES.PURCHASE + '\')">',
            '    <i class="fa-solid fa-cart-shopping"></i>',
            '    Buy Hours',
            '  </button>',
            '</div>'
        ].join('');

        settingsGrid.appendChild(card);

        Logger.debug('SETTINGS', 'Account summary card rendered');
    }

    // =========================================================================
    // PRIVATE — Render: Save Profile Button
    // =========================================================================

    /**
     * Setup save profile button handler
     */
    function _setupSaveProfileButton() {
        var saveBtn = document.querySelector(
            '#page-settings .card:first-child .btn-primary'
        );
        if (!saveBtn) return;

        // Remove existing listeners by cloning
        var newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);

        newBtn.addEventListener('click', function () {
            _saveProfile();
        });
    }

    /**
     * Save profile changes (display name only)
     * Other fields are read-only
     */
    function _saveProfile() {
        var nameInput = document.querySelector(
            '#page-settings input[type="text"]:first-of-type'
        );

        var newName = nameInput
            ? nameInput.value.trim() : '';

        if (!newName) {
            showToast('Validation Error',
                'Name cannot be empty.');
            return;
        }

        // ── Update state user name ──
        var user = AppState.get('user');
        user.name = newName;
        AppState.set('user', user);

        // ── Re-render topbar ──
        _renderTopbarUser();

        showToast('Profile Updated',
            'Your display name has been saved.');

        Logger.info('SETTINGS', 'Profile saved → name: ' + newName);
    }

    // =========================================================================
    // PRIVATE — Full Settings Render
    // =========================================================================

    /**
     * Render all settings components
     */
    function _renderAll() {
        _renderProfileCard();
        _renderNotificationToggles();
        _renderAccountSummary();
        _setupSaveProfileButton();

        Logger.info('SETTINGS', '✅ Settings page rendered');
    }

    // =========================================================================
    // PRIVATE — Event Subscriptions
    // =========================================================================

    /**
     * Subscribe to state events relevant to settings
     */
    function _subscribeToEvents() {

        // ── State ready → render topbar user ──
        var unsubReady = AppState.on('state:ready', function () {
            _renderTopbarUser();
        });

        // ── Contracts loaded → update account summary ──
        var unsubContracts = AppState.on('contracts:loaded',
            function () {
                var page = document.getElementById('page-settings');
                if (page && page.classList.contains('active')) {
                    _renderAccountSummary();
                }
            }
        );

        // ── Hours updated → update account summary ──
        var unsubHours = AppState.on('hours:updated', function () {
            var page = document.getElementById('page-settings');
            if (page && page.classList.contains('active')) {
                _renderAccountSummary();
            }
        });

        _unsubscribers = [
            unsubReady, unsubContracts, unsubHours
        ];
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Initialize the settings module
     * Called once by app.js
     */
    function init() {
        if (_initialized) {
            Logger.warn('SETTINGS', 'Already initialized');
            return;
        }

        Logger.info('SETTINGS', 'Initializing...');

        // Load saved preferences
        _loadPrefs();

        // Subscribe to state events
        _subscribeToEvents();

        _initialized = true;
        Logger.info('SETTINGS', '✅ Initialized');
    }

    /**
     * Called when user navigates to the settings page
     */
    function onPageEnter() {
        Logger.info('SETTINGS', 'Page entered');
        _renderAll();
    }

    /**
     * Get current notification preferences
     * @returns {Object} Current preferences
     */
    function getPrefs() {
        return Object.assign({}, _prefs);
    }

    /**
     * Set a notification preference programmatically
     * @param {string}  key   - Preference key
     * @param {boolean} value - New value
     */
    function setPref(key, value) {
        if (_prefs[key] === undefined) {
            Logger.warn('SETTINGS', 'setPref: unknown key → ' + key);
            return;
        }
        _prefs[key] = Boolean(value);
        _savePrefs();
        Logger.info('SETTINGS', 'setPref → ' + key + ': ' + value);
    }

    /**
     * Force refresh settings page
     */
    function refresh() {
        Logger.info('SETTINGS', 'Refresh requested');
        _renderAll();
    }

    /**
     * Destroy module — clean up subscriptions
     */
    function destroy() {
        _unsubscribers.forEach(function (unsub) {
            if (typeof unsub === 'function') unsub();
        });
        _unsubscribers = [];
        _initialized   = false;
        Logger.info('SETTINGS', 'Destroyed');
    }

    // =========================================================================
    // EXPOSE PUBLIC API
    // =========================================================================
    return {
        init        : init,
        onPageEnter : onPageEnter,
        getPrefs    : getPrefs,
        setPref     : setPref,
        refresh     : refresh,
        destroy     : destroy
    };

})();