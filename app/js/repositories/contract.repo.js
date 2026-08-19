/* ==========================================================================
   CONTRACT.REPO.JS — Support Contract Repository
   
   Owns all data access for the Support_Contract form/report.
   Returns clean DTO objects shaped for UI consumption.
   
   PUBLIC METHODS:
     ContractRepo.getForUser(userEmail)     → Array of contract DTOs
     ContractRepo.getById(id)               → Single contract DTO
     ContractRepo.getActive(userEmail)      → Active contracts only
     ContractRepo.create(data)              → New contract ID
     ContractRepo.updateConsumedHours(id, hours) → Update hours
     ContractRepo.refresh(userEmail)        → Force fresh fetch
   ========================================================================== */

"use strict";

var ContractRepo = (function () {
  var F = CONSTANTS.FIELDS.SUPPORT_CONTRACT;
  var H = SdkService.helpers;

  // =========================================================================
  // PRIVATE — DTO Mapping
  // =========================================================================

  /**
   * Map raw SDK record → clean Contract DTO
   *
   * Contract DTO shape:
   * {
   *   id              : string,
   *   clientDisplay   : string,   // Account name
   *   clientId        : string,
   *   projectDisplay  : string,
   *   projectId       : string,
   *   email           : string,
   *   currency        : string,   // 'USD' | 'INR' | 'EUR'
   *   planDisplay     : string,   // Pricing plan title
   *   planId          : string,
   *   promotionCode   : string,
   *   price           : number,
   *   purchaseDate    : string,
   *   purchasedHours  : number,
   *   consumedHours   : number,
   *   remainingHours  : number,   // Computed: purchased - consumed
   *   usagePercent    : number,   // Computed: consumed / purchased * 100
   *   status          : string,   // 'Active' | 'Inactive'
   *   contractType    : string,   // 'Support' | 'Implementation'
   *   isActive        : boolean
   * }
   */
  function _toDTO(record) {
    if (!record) return null;

    var purchased = H.getInt(record, F.PURCHASED_HOURS, 0);
    var consumed = H.getInt(record, F.CONSUMED_HOURS, 0);
    var remaining = Math.max(0, purchased - consumed);
    var usagePct = purchased > 0 ? Math.round((consumed / purchased) * 100) : 0;

    var status = H.getString(record, F.CONTRACT_STATUS, "");
    var isActive = status === CONSTANTS.STATUS.CONTRACT.ACTIVE;

    // Contract type — fallback to Support for legacy records
    var contractType =
      H.getString(record, F.CONTRACT_TYPE, "") ||
      CONSTANTS.STATUS.CONTRACT_TYPE.SUPPORT;

    var paymentUrl = H.getString(record, F.PAYMENT_URL, "");
    var paymentStatus = H.getString(record, F.PAYMENT_STATUS, "");
    var isPaid = paymentStatus === CONSTANTS.STATUS.PAYMENT.CAPTURED;

    return {
      id: H.getString(record, "ID", ""),
      clientDisplay: H.getLookupDisplay(record, F.CLIENT),
      clientId: H.getLookupId(record, F.CLIENT),
      projectDisplay: H.getLookupDisplay(record, F.PROJECT),
      projectId: H.getLookupId(record, F.PROJECT),
      email: H.getLookupDisplay(record, F.EMAIL),
      currency: H.getString(record, F.CURRENCY, "USD"),
      planDisplay: H.getLookupDisplay(record, F.SUPPORT_PLAN),
      planId: H.getLookupId(record, F.SUPPORT_PLAN),
      promotionCode: H.getString(record, F.PROMOTION_CODE, ""),
      price: H.getNumber(record, F.PRICE, 0),
      purchaseDate: H.getString(record, F.PURCHASE_DATE, ""),
      purchasedHours: purchased,
      consumedHours: consumed,
      remainingHours: remaining,
      usagePercent: usagePct,
      status: status,
      contractType: contractType,
      isSupport: contractType === CONSTANTS.STATUS.CONTRACT_TYPE.SUPPORT,
      isImplementation:
        contractType === CONSTANTS.STATUS.CONTRACT_TYPE.IMPLEMENTATION,
      isActive: isActive,
      paymentUrl: paymentUrl,
      paymentStatus: paymentStatus,
      isPaid: isPaid,
      isPending: paymentStatus === CONSTANTS.STATUS.PAYMENT.PENDING,
      isPaymentFailed: paymentStatus === CONSTANTS.STATUS.PAYMENT.FAILED,
    };
  }

  /**
   * Map array of raw records → array of DTOs (skip nulls)
   */
  function _toDTOs(records) {
    return (records || []).map(_toDTO).filter(function (dto) {
      return dto !== null;
    });
  }

  // =========================================================================
  // PUBLIC METHODS
  // =========================================================================

  /**
   * Get all contracts for a specific user email
   * Filters by the Email lookup field in Support_Contract
   *
   * @param {string} userEmail - Logged-in user's email
   * @returns {Promise<Array>} Array of Contract DTOs
   */
  async function getForUser(userEmail) {
    if (!userEmail) {
      Logger.warn("REPO", "ContractRepo.getForUser → empty email");
      return [];
    }

    Logger.debug("REPO", "ContractRepo.getForUser → " + userEmail);

    try {
      // Use dot-notation to filter by the lookup's Company_Email field
      var records = await SdkService.getRecords({
        reportName: CONSTANTS.REPORTS.SUPPORT_CONTRACT,
        criteria: "(" + F.EMAIL + '.Company_Email == "' + userEmail + '")',
        cacheKey: CONSTANTS.CACHE_KEYS.USER_CONTRACTS + "_" + userEmail,
        cacheTTL: CONSTANTS.CACHE_TTL.MEDIUM,
      });

      var dtos = _toDTOs(records);
      Logger.info(
        "REPO",
        "ContractRepo.getForUser → " + dtos.length + " contracts",
      );
      return dtos;
    } catch (err) {
      Logger.error("REPO", "ContractRepo.getForUser FAILED", err);
      return [];
    }
  }
  /**
   * Get a single contract by record ID
   *
   * @param {string} id - Contract record ID
   * @returns {Promise<Object|null>} Contract DTO or null
   */
  async function getById(id) {
    if (!id) return null;

    Logger.debug("REPO", "ContractRepo.getById → " + id);

    try {
      var record = await SdkService.getRecordById({
        reportName: CONSTANTS.REPORTS.SUPPORT_CONTRACT,
        id: id,
        cacheKey: "contract_record_" + id,
        cacheTTL: CONSTANTS.CACHE_TTL.MEDIUM,
      });

      return _toDTO(record);
    } catch (err) {
      Logger.error("REPO", "ContractRepo.getById FAILED → " + id, err);
      return null;
    }
  }

  /**
   * Get ACTIVE contracts that are also PAID (or legacy contracts without payment field)
   *
   * Logic:
   * - Must be Contract_Status = "Active"
   * - AND must have Payment_Status = "Captured"
   *   OR be a legacy contract (no Payment_Status set)
   *
   * @param {string} userEmail
   * @returns {Promise<Array>}
   */
  async function getActive(userEmail) {
    var all = await getForUser(userEmail);
    return all.filter(function (c) {
      // Must be Active
      if (!c.isActive) return false;

      // ── Payment must be Captured ──
      // Empty / Pending / Not Captured → hidden
      // Only "Captured" contracts are considered valid
      return c.isPaid;
    });
  }

  /**
   * Get pending payment contracts (created but not yet paid)
   * Used to show "complete payment" state in UI if needed
   */
  async function getPendingPayment(userEmail) {
    var all = await getForUser(userEmail);
    return all.filter(function (c) {
      return c.isPending;
    });
  }

  /**
   * Get contracts to display on the Contracts page.
   * Returns:
   *   - Active + Captured contracts (fully functional)
   *   - Active + Not Captured contracts (shown as "Pay Now" cards)
   *   - Active + empty payment status contracts (also shown as Pay Now)
   *
   * Excludes: Inactive contracts
   *
   * @param {string} userEmail
   * @returns {Promise<Array>} Contract DTOs
   */
  async function getForContractsPage(userEmail) {
    var all = await getForUser(userEmail);
    var filtered = all.filter(function (c) {
      return c.isActive; // Any active contract (paid or not)
    });

    Logger.info(
      "REPO",
      "ContractRepo.getForContractsPage → " + filtered.length + " contracts",
    );
    return filtered;
  }

  /**
   * Get aggregated hours summary across ALL active contracts for the user
   * Sums hours regardless of project — total client picture
   *
   * @param {string} userEmail
   * @returns {Promise<Object>} Hours summary DTO
   *
   * Returns:
   * {
   *   totalPurchased    : number,   // Sum across all active contracts
   *   totalConsumed     : number,
   *   totalRemaining    : number,
   *   usagePercent      : number,
   *   activeCount       : number,   // How many active contracts
   *   contracts         : Array,    // Active contract DTOs
   *   contractsByProject: Object,   // {projectName: [contracts]}
   *   uniqueProjects    : Array     // [projectName1, projectName2, ...]
   * }
   */
  function _buildSummaryFor(contracts) {
    var purchased = 0;
    var consumed = 0;

    contracts.forEach(function (c) {
      purchased += c.purchasedHours;
      consumed += c.consumedHours;
    });

    var remaining = Math.max(0, purchased - consumed);
    var usagePct =
      purchased > 0 ? Math.round((consumed / purchased) * 100) : 0;

    return {
      totalPurchased: purchased,
      totalConsumed: consumed,
      totalRemaining: remaining,
      usagePercent: usagePct,
      activeCount: contracts.length,
      contracts: contracts,
    };
  }

  async function getHoursSummary(userEmail) {
    var active = await getActive(userEmail);

    var totalPurchased = 0;
    var totalConsumed = 0;

    // ── Group contracts by project for richer info ──
    var contractsByProject = {};
    var uniqueProjects = [];

    var supportContracts = [];
    var implementationContracts = [];

    active.forEach(function (c) {
      totalPurchased += c.purchasedHours;
      totalConsumed += c.consumedHours;

      if (c.isImplementation) {
        implementationContracts.push(c);
      } else {
        supportContracts.push(c);
      }

      var projName = c.projectDisplay || "Unknown Project";
      if (!contractsByProject[projName]) {
        contractsByProject[projName] = [];
        uniqueProjects.push(projName);
      }
      contractsByProject[projName].push(c);
    });

    var totalRemaining = Math.max(0, totalPurchased - totalConsumed);
    var usagePercent =
      totalPurchased > 0
        ? Math.round((totalConsumed / totalPurchased) * 100)
        : 0;

    var supportSummary = _buildSummaryFor(supportContracts);
    var implementationSummary = _buildSummaryFor(implementationContracts);

    Logger.info("REPO", "Hours summary calculated", {
      contracts: active.length,
      projects: uniqueProjects.length,
      totalPurchased: totalPurchased,
      totalConsumed: totalConsumed,
      totalRemaining: totalRemaining,
      support: supportContracts.length,
      implementation: implementationContracts.length,
    });

    return {
      totalPurchased: totalPurchased,
      totalConsumed: totalConsumed,
      totalRemaining: totalRemaining,
      usagePercent: usagePercent,
      activeCount: active.length,
      contracts: active,
      contractsByProject: contractsByProject,
      uniqueProjects: uniqueProjects,
      support: supportSummary,
      implementation: implementationSummary,
    };
  }
  /**
   * Create a new Support Contract
   *
   * @param {Object} data - Contract field values
   * @returns {Promise<string>} New record ID
   */
  async function create(data) {
    Logger.debug("REPO", "ContractRepo.create", data);

    try {
      var newId = await SdkService.addRecord({
        formName: CONSTANTS.FORMS.SUPPORT_CONTRACT,
        data: data,
        invalidateCache: [
          CONSTANTS.CACHE_KEYS.USER_CONTRACTS,
          CONSTANTS.CACHE_KEYS.DASHBOARD_STATS,
        ],
      });

      Logger.info("REPO", "ContractRepo.create ✅ → ID: " + newId);
      return newId;
    } catch (err) {
      Logger.error("REPO", "ContractRepo.create FAILED", err);
      throw err;
    }
  }

  /**
   * Update consumed hours on a contract
   * Called after task approval affects hours
   *
   * @param {string} id    - Contract record ID
   * @param {number} hours - New total consumed hours value
   * @returns {Promise<void>}
   */
  async function updateConsumedHours(id, hours) {
    Logger.debug(
      "REPO",
      "ContractRepo.updateConsumedHours → " + id + " hours: " + hours,
    );

    try {
      await SdkService.updateRecord({
        reportName: CONSTANTS.REPORTS.SUPPORT_CONTRACT,
        id: id,
        data: { [F.CONSUMED_HOURS]: hours },
        invalidateCache: [
          CONSTANTS.CACHE_KEYS.USER_CONTRACTS,
          "contract_record_" + id,
          CONSTANTS.CACHE_KEYS.DASHBOARD_STATS,
        ],
      });

      Logger.info("REPO", "ContractRepo.updateConsumedHours ✅ → " + id);
    } catch (err) {
      Logger.error("REPO", "ContractRepo.updateConsumedHours FAILED", err);
      throw err;
    }
  }

/**
 * Safely increment consumed hours on a contract
 * Fetches current value first to avoid race conditions
 * Called after client approves task completion
 *
 * @param {string} id              - Contract record ID
 * @param {number} additionalHours - Hours to add on top of existing consumed
 * @returns {Promise<number>}      - New total consumed hours value
 */
async function incrementConsumedHours(id, additionalHours) {
    if (!id) throw new Error('Contract ID is required');
    additionalHours = Number(additionalHours || 0);

    Logger.info('REPO', 'ContractRepo.incrementConsumedHours → ' + id, {
        additionalHours: additionalHours
    });

    try {
        // ── Invalidate cache so we fetch fresh current value ──
        CacheService.invalidate('contract_record_' + id);

        var contract = await getById(id);
        if (!contract) {
            throw new Error('Contract not found: ' + id);
        }

        var newConsumed = (contract.consumedHours || 0) + additionalHours;

        Logger.info('REPO', 'ContractRepo.incrementConsumedHours calculation', {
            contractId   : id,
            oldConsumed  : contract.consumedHours || 0,
            added        : additionalHours,
            newConsumed  : newConsumed
        });

        await updateConsumedHours(id, newConsumed);

        Logger.info('REPO', 'ContractRepo.incrementConsumedHours ✅ → ' + id);
        return newConsumed;

    } catch (err) {
        Logger.error('REPO', 'ContractRepo.incrementConsumedHours FAILED', err);
        throw err;
    }
} 

  /**
   * Force refresh — clears cache and re-fetches
   *
   * @param {string} userEmail
   * @returns {Promise<Array>} Fresh contract DTOs
   */
  async function refresh(userEmail) {
    Logger.info(
      "REPO",
      "ContractRepo.refresh → clearing cache for " + userEmail,
    );
    CacheService.invalidatePattern("contract");
    return getForUser(userEmail);
  }

  /**
   * Find an existing active contract matching client + project + currency
   * Used during purchase flow to determine if we should update or create
   *
   * @param {Object} criteria
   * @param {string} criteria.userEmail
   * @param {string} criteria.projectId
   * @param {string} criteria.currency
   * @returns {Promise<Object|null>} Existing contract DTO or null
   */
  async function findExistingContract(criteria) {
    var userEmail = criteria.userEmail;
    var projectId = criteria.projectId;
    var currency = criteria.currency;
    var contractType = criteria.contractType;

    if (!userEmail || !projectId) {
      Logger.warn("REPO", "findExistingContract: missing required criteria");
      return null;
    }

    Logger.debug("REPO", "findExistingContract", criteria);

    try {
      // Get all active contracts for the user
      var allContracts = await getActive(userEmail);

      // Find matching project + currency + (optional) contract type
      var match = allContracts.find(function (c) {
        var sameProject = c.projectId === projectId;
        var sameCurrency = !currency || c.currency === currency;
        var sameType = !contractType || c.contractType === contractType;
        return sameProject && sameCurrency && sameType;
      });

      if (match) {
        Logger.info(
          "REPO",
          "✅ Found existing contract for project: " +
            match.projectDisplay +
            " (ID: " +
            match.id +
            ")",
        );
      } else {
        Logger.info(
          "REPO",
          "No existing contract found for project: " + projectId,
        );
      }

      return match || null;
    } catch (err) {
      Logger.error("REPO", "findExistingContract failed", err);
      return null;
    }
  }

  /**
   * Add additional purchased hours to an existing contract
   * Used when client buys more hours for the same project
   *
   * @param {Object} params
   * @param {string} params.id              - Existing contract record ID
   * @param {number} params.additionalHours - Hours to add to existing total
   * @param {number} params.additionalPrice - Price to add to existing price
   * @param {string} [params.newPlanId]     - Optionally update plan reference
   * @param {string} [params.promoCode]     - Optionally update promo code
   * @returns {Promise<void>}
   */
  async function addHoursToContract(params) {
    var id = params.id;
    var additionalHours = params.additionalHours || 0;
    var additionalPrice = params.additionalPrice || 0;
    var newPlanId = params.newPlanId;
    var promoCode = params.promoCode;

    if (!id) {
      throw new Error("Contract ID is required");
    }

    Logger.info("REPO", "addHoursToContract", params);

    try {
      // Fetch current contract to get existing values
      var existing = await getById(id);
      if (!existing) {
        throw new Error("Contract not found: " + id);
      }

      // Calculate new totals
      var newPurchasedHours = existing.purchasedHours + additionalHours;
      var newPrice = existing.price + additionalPrice;

      Logger.info("REPO", "Updating contract hours", {
        old_hours: existing.purchasedHours,
        add_hours: additionalHours,
        new_hours: newPurchasedHours,
        old_price: existing.price,
        add_price: additionalPrice,
        new_price: newPrice,
      });

      // Build update payload
      var updateData = {};
      updateData[F.PURCHASED_HOURS] = newPurchasedHours;
      updateData[F.PRICE] = newPrice;

      if (newPlanId) {
        updateData[F.SUPPORT_PLAN] = newPlanId;
      }
      if (promoCode) {
        updateData[F.PROMOTION_CODE] = promoCode;
      }

      await SdkService.updateRecord({
        reportName: CONSTANTS.REPORTS.SUPPORT_CONTRACT,
        id: id,
        data: updateData,
        invalidateCache: [
          CONSTANTS.CACHE_KEYS.USER_CONTRACTS,
          "contract_record_" + id,
          CONSTANTS.CACHE_KEYS.DASHBOARD_STATS,
        ],
      });

      Logger.info(
        "REPO",
        "✅ Contract updated with new hours: " + newPurchasedHours,
      );
    } catch (err) {
      Logger.error("REPO", "addHoursToContract FAILED", err);
      throw err;
    }
  }

  /**
   * Poll a contract record until Payment_Url is populated
   * Used right after creating a contract — waits for Deluge to fill the URL
   *
   * @param {string} contractId
   * @param {Object} [opts]
   * @param {number} [opts.maxAttempts] - Max polling attempts (default: 20)
   * @param {number} [opts.interval]    - Poll interval ms (default: 1500)
   * @returns {Promise<string|null>} Payment URL or null if timeout
   */
  async function pollForPaymentUrl(contractId, opts) {
    opts = opts || {};
    var maxAttempts = opts.maxAttempts || 20;
    var interval = opts.interval || 1500;

    if (!contractId) return null;

    Logger.info(
      "REPO",
      "pollForPaymentUrl → " +
        contractId +
        " (max " +
        maxAttempts +
        " attempts)",
    );

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Invalidate cache to force fresh fetch
        CacheService.invalidate("contract_record_" + contractId);

        var record = await SdkService.getRecordById({
          reportName: CONSTANTS.REPORTS.SUPPORT_CONTRACT,
          id: contractId,
        });

        if (record) {
          var paymentUrl = SdkService.helpers.getString(
            record,
            F.PAYMENT_URL,
            "",
          );

          if (paymentUrl && paymentUrl.length > 0) {
            Logger.info(
              "REPO",
              "✅ Payment URL ready after " + attempt + " attempts",
            );
            return paymentUrl;
          }
        }

        Logger.debug(
          "REPO",
          "Poll attempt " +
            attempt +
            "/" +
            maxAttempts +
            " — URL not ready yet",
        );
      } catch (err) {
        Logger.error(
          "REPO",
          "pollForPaymentUrl error on attempt " + attempt,
          err,
        );
      }

      // Wait before next attempt (unless last)
      if (attempt < maxAttempts) {
        await new Promise(function (resolve) {
          setTimeout(resolve, interval);
        });
      }
    }

    Logger.warn(
      "REPO",
      "pollForPaymentUrl TIMEOUT after " + maxAttempts + " attempts",
    );
    return null;
  }

  /**
   * Check current payment status of a contract
   * Used to verify after user returns from payment gateway
   *
   * @param {string} contractId
   * @returns {Promise<string>} Payment status ("Pending", "Captured", "Failed")
   */
  async function getPaymentStatus(contractId) {
    if (!contractId) return "";

    try {
      // Force fresh fetch
      CacheService.invalidate("contract_record_" + contractId);

      var record = await SdkService.getRecordById({
        reportName: CONSTANTS.REPORTS.SUPPORT_CONTRACT,
        id: contractId,
      });

      if (!record) return "";

      return SdkService.helpers.getString(record, F.PAYMENT_STATUS, "");
    } catch (err) {
      Logger.error("REPO", "getPaymentStatus failed", err);
      return "";
    }
  }

  /**
   * Poll for payment completion
   * Used after user opens payment URL — checks periodically if paid
   *
   * @param {string} contractId
   * @param {Object} [opts]
   * @returns {Promise<boolean>} true if paid, false if timeout/failed
   */
  async function pollForPaymentCapture(contractId, opts) {
    opts = opts || {};
    var maxAttempts = opts.maxAttempts || 120; // 6 minutes total
    var interval = opts.interval || 3000; // Poll every 3 sec

    if (!contractId) return false;

    Logger.info("REPO", "pollForPaymentCapture → " + contractId);

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        var status = await getPaymentStatus(contractId);

        if (status === CONSTANTS.STATUS.PAYMENT.CAPTURED) {
          Logger.info(
            "REPO",
            "✅ Payment captured after " + attempt + " attempts",
          );
          return true;
        }

        if (status === CONSTANTS.STATUS.PAYMENT.FAILED) {
          Logger.warn("REPO", "❌ Payment failed");
          return false;
        }

        Logger.debug(
          "REPO",
          "Payment status: " + status + " (attempt " + attempt + ")",
        );
      } catch (err) {
        Logger.error("REPO", "pollForPaymentCapture error", err);
      }

      if (attempt < maxAttempts) {
        await new Promise(function (resolve) {
          setTimeout(resolve, interval);
        });
      }
    }

    Logger.warn("REPO", "pollForPaymentCapture TIMEOUT");
    return false;
  }
  // =========================================================================
  // EXPOSE PUBLIC API
  // =========================================================================
  return {
    getForUser: getForUser,
    getById: getById,
    getActive: getActive,
    getForContractsPage: getForContractsPage,
    getPendingPayment: getPendingPayment,
    getHoursSummary: getHoursSummary,
    findExistingContract: findExistingContract,
    addHoursToContract: addHoursToContract,
    create: create,
    updateConsumedHours: updateConsumedHours,
    pollForPaymentUrl: pollForPaymentUrl,
    pollForPaymentCapture: pollForPaymentCapture,
    getPaymentStatus: getPaymentStatus,
    incrementConsumedHours: incrementConsumedHours,
    refresh: refresh,
  };
})();
