/* ==========================================================================
   TASK.REPO.JS — Proposed Tasks Repository

   Simplified 6-Status Flow:
     Not Started → Start Approval → In Progress → Completed → Completion Approved
     Any actionable status → Task Rejected (with reason)

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

        var status        = H.getString(record, F.STATUS, '');
        var priority      = H.getString(record, F.PRIORITY, '');
        var statusClass   = CONSTANTS.TASK_STATUS_CLASS[status]  || 'not-started';
        var priorityClass = CONSTANTS.PRIORITY_CLASS[priority]   || 'low';
        var percent       = H.getInt(record, F.PERCENT, 0);
        var estHours      = H.getInt(record, F.ESTIMATED_HOURS, 0);

        var id = H.getString(record, 'ID', '');

        var S = CONSTANTS.STATUS.TASK;

        var isNotStarted         = status === S.NOT_STARTED;
        var isStartApproval      = status === S.START_APPROVAL;
        var isInProgress         = status === S.IN_PROGRESS;
        var isCompleted          = status === S.COMPLETED;
        var isCompletionApproved = status === S.COMPLETION_APPROVED;
        var isRejected           = status === S.TASK_REJECTED;

        var displayId = id
            ? 'TASK-' + id.slice(-4).toUpperCase()
            : 'TASK-' + String(index + 1).padStart(2, '0');

        return {
            id                    : id,
            taskName              : H.getString(record, F.TASK_NAME, ''),
            projectDisplay        : H.getLookupDisplay(record, F.PROJECT),
            projectId             : H.getLookupId(record, F.PROJECT),
            requirementDisplay    : H.getLookupDisplay(record, F.REQUIREMENT),
            requirementId         : H.getLookupId(record, F.REQUIREMENT),
            description           : H.getString(record, F.DESCRIPTION, ''),
            estimatedHours        : estHours,
            status                : status,
            statusClass           : statusClass,
            priority              : priority,
            priorityClass         : priorityClass,
            owner                 : H.getLookupDisplay(record, F.OWNER)
                                    || H.getString(record, F.OWNER, ''),
            percent               : Math.min(100, Math.max(0, percent)),
            rejectionReason       : H.getString(record, F.REJECTION_REASON, ''),
            isNotStarted          : isNotStarted,
            isStartApproval       : isStartApproval,
            isInProgress          : isInProgress,
            isCompleted           : isCompleted,
            isCompletionApproved  : isCompletionApproved,
            isRejected            : isRejected,
            displayId             : displayId
        };
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

    /**
     * Resolve Support Contract ID through the chain:
     * Task → Requirement → Support Contract
     */
    async function _resolveContractId(taskId, userEmail) {
        if (!taskId) return null;

        try {
            var userTasks = await getForUser(userEmail);
            var task = userTasks.find(function (t) { return t.id === taskId; });

            if (!task) {
                Logger.warn('REPO', '_resolveContractId → task not found: ' + taskId);
                return null;
            }

            if (!task.requirementId) {
                Logger.warn('REPO', '_resolveContractId → no requirementId on task: ' + taskId);
                return null;
            }

            var requirement = await RequirementRepo.getById(task.requirementId);

            if (!requirement) {
                Logger.warn('REPO', '_resolveContractId → requirement not found: ' + task.requirementId);
                return null;
            }

            if (!requirement.contractId) {
                Logger.warn('REPO', '_resolveContractId → no contractId on requirement: ' + task.requirementId);
                return null;
            }

            Logger.debug('REPO', '_resolveContractId ✅ → contractId: ' + requirement.contractId);
            return requirement.contractId;

        } catch (err) {
            Logger.error('REPO', '_resolveContractId FAILED → ' + taskId, err);
            return null;
        }
    }

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
        return getByStatus(userEmail, CONSTANTS.STATUS.TASK.NOT_STARTED);
    }

    async function getInProgress(userEmail) {
        return getByStatus(userEmail, CONSTANTS.STATUS.TASK.IN_PROGRESS);
    }

    async function getCompleted(userEmail) {
        var all = await getForUser(userEmail);
        return all.filter(function (t) {
            return t.status === CONSTANTS.STATUS.TASK.COMPLETED
                || t.status === CONSTANTS.STATUS.TASK.COMPLETION_APPROVED;
        });
    }

    async function getSummary(userEmail) {
        var all = await getForUser(userEmail);
        var S   = CONSTANTS.STATUS.TASK;

        var summary = {
            total              : all.length,
            notStarted         : 0,
            startApproval      : 0,
            inProgress         : 0,
            completed          : 0,
            completionApproved : 0,
            rejected           : 0,
            totalHours         : 0
        };

        all.forEach(function (task) {
            summary.totalHours += task.estimatedHours || 0;
            switch (task.status) {
                case S.NOT_STARTED         : summary.notStarted++;         break;
                case S.START_APPROVAL      : summary.startApproval++;      break;
                case S.IN_PROGRESS         : summary.inProgress++;         break;
                case S.COMPLETED           : summary.completed++;          break;
                case S.COMPLETION_APPROVED : summary.completionApproved++; break;
                case S.TASK_REJECTED       : summary.rejected++;           break;
            }
        });

        return summary;
    }

    // =========================================================================
    // PUBLIC — Write Methods
    // =========================================================================

    /**
     * Level 1 — Client approves task to start.
     * Not Started → Start Approval
     */
    async function approve(id, userEmail) {
        Logger.debug('REPO', 'TaskRepo.approve → ' + id);

        try {
            await SdkService.updateRecord({
                reportName      : CONSTANTS.REPORTS.PROPOSED_TASKS,
                id              : id,
                data            : {
                    [F.STATUS]           : CONSTANTS.STATUS.TASK.START_APPROVAL,
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
     * Reject a task with reason.
     * Can be called from Not Started, In Progress, or Completed.
     * Any → Task Rejected
     */
    async function reject(id, reason, userEmail) {
        Logger.debug('REPO', 'TaskRepo.reject → ' + id);

        if (!reason || !reason.trim()) {
            throw new Error('Rejection reason is required');
        }

        try {
            await SdkService.updateRecord({
                reportName      : CONSTANTS.REPORTS.PROPOSED_TASKS,
                id              : id,
                data            : {
                    [F.STATUS]           : CONSTANTS.STATUS.TASK.TASK_REJECTED,
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
     * Completed → Completion Approved
     * AND consumes estimated hours from support contract.
     */
    async function approveCompletion(id, userEmail) {
        Logger.debug('REPO', 'TaskRepo.approveCompletion → ' + id);

        try {
            // ── Step 1: Get task to read estimatedHours ──
            var userTasks = await getForUser(userEmail);
            var task = userTasks.find(function (t) { return t.id === id; });

            if (!task) {
                throw new Error('Task not found: ' + id);
            }

            var estimatedHours = task.estimatedHours || 0;

            Logger.info('REPO', 'TaskRepo.approveCompletion → hours: ' + estimatedHours);

            // ── Step 2: Resolve contract ID ──
            var contractId = await _resolveContractId(id, userEmail);

            if (!contractId) {
                Logger.warn('REPO', 'TaskRepo.approveCompletion → contract not resolved, skipping hours update');
            } else {
                // ── Step 3: Consume hours ──
                await ContractRepo.incrementConsumedHours(contractId, estimatedHours);
                Logger.info('REPO', 'TaskRepo.approveCompletion → ' + estimatedHours + ' hours consumed');
            }

            // ── Step 4: Update task status ──
            await SdkService.updateRecord({
                reportName      : CONSTANTS.REPORTS.PROPOSED_TASKS,
                id              : id,
                data            : {
                    [F.STATUS]           : CONSTANTS.STATUS.TASK.COMPLETION_APPROVED,
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
     * Bulk approve — Not Started → Start Approval
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
                        [F.STATUS]: CONSTANTS.STATUS.TASK.START_APPROVAL
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