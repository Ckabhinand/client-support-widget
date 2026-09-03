/* ==========================================================================
   ERROR-HANDLER.JS — Centralized Error Handling
   
   Provides:
   - ErrorHandler.handle(err, context)  → normalize + display + log
   - ErrorHandler.wrap(fn, context)     → async try/catch wrapper
   - RetryManager.retry(fn, opts)       → automatic retry with backoff
   - LoadingManager                     → coordinated loading states
   - Global window.onerror              → catch uncaught JS errors
   - Global unhandledrejection          → catch uncaught Promise errors
   - state:error subscriber             → catch AppState action errors
   ========================================================================== */

'use strict';

// =========================================================================
// ERROR HANDLER
// =========================================================================

var ErrorHandler = (function () {

    // =========================================================================
    // PRIVATE — Error Classification
    // =========================================================================

    /**
     * Error type constants
     */
    var ERROR_TYPES = {
        NETWORK      : 'NETWORK',       // API call failed
        NO_DATA      : 'NO_DATA',       // No records found (9280)
        AUTH         : 'AUTH',          // Authentication/permission
        VALIDATION   : 'VALIDATION',    // Form validation failed
        SDK_INIT     : 'SDK_INIT',      // SDK initialization failed
        UNKNOWN      : 'UNKNOWN'        // Unclassified error
    };

    /**
     * User-friendly messages per error type
     */
    var ERROR_MESSAGES = {
        NETWORK    : 'Connection issue. Please check your network.',
        NO_DATA    : 'No data found.',
        AUTH       : 'Access denied. Please refresh and try again.',
        VALIDATION : 'Please check your input and try again.',
        SDK_INIT   : 'Could not connect to Zoho Creator. '
                     + 'Please refresh the page.',
        UNKNOWN    : 'Something went wrong. Please try again.'
    };

    /**
     * Classify an error into an ERROR_TYPE
     * @param {*} err - Any error object
     * @returns {string} ERROR_TYPE value
     */
    function _classify(err) {
        if (!err) return ERROR_TYPES.UNKNOWN;

        // ── SDK error with code ──
        var code = 0;
        if (err.code) {
            code = err.code;
        } else if (err.responseText) {
            try {
                var parsed = JSON.parse(err.responseText);
                code = parsed.code || 0;
            } catch (e) { /* ignore */ }
        }

        // No records (9280) → treat as no data, not error
        if (code === CONSTANTS.ERROR_CODES.NO_RECORDS) {
            return ERROR_TYPES.NO_DATA;
        }

        // Criteria required (3090) → validation
        if (code === CONSTANTS.ERROR_CODES.CRITERIA_REQD) {
            return ERROR_TYPES.VALIDATION;
        }

        // Network / HTTP errors
        if (err.status === 401 || err.status === 403) {
            return ERROR_TYPES.AUTH;
        }

        if (err.status >= 400 && err.status < 600) {
            return ERROR_TYPES.NETWORK;
        }

        // Message-based classification
        var msg = (err.message || '').toLowerCase();
        if (msg.indexOf('network') !== -1
            || msg.indexOf('failed to fetch') !== -1
            || msg.indexOf('connection') !== -1) {
            return ERROR_TYPES.NETWORK;
        }

        if (msg.indexOf('unauthorized') !== -1
            || msg.indexOf('forbidden') !== -1) {
            return ERROR_TYPES.AUTH;
        }

        if (msg.indexOf('init') !== -1
            || msg.indexOf('sdk') !== -1) {
            return ERROR_TYPES.SDK_INIT;
        }

        return ERROR_TYPES.UNKNOWN;
    }

    /**
     * Get user-friendly message for an error
     * @param {*} err
     * @param {string} [context] - Where the error occurred
     * @returns {string}
     */
    function _getUserMessage(err, context) {
        var type = _classify(err);

        // Use specific message from error if available and safe
        if (err && err.message
            && typeof err.message === 'string'
            && err.message.length < 120
            && err.message.indexOf('Error') === -1) {
            // Return specific message for validation errors
            if (type === ERROR_TYPES.VALIDATION) {
                return err.message;
            }
        }

        return ERROR_MESSAGES[type] || ERROR_MESSAGES.UNKNOWN;
    }

    /**
     * Get toast title for an error type
     * @param {string} type
     * @returns {string}
     */
    function _getTitle(type) {
        var titles = {
            NETWORK    : 'Connection Error',
            NO_DATA    : 'No Data',
            AUTH       : 'Access Denied',
            VALIDATION : 'Validation Error',
            SDK_INIT   : 'Initialization Error',
            UNKNOWN    : 'Error'
        };
        return titles[type] || 'Error';
    }

    // =========================================================================
    // PUBLIC — Core Handler
    // =========================================================================

    /**
     * Handle any error — classify, log, display to user
     *
     * @param {*} err          - Error object (any shape)
     * @param {string} context - Where this error originated
     *                           e.g. 'DASHBOARD', 'submitRequirement'
     * @param {Object} [opts]  - Options
     * @param {boolean} [opts.silent]  - If true, don't show toast
     * @param {boolean} [opts.noLog]   - If true, skip Logger
     * @param {string}  [opts.message] - Override user message
     *
     * @returns {Object} Normalized error with type, message, original
     */
    function handle(err, context, opts) {
        opts = opts || {};

        var type       = _classify(err);
        var userMsg    = opts.message || _getUserMessage(err, context);
        var title      = _getTitle(type);
        var logContext = context || 'UNKNOWN';

        // ── Log the error ──
        if (!opts.noLog) {
            Logger.error(logContext, userMsg, {
                type     : type,
                original : err,
                context  : context
            });
        }

        // ── Show toast (unless silent or NO_DATA) ──
        if (!opts.silent && type !== ERROR_TYPES.NO_DATA) {
            if (typeof showToast === 'function') {
                showToast(title, userMsg, 'error');
            }
        }

        // ── Return normalized error ──
        return {
            type     : type,
            message  : userMsg,
            title    : title,
            original : err,
            context  : context
        };
    }

    /**
     * Wrap an async function with automatic error handling
     * Returns [result, error] tuple — no throws escape
     *
     * @param {Function} fn       - Async function to execute
     * @param {string}   context  - Context label for logging
     * @param {Object}   [opts]   - Same opts as handle()
     * @returns {Promise<[*, Object|null]>} [result, error]
     *
     * @example
     * var [contracts, err] = await ErrorHandler.wrap(
     *     function() { return ContractRepo.getForUser(email); },
     *     'DASHBOARD'
     * );
     * if (err) { return; }
     * renderContracts(contracts);
     */
    async function wrap(fn, context, opts) {
        try {
            var result = await fn();
            return [result, null];
        } catch (err) {
            var normalized = handle(err, context, opts);
            return [null, normalized];
        }
    }

    /**
     * Handle a state:error event from AppState
     * @param {Object} eventData - { action, error }
     */
    function handleStateError(eventData) {
        var action  = (eventData && eventData.action)  || 'STATE';
        var err     = (eventData && eventData.error)   || {};

        handle(err, 'STATE:' + action, {
            silent: false
        });
    }

    // =========================================================================
    // EXPOSE PUBLIC API
    // =========================================================================
    return {
        handle          : handle,
        wrap            : wrap,
        handleStateError: handleStateError,
        TYPES           : ERROR_TYPES
    };

})();

// =========================================================================
// RETRY MANAGER
// =========================================================================

var RetryManager = (function () {

    /**
     * Retry an async function with exponential backoff
     *
     * @param {Function} fn       - Async function to retry
     * @param {Object}   [opts]   - Options
     * @param {number}   [opts.maxAttempts]  - Max retry attempts (default: 3)
     * @param {number}   [opts.baseDelay]    - Initial delay in ms (default: 1000)
     * @param {number}   [opts.maxDelay]     - Max delay in ms (default: 8000)
     * @param {string}   [opts.context]      - Label for logging
     * @param {Function} [opts.shouldRetry]  - Return false to stop retrying
     * @returns {Promise<*>} Result of successful fn call
     * @throws Last error if all attempts fail
     *
     * @example
     * var data = await RetryManager.retry(
     *     function() { return SdkService.getRecords({...}); },
     *     { maxAttempts: 3, context: 'CONTRACTS' }
     * );
     */
    async function retry(fn, opts) {
        opts = opts || {};

        var maxAttempts = opts.maxAttempts || 3;
        var baseDelay   = opts.baseDelay   || 1000;
        var maxDelay    = opts.maxDelay    || 8000;
        var context     = opts.context     || 'RETRY';
        var shouldRetry = opts.shouldRetry || _defaultShouldRetry;

        var lastError;

        for (var attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                Logger.debug(context,
                    'Attempt ' + attempt + '/' + maxAttempts);

                var result = await fn();
                if (attempt > 1) {
                    Logger.info(context,
                        '✅ Succeeded on attempt ' + attempt);
                }
                return result;

            } catch (err) {
                lastError = err;

                Logger.warn(context,
                    'Attempt ' + attempt + ' failed', {
                        error   : err,
                        attempt : attempt,
                        max     : maxAttempts
                    });

                // ── Check if we should retry ──
                if (!shouldRetry(err, attempt, maxAttempts)) {
                    Logger.debug(context,
                        'shouldRetry returned false — stopping');
                    break;
                }

                // ── Don't delay after last attempt ──
                if (attempt < maxAttempts) {
                    var delay = Math.min(
                        baseDelay * Math.pow(2, attempt - 1),
                        maxDelay
                    );
                    Logger.debug(context,
                        'Waiting ' + delay + 'ms before retry...');
                    await _sleep(delay);
                }
            }
        }

        Logger.error(context,
            'All ' + maxAttempts + ' attempts failed', lastError);
        throw lastError;
    }

    /**
     * Default shouldRetry logic
     * Don't retry on: no-records (9280), validation errors
     * @param {*} err
     * @param {number} attempt
     * @param {number} maxAttempts
     * @returns {boolean}
     */
    function _defaultShouldRetry(err, attempt, maxAttempts) {
        if (attempt >= maxAttempts) return false;

        // Don't retry no-records
        var code = 0;
        if (err && err.code) code = err.code;
        else if (err && err.responseText) {
            try {
                code = JSON.parse(err.responseText).code || 0;
            } catch (e) { /* ignore */ }
        }

        if (code === CONSTANTS.ERROR_CODES.NO_RECORDS) return false;
        if (code === CONSTANTS.ERROR_CODES.CRITERIA_REQD) return false;

        return true;
    }

    /**
     * Sleep for ms milliseconds
     * @param {number} ms
     * @returns {Promise<void>}
     */
    function _sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    return {
        retry: retry
    };

})();

// =========================================================================
// LOADING MANAGER
// =========================================================================

var LoadingManager = (function () {

    // Track which sections are currently loading
    var _loadingKeys = {};

    /**
     * Show a loading skeleton for a container
     *
     * @param {string} containerId - DOM element ID
     * @param {string} type        - Skeleton type: 'card'|'table'|'list'
     * @param {number} [count]     - Number of skeleton items (default: 3)
     */
    function show(containerId, type, count) {
        var container = document.getElementById(containerId);
        if (!container) return;

        count = count || 3;
        _loadingKeys[containerId] = true;

        var skeletonHTML = _buildSkeleton(type, count);
        container.innerHTML = skeletonHTML;

        Logger.debug('LOADING', 'Skeleton shown → ' + containerId
            + ' type: ' + type);
    }

    /**
     * Hide loading state — clear skeleton from container
     * @param {string} containerId
     */
    function hide(containerId) {
        delete _loadingKeys[containerId];
        Logger.debug('LOADING', 'Skeleton hidden → ' + containerId);
    }

    /**
     * Check if a container is currently loading
     * @param {string} containerId
     * @returns {boolean}
     */
    function isLoading(containerId) {
        return Boolean(_loadingKeys[containerId]);
    }

    /**
     * Show a full-page loading overlay
     * @param {string} [message] - Loading message
     */
    function showOverlay(message) {
        var overlay = document.getElementById(
            CONSTANTS.DOM.LOADING_OVERLAY
        );

        if (!overlay) {
            // Create overlay if it doesn't exist
            overlay = document.createElement('div');
            overlay.id        = CONSTANTS.DOM.LOADING_OVERLAY;
            overlay.className = 'loading-overlay';
            overlay.innerHTML = [
                '<div class="loading-spinner">',
                '  <div class="spinner-ring"></div>',
                '  <p id="loadingMessage">'
                     + (message || 'Loading...') + '</p>',
                '</div>'
            ].join('');
            document.body.appendChild(overlay);
        } else {
            var msgEl = document.getElementById('loadingMessage');
            if (msgEl) msgEl.textContent = message || 'Loading...';
            overlay.style.display = 'flex';
        }

        Logger.debug('LOADING', 'Overlay shown → ' + message);
    }

    /**
     * Hide full-page loading overlay
     */
    function hideOverlay() {
        var overlay = document.getElementById(
            CONSTANTS.DOM.LOADING_OVERLAY
        );
        if (overlay) overlay.style.display = 'none';
        Logger.debug('LOADING', 'Overlay hidden');
    }

    /**
     * Build skeleton HTML for a given type
     * @param {string} type  - 'card'|'table'|'list'|'stat'
     * @param {number} count
     * @returns {string} HTML string
     */
    function _buildSkeleton(type, count) {
        var items = [];

        for (var i = 0; i < count; i++) {
            switch (type) {

                case 'card':
                    items.push([
                        '<div class="card" style="animation:shimmer 1.5s',
                        ' infinite;background:linear-gradient(90deg,',
                        ' var(--bg-2) 25%,var(--surface) 50%,',
                        ' var(--bg-2) 75%);background-size:1000px 100%">',
                        '  <div style="height:14px;background:var(--bg-2);',
                        '    border-radius:4px;margin-bottom:12px;',
                        '    width:60%"></div>',
                        '  <div style="height:10px;background:var(--bg-2);',
                        '    border-radius:4px;margin-bottom:8px;',
                        '    width:80%"></div>',
                        '  <div style="height:10px;background:var(--bg-2);',
                        '    border-radius:4px;width:40%"></div>',
                        '</div>'
                    ].join(''));
                    break;

                case 'table':
                    items.push([
                        '<tr>',
                        '  <td colspan="7" style="padding:14px 20px">',
                        '    <div style="height:12px;background:var(--bg-2);',
                        '      border-radius:4px;width:'
                             + (60 + Math.random() * 30).toFixed(0)
                             + '%"></div>',
                        '  </td>',
                        '</tr>'
                    ].join(''));
                    break;

                case 'list':
                    items.push([
                        '<div class="list-row" style="opacity:0.5">',
                        '  <div class="row-icon" ',
                        '    style="background:var(--bg-2)"></div>',
                        '  <div class="row-content">',
                        '    <div style="height:12px;background:var(--bg-2);',
                        '      border-radius:4px;width:70%;',
                        '      margin-bottom:6px"></div>',
                        '    <div style="height:10px;background:var(--bg-2);',
                        '      border-radius:4px;width:50%"></div>',
                        '  </div>',
                        '</div>'
                    ].join(''));
                    break;

                case 'stat':
                    items.push([
                        '<div class="stat-card" style="opacity:0.6">',
                        '  <div class="stat-icon" ',
                        '    style="background:var(--bg-2)"></div>',
                        '  <div class="stat-content">',
                        '    <div style="height:10px;background:var(--bg-2);',
                        '      border-radius:4px;width:60%;',
                        '      margin-bottom:10px"></div>',
                        '    <div style="height:24px;background:var(--bg-2);',
                        '      border-radius:4px;width:40%;',
                        '      margin-bottom:8px"></div>',
                        '    <div style="height:10px;background:var(--bg-2);',
                        '      border-radius:4px;width:70%"></div>',
                        '  </div>',
                        '</div>'
                    ].join(''));
                    break;

                default:
                    items.push(
                        '<div style="height:48px;background:var(--bg-2);',
                        'border-radius:var(--r);margin-bottom:8px;',
                        'opacity:0.5"></div>'
                    );
            }
        }

        return items.join('');
    }

    return {
        show        : show,
        hide        : hide,
        isLoading   : isLoading,
        showOverlay : showOverlay,
        hideOverlay : hideOverlay
    };

})();

// =========================================================================
// GLOBAL ERROR BOUNDARIES
// =========================================================================

(function _initGlobalErrorBoundaries() {

    // ── Catch uncaught synchronous JS errors ──
    window.onerror = function (message, source, lineno, colno, error) {
        Logger.error('GLOBAL', 'Uncaught error: ' + message, {
            source : source,
            line   : lineno,
            col    : colno,
            error  : error
        });

        // Don't show toast for minor script errors
        // Only show for critical failures
        if (message && (
            message.indexOf('Cannot read') !== -1
            || message.indexOf('is not a function') !== -1
            || message.indexOf('is not defined') !== -1
        )) {
            if (typeof showToast === 'function') {
                showToast('Application Error',
                    'An unexpected error occurred. '
                    + 'Please refresh the page.',
                    'error');
            }
        }

        // Return false to allow default browser error handling
        return false;
    };

    // ── Catch unhandled Promise rejections ──
    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason;

        // Ignore 9280 (no records) — these are expected
        var code = 0;
        if (reason && reason.code) {
            code = reason.code;
        } else if (reason && reason.responseText) {
            try {
                code = JSON.parse(reason.responseText).code || 0;
            } catch (e) { /* ignore */ }
        }

        if (code === CONSTANTS.ERROR_CODES.NO_RECORDS) {
            // Expected — already handled in SdkService
            event.preventDefault();
            return;
        }

        Logger.error('GLOBAL', 'Unhandled Promise rejection', reason);

        // Don't spam toast for every unhandled rejection
        // Just log it
        event.preventDefault();
    });

    // ── Subscribe to AppState error events ──
    // Note: AppState may not be defined yet at this point
    // Use DOMContentLoaded to ensure it is
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof AppState !== 'undefined') {
            AppState.on('state:error', function (eventData) {
                ErrorHandler.handleStateError(eventData);
            });

            Logger.debug('ERROR_HANDLER',
                'state:error subscriber registered');
        }
    });

    Logger.info('ERROR_HANDLER',
        '✅ Global error boundaries initialized');

})();