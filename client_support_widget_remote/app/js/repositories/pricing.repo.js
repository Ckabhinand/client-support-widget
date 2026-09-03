/* ==========================================================================
   PRICING.REPO.JS — Pricing Repository
   
   Owns all data access for the Pricing form/report.
   Pricing data is stable — cached with LONG TTL (15 min).
   
   PUBLIC METHODS:
     PricingRepo.getAll()              → All pricing plan DTOs
     PricingRepo.getByCurrency(curr)   → Plans for specific currency
     PricingRepo.getById(id)           → Single plan DTO
   ========================================================================== */

'use strict';

var PricingRepo = (function () {

    var F  = CONSTANTS.FIELDS.PRICING;
    var H  = SdkService.helpers;

    // =========================================================================
    // PRIVATE — DTO Mapping
    // =========================================================================

    /**
     * Map raw SDK record → clean Pricing DTO
     *
     * Pricing DTO shape:
     * {
     *   id           : string,
     *   title        : string,
     *   supportHours : number,
     *   currency     : string,
     *   price        : number,
     *   pricePerHour : number,   // Computed: price / supportHours
     *   planKey      : string    // lowercase title for matching
     * }
     */
    function _toDTO(record) {
        if (!record) return null;

        var hours    = H.getInt(record, F.SUPPORT_HOURS, 0);
        var price    = H.getNumber(record, F.PRICE, 0);
        var perHour  = hours > 0
            ? Math.round((price / hours) * 100) / 100
            : 0;

        var title = H.getString(record, F.TITLE, '');

        return {
            id           : H.getString(record, 'ID', ''),
            title        : title,
            supportHours : hours,
            currency     : H.getString(record, F.CURRENCY, 'USD'),
            price        : price,
            pricePerHour : perHour,
            planKey      : title.toLowerCase().replace(/\s+/g, '_')
        };
    }

    function _toDTOs(records) {
        return (records || [])
            .map(_toDTO)
            .filter(function (dto) { return dto !== null; });
    }

    // =========================================================================
    // PUBLIC METHODS
    // =========================================================================

    /**
     * Get all pricing plans
     * Cached with LONG TTL — pricing rarely changes
     *
     * @returns {Promise<Array>} Pricing DTOs
     */
    async function getAll() {
        Logger.debug('REPO', 'PricingRepo.getAll');

        try {
            var records = await SdkService.getRecords({
                reportName : CONSTANTS.REPORTS.PRICING,
                cacheKey   : CONSTANTS.CACHE_KEYS.PRICING_PLANS,
                cacheTTL   : CONSTANTS.CACHE_TTL.LONG
            });

            var dtos = _toDTOs(records);
            Logger.info('REPO', 'PricingRepo.getAll → ' + dtos.length + ' plans');
            return dtos;

        } catch (err) {
            Logger.error('REPO', 'PricingRepo.getAll FAILED', err);
            return [];
        }
    }

    /**
     * Get pricing plans filtered by currency
     *
     * @param {string} currency - 'USD' | 'INR' | 'EUR'
     * @returns {Promise<Array>} Pricing DTOs for currency
     */
    async function getByCurrency(currency) {
        var all = await getAll();
        return all.filter(function (p) {
            return p.currency === currency;
        });
    }

    /**
     * Get single pricing plan by ID
     *
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async function getById(id) {
        if (!id) return null;

        var all = await getAll();
        return all.find(function (p) { return p.id === id; }) || null;
    }

    // =========================================================================
    // EXPOSE PUBLIC API
    // =========================================================================
    return {
        getAll       : getAll,
        getByCurrency: getByCurrency,
        getById      : getById
    };

})();