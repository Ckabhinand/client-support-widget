/* ==========================================================================
   GEOLOCATION.JS — IP-Based Country & Currency Detection
   
   Bulletproof geolocation with multi-API fallback.
   
   Strategy:
   1. Try api.country.is       (unlimited, free, always works)
   2. Fallback: ipapi.co       (1000/day, only if #1 fails)
   3. Final fallback: USD      (hardcoded — never fails)
   
   Cached for 30 minutes to minimize API calls.
   
   PUBLIC METHODS:
     GeoLocationService.detectCurrency()  → Promise<string>
     GeoLocationService.detectCountry()   → Promise<string>
   ========================================================================== */

'use strict';

var GeoLocationService = (function () {

    // =========================================================================
    // CONFIG
    // =========================================================================

    var REQUEST_TIMEOUT = 5000;        // 5 seconds per API
    var CACHE_KEY       = 'user_geo_currency';
    var CACHE_TTL       = 30 * 60 * 1000;  // 30 minutes

    // ── API endpoints in priority order ──
    var API_ENDPOINTS = [
        {
            name : 'country.is',
            url  : 'https://api.country.is/',
            parseCountry : function (data) {
                return (data && data.country) || '';
            }
        },
        {
            name : 'ipapi.co',
            url  : 'https://ipapi.co/json/',
            parseCountry : function (data) {
                return (data && data.country_code) || '';
            }
        }
    ];

    // =========================================================================
    // COUNTRY → CURRENCY MAPPING
    // =========================================================================

    var COUNTRY_CURRENCY = {
        // North America
        US : 'USD',
        CA : 'USD',

        // India
        IN : 'INR',

        // Eurozone
        DE : 'EUR', FR : 'EUR', IT : 'EUR', ES : 'EUR',
        NL : 'EUR', BE : 'EUR', AT : 'EUR', PT : 'EUR',
        IE : 'EUR', FI : 'EUR', GR : 'EUR', LU : 'EUR',
        CY : 'EUR', MT : 'EUR', EE : 'EUR', LV : 'EUR',
        LT : 'EUR', SK : 'EUR', SI : 'EUR'
    };

    var DEFAULT_CURRENCY = 'USD';

    // =========================================================================
    // PRIVATE — Fetch with timeout (safe, never throws un-caught)
    // =========================================================================

    function _fetchWithTimeout(url, timeout) {
        return new Promise(function (resolve) {
            var completed  = false;
            var controller = (typeof AbortController !== 'undefined')
                ? new AbortController()
                : null;

            var timer = setTimeout(function () {
                if (completed) return;
                completed = true;
                if (controller) controller.abort();
                resolve(null);
            }, timeout);

            var fetchOpts = controller ? { signal: controller.signal } : {};

            fetch(url, fetchOpts)
                .then(function (res) {
                    if (completed) return null;
                    if (!res.ok) return null;
                    return res.json();
                })
                .then(function (data) {
                    if (completed) return;
                    completed = true;
                    clearTimeout(timer);
                    resolve(data || null);
                })
                .catch(function () {
                    if (completed) return;
                    completed = true;
                    clearTimeout(timer);
                    resolve(null);
                });
        });
    }

    // =========================================================================
    // PRIVATE — Try APIs one by one until one succeeds
    // =========================================================================

    async function _detectCountryWithFallback() {

        for (var i = 0; i < API_ENDPOINTS.length; i++) {
            var api = API_ENDPOINTS[i];

            Logger.debug('GEO', 'Trying API: ' + api.name);

            try {
                var data = await _fetchWithTimeout(api.url, REQUEST_TIMEOUT);

                if (data) {
                    var country = api.parseCountry(data);
                    if (country) {
                        Logger.info('GEO', '✅ ' + api.name
                            + ' → country: ' + country);
                        return country;
                    }
                }

                Logger.warn('GEO', '⚠️ ' + api.name + ' returned no country');

            } catch (err) {
                Logger.warn('GEO', '⚠️ ' + api.name + ' failed', err);
                // Continue to next API
            }
        }

        Logger.warn('GEO', 'All geolocation APIs failed');
        return '';
    }

    // =========================================================================
    // PUBLIC — Detect Currency
    // =========================================================================

    /**
     * Detect user's currency based on their IP location.
     * NEVER throws — always returns a valid currency code.
     *
     * @returns {Promise<string>} Currency code (USD, INR, EUR)
     */
    async function detectCurrency() {

        // ── Check cache first ──
        try {
            var cached = CacheService.get(CACHE_KEY);
            if (cached) {
                Logger.debug('GEO', 'CACHE HIT → ' + cached);
                return cached;
            }
        } catch (err) {
            Logger.warn('GEO', 'Cache read failed', err);
            // Continue without cache
        }

        Logger.info('GEO', 'Detecting user currency via IP...');

        var country = '';

        // ── Try all APIs with fallback — never throws ──
        try {
            country = await _detectCountryWithFallback();
        } catch (err) {
            Logger.error('GEO', 'Unexpected error during detection', err);
            country = '';
        }

        // ── Map country → currency (with USD fallback) ──
        var currency = COUNTRY_CURRENCY[country] || DEFAULT_CURRENCY;

        Logger.info('GEO', 'Final result → country: ' + (country || 'unknown')
            + ', currency: ' + currency);

        // ── Cache result (fail silently if cache broken) ──
        try {
            CacheService.set(CACHE_KEY, currency, CACHE_TTL);
        } catch (err) {
            Logger.warn('GEO', 'Cache write failed', err);
        }

        return currency;
    }

    /**
     * Detect user's country code (ISO 2-letter).
     * NEVER throws — returns empty string on failure.
     *
     * @returns {Promise<string>} Country code or ''
     */
    async function detectCountry() {
        try {
            return await _detectCountryWithFallback();
        } catch (err) {
            Logger.warn('GEO', 'detectCountry failed', err);
            return '';
        }
    }

    // =========================================================================
    // EXPOSE PUBLIC API
    // =========================================================================
    return {
        detectCurrency : detectCurrency,
        detectCountry  : detectCountry
    };

})();