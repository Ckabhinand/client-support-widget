/* ==========================================================================
   TASK.REPO.JS — Proposed Tasks Repository

   7-Status Flow:
     Draft → Pending Approval → Approved → Completed →
     Pending Completion Approval → Closed
     Rework Required = client rejected (start / working / completion review)

   Client actions:
     approve()           → Pending Approval → Approved
     reject()            → Pending Approval | Approved | Pending Completion
                           Approval → Rework Required (+ reason)
     approveCompletion() → Pending Completion Approval → Closed
     bulkApprove()       → multiple Pending Approval → Approved

   NOTE: approveCompletion() only updates STATUS. Consumed hours are
   recomputed by the waterfall in state.js (Closed tasks consume).

   PUBLIC METHODS:
     TaskRepo.getForUser(userEmail)
     TaskRepo.getByRequirement(reqId)
     TaskRepo.getByStatus(userEmail, status)
     TaskRepo.getPending(userEmail)
     TaskRepo.getInProgress(userEmail)
     TaskRepo.getCompleted(userEmail)
     TaskRepo.approve(id, userEmail)
     TaskRepo.reject(id, reason, userEmail)
     TaskRepo.approveCompletion(id, userEmail)
     TaskRepo.getSummary(userEmail)
     TaskRepo.bulkApprove(ids, userEmail)
     TaskRepo.refresh(userEmail)
   ========================================================================== */

'use strict';

var TaskRepo = (function () {

    var F = CONSTANTS.FIELDS.PROPOSED_TASKS;
    var H = SdkService.helpers;

    // =========================================================================
    // PRIVATE — DTO Mapping
    // =========================================================================

    function _toDTO(record, index) {
        if (!record) return null;

        var rawStatus      = H.getString(record, F.STATUS, '');
        var status         = _normalizeStatus(rawStatus);
        var priority       = H.getString(record, F.PRIORITY, '');
        var statusClass    = CONSTANTS.TASK_STATUS_CLASS[status]  || 'draft';
        var priorityClass  = CONSTANTS.PRIORITY_CLASS[priority]   || 'low';
        var percent        = H.getInt(record, F.PERCENT, 0);
        var estHours       = H.getInt(record, F.ESTIMATED_HOURS, 0);

        var id = H.getString(record, 'ID', '');

        var S = CONSTANTS.STATUS.TASK;

        var isDraft                       = status === S.DRAFT;
        var isPendingApproval             = status === S.PENDING_APPROVAL;
        var isApproved                    = status === S.APPROVED;
        var isCompleted                   = status === S.COMPLETED;
        var isPendingCompletionApproval   = status === S.PENDING_COMPLETION_APPROVAL;
        var isReworkRequired              = status === S.REWORK_REQUIRED;
        var isClosed                      = status === S.CLOSED;

        var displayId = id
            ? 'TASK-' + id.slice(-4).toUpperCase()
            : 'TASK-' + String(index + 1).padStart(2, '0');

        return {
            id                          : id,
            taskName                    : H.getString(record, F.TASK_NAME, ''),
            projectDisplay              : H.getLookupDisplay(record, F.PROJECT),
            projectId                   : H.getLookupId(record, F.PROJECT),
            requirementDisplay          : H.getLookupDisplay(record, F.REQUIREMENT),
            requirementId               : H.getLookupId(record, F.REQUIREMENT),
            description                 : H.getString(record, F.DESCRIPTION, ''),
            estimatedHours              : estHours,
            status                      : status,
            statusClass                 : statusClass,
            priority                    : priority,
            priorityClass               : priorityClass,
            owner                       : H.getLookupDisplay(record, F.OWNER)
                                            || H.getString(record, F.OWNER, ''),
            percent                     : Math.min(100, Math.max(0, percent)),
            rejectionReason             : H.getString(record, F.REJECTION_REASON, ''),
            isDraft                     : isDraft,
            isPendingApproval           : isPendingApproval,
            isApproved                  : isApproved,
            isCompleted                 : isCompleted,
            isPendingCompletionApproval : isPendingCompletionApproval,
            isReworkRequired            : isReworkRequired,
            isClosed                    : isClosed,
            displayId                   : displayId
        };
    }

    /**
     * Map pre-migration statuses (Not Started, In Progress, …) to their
     * equivalents in the current 7-status flow. Unknown values pass
     * through untouched so new Zoho statuses still render.
     */
    function _normalizeStatus(rawStatus) {
        if (!rawStatus) return '';
        return CONSTANTS.STATUS.TASK_LEGACY[rawStatus] || rawStatus;
    }

    function _toDTOs(records) {
        return (records || [])
            .map(function (record, index) { return _toDTO(record, index); })
            .filter(function (dto) { return dto !== null; });
    }

    // =========================================================================
    // PRIVATE — Cache Key
    // =========================================================================

    function _cacheKey(userEmail) {
        return CONSTANTS.CACHE_KEYS.USER_TASKS + '_' + userEmail;
    }

    // =========================================================================
    // PRIVATE — Hours Consumption Chain
    // =========================================================================

    // =========================================================================
    // PUBLIC — Read Methods
    // =========================================================================

    async function getForUser(userEmail) {
        if (!userEmail) {
            Logger.warn('REPO', 'TaskRepo.getForUser → empty email');
            return [];
        }

        Logger.debug('REPO', 'TaskRepo.getForUser → ' + userEmail);

        var cached = CacheService.get(_cacheKey(userEmail));
        if (cached !== null) {
            Logger.debug('REPO', 'TaskRepo.getForUser CACHE HIT → ' + cached.length + ' tasks');
            return cached;
        }

        try {
            var requirements = await RequirementRepo.getForUser(userEmail);

            if (!requirements || requirements.length === 0) {
                Logger.info('REPO', 'TaskRepo.getForUser → no requirements, returning []');
                return [];
            }

            Logger.debug('REPO', 'TaskRepo.getForUser → ' + requirements.length + ' requirement(s)');

            var allTasks = [];

            for (var i = 0; i < requirements.length; i++) {
                var reqId = requirements[i].id;
                if (!reqId) continue;

                var tasks = await getByRequirement(reqId);
                allTasks = allTasks.concat(tasks);
            }

            var seen        = {};
            var uniqueTasks = allTasks.filter(function (task) {
                if (!task.id || seen[task.id]) return false;
                seen[task.id] = true;
                return true;
            });

            Logger.info('REPO', 'TaskRepo.getForUser → ' + uniqueTasks.length + ' unique tasks');

            CacheService.set(_cacheKey(userEmail), uniqueTasks, CONSTANTS.CACHE_TTL.SHORT);

            return uniqueTasks;

        } catch (err) {
            Logger.error('REPO', 'TaskRepo.getForUser FAILED', err);
            return [];
        }
    }

    async function getByRequirement(requirementId) {
        if (!requirementId) return [];

        Logger.debug('REPO', 'TaskRepo.getByRequirement → ' + requirementId);

        try {
            var records = await SdkService.getRecords({
                reportName : CONSTANTS.REPORTS.PROPOSED_TASKS,
                criteria   : '(' + F.REQUIREMENT + ' == ' + requirementId + ')',
                cacheTTL   : CONSTANTS.CACHE_TTL.SHORT
            });

            return _toDTOs(records);

        } catch (err) {
            Logger.error('REPO', 'TaskRepo.getByRequirement FAILED', err);
            return [];
        }
    }

    async function getByStatus(userEmail, status) {
        var all = await getForUser(userEmail);
        return all.filter(function (t) { return t.status === status; });
    }

    async function getPending(userEmail) {
        // Client action needed: start approval + completion approval
        var S = CONSTANTS.STATUS.TASK;
        var all = await getForUser(userEmail);
        return all.filter(function (t) {
            return t.status === S.PENDING_APPROVAL
                || t.status === S.PENDING_COMPLETION_APPROVAL;
        });
    }

    async function getInProgress(userEmail) {
        // Team-side: drafted, working, done (awaiting completion review), rework
        var S = CONSTANTS.STATUS.TASK;
        var all = await getForUser(userEmail);
        return all.filter(function (t) {
            return t.status === S.DRAFT
                || t.status === S.APPROVED
                || t.status === S.COMPLETED
                || t.status === S.REWORK_REQUIRED;
        });
    }

    async function getCompleted(userEmail) {
        return getByStatus(userEmail, CONSTANTS.STATUS.TASK.CLOSED);
    }

    async function getSummary(userEmail) {
        var all = await getForUser(userEmail);
        var S   = CONSTANTS.STATUS.TASK;

        var summary = {
            total                      : all.length,
            draft                      : 0,
            pendingApproval            : 0,
            approved                   : 0,
            teamCompleted              : 0,   // "Completed" = team done, awaiting client sign-off
            pendingCompletionApproval  : 0,
            reworkRequired             : 0,
            closed                     : 0,
            totalHours                 : 0,
            // Aggregated aliases for the UI
            pending                    : 0,   // client action needed (PA + PCA)
            inProgress                 : 0,   // team-side, not closed
            completed                  : 0    // fully done (= Closed)
        };

        all.forEach(function (task) {
            summary.totalHours += task.estimatedHours || 0;
            switch (task.status) {
                case S.DRAFT:
                    summary.draft++;         summary.inProgress++; break;
                case S.PENDING_APPROVAL:
                    summary.pendingApproval++; summary.pending++; break;
                case S.APPROVED:
                    summary.approved++;      summary.inProgress++; break;
                case S.COMPLETED:
                    summary.teamCompleted++; summary.inProgress++; break;
                case S.PENDING_COMPLETION_APPROVAL:
                    summary.pendingCompletionApproval++; summary.pending++; break;
                case S.REWORK_REQUIRED:
                    summary.reworkRequired++; summary.inProgress++; break;
                case S.CLOSED:
                    summary.closed++;        summary.completed++; break;
            }
        });

        return summary;
    }

    // =========================================================================
    // PUBLIC — Write Methods
    // =========================================================================

    /**
     * Level 1 — Client approves task to start.
     * Pending Approval → Approved
     */
    async function approve(id, userEmail) {
        Logger.debug('REPO', 'TaskRepo.approve → ' + id);

        try {
            await SdkService.updateRecord({
                reportName      : CONSTANTS.REPORTS.PROPOSED_TASKS,
                id              : id,
                data            : {
                    [F.STATUS]           : CONSTANTS.STATUS.TASK.APPROVED,
                    [F.REJECTION_REASON] : ''
                },
                invalidateCache : [
                    _cacheKey(userEmail),
                    CONSTANTS.CACHE_KEYS.DASHBOARD_STATS,
                    CONSTANTS.CACHE_KEYS.USER_TASKS
                ]
            });

            Logger.info('REPO', 'TaskRepo.approve ✅ → ' + id);

        } catch (err) {
            Logger.error('REPO', 'TaskRepo.approve FAILED → ' + id, err);
            throw err;
        }
    }

    /**
     * Client requests rework with reason.
     * Can be called from Pending Approval, Approved, or Pending
     * Completion Approval. → Rework Required
     */
    async function reject(id, reason, userEmail) {
        Logger.debug('REPO', 'TaskRepo.reject → ' + id);

        if (!reason || !reason.trim()) {
            throw new Error('Rework reason is required');
        }

        try {
            await SdkService.updateRecord({
                reportName      : CONSTANTS.REPORTS.PROPOSED_TASKS,
                id              : id,
                data            : {
                    [F.STATUS]           : CONSTANTS.STATUS.TASK.REWORK_REQUIRED,
                    [F.REJECTION_REASON] : reason.trim()
                },
                invalidateCache : [
                    _cacheKey(userEmail),
                    CONSTANTS.CACHE_KEYS.DASHBOARD_STATS,
                    CONSTANTS.CACHE_KEYS.USER_TASKS
                ]
            });

            Logger.info('REPO', 'TaskRepo.reject ✅ → ' + id);

        } catch (err) {
            Logger.error('REPO', 'TaskRepo.reject FAILED → ' + id, err);
            throw err;
        }
    }

    /**
     * Level 2 — Client approves task completion.
     * Pending Completion Approval → Closed
     *
     * NOTE: This only updates the task STATUS. Consumed hours are NOT
     * incremented here — the state layer recomputes them via the
     * waterfall (Closed tasks fill the client's purchased packages
     * oldest-first) and writes the per-contract Consumed_Hours back to
     * Zoho. See state.js → _reconcileConsumedHours().
     */
    async function approveCompletion(id, userEmail) {
        Logger.debug('REPO', 'TaskRepo.approveCompletion → ' + id);

        try {
            await SdkService.updateRecord({
                reportName      : CONSTANTS.REPORTS.PROPOSED_TASKS,
                id              : id,
                data            : {
                    [F.STATUS]           : CONSTANTS.STATUS.TASK.CLOSED,
                    [F.REJECTION_REASON] : ''
                },
                invalidateCache : [
                    _cacheKey(userEmail),
                    CONSTANTS.CACHE_KEYS.DASHBOARD_STATS,
                    CONSTANTS.CACHE_KEYS.USER_TASKS
                ]
            });

            Logger.info('REPO', 'TaskRepo.approveCompletion ✅ → ' + id);

        } catch (err) {
            Logger.error('REPO', 'TaskRepo.approveCompletion FAILED → ' + id, err);
            throw err;
        }
    }

    /**
     * Bulk approve — multiple Pending Approval → Approved
     */
    async function bulkApprove(ids, userEmail) {
        if (!ids || ids.length === 0) return { success: 0, failed: 0 };

        Logger.debug('REPO', 'TaskRepo.bulkApprove → ' + ids.length + ' tasks');

        var results = { success: 0, failed: 0 };

        for (var i = 0; i < ids.length; i++) {
            try {
                await SdkService.updateRecord({
                    reportName : CONSTANTS.REPORTS.PROPOSED_TASKS,
                    id         : ids[i],
                    data       : {
                        [F.STATUS]: CONSTANTS.STATUS.TASK.APPROVED
                    }
                });
                results.success++;
            } catch (err) {
                Logger.error('REPO', 'TaskRepo.bulkApprove FAILED for: ' + ids[i], err);
                results.failed++;
            }
        }

        CacheService.invalidate(_cacheKey(userEmail));
        CacheService.invalidate(CONSTANTS.CACHE_KEYS.DASHBOARD_STATS);
        CacheService.invalidate(CONSTANTS.CACHE_KEYS.USER_TASKS);

        Logger.info('REPO', 'TaskRepo.bulkApprove → ' + results.success + ' approved, ' + results.failed + ' failed');

        return results;
    }

    async function refresh(userEmail) {
        Logger.info('REPO', 'TaskRepo.refresh → clearing cache');
        CacheService.invalidate(_cacheKey(userEmail));
        CacheService.invalidate(CONSTANTS.CACHE_KEYS.USER_TASKS);
        return getForUser(userEmail);
    }

    // =========================================================================
    // EXPOSE PUBLIC API
    // =========================================================================
    return {
        getForUser        : getForUser,
        getByRequirement  : getByRequirement,
        getByStatus       : getByStatus,
        getPending        : getPending,
        getInProgress     : getInProgress,
        getCompleted      : getCompleted,
        getSummary        : getSummary,
        approve           : approve,
        reject            : reject,
        approveCompletion : approveCompletion,
        bulkApprove       : bulkApprove,
        refresh           : refresh
    };

})();