/* ==========================================================================
   OPTIMIZER.JS — Performance Optimization Layer
   
   Provides:
   - PerformanceMonitor  → Timing, metrics, FPS tracking
   - DOMOptimizer        → Efficient DOM updates, virtual diffing
   - RenderScheduler     → Batched, debounced render queue
   - DataPrefetcher      → Pre-load page data on hover/focus
   - MemoryManager       → Prevent memory leaks, cleanup
   - ImageOptimizer      → Lazy load file attachments
   ========================================================================== */

'use strict';

// =========================================================================
// PERFORMANCE MONITOR
// =========================================================================

var PerformanceMonitor = (function () {

    // Metrics store: { label: { start, end, duration, count } }
    var _metrics = {};
    var _marks   = {};

    // FPS tracking
    var _fpsData        = [];
    var _lastFrameTime  = 0;
    var _fpsMonitoring  = false;

    /**
     * Start timing a labelled operation
     * @param {string} label - Unique operation label
     */
    function start(label) {
        _marks[label] = performance.now ? performance.now() : Date.now();
    }

    /**
     * End timing and store metric
     * @param {string} label  - Must match start() label
     * @param {string} [module] - Module context for logging
     * @returns {number} Duration in ms
     */
    function end(label, module) {
        var startTime = _marks[label];
        if (!startTime) {
            Logger.warn('PERF', 'end() called without start() for: '
                + label);
            return 0;
        }

        var now      = performance.now ? performance.now() : Date.now();
        var duration = now - startTime;

        // Store metric
        if (!_metrics[label]) {
            _metrics[label] = {
                count   : 0,
                total   : 0,
                min     : Infinity,
                max     : 0,
                last    : 0
            };
        }

        var m    = _metrics[label];
        m.count++;
        m.total += duration;
        m.min    = Math.min(m.min, duration);
        m.max    = Math.max(m.max, duration);
        m.last   = duration;

        delete _marks[label];

        // Log slow operations
        var threshold = 500;    // ms — log anything over 500ms
        if (duration > threshold) {
            Logger.warn(module || 'PERF',
                '⚠️ SLOW: ' + label + ' took '
                + duration.toFixed(1) + 'ms');
        } else {
            Logger.debug(module || 'PERF',
                label + ' → ' + duration.toFixed(1) + 'ms');
        }

        return duration;
    }

    /**
     * Measure an async function's execution time
     * @param {string}   label  - Operation label
     * @param {Function} fn     - Async function to measure
     * @param {string}   [mod]  - Module context
     * @returns {Promise<*>} Function result
     */
    async function measure(label, fn, mod) {
        start(label);
        try {
            var result = await fn();
            end(label, mod);
            return result;
        } catch (err) {
            end(label, mod);
            throw err;
        }
    }

    /**
     * Get all collected metrics
     * @returns {Object} Metrics summary
     */
    function getMetrics() {
        var summary = {};

        Object.keys(_metrics).forEach(function (label) {
            var m = _metrics[label];
            summary[label] = {
                count   : m.count,
                avg     : m.count > 0
                    ? (m.total / m.count).toFixed(1) + 'ms' : '—',
                min     : m.min === Infinity ? '—' : m.min.toFixed(1) + 'ms',
                max     : m.max.toFixed(1) + 'ms',
                last    : m.last.toFixed(1) + 'ms',
                total   : m.total.toFixed(1) + 'ms'
            };
        });

        return summary;
    }

    /**
     * Log a full metrics report to console
     */
    function report() {
        var metrics = getMetrics();
        Logger.separator('PERFORMANCE REPORT');
        Logger.info('PERF', 'Metrics collected: '
            + Object.keys(metrics).length + ' operations');
        console.table(metrics);
        Logger.separator();
    }

    /**
     * Start FPS monitoring (development only)
     */
    function startFPSMonitor() {
        if (_fpsMonitoring) return;
        _fpsMonitoring = true;
        _lastFrameTime = performance.now ? performance.now() : Date.now();

        function _frame(now) {
            if (!_fpsMonitoring) return;

            var delta = now - _lastFrameTime;
            _lastFrameTime = now;

            var fps = delta > 0 ? Math.round(1000 / delta) : 60;
            _fpsData.push(fps);

            // Keep last 60 frames
            if (_fpsData.length > 60) _fpsData.shift();

            requestAnimationFrame(_frame);
        }

        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(_frame);
            Logger.debug('PERF', 'FPS monitoring started');
        }
    }

    /**
     * Stop FPS monitoring and return average
     * @returns {number} Average FPS
     */
    function stopFPSMonitor() {
        _fpsMonitoring = false;
        if (_fpsData.length === 0) return 60;

        var avg = _fpsData.reduce(function (s, v) {
            return s + v;
        }, 0) / _fpsData.length;

        Logger.info('PERF', 'Average FPS: ' + avg.toFixed(1));
        return avg;
    }

    /**
     * Clear all metrics
     */
    function clear() {
        _metrics = {};
        _marks   = {};
        _fpsData = [];
        Logger.debug('PERF', 'Metrics cleared');
    }

    return {
        start          : start,
        end            : end,
        measure        : measure,
        getMetrics     : getMetrics,
        report         : report,
        startFPSMonitor: startFPSMonitor,
        stopFPSMonitor : stopFPSMonitor,
        clear          : clear
    };

})();

// =========================================================================
// DOM OPTIMIZER
// =========================================================================

var DOMOptimizer = (function () {

    /**
     * Update element text content only if it changed
     * Avoids unnecessary DOM reflows
     *
     * @param {string|Element} target - ID or DOM element
     * @param {string} text           - New text content
     * @returns {boolean} true if updated
     */
    function setText(target, text) {
        var el = typeof target === 'string'
            ? document.getElementById(target) : target;
        if (!el) return false;

        var newText = String(text || '');
        if (el.textContent === newText) return false;

        el.textContent = newText;
        return true;
    }

    /**
     * Update element innerHTML only if it changed
     * Uses a hash comparison to avoid unnecessary re-renders
     *
     * @param {string|Element} target - ID or DOM element
     * @param {string} html           - New HTML content
     * @returns {boolean} true if updated
     */
    function setHTML(target, html) {
        var el = typeof target === 'string'
            ? document.getElementById(target) : target;
        if (!el) return false;

        var newHTML = String(html || '');

        // ── Simple hash for change detection ──
        if (_hashString(el.innerHTML) === _hashString(newHTML)) {
            return false;    // No change — skip DOM update
        }

        el.innerHTML = newHTML;
        return true;
    }

    /**
     * Toggle a CSS class only if the state changed
     *
     * @param {string|Element} target - ID or element
     * @param {string}  cls    - Class name
     * @param {boolean} force  - true = add, false = remove
     * @returns {boolean} true if changed
     */
    function toggleClass(target, cls, force) {
        var el = typeof target === 'string'
            ? document.getElementById(target) : target;
        if (!el) return false;

        var had = el.classList.contains(cls);
        if (had === force) return false;    // No change

        el.classList.toggle(cls, force);
        return true;
    }

    /**
     * Batch multiple DOM updates in a single animation frame
     * Prevents layout thrashing from multiple reads + writes
     *
     * @param {Function[]} updates - Array of DOM update functions
     * @returns {Promise<void>}
     */
    function batchUpdate(updates) {
        return new Promise(function (resolve) {
            if (typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(function () {
                    updates.forEach(function (fn) {
                        try { fn(); }
                        catch (e) {
                            Logger.error('DOM', 'batchUpdate error', e);
                        }
                    });
                    resolve();
                });
            } else {
                updates.forEach(function (fn) {
                    try { fn(); } catch (e) { /* ignore */ }
                });
                resolve();
            }
        });
    }

    /**
     * Animate a numeric value from current to target
     * More precise than the ui.js version — uses requestAnimationFrame
     *
     * @param {string|Element} target - Element ID or DOM element
     * @param {number} from           - Start value
     * @param {number} to             - End value
     * @param {number} [duration]     - Animation duration ms (default: 800)
     * @param {string} [suffix]       - Text suffix (e.g., ' hrs', '%')
     * @param {Function} [easing]     - Easing function (default: easeOutCubic)
     */
    function animateValue(target, from, to, duration, suffix, easing) {
        var el = typeof target === 'string'
            ? document.getElementById(target) : target;
        if (!el) return;

        duration  = duration  || 800;
        suffix    = suffix    || '';
        easing    = easing    || _easeOutCubic;

        var startTime = null;
        var range     = to - from;

        function _step(timestamp) {
            if (!startTime) startTime = timestamp;
            var elapsed  = timestamp - startTime;
            var progress = Math.min(elapsed / duration, 1);
            var value    = Math.round(from + range * easing(progress));

            el.textContent = value + suffix;

            if (progress < 1) {
                requestAnimationFrame(_step);
            } else {
                el.textContent = to + suffix;
            }
        }

        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(_step);
        } else {
            el.textContent = to + suffix;
        }
    }

    /**
     * Animate progress bar width
     * @param {string|Element} target - Element with style.width
     * @param {number} toPercent      - Target % (0-100)
     * @param {number} [duration]     - ms (default: 1000)
     */
    function animateProgress(target, toPercent, duration) {
        var el = typeof target === 'string'
            ? document.getElementById(target) : target;
        if (!el) return;

        duration = duration || 1000;

        // Reset to 0 first
        el.style.transition = 'none';
        el.style.width      = '0%';

        // Force reflow
        void el.offsetWidth;

        // Animate to target
        el.style.transition = 'width ' + (duration / 1000) + 's '
            + 'cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.width = Math.min(100, Math.max(0, toPercent)) + '%';
    }

    /**
     * Lazy render a list using IntersectionObserver
     * Items are rendered only when they scroll into view
     *
     * @param {string}   containerId - Container element ID
     * @param {Array}    items       - Data items to render
     * @param {Function} renderFn    - function(item) → HTML string
     * @param {number}   [batchSize] - Items per batch (default: 10)
     */
    function lazyRenderList(containerId, items, renderFn, batchSize) {
        var container = document.getElementById(containerId);
        if (!container) return;

        batchSize = batchSize || 10;

        // Render first batch immediately
        var firstBatch = items.slice(0, batchSize);
        container.innerHTML = firstBatch.map(renderFn).join('');

        // If all items rendered, done
        if (items.length <= batchSize) return;

        // Render remaining items in chunks using requestIdleCallback
        var remaining   = items.slice(batchSize);
        var chunkIndex  = 0;
        var chunkSize   = batchSize;

        function _renderNextChunk() {
            var chunk = remaining.slice(
                chunkIndex * chunkSize,
                (chunkIndex + 1) * chunkSize
            );

            if (chunk.length === 0) return;

            var html = chunk.map(renderFn).join('');
            container.insertAdjacentHTML('beforeend', html);
            chunkIndex++;

            if (chunkIndex * chunkSize < remaining.length) {
                // Schedule next chunk
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(_renderNextChunk, {
                        timeout: 100
                    });
                } else {
                    setTimeout(_renderNextChunk, 16);
                }
            }
        }

        // Start rendering remaining chunks
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(_renderNextChunk, { timeout: 100 });
        } else {
            setTimeout(_renderNextChunk, 100);
        }
    }

    /**
     * Simple string hash for change detection
     * @param {string} str
     * @returns {number}
     */
    function _hashString(str) {
        var hash = 0;
        if (!str || str.length === 0) return hash;
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;    // Convert to 32-bit int
        }
        return hash;
    }

    /**
     * Easing: ease out cubic
     * @param {number} t - Progress 0-1
     * @returns {number}
     */
    function _easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /**
     * Easing: ease in out quad
     * @param {number} t
     * @returns {number}
     */
    function _easeInOutQuad(t) {
        return t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    return {
        setText       : setText,
        setHTML       : setHTML,
        toggleClass   : toggleClass,
        batchUpdate   : batchUpdate,
        animateValue  : animateValue,
        animateProgress: animateProgress,
        lazyRenderList: lazyRenderList
    };

})();

// =========================================================================
// RENDER SCHEDULER
// =========================================================================

var RenderScheduler = (function () {

    // Pending render queue: { key: fn }
    // If same key is queued multiple times, last one wins
    var _queue        = {};
    var _scheduled    = false;
    var _frameId      = null;

    /**
     * Schedule a render function to execute on next animation frame
     * If same key is scheduled again before execution, it replaces the old one
     *
     * @param {string}   key  - Unique render identifier
     * @param {Function} fn   - Render function to execute
     *
     * @example
     * // Instead of calling renderTable() directly:
     * RenderScheduler.schedule('tasks-table', function() {
     *     _renderTaskTable();
     * });
     */
    function schedule(key, fn) {
        _queue[key] = fn;

        if (!_scheduled) {
            _scheduled = true;

            if (typeof requestAnimationFrame !== 'undefined') {
                _frameId = requestAnimationFrame(_flush);
            } else {
                _frameId = setTimeout(_flush, 16);
            }
        }

        Logger.debug('SCHEDULER', 'Scheduled → ' + key
            + ' (queue: ' + Object.keys(_queue).length + ')');
    }

    /**
     * Execute all pending renders
     */
    function _flush() {
        var pending  = Object.assign({}, _queue);
        var keys     = Object.keys(pending);

        _queue     = {};
        _scheduled = false;
        _frameId   = null;

        Logger.debug('SCHEDULER', 'Flushing ' + keys.length
            + ' renders: [' + keys.join(', ') + ']');

        keys.forEach(function (key) {
            PerformanceMonitor.start('render:' + key);
            try {
                pending[key]();
            } catch (err) {
                Logger.error('SCHEDULER',
                    'Render failed for: ' + key, err);
            }
            PerformanceMonitor.end('render:' + key, 'SCHEDULER');
        });
    }

    /**
     * Cancel a scheduled render
     * @param {string} key
     */
    function cancel(key) {
        delete _queue[key];
        Logger.debug('SCHEDULER', 'Cancelled → ' + key);
    }

    /**
     * Execute all pending renders immediately (flush synchronously)
     * Use when you need renders to complete before next operation
     */
    function flushSync() {
        if (_frameId) {
            if (typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(_frameId);
            } else {
                clearTimeout(_frameId);
            }
        }
        _flush();
    }

    /**
     * Get count of pending renders
     * @returns {number}
     */
    function getPendingCount() {
        return Object.keys(_queue).length;
    }

    return {
        schedule        : schedule,
        cancel          : cancel,
        flushSync       : flushSync,
        getPendingCount : getPendingCount
    };

})();

// =========================================================================
// DATA PREFETCHER
// =========================================================================

var DataPrefetcher = (function () {

    // Track which pages have been prefetched
    var _prefetched = {};

    /**
     * Prefetch data for a page before the user navigates to it
     * Triggered on nav-item hover/focus
     *
     * @param {string} pageId - CONSTANTS.PAGES value
     */
    async function prefetch(pageId) {
        if (_prefetched[pageId]) return;

        var user = AppState.get('user');
        if (!user.email) return;

        _prefetched[pageId] = true;
        Logger.debug('PREFETCH', 'Prefetching data for → ' + pageId);

        var P = CONSTANTS.PAGES;

        try {
            switch (pageId) {

                case P.REQUIREMENTS:
                    // Pre-warm requirements cache
                    if (!CacheService.has(
                        CONSTANTS.CACHE_KEYS.USER_REQUIREMENTS
                        + '_' + user.email)) {
                        await RequirementRepo.getForUser(user.email);
                        Logger.debug('PREFETCH',
                            'Requirements prefetched');
                    }
                    break;

                case P.TASKS:
                    // Pre-warm tasks cache
                    if (!CacheService.has(
                        CONSTANTS.CACHE_KEYS.USER_TASKS
                        + '_' + user.email)) {
                        await TaskRepo.getForUser(user.email);
                        Logger.debug('PREFETCH', 'Tasks prefetched');
                    }
                    break;

                case P.CONTRACTS:
                    // Contracts already loaded in bootstrap
                    // No additional prefetch needed
                    break;

                case P.PURCHASE:
                    // Pre-warm pricing cache
                    if (!CacheService.has(
                        CONSTANTS.CACHE_KEYS.PRICING_PLANS)) {
                        await PricingRepo.getAll();
                        Logger.debug('PREFETCH', 'Pricing prefetched');
                    }
                    // Pre-warm promotions cache
                    if (!CacheService.has(
                        CONSTANTS.CACHE_KEYS.PROMOTIONS)) {
                        await PromotionRepo.getActive();
                        Logger.debug('PREFETCH',
                            'Promotions prefetched');
                    }
                    break;

                default:
                    break;
            }
        } catch (err) {
            // Prefetch failures are silent — not critical
            Logger.debug('PREFETCH', 'Prefetch failed for '
                + pageId + ' (non-critical)', err);
            delete _prefetched[pageId];    // Allow retry
        }
    }

    /**
     * Initialize prefetch triggers on nav items
     * Attaches hover/focus listeners to all nav-item elements
     */
    function initPrefetchTriggers() {
        document.querySelectorAll('.nav-item[data-page]')
            .forEach(function (item) {
                var pageId = item.getAttribute('data-page');
                if (!pageId) return;

                // Hover trigger
                item.addEventListener('mouseenter', function () {
                    prefetch(pageId);
                });

                // Focus trigger (keyboard navigation)
                item.addEventListener('focus', function () {
                    prefetch(pageId);
                });
            });

        Logger.debug('PREFETCH', 'Prefetch triggers initialized on '
            + document.querySelectorAll('.nav-item[data-page]').length
            + ' nav items');
    }

    /**
     * Reset prefetch state (e.g., after cache clear)
     */
    function reset() {
        _prefetched = {};
        Logger.debug('PREFETCH', 'Prefetch state reset');
    }

    return {
        prefetch            : prefetch,
        initPrefetchTriggers: initPrefetchTriggers,
        reset               : reset
    };

})();

// =========================================================================
// MEMORY MANAGER
// =========================================================================

var MemoryManager = (function () {

    // Registry of cleanup functions
    var _cleanupFns = [];

    // Event listener registry for cleanup
    var _listeners = [];

    /**
     * Register a cleanup function
     * Called when widget is destroyed or memory is freed
     * @param {Function} fn
     */
    function register(fn) {
        if (typeof fn === 'function') {
            _cleanupFns.push(fn);
        }
    }

    /**
     * Register an event listener that will be auto-cleaned up
     * @param {Element|Window} target
     * @param {string}   event    - Event name
     * @param {Function} handler  - Event handler
     * @param {*}        [opts]   - addEventListener options
     */
    function addEventListener(target, event, handler, opts) {
        target.addEventListener(event, handler, opts);
        _listeners.push({
            target  : target,
            event   : event,
            handler : handler,
            opts    : opts
        });
    }

    /**
     * Run all cleanup functions and remove all listeners
     * Call when navigating away or destroying the widget
     */
    function cleanup() {
        Logger.info('MEMORY', 'Running cleanup...');

        // ── Run registered cleanup functions ──
        _cleanupFns.forEach(function (fn) {
            try { fn(); } catch (e) {
                Logger.warn('MEMORY', 'Cleanup fn error', e);
            }
        });
        _cleanupFns = [];

        // ── Remove all tracked event listeners ──
        _listeners.forEach(function (l) {
            try {
                l.target.removeEventListener(l.event, l.handler, l.opts);
            } catch (e) { /* ignore */ }
        });
        _listeners = [];

        Logger.info('MEMORY', 'Cleanup complete');
    }

    /**
     * Get memory usage estimate (Chrome only)
     * @returns {Object|null}
     */
    function getUsage() {
        if (performance && performance.memory) {
            var mem = performance.memory;
            return {
                used  : (mem.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
                total : (mem.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
                limit : (mem.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
            };
        }
        return null;
    }

    /**
     * Log memory usage
     */
    function logUsage() {
        var usage = getUsage();
        if (usage) {
            Logger.info('MEMORY', 'Heap usage', usage);
        } else {
            Logger.debug('MEMORY',
                'Memory API not available (non-Chrome)');
        }
    }

    return {
        register        : register,
        addEventListener: addEventListener,
        cleanup         : cleanup,
        getUsage        : getUsage,
        logUsage        : logUsage
    };

})();

// =========================================================================
// IMAGE / FILE OPTIMIZER
// =========================================================================

var ImageOptimizer = (function () {

    /**
     * Lazy-load file attachment thumbnails using IntersectionObserver
     * Replaces placeholder elements with actual file previews
     *
     * @param {string} containerId - Container with lazy-load targets
     */
    function initLazyLoad(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        if (!('IntersectionObserver' in window)) {
            // Fallback: load all immediately
            _loadAllImages(container);
            return;
        }

        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        var el  = entry.target;
                        var src = el.getAttribute('data-src');
                        if (src) {
                            el.src = src;
                            el.removeAttribute('data-src');
                            observer.unobserve(el);
                        }
                    }
                });
            },
            { rootMargin: '100px' }
        );

        container.querySelectorAll('[data-src]').forEach(function (el) {
            observer.observe(el);
        });

        Logger.debug('IMAGE', 'Lazy load initialized for: '
            + containerId);
    }

    /**
     * Load all images in a container immediately
     * @param {Element} container
     */
    function _loadAllImages(container) {
        container.querySelectorAll('[data-src]').forEach(function (el) {
            var src = el.getAttribute('data-src');
            if (src) {
                el.src = src;
                el.removeAttribute('data-src');
            }
        });
    }

    /**
     * Build a file download URL from a relative SDK path
     * @param {string} relativePath - Path from SDK response
     * @returns {string} Full URL
     */
    function buildFileUrl(relativePath) {
        if (!relativePath) return '';

        var dcKey   = CONSTANTS.ENV.ACTIVE_DC;
        var baseUrl = CONSTANTS.ENV.DC_URLS[dcKey]
            || CONSTANTS.ENV.DC_URLS.IN;

        // Already absolute URL
        if (relativePath.startsWith('http')) return relativePath;

        return baseUrl + relativePath;
    }

    /**
     * Extract filename from SDK file path
     * Format: /api/v2.1/.../download?filepath=TIMESTAMP_filename.ext
     * @param {string} filePath
     * @returns {string} Clean filename
     */
    function extractFilename(filePath) {
        if (!filePath) return 'file';

        var fileParam  = filePath.split('filepath=')[1] || filePath;
        var decoded    = decodeURIComponent(fileParam);

        // Remove timestamp prefix (format: 1234567890_filename.ext)
        var underscoreIdx = decoded.indexOf('_');
        return underscoreIdx !== -1
            ? decoded.substring(underscoreIdx + 1)
            : decoded;
    }

    return {
        initLazyLoad    : initLazyLoad,
        buildFileUrl    : buildFileUrl,
        extractFilename : extractFilename
    };

})();

// =========================================================================
// OPTIMIZER INIT — Run on DOM ready
// =========================================================================

(function _initOptimizer() {

    document.addEventListener('DOMContentLoaded', function () {

        // ── Start performance monitoring (dev only) ──
        if (typeof CONSTANTS !== 'undefined'
            && CONSTANTS.ENV.LOG_LEVEL === CONSTANTS.LOG_LEVELS.DEBUG) {
            PerformanceMonitor.startFPSMonitor();
            Logger.info('OPTIMIZER',
                '✅ Performance monitoring active (dev mode)');
        }

        // ── Initialize prefetch triggers ──
        // Small delay to ensure nav items are in DOM
        setTimeout(function () {
            DataPrefetcher.initPrefetchTriggers();
        }, 500);

        // ── Register memory cleanup on page unload ──
        window.addEventListener('beforeunload', function () {
            MemoryManager.cleanup();
            CacheService.clear();
        });

        // ── Expose performance report to console ──
        // Developers can call: ClientHub.perf() in browser console
        window.ClientHub = window.ClientHub || {};
        window.ClientHub.perf    = PerformanceMonitor.report;
        window.ClientHub.cache   = CacheService.getStats;
        window.ClientHub.memory  = MemoryManager.logUsage;
        window.ClientHub.metrics = PerformanceMonitor.getMetrics;

        Logger.info('OPTIMIZER', '✅ Optimizer initialized');
        Logger.info('OPTIMIZER',
            'Debug commands: ClientHub.perf() | '
            + 'ClientHub.cache() | ClientHub.memory()');
    });

})();