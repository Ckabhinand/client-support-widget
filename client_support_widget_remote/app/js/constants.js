/* ==========================================================================
   CONSTANTS.JS — Application-Wide Constants
   Single source of truth for all hardcoded values.
   
   RULE: Never hardcode app names, field names, or status values
         anywhere else in the codebase. Always reference CONSTANTS.
   ========================================================================== */

'use strict';

var CONSTANTS = (function () {

    // =========================================================================
    // APPLICATION
    // =========================================================================
    var APP = {
        NAME          : 'client-support',        // Zoho Creator app link name
        TITLE         : 'ClientHub',             // Display title
        SUBTITLE      : 'Support Portal',        // Topbar subtitle
        DEFAULT_PAGE  : 'dashboard',             // First page loaded on boot
        DATE_FORMAT   : 'dd-MMM-yyyy',           // Matches Zoho Creator app setting
        TIMEZONE      : 'America/Chicago'        // Matches app timezone setting
    };

    // =========================================================================
    // FORM NAMES (used in addRecords → form_name)
    // =========================================================================
    var FORMS = {
        SUPPORT_CONTRACT : 'Support_Contract',
        REQUIREMENT      : 'Requirement',
        PROPOSED_TASKS   : 'Proposed_Tasks',
        PRICING          : 'Pricing',
        PROMOTION        : 'Promotion',
        BUG_REPORT       : 'Bug_Report'
    };

    // =========================================================================
    // REPORT NAMES (used in getRecords, getRecordById, update, delete)
    // =========================================================================
    var REPORTS = {
        SUPPORT_CONTRACT : 'Support_Contract_Report',
        REQUIREMENT      : 'Requirement_Report',
        PROPOSED_TASKS   : 'Proposed_Tasks_Report',
        PRICING          : 'Pricing_Report',
        PROMOTION        : 'Promotion_Report',
        BUG_REPORT       : 'All_Bug_Reports'
    };

    // =========================================================================
    // FIELD NAMES — Support_Contract Form
    // ⚠️ CRITICAL: "clinent" is the real API name (typo in backend — do not fix)
    // =========================================================================
    var FIELDS = {

        SUPPORT_CONTRACT: {
            ID               : 'ID',
            CLIENT           : 'clinent',           // ⚠️ Typo — must stay as-is
            PROJECT          : 'Project',
            EMAIL            : 'Email',
            CURRENCY         : 'Currency',
            SUPPORT_PLAN     : 'Support_Plan',
            PROMOTION_CODE   : 'Promotion_Code',
            PRICE            : 'Price',
            PURCHASE_DATE    : 'Purchase_Date',
            PURCHASED_HOURS  : 'Purchased_Hours',
            CONSUMED_HOURS   : 'Consumed_Hours',
            CONTRACT_STATUS  : 'Contract_Status',
            PAYMENT_URL      : 'Payment_Url',
            PAYMENT_STATUS   : 'Payment_Status'
        },

        // ── Requirement Form ──────────────────────────────────────────────────
        REQUIREMENT: {
            ID                  : 'ID',
            SUPPORT_CONTRACT    : 'Support_Contract',
            PROJECT             : 'Project',
            CLIENT              : 'Client',
            SUBJECT             : 'Subject_field',    // Note: _field suffix
            REQUIREMENT_DETAILS : 'Requirement_Details',
            ATTACHMENTS         : 'Attachments',
            SUBMITTED_DATE      : 'Submitted_Date',
            STATUS              : 'Status'
        },

        // ── Proposed_Tasks Form ───────────────────────────────────────────────
        PROPOSED_TASKS: {
            ID               : 'ID',
            TASK_NAME        : 'Task_Name',
            PROJECT          : 'Project',
            REQUIREMENT      : 'Requirement',
            DESCRIPTION      : 'Description',
            ESTIMATED_HOURS  : 'Estimated_Hours',
            STATUS           : 'Status',
            PRIORITY         : 'Priority',
            OWNER            : 'Owner',
            PERCENT          : 'Percent',
            REJECTION_REASON : 'Rejection_Reason'
        },

        // ── Pricing Form ──────────────────────────────────────────────────────
        PRICING: {
            ID             : 'ID',
            TITLE          : 'Title',
            SUPPORT_HOURS  : 'Support_Hours',
            CURRENCY       : 'Currency',
            PRICE          : 'Price'
        },

        // ── Promotion Form ────────────────────────────────────────────────────
        PROMOTION: {
            ID               : 'ID',
            PROMOTION_NAME   : 'Promotion_Name',
            PROMOTION_CODE   : 'Promotion_Code',
            DESCRIPTION      : 'Description',
            PROMOTION_TYPE   : 'Promotion_Type',
            VALID_FROM       : 'Valid_From',
            VALID_TO         : 'Valid_To',
            STATUS           : 'Status',
            DISCOUNT_RATE    : 'Discount_Rate',
            NUMBER_OF_HOURS  : 'Number_Of_Hours'
        },

        // ── Bug Report Form ───────────────────────────────────────────────────────
        BUG_REPORT: {
            ID                : 'ID',
            SUPPORT_CONTRACT  : 'Support_Contract',
            PROJECT           : 'Project',
            CLIENT            : 'Client',
            BUG_DESCRIPTION   : 'Bug_Description',
            SUPPORT_DOCUMENTS : 'Support_Documents',
            STATUS            : 'Status'
        },
    };

    // =========================================================================
    // STATUS VALUES — Must match exactly what is stored in Zoho Creator
    // =========================================================================
    var STATUS = {

        // ── Support Contract ──────────────────────────────────────────────────
        CONTRACT: {
            ACTIVE   : 'Active',
            INACTIVE : 'Inactive'
        },

        // ── Requirement ───────────────────────────────────────────────────────
        REQUIREMENT: {
            SUBMITTED           : 'Submitted',
            UNDER_REVIEW        : 'Under Review',
            NEED_MORE_INFO      : 'Need More Information',
            WAITING_APPROVAL    : 'Waiting For Approval',
            APPROVED            : 'Approved',
            IN_PROGRESS         : 'In Progress',
            COMPLETED           : 'Completed',
            CLOSED              : 'Closed',
            REJECTED            : 'Rejected'
        },

        // ── Proposed Tasks ────────────────────────────────────────────────────
        // ⚠️ These are the CONFIRMED updated values (not "Choice 1/2/3")
        TASK: {
            NOT_STARTED          : 'Not Started',
            START_APPROVAL       : 'Start Approval',
            IN_PROGRESS          : 'In Progress',
            COMPLETED            : 'Completed',
            COMPLETION_APPROVED  : 'Completion Approved',
            TASK_REJECTED        : 'Task Rejected'
        },

        PAYMENT: {
            CAPTURED : 'Captured',
            PENDING  : 'Pending',
            FAILED   : 'Not Captured'
        },

        // ── Bug Report ───────────────────────────────────────────────────────
        BUG_REPORT: {
            SUBMITTED         : 'Submitted',
            REVIEWING         : 'Reviewing',
            RESOLUTION_NEEDED : 'Resolution Needed'
        },

        // ── Promotion ─────────────────────────────────────────────────────────
        PROMOTION: {
            ACTIVE   : 'Active',
            INACTIVE : 'Inactive',
            EXPIRED  : 'Expired'
        }
    };

    // =========================================================================
    // PRIORITY VALUES — Proposed_Tasks.Priority picklist
    // =========================================================================
    var PRIORITY = {
        HIGH   : 'High',
        MEDIUM : 'Medium',
        LOW    : 'Low'
    };

    // =========================================================================
    // PROMOTION TYPES — Promotion.Promotion_Type picklist
    // =========================================================================
    var PROMOTION_TYPE = {
        FREE_HOURS      : 'Free Hours',
        PERCENTAGE      : 'Percentage Discount',
        FIXED           : 'Fixed Discount',
        RENEWAL_BONUS   : 'Renewal Bonus',
        NEW_CLIENT      : 'New Client Offer'
    };

    // =========================================================================
    // CURRENCY OPTIONS
    // =========================================================================
    var CURRENCY = {
        USD : 'USD',
        INR : 'INR',
        EUR : 'EUR',

        // Conversion rates (base: USD)
        // These are fallback rates — ideally driven by Pricing records per currency
        RATES: {
            USD : 1,
            INR : 94.38,
            EUR : 0.88
        },

        // Currency symbols for display
        SYMBOLS: {
            USD : '$',
            INR : '₹',
            EUR : '€'
        }
    };

    // =========================================================================
    // CACHE KEYS — Used by CacheService (Part 4)
    // =========================================================================
    var CACHE_KEYS = {
        USER_CONTRACTS    : 'user_contracts',
        USER_REQUIREMENTS : 'user_requirements',
        USER_TASKS        : 'user_tasks',
        PRICING_PLANS     : 'pricing_plans',
        PROMOTIONS        : 'promotions',
        DASHBOARD_STATS   : 'dashboard_stats',
        INIT_PARAMS       : 'init_params',
        USER_BUG_REPORTS  : 'user_bug_reports'

    };

    // =========================================================================
    // CACHE TTL (Time-To-Live in milliseconds)
    // =========================================================================
    var CACHE_TTL = {
        SHORT    : 60 * 1000,          //  1 minute  — frequently changing data
        MEDIUM   : 5 * 60 * 1000,     //  5 minutes — semi-stable data
        LONG     : 15 * 60 * 1000,    // 15 minutes — stable data (pricing, promotions)
        SESSION  : 30 * 60 * 1000     // 30 minutes — user context
    };

    // =========================================================================
    // SDK ERROR CODES
    // =========================================================================
    var ERROR_CODES = {
        SUCCESS          : 3000,    // Successful operation
        CRITERIA_REQD    : 3090,    // updateRecords/deleteRecords missing criteria
        NO_RECORDS       : 9280     // getRecords matched zero records (treat as empty)
    };

    // =========================================================================
    // PAGINATION DEFAULTS
    // =========================================================================
    var PAGINATION = {
        DEFAULT_PAGE      : 1,
        DEFAULT_PAGE_SIZE : 200,    // Max allowed by SDK
        MAX_PAGE_SIZE     : 200
    };

    // =========================================================================
    // UI CONSTANTS
    // =========================================================================
    var UI = {
        TOAST_DURATION       : 4000,     // ms — toast auto-dismiss
        DEBOUNCE_DELAY       : 300,      // ms — search input debounce
        ANIMATION_DELAY      : 300,      // ms — page transition delay
        PROGRESS_ANIM_DELAY  : 200,      // ms — progress bar animation delay
        LOADING_MIN_DURATION : 500,      // ms — minimum loading state duration
        MAX_FILE_COUNT       : 10,       // Max file uploads per requirement
        LOW_HOURS_THRESHOLD  : 5         // Hours remaining before "low" warning
    };

    // =========================================================================
    // PAGE IDs — Match HTML id="page-{id}" attributes
    // =========================================================================
    var PAGES = {
        DASHBOARD    : 'dashboard',
        PURCHASE     : 'purchase',
        REQUIREMENTS : 'requirements',
        TASKS        : 'tasks',
        CONTRACTS    : 'contracts',
        SETTINGS     : 'settings',
        BUG_REPORT   : 'bug-report'  
    };

    // =========================================================================
    // TASK TAB IDs — Match HTML data-tab="{id}" attributes
    // =========================================================================
    var TASK_TABS = {
        PENDING   : 'pending',
        PROGRESS  : 'progress',
        COMPLETED : 'completed',
        ALL       : 'all'
    };

    // =========================================================================
    // LOG LEVELS — Used by Logger (Part 3)
    // =========================================================================
    var LOG_LEVELS = {
        DEBUG : 0,
        INFO  : 1,
        WARN  : 2,
        ERROR : 3,
        NONE  : 4     // Disable all logging (production)
    };

    // =========================================================================
    // ENVIRONMENT
    // =========================================================================
    var ENV = {
        // Set to LOG_LEVELS.NONE in production
        LOG_LEVEL : 0,                                  // DEBUG during development

        // Zoho Data Center base URLs (for file downloads)
        DC_URLS: {
            US  : 'https://creatorapp.zoho.com',
            IN  : 'https://creatorapp.zoho.in',
            EU  : 'https://creatorapp.zoho.eu',
            AU  : 'https://creatorapp.zoho.com.au'
        },

        // Active data center (change based on deployment)
        ACTIVE_DC : 'IN'
    };

    // =========================================================================
    // HTML ELEMENT IDs — Centralized DOM ID references
    // =========================================================================
    var DOM = {
        // Toast
        TOAST          : 'toast',
        TOAST_TITLE    : 'toastTitle',
        TOAST_MSG      : 'toastMsg',

        // Alert bar
        ALERT_BAR      : 'alertBar',

        // Dashboard
        DONUT_NUM      : 'donutNum',
        USAGE_FILL     : 'usageFill',
        USAGE_TEXT_L   : 'usageTextLeft',
        USAGE_TEXT_R   : 'usageTextRight',

        // Hours card
        HOURS_TOTAL    : 'hoursTotal',
        HOURS_USED     : 'hoursUsed',
        HOURS_REMAINING: 'hoursRemaining',

        // Balance strip
        BAL_TOTAL      : 'balTotal',
        BAL_USED       : 'balUsed',
        BAL_REMAINING  : 'balRemaining',
        BAL_CONTRACT   : 'balContract',

        // Stats grid
        STAT_HOURS     : 'statHours',
        STAT_REQS      : 'statReqs',
        STAT_TASKS     : 'statTasks',
        STAT_APPROVALS : 'statApprovals',

        // Active requirements list
        ACTIVE_REQS_LIST : 'activeReqsList',

        // Task progress mini list
        TASK_MINI_LIST   : 'taskMiniList',

        // Timeline
        TIMELINE_CONTENT : 'timelineContent',
        TIMELINE_SUBTITLE: 'timelineSubtitle',
        TIMELINE_PHASE   : 'timelinePhase',
        TL_PROJ_ICON     : 'tlProjIcon',
        TL_PROJ_NAME     : 'tlProjName',
        TL_PROJ_STATS    : 'tlProjStats',
        TL_PROJ_DOTS     : 'tlProjDots',
        TL_CURRENT_IDX   : 'tlCurrentIdx',
        TL_TOTAL_COUNT   : 'tlTotalCount',

        // Approvals
        APPROVAL_GRID    : 'approvalGrid',

        // Requirements page
        REQ_TABLE_BODY   : 'reqTableBody',
        REQ_SEARCH       : 'reqSearch',
        REQ_STATUS_FILTER: 'reqStatusFilter',
        REQ_PROJ_FILTER  : 'reqProjFilter',

        // Detail panel
        DETAIL_OVERLAY   : 'detailOverlay',
        DETAIL_PANEL     : 'detailPanel',
        DP_REQ_ID        : 'dpReqId',
        DP_TITLE         : 'dpTitle',
        DP_SUBTITLE      : 'dpSubtitle',
        DP_PROJECT_TAG   : 'dpProjectTag',
        DP_STATUS        : 'dpStatus',
        DP_SUBMITTED     : 'dpSubmitted',
        DP_TASK_COUNT    : 'dpTaskCount',
        DP_HOURS         : 'dpHours',
        DP_PROGRESS      : 'dpProgress',
        DP_PROGRESS_FILL : 'dpProgressFill',
        DP_DESCRIPTION   : 'dpDescription',
        DP_TASK_NUMBER   : 'dpTaskNumber',
        DP_TASK_LIST     : 'dpTaskList',

        // Tasks page
        SECTION_PENDING   : 'section-pending',
        SECTION_PROGRESS  : 'section-progress',
        SECTION_COMPLETED : 'section-completed',
        SECTION_ALL       : 'section-all',
        TASK_SEARCH       : 'taskSearch',
        PROJECT_FILTER    : 'projectFilter',
        PRIORITY_FILTER   : 'priorityFilter',
        OWNER_FILTER      : 'ownerFilter',
        SEL_COUNT         : 'selCount',
        SEL_HOURS         : 'selHours',
        SELECTION_STATUS  : 'selectionStatus',
        ACTIVE_FILTER_CHIPS: 'activeFilterChips',
        EMPTY_STATE       : 'emptyState',

        // Modals
        REQUIREMENT_MODAL : 'requirementModal',
        CONCERN_MODAL     : 'concernModal',
        CONCERN_TASK_INFO : 'concernTaskInfo',

        // Pricing
        ORDER_SECTION     : 'orderSection',
        PROMO_INPUT       : 'promoInput',
        PROMO_FEEDBACK    : 'promoFeedback',
        SUM_PLAN          : 'sumPlan',
        SUM_SUB           : 'sumSub',
        SUM_DISCOUNT      : 'sumDiscount',
        SUM_DISCOUNT_LINE : 'sumDiscountLine',
        SUM_TOTAL         : 'sumTotal',
        PLANS_GRID        : 'plansGrid',

        // Contracts
        CONTRACTS_GRID    : 'contractsGrid',

        // Settings
        SETTINGS_NAME     : 'settingsName',
        SETTINGS_EMAIL    : 'settingsEmail',
        SETTINGS_COMPANY  : 'settingsCompany',

        // Navigation
        NAV_USER_NAME     : 'navUserName',
        NAV_USER_ORG      : 'navUserOrg',
        NAV_AVATAR        : 'navAvatar',

        // Loading overlay
        LOADING_OVERLAY   : 'loadingOverlay',

        // Rejection modal
        REJECTION_MODAL     : 'rejectionModal',
        REJECTION_REASON    : 'rejectionReason',
        REJECTION_TASK_INFO : 'rejectionTaskInfo',

        // Bug report page
        BUG_REPORTS_LIST    : 'bugReportsList',
        BUG_MODAL           : 'bugReportModal',
        BUG_CONTRACT        : 'bugContract',
        BUG_DESCRIPTION     : 'bugDescription',
        BUG_FILE_INPUT      : 'bugFileInput',
        BUG_FILE_LIST       : 'bugFileList',
        BUG_PROJECT_INFO    : 'bugProjectInfo',
        BUG_CLIENT_INFO     : 'bugClientInfo',
    };

    // =========================================================================
    // PROJECT COLORS — For project tag visual theming
    // These are display colors — matched by project name
    // =========================================================================
    var PROJECT_COLORS = {
        DEFAULT : '#2563EB'
        // Additional colors assigned dynamically based on project index
    };

    // Color palette for dynamic project assignment
    var PROJECT_COLOR_PALETTE = [
        '#2563EB',    // Blue
        '#8B5CF6',    // Purple
        '#10B981',    // Green
        '#F59E0B',    // Amber
        '#EF4444',    // Red
        '#06B6D4',    // Cyan
        '#EC4899',    // Pink
        '#6366F1'     // Indigo
    ];

    // =========================================================================
    // REQUIREMENT STATUS → BADGE CLASS MAPPING
    // =========================================================================
    var REQ_STATUS_BADGE = {
        'Submitted'              : 'badge-gray',
        'Under Review'           : 'badge-amber',
        'Need More Information'  : 'badge-red',
        'Waiting For Approval'   : 'badge-amber',
        'Approved'               : 'badge-blue',
        'In Progress'            : 'badge-blue',
        'Completed'              : 'badge-success',
        'Closed'                 : 'badge-gray',
        'Rejected'               : 'badge-red'
    };

    // =========================================================================
    // TASK STATUS → CSS CLASS MAPPING (for task-status-pill)
    // =========================================================================
    var TASK_STATUS_CLASS = {
        'Not Started'          : 'not-started',
        'Start Approval'       : 'start-approval',
        'In Progress'          : 'in-progress',
        'Completed'            : 'completed',
        'Completion Approved'  : 'completion-approved',
        'Task Rejected'        : 'rejected'
    };

    // =========================================================================
    // PRIORITY → CSS CLASS MAPPING (for priority-pill)
    // =========================================================================
    var PRIORITY_CLASS = {
        'High'   : 'high',
        'Medium' : 'medium',
        'Low'    : 'low'
    };

    // =========================================================================
    // BUG REPORT STATUS → CSS CLASS MAPPING (for bug-status-badge)
    // =========================================================================
    var BUG_STATUS_CLASS = {
        'Submitted'         : 'submitted',
        'Reviewing'         : 'reviewing',
        'Resolution Needed' : 'resolution-needed'
    };

    // =========================================================================
    // PUBLIC API — Expose all constant groups
    // =========================================================================
    return {
        APP                 : APP,
        FORMS               : FORMS,
        REPORTS             : REPORTS,
        FIELDS              : FIELDS,
        STATUS              : STATUS,
        PRIORITY            : PRIORITY,
        PROMOTION_TYPE      : PROMOTION_TYPE,
        CURRENCY            : CURRENCY,
        CACHE_KEYS          : CACHE_KEYS,
        CACHE_TTL           : CACHE_TTL,
        ERROR_CODES         : ERROR_CODES,
        PAGINATION          : PAGINATION,
        UI                  : UI,
        PAGES               : PAGES,
        TASK_TABS           : TASK_TABS,
        LOG_LEVELS          : LOG_LEVELS,
        ENV                 : ENV,
        DOM                 : DOM,
        PROJECT_COLORS      : PROJECT_COLORS,
        PROJECT_COLOR_PALETTE : PROJECT_COLOR_PALETTE,
        REQ_STATUS_BADGE    : REQ_STATUS_BADGE,
        TASK_STATUS_CLASS   : TASK_STATUS_CLASS,
        PRIORITY_CLASS      : PRIORITY_CLASS,
        BUG_STATUS_CLASS    : BUG_STATUS_CLASS
    };

})();