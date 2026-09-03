/* ==========================================================================
   NAVIGATION.JS — SPA Routing + Page Lifecycle
   ========================================================================== */

'use strict';

(function () {

    // =========================================================================
    // PUBLIC — Navigate to Page
    // =========================================================================

    window.navigateTo = function (pageId) {
        if (!pageId) {
            Logger.warn('NAV', 'navigateTo called with empty pageId');
            return;
        }

        Logger.debug('NAV', 'navigateTo → ' + pageId);

        // ── Update nav item active classes ──
        document.querySelectorAll('.nav-item').forEach(function (item) {
            var itemPage = item.getAttribute('data-page');
            item.classList.toggle('active', itemPage === pageId);
        });

        // ── Hide all pages, show target ──
        document.querySelectorAll('.page').forEach(function (page) {
            page.classList.remove('active');
        });

        var targetPage = document.getElementById('page-' + pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        } else {
            Logger.warn('NAV', 'Page element not found: #page-' + pageId);
            return;
        }

        // ── Update AppState current page ──
        if (typeof AppState !== 'undefined') {
            AppState.setUI('currentPage', pageId);
        }

        // ── Call page module lifecycle hook ──
        _callOnPageEnter(pageId);

        // ── Scroll to top ──
        window.scrollTo({ top: 0, behavior: 'smooth' });

        Logger.info('NAV', '✅ Navigated to → ' + pageId);
    };

    // =========================================================================
    // PRIVATE — Page Module Lifecycle Router
    // =========================================================================

    function _callOnPageEnter(pageId) {
        var P = (typeof CONSTANTS !== 'undefined')
            ? CONSTANTS.PAGES
            : {
                DASHBOARD    : 'dashboard',
                REQUIREMENTS : 'requirements',
                TASKS        : 'tasks',
                CONTRACTS    : 'contracts',
                PURCHASE     : 'purchase',
                SETTINGS     : 'settings',
                BUG_REPORT   : 'bug-report'
            };

        switch (pageId) {

            case P.DASHBOARD:
                if (typeof AppState !== 'undefined'
                    && typeof DashboardModule !== 'undefined') {
                    var contracts = AppState.get('contracts');
                    if (contracts && contracts.loaded) {
                        DashboardModule.load();
                    }
                }
                break;

            case P.REQUIREMENTS:
                if (typeof RequirementsModule !== 'undefined') {
                    RequirementsModule.onPageEnter();
                }
                break;

            case P.TASKS:
                if (typeof TasksModule !== 'undefined') {
                    TasksModule.onPageEnter();
                }
                break;

            case P.CONTRACTS:
                if (typeof ContractsModule !== 'undefined') {
                    ContractsModule.onPageEnter();
                }
                break;

            case P.PURCHASE:
                if (typeof PricingModule !== 'undefined') {
                    PricingModule.onPageEnter();
                }
                break;

            case P.SETTINGS:
                if (typeof SettingsModule !== 'undefined') {
                    SettingsModule.onPageEnter();
                }
                break;

            case P.BUG_REPORT:
                if (typeof BugReportModule !== 'undefined') {
                    BugReportModule.onPageEnter();
                }
                break;

            default:
                Logger.debug('NAV', 'No onPageEnter hook for: ' + pageId);
                break;
        }
    }

    // =========================================================================
    // PUBLIC — Alert Bar Dismiss
    // =========================================================================

    window.dismissAlert = function () {
        var banner = document.getElementById('alertBar');
        if (!banner) return;

        banner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        banner.style.opacity    = '0';
        banner.style.transform  = 'translateY(-10px)';

        setTimeout(function () {
            banner.style.display = 'none';
        }, 300);

        Logger.debug('NAV', 'Alert bar dismissed');
    };

    // =========================================================================
    // PRIVATE — Click Listeners
    // =========================================================================

    function _initNavListeners() {
        document.querySelectorAll('[data-page]').forEach(function (item) {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                var page = this.getAttribute('data-page');
                if (page) navigateTo(page);
            });
        });

        Logger.debug('NAV', 'Nav item click listeners attached');
    }

    // =========================================================================
    // PRIVATE — Keyboard Shortcuts
    // =========================================================================

    function _initKeyboardNav() {
        document.addEventListener('keydown', function (e) {

            if (e.target.matches('input, textarea, select')) return;

            var P = (typeof CONSTANTS !== 'undefined')
                ? CONSTANTS.PAGES
                : { DASHBOARD: 'dashboard' };

            var dashPage   = document.getElementById('page-' + P.DASHBOARD);
            var dashActive = dashPage && dashPage.classList.contains('active');

            if (dashActive) {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (typeof AppState !== 'undefined') {
                        AppState.switchTimeline('prev');
                    }
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (typeof AppState !== 'undefined') {
                        AppState.switchTimeline('next');
                    }
                }
            }

            if (e.key === 'Escape') {
                var openModals = document.querySelectorAll('.modal-backdrop.show');
                if (openModals.length > 0) {
                    openModals.forEach(function (modal) {
                        modal.classList.remove('show');
                    });
                    document.body.style.overflow = '';
                    Logger.debug('NAV', 'Escape: closed modals');
                    return;
                }

                var detailPanel = document.getElementById('detailPanel');
                if (detailPanel && detailPanel.classList.contains('show')) {
                    if (typeof RequirementsModule !== 'undefined') {
                        RequirementsModule.closeDetail();
                    }
                    Logger.debug('NAV', 'Escape: closed detail panel');
                }
            }
        });

        Logger.debug('NAV', 'Keyboard navigation initialized');
    }

    // =========================================================================
    // PRIVATE — Dropdown Menus
    // =========================================================================

    function _initDropdowns() {
        document.addEventListener('click', function (e) {
            document.querySelectorAll('.dropdown.show').forEach(function (dropdown) {
                if (!dropdown.contains(e.target)) {
                    dropdown.classList.remove('show');
                }
            });
        });

        var notifIcon = document.querySelector(
            '.topbar .icon-action[title="Notifications"]'
        );
        if (notifIcon) {
            notifIcon.addEventListener('click', function (e) {
                e.stopPropagation();
                var notifDd   = document.querySelector('.notif-dropdown');
                var profileDd = document.querySelector('.profile-dropdown');
                if (profileDd) profileDd.classList.remove('show');
                if (notifDd)   notifDd.classList.toggle('show');
            });
        }

        var userChip = document.querySelector('.topbar .user-chip');
        if (userChip) {
            userChip.addEventListener('click', function (e) {
                e.stopPropagation();
                var profileDd = document.querySelector('.profile-dropdown');
                var notifDd   = document.querySelector('.notif-dropdown');
                if (notifDd)   notifDd.classList.remove('show');
                if (profileDd) profileDd.classList.toggle('show');
            });
        }

        Logger.debug('NAV', 'Dropdown menus initialized');
    }

    // =========================================================================
    // PRIVATE — Brand Click
    // =========================================================================

    function _initBrandClick() {
        var brand = document.querySelector('.topbar .brand');
        if (brand) {
            brand.addEventListener('click', function () {
                var dashPage = (typeof CONSTANTS !== 'undefined')
                    ? CONSTANTS.PAGES.DASHBOARD
                    : 'dashboard';
                navigateTo(dashPage);
            });
            Logger.debug('NAV', 'Brand click listener attached');
        }
    }

    // =========================================================================
    // INIT
    // =========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        _initNavListeners();
        _initKeyboardNav();
        _initDropdowns();
        _initBrandClick();

        Logger.info('NAV', '✅ Navigation initialized');
    });

})();