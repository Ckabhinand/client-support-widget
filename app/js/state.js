/* ==========================================================================
   STATE.JS — Application State Management

   7-Status Task Flow:
     Draft → Pending Approval → Approved → Completed →
     Pending Completion Approval → Closed
     Rework Required = client rejected (start / working / completion review)

   ACTIONS:
     'APPROVE_TASK'            → Pending Approval → Approved
     'REJECT_TASK'             → Pending Approval | Approved | Pending
                                 Completion Approval → Rework Required (+ reason)
     'APPROVE_COMPLETION'      → Pending Completion Approval → Closed
                                 (waterfall then consumes Closed task hours)
     'BULK_APPROVE_TASKS'      → Multiple Pending Approval → Approved
     'CREATE_REQUIREMENT'
     'REFRESH_CONTRACTS'
     'REFRESH_REQUIREMENTS'
     'REFRESH_TASKS'
     'SWITCH_CURRENCY'
     'SWITCH_CONTRACT_TYPE'
     'OPEN_REQUIREMENT_DETAIL'
     'CLOSE_REQUIREMENT_DETAIL'

   EVENTS:
     'task:approved'           → Task start approved
     'task:rejected'           → Task rejected
     'task:completionApproved' → Completion approved, hours consumed
     'tasks:loaded'
     'contracts:loaded'
     'requirements:loaded'
     'pricing:loaded'
     'hours:updated'
     'requirement:created'
     'state:ready'
     'state:error'
     'page:loading'
     'page:ready'
   ========================================================================== */

'use strict';

var AppState = (function () {

    // =========================================================================
    // PRIVATE — State Store
    // =========================================================================

    var _state = {

        user: {
            email      : '',
            name       : '',
            scope      : '',
            appName    : '',
            brandColor : '#2563EB'
        },

        ui: {
            currentPage           : CONSTANTS.PAGES.DASHBOARD,
            currentTaskTab        : CONSTANTS.TASK_TABS.ALL,
            currentCurrency       : CONSTANTS.CURRENCY.USD,
            currentContractType   : CONSTANTS.STATUS.CONTRACT_TYPE.SUPPORT,
            isLoading             : false,
            selectedTaskIds       : [],
            selectedPlanId        : null,
            filterByRequirementId : null
        },

        contracts: {
            list         : [],
            active       : [],
            hoursSummary : {
                totalPurchased : 0,
                totalConsumed  : 0,
                totalRemaining : 0,
                usagePercent   : 0,
                activeCount    : 0,
                contracts      : [],
                support        : {
                    totalPurchased : 0, totalConsumed : 0,
                    totalRemaining : 0, usagePercent   : 0,
                    activeCount    : 0, contracts      : []
                },
                implementation : {
                    totalPurchased : 0, totalConsumed : 0,
                    totalRemaining : 0, usagePercent   : 0,
                    activeCount    : 0, contracts      : []
                }
            },
            loaded : false
        },

        requirements: {
            list   : [],
            active : [],
            loaded : false
        },

        tasks: {
            list       : [],
            pending    : [],
            inProgress : [],
            completed  : [],
            summary    : {
                total              : 0,
                notStarted         : 0,
                startApproval      : 0,
                inProgress         : 0,
                completed          : 0,
                completionApproved : 0,
                rejected           : 0,
                totalHours         : 0
            },
            loaded : false
        },

        pricing: {
            plans  : [],
            byId   : {},
            loaded : false
        },

        detailPanel: {
            isOpen        : false,
            requirementId : null,
            requirement   : null,
            tasks         : []
        },

        timeline: {
            projects     : [],
            currentIndex : 0
        }
    };

    // =========================================================================
    // PRIVATE — Event System
    // =========================================================================

    var _listeners = {};

    function _emit(event, data) {
        Logger.debug('STATE', 'emit → ' + event, data);
        var callbacks = _listeners[event] || [];
        callbacks.forEach(function (cb) {
            try { cb(data); }
            catch (err) { Logger.error('STATE', 'Event listener error: ' + event, err); }
        });
    }

    // =========================================================================
    // PRIVATE — State Helpers
    // =========================================================================

    function _merge(key, update) {
        if (!_state[key]) {
            Logger.warn('STATE', '_merge: unknown key → ' + key);
            return;
        }
        Object.assign(_state[key], update);
    }

    /**
     * Derive task sub-lists:
     * Pending   = Pending Approval + Pending Completion Approval (client action)
     * Progress  = Draft + Approved + Completed + Rework Required (team side)
     * Completed = Closed (fully done)
     */
    function _deriveTaskLists() {
        var S   = CONSTANTS.STATUS.TASK;
        var all = _state.tasks.list;

        _state.tasks.pending = all.filter(function (t) {
            return (
                t.status === S.PENDING_APPROVAL ||
                t.status === S.PENDING_COMPLETION_APPROVAL
            );
        });

        _state.tasks.inProgress = all.filter(function (t) {
            return (
                t.status === S.DRAFT ||
                t.status === S.APPROVED ||
                t.status === S.COMPLETED ||
                t.status === S.REWORK_REQUIRED
            );
        });

        _state.tasks.completed = all.filter(function (t) {
            return t.status === S.CLOSED;
        });
    }

    function _recalcTaskSummary() {
        var S   = CONSTANTS.STATUS.TASK;
        var all = _state.tasks.list;

        var summary = {
            total                     : all.length,
            draft                     : 0,
            pendingApproval           : 0,
            approved                  : 0,
            teamCompleted             : 0,   // "Completed" = team done, awaiting client sign-off
            pendingCompletionApproval : 0,
            reworkRequired            : 0,
            closed                    : 0,
            totalHours                : 0,
            // Aggregated aliases for the UI
            pending                   : 0,   // client action needed (PA + PCA)
            inProgress                : 0,   // team-side, not closed
            completed                 : 0    // fully done (= Closed)
        };

        all.forEach(function (t) {
            summary.totalHours += t.estimatedHours || 0;
            switch (t.status) {
                case S.DRAFT:
                    summary.draft++;
                    summary.inProgress++;
                    break;
                case S.PENDING_APPROVAL:
                    summary.pendingApproval++;
                    summary.pending++;
                    break;
                case S.APPROVED:
                    summary.approved++;
                    summary.inProgress++;
                    break;
                case S.COMPLETED:
                    summary.teamCompleted++;
                    summary.inProgress++;
                    break;
                case S.PENDING_COMPLETION_APPROVAL:
                    summary.pendingCompletionApproval++;
                    summary.pending++;
                    break;
                case S.REWORK_REQUIRED:
                    summary.reworkRequired++;
                    summary.inProgress++;
                    break;
                case S.CLOSED:
                    summary.closed++;
                    summary.completed++;
                    break;
            }
        });

        _state.tasks.summary = summary;
    }

    function _updateTaskInList(taskId, updates) {
        var S = CONSTANTS.STATUS.TASK;

        var index = _state.tasks.list.findIndex(function (t) {
            return t.id === taskId;
        });

        if (index === -1) {
            Logger.warn('STATE', '_updateTaskInList: not found → ' + taskId);
            return;
        }

        Object.assign(_state.tasks.list[index], updates);

        var task   = _state.tasks.list[index];
        var status = task.status;

        task.isDraft                     = status === S.DRAFT;
        task.isPendingApproval           = status === S.PENDING_APPROVAL;
        task.isApproved                  = status === S.APPROVED;
        task.isCompleted                 = status === S.COMPLETED;
        task.isPendingCompletionApproval = status === S.PENDING_COMPLETION_APPROVAL;
        task.isReworkRequired            = status === S.REWORK_REQUIRED;
        task.isClosed                    = status === S.CLOSED;
        task.statusClass                 = CONSTANTS.TASK_STATUS_CLASS[status] || 'draft';

        _deriveTaskLists();
        _recalcTaskSummary();
    }

    // =========================================================================
    // PRIVATE — Loading
    // =========================================================================

    function _setLoading(isLoading, context) {
        _state.ui.isLoading = isLoading;
        _emit(isLoading ? 'page:loading' : 'page:ready', { context: context });
    }

    // =========================================================================
    // PRIVATE — Action Handlers
    // =========================================================================

    /**
     * APPROVE_TASK — Pending Approval → Approved
     */
    async function _handleApproveTask(payload) {
        var taskId    = payload.taskId;
        var userEmail = _state.user.email;

        if (!taskId) { Logger.warn('STATE', 'APPROVE_TASK: missing taskId'); return; }

        Logger.info('STATE', 'ACTION: APPROVE_TASK → ' + taskId);

        try {
            await TaskRepo.approve(taskId, userEmail);

            _updateTaskInList(taskId, {
                status          : CONSTANTS.STATUS.TASK.APPROVED,
                rejectionReason : ''
            });

            _emit('task:approved', { taskId: taskId });
            _emit('tasks:loaded', _state.tasks);

        } catch (err) {
            Logger.error('STATE', 'APPROVE_TASK FAILED → ' + taskId, err);
            _emit('state:error', { action: 'APPROVE_TASK', error: err });
            throw err;
        }
    }

    /**
     * REJECT_TASK — Pending Approval | Approved | Pending Completion
     * Approval → Rework Required (with reason)
     */
    async function _handleRejectTask(payload) {
        var taskId    = payload.taskId;
        var reason    = payload.reason || '';
        var userEmail = _state.user.email;

        if (!taskId)       { Logger.warn('STATE', 'REJECT_TASK: missing taskId'); return; }
        if (!reason.trim()) { Logger.warn('STATE', 'REJECT_TASK: missing reason'); return; }

        Logger.info('STATE', 'ACTION: REJECT_TASK → ' + taskId);

        try {
            await TaskRepo.reject(taskId, reason, userEmail);

            _updateTaskInList(taskId, {
                status          : CONSTANTS.STATUS.TASK.REWORK_REQUIRED,
                rejectionReason : reason
            });

            _emit('task:rejected', { taskId: taskId, reason: reason });
            _emit('tasks:loaded', _state.tasks);

        } catch (err) {
            Logger.error('STATE', 'REJECT_TASK FAILED → ' + taskId, err);
            _emit('state:error', { action: 'REJECT_TASK', error: err });
            throw err;
        }
    }

    /**
     * APPROVE_COMPLETION — Pending Completion Approval → Closed
     * (the waterfall then consumes Closed task hours)
     */
    async function _handleApproveCompletion(payload) {
        var taskId    = payload.taskId;
        var userEmail = _state.user.email;

        if (!taskId) { Logger.warn('STATE', 'APPROVE_COMPLETION: missing taskId'); return; }

        Logger.info('STATE', 'ACTION: APPROVE_COMPLETION → ' + taskId);

        try {
            await TaskRepo.approveCompletion(taskId, userEmail);

            _updateTaskInList(taskId, {
                status          : CONSTANTS.STATUS.TASK.CLOSED,
                rejectionReason : ''
            });

            // Refresh stored contract values, then recompute the consumed
            // hours waterfall (this task's hours now count as consumed).
            await _handleRefreshContracts();
            await _reconcileConsumedHours();

            _emit('task:completionApproved', { taskId: taskId });
            _emit('tasks:loaded', _state.tasks);

        } catch (err) {
            Logger.error('STATE', 'APPROVE_COMPLETION FAILED → ' + taskId, err);
            _emit('state:error', { action: 'APPROVE_COMPLETION', error: err });
            throw err;
        }
    }

    /**
     * BULK_APPROVE_TASKS — Multiple Pending Approval → Approved
     */
    async function _handleBulkApprove(payload) {
        var taskIds   = payload.taskIds || [];
        var userEmail = _state.user.email;
        if (taskIds.length === 0) return;

        Logger.info('STATE', 'ACTION: BULK_APPROVE_TASKS → ' + taskIds.length);

        try {
            var results = await TaskRepo.bulkApprove(taskIds, userEmail);

            taskIds.forEach(function (id) {
                _updateTaskInList(id, {
                    status: CONSTANTS.STATUS.TASK.APPROVED
                });
            });

            _emit('tasks:loaded', _state.tasks);
            return results;

        } catch (err) {
            Logger.error('STATE', 'BULK_APPROVE_TASKS FAILED', err);
            _emit('state:error', { action: 'BULK_APPROVE_TASKS', error: err });
            throw err;
        }
    }

    async function _handleCreateRequirement(payload) {
        var formData  = payload.formData || {};
        var userEmail = _state.user.email;

        Logger.info('STATE', 'ACTION: CREATE_REQUIREMENT', formData);

        try {
            var newId     = await RequirementRepo.create(formData);
            var freshList = await RequirementRepo.getForUser(userEmail);

            _merge('requirements', {
                list   : freshList,
                active : freshList.filter(function (r) { return r.isActive; }),
                loaded : true
            });

            _emit('requirement:created', { id: newId });
            _emit('requirements:loaded', _state.requirements);
            return newId;

        } catch (err) {
            Logger.error('STATE', 'CREATE_REQUIREMENT FAILED', err);
            _emit('state:error', { action: 'CREATE_REQUIREMENT', error: err });
            throw err;
        }
    }

    async function _handleRefreshTasks() {
        var userEmail = _state.user.email;
        Logger.info('STATE', 'ACTION: REFRESH_TASKS');

        try {
            _setLoading(true, 'tasks');
            var freshTasks = await TaskRepo.refresh(userEmail);

            _merge('tasks', { list: freshTasks, loaded: true });
            _deriveTaskLists();
            _recalcTaskSummary();

            _setLoading(false, 'tasks');
            _emit('tasks:loaded', _state.tasks);

            // Task statuses may have changed (e.g. Closed by
            // the team) → recompute the consumed-hours waterfall.
            await _reconcileConsumedHours();

        } catch (err) {
            _setLoading(false, 'tasks');
            Logger.error('STATE', 'REFRESH_TASKS FAILED', err);
            _emit('state:error', { action: 'REFRESH_TASKS', error: err });
        }
    }

    async function _handleRefreshRequirements() {
        var userEmail = _state.user.email;
        Logger.info('STATE', 'ACTION: REFRESH_REQUIREMENTS');

        try {
            _setLoading(true, 'requirements');
            var fresh = await RequirementRepo.refresh(userEmail);

            _merge('requirements', {
                list   : fresh,
                active : fresh.filter(function (r) { return r.isActive; }),
                loaded : true
            });

            _setLoading(false, 'requirements');
            _emit('requirements:loaded', _state.requirements);

        } catch (err) {
            _setLoading(false, 'requirements');
            Logger.error('STATE', 'REFRESH_REQUIREMENTS FAILED', err);
            _emit('state:error', { action: 'REFRESH_REQUIREMENTS', error: err });
        }
    }

    async function _handleRefreshContracts() {
        var userEmail = _state.user.email;
        Logger.info('STATE', 'ACTION: REFRESH_CONTRACTS');

        try {
            _setLoading(true, 'contracts');

            var fresh        = await ContractRepo.refresh(userEmail);
            var hoursSummary = await ContractRepo.getHoursSummary(userEmail);

            _merge('contracts', {
                list         : fresh,
                active       : fresh.filter(function (c) { return c.isActive && c.isPaid; }),
                hoursSummary : hoursSummary,
                loaded       : true
            });

            _setLoading(false, 'contracts');
            _emit('contracts:loaded', _state.contracts);
            _emit('hours:updated', _state.contracts.hoursSummary);

        } catch (err) {
            _setLoading(false, 'contracts');
            Logger.error('STATE', 'REFRESH_CONTRACTS FAILED', err);
            _emit('state:error', { action: 'REFRESH_CONTRACTS', error: err });
        }
    }

    function _handleSwitchCurrency(payload) {
        var currency = payload.currency;
        if (!CONSTANTS.CURRENCY.RATES[currency]) {
            Logger.warn('STATE', 'SWITCH_CURRENCY: invalid → ' + currency);
            return;
        }
        _state.ui.currentCurrency = currency;
        _emit('currency:changed', { currency: currency });
    }

    function _handleSwitchContractType(payload) {
        var contractType = payload.contractType;
        var T = CONSTANTS.STATUS.CONTRACT_TYPE;
        if (contractType !== T.SUPPORT && contractType !== T.IMPLEMENTATION) {
            Logger.warn('STATE', 'SWITCH_CONTRACT_TYPE: invalid → ' + contractType);
            return;
        }
        _state.ui.currentContractType = contractType;
        _emit('contractType:changed', { contractType: contractType });
    }

    async function _handleOpenDetail(payload) {
        var reqId = payload.requirementId;
        if (!reqId) return;

        try {
            var existing = _state.requirements.list.find(function (r) { return r.id === reqId; });
            var requirement = existing || (await RequirementRepo.getById(reqId));
            var tasks       = await TaskRepo.getByRequirement(reqId);

            _merge('detailPanel', {
                isOpen: true, requirementId: reqId, requirement: requirement, tasks: tasks
            });

            _emit('detail:opened', _state.detailPanel);

        } catch (err) {
            Logger.error('STATE', 'OPEN_REQUIREMENT_DETAIL FAILED', err);
            _emit('state:error', { action: 'OPEN_REQUIREMENT_DETAIL', error: err });
        }
    }

    function _handleCloseDetail() {
        _merge('detailPanel', { isOpen: false, requirementId: null, requirement: null, tasks: [] });
        _emit('detail:closed');
    }

    // =========================================================================
    // PRIVATE — Action Router
    // =========================================================================

    async function _routeAction(action, payload) {
        Logger.debug('STATE', 'dispatch → ' + action, payload);

        switch (action) {
            case 'APPROVE_TASK'              : return _handleApproveTask(payload);
            case 'REJECT_TASK'               : return _handleRejectTask(payload);
            case 'APPROVE_COMPLETION'        : return _handleApproveCompletion(payload);
            case 'BULK_APPROVE_TASKS'        : return _handleBulkApprove(payload);
            case 'CREATE_REQUIREMENT'        : return _handleCreateRequirement(payload);
            case 'REFRESH_CONTRACTS'         : return _handleRefreshContracts();
            case 'REFRESH_REQUIREMENTS'      : return _handleRefreshRequirements();
            case 'REFRESH_TASKS'             : return _handleRefreshTasks();
            case 'SWITCH_CURRENCY'           : return _handleSwitchCurrency(payload);
            case 'SWITCH_CONTRACT_TYPE'      : return _handleSwitchContractType(payload);
            case 'OPEN_REQUIREMENT_DETAIL'   : return _handleOpenDetail(payload);
            case 'CLOSE_REQUIREMENT_DETAIL'  : return _handleCloseDetail();
            default                          : Logger.warn('STATE', 'Unknown action: ' + action);
        }
    }

    // =========================================================================
    // PUBLIC — Bootstrap
    // =========================================================================

    async function bootstrap() {
        Logger.separator('STATE BOOTSTRAP');
        Logger.info('STATE', 'Bootstrap starting...');

        var userEmail = _state.user.email;

        if (!userEmail) {
            Logger.error('STATE', 'Bootstrap: user email not set');
            _emit('state:error', { action: 'BOOTSTRAP', error: { message: 'User email not set' } });
            return;
        }

        _setLoading(true, 'bootstrap');

        try {
            Logger.time('STATE', 'bootstrap');

            var plans = await PricingRepo.getAll();
            var planById = {};
            plans.forEach(function (p) { planById[p.id] = p; });
            _merge('pricing', { plans: plans, byId: planById, loaded: true });
            _emit('pricing:loaded', _state.pricing);

            var results = await Promise.allSettled([
                ContractRepo.getForUser(userEmail),
                ContractRepo.getHoursSummary(userEmail),
                RequirementRepo.getForUser(userEmail),
                TaskRepo.getForUser(userEmail)
            ]);

            var contractList = _getSettledValue(results[0], [], 'contracts');
            var hoursSummary = _getSettledValue(results[1], {
                totalPurchased: 0, totalConsumed: 0, totalRemaining: 0,
                usagePercent: 0, activeCount: 0, contracts: []
            }, 'hoursSummary');

            _merge('contracts', {
                list         : contractList,
                active       : contractList.filter(function (c) { return c.isActive && c.isPaid; }),
                hoursSummary : hoursSummary,
                loaded       : true
            });

            var reqList = _getSettledValue(results[2], [], 'requirements');
            _merge('requirements', {
                list: reqList, active: reqList.filter(function (r) { return r.isActive; }), loaded: true
            });

            var taskList = _getSettledValue(results[3], [], 'tasks');
            _merge('tasks', { list: taskList, loaded: true });
            _deriveTaskLists();
            _recalcTaskSummary();

            _buildTimelineProjects();

            // ── Reconcile consumed hours from Closed tasks ──
            // (fetch → check approval status → waterfall → write back drift)
            await _reconcileConsumedHours();

            Logger.timeEnd('STATE', 'bootstrap');
            Logger.separator('BOOTSTRAP COMPLETE');

            _setLoading(false, 'bootstrap');
            _emit('contracts:loaded', _state.contracts);
            _emit('requirements:loaded', _state.requirements);
            _emit('tasks:loaded', _state.tasks);
            _emit('hours:updated', _state.contracts.hoursSummary);
            _emit('state:ready', _state);

            Logger.info('STATE', '✅ Bootstrap complete', {
                contracts: contractList.length, requirements: reqList.length,
                tasks: taskList.length, plans: plans.length
            });

        } catch (err) {
            Logger.timeEnd('STATE', 'bootstrap');
            _setLoading(false, 'bootstrap');
            Logger.error('STATE', 'Bootstrap FAILED', err);
            _emit('state:error', { action: 'BOOTSTRAP', error: err });
        }
    }

    function _getSettledValue(result, fallback, label) {
        if (result.status === 'fulfilled') return result.value;
        Logger.warn('STATE', 'Parallel load failed: ' + label, result.reason);
        return fallback;
    }

    function _buildTimelineProjects() {
        var activeContracts = _state.contracts.active;
        var allRequirements = _state.requirements.list;
        var palette         = CONSTANTS.PROJECT_COLOR_PALETTE;

        if (!activeContracts || activeContracts.length === 0) {
            _state.timeline.projects = [];
            _state.timeline.currentIndex = 0;
            return;
        }

        var projectMap = {};

        // A contract can cover MULTIPLE projects (multi-select lookup) —
        // it contributes its hours to each of its projects' groups.
        activeContracts.forEach(function (contract) {
            var projs = (contract.projects && contract.projects.length)
                ? contract.projects
                : [{ id: contract.projectId, display: contract.projectDisplay }];

            projs.forEach(function (p) {
                var pid = p.id || 'unknown';
                var pn  = p.display || 'Unknown Project';

                if (!projectMap[pid]) {
                    projectMap[pid] = {
                        projectId: pid, projectName: pn, contracts: [],
                        totalPurchased: 0, totalConsumed: 0, totalRemaining: 0
                    };
                }

                var g = projectMap[pid];
                if (g.contracts.indexOf(contract) === -1) g.contracts.push(contract);
                g.totalPurchased += contract.purchasedHours || 0;
                g.totalConsumed  += contract.consumedHours  || 0;
                g.totalRemaining += contract.remainingHours || 0;
            });
        });

        var uniqueProjects  = Object.values(projectMap);
        var timelineEntries = [];

        uniqueProjects.forEach(function (group, index) {
            var contractIds = group.contracts.map(function (c) { return c.id; });
            var projectRequirements = allRequirements.filter(function (r) {
                return contractIds.indexOf(r.contractId) !== -1;
            });

            var SR = CONSTANTS.STATUS.REQUIREMENT;
            var activeReq =
                projectRequirements.find(function (r) { return r.status === SR.IN_PROGRESS; }) ||
                projectRequirements.find(function (r) {
                    return r.status === SR.SUBMITTED || r.status === SR.UNDER_REVIEW || r.status === SR.APPROVED;
                }) ||
                projectRequirements[0];

            var color    = palette[index % palette.length];
            var statsStr = projectRequirements.length + ' requirement'
                + (projectRequirements.length !== 1 ? 's' : '')
                + ' · ' + group.totalRemaining + ' hrs remaining';

            var subtitle = activeReq
                ? 'REQ-' + activeReq.id.slice(-4).toUpperCase() + ' · ' + activeReq.subject
                : 'No active requirements';

            timelineEntries.push({
                id: group.projectId, name: group.projectName, color: color,
                gradColor: 'linear-gradient(135deg, ' + color + ', ' + color + 'CC)',
                stats: statsStr, subtitle: subtitle,
                phase: _getPhaseLabel(activeReq), phaseClass: _getPhaseClass(activeReq),
                requirements: projectRequirements, contracts: group.contracts,
                totalPurchased: group.totalPurchased, totalConsumed: group.totalConsumed,
                totalRemaining: group.totalRemaining
            });
        });

        _state.timeline.projects = timelineEntries;
        _state.timeline.currentIndex = 0;
    }

    function _getPhaseLabel(req) {
        if (!req) return 'No Active Phase';
        var S = CONSTANTS.STATUS.REQUIREMENT;
        var m = {};
        m[S.SUBMITTED]        = 'Submitted';
        m[S.UNDER_REVIEW]     = 'Review Phase';
        m[S.APPROVED]         = 'Approved';
        m[S.IN_PROGRESS]      = 'Development Phase';
        m[S.WAITING_APPROVAL] = 'Awaiting Approval';
        m[S.COMPLETED]        = 'Completed';
        return m[req.status] || req.status;
    }

    function _getPhaseClass(req) {
        if (!req) return 'badge-gray';
        return CONSTANTS.REQ_STATUS_BADGE[req.status] || 'badge-gray';
    }

    // =========================================================================
    // CONSUMED HOURS RECONCILIATION (waterfall)
    //
    // Recomputes every purchased contract's Consumed_Hours from the
    // client's Closed tasks:
    //   1. Each approved task's type is resolved via its requirement →
    //      contract → Contract_Type (defaults to Support).
    //   2. Per type, the total approved task hours waterfall through the
    //      purchased packages OLDEST FIRST: fill each up to its purchased
    //      amount, overflow rolls to the next, and the NEWEST package
    //      absorbs any excess (consumed may exceed purchased → the
    //      "Hours Limit Exceeded" alert fires).
    //   3. Contracts whose computed value differs from the stored one are
    //      written back to Zoho, then the local summary is rebuilt.
    //
    // Runs on: widget load (bootstrap), task refresh, completion approval.
    // =========================================================================

    async function _reconcileConsumedHours() {
        var contracts = _state.contracts.list || [];
        var purchased = contracts.filter(function (c) {
            return c.isActive && c.isPaid;
        });
        if (purchased.length === 0) return;

        var S  = CONSTANTS.STATUS.TASK;
        var CT = CONSTANTS.STATUS.CONTRACT_TYPE;

        // ── Map requirementId → contractId, contractId → type ──
        var reqContract = {};
        (_state.requirements.list || []).forEach(function (r) {
            if (r.id && r.contractId) reqContract[r.id] = r.contractId;
        });
        var typeById = {};
        contracts.forEach(function (c) {
            typeById[c.id] = c.isImplementation ? CT.IMPLEMENTATION : CT.SUPPORT;
        });

        // ── Total approved task hours per contract type ──
        var totals = {};
        totals[CT.SUPPORT] = 0;
        totals[CT.IMPLEMENTATION] = 0;

        (_state.tasks.list || []).forEach(function (t) {
            if (t.status !== S.CLOSED) return;
            var cid  = reqContract[t.requirementId];
            var type = (cid && typeById[cid]) || CT.SUPPORT;
            totals[type] += (t.estimatedHours || 0);
        });

        Logger.info('STATE', 'Reconcile: approved hours → '
            + CT.SUPPORT + ': ' + totals[CT.SUPPORT] + 'h, '
            + CT.IMPLEMENTATION + ': ' + totals[CT.IMPLEMENTATION] + 'h');

        // ── Waterfall allocation per type ──
        var computed = {};
        [CT.SUPPORT, CT.IMPLEMENTATION].forEach(function (type) {
            var pool = purchased.filter(function (c) {
                return typeById[c.id] === type;
            });
            var alloc = ContractRepo.allocateConsumedHours(pool, totals[type]);
            Object.keys(alloc).forEach(function (id) {
                computed[id] = alloc[id];
            });
        });

        // ── Write back only where computed ≠ stored ──
        var changed = purchased.filter(function (c) {
            return computed[c.id] !== undefined
                && computed[c.id] !== (c.consumedHours || 0);
        });

        if (changed.length === 0) {
            Logger.debug('STATE', 'Reconcile: no drift, nothing to write');
            return;
        }

        Logger.info('STATE', 'Reconcile: ' + changed.length
            + ' contract(s) drift detected → writing back');

        for (var i = 0; i < changed.length; i++) {
            var c      = changed[i];
            var newVal = computed[c.id];

            try {
                await ContractRepo.updateConsumedHours(c.id, newVal);
            } catch (err) {
                // Write-back failure must not block the UI — the computed
                // value is still applied locally as the canonical number.
                Logger.error('STATE', 'Reconcile write-back failed → ' + c.id, err);
            }

            c.consumedHours = newVal;
            c.remainingHours = Math.max(0, (c.purchasedHours || 0) - newVal);
            c.usagePercent = c.purchasedHours > 0
                ? Math.round((newVal / c.purchasedHours) * 100)
                : 0;
        }

        _state.contracts.hoursSummary = ContractRepo.buildHoursSummary(
            _state.contracts.list.filter(function (c) {
                return c.isActive && c.isPaid;
            })
        );
        _buildTimelineProjects();
        _emit('hours:updated', _state.contracts.hoursSummary);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    function get(key) { return key === undefined ? _state : _state[key]; }

    function set(key, value) { _state[key] = value; Logger.debug('STATE', 'set → ' + key); }

    async function dispatch(action, payload) { return _routeAction(action, payload || {}); }

    function on(event, callback) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(callback);
        return function () { off(event, callback); };
    }

    function off(event, callback) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(function (cb) { return cb !== callback; });
    }

    function computed(key) {
        var contracts = _state.contracts;
        var tasks     = _state.tasks;
        var ui        = _state.ui;

        switch (key) {
            case 'remainingHours'      : return contracts.hoursSummary.totalRemaining;
            case 'purchasedHours'      : return contracts.hoursSummary.totalPurchased;
            case 'consumedHours'       : return contracts.hoursSummary.totalConsumed;
            case 'usagePercent'        : return contracts.hoursSummary.usagePercent;
            case 'hoursExceeded'       :
                return contracts.hoursSummary.totalRemaining <= 0 && contracts.hoursSummary.totalPurchased > 0;
            case 'hoursLow'            :
                return contracts.hoursSummary.totalRemaining > 0
                    && contracts.hoursSummary.totalRemaining <= CONSTANTS.UI.LOW_HOURS_THRESHOLD;
            case 'pendingCount'        : return tasks.summary.pending;
            case 'completedTaskCount'  : return tasks.summary.completionApproved;
            case 'totalTaskCount'      : return tasks.summary.total;
            case 'selectedTaskHours'   :
                var sel = ui.selectedTaskIds;
                return tasks.list.filter(function (t) { return sel.indexOf(t.id) !== -1; })
                    .reduce(function (s, t) { return s + (t.estimatedHours || 0); }, 0);
            case 'selectionExceeded'   :
                return computed('selectedTaskHours') > contracts.hoursSummary.totalRemaining;
            case 'activeReqCount'      : return _state.requirements.active.length;
            case 'activeContractId'    :
                return contracts.active.length > 0 ? contracts.active[0].id : null;
            case 'activeContractRef'   :
                if (contracts.active.length === 0) return '—';
                if (contracts.active.length === 1)
                    return contracts.active[0].planDisplay || 'SC-' + contracts.active[0].id.slice(-6);
                return contracts.active.length + ' contracts';
            case 'activeContractsCount'   : return contracts.active.length;
            case 'uniqueProjectsCount'    : return (contracts.hoursSummary.uniqueProjects || []).length;
            case 'uniqueProjectsList'     : return contracts.hoursSummary.uniqueProjects || [];
            case 'hasMultipleContracts'   : return contracts.active.length > 1;
            case 'hasMultipleProjects'    : return (contracts.hoursSummary.uniqueProjects || []).length > 1;
            case 'currentProjects'        : return _state.timeline.projects;
            case 'currentTimelineProject' :
                var idx = _state.timeline.currentIndex;
                return _state.timeline.projects.length > 0 ? _state.timeline.projects[idx] : null;
            case 'timelineProjectsCount'  : return _state.timeline.projects.length;
            default: Logger.warn('STATE', 'computed: unknown → ' + key); return null;
        }
    }

    function setUI(key, value) {
        if (_state.ui[key] === undefined) Logger.warn('STATE', 'setUI: unknown → ' + key);
        _state.ui[key] = value;
    }

    function setTaskSelected(taskId, selected) {
        var list = _state.ui.selectedTaskIds;
        if (selected) { if (list.indexOf(taskId) === -1) list.push(taskId); }
        else { var idx = list.indexOf(taskId); if (idx !== -1) list.splice(idx, 1); }
        _emit('selection:changed', {
            selectedIds: list.slice(), totalHours: computed('selectedTaskHours'),
            exceeded: computed('selectionExceeded')
        });
    }

    function switchTimeline(direction) {
        var total = _state.timeline.projects.length;
        if (total === 0) return;
        var c = _state.timeline.currentIndex;
        _state.timeline.currentIndex = direction === 'next' ? (c + 1) % total : (c - 1 + total) % total;
        _emit('timeline:switched', {
            project: computed('currentTimelineProject'),
            index: _state.timeline.currentIndex, total: total
        });
    }

    return {
        bootstrap: bootstrap, get: get, set: set, dispatch: dispatch,
        on: on, off: off, computed: computed, setUI: setUI,
        setTaskSelected: setTaskSelected, switchTimeline: switchTimeline
    };

})();