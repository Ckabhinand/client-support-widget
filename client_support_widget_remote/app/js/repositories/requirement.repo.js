/* ==========================================================================
   REQUIREMENT.REPO.JS — Requirement Repository
   
   Owns all data access for the Requirement form/report.
   
   PUBLIC METHODS:
     RequirementRepo.getForUser(userEmail)   → Array of requirement DTOs
     RequirementRepo.getById(id)             → Single requirement DTO
     RequirementRepo.getByContract(contractId) → Filter by contract
     RequirementRepo.getActive(userEmail)    → Non-completed requirements
     RequirementRepo.create(data)            → New requirement ID
     RequirementRepo.updateStatus(id,status) → Update status field
     RequirementRepo.refresh(userEmail)      → Force fresh fetch
   ========================================================================== */

"use strict";

var RequirementRepo = (function () {
  var F = CONSTANTS.FIELDS.REQUIREMENT;
  var H = SdkService.helpers;

  // =========================================================================
  // PRIVATE — DTO Mapping
  // =========================================================================

  /**
   * Map raw SDK record → clean Requirement DTO
   *
   * Requirement DTO shape:
   * {
   *   id              : string,
   *   contractId      : string,
   *   contractDisplay : string,
   *   projectDisplay  : string,
   *   projectId       : string,
   *   clientDisplay   : string,
   *   clientId        : string,
   *   subject         : string,
   *   details         : string,
   *   attachments     : Array,   // File URL strings
   *   submittedDate   : string,
   *   status          : string,
   *   badgeClass      : string,  // CSS badge class from CONSTANTS
   *   isActive        : boolean,
   *   isCompleted     : boolean
   * }
   */
  function _toDTO(record) {
    if (!record) return null;

    var status = H.getString(record, F.STATUS, "");
    var badgeClass = CONSTANTS.REQ_STATUS_BADGE[status] || "badge-gray";

    var isCompleted =
      status === CONSTANTS.STATUS.REQUIREMENT.COMPLETED ||
      status === CONSTANTS.STATUS.REQUIREMENT.CLOSED ||
      status === CONSTANTS.STATUS.REQUIREMENT.REJECTED;

    var isActive = !isCompleted;

    // ── Attachments: File upload returns array of URL strings ──
    var rawAttachments = record[F.ATTACHMENTS];
    var attachments = Array.isArray(rawAttachments)
      ? rawAttachments
      : rawAttachments
        ? [rawAttachments]
        : [];

    return {
      id: H.getString(record, "ID", ""),
      contractId: H.getLookupId(record, F.SUPPORT_CONTRACT),
      contractDisplay: H.getLookupDisplay(record, F.SUPPORT_CONTRACT),
      projectDisplay: H.getLookupDisplay(record, F.PROJECT),
      projectId: H.getLookupId(record, F.PROJECT),
      clientDisplay: H.getLookupDisplay(record, F.CLIENT),
      clientId: H.getLookupId(record, F.CLIENT),
      subject: H.getString(record, F.SUBJECT, ""),
      details: H.getString(record, F.REQUIREMENT_DETAILS, ""),
      attachments: attachments,
      submittedDate: H.getString(record, F.SUBMITTED_DATE, ""),
      status: status,
      badgeClass: badgeClass,
      isActive: isActive,
      isCompleted: isCompleted,
    };
  }

  function _toDTOs(records) {
    return (records || []).map(_toDTO).filter(function (dto) {
      return dto !== null;
    });
  }

  // =========================================================================
  // PUBLIC METHODS
  // =========================================================================

  /**
   * Get all requirements for a user (filtered by client lookup)
   *
   * @param {string} userEmail
   * @returns {Promise<Array>} Requirement DTOs
   */
  async function getForUser(userEmail) {
    if (!userEmail) {
      Logger.warn("REPO", "RequirementRepo.getForUser → empty email");
      return [];
    }

    Logger.debug("REPO", "RequirementRepo.getForUser → " + userEmail);

    try {
      // Filter by Client lookup's Company_Email field
      var records = await SdkService.getRecords({
        reportName: CONSTANTS.REPORTS.REQUIREMENT,
        criteria: "(" + F.CLIENT + '.Company_Email == "' + userEmail + '")',
        cacheKey: CONSTANTS.CACHE_KEYS.USER_REQUIREMENTS + "_" + userEmail,
        cacheTTL: CONSTANTS.CACHE_TTL.MEDIUM,
      });

      var dtos = _toDTOs(records);
      Logger.info(
        "REPO",
        "RequirementRepo.getForUser → " + dtos.length + " requirements",
      );
      return dtos;
    } catch (err) {
      Logger.error("REPO", "RequirementRepo.getForUser FAILED", err);
      return [];
    }
  }
  /**
   * Get single requirement by ID
   *
   * @param {string} id
   * @returns {Promise<Object|null>} Requirement DTO
   */
  async function getById(id) {
    if (!id) return null;

    Logger.debug("REPO", "RequirementRepo.getById → " + id);

    try {
      var record = await SdkService.getRecordById({
        reportName: CONSTANTS.REPORTS.REQUIREMENT,
        id: id,
        cacheKey: "requirement_record_" + id,
        cacheTTL: CONSTANTS.CACHE_TTL.MEDIUM,
      });

      return _toDTO(record);
    } catch (err) {
      Logger.error("REPO", "RequirementRepo.getById FAILED → " + id, err);
      return null;
    }
  }

  /**
   * Get requirements by support contract ID
   *
   * @param {string} contractId
   * @returns {Promise<Array>} Requirement DTOs
   */
  async function getByContract(contractId) {
    if (!contractId) return [];

    Logger.debug("REPO", "RequirementRepo.getByContract → " + contractId);

    try {
      var records = await SdkService.getRecords({
        reportName: CONSTANTS.REPORTS.REQUIREMENT,
        criteria: "(" + F.SUPPORT_CONTRACT + ' == "' + contractId + '")',
        cacheTTL: CONSTANTS.CACHE_TTL.MEDIUM,
      });

      return _toDTOs(records);
    } catch (err) {
      Logger.error("REPO", "RequirementRepo.getByContract FAILED", err);
      return [];
    }
  }

  /**
   * Get only active (non-completed) requirements for a user
   *
   * @param {string} userEmail
   * @returns {Promise<Array>} Active Requirement DTOs
   */
  async function getActive(userEmail) {
    var all = await getForUser(userEmail);
    return all.filter(function (r) {
      return r.isActive;
    });
  }

  /**
   * Create a new requirement
   *
   * @param {Object} formData - Form field values
   * @returns {Promise<string>} New record ID
   */
  async function create(formData) {
    Logger.debug("REPO", "RequirementRepo.create", formData);

    try {
      var newId = await SdkService.addRecord({
        formName: CONSTANTS.FORMS.REQUIREMENT,
        data: formData,
      });

      // ── Invalidate ALL requirement caches (pattern-based, safe) ──
      CacheService.invalidatePattern("requirement");
      CacheService.invalidatePattern("user_requirements");
      CacheService.invalidate(CONSTANTS.CACHE_KEYS.DASHBOARD_STATS);

      Logger.info("REPO", "RequirementRepo.create ✅ → ID: " + newId);
      return newId;
    } catch (err) {
      Logger.error("REPO", "RequirementRepo.create FAILED", err);
      throw err;
    }
  }

  /**
   * Update status of a requirement
   *
   * @param {string} id     - Requirement record ID
   * @param {string} status - New status value (use CONSTANTS.STATUS.REQUIREMENT)
   * @returns {Promise<void>}
   */
  async function updateStatus(id, status) {
    Logger.debug(
      "REPO",
      "RequirementRepo.updateStatus → " + id + " status: " + status,
    );

    try {
      await SdkService.updateRecord({
        reportName: CONSTANTS.REPORTS.REQUIREMENT,
        id: id,
        data: { [F.STATUS]: status },
        invalidateCache: [
          CONSTANTS.CACHE_KEYS.USER_REQUIREMENTS,
          "requirement_record_" + id,
          CONSTANTS.CACHE_KEYS.DASHBOARD_STATS,
        ],
      });

      Logger.info("REPO", "RequirementRepo.updateStatus ✅ → " + id);
    } catch (err) {
      Logger.error("REPO", "RequirementRepo.updateStatus FAILED", err);
      throw err;
    }
  }

  /**
   * Force refresh — clears cache and re-fetches
   * @param {string} userEmail
   * @returns {Promise<Array>}
   */
  async function refresh(userEmail) {
    Logger.info("REPO", "RequirementRepo.refresh → clearing cache");
    CacheService.invalidatePattern("requirement");
    CacheService.invalidate(
      CONSTANTS.CACHE_KEYS.USER_REQUIREMENTS + "_" + userEmail,
    );
    return getForUser(userEmail);
  }

  // =========================================================================
  // EXPOSE PUBLIC API
  // =========================================================================
  return {
    getForUser: getForUser,
    getById: getById,
    getByContract: getByContract,
    getActive: getActive,
    create: create,
    updateStatus: updateStatus,
    refresh: refresh,
  };
})();
