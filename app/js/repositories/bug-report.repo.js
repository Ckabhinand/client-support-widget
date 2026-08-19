/* ==========================================================================
   BUG-REPORT.REPO.JS — Bug Report Repository

   Owns all data access for the Bug_Report form/report.

   PUBLIC METHODS:
     BugReportRepo.getForUser(userEmail)
     BugReportRepo.create(data, userEmail)
     BugReportRepo.refresh(userEmail)
   ========================================================================== */

'use strict';

var BugReportRepo = (function () {

    var F = CONSTANTS.FIELDS.BUG_REPORT;
    var H = SdkService.helpers;

    function _cacheKey(userEmail) {
        return CONSTANTS.CACHE_KEYS.USER_BUG_REPORTS + '_' + userEmail;
    }

    /**
     * Map raw SDK record → Bug Report DTO
     *
     * DTO shape:
     * {
     *   id              : string,
     *   displayId       : string,
     *   contractId      : string,
     *   contractDisplay : string,
     *   projectId       : string,
     *   projectDisplay  : string,
     *   clientId        : string,
     *   clientDisplay   : string,
     *   description     : string
     * }
     */
    function _toDTO(record, index) {
        if (!record) return null;

        var id = H.getString(record, 'ID', '');

        return {
            id              : id,
            displayId       : id
                ? 'BUG-' + id.slice(-4).toUpperCase()
                : 'BUG-' + String(index + 1).padStart(3, '0'),
            contractId      : H.getLookupId(record, F.SUPPORT_CONTRACT),
            contractDisplay : H.getLookupDisplay(record, F.SUPPORT_CONTRACT),
            projectId       : H.getLookupId(record, F.PROJECT),
            projectDisplay  : H.getLookupDisplay(record, F.PROJECT),
            clientId        : H.getLookupId(record, F.CLIENT),
            clientDisplay   : H.getLookupDisplay(record, F.CLIENT),
            description     : H.getString(record, F.BUG_DESCRIPTION, '')
        };
    }

    function _toDTOs(records) {
        return (records || [])
            .map(function (record, index) { return _toDTO(record, index); })
            .filter(function (dto) { return dto !== null; });
    }

    async function getForUser(userEmail) {
        if (!userEmail) {
            Logger.warn('REPO', 'BugReportRepo.getForUser → empty email');
            return [];
        }

        Logger.debug('REPO', 'BugReportRepo.getForUser → ' + userEmail);

        var cached = CacheService.get(_cacheKey(userEmail));
        if (cached !== null) {
            Logger.debug('REPO', 'BugReportRepo.getForUser CACHE HIT → '
                + cached.length + ' reports');
            return cached;
        }

        try {
            var activeContracts = await ContractRepo.getActive(userEmail);

            if (!activeContracts || activeContracts.length === 0) {
                Logger.info('REPO',
                    'BugReportRepo.getForUser → no active contracts');
                return [];
            }

            var allReports = [];

            for (var i = 0; i < activeContracts.length; i++) {
                var contractId = activeContracts[i].id;
                if (!contractId) continue;

                try {
                    var records = await SdkService.getRecords({
                        reportName : CONSTANTS.REPORTS.BUG_REPORT,
                        criteria   : '(' + F.SUPPORT_CONTRACT + ' == ' + contractId + ')',
                        cacheTTL   : CONSTANTS.CACHE_TTL.SHORT
                    });

                    allReports = allReports.concat(_toDTOs(records));

                } catch (err) {
                    Logger.warn('REPO',
                        'BugReportRepo.getForUser → failed for contract: '
                        + contractId, err);
                }
            }

            var seen = {};
            var unique = allReports.filter(function (item) {
                if (!item.id || seen[item.id]) return false;
                seen[item.id] = true;
                return true;
            });

            Logger.info('REPO', 'BugReportRepo.getForUser → '
                + unique.length + ' unique reports');

            CacheService.set(_cacheKey(userEmail), unique, CONSTANTS.CACHE_TTL.SHORT);

            return unique;

        } catch (err) {
            Logger.error('REPO', 'BugReportRepo.getForUser FAILED', err);
            return [];
        }
    }

    async function create(data, userEmail) {
        Logger.debug('REPO', 'BugReportRepo.create', data);

        try {
            var newId = await SdkService.addRecord({
                formName        : CONSTANTS.FORMS.BUG_REPORT,
                data            : data,
                invalidateCache : [
                    _cacheKey(userEmail),
                    CONSTANTS.CACHE_KEYS.USER_BUG_REPORTS
                ]
            });

            Logger.info('REPO', 'BugReportRepo.create ✅ → ID: ' + newId);
            return newId;

        } catch (err) {
            Logger.error('REPO', 'BugReportRepo.create FAILED', err);
            throw err;
        }
    }

    async function refresh(userEmail) {
        Logger.info('REPO', 'BugReportRepo.refresh → clearing cache');
        CacheService.invalidate(_cacheKey(userEmail));
        CacheService.invalidatePattern('bug_report');
        return getForUser(userEmail);
    }

    return {
        getForUser : getForUser,
        create     : create,
        refresh    : refresh
    };

})();