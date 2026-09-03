/* ==========================================================================
   PROMOTION.REPO.JS — Promotion Repository
   ========================================================================== */

'use strict';

var PromotionRepo = (function () {

    var F = CONSTANTS.FIELDS.PROMOTION;
    var H = SdkService.helpers;

    /**
     * Map raw SDK record → clean Promotion DTO
     *
     * DTO shape:
     * {
     *   id              : string,
     *   name            : string,
     *   code            : string,
     *   description     : string,
     *   type            : string,    // 'Percentage Discount' | 'Free Hours' | etc.
     *   discountRate    : number,    // Percentage (e.g., 15 for 15%)
     *   freeHours       : number,    // Bonus hours
     *   validFrom       : string,
     *   validTo         : string,
     *   status          : string,
     *   isActive        : boolean,
     *   isExpired       : boolean,
     *   isValidNow      : boolean    // Within date range
     * }
     */
    function _toDTO(record) {
        if (!record) return null;

        var status    = H.getString(record, F.STATUS, '');
        var isActive  = status === CONSTANTS.STATUS.PROMOTION.ACTIVE;
        var isExpired = status === CONSTANTS.STATUS.PROMOTION.EXPIRED;

        var validFrom = H.getString(record, F.VALID_FROM, '');
        var validTo   = H.getString(record, F.VALID_TO, '');

        // Check if promotion is valid right now (within date range)
        var isValidNow = isActive && _isWithinDateRange(validFrom, validTo);

        return {
            id           : H.getString(record, 'ID', ''),
            name         : H.getString(record, F.PROMOTION_NAME, ''),
            code         : H.getString(record, F.PROMOTION_CODE, '').toUpperCase(),
            description  : H.getString(record, F.DESCRIPTION, ''),
            type         : H.getString(record, F.PROMOTION_TYPE, ''),
            discountRate : H.getNumber(record, F.DISCOUNT_RATE, 0),
            freeHours    : H.getInt(record, F.NUMBER_OF_HOURS, 0),
            validFrom    : validFrom,
            validTo      : validTo,
            status       : status,
            isActive     : isActive,
            isExpired    : isExpired,
            isValidNow   : isValidNow
        };
    }

    /**
     * Check if today's date falls within the validFrom-validTo range
     */
    function _isWithinDateRange(validFrom, validTo) {
        if (!validFrom && !validTo) return true;

        var now = new Date();
        now.setHours(0, 0, 0, 0);

        if (validFrom) {
            var from = _parseDate(validFrom);
            if (from && now < from) return false;
        }

        if (validTo) {
            var to = _parseDate(validTo);
            if (to && now > to) return false;
        }

        return true;
    }

    /**
     * Parse date string like "23-Jun-2026" into Date object
     */
    function _parseDate(dateStr) {
        if (!dateStr) return null;
        var match = String(dateStr).match(/(\d{1,2})-(\w{3})-(\d{4})/);
        if (!match) return null;

        var months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,
                      Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
        var month = months[match[2]];
        if (month === undefined) return null;

        return new Date(parseInt(match[3]), month, parseInt(match[1]));
    }

    function _toDTOs(records) {
        return (records || [])
            .map(_toDTO)
            .filter(function (dto) { return dto !== null; });
    }

    // =========================================================================
    // PUBLIC METHODS
    // =========================================================================

    async function getActive() {
        Logger.debug('REPO', 'PromotionRepo.getActive');

        try {
            var records = await SdkService.getRecords({
                reportName : CONSTANTS.REPORTS.PROMOTION,
                criteria   : '(' + F.STATUS + ' == "'
                             + CONSTANTS.STATUS.PROMOTION.ACTIVE + '")',
                cacheKey   : CONSTANTS.CACHE_KEYS.PROMOTIONS,
                cacheTTL   : CONSTANTS.CACHE_TTL.LONG
            });

            var dtos = _toDTOs(records);
            Logger.info('REPO', 'PromotionRepo.getActive → ' + dtos.length + ' active');
            return dtos;

        } catch (err) {
            Logger.error('REPO', 'PromotionRepo.getActive FAILED', err);
            return [];
        }
    }

    async function getByCode(code) {
        if (!code) return null;

        var upperCode = code.trim().toUpperCase();
        Logger.debug('REPO', 'PromotionRepo.getByCode → ' + upperCode);

        try {
            // Try active promos first
            var active = await getActive();
            var found = active.find(function (p) {
                return p.code === upperCode;
            });

            if (found) {
                Logger.info('REPO', 'Promo found in active cache: ' + found.name);
                return found;
            }

            // Search all promos
            var records = await SdkService.getRecords({
                reportName : CONSTANTS.REPORTS.PROMOTION,
                criteria   : '(' + F.PROMOTION_CODE + ' == "' + upperCode + '")'
            });

            var dtos = _toDTOs(records);
            return dtos.length > 0 ? dtos[0] : null;

        } catch (err) {
            Logger.error('REPO', 'PromotionRepo.getByCode FAILED', err);
            return null;
        }
    }

    /**
     * Validate a promo code and calculate discount + bonus hours
     *
     * @param {string} code      - Promo code entered
     * @param {number} planPrice - Plan price (in selected currency)
     * @param {number} planHours - Plan hours
     * @param {string} currency  - Currently selected currency
     *
     * @returns {Object} {
     *   valid          : boolean,
     *   errorMessage   : string,
     *   promotion      : DTO,
     *   discountAmount : number,    // Currency amount discounted
     *   discountRate   : number,    // Percentage (0-100)
     *   bonusHours     : number,    // Free hours added
     *   finalPrice     : number,    // Price after discount
     *   finalHours     : number,    // Hours after bonus
     *   displayLabel   : string,
     *   type           : 'percentage' | 'freeHours' | 'other'
     * }
     */
    async function validateCode(code, planPrice, planHours, currency) {
        var result = {
            valid          : false,
            errorMessage   : '',
            promotion      : null,
            discountAmount : 0,
            discountRate   : 0,
            bonusHours     : 0,
            finalPrice     : planPrice || 0,
            finalHours     : planHours || 0,
            displayLabel   : '',
            type           : 'other'
        };

        if (!code || !code.trim()) {
            result.errorMessage = 'Please enter a promo code';
            return result;
        }

        var promo = await getByCode(code);

        if (!promo) {
            result.errorMessage = 'Invalid promo code';
            return result;
        }

        if (!promo.isActive) {
            result.errorMessage = 'This promo code is '
                + (promo.isExpired ? 'expired' : 'inactive');
            return result;
        }

        if (!promo.isValidNow) {
            result.errorMessage = 'This promo code is not valid at this time';
            return result;
        }

        var PT = CONSTANTS.PROMOTION_TYPE;
        var price = planPrice || 0;
        var hours = planHours || 0;

        // ── Process based on promotion type ──
        switch (promo.type) {

            case PT.PERCENTAGE:
                // Use Discount_Rate field for percentage
                var pct = promo.discountRate || 0;
                if (pct <= 0 || pct > 100) {
                    result.errorMessage = 'Invalid discount rate configured';
                    return result;
                }

                result.discountRate   = pct;
                result.discountAmount = Math.round((price * (pct / 100)) * 100) / 100;
                result.finalPrice     = Math.max(0, price - result.discountAmount);
                result.finalHours     = hours;
                result.type           = 'percentage';
                result.displayLabel   = pct + '% off';
                break;

            case PT.FREE_HOURS:
                // Use Number_Of_Hours field for bonus hours
                var bonus = promo.freeHours || 0;
                if (bonus <= 0) {
                    result.errorMessage = 'Invalid bonus hours configured';
                    return result;
                }

                result.bonusHours   = bonus;
                result.finalPrice   = price;  // No price change
                result.finalHours   = hours + bonus;
                result.type         = 'freeHours';
                result.displayLabel = '+' + bonus + ' free hours';
                break;

            case PT.RENEWAL_BONUS:
                var renewBonus = promo.discountRate || 5;
                result.discountRate   = renewBonus;
                result.discountAmount = Math.round((price * (renewBonus / 100)) * 100) / 100;
                result.finalPrice     = Math.max(0, price - result.discountAmount);
                result.finalHours     = hours;
                result.type           = 'percentage';
                result.displayLabel   = renewBonus + '% renewal bonus';
                break;

            case PT.NEW_CLIENT:
                var newClientBonus = promo.discountRate || 10;
                result.discountRate   = newClientBonus;
                result.discountAmount = Math.round((price * (newClientBonus / 100)) * 100) / 100;
                result.finalPrice     = Math.max(0, price - result.discountAmount);
                result.finalHours     = hours;
                result.type           = 'percentage';
                result.displayLabel   = newClientBonus + '% new client offer';
                break;

            default:
                result.errorMessage = 'Unknown promotion type';
                return result;
        }

        result.valid     = true;
        result.promotion = promo;

        Logger.info('REPO', 'Promo validated', {
            code           : code,
            type           : result.type,
            discountAmount : result.discountAmount,
            bonusHours     : result.bonusHours
        });

        return result;
    }

    return {
        getActive    : getActive,
        getByCode    : getByCode,
        validateCode : validateCode
    };

})();