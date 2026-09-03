/* ==========================================================================
   CONTRACTS.JS — Contracts Page Module
   
   Manages the Contracts page including:
   - Contract cards grid with live hours data
   - Usage progress bars per contract
   - Contract status badges
   - Empty state handling
   - Refresh capability
   
   NEVER calls SDK or repositories directly.
   All data via AppState.get() and AppState.dispatch().
   ========================================================================== */

"use strict";

var ContractsModule = (function () {
  // =========================================================================
  // PRIVATE — State
  // =========================================================================

  var _initialized = false;
  var _unsubscribers = [];

  // =========================================================================
  // PRIVATE — DOM Helpers
  // =========================================================================

  function _el(id) {
    return document.getElementById(id);
  }

  function _escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // =========================================================================
  // PRIVATE — Color Helpers
  // =========================================================================

  /**
   * Get project color from palette by project name
   * @param {string} projectName
   * @returns {string} hex color
   */
  function _getProjectColor(projectName) {
    if (!projectName) return CONSTANTS.PROJECT_COLORS.DEFAULT;
    var palette = CONSTANTS.PROJECT_COLOR_PALETTE;
    var hash = 0;
    for (var i = 0; i < projectName.length; i++) {
      hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  }

  /**
   * Get progress bar color based on usage percentage
   * @param {number} usagePct - 0 to 100
   * @returns {string} CSS gradient string
   */
  function _getProgressColor(usagePct) {
    if (usagePct >= 90) {
      return "linear-gradient(90deg, #F87171, #EF4444)";
    }
    if (usagePct >= 70) {
      return "linear-gradient(90deg, #FBBF24, #F59E0B)";
    }
    return "var(--grad-primary)";
  }

  /**
   * Get friendly contract reference display string
   * @param {Object} contract - ContractDTO
   * @returns {string}
   */
  function _getContractRef(contract) {
    if (!contract.id) return "SC-UNKNOWN";
    return "SC-" + contract.id.slice(-7).toUpperCase();
  }

  // =========================================================================
  // PRIVATE — Render: Contract Card
  // =========================================================================

  /**
   * Render a single contract card
   * @param {Object} contract - ContractDTO
   * @returns {string} HTML string
   */
  function _renderContractCard(contract) {
    var isActive = contract.isActive;
    var usagePct = contract.usagePercent || 0;
    var projColor = _getProjectColor(contract.projectDisplay);
    var progressClr = _getProgressColor(usagePct);
    var contractRef = _getContractRef(contract);
    var planDisplay = contract.planDisplay || "Support Plan";

    // ── Status badge ──
    var statusBadge = isActive
      ? '<span class="badge badge-success">' +
        '<span class="badge-dot"></span> Active</span>'
      : '<span class="badge badge-gray">Inactive</span>';

    // ── Project tag ──
    var projectTag = contract.projectDisplay
      ? '<span class="project-tag" ' +
        'style="--proj-color:' +
        projColor +
        '">' +
        '<i class="fa-solid fa-folder"></i> ' +
        _escapeHtml(contract.projectDisplay) +
        "</span>"
      : "";

    // ── Usage label ──
    var usageLabel =
      usagePct >= 90
        ? '<span style="color:var(--red)">' + usagePct + "% used</span>"
        : usagePct >= 70
          ? '<span style="color:var(--amber)">' + usagePct + "% used</span>"
          : usagePct + "% used";

    // ── Purchase date ──
    var dateLabel = contract.purchaseDate
      ? '<i class="fa-regular fa-calendar"></i> ' +
        "Purchased on " +
        _escapeHtml(contract.purchaseDate)
      : '<i class="fa-regular fa-calendar"></i> —';

    // ── Warning for low/exceeded hours ──
    var warningHTML = "";
    if (!isActive) {
      warningHTML = "";
    } else if (contract.remainingHours <= 0) {
      warningHTML = [
        '<div style="margin-top:12px;padding:8px 12px;',
        "background:var(--red-soft);border:1px solid ",
        "var(--red-light);border-radius:var(--r);",
        "font-size:12px;color:var(--red-dark);",
        'display:flex;align-items:center;gap:8px">',
        '  <i class="fa-solid fa-triangle-exclamation"></i>',
        "  All hours consumed. Purchase more to continue.",
        "</div>",
      ].join("");
    } else if (contract.remainingHours <= CONSTANTS.UI.LOW_HOURS_THRESHOLD) {
      warningHTML = [
        '<div style="margin-top:12px;padding:8px 12px;',
        "background:var(--amber-soft);border:1px solid ",
        "var(--amber-light);border-radius:var(--r);",
        "font-size:12px;color:var(--amber-dark);",
        'display:flex;align-items:center;gap:8px">',
        '  <i class="fa-solid fa-clock"></i>',
        "  Only " + contract.remainingHours + " hours remaining.",
        "</div>",
      ].join("");
    }

    return [
      '<div class="contract-card ' + (isActive ? "active" : "") + '">',

      // ── Top row: status + project + menu ──
      '  <div class="contract-top">',
      '    <div class="contract-top-tags">',
      "      " + statusBadge,
      "      " + projectTag,
      "    </div>",
      '    <button class="row-action" title="Options" ',
      "      onclick=\"ContractsModule.showOptions('" +
        _escapeHtml(contract.id) +
        "')\" >",
      '      <i class="fa-solid fa-ellipsis"></i>',
      "    </button>",
      "  </div>",

      // ── Contract reference ──
      '  <h2 class="mono-text">' + _escapeHtml(contractRef) + "</h2>",
      '  <p class="contract-sub">' + _escapeHtml(planDisplay) + "</p>",

      // ── Stats: Purchased / Used / Remaining ──
      '  <div class="contract-stats">',
      '    <div class="cs-item">',
      "      <span>Purchased</span>",
      "      <strong>" + contract.purchasedHours + " hrs</strong>",
      "    </div>",
      '    <div class="cs-item">',
      "      <span>Used</span>",
      "      <strong>" + contract.consumedHours + " hrs</strong>",
      "    </div>",
      '    <div class="cs-item">',
      "      <span>Remaining</span>",
      '      <strong class="' +
        (contract.remainingHours <= 0
          ? "danger"
          : contract.remainingHours <= CONSTANTS.UI.LOW_HOURS_THRESHOLD
            ? "warning"
            : "success") +
        '">',
      "        " + contract.remainingHours + " hrs",
      "      </strong>",
      "    </div>",
      "  </div>",

      // ── Progress bar ──
      '  <div class="contract-bar">',
      '    <div class="cb-track">',
      '      <div class="cb-fill" ',
      '        style="width:' + usagePct + "%;",
      "        background:" + progressClr + '">',
      "      </div>",
      "    </div>",
      '    <span class="cb-label">' + usageLabel + "</span>",
      "  </div>",

      // ── Warning strip ──
      warningHTML,

      // ── Footer: purchase date ──
      '  <p class="contract-foot">' + dateLabel + "</p>",

      "</div>",
    ].join("");
  }

  // =========================================================================
  // PRIVATE — Render: Contracts Grid
  // =========================================================================

  /**
   * Render the full contracts grid
   */
  function _renderContractsGrid() {
    var contractsState = AppState.get("contracts");
    // Show only active contracts (both paid and unpaid) — hide inactive
    var contracts = (contractsState.list || []).filter(function (c) {
      return c.isActive;
    });
    var container = _el(CONSTANTS.DOM.CONTRACTS_GRID);

    if (!container) {
      // Fallback: find by class
      container = document.querySelector("#page-contracts .contracts-grid");
    }

    if (!container) return;

    // ── Empty state ──
    if (contracts.length === 0) {
      container.innerHTML = [
        '<div style="grid-column:1/-1;text-align:center;',
        'padding:64px 20px">',
        '  <i class="fa-solid fa-file-contract" ',
        '    style="font-size:48px;opacity:0.15;',
        "    margin-bottom:16px;display:block;",
        '    color:var(--text-4)"></i>',
        '  <strong style="display:block;font-size:16px;',
        '    color:var(--text);margin-bottom:8px">',
        "    No contracts found",
        "  </strong>",
        '  <span style="font-size:13px;color:var(--text-4)">',
        "    Purchase a support plan to get started.",
        "  </span>",
        "  <br><br>",
        '  <button class="btn btn-primary" ',
        "    onclick=\"navigateTo('" + CONSTANTS.PAGES.PURCHASE + "')\">",
        '    <i class="fa-solid fa-cart-shopping"></i>',
        "    Browse Plans",
        "  </button>",
        "</div>",
      ].join("");
      return;
    }

    // Sort: paid first, then unpaid
    var sorted = contracts.slice().sort(function (a, b) {
      if (a.isPaid && !b.isPaid) return -1;
      if (!a.isPaid && b.isPaid) return 1;
      return 0;
    });

    container.innerHTML = sorted
      .map(function (contract) {
        // Unpaid contracts → show "Pay Now" card
        // Paid contracts → show normal card
        if (contract.isPaid) {
          return _renderContractCard(contract);
        } else {
          return _renderUnpaidCard(contract);
        }
      })
      .join("");

    // ── Animate progress bars ──
    setTimeout(function () {
      container.querySelectorAll(".cb-fill").forEach(function (bar) {
        var targetWidth = bar.style.width;
        bar.style.width = "0%";
        bar.style.transition = "none";

        setTimeout(function () {
          bar.style.transition = "width 1s cubic-bezier(0.4,0,0.2,1)";
          bar.style.width = targetWidth;
        }, 50);
      });
    }, 100);

    Logger.debug(
      "CONTRACTS",
      "Grid rendered → " + contracts.length + " contracts",
    );
  }

// =========================================================================
// PRIVATE — Render: Unpaid Contract Card (Pay Now)
// =========================================================================

/**
 * Render a card for a contract with pending / not captured payment
 * Shows minimal info + Pay Now button using the existing paymentUrl
 *
 * @param {Object} contract - ContractDTO with isPaid = false
 * @returns {string} HTML
 */
function _renderUnpaidCard(contract) {
    var contractRef = _getContractRef(contract);
    var planDisplay = contract.planDisplay || 'Support Plan';
    var projColor   = _getProjectColor(contract.projectDisplay);
    var hasPayUrl   = contract.paymentUrl && contract.paymentUrl.length > 0;

    // Status label
    var statusText = contract.paymentStatus || 'Awaiting Payment';
    var statusBadge = '<span class="badge badge-amber">'
        + '<i class="fa-solid fa-clock" style="margin-right:4px"></i>'
        + _escapeHtml(statusText)
        + '</span>';

    // Project tag
    var projectTag = contract.projectDisplay
        ? '<span class="project-tag" style="--proj-color:' + projColor + '">'
          + '<i class="fa-solid fa-folder"></i> '
          + _escapeHtml(contract.projectDisplay)
          + '</span>'
        : '';

    // Currency symbol + price
    var symbol = (CONSTANTS.CURRENCY.SYMBOLS[contract.currency]) || '$';
    var priceLabel = symbol + Number(contract.price || 0).toFixed(2);

    // Pay Now button (or fallback message if no URL yet)
    var payNowBtn = hasPayUrl
        ? [
            '<button class="btn btn-primary btn-block" ',
            '  style="margin-top:14px" ',
            '  onclick="ContractsModule.payNow(\'' + _escapeHtml(contract.id) + '\')">',
            '  <i class="fa-solid fa-lock"></i> Pay Now — ' + priceLabel,
            '</button>'
          ].join('')
        : [
            '<div style="margin-top:14px;padding:10px 14px;',
            '  background:var(--amber-soft);border:1px solid var(--amber-light);',
            '  border-radius:var(--r);font-size:12px;color:var(--amber-dark);',
            '  text-align:center">',
            '  <i class="fa-solid fa-hourglass-half"></i> ',
            '  Payment link is being generated. Please refresh in a moment.',
            '</div>'
          ].join('');

    return [
        '<div class="contract-card unpaid" style="opacity:0.85">',

        '  <div class="contract-top">',
        '    <div class="contract-top-tags">',
        '      ' + statusBadge,
        '      ' + projectTag,
        '    </div>',
        '  </div>',

        '  <h2 class="mono-text">' + _escapeHtml(contractRef) + '</h2>',
        '  <p class="contract-sub">' + _escapeHtml(planDisplay) + '</p>',

        // Details row — no hours, only price + package
        '  <div class="contract-stats">',
        '    <div class="cs-item">',
        '      <span>Package</span>',
        '      <strong>' + (contract.purchasedHours || 0) + ' hrs</strong>',
        '    </div>',
        '    <div class="cs-item">',
        '      <span>Amount</span>',
        '      <strong>' + priceLabel + '</strong>',
        '    </div>',
        '    <div class="cs-item">',
        '      <span>Status</span>',
        '      <strong class="warning">Pending</strong>',
        '    </div>',
        '  </div>',

        // Info banner
        '  <div style="margin-top:12px;padding:8px 12px;',
        '    background:var(--amber-soft);border:1px solid var(--amber-light);',
        '    border-radius:var(--r);font-size:12px;color:var(--amber-dark);',
        '    display:flex;align-items:center;gap:8px">',
        '    <i class="fa-solid fa-circle-info"></i>',
        '    Hours will be added once payment is completed.',
        '  </div>',

        payNowBtn,

        '</div>'
    ].join('');
}


  // =========================================================================
  // PRIVATE — Render: Page Hero Stats
  // =========================================================================

  /**
   * Update the page hero subtitle with summary stats
   */
  function _renderHeroStats() {
    var contractsState = AppState.get("contracts");
    var list = contractsState.list || [];
    var active = contractsState.active || [];
    var heroP = document.querySelector("#page-contracts .page-hero p");

    if (!heroP) return;

    if (list.length === 0) {
      heroP.textContent = "View your active and past support contracts";
      return;
    }

    heroP.textContent =
      active.length +
      " active contract" +
      (active.length !== 1 ? "s" : "") +
      " · " +
      list.length +
      " total";
  }

  // =========================================================================
  // PRIVATE — Event Subscriptions
  // =========================================================================

  /**
   * Subscribe to state events relevant to contracts page
   */
  function _subscribeToEvents() {
    // ── Contracts data loaded ──
    var unsubLoaded = AppState.on("contracts:loaded", function () {
      var page = document.getElementById("page-contracts");
      if (page && page.classList.contains("active")) {
        _renderContractsGrid();
        _renderHeroStats();
      }
    });

    // ── Hours updated (after task approval) ──
    var unsubHours = AppState.on("hours:updated", function () {
      var page = document.getElementById("page-contracts");
      if (page && page.classList.contains("active")) {
        _renderContractsGrid();
      }
    });

    _unsubscribers = [unsubLoaded, unsubHours];
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Initialize the contracts module
   * Called once by app.js
   */
  function init() {
    if (_initialized) {
      Logger.warn("CONTRACTS", "Already initialized");
      return;
    }

    Logger.info("CONTRACTS", "Initializing...");
    _subscribeToEvents();

    _initialized = true;
    Logger.info("CONTRACTS", "✅ Initialized");
  }

  /**
   * Called when user navigates to the contracts page
   */
  function onPageEnter() {
    Logger.info("CONTRACTS", "Page entered");

    var contractsState = AppState.get("contracts");

    if (contractsState.loaded) {
      _renderContractsGrid();
      _renderHeroStats();
    } else {
      AppState.dispatch("REFRESH_CONTRACTS");
    }
  }

  /**
   * Show contract options menu
   * Placeholder — extend with edit/renew/download actions
   * @param {string} contractId
   */
  function showOptions(contractId) {
    Logger.debug("CONTRACTS", "showOptions → " + contractId);

    // Find the contract DTO
    var contracts = AppState.get("contracts").list || [];
    var contract = contracts.find(function (c) {
      return c.id === contractId;
    });

    if (!contract) return;

    var contractRef = _getContractRef(contract);

    // For now — show a simple toast with contract info
    // Future: implement a context menu or detail modal
    showToast(
      contractRef,
      contract.planDisplay + " · " + contract.remainingHours + " hrs remaining",
    );
  }


  /**
 * Open the Payment URL for an unpaid contract in a new window.
 * User completes payment on Stripe/Razorpay etc.
 * When Deluge marks the contract Captured, refresh will show it as paid.
 *
 * @param {string} contractId
 */
function payNow(contractId) {
    var contracts = AppState.get('contracts').list || [];
    var contract  = contracts.find(function (c) { return c.id === contractId; });

    if (!contract) {
        showToast('Error', 'Contract not found.');
        return;
    }

    if (!contract.paymentUrl) {
        showToast('Not Ready', 'Payment link is still being generated. Please try again shortly.');
        return;
    }

    Logger.info('CONTRACTS', 'payNow → ' + contractId);

    var win = window.open(
        contract.paymentUrl,
        'paymentWindow',
        'width=900,height=750,scrollbars=yes,resizable=yes'
    );

    if (!win) {
        showToast('Popup Blocked', 'Please allow popups for this site to complete payment.');
        return;
    }

    showToast('Payment Window Opened', 'Complete your payment then refresh this page.');
}

  /**
   * Force refresh contracts data
   */
  async function refresh() {
    Logger.info("CONTRACTS", "Refresh requested");
    try {
      await AppState.dispatch("REFRESH_CONTRACTS");
      showToast("Refreshed", "Contract data updated successfully.");
    } catch (err) {
      Logger.error("CONTRACTS", "Refresh failed", err);
      showToast("Error", "Could not refresh contracts.");
    }
  }

  /**
   * Destroy module — clean up subscriptions
   */
  function destroy() {
    _unsubscribers.forEach(function (unsub) {
      if (typeof unsub === "function") unsub();
    });
    _unsubscribers = [];
    _initialized = false;
    Logger.info("CONTRACTS", "Destroyed");
  }

  // =========================================================================
  // EXPOSE PUBLIC API
  // =========================================================================
  return {
    init: init,
    onPageEnter: onPageEnter,
    showOptions: showOptions,
    payNow      : payNow,
    refresh: refresh,
    destroy: destroy,
  };
})();
