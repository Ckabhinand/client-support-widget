/* ==========================================================================
   SDK-SERVICE.JS — Zoho Creator Widget SDK Wrapper
   
   THE ONLY FILE that calls ZOHO.CREATOR.* APIs directly.
   All other modules must use this service.
   
   RULES:
   - All read operations check CacheService first
   - All write operations invalidate relevant cache entries
   - All errors are normalized into a standard ErrorResult shape
   - Error code 9280 (no records) is treated as empty array (NOT an error)
   - All number fields from SDK are parsed to numbers before returning
   - Lookup fields always expose .id and .display via _normalizeLookup()
   
   METHODS:
     SdkService.init()
     SdkService.getInitParams()
     SdkService.getRecords(config)
     SdkService.getRecordById(config)
     SdkService.getRecordCount(config)
     SdkService.addRecord(config)
     SdkService.updateRecord(config)
     SdkService.updateRecords(config)
     SdkService.deleteRecord(config)
     SdkService.deleteRecords(config)
     SdkService.getAllRecords(config)
   ========================================================================== */

'use strict';

var SdkService = (function () {

    // =========================================================================
    // PRIVATE — State
    // =========================================================================

    var _initialized  = false;
    var _appName      = (typeof CONSTANTS !== 'undefined')
        ? CONSTANTS.APP.NAME
        : 'client-support';

    // =========================================================================
    // PRIVATE — Error Normalization
    // =========================================================================

    /**
     * Normalize any SDK error into a standard shape
     * 
     * Standard error shape:
     * {
     *   code    : number,   // SDK error code (e.g. 9280)
     *   message : string,   // Human readable message
     *   raw     : any       // Original error object
     * }
     *
     * @param {*} err - Raw error from SDK .catch()
     * @returns {Object} Normalized error object
     */
    function _normalizeError(err) {
        // ── Already a normalized error ──
        if (err && err.__normalized) return err;

        var normalized = {
            __normalized : true,
            code         : 0,
            message      : 'Unknown error',
            raw          : err
        };

        // ── SDK error with responseText (most common) ──
        if (err && err.responseText) {
            try {
                var parsed   = JSON.parse(err.responseText);
                normalized.code    = parsed.code    || 0;
                normalized.message = parsed.message || 'SDK error';
            } catch (parseErr) {
                normalized.message = err.responseText;
            }
            return normalized;
        }

        // ── SDK error with direct code ──
        if (err && err.code) {
            normalized.code    = err.code;
            normalized.message = err.message || 'SDK error code: ' + err.code;
            return normalized;
        }

        // ── JavaScript Error object ──
        if (err instanceof Error) {
            normalized.message = err.message;
            return normalized;
        }

        // ── String error ──
        if (typeof err === 'string') {
            normalized.message = err;
            return normalized;
        }

        return normalized;
    }

    /**
     * Check if an error means "no records found" (code 9280)
     * This is NOT a real error — treat result as empty array
     *
     * @param {Object} normalizedError
     * @returns {boolean}
     */
    function _isNoRecordsError(normalizedError) {
        return normalizedError.code ===
            CONSTANTS.ERROR_CODES.NO_RECORDS;
    }

    // =========================================================================
    // PRIVATE — Field Value Normalization
    // =========================================================================

    /**
     * Normalize a lookup field from SDK response
     * SDK returns: { ID: "...", DisplayField: "...", zc_display_value: "..." }
     * We return: { id: "...", display: "..." }
     *
     * @param {*} val - Raw lookup value from SDK
     * @returns {Object|null}
     */
    function _normalizeLookup(val) {
        if (!val || typeof val !== 'object') return null;
        return {
            id      : val.ID || val.id || '',
            display : val.zc_display_value || ''
        };
    }

    /**
     * Normalize a single record's fields:
     * - Number strings → parsed numbers
     * - Lookup objects → { id, display }
     * - Missing fields → remain missing (do NOT add null placeholders)
     * - Arrays stay arrays
     * - Strings stay strings
     *
     * @param {Object} record - Raw record from SDK
     * @returns {Object} Normalized record
     */
    function _normalizeRecord(record) {
        if (!record || typeof record !== 'object') return record;

        var normalized = {};

        Object.keys(record).forEach(function (key) {
            var val = record[key];

            // ── Null / undefined → keep as-is ──
            if (val === null || val === undefined) {
                normalized[key] = val;
                return;
            }

            // ── Array → normalize each element ──
            if (Array.isArray(val)) {
                normalized[key] = val.map(function (item) {
                    if (item && typeof item === 'object') {
                        return _normalizeLookup(item) || item;
                    }
                    return item;
                });
                return;
            }

            // ── Lookup object (has ID + zc_display_value) ──
            if (typeof val === 'object' && val.ID !== undefined
                && val.zc_display_value !== undefined) {
                normalized[key] = _normalizeLookup(val);
                return;
            }

            // ── URL field object (has value + url) ──
            if (typeof val === 'object' && val.url !== undefined
                && val.value !== undefined) {
                normalized[key] = {
                    display : val.value,
                    url     : val.url
                };
                return;
            }

            // ── Other objects → pass through ──
            if (typeof val === 'object') {
                normalized[key] = val;
                return;
            }

            // ── String that looks like a number ──
            // Only auto-parse known number-looking strings
            // Leave date strings, IDs, and display values alone
            normalized[key] = val;
        });

        return normalized;
    }

    /**
     * Normalize an array of records
     * @param {Array} records
     * @returns {Array}
     */
    function _normalizeRecords(records) {
        if (!Array.isArray(records)) return [];
        return records.map(_normalizeRecord);
    }

    // =========================================================================
    // PRIVATE — Safe field helpers (used by repositories)
    // =========================================================================

    /**
     * Safely get a string field value
     * @param {Object} record
     * @param {string} fieldName
     * @param {string} [defaultVal]
     * @returns {string}
     */
    function _getString(record, fieldName, defaultVal) {
        var val = record[fieldName];
        if (val === undefined || val === null) return defaultVal || '';
        return String(val);
    }

    /**
     * Safely get a number field value (handles SDK string numbers)
     * @param {Object} record
     * @param {string} fieldName
     * @param {number} [defaultVal]
     * @returns {number}
     */
    function _getNumber(record, fieldName, defaultVal) {
        var val = record[fieldName];
        if (val === undefined || val === null) return defaultVal || 0;
        var parsed = parseFloat(String(val).replace(/,/g, ''));
        return isNaN(parsed) ? (defaultVal || 0) : parsed;
    }

    /**
     * Safely get integer field value
     * @param {Object} record
     * @param {string} fieldName
     * @param {number} [defaultVal]
     * @returns {number}
     */
    function _getInt(record, fieldName, defaultVal) {
        var val = record[fieldName];
        if (val === undefined || val === null) return defaultVal || 0;
        var parsed = parseInt(String(val), 10);
        return isNaN(parsed) ? (defaultVal || 0) : parsed;
    }

    /**
     * Safely get a lookup field's display value
     * @param {Object} record
     * @param {string} fieldName
     * @returns {string}
     */
    function _getLookupDisplay(record, fieldName) {
        var val = record[fieldName];
        if (!val) return '';
        // Already normalized
        if (val.display !== undefined) return val.display || '';
        // Raw SDK format
        if (val.zc_display_value !== undefined) return val.zc_display_value || '';
        return '';
    }

    /**
     * Safely get a lookup field's ID
     * @param {Object} record
     * @param {string} fieldName
     * @returns {string}
     */
    function _getLookupId(record, fieldName) {
        var val = record[fieldName];
        if (!val) return '';
        // Already normalized
        if (val.id !== undefined) return val.id || '';
        // Raw SDK format
        if (val.ID !== undefined) return val.ID || '';
        return '';
    }

    // =========================================================================
    // PUBLIC — Initialization
    // =========================================================================

    /**
     * Initialize the Zoho Creator SDK
     * Must be called before any other SdkService method
     *
     * @returns {Promise<void>}
     */
    async function init() {
        // Modern Widget SDK does not require explicit init().
        // SDK methods are available as soon as ZOHO.CREATOR namespace exists.
        Logger.info('SDK', '✅ Zoho Creator SDK ready (no init required)');
        _initialized = true;
        return Promise.resolve();
    }

    /**
     * Get initialization parameters from SDK
     * Returns: { email, name, scope, appName, brandColor }
     *
     * @returns {Promise<Object>}
     */
    async function getInitParams() {
        try {
            var raw = await ZOHO.CREATOR.UTIL.getInitParams();

            Logger.info('SDK', 'getInitParams response', raw);

            // Normalize into clean user context object
            var email = raw.loginUser || '';
            var name  = email
                ? email.split('@')[0].replace(/[._-]/g, ' ')
                    .replace(/\b\w/g, function(c) { return c.toUpperCase(); })
                : 'User';

            return {
                email      : email,
                name       : name,
                scope      : raw.scope      || '',
                appName    : raw.appLinkName || _appName,
                brandColor : raw.themeBrandColor || '#2563EB',
                raw        : raw
            };
        } catch (err) {
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'getInitParams failed', normalized);
            throw normalized;
        }
    }

    // =========================================================================
    // PUBLIC — Read Operations
    // =========================================================================

    /**
     * Get multiple records from a report
     * Handles 9280 (no records) as empty array — NOT an error
     *
     * @param {Object} config
     * @param {string} config.reportName    - Report API name
     * @param {string} [config.criteria]    - Optional filter criteria
     * @param {number} [config.page]        - Page number (default: 1)
     * @param {number} [config.pageSize]    - Records per page (default: 200)
     * @param {string} [config.cacheKey]    - Cache key (skip cache if omitted)
     * @param {number} [config.cacheTTL]    - Cache TTL in ms
     * @returns {Promise<Array>} Array of normalized records
     *
     * @example
     * var contracts = await SdkService.getRecords({
     *     reportName : CONSTANTS.REPORTS.SUPPORT_CONTRACT,
     *     criteria   : '(Email == "john@abc.com")',
     *     cacheKey   : CONSTANTS.CACHE_KEYS.USER_CONTRACTS,
     *     cacheTTL   : CONSTANTS.CACHE_TTL.MEDIUM
     * });
     */
    async function getRecords(config) {
        var reportName = config.reportName;
        var criteria   = config.criteria   || null;
        var page       = config.page       || CONSTANTS.PAGINATION.DEFAULT_PAGE;
        var pageSize   = config.pageSize   || CONSTANTS.PAGINATION.DEFAULT_PAGE_SIZE;
        var cacheKey   = config.cacheKey   || null;
        var cacheTTL   = config.cacheTTL   || CONSTANTS.CACHE_TTL.MEDIUM;

        // ── Check cache first ──
        if (cacheKey) {
            var cached = CacheService.get(cacheKey);
            if (cached !== null) {
                Logger.debug('SDK', 'getRecords CACHE HIT → ' + reportName);
                return cached;
            }
        }

        Logger.time('SDK', 'getRecords:' + reportName);

        try {
            // ── Build SDK config ──
            var sdkConfig = {
                app_name    : _appName,
                report_name : reportName,
                page        : page,
                pageSize    : pageSize
            };

            if (criteria) {
                sdkConfig.criteria = criteria;
            }

            Logger.debug('SDK', 'getRecords → ' + reportName, {
                criteria : criteria || 'none',
                page     : page,
                pageSize : pageSize
            });

            var response = await ZOHO.CREATOR.DATA.getRecords(sdkConfig);
            var records  = _normalizeRecords(response.data || []);

            Logger.timeEnd('SDK', 'getRecords:' + reportName);
            Logger.info('SDK', 'getRecords ✅ ' + reportName + ' → ' + records.length + ' records');

            // ── Store in cache if key provided ──
            if (cacheKey && records.length > 0) {
                CacheService.set(cacheKey, records, cacheTTL);
            }

            return records;

        } catch (err) {
            Logger.timeEnd('SDK', 'getRecords:' + reportName);

            var normalized = _normalizeError(err);

            // ── 9280 = No records found → return empty array (NOT an error) ──
            if (_isNoRecordsError(normalized)) {
                Logger.warn('SDK', 'getRecords → No records found in ' + reportName
                    + (criteria ? ' with criteria: ' + criteria : ''));

                // Cache empty result too (prevents repeated failed calls)
                if (cacheKey) {
                    CacheService.set(cacheKey, [], cacheTTL);
                }
                return [];
            }

            // ── Real error ──
            Logger.error('SDK', 'getRecords FAILED → ' + reportName, normalized);
            throw normalized;
        }
    }

    /**
     * Get a single record by ID
     *
     * @param {Object} config
     * @param {string} config.reportName  - Report API name
     * @param {string} config.id          - Record ID
     * @param {string} [config.cacheKey]  - Cache key for this record
     * @param {number} [config.cacheTTL]  - Cache TTL
     * @returns {Promise<Object|null>} Normalized record or null
     *
     * @example
     * var req = await SdkService.getRecordById({
     *     reportName : CONSTANTS.REPORTS.REQUIREMENT,
     *     id         : '266830000010804772'
     * });
     */
    async function getRecordById(config) {
        var reportName = config.reportName;
        var id         = String(config.id || '');
        var cacheKey   = config.cacheKey || null;
        var cacheTTL   = config.cacheTTL || CONSTANTS.CACHE_TTL.MEDIUM;

        if (!id) {
            Logger.warn('SDK', 'getRecordById called with empty id');
            return null;
        }

        // ── Check cache ──
        if (cacheKey) {
            var cached = CacheService.get(cacheKey);
            if (cached !== null) {
                Logger.debug('SDK', 'getRecordById CACHE HIT → ' + reportName + ':' + id);
                return cached;
            }
        }

        Logger.time('SDK', 'getRecordById:' + reportName + ':' + id);

        try {
            Logger.debug('SDK', 'getRecordById → ' + reportName + ' id:' + id);

            var response = await ZOHO.CREATOR.DATA.getRecordById({
                app_name    : _appName,
                report_name : reportName,
                id          : id
            });

            var record = _normalizeRecord(response.data || null);

            Logger.timeEnd('SDK', 'getRecordById:' + reportName + ':' + id);
            Logger.info('SDK', 'getRecordById ✅ ' + reportName + ':' + id);

            // ── Cache result ──
            if (cacheKey && record) {
                CacheService.set(cacheKey, record, cacheTTL);
            }

            return record;

        } catch (err) {
            Logger.timeEnd('SDK', 'getRecordById:' + reportName + ':' + id);
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'getRecordById FAILED → ' + reportName + ':' + id, normalized);
            throw normalized;
        }
    }

    /**
     * Get total record count from a report
     *
     * @param {Object} config
     * @param {string} config.reportName - Report API name
     * @returns {Promise<number>} Record count as integer
     *
     * @example
     * var count = await SdkService.getRecordCount({
     *     reportName: CONSTANTS.REPORTS.REQUIREMENT
     * });
     */
    async function getRecordCount(config) {
        var reportName = config.reportName;

        try {
            Logger.debug('SDK', 'getRecordCount → ' + reportName);

            var response = await ZOHO.CREATOR.DATA.getRecordCount({
                app_name    : _appName,
                report_name : reportName
            });

            // ⚠️ SDK returns count under "result" key, not "data"
            // ⚠️ records_count is a STRING — must parseInt
            var count = parseInt(
                (response.result && response.result.records_count) || '0',
                10
            );

            Logger.info('SDK', 'getRecordCount ✅ ' + reportName + ' → ' + count);
            return count;

        } catch (err) {
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'getRecordCount FAILED → ' + reportName, normalized);
            return 0;    // Safe fallback — count failures should not break UI
        }
    }

    /**
     * Fetch ALL records across multiple pages
     * Automatically paginates until all records are retrieved
     *
     * @param {Object} config
     * @param {string} config.reportName    - Report API name
     * @param {string} [config.criteria]    - Optional filter
     * @param {string} [config.cacheKey]    - Cache key for full result set
     * @param {number} [config.cacheTTL]    - Cache TTL
     * @returns {Promise<Array>} Complete array of all records
     *
     * @example
     * var allTasks = await SdkService.getAllRecords({
     *     reportName : CONSTANTS.REPORTS.PROPOSED_TASKS,
     *     criteria   : '(Requirement == "266830000010804772")'
     * });
     */
    async function getAllRecords(config) {
        var reportName = config.reportName;
        var criteria   = config.criteria || null;
        var cacheKey   = config.cacheKey || null;
        var cacheTTL   = config.cacheTTL || CONSTANTS.CACHE_TTL.MEDIUM;
        var pageSize   = CONSTANTS.PAGINATION.MAX_PAGE_SIZE;

        // ── Check cache ──
        if (cacheKey) {
            var cached = CacheService.get(cacheKey);
            if (cached !== null) {
                Logger.debug('SDK', 'getAllRecords CACHE HIT → ' + reportName
                    + ' (' + cached.length + ' records)');
                return cached;
            }
        }

        Logger.time('SDK', 'getAllRecords:' + reportName);
        Logger.debug('SDK', 'getAllRecords START → ' + reportName, {
            criteria : criteria || 'none'
        });

        var allRecords = [];
        var page       = 1;
        var hasMore    = true;

        while (hasMore) {
            try {
                var sdkConfig = {
                    app_name    : _appName,
                    report_name : reportName,
                    page        : page,
                    pageSize    : pageSize
                };

                if (criteria) sdkConfig.criteria = criteria;

                var response = await ZOHO.CREATOR.DATA.getRecords(sdkConfig);
                var batch    = _normalizeRecords(response.data || []);

                allRecords = allRecords.concat(batch);

                Logger.debug('SDK', 'getAllRecords page ' + page + ' → '
                    + batch.length + ' records (total: ' + allRecords.length + ')');

                // ── If batch < pageSize, no more pages ──
                if (batch.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }

            } catch (err) {
                var normalized = _normalizeError(err);

                // ── 9280 on page > 1 means we reached the end ──
                if (_isNoRecordsError(normalized)) {
                    Logger.debug('SDK', 'getAllRecords → no more records at page ' + page);
                    hasMore = false;
                } else {
                    Logger.timeEnd('SDK', 'getAllRecords:' + reportName);
                    Logger.error('SDK', 'getAllRecords FAILED at page '
                        + page + ' → ' + reportName, normalized);
                    throw normalized;
                }
            }
        }

        Logger.timeEnd('SDK', 'getAllRecords:' + reportName);
        Logger.info('SDK', 'getAllRecords ✅ ' + reportName
            + ' → ' + allRecords.length + ' total records');

        // ── Cache full result ──
        if (cacheKey) {
            CacheService.set(cacheKey, allRecords, cacheTTL);
        }

        return allRecords;
    }

    // =========================================================================
    // PUBLIC — Write Operations
    // =========================================================================

    /**
     * Create a new record
     * ⚠️ Uses form_name (not report_name)
     * Automatically invalidates related cache entries
     *
     * @param {Object} config
     * @param {string} config.formName          - Form API name
     * @param {Object} config.data              - Field values to set
     * @param {string|string[]} [config.invalidateCache] - Cache keys to clear
     * @returns {Promise<string>} ID of newly created record
     *
     * @example
     * var newId = await SdkService.addRecord({
     *     formName        : CONSTANTS.FORMS.REQUIREMENT,
     *     data            : { Subject_field: 'Fix bug', Status: 'Submitted' },
     *     invalidateCache : CONSTANTS.CACHE_KEYS.USER_REQUIREMENTS
     * });
     */
    async function addRecord(config) {
        var formName        = config.formName;
        var data            = config.data || {};
        var invalidateKeys  = config.invalidateCache || [];

        // Normalize invalidateCache to array
        if (typeof invalidateKeys === 'string') {
            invalidateKeys = [invalidateKeys];
        }

        Logger.time('SDK', 'addRecord:' + formName);
        Logger.debug('SDK', 'addRecord → ' + formName, data);

        try {
            var response = await ZOHO.CREATOR.DATA.addRecords({
                app_name  : _appName,
                form_name : formName,
                payload   : { data: data }
            });

            var newId = (response.data && response.data.ID) || '';

            Logger.timeEnd('SDK', 'addRecord:' + formName);
            Logger.info('SDK', 'addRecord ✅ ' + formName + ' → ID: ' + newId);

            // ── Invalidate cache ──
            invalidateKeys.forEach(function (key) {
                CacheService.invalidate(key);
            });

            return newId;

        } catch (err) {
            Logger.timeEnd('SDK', 'addRecord:' + formName);
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'addRecord FAILED → ' + formName, normalized);
            throw normalized;
        }
    }

    /**
     * Update a single record by ID
     * ⚠️ Uses report_name (not form_name)
     *
     * @param {Object} config
     * @param {string} config.reportName         - Report API name
     * @param {string} config.id                 - Record ID to update
     * @param {Object} config.data               - Fields to update (partial)
     * @param {string|string[]} [config.invalidateCache] - Cache keys to clear
     * @returns {Promise<string>} ID of updated record
     *
     * @example
     * await SdkService.updateRecord({
     *     reportName      : CONSTANTS.REPORTS.PROPOSED_TASKS,
     *     id              : taskId,
     *     data            : { Status: CONSTANTS.STATUS.TASK.APPROVED },
     *     invalidateCache : CONSTANTS.CACHE_KEYS.USER_TASKS
     * });
     */
    async function updateRecord(config) {
        var reportName      = config.reportName;
        var id              = String(config.id || '');
        var data            = config.data || {};
        var invalidateKeys  = config.invalidateCache || [];

        if (typeof invalidateKeys === 'string') {
            invalidateKeys = [invalidateKeys];
        }

        if (!id) {
            Logger.warn('SDK', 'updateRecord called with empty id');
            throw { code: 0, message: 'Record ID is required for update' };
        }

        Logger.time('SDK', 'updateRecord:' + reportName + ':' + id);
        Logger.debug('SDK', 'updateRecord → ' + reportName + ':' + id, data);

        try {
            var response = await ZOHO.CREATOR.DATA.updateRecordById({
                app_name    : _appName,
                report_name : reportName,
                id          : id,
                payload     : { data: data }
            });

            var updatedId = (response.data && response.data.ID) || id;

            Logger.timeEnd('SDK', 'updateRecord:' + reportName + ':' + id);
            Logger.info('SDK', 'updateRecord ✅ ' + reportName + ':' + id);

            // ── Invalidate cache ──
            invalidateKeys.forEach(function (key) {
                CacheService.invalidate(key);
            });

            return updatedId;

        } catch (err) {
            Logger.timeEnd('SDK', 'updateRecord:' + reportName + ':' + id);
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'updateRecord FAILED → ' + reportName + ':' + id, normalized);
            throw normalized;
        }
    }

    /**
     * Update multiple records matching criteria
     * ⚠️ criteria is MANDATORY — throws if missing
     *
     * @param {Object} config
     * @param {string} config.reportName         - Report API name
     * @param {string} config.criteria           - Filter criteria (REQUIRED)
     * @param {Object} config.data               - Fields to update
     * @param {string|string[]} [config.invalidateCache]
     * @returns {Promise<void>}
     */
    async function updateRecords(config) {
        var reportName     = config.reportName;
        var criteria       = config.criteria;
        var data           = config.data || {};
        var invalidateKeys = config.invalidateCache || [];

        if (typeof invalidateKeys === 'string') {
            invalidateKeys = [invalidateKeys];
        }

        if (!criteria) {
            Logger.error('SDK', 'updateRecords called without criteria — BLOCKED');
            throw { code: CONSTANTS.ERROR_CODES.CRITERIA_REQD,
                    message: 'Criteria is required for updateRecords' };
        }

        Logger.debug('SDK', 'updateRecords → ' + reportName, { criteria, data });

        try {
            await ZOHO.CREATOR.DATA.updateRecords({
                app_name    : _appName,
                report_name : reportName,
                criteria    : criteria,
                payload     : { data: data }
            });

            Logger.info('SDK', 'updateRecords ✅ ' + reportName);

            invalidateKeys.forEach(function (key) {
                CacheService.invalidate(key);
            });

        } catch (err) {
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'updateRecords FAILED → ' + reportName, normalized);
            throw normalized;
        }
    }

    /**
     * Delete a single record by ID
     *
     * @param {Object} config
     * @param {string} config.reportName         - Report API name
     * @param {string} config.id                 - Record ID to delete
     * @param {string|string[]} [config.invalidateCache]
     * @returns {Promise<string>} ID of deleted record
     */
    async function deleteRecord(config) {
        var reportName     = config.reportName;
        var id             = String(config.id || '');
        var invalidateKeys = config.invalidateCache || [];

        if (typeof invalidateKeys === 'string') {
            invalidateKeys = [invalidateKeys];
        }

        if (!id) {
            Logger.warn('SDK', 'deleteRecord called with empty id');
            throw { code: 0, message: 'Record ID is required for delete' };
        }

        Logger.debug('SDK', 'deleteRecord → ' + reportName + ':' + id);

        try {
            var response = await ZOHO.CREATOR.DATA.deleteRecordById({
                app_name    : _appName,
                report_name : reportName,
                id          : id
            });

            var deletedId = (response.data && response.data.ID) || id;

            Logger.info('SDK', 'deleteRecord ✅ ' + reportName + ':' + id);

            invalidateKeys.forEach(function (key) {
                CacheService.invalidate(key);
            });

            return deletedId;

        } catch (err) {
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'deleteRecord FAILED → ' + reportName + ':' + id, normalized);
            throw normalized;
        }
    }

    /**
     * Delete multiple records matching criteria
     * ⚠️ criteria is MANDATORY
     *
     * @param {Object} config
     * @param {string} config.reportName         - Report API name
     * @param {string} config.criteria           - Filter criteria (REQUIRED)
     * @param {string|string[]} [config.invalidateCache]
     * @returns {Promise<void>}
     */
    async function deleteRecords(config) {
        var reportName     = config.reportName;
        var criteria       = config.criteria;
        var invalidateKeys = config.invalidateCache || [];

        if (typeof invalidateKeys === 'string') {
            invalidateKeys = [invalidateKeys];
        }

        if (!criteria) {
            Logger.error('SDK', 'deleteRecords called without criteria — BLOCKED');
            throw { code: CONSTANTS.ERROR_CODES.CRITERIA_REQD,
                    message: 'Criteria is required for deleteRecords' };
        }

        Logger.debug('SDK', 'deleteRecords → ' + reportName, { criteria });

        try {
            await ZOHO.CREATOR.DATA.deleteRecords({
                app_name    : _appName,
                report_name : reportName,
                criteria    : criteria
            });

            Logger.info('SDK', 'deleteRecords ✅ ' + reportName);

            invalidateKeys.forEach(function (key) {
                CacheService.invalidate(key);
            });

        } catch (err) {
            var normalized = _normalizeError(err);
            Logger.error('SDK', 'deleteRecords FAILED → ' + reportName, normalized);
            throw normalized;
        }
    }

    // =========================================================================
    // EXPOSE PUBLIC API + Field Helpers (used by Repositories)
    // =========================================================================
    return {
        // ── Core ──
        init            : init,
        getInitParams   : getInitParams,

        // ── Read ──
        getRecords      : getRecords,
        getRecordById   : getRecordById,
        getRecordCount  : getRecordCount,
        getAllRecords    : getAllRecords,

        // ── Write ──
        addRecord       : addRecord,
        updateRecord    : updateRecord,
        updateRecords   : updateRecords,
        deleteRecord    : deleteRecord,
        deleteRecords   : deleteRecords,

        // ── Field helpers (used by Repositories) ──
        helpers : {
            getString       : _getString,
            getNumber       : _getNumber,
            getInt          : _getInt,
            getLookupDisplay: _getLookupDisplay,
            getLookupId     : _getLookupId,
            normalizeLookup : _normalizeLookup,
            normalizeRecord : _normalizeRecord
        }
    };

})();