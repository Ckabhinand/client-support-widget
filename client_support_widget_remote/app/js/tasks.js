/* ==========================================================================
   TASKS.JS — Tasks Page Module

   6-Status Client Approval Flow:

   Not Started      → Approve | Reject
   Start Approval   → No action (team working)
   In Progress      → Reject
   Completed        → Approve Completion | Reject
   Completion Approved → No action (final)
   Task Rejected    → Shows reason
   ========================================================================== */

'use strict';

var TasksModule = (function () {

    var _initialized   = false;
    var _unsubscribers = [];

    var _currentTab = CONSTANTS.TASK_TABS.ALL;

    var _filters = {
        search   : '',
        project  : 'all',
        priority : 'all',
        owner    : 'all'
    };

    var _searchTimer = null;

    var _pendingRejection = {
        taskId : null,
        mode   : null    // 'start' | 'inprogress' | 'completion'
    };

    // =========================================================================
    // DOM Helpers
    // =========================================================================

    function _el(id) { return document.getElementById(id); }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _setText(id, text) {
        var el = _el(id);
        if (el) el.textContent = String(text || '');
    }

    // =========================================================================
    // Filter Logic
    // =========================================================================

    function _applyFilters(tasks) {
        var search   = _filters.search.toLowerCase().trim();
        var project  = _filters.project;
        var priority = _filters.priority;
        var owner    = _filters.owner;

        return tasks.filter(function (task) {
            if (search) {
                var target = [
                    task.taskName, task.displayId, task.projectDisplay,
                    task.owner, task.description, task.priority, task.status
                ].join(' ').toLowerCase();
                if (target.indexOf(search) === -1) return false;
            }
            if (project  !== 'all' && task.projectDisplay !== project)  return false;
            if (priority !== 'all' && task.priority       !== priority) return false;
            if (owner    !== 'all' && task.owner          !== owner)    return false;
            return true;
        });
    }

    function _getTabTasks() {
        var s = AppState.get('tasks');
        switch (_currentTab) {
            case CONSTANTS.TASK_TABS.PENDING  : return s.pending    || [];
            case CONSTANTS.TASK_TABS.PROGRESS : return s.inProgress || [];
            case CONSTANTS.TASK_TABS.COMPLETED: return s.completed  || [];
            case CONSTANTS.TASK_TABS.ALL      :
            default                           : return s.list       || [];
        }
    }

    function _getUniqueValues(field) {
        var all = AppState.get('tasks').list || [];
        var seen = {}, vals = [];
        all.forEach(function (t) {
            var v = t[field];
            if (v && !seen[v]) { seen[v] = true; vals.push(v); }
        });
        return vals.sort();
    }

    // =========================================================================
    // Render Summary Cards
    // =========================================================================

    function _renderSummaryCards() {
        var summary = AppState.get('tasks').summary;
        [
            { id: 'taskSummaryPending',   value: summary.pending },
            { id: 'taskSummaryProgress',  value: summary.inProgress + summary.startApproval },
            { id: 'taskSummaryCompleted', value: summary.completionApproved },
            { id: 'taskSummaryAll',       value: summary.total }
        ].forEach(function (card) {
            var el = _el(card.id);
            if (el) {
                var s = el.querySelector('strong');
                if (s) s.textContent = card.value;
            }
        });
    }

    function _renderTabCounts() {
        var summary = AppState.get('tasks').summary;
        var counts = {
            'pending'   : summary.pending,
            'progress'  : summary.inProgress + summary.startApproval,
            'completed' : summary.completionApproved,
            'all'       : summary.total
        };
        Object.keys(counts).forEach(function (tab) {
            var el = document.querySelector('.tasks-tab[data-tab="' + tab + '"] .tab-count');
            if (el) el.textContent = counts[tab];
        });
    }

    // =========================================================================
    // Render Hours Banner
    // =========================================================================

    function _renderHoursBanner() {
        var purchased = AppState.computed('purchasedHours');
        var consumed  = AppState.computed('consumedHours');
        var remaining = AppState.computed('remainingHours');
        var exceeded  = AppState.computed('hoursExceeded');

        var banner = document.querySelector('#page-tasks .hours-banner');
        if (!banner) return;

        banner.classList.toggle('exceeded', exceeded);

        var vals = banner.querySelectorAll('.hb-value');
        if (vals[0]) { vals[0].textContent = purchased; vals[0].className = 'hb-value'; }
        if (vals[1]) {
            vals[1].textContent = consumed;
            vals[1].className = 'hb-value' + (consumed > purchased * 0.8 ? ' warning' : '');
        }
        if (vals[2]) {
            vals[2].textContent = remaining;
            vals[2].className = 'hb-value'
                + (exceeded ? ' danger' : remaining <= CONSTANTS.UI.LOW_HOURS_THRESHOLD ? ' warning' : '');
        }
    }

    // =========================================================================
    // Render Filter Chips
    // =========================================================================

    function _renderFilterChips() {
        var container = _el(CONSTANTS.DOM.ACTIVE_FILTER_CHIPS);
        if (!container) return;

        var chips = [];
        if (_filters.project  !== 'all') chips.push('<button class="filter-chip" onclick="TasksModule.clearFilter(\'project\')">Project: ' + _escapeHtml(_filters.project) + ' <i class="fa-solid fa-xmark"></i></button>');
        if (_filters.priority !== 'all') chips.push('<button class="filter-chip" onclick="TasksModule.clearFilter(\'priority\')">Priority: ' + _escapeHtml(_filters.priority) + ' <i class="fa-solid fa-xmark"></i></button>');
        if (_filters.owner    !== 'all') chips.push('<button class="filter-chip" onclick="TasksModule.clearFilter(\'owner\')">Owner: ' + _escapeHtml(_filters.owner) + ' <i class="fa-solid fa-xmark"></i></button>');
        if (_filters.search) chips.push('<button class="filter-chip" onclick="TasksModule.clearFilter(\'search\')">Search: "' + _escapeHtml(_filters.search) + '" <i class="fa-solid fa-xmark"></i></button>');

        container.innerHTML = chips.length > 0 ? chips.join('') : '<span class="filter-chip muted">All Tasks</span>';
    }

    // =========================================================================
    // Filter Dropdowns
    // =========================================================================

    function _populateFilterDropdowns() {
        var pf = _el(CONSTANTS.DOM.PROJECT_FILTER);
        if (pf) {
            var projects = _getUniqueValues('projectDisplay');
            var cp = pf.value || 'all';
            pf.innerHTML = '<option value="all">All Projects</option>' + projects.map(function (p) {
                return '<option value="' + _escapeHtml(p) + '"' + (cp === p ? ' selected' : '') + '>' + _escapeHtml(p) + '</option>';
            }).join('');
        }

        var prf = _el(CONSTANTS.DOM.PRIORITY_FILTER);
        if (prf) {
            var P = CONSTANTS.PRIORITY, cpr = prf.value || 'all';
            prf.innerHTML = '<option value="all">All Priorities</option>'
                + '<option value="' + P.HIGH + '"' + (cpr === P.HIGH ? ' selected' : '') + '>' + P.HIGH + '</option>'
                + '<option value="' + P.MEDIUM + '"' + (cpr === P.MEDIUM ? ' selected' : '') + '>' + P.MEDIUM + '</option>'
                + '<option value="' + P.LOW + '"' + (cpr === P.LOW ? ' selected' : '') + '>' + P.LOW + '</option>';
        }

        var of = _el(CONSTANTS.DOM.OWNER_FILTER);
        if (of) {
            var owners = _getUniqueValues('owner'), co = of.value || 'all';
            of.innerHTML = '<option value="all">All Owners</option>' + owners.map(function (o) {
                return '<option value="' + _escapeHtml(o) + '"' + (co === o ? ' selected' : '') + '>' + _escapeHtml(o) + '</option>';
            }).join('');
        }
    }

    // =========================================================================
    // Render Task Table
    // =========================================================================

    function _renderTaskTable() {
        var tabTasks = _getTabTasks();
        var filtered = _applyFilters(tabTasks);

        _switchSectionDisplay();

        var section = _el('section-' + _currentTab);
        if (!section) return;

        var tbody = section.querySelector('tbody');
        if (!tbody) return;

        var headerSpan = section.querySelector('.task-panel-header span');
        if (headerSpan) headerSpan.textContent = filtered.length + ' task' + (filtered.length !== 1 ? 's' : '');

        if (filtered.length === 0) {
            var e = _el(CONSTANTS.DOM.EMPTY_STATE);
            if (e) e.style.display = 'block';
            tbody.innerHTML = '';
            return;
        }

        var e2 = _el(CONSTANTS.DOM.EMPTY_STATE);
        if (e2) e2.style.display = 'none';

        tbody.innerHTML = filtered.map(function (task) { return _renderTaskRow(task); }).join('');
    }

    // =========================================================================
    // Action Cell — Client Actions Per Status
    // =========================================================================

    function _renderActionCell(task) {
        var S       = CONSTANTS.STATUS.TASK;
        var actions = [];

        if (task.status === S.NOT_STARTED) {
            // Level 1: Approve to start OR Reject
            actions.push(
                '<button class="btn btn-primary btn-sm" onclick="TasksModule.approveTask(\''
                + _escapeHtml(task.id) + '\')">'
                + '<i class="fa-solid fa-check"></i> Approve</button>'
            );
            actions.push(
                '<button class="btn btn-ghost btn-sm task-btn-reject" onclick="TasksModule.openRejectModal(\''
                + _escapeHtml(task.id) + '\', \'start\')">'
                + '<i class="fa-solid fa-ban"></i> Reject</button>'
            );

        } else if (task.status === S.IN_PROGRESS) {
            // In Progress: Client can reject
            actions.push(
                '<button class="btn btn-ghost btn-sm task-btn-reject" onclick="TasksModule.openRejectModal(\''
                + _escapeHtml(task.id) + '\', \'inprogress\')">'
                + '<i class="fa-solid fa-ban"></i> Reject</button>'
            );

        } else if (task.status === S.COMPLETED) {
            // Level 2: Approve completion OR Reject
            actions.push(
                '<button class="btn btn-primary btn-sm" onclick="TasksModule.approveCompletion(\''
                + _escapeHtml(task.id) + '\')">'
                + '<i class="fa-solid fa-circle-check"></i> Approve Completion</button>'
            );
            actions.push(
                '<button class="btn btn-ghost btn-sm task-btn-reject" onclick="TasksModule.openRejectModal(\''
                + _escapeHtml(task.id) + '\', \'completion\')">'
                + '<i class="fa-solid fa-ban"></i> Reject</button>'
            );

        } else if (task.status === S.TASK_REJECTED && task.rejectionReason) {
            // Show rejection reason
            actions.push(
                '<span class="task-rejection-reason" title="' + _escapeHtml(task.rejectionReason) + '">'
                + '<i class="fa-solid fa-circle-info"></i> '
                + _escapeHtml(task.rejectionReason) + '</span>'
            );

        } else {
            // Start Approval, Completion Approved — no client action
            actions.push('<span class="task-no-action">—</span>');
        }

        return '<td><div class="task-inline-actions">' + actions.join('') + '</div></td>';
    }

    // =========================================================================
    // Render Row
    // =========================================================================

    function _renderTaskRow(task) {
        var sc = task.statusClass || 'not-started';
        var pc = task.priorityClass || 'low';
        var cols = '';

        if (_currentTab === CONSTANTS.TASK_TABS.PENDING) {
            cols = [
                _renderNameCell(task), _renderProjectCell(task),
                _renderPriorityCell(task, pc), _renderOwnerCell(task),
                _renderHoursCell(task), _renderStatusCell(task, sc),
                _renderActionCell(task)
            ].join('');
        } else if (_currentTab === CONSTANTS.TASK_TABS.PROGRESS) {
            cols = [
                _renderNameCell(task), _renderProjectCell(task),
                _renderPriorityCell(task, pc), _renderOwnerCell(task),
                _renderProgressCell(task), '<td>—</td>',
                _renderStatusCell(task, sc), _renderActionCell(task)
            ].join('');
        } else if (_currentTab === CONSTANTS.TASK_TABS.COMPLETED) {
            cols = [
                _renderNameCell(task), _renderProjectCell(task),
                _renderPriorityCell(task, pc), _renderOwnerCell(task),
                '<td>—</td>', _renderHoursCell(task),
                _renderStatusCell(task, sc), _renderActionCell(task)
            ].join('');
        } else {
            cols = [
                _renderNameCell(task), _renderProjectCell(task),
                _renderPriorityCell(task, pc), _renderOwnerCell(task),
                _renderStatusCell(task, sc), _renderHoursCell(task),
                _renderActionCell(task)
            ].join('');
        }

        return '<tr class="task-row" data-task-id="' + _escapeHtml(task.id) + '">' + cols + '</tr>';
    }

    function _renderNameCell(task) {
        return '<td><div class="task-name-cell"><strong>' + _escapeHtml(task.taskName) + '</strong><span>' + _escapeHtml(task.displayId) + '</span></div></td>';
    }

    function _renderProjectCell(task) {
        return '<td><span class="project-pill"><i class="fa-solid fa-folder"></i> ' + _escapeHtml(task.projectDisplay || '—') + '</span></td>';
    }

    function _renderPriorityCell(task, pc) {
        return '<td><span class="priority-pill ' + pc + '">' + _escapeHtml(task.priority || '—') + '</span></td>';
    }

    function _renderOwnerCell(task) {
        return '<td>' + _escapeHtml(task.owner || '—') + '</td>';
    }

    function _renderHoursCell(task) {
        return '<td>' + (task.estimatedHours || 0) + ' hrs</td>';
    }

    function _renderStatusCell(task, sc) {
        return '<td><span class="task-status-pill ' + sc + '">' + _escapeHtml(task.status) + '</span></td>';
    }

    function _renderProgressCell(task) {
        return '<td><span class="progress-meta">' + (task.percent || 0) + '% complete</span></td>';
    }

    function _switchSectionDisplay() {
        [CONSTANTS.TASK_TABS.PENDING, CONSTANTS.TASK_TABS.PROGRESS,
         CONSTANTS.TASK_TABS.COMPLETED, CONSTANTS.TASK_TABS.ALL].forEach(function (tab) {
            var s = _el('section-' + tab);
            if (s) s.style.display = (tab === _currentTab) ? 'block' : 'none';
        });
    }

    function _renderAll() {
        _renderSummaryCards();
        _renderTabCounts();
        _renderHoursBanner();
        _renderTaskTable();
    }

    // =========================================================================
    // Event Listeners
    // =========================================================================

    function _setupFilterListeners() {
        var si = _el(CONSTANTS.DOM.TASK_SEARCH);
        if (si) si.addEventListener('input', function (e) {
            clearTimeout(_searchTimer);
            var v = e.target.value;
            _searchTimer = setTimeout(function () {
                _filters.search = v; _renderTaskTable();
            }, CONSTANTS.UI.DEBOUNCE_DELAY);
        });

        var pf = _el(CONSTANTS.DOM.PROJECT_FILTER);
        if (pf) pf.addEventListener('change', function () {
            _filters.project = this.value; _renderTaskTable();
        });

        var prf = _el(CONSTANTS.DOM.PRIORITY_FILTER);
        if (prf) prf.addEventListener('change', function () {
            _filters.priority = this.value; _renderTaskTable();
        });

        var of = _el(CONSTANTS.DOM.OWNER_FILTER);
        if (of) of.addEventListener('change', function () {
            _filters.owner = this.value; _renderTaskTable();
        });
    }

    function _subscribeToEvents() {
        var u1 = AppState.on('tasks:loaded', function () {
            var p = _el('page-tasks');
            if (p && p.classList.contains('active')) _renderAll();
        });
        var u2 = AppState.on('hours:updated', function () {
            var p = _el('page-tasks');
            if (p && p.classList.contains('active')) _renderHoursBanner();
        });
        _unsubscribers = [u1, u2];
    }

    // =========================================================================
    // PUBLIC — Task Actions
    // =========================================================================

    async function approveTask(taskId) {
        Logger.info('TASKS', 'approveTask → ' + taskId);
        try {
            await AppState.dispatch('APPROVE_TASK', { taskId: taskId });
            showToast('Task Approved', 'Task approved. Work will begin shortly.');
        } catch (err) {
            Logger.error('TASKS', 'approveTask FAILED', err);
            showToast('Error', 'Could not approve task. Please try again.');
        }
    }

    async function approveCompletion(taskId) {
        Logger.info('TASKS', 'approveCompletion → ' + taskId);
        try {
            await AppState.dispatch('APPROVE_COMPLETION', { taskId: taskId });
            showToast('Completion Approved', 'Task approved. Support hours updated.');
        } catch (err) {
            Logger.error('TASKS', 'approveCompletion FAILED', err);
            showToast('Error', 'Could not approve completion. Please try again.');
        }
    }

    function openRejectModal(taskId, mode) {
        if (!taskId || !mode) return;

        _pendingRejection.taskId = taskId;
        _pendingRejection.mode   = mode;

        var info  = _el(CONSTANTS.DOM.REJECTION_TASK_INFO);
        var input = _el(CONSTANTS.DOM.REJECTION_REASON);

        if (info) {
            var msgs = {
                'start'      : 'You are rejecting this task before it starts. Please explain why.',
                'inprogress' : 'You are rejecting this task while it is in progress. Please explain the issue.',
                'completion' : 'You are rejecting the completed work. Please explain what needs to be addressed.'
            };
            info.textContent = msgs[mode] || 'Please provide a rejection reason.';
        }

        if (input) input.value = '';

        openModal(CONSTANTS.DOM.REJECTION_MODAL);
    }

    function closeRejectModal() {
        _pendingRejection.taskId = null;
        _pendingRejection.mode   = null;
        var input = _el(CONSTANTS.DOM.REJECTION_REASON);
        if (input) input.value = '';
        closeModal(CONSTANTS.DOM.REJECTION_MODAL);
    }

    async function submitReject() {
        var reasonEl = _el(CONSTANTS.DOM.REJECTION_REASON);
        var reason   = reasonEl ? reasonEl.value.trim() : '';

        if (!reason) {
            showToast('Required', 'Please enter a rejection reason.');
            if (reasonEl) reasonEl.focus();
            return;
        }

        if (!_pendingRejection.taskId) {
            showToast('Error', 'No task selected for rejection.');
            return;
        }

        try {
            await AppState.dispatch('REJECT_TASK', {
                taskId : _pendingRejection.taskId,
                reason : reason
            });
            showToast('Task Rejected', 'Task rejected. The team has been notified.');
            closeRejectModal();
        } catch (err) {
            Logger.error('TASKS', 'submitReject FAILED', err);
            showToast('Error', 'Could not submit rejection. Please try again.');
        }
    }

    // =========================================================================
    // PUBLIC — Page Lifecycle
    // =========================================================================

    function init() {
        if (_initialized) return;
        Logger.info('TASKS', 'Initializing...');
        _subscribeToEvents();
        _setupFilterListeners();
        _initialized = true;
        Logger.info('TASKS', '✅ Initialized');
    }

    function onPageEnter() {
        Logger.info('TASKS', 'Page entered');
        _populateFilterDropdowns();

        var ui = AppState.get('ui');
        var filterByReqId = ui.filterByRequirementId;

        if (filterByReqId) {
            var tasksList = AppState.get('tasks').list || [];
            var matching = tasksList.filter(function (t) { return t.requirementId === filterByReqId; });

            if (matching.length > 0) {
                _filters.search = filterByReqId.slice(-6);
                var si = _el(CONSTANTS.DOM.TASK_SEARCH);
                if (si) si.value = _filters.search;
                _currentTab = CONSTANTS.TASK_TABS.ALL;
                document.querySelectorAll('.tasks-tab').forEach(function (b) {
                    b.classList.toggle('active', b.getAttribute('data-tab') === CONSTANTS.TASK_TABS.ALL);
                });
                showToast('Filtered', matching.length + ' task' + (matching.length !== 1 ? 's' : '') + ' found');
            } else {
                showToast('No Tasks', 'No tasks found for this requirement yet.');
            }
            AppState.setUI('filterByRequirementId', null);
        }

        var ts = AppState.get('tasks');
        if (ts.loaded) _renderAll();
        else AppState.dispatch('REFRESH_TASKS');
    }

    function filterByTab(tab) {
        _currentTab = tab;
        document.querySelectorAll('.tasks-tab').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-tab') === tab);
        });
        AppState.setUI('currentTaskTab', tab);
        _renderTaskTable();
    }

    function clearFilter(name) {
        _filters[name] = name === 'search' ? '' : 'all';
        var map = { project: CONSTANTS.DOM.PROJECT_FILTER, priority: CONSTANTS.DOM.PRIORITY_FILTER, owner: CONSTANTS.DOM.OWNER_FILTER, search: CONSTANTS.DOM.TASK_SEARCH };
        var el = _el(map[name]);
        if (el) el.value = name === 'search' ? '' : 'all';
        _renderTaskTable(); _renderFilterChips();
    }

    function resetFilters() {
        _filters = { search: '', project: 'all', priority: 'all', owner: 'all' };
        var s = _el(CONSTANTS.DOM.TASK_SEARCH);   if (s) s.value = '';
        var p = _el(CONSTANTS.DOM.PROJECT_FILTER); if (p) p.value = 'all';
        var r = _el(CONSTANTS.DOM.PRIORITY_FILTER);if (r) r.value = 'all';
        var o = _el(CONSTANTS.DOM.OWNER_FILTER);   if (o) o.value = 'all';
        _renderTaskTable(); _renderFilterChips();
    }

    async function refresh() {
        await AppState.dispatch('REFRESH_TASKS');
        showToast('Refreshed', 'Task data updated.');
    }

    function destroy() {
        _unsubscribers.forEach(function (u) { if (typeof u === 'function') u(); });
        _unsubscribers = [];
        _initialized = false;
    }

    return {
        init: init, onPageEnter: onPageEnter, filterByTab: filterByTab,
        clearFilter: clearFilter, resetFilters: resetFilters,
        refresh: refresh, destroy: destroy,
        approveTask: approveTask, approveCompletion: approveCompletion,
        openRejectModal: openRejectModal, closeRejectModal: closeRejectModal,
        submitReject: submitReject
    };

})();