/* ==========================================================================
   UI.JS — Shared UI Utilities
   
   Manages:
   - Modal open/close
   - Toast notifications
   - Progress bar animations
   - Global animation init
   ========================================================================== */

'use strict';

(function () {

    // =========================================================================
    // PRIVATE — Toast State
    // =========================================================================

    var _toastTimeout = null;

    // =========================================================================
    // PUBLIC — Modal Management
    // =========================================================================

    /**
     * Open a modal by ID
     * @param {string} id - Modal backdrop element ID
     */
    window.openModal = function (id) {
        var modal = document.getElementById(id);
        if (!modal) {
            Logger.warn('UI', 'openModal: element not found → ' + id);
            return;
        }
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        Logger.debug('UI', 'Modal opened → ' + id);
    };

    /**
     * Close a modal by ID
     * @param {string} id - Modal backdrop element ID
     */
    window.closeModal = function (id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('show');
        document.body.style.overflow = '';
        Logger.debug('UI', 'Modal closed → ' + id);
    };

    /**
     * Initialize modal backdrop click-to-close
     */
    function _initModals() {
        document.querySelectorAll('.modal-backdrop')
            .forEach(function (modal) {
                modal.addEventListener('click', function (e) {
                    if (e.target === this) {
                        this.classList.remove('show');
                        document.body.style.overflow = '';
                    }
                });
            });
    }

    // =========================================================================
    // PUBLIC — Toast Notifications
    // =========================================================================

    /**
     * Show a toast notification
     * Auto-dismisses after CONSTANTS.UI.TOAST_DURATION ms
     *
     * @param {string} title   - Bold title text
     * @param {string} message - Subtitle message text
     * @param {string} [type]  - 'success' | 'error' | 'warning' (default: success)
     */
    window.showToast = function (title, message, type) {
        var toast    = document.getElementById(
            CONSTANTS.DOM.TOAST
        );
        var titleEl  = document.getElementById(
            CONSTANTS.DOM.TOAST_TITLE
        );
        var msgEl    = document.getElementById(
            CONSTANTS.DOM.TOAST_MSG
        );

        if (!toast || !titleEl || !msgEl) return;

        // ── Set content ──
        titleEl.textContent = title   || 'Notification';
        msgEl.textContent   = message || '';

        // ── Set icon color based on type ──
        var iconEl = toast.querySelector('.toast-icon');
        if (iconEl) {
            var bgColor = type === 'error'   ? 'var(--red)'
                        : type === 'warning' ? 'var(--amber)'
                        : 'var(--green)';
            iconEl.style.background = bgColor;

            var icon = type === 'error'   ? 'fa-xmark'
                     : type === 'warning' ? 'fa-triangle-exclamation'
                     : 'fa-check';
            iconEl.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
        }

        // ── Show ──
        toast.classList.add('show');

        // ── Auto-dismiss ──
        if (_toastTimeout) clearTimeout(_toastTimeout);
        _toastTimeout = setTimeout(function () {
            toast.classList.remove('show');
        }, CONSTANTS.UI.TOAST_DURATION);

        Logger.debug('UI', 'Toast shown → ' + title);
    };

    /**
     * Hide the toast immediately
     */
    window.hideToast = function () {
        var toast = document.getElementById(CONSTANTS.DOM.TOAST);
        if (toast) toast.classList.remove('show');
        if (_toastTimeout) clearTimeout(_toastTimeout);
    };

    // =========================================================================
    // PRIVATE — Progress Bar Animations
    // =========================================================================

    /**
     * Animate all progress bars on page load
     * Finds bars with style.width set and animates from 0
     */
    function _animateProgressBars() {
        setTimeout(function () {
            document.querySelectorAll(
                '.usage-fill, .pc-fill, .cb-fill, .tm-fill'
            ).forEach(function (bar) {
                var targetWidth = bar.style.width;
                if (!targetWidth || targetWidth === '0%') return;

                bar.style.width      = '0%';
                bar.style.transition = 'none';

                setTimeout(function () {
                    bar.style.transition = 'width 1s cubic-bezier(0.4,0,0.2,1)';
                    bar.style.width      = targetWidth;
                }, 100);
            });
        }, CONSTANTS.UI.PROGRESS_ANIM_DELAY);
    }

    // =========================================================================
    // PRIVATE — Stat Number Animations
    // =========================================================================

    /**
     * Animate numeric stat values counting up
     * Targets .stat-value elements with numeric content
     */
    function _animateStatNumbers() {
        setTimeout(function () {
            document.querySelectorAll('.stat-value').forEach(function (el) {
                var text  = el.textContent.trim();
                var match = text.match(/^(\d+)/);
                if (!match) return;

                var target  = parseInt(match[1], 10);
                var suffix  = text.replace(match[0], '');
                var current = 0;
                var step    = Math.max(1, Math.ceil(target / 30));

                var timer = setInterval(function () {
                    current += step;
                    if (current >= target) {
                        current = target;
                        clearInterval(timer);
                    }
                    el.textContent = current + suffix;
                }, 30);
            });
        }, 500);
    }

    // =========================================================================
    // PRIVATE — Requirement Detail Panel (Legacy bridge)
    // =========================================================================

    /**
     * Open requirement detail — delegates to RequirementsModule
     * Kept for backward compat with existing HTML onclick attributes
     * @param {string} reqId
     */
    window.openRequirementDetail = function (reqId) {
        if (typeof RequirementsModule !== 'undefined') {
            RequirementsModule.openDetail(reqId);
        }
    };

    /**
     * Close requirement detail — delegates to RequirementsModule
     */
    window.closeRequirementDetail = function () {
        if (typeof RequirementsModule !== 'undefined') {
            RequirementsModule.closeDetail();
        }
    };

    /**
     * Navigate to tasks from detail panel
     */
    window.navigateToTasks = function () {
        if (typeof RequirementsModule !== 'undefined') {
            RequirementsModule.navigateToTasks();
        }
    };

    // =========================================================================
    // INIT — Run on DOM ready
    // =========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        _initModals();
        _animateProgressBars();
        _animateStatNumbers();

        Logger.info('UI', '✅ UI utilities initialized');
    });

})();