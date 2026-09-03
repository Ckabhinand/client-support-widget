/* ==========================================================================
   LOGGER.JS — Centralized Logging Service
   
   Controls all console output across the application.
   Log level is controlled by CONSTANTS.ENV.LOG_LEVEL.
   
   LEVELS:
     0 = DEBUG  → All messages (development)
     1 = INFO   → Info, Warn, Error only
     2 = WARN   → Warn, Error only
     3 = ERROR  → Error only
     4 = NONE   → Silent (production)
   
   USAGE:
     Logger.debug('MODULE', 'message', optionalData);
     Logger.info('MODULE', 'message', optionalData);
     Logger.warn('MODULE', 'message', optionalData);
     Logger.error('MODULE', 'message', optionalData);
     Logger.group('MODULE', 'groupLabel', fn);
     Logger.time('MODULE', 'label');
     Logger.timeEnd('MODULE', 'label');
   ========================================================================== */

'use strict';

var Logger = (function () {

    // =========================================================================
    // PRIVATE — Internal state
    // =========================================================================

    // Current log level — read from CONSTANTS (fallback to DEBUG if not loaded)
    var _level = (typeof CONSTANTS !== 'undefined')
        ? CONSTANTS.ENV.LOG_LEVEL
        : 0;

    // Log level codes — fallback if CONSTANTS not loaded yet
    var _levels = (typeof CONSTANTS !== 'undefined')
        ? CONSTANTS.LOG_LEVELS
        : { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, NONE: 4 };

    // Color map for module badges (makes logs scannable in DevTools)
    var _moduleColors = {
        'APP'          : '#2563EB',    // Blue
        'CACHE'        : '#8B5CF6',    // Purple
        'SDK'          : '#06B6D4',    // Cyan
        'REPO'         : '#10B981',    // Green
        'STATE'        : '#F59E0B',    // Amber
        'DASHBOARD'    : '#3B82F6',    // Light blue
        'REQUIREMENTS' : '#6366F1',    // Indigo
        'TASKS'        : '#EC4899',    // Pink
        'CONTRACTS'    : '#14B8A6',    // Teal
        'PRICING'      : '#F97316',    // Orange
        'SETTINGS'     : '#64748B',    // Gray
        'NAV'          : '#7C3AED',    // Dark purple
        'UI'           : '#0EA5E9',    // Sky blue
        'DEFAULT'      : '#475569'     // Slate
    };

    // Log entry history (last 100 entries for debugging)
    var _history = [];
    var _maxHistory = 100;

    // =========================================================================
    // PRIVATE — Helper functions
    // =========================================================================

    /**
     * Get the color for a module badge
     * @param {string} module
     * @returns {string} hex color
     */
    function _getModuleColor(module) {
        var key = (module || '').toUpperCase();
        return _moduleColors[key] || _moduleColors['DEFAULT'];
    }

    /**
     * Get current timestamp string
     * @returns {string} HH:MM:SS.mmm
     */
    function _getTimestamp() {
        var now = new Date();
        var h   = String(now.getHours()).padStart(2, '0');
        var m   = String(now.getMinutes()).padStart(2, '0');
        var s   = String(now.getSeconds()).padStart(2, '0');
        var ms  = String(now.getMilliseconds()).padStart(3, '0');
        return h + ':' + m + ':' + s + '.' + ms;
    }

    /**
     * Store entry in history buffer
     * @param {string} level
     * @param {string} module
     * @param {string} message
     * @param {*} data
     */
    function _storeHistory(level, module, message, data) {
        _history.push({
            timestamp : _getTimestamp(),
            level     : level,
            module    : module,
            message   : message,
            data      : data || null
        });

        // Keep history under max limit (drop oldest)
        if (_history.length > _maxHistory) {
            _history.shift();
        }
    }

    /**
     * Core log function — builds styled console output
     * @param {string} level  - 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
     * @param {number} levelCode - numeric level code
     * @param {string} module - calling module name
     * @param {string} message - log message
     * @param {*} data - optional data to log
     */
    function _log(level, levelCode, module, message, data) {

        // ── Check if this level should be logged ──
        if (levelCode < _level) return;

        // ── Store in history regardless of console output ──
        _storeHistory(level, module, message, data);

        // ── Build console output ──
        var timestamp   = _getTimestamp();
        var moduleColor = _getModuleColor(module);
        var moduleTag   = '[' + (module || 'APP').toUpperCase() + ']';

        // Level-specific styling
        var levelStyles = {
            'DEBUG' : 'color: #94A3B8; font-weight: 500;',
            'INFO'  : 'color: #10B981; font-weight: 600;',
            'WARN'  : 'color: #F59E0B; font-weight: 700;',
            'ERROR' : 'color: #EF4444; font-weight: 700;'
        };

        var levelEmojis = {
            'DEBUG' : '🔍',
            'INFO'  : '✅',
            'WARN'  : '⚠️',
            'ERROR' : '❌'
        };

        var emoji      = levelEmojis[level] || '📋';
        var levelStyle = levelStyles[level] || levelStyles['DEBUG'];

        // Module badge style
        var badgeStyle = [
            'background:' + moduleColor,
            'color: white',
            'padding: 1px 6px',
            'border-radius: 3px',
            'font-size: 11px',
            'font-weight: 700',
            'font-family: monospace'
        ].join(';');

        // Timestamp style
        var tsStyle = 'color: #CBD5E1; font-size: 11px; font-family: monospace;';

        // Message style
        var msgStyle = levelStyle;

        // ── Build arguments array for console call ──
        var args = [
            '%c' + emoji + ' %c' + moduleTag + ' %c' + timestamp + '  %c' + message,
            'font-size: 13px;',
            badgeStyle,
            tsStyle,
            msgStyle
        ];

        // ── Choose correct console method ──
        var consoleFn;
        switch (level) {
            case 'DEBUG': consoleFn = console.debug || console.log; break;
            case 'INFO':  consoleFn = console.info  || console.log; break;
            case 'WARN':  consoleFn = console.warn  || console.log; break;
            case 'ERROR': consoleFn = console.error || console.log; break;
            default:      consoleFn = console.log;
        }

        // ── Output main log line ──
        consoleFn.apply(console, args);

        // ── Output data if provided ──
        if (data !== undefined && data !== null) {
            if (level === 'ERROR') {
                console.error('   📎 Data:', data);
            } else if (level === 'WARN') {
                console.warn('   📎 Data:', data);
            } else {
                console.log('   📎 Data:', data);
            }
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Log debug message — only visible at LOG_LEVEL 0 (DEBUG)
     * Use for: detailed tracing, variable dumps, step-by-step flow
     *
     * @param {string} module  - Module name (e.g., 'DASHBOARD', 'REPO')
     * @param {string} message - Log message
     * @param {*} [data]       - Optional data object to inspect
     */
    function debug(module, message, data) {
        _log('DEBUG', _levels.DEBUG, module, message, data);
    }

    /**
     * Log info message — visible at LOG_LEVEL 0-1
     * Use for: successful operations, module init, data loaded
     *
     * @param {string} module
     * @param {string} message
     * @param {*} [data]
     */
    function info(module, message, data) {
        _log('INFO', _levels.INFO, module, message, data);
    }

    /**
     * Log warning message — visible at LOG_LEVEL 0-2
     * Use for: empty results, fallbacks, non-critical issues
     *
     * @param {string} module
     * @param {string} message
     * @param {*} [data]
     */
    function warn(module, message, data) {
        _log('WARN', _levels.WARN, module, message, data);
    }

    /**
     * Log error message — always visible unless LOG_LEVEL 4 (NONE)
     * Use for: API failures, SDK errors, unexpected states
     *
     * @param {string} module
     * @param {string} message
     * @param {*} [data]
     */
    function error(module, message, data) {
        _log('ERROR', _levels.ERROR, module, message, data);
    }

    /**
     * Group related log messages together in DevTools
     * Automatically closes the group after fn() executes
     *
     * @param {string} module
     * @param {string} label  - Group header label
     * @param {Function} fn   - Function to execute inside group
     */
    function group(module, label, fn) {
        if (_level >= _levels.NONE) return;

        var moduleTag = '[' + (module || 'APP').toUpperCase() + ']';
        console.groupCollapsed('%c' + moduleTag + ' ' + label,
            'color:' + _getModuleColor(module) + '; font-weight: 700;');

        try {
            fn();
        } catch (e) {
            error(module, 'Error inside log group', e);
        } finally {
            console.groupEnd();
        }
    }

    /**
     * Start a timer for performance measurement
     * @param {string} module
     * @param {string} label - Timer label (must match timeEnd call)
     */
    function time(module, label) {
        if (_level >= _levels.NONE) return;
        var key = '[' + module + '] ' + label;
        console.time(key);
    }

    /**
     * End a timer and log elapsed time
     * @param {string} module
     * @param {string} label - Must match time() label
     */
    function timeEnd(module, label) {
        if (_level >= _levels.NONE) return;
        var key = '[' + module + '] ' + label;
        console.timeEnd(key);
    }

    /**
     * Log a separator line — useful for marking phase boundaries
     * @param {string} [label] - Optional label for the separator
     */
    function separator(label) {
        if (_level >= _levels.NONE) return;
        var line = '─'.repeat(50);
        if (label) {
            console.log('%c' + line + ' ' + label + ' ' + line,
                'color: #475569; font-size: 11px;');
        } else {
            console.log('%c' + line,
                'color: #CBD5E1; font-size: 11px;');
        }
    }

    /**
     * Set log level at runtime
     * @param {number} level - Use CONSTANTS.LOG_LEVELS values
     */
    function setLevel(level) {
        _level = level;
        info('LOGGER', 'Log level changed to ' + level);
    }

    /**
     * Get full log history (last 100 entries)
     * Useful for bug reports and post-mortem debugging
     * @returns {Array} Array of log entry objects
     */
    function getHistory() {
        return _history.slice();
    }

    /**
     * Clear log history
     */
    function clearHistory() {
        _history = [];
    }

    /**
     * Export log history as formatted string
     * Useful for copying logs to clipboard for bug reports
     * @returns {string}
     */
    function exportHistory() {
        return _history.map(function (entry) {
            var data = entry.data ? ' | ' + JSON.stringify(entry.data) : '';
            return [
                entry.timestamp,
                '[' + entry.level + ']',
                '[' + entry.module + ']',
                entry.message,
                data
            ].join(' ');
        }).join('\n');
    }

    // =========================================================================
    // EXPOSE PUBLIC API
    // =========================================================================
    return {
        debug       : debug,
        info        : info,
        warn        : warn,
        error       : error,
        group       : group,
        time        : time,
        timeEnd     : timeEnd,
        separator   : separator,
        setLevel    : setLevel,
        getHistory  : getHistory,
        clearHistory: clearHistory,
        exportHistory: exportHistory
    };

})();