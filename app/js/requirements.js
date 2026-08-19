/* ==========================================================================
   REQUIREMENTS.JS — With File Upload Support
   ========================================================================== */

'use strict';

var RequirementsModule = (function () {

    var _initialized = false;
    var _unsubscribers = [];

    var _filters = {
        search  : '',
        status  : 'all',
        project : 'all'
    };

    var _searchTimer = null;

    // =========================================================================
    // DOM Helpers
    // =========================================================================

    function _el(id) {
        return document.getElementById(id);
    }

    function _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getProjectColor(projectName) {
        if (!projectName) return CONSTANTS.PROJECT_COLORS.DEFAULT;
        var palette = CONSTANTS.PROJECT_COLOR_PALETTE;
        var hash = 0;
        for (var i = 0; i < projectName.length; i++) {
            hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
    }

    function _truncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.substring(0, max) + '…' : str;
    }

    // =========================================================================
    // Filter Logic
    // =========================================================================

    function _applyFilters(requirements) {
        var search = _filters.search.toLowerCase().trim();
        var status = _filters.status;
        var project = _filters.project;

        return requirements.filter(function (req) {
            if (search) {
                var searchTarget = [
                    req.subject, req.id, req.projectDisplay,
                    req.status, req.details
                ].join(' ').toLowerCase();

                if (searchTarget.indexOf(search) === -1) return false;
            }

            if (status !== 'all' && req.status !== status) return false;
            if (project !== 'all' && req.projectDisplay !== project) return false;

            return true;
        });
    }

    function _getUniqueProjects(requirements) {
        var seen = {};
        var projects = [];

        requirements.forEach(function (req) {
            var name = req.projectDisplay;
            if (name && !seen[name]) {
                seen[name] = true;
                projects.push(name);
            }
        });

        return projects.sort();
    }

    // =========================================================================
    // Progress Helpers
    // =========================================================================

    function _calculateProgress(req) {
        var S = CONSTANTS.STATUS.REQUIREMENT;
        var progressMap = {};
        progressMap[S.SUBMITTED]        = 5;
        progressMap[S.UNDER_REVIEW]     = 20;
        progressMap[S.NEED_MORE_INFO]   = 15;
        progressMap[S.WAITING_APPROVAL] = 35;
        progressMap[S.APPROVED]         = 50;
        progressMap[S.IN_PROGRESS]      = 65;
        progressMap[S.COMPLETED]        = 100;
        progressMap[S.CLOSED]           = 100;
        progressMap[S.REJECTED]         = 0;

        return progressMap[req.status] || 0;
    }

    function _getProgressColor(status) {
        var S = CONSTANTS.STATUS.REQUIREMENT;
        if (status === S.COMPLETED || status === S.CLOSED) return 'green';
        if (status === S.REJECTED) return 'red';
        if (status === S.IN_PROGRESS) return 'blue';
        if (status === S.NEED_MORE_INFO) return 'red';
        return 'amber';
    }

    // =========================================================================
    // Render Table
    // =========================================================================

    function _renderTable() {
        var reqState = AppState.get('requirements');
        var allReqs = reqState.list || [];
        var filtered = _applyFilters(allReqs);
        var tbody = document.querySelector('#page-requirements .data-table tbody');

        if (!tbody) return;

        if (filtered.length === 0) {
            var hasFilters = _filters.search
                || _filters.status !== 'all'
                || _filters.project !== 'all';

            tbody.innerHTML = [
                '<tr>',
                '  <td colspan="7" style="text-align:center;padding:48px 20px">',
                '    <i class="fa-solid fa-' + (hasFilters ? 'filter-circle-xmark' : 'file-lines') + '"',
                '      style="font-size:32px;opacity:0.2;margin-bottom:12px;display:block;color:var(--text-4)"></i>',
                '    <strong style="display:block;color:var(--text);font-size:14px;margin-bottom:6px">',
                '      ' + (hasFilters ? 'No requirements match filters' : 'No requirements yet'),
                '    </strong>',
                '    <span style="font-size:13px;color:var(--text-4)">',
                '      ' + (hasFilters ? 'Try adjusting filters' : 'Submit your first requirement'),
                '    </span>',
                hasFilters
                    ? '<br><br><button class="btn btn-outline btn-sm" onclick="RequirementsModule.resetFilters()"><i class="fa-solid fa-rotate-left"></i> Clear Filters</button>'
                    : '',
                '  </td>',
                '</tr>'
            ].join('');
            return;
        }

        tbody.innerHTML = filtered.map(_renderTableRow).join('');
    }

    function _renderTableRow(req) {
        var projColor = _getProjectColor(req.projectDisplay);
        var badgeClass = req.badgeClass || 'badge-gray';
        var progress = _calculateProgress(req);
        var progColor = _getProgressColor(req.status);

        var displayId = req.id
            ? 'REQ-' + req.id.slice(-4).toUpperCase()
            : 'REQ-????';

        return [
            '<tr style="cursor:default" title="' + _escapeHtml(req.subject) + '">',
            '  <td><span class="mono-text">' + _escapeHtml(displayId) + '</span></td>',
            '  <td>',
            '    <div class="cell-title">' + _escapeHtml(req.subject) + '</div>',
            '    <div class="cell-sub">' + _escapeHtml(_truncate(req.details, 60)) + '</div>',
            '  </td>',
            '  <td>',
            '    <span class="project-tag" style="--proj-color:' + projColor + '">',
            '      <i class="fa-solid fa-folder"></i>',
            '      ' + _escapeHtml(req.projectDisplay || 'Unknown'),
            '    </span>',
            '  </td>',
            '  <td>' + _escapeHtml(req.submittedDate || '—') + '</td>',
            '  <td>',
            '    <div class="progress-cell">',
            '      <div class="pc-bar">',
            '        <div class="pc-fill ' + progColor + '" style="width:' + progress + '%"></div>',
            '      </div>',
            '      <span>' + progress + '%</span>',
            '    </div>',
            '  </td>',
            '  <td><span class="badge ' + badgeClass + '">' + _escapeHtml(req.status) + '</span></td>',
            '  <td>',
            '    <button class="row-action" onclick="RequirementsModule.viewTasksForRequirement(\'' + _escapeHtml(req.id) + '\')" title="View related tasks">',
            '      <i class="fa-solid fa-list-check"></i>',
            '    </button>',
            '  </td>',
            '</tr>'
        ].join('');
    }

    function _renderProjectFilter() {
        var reqState = AppState.get('requirements');
        var allReqs = reqState.list || [];
        var projects = _getUniqueProjects(allReqs);
        var filterEl = document.querySelector('#page-requirements .toolbar-filters select:last-child');

        if (!filterEl) return;

        var currentVal = filterEl.value || 'all';

        filterEl.innerHTML = '<option value="all">All Projects</option>'
            + projects.map(function (p) {
                return '<option value="' + _escapeHtml(p) + '" '
                    + (currentVal === p ? 'selected' : '') + '>'
                    + _escapeHtml(p) + '</option>';
            }).join('');
    }

    // =========================================================================
    // New Requirement Modal
    // =========================================================================

    function _populateRequirementModal() {
        var contracts = AppState.get('contracts').active || [];
        var projectSel = document.querySelector('#requirementModal select');

        if (!projectSel) return;

        var seen = {};
        var projects = [];
        contracts.forEach(function (c) {
            if (c.projectDisplay && !seen[c.projectDisplay]) {
                seen[c.projectDisplay] = true;
                projects.push({
                    name: c.projectDisplay,
                    projectId: c.projectId,
                    contractId: c.id
                });
            }
        });

        projectSel.innerHTML = '<option value="">Select a project...</option>'
            + projects.map(function (p) {
                return '<option value="' + _escapeHtml(p.contractId)
                    + '" data-project-id="' + _escapeHtml(p.projectId)
                    + '">' + _escapeHtml(p.name) + '</option>';
            }).join('');
    }

    function _collectRequirementForm() {
        var modal = _el(CONSTANTS.DOM.REQUIREMENT_MODAL);
        if (!modal) return null;

        var projectSel = modal.querySelector('select');
        var subjectEl = modal.querySelectorAll('input[type="text"]')[0];
        var detailsEl = modal.querySelector('textarea');
        var fileInput = _el('reqModalFileInput');

        var contractId = projectSel ? projectSel.value : '';
        var subject = subjectEl ? subjectEl.value.trim() : '';
        var details = detailsEl ? detailsEl.value.trim() : '';

        var errors = [];
        if (!contractId) errors.push('Please select a project');
        if (!subject)    errors.push('Subject is required');
        if (!details)    errors.push('Description is required');

        if (errors.length > 0) {
            showToast('Validation Error', errors[0]);
            return null;
        }

        var contracts = AppState.get('contracts').active || [];
        var contract = contracts.find(function (c) {
            return c.id === contractId;
        });

        var today = new Date();
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var todayStr = String(today.getDate()).padStart(2, '0')
            + '-' + months[today.getMonth()]
            + '-' + today.getFullYear();

        var F = CONSTANTS.FIELDS.REQUIREMENT;
        var payload = {};

        payload[F.SUPPORT_CONTRACT]    = contractId;
        payload[F.SUBJECT]             = subject;
        payload[F.REQUIREMENT_DETAILS] = details;
        payload[F.SUBMITTED_DATE]      = todayStr;
        payload[F.STATUS]              = CONSTANTS.STATUS.REQUIREMENT.SUBMITTED;

        if (contract) {
            if (contract.projectId) payload[F.PROJECT] = contract.projectId;
            if (contract.clientId)  payload[F.CLIENT]  = contract.clientId;
        }

        var files = [];
        if (fileInput && fileInput.files) {
            for (var i = 0; i < fileInput.files.length; i++) {
                files.push(fileInput.files[i]);
            }
        }

        return {
            payload: payload,
            files: files
        };
    }

    function _resetRequirementForm() {
        var modal = _el(CONSTANTS.DOM.REQUIREMENT_MODAL);
        if (!modal) return;

        var inputs = modal.querySelectorAll('input, textarea');
        var selects = modal.querySelectorAll('select');

        inputs.forEach(function (el) { el.value = ''; });
        selects.forEach(function (el) { el.selectedIndex = 0; });

        var fileList = _el('fileList');
        var dropText = _el('fileDropText');
        if (fileList) fileList.innerHTML = '';
        if (dropText) dropText.innerHTML = 'Click here or <span>browse to upload</span>';
    }

    // =========================================================================
    // Event Subscriptions
    // =========================================================================

    function _subscribeToEvents() {
        var unsubLoaded = AppState.on('requirements:loaded', function () {
            var page = document.getElementById('page-requirements');
            if (page && page.classList.contains('active')) {
                _renderTable();
                _renderProjectFilter();
            }
        });

        var unsubCreated = AppState.on('requirement:created', function () {
            closeModal(CONSTANTS.DOM.REQUIREMENT_MODAL);
            _resetRequirementForm();
        });

        _unsubscribers = [unsubLoaded, unsubCreated];
    }

    // =========================================================================
    // Toolbar Listeners
    // =========================================================================

    function _debounce(fn, delay) {
        return function () {
            var args = arguments;
            var ctx = this;
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(function () {
                fn.apply(ctx, args);
            }, delay);
        };
    }

    function _setupToolbarListeners() {
        var page = document.getElementById('page-requirements');
        if (!page) return;

        var searchInput = page.querySelector('.search-box input');
        if (searchInput) {
            var debouncedSearch = _debounce(function (e) {
                _filters.search = e.target.value;
                _renderTable();
            }, CONSTANTS.UI.DEBOUNCE_DELAY);
            searchInput.addEventListener('input', debouncedSearch);
        }

        var statusFilter = page.querySelector('.toolbar-filters select:first-child');
        if (statusFilter) {
            statusFilter.addEventListener('change', function () {
                _filters.status = this.value === 'All Status' ? 'all' : this.value;
                _renderTable();
            });
        }

        var projectFilter = page.querySelector('.toolbar-filters select:last-child');
        if (projectFilter) {
            projectFilter.addEventListener('change', function () {
                _filters.project = this.value === 'All Projects' ? 'all' : this.value;
                _renderTable();
            });
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    function init() {
        if (_initialized) return;

        Logger.info('REQUIREMENTS', 'Initializing...');
        _subscribeToEvents();
        _setupToolbarListeners();

        _initialized = true;
        Logger.info('REQUIREMENTS', '✅ Initialized');
    }

    function onPageEnter() {
        Logger.info('REQUIREMENTS', 'Page entered');

        var reqState = AppState.get('requirements');

        _populateRequirementModal();
        _renderProjectFilter();

        if (reqState.loaded) {
            _renderTable();
        } else {
            AppState.dispatch('REFRESH_REQUIREMENTS');
        }
    }

    function viewTasksForRequirement(requirementId) {
        Logger.info('REQUIREMENTS', 'View tasks for → ' + requirementId);
        AppState.setUI('filterByRequirementId', requirementId);
        navigateTo(CONSTANTS.PAGES.TASKS);
    }

    /**
     * Handle file selection in modal
     */
    function onFilesSelected(files) {
        var fileList = _el('fileList');
        var dropText = _el('fileDropText');
        if (!fileList) return;

        if (!files || files.length === 0) {
            fileList.innerHTML = '';
            if (dropText) {
                dropText.innerHTML = 'Click here or <span>browse to upload</span>';
            }
            return;
        }

        if (files.length > 10) {
            showToast('Too Many Files', 'Maximum 10 files allowed.');
            var input = _el('reqModalFileInput');
            if (input) input.value = '';
            return;
        }

        if (dropText) {
            dropText.innerHTML = '<strong>' + files.length + '</strong> file(s) selected';
        }

        var html = '';
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var size = (file.size / 1024).toFixed(1) + ' KB';
            if (file.size > 1024 * 1024) {
                size = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
            }
            html += [
                '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:8px;margin-top:6px;font-size:12px">',
                '  <i class="fa-solid fa-paperclip" style="color:var(--text-4)"></i>',
                '  <span style="flex:1;color:var(--text-2);font-weight:500">' + _escapeHtml(file.name) + '</span>',
                '  <span style="color:var(--text-4)">' + size + '</span>',
                '</div>'
            ].join('');
        }
        fileList.innerHTML = html;
    }

    async function submitRequirement() {
        Logger.info('REQUIREMENTS', 'submitRequirement called');

        var form = _collectRequirementForm();
        if (!form) return;

        var submitBtn = document.querySelector('#requirementModal .btn-primary');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
        }

        try {
            // Step 1: Create the requirement
            var newId = await AppState.dispatch('CREATE_REQUIREMENT', {
                formData: form.payload
            });

            Logger.info('REQUIREMENTS', 'Requirement created → ID: ' + newId);

            // Step 2: Upload files if any
            if (form.files.length > 0 && newId) {
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading files...';
                }

                var F = CONSTANTS.FIELDS.REQUIREMENT;
                var uploadedCount = 0;

                for (var i = 0; i < form.files.length; i++) {
                    try {
                        await ZOHO.CREATOR.FILE.uploadFile({
                            app_name    : CONSTANTS.APP.NAME,
                            report_name : CONSTANTS.REPORTS.REQUIREMENT,
                            id          : newId,
                            field_name  : F.ATTACHMENTS,
                            file        : form.files[i]
                        });
                        uploadedCount++;
                        Logger.info('REQUIREMENTS', 'Uploaded ' + (i+1) + '/' + form.files.length);
                    } catch (uploadErr) {
                        Logger.error('REQUIREMENTS', 'File upload failed', uploadErr);
                    }
                }

                if (uploadedCount > 0) {
                    showToast('Requirement Submitted',
                        'Created with ' + uploadedCount + ' attachment(s).');
                } else {
                    showToast('Requirement Submitted',
                        'Created. Files could not be uploaded.');
                }
            } else {
                showToast('Requirement Submitted',
                    'Your requirement has been received.');
            }

        } catch (err) {
            Logger.error('REQUIREMENTS', 'submitRequirement failed', err);
            showToast('Submission Failed',
                'Could not submit requirement. Please try again.');

        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Requirement';
            }
        }
    }

    function setSearch(value) {
        _filters.search = value || '';
        var searchInput = document.querySelector('#page-requirements .search-box input');
        if (searchInput) searchInput.value = value || '';
        _renderTable();
    }

    function resetFilters() {
        _filters = { search: '', status: 'all', project: 'all' };

        var page = document.getElementById('page-requirements');
        if (!page) return;

        var searchInput = page.querySelector('.search-box input');
        var statusFilter = page.querySelector('.toolbar-filters select:first-child');
        var projectFilter = page.querySelector('.toolbar-filters select:last-child');

        if (searchInput)   searchInput.value = '';
        if (statusFilter)  statusFilter.selectedIndex = 0;
        if (projectFilter) projectFilter.selectedIndex = 0;

        _renderTable();
    }

    async function refresh() {
        await AppState.dispatch('REFRESH_REQUIREMENTS');
        showToast('Refreshed', 'Requirements updated.');
    }

    function destroy() {
        _unsubscribers.forEach(function (unsub) {
            if (typeof unsub === 'function') unsub();
        });
        _unsubscribers = [];
        _initialized = false;
    }

    return {
        init                    : init,
        onPageEnter             : onPageEnter,
        viewTasksForRequirement : viewTasksForRequirement,
        onFilesSelected         : onFilesSelected,
        submitRequirement       : submitRequirement,
        setSearch               : setSearch,
        resetFilters            : resetFilters,
        refresh                 : refresh,
        destroy                 : destroy
    };

})();