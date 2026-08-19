/* ==========================================================================
   BUG-REPORT.JS — Bug Report Page Module

   Responsibilities:
   - Render bug report list (shows Project + Client + Contract)
   - Populate support contract dropdown in modal
   - Auto-fill Project and Client from selected contract
   - Handle bug report submission
   - Handle file selection display

   Uses:
   - BugReportRepo (data access)
   - ContractRepo (via AppState.contracts.active)
   - AppState (user context)
   - UI helpers (openModal, closeModal, showToast)
   ========================================================================== */

'use strict';

var BugReportModule = (function () {

    var _initialized = false;
    var _files       = [];

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

    // =========================================================================
    // Populate Support Contract Dropdown
    // =========================================================================

    function _populateContracts() {
        var select = _el(CONSTANTS.DOM.BUG_CONTRACT);
        if (!select) return;

        var contracts = AppState.get('contracts').active || [];

        if (contracts.length === 0) {
            select.innerHTML = '<option value="">No active contracts found</option>';
            _clearProjectClientInfo();
            Logger.warn('BUG', '_populateContracts → no active contracts');
            return;
        }

        select.innerHTML = '<option value="">Select a support contract...</option>'
            + contracts.map(function (c) {
                var label = (c.projectDisplay || 'Project')
                    + ' — '
                    + (c.planDisplay || ('SC-' + c.id.slice(-6)));
                return '<option value="' + _escapeHtml(c.id) + '">'
                    + _escapeHtml(label)
                    + '</option>';
            }).join('');

        _clearProjectClientInfo();

        Logger.debug('BUG', '_populateContracts → '
            + contracts.length + ' contracts loaded');
    }

    // =========================================================================
    // Auto-fill Project and Client Info from Selected Contract
    // =========================================================================

    /**
     * When a contract is selected, look up its Project and Client
     * and display them as read-only info below the dropdown.
     */
    function _onContractChanged() {
        var select = _el(CONSTANTS.DOM.BUG_CONTRACT);
        if (!select) return;

        var contractId = select.value;
        if (!contractId) {
            _clearProjectClientInfo();
            return;
        }

        var contracts = AppState.get('contracts').active || [];
        var contract  = contracts.find(function (c) { return c.id === contractId; });

        if (!contract) {
            _clearProjectClientInfo();
            return;
        }

        var projInfoEl   = _el(CONSTANTS.DOM.BUG_PROJECT_INFO);
        var clientInfoEl = _el(CONSTANTS.DOM.BUG_CLIENT_INFO);

        if (projInfoEl) {
            projInfoEl.innerHTML =
                '<i class="fa-solid fa-folder" style="color:var(--primary); margin-right:6px;"></i>'
                + '<strong>Project:</strong> '
                + _escapeHtml(contract.projectDisplay || '—');
        }

        if (clientInfoEl) {
            clientInfoEl.innerHTML =
                '<i class="fa-solid fa-building" style="color:var(--primary); margin-right:6px;"></i>'
                + '<strong>Client:</strong> '
                + _escapeHtml(contract.clientDisplay || '—');
        }

        Logger.debug('BUG', '_onContractChanged → project: '
            + contract.projectDisplay + ' | client: ' + contract.clientDisplay);
    }

    function _clearProjectClientInfo() {
        var projInfoEl   = _el(CONSTANTS.DOM.BUG_PROJECT_INFO);
        var clientInfoEl = _el(CONSTANTS.DOM.BUG_CLIENT_INFO);
        if (projInfoEl)   projInfoEl.innerHTML   = '';
        if (clientInfoEl) clientInfoEl.innerHTML = '';
    }

    // =========================================================================
    // Setup Event Listeners
    // =========================================================================

    function _setupListeners() {
        var select = _el(CONSTANTS.DOM.BUG_CONTRACT);
        if (select && !select._bugListenerAttached) {
            select.addEventListener('change', _onContractChanged);
            select._bugListenerAttached = true;
        }
    }

    // =========================================================================
    // Render Bug Reports List
    // =========================================================================

    async function _renderReports() {
        var list = _el(CONSTANTS.DOM.BUG_REPORTS_LIST);
        if (!list) return;

        list.innerHTML = '<p style="text-align:center; padding:32px; color:var(--text-4); font-size:13px;">'
            + 'Loading bug reports...'
            + '</p>';

        var userEmail = AppState.get('user').email;

        try {
            var reports = await BugReportRepo.getForUser(userEmail);

            if (!reports || reports.length === 0) {
                list.innerHTML = [
                    '<div class="bug-report-empty" style="text-align:center; padding:48px 20px;">',
                    '  <i class="fa-solid fa-bug" style="font-size:36px; opacity:0.2; display:block; margin-bottom:14px; color:var(--text-4);"></i>',
                    '  <h3 style="font-size:14px; color:var(--text); margin-bottom:6px;">No bug reports yet</h3>',
                    '  <p style="font-size:13px; color:var(--text-4);">Submit your first bug report using the button above.</p>',
                    '</div>'
                ].join('');
                return;
            }

            list.innerHTML = '<div class="item-list" style="padding:8px 24px;">'
                + reports.map(function (item) {
                    return [
                        '<div class="list-row">',
                        '  <div class="row-icon red">',
                        '    <i class="fa-solid fa-bug"></i>',
                        '  </div>',
                        '  <div class="row-content">',
                        '    <h4>' + _escapeHtml(item.displayId) + '</h4>',
                        '    <div class="bug-meta-row">',
                        '      <span class="bug-meta-tag">',
                        '        <i class="fa-solid fa-folder"></i> ' + _escapeHtml(item.projectDisplay || '—'),
                        '      </span>',
                        '      <span class="bug-meta-tag">',
                        '        <i class="fa-solid fa-building"></i> ' + _escapeHtml(item.clientDisplay || '—'),
                        '      </span>',
                        '      <span class="bug-meta-tag">',
                        '        <i class="fa-solid fa-file-contract"></i> ' + _escapeHtml(item.contractDisplay || '—'),
                        '      </span>',
                        '    </div>',
                        '    <p class="bug-description">' + _escapeHtml(item.description) + '</p>',
                        '  </div>',
                        '</div>'
                    ].join('');
                }).join('')
                + '</div>';

            Logger.info('BUG', '_renderReports → '
                + reports.length + ' reports rendered');

        } catch (err) {
            Logger.error('BUG', '_renderReports FAILED', err);
            list.innerHTML = '<p style="text-align:center; padding:32px; color:var(--red); font-size:13px;">'
                + 'Could not load bug reports. Please refresh.'
                + '</p>';
        }
    }

    // =========================================================================
    // File Selection Display
    // =========================================================================

    function onFilesSelected(files) {
        _files = files ? Array.prototype.slice.call(files) : [];

        var listEl = _el(CONSTANTS.DOM.BUG_FILE_LIST);
        if (!listEl) return;

        if (_files.length === 0) {
            listEl.innerHTML = '';
            return;
        }

        listEl.innerHTML = _files.map(function (file) {
            return '<div class="field-hint" style="display:flex; align-items:center; gap:6px; margin-top:4px;">'
                + '<i class="fa-solid fa-file" style="color:var(--primary); font-size:11px;"></i>'
                + _escapeHtml(file.name)
                + '</div>';
        }).join('');

        Logger.debug('BUG', 'onFilesSelected → '
            + _files.length + ' file(s) selected');
    }

    // =========================================================================
    // Submit Bug Report
    // =========================================================================

    /**
     * Validate and submit the bug report.
     * Automatically includes Project ID and Client ID from selected contract.
     */
    async function submit() {
        var contractEl    = _el(CONSTANTS.DOM.BUG_CONTRACT);
        var descriptionEl = _el(CONSTANTS.DOM.BUG_DESCRIPTION);

        var contractId  = contractEl    ? contractEl.value.trim()    : '';
        var description = descriptionEl ? descriptionEl.value.trim() : '';
        var userEmail   = AppState.get('user').email;

        // ── Validation ──
        if (!contractId) {
            showToast('Required Field', 'Please select a support contract.');
            if (contractEl) contractEl.focus();
            return;
        }

        if (!description) {
            showToast('Required Field', 'Please describe the bug before submitting.');
            if (descriptionEl) descriptionEl.focus();
            return;
        }

        // ── Resolve Project ID and Client ID from the selected contract ──
        var contracts = AppState.get('contracts').active || [];
        var contract  = contracts.find(function (c) { return c.id === contractId; });

        if (!contract) {
            showToast('Error', 'Selected contract not found. Please try again.');
            return;
        }

        var projectId = contract.projectId || '';
        var clientId  = contract.clientId  || '';

        if (!projectId) {
            Logger.warn('BUG', 'submit → contract has no projectId');
        }
        if (!clientId) {
            Logger.warn('BUG', 'submit → contract has no clientId');
        }

        // ── Build payload ──
        var payload = {};
        payload[CONSTANTS.FIELDS.BUG_REPORT.SUPPORT_CONTRACT] = contractId;
        payload[CONSTANTS.FIELDS.BUG_REPORT.PROJECT]          = projectId;
        payload[CONSTANTS.FIELDS.BUG_REPORT.CLIENT]           = clientId;
        payload[CONSTANTS.FIELDS.BUG_REPORT.BUG_DESCRIPTION]  = description;

        Logger.info('BUG', 'submit → payload', payload);

        try {
            await BugReportRepo.create(payload, userEmail);

            // ── Reset form ──
            if (contractEl)    contractEl.value    = '';
            if (descriptionEl) descriptionEl.value = '';
            _files = [];
            onFilesSelected([]);
            _clearProjectClientInfo();

            closeModal(CONSTANTS.DOM.BUG_MODAL);
            showToast('Bug Reported',
                'Your bug report has been submitted successfully.');

            await _renderReports();

        } catch (err) {
            Logger.error('BUG', 'submit FAILED', err);
            showToast('Submission Failed',
                'Could not submit bug report. Please try again.');
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    function init() {
        if (_initialized) return;
        _initialized = true;
        Logger.info('BUG', '✅ BugReportModule initialized');
    }

    function onPageEnter() {
        Logger.info('BUG', 'Page entered');
        _populateContracts();
        _setupListeners();
        _renderReports();
    }

    return {
        init            : init,
        onPageEnter     : onPageEnter,
        onFilesSelected : onFilesSelected,
        submit          : submit
    };

})();