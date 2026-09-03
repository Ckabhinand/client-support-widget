/* ==========================================================================
   CACHE.JS — In-Memory Cache Service with TTL
   
   Stores API responses in memory with time-based expiry.
   Prevents redundant Zoho Creator SDK calls during a session.
   
   USAGE:
     CacheService.set(key, data, ttl?)     → Store with optional TTL (ms)
     CacheService.get(key)                 → Get if not expired, else null
     CacheService.has(key)                 → Boolean — valid entry exists
     CacheService.invalidate(key)          → Remove single entry
     CacheService.invalidatePattern(str)   → Remove all keys containing str
     CacheService.clear()                  → Wipe entire cache
     CacheService.getStats()               → Debug info about cache state
   
   TTL DEFAULTS (from CONSTANTS.CACHE_TTL):
     SHORT   =  1 min  → Task data (changes frequently)
     MEDIUM  =  5 min  → Contracts, Requirements
     LONG    = 15 min  → Pricing plans, Promotions
     SESSION = 30 min  → User context, Init params
   ========================================================================== */

'use strict';

var CacheService = (function () {

    // =========================================================================
    // PRIVATE — Internal cache store
    // =========================================================================

    /**
     * Cache store structure:
     * {
     *   "cache_key": {
     *     data      : <any>,         // The cached value
     *     expiresAt : <timestamp>,   // Unix ms when this entry expires
     *     createdAt : <timestamp>,   // Unix ms when stored
     *     hits      : <number>,      // How many times retrieved
     *     key       : <string>       // Key reference for logging
     *   }
     * }
     */
    var _store = {};

    // Stats tracking
    var _stats = {
        totalSets        : 0,
        totalGets        : 0,
        cacheHits        : 0,
        cacheMisses      : 0,
        expiryEvictions  : 0,
        manualEvictions  : 0
    };

    // Default TTL — fallback if CONSTANTS not available
    var _defaultTTL = (typeof CONSTANTS !== 'undefined')
        ? CONSTANTS.CACHE_TTL.MEDIUM
        : 5 * 60 * 1000;    // 5 minutes

    // =========================================================================
    // PRIVATE — Helper functions
    // =========================================================================

    /**
     * Check if a cache entry is still valid (not expired)
     * @param {Object} entry - Cache entry object
     * @returns {boolean}
     */
    function _isValid(entry) {
        if (!entry) return false;
        if (!entry.expiresAt) return false;
        return Date.now() < entry.expiresAt;
    }

    /**
     * Calculate time remaining on a cache entry (ms)
     * @param {Object} entry
     * @returns {number} ms remaining (negative if expired)
     */
    function _timeRemaining(entry) {
        if (!entry || !entry.expiresAt) return -1;
        return entry.expiresAt - Date.now();
    }

    /**
     * Format ms duration as human-readable string
     * @param {number} ms
     * @returns {string} e.g. "4m 32s"
     */
    function _formatDuration(ms) {
        if (ms < 0) return 'expired';
        var totalSec = Math.floor(ms / 1000);
        var min = Math.floor(totalSec / 60);
        var sec = totalSec % 60;
        if (min > 0) return min + 'm ' + sec + 's';
        return sec + 's';
    }

    /**
     * Run passive cleanup — remove all expired entries
     * Called automatically on set() to prevent memory leaks
     */
    function _cleanup() {
        var now = Date.now();
        var removed = 0;

        Object.keys(_store).forEach(function (key) {
            var entry = _store[key];
            if (entry && entry.expiresAt && now >= entry.expiresAt) {
                delete _store[key];
                _stats.expiryEvictions++;
                removed++;
            }
        });

        if (removed > 0) {
            Logger.debug('CACHE', 'Cleanup removed ' + removed + ' expired entries');
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Store a value in cache with TTL
     *
     * @param {string} key    - Cache key (use CONSTANTS.CACHE_KEYS values)
     * @param {*} data        - Data to cache (any serializable value)
     * @param {number} [ttl]  - Time-to-live in ms (default: MEDIUM = 5 min)
     *
     * @example
     * CacheService.set(
     *     CONSTANTS.CACHE_KEYS.PRICING_PLANS,
     *     pricingData,
     *     CONSTANTS.CACHE_TTL.LONG
     * );
     */
    function set(key, data, ttl) {
        if (!key) {
            Logger.warn('CACHE', 'set() called with empty key — ignored');
            return;
        }

        var duration  = (typeof ttl === 'number' && ttl > 0) ? ttl : _defaultTTL;
        var now       = Date.now();

        _store[key] = {
            data      : data,
            expiresAt : now + duration,
            createdAt : now,
            hits      : 0,
            key       : key
        };

        _stats.totalSets++;

        Logger.debug('CACHE', 'SET → ' + key + ' (expires in ' + _formatDuration(duration) + ')', {
            key      : key,
            ttl      : _formatDuration(duration),
            dataType : Array.isArray(data) ? 'Array[' + data.length + ']'
                       : (typeof data === 'object' ? 'Object' : typeof data)
        });

        // Passive cleanup on every set (prevents unbounded memory growth)
        _cleanup();
    }

    /**
     * Retrieve a value from cache
     * Returns null if key not found OR if entry has expired
     *
     * @param {string} key - Cache key
     * @returns {*|null} Cached data or null
     *
     * @example
     * var plans = CacheService.get(CONSTANTS.CACHE_KEYS.PRICING_PLANS);
     * if (plans) {
     *     // Use cached data
     * } else {
     *     // Fetch from API
     * }
     */
    function get(key) {
        if (!key) {
            Logger.warn('CACHE', 'get() called with empty key');
            return null;
        }

        _stats.totalGets++;

        var entry = _store[key];

        // ── Entry does not exist ──
        if (!entry) {
            _stats.cacheMisses++;
            Logger.debug('CACHE', 'MISS → ' + key + ' (not found)');
            return null;
        }

        // ── Entry has expired ──
        if (!_isValid(entry)) {
            _stats.cacheMisses++;
            _stats.expiryEvictions++;
            delete _store[key];
            Logger.debug('CACHE', 'MISS → ' + key + ' (expired)');
            return null;
        }

        // ── Cache hit ──
        _stats.cacheHits++;
        entry.hits++;

        Logger.debug('CACHE', 'HIT → ' + key + ' (expires in ' + _formatDuration(_timeRemaining(entry)) + ', hits: ' + entry.hits + ')');

        return entry.data;
    }

    /**
     * Check if a valid (non-expired) cache entry exists for key
     *
     * @param {string} key
     * @returns {boolean}
     *
     * @example
     * if (CacheService.has(CONSTANTS.CACHE_KEYS.USER_CONTRACTS)) {
     *     // Skip API call
     * }
     */
    function has(key) {
        if (!key) return false;
        var entry = _store[key];
        return _isValid(entry);
    }

    /**
     * Remove a single cache entry by key
     * Call after add/update/delete operations to force fresh fetch
     *
     * @param {string} key
     *
     * @example
     * // After adding a new requirement:
     * CacheService.invalidate(CONSTANTS.CACHE_KEYS.USER_REQUIREMENTS);
     */
    function invalidate(key) {
        if (!key) {
            Logger.warn('CACHE', 'invalidate() called with empty key');
            return;
        }

        if (_store[key]) {
            delete _store[key];
            _stats.manualEvictions++;
            Logger.info('CACHE', 'INVALIDATED → ' + key);
        } else {
            Logger.debug('CACHE', 'invalidate() → key not in cache: ' + key);
        }
    }

    /**
     * Remove all cache entries whose key CONTAINS the given string
     * Useful for clearing related entries (e.g., all user data)
     *
     * @param {string} pattern - Substring to match against keys
     *
     * @example
     * // Clear all user-specific cache after logout:
     * CacheService.invalidatePattern('user_');
     *
     * // Clear all contract-related cache:
     * CacheService.invalidatePattern('contract');
     */
    function invalidatePattern(pattern) {
        if (!pattern) {
            Logger.warn('CACHE', 'invalidatePattern() called with empty pattern');
            return;
        }

        var removed = 0;
        var removedKeys = [];

        Object.keys(_store).forEach(function (key) {
            if (key.indexOf(pattern) !== -1) {
                delete _store[key];
                _stats.manualEvictions++;
                removedKeys.push(key);
                removed++;
            }
        });

        if (removed > 0) {
            Logger.info('CACHE', 'INVALIDATED PATTERN "' + pattern + '" → removed ' + removed + ' entries', removedKeys);
        } else {
            Logger.debug('CACHE', 'invalidatePattern() → no keys matched: ' + pattern);
        }
    }

    /**
     * Wipe the entire cache
     * Call on full page refresh or user session change
     *
     * @example
     * // On user logout or manual refresh:
     * CacheService.clear();
     */
    function clear() {
        var count = Object.keys(_store).length;
        _store = {};
        _stats.manualEvictions += count;
        Logger.info('CACHE', 'CLEARED → removed ' + count + ' entries');
    }

    /**
     * Get all current cache keys and their status
     * Useful for debugging what is cached at any point
     *
     * @returns {Array} Array of status objects
     *
     * @example
     * console.table(CacheService.getKeys());
     */
    function getKeys() {
        var now = Date.now();
        return Object.keys(_store).map(function (key) {
            var entry = _store[key];
            var remaining = _timeRemaining(entry);
            return {
                key       : key,
                valid     : _isValid(entry),
                expires   : _formatDuration(remaining),
                hits      : entry.hits || 0,
                createdAt : new Date(entry.createdAt).toLocaleTimeString()
            };
        });
    }

    /**
     * Get cache performance statistics
     *
     * @returns {Object} Stats object with hit rate and counts
     *
     * @example
     * Logger.info('CACHE', 'Stats', CacheService.getStats());
     */
    function getStats() {
        var hitRate = _stats.totalGets > 0
            ? Math.round((_stats.cacheHits / _stats.totalGets) * 100)
            : 0;

        return {
            totalSets       : _stats.totalSets,
            totalGets       : _stats.totalGets,
            cacheHits       : _stats.cacheHits,
            cacheMisses     : _stats.cacheMisses,
            hitRate         : hitRate + '%',
            expiryEvictions : _stats.expiryEvictions,
            manualEvictions : _stats.manualEvictions,
            currentEntries  : Object.keys(_store).length
        };
    }

    /**
     * Extend the TTL of an existing cache entry without changing data
     * Useful for "refreshing" cache on user interaction
     *
     * @param {string} key
     * @param {number} [ttl] - New TTL in ms (default: MEDIUM)
     * @returns {boolean} true if extended, false if key not found
     *
     * @example
     * // User just viewed contracts — extend cache
     * CacheService.extend(CONSTANTS.CACHE_KEYS.USER_CONTRACTS);
     */
    function extend(key, ttl) {
        if (!key) return false;

        var entry = _store[key];
        if (!entry) {
            Logger.debug('CACHE', 'extend() → key not found: ' + key);
            return false;
        }

        var duration  = (typeof ttl === 'number' && ttl > 0) ? ttl : _defaultTTL;
        entry.expiresAt = Date.now() + duration;

        Logger.debug('CACHE', 'EXTENDED → ' + key + ' (now expires in ' + _formatDuration(duration) + ')');
        return true;
    }

    /**
     * Get or fetch pattern — check cache first, fetch if missing
     * Reduces boilerplate in SDK Service and Repositories
     *
     * @param {string} key          - Cache key
     * @param {Function} fetchFn    - Async function that returns fresh data
     * @param {number} [ttl]        - TTL for storing result
     * @returns {Promise<*>}        - Cached or freshly fetched data
     *
     * @example
     * var plans = await CacheService.getOrFetch(
     *     CONSTANTS.CACHE_KEYS.PRICING_PLANS,
     *     function() { return SdkService.getRecords(...); },
     *     CONSTANTS.CACHE_TTL.LONG
     * );
     */
    async function getOrFetch(key, fetchFn, ttl) {
        // ── Check cache first ──
        var cached = get(key);
        if (cached !== null) {
            return cached;
        }

        // ── Fetch fresh data ──
        Logger.debug('CACHE', 'getOrFetch → fetching fresh data for: ' + key);

        try {
            var freshData = await fetchFn();
            set(key, freshData, ttl);
            return freshData;
        } catch (err) {
            Logger.error('CACHE', 'getOrFetch → fetch failed for: ' + key, err);
            throw err;
        }
    }

    // =========================================================================
    // EXPOSE PUBLIC API
    // =========================================================================
    return {
        set               : set,
        get               : get,
        has               : has,
        invalidate        : invalidate,
        invalidatePattern : invalidatePattern,
        clear             : clear,
        getKeys           : getKeys,
        getStats          : getStats,
        extend            : extend,
        getOrFetch        : getOrFetch
    };

})();