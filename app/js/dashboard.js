/* ==========================================================================
   DASHBOARD.JS — Dashboard Page Module
   
   Renders and manages the Dashboard page.
   Subscribes to state events for live updates.
   Clicking a requirement navigates to the Requirements tab.
   ========================================================================== */

"use strict";

var DashboardModule = (function () {
  var _initialized = false;
  var _unsubscribers = [];

  // =========================================================================
  // PRIVATE — DOM Helpers
  // =========================================================================

  function _el(id) {
    return document.getElementById(id);
  }

  function _setHTML(id, html) {
    var el = _el(id);
    if (el) el.innerHTML = html;
  }

  function _setText(id, text) {
    var el = _el(id);
    if (el) el.textContent = String(text);
  }

  function _setStyle(id, prop, value) {
    var el = _el(id);
    if (el) el.style[prop] = value;
  }

  function _toggleClass(id, cls, force) {
    var el = _el(id);
    if (el) el.classList.toggle(cls, force);
  }

  // =========================================================================
  // PRIVATE — Render Functions
  // =========================================================================

  function _renderHero() {
    var user = AppState.get("user");
    var name = user.name || "there";

    var heroHeading = document.querySelector("#page-dashboard .page-hero h1");
    if (heroHeading) {
      heroHeading.innerHTML =
        "Welcome back, " + _escapeHtml(name) + ' <span class="wave">👋</span>';
    }

    Logger.debug("DASHBOARD", "Hero rendered → " + name);
  }

  function _renderAlertBar() {
    var exceeded = AppState.computed("hoursExceeded");
    var hoursLow = AppState.computed("hoursLow");
    var remaining = AppState.computed("remainingHours");
    var purchased = AppState.computed("purchasedHours");
    var alertBar = _el(CONSTANTS.DOM.ALERT_BAR);

    if (!alertBar) return;

    if (exceeded) {
      alertBar.style.display = "";
      alertBar.style.opacity = "1";
      alertBar.style.transform = "";

      var msgEl = alertBar.querySelector(".alert-message strong");
      var subEl = alertBar.querySelector(".alert-message span");

      if (msgEl) msgEl.textContent = "Hours Limit Reached";
      if (subEl)
        subEl.textContent =
          "You have used all " +
          purchased +
          " purchased hours. " +
          "Buy more hours to continue.";
    } else if (hoursLow) {
      alertBar.style.display = "";
      alertBar.style.opacity = "1";
      alertBar.style.transform = "";

      var msgEl2 = alertBar.querySelector(".alert-message strong");
      var subEl2 = alertBar.querySelector(".alert-message span");

      if (msgEl2) msgEl2.textContent = "Hours Running Low";
      if (subEl2)
        subEl2.textContent =
          "Only " +
          remaining +
          " hours remaining. " +
          "Consider purchasing more.";
    } else {
      alertBar.style.display = "none";
    }

    Logger.debug("DASHBOARD", "Alert bar rendered", {
      exceeded: exceeded,
      hoursLow: hoursLow,
      remaining: remaining,
    });
  }

  function _renderStatsGrid() {
    var remaining = AppState.computed("remainingHours");
    var purchased = AppState.computed("purchasedHours");
    var usagePct = AppState.computed("usagePercent");
    var availPct = 100 - usagePct;
    var activeReqs = AppState.computed("activeReqCount");
    var taskSummary = AppState.get("tasks").summary;
    var pendingCount = AppState.computed("pendingCount");
    var exceeded = AppState.computed("hoursExceeded");

    // ── Stat 1: Hours Remaining ──
    var stat1 = _el("statCard1");
    if (stat1) {
      var trend1Class = exceeded ? "warning" : "up";
      var trend1Icon = exceeded
        ? "fa-triangle-exclamation"
        : "fa-arrow-trend-up";
      var trend1Text = exceeded
        ? "Hours exceeded!"
        : availPct.toFixed(1) + "% available";

      stat1.innerHTML = [
        '<div class="stat-icon blue">',
        '  <i class="fa-solid fa-clock"></i>',
        "</div>",
        '<div class="stat-content">',
        '  <span class="stat-label">Hours Remaining</span>',
        '  <div class="stat-value">' + remaining,
        "    <small>/" + purchased + "</small>",
        "  </div>",
        '  <div class="stat-trend ' + trend1Class + '">',
        '    <i class="fa-solid ' + trend1Icon + '"></i>',
        "    <span>" + trend1Text + "</span>",
        "  </div>",
        "</div>",
      ].join("");

      stat1.classList.toggle("warning", exceeded);
    }

    // ── Stat 2: Active Requirements ──
    var stat2 = _el("statCard2");
    if (stat2) {
      var reqs = AppState.get("requirements");
      var inProgressReqs = reqs.list.filter(function (r) {
        return r.status === CONSTANTS.STATUS.REQUIREMENT.IN_PROGRESS;
      }).length;

      stat2.innerHTML = [
        '<div class="stat-icon purple">',
        '  <i class="fa-solid fa-file-lines"></i>',
        "</div>",
        '<div class="stat-content">',
        '  <span class="stat-label">Active Requirements</span>',
        '  <div class="stat-value">' + activeReqs + "</div>",
        '  <div class="stat-trend">',
        '    <span class="dot-mini blue"></span>',
        "    <span>" + inProgressReqs + " in progress</span>",
        "  </div>",
        "</div>",
      ].join("");
    }

    // ── Stat 3: Tasks Completed ──
    var stat3 = _el("statCard3");
    if (stat3) {
      var completedCount = taskSummary.completed || 0;
      var totalCount = taskSummary.total || 0;
      var completedPct =
        totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

      stat3.innerHTML = [
        '<div class="stat-icon green">',
        '  <i class="fa-solid fa-circle-check"></i>',
        "</div>",
        '<div class="stat-content">',
        '  <span class="stat-label">Tasks Completed</span>',
        '  <div class="stat-value">' + completedCount,
        "    <small>/" + totalCount + "</small>",
        "  </div>",
        '  <div class="stat-trend up">',
        '    <i class="fa-solid fa-arrow-trend-up"></i>',
        "    <span>" + completedPct + "% complete</span>",
        "  </div>",
        "</div>",
      ].join("");
    }

    // ── Stat 4: Pending Approvals ──

    // ── Stat 4: Active Projects ──
    var stat4 = _el("statCard4");
    if (stat4) {
      var summary = AppState.get("contracts").hoursSummary;
      var uniqueProjects = summary.uniqueProjects || [];
      var projectCount = uniqueProjects.length;
      var activeContracts = summary.activeCount || 0;

      // Get latest task to show recency
      var allTasks = AppState.get("tasks").list || [];
      var inProgressTasks = allTasks.filter(function (t) {
        return (
          t.status === CONSTANTS.STATUS.TASK.IN_PROGRESS ||
          t.status === CONSTANTS.STATUS.TASK.APPROVED
        );
      }).length;

      var trendText;
      var trendClass;
      var trendIcon;

      if (projectCount === 0) {
        trendText = "No active projects";
        trendClass = "";
        trendIcon = "fa-circle-info";
      } else if (inProgressTasks > 0) {
        trendText =
          inProgressTasks +
          " task" +
          (inProgressTasks !== 1 ? "s" : "") +
          " in progress";
        trendClass = "up";
        trendIcon = "fa-arrow-trend-up";
      } else {
        trendText =
          projectCount +
          " active project" +
          (projectCount !== 1 ? "s" : "");
        trendClass = "";
        trendIcon = "fa-diagram-project";
      }

      stat4.innerHTML = [
        '<div class="stat-icon amber">',
        '  <i class="fa-solid fa-diagram-project"></i>',
        "</div>",
        '<div class="stat-content">',
        '  <span class="stat-label">Active Projects</span>',
        '  <div class="stat-value">' + projectCount + "</div>",
        '  <div class="stat-trend ' + trendClass + '">',
        '    <i class="fa-solid ' + trendIcon + '"></i>',
        "    <span>" + _escapeHtml(trendText) + "</span>",
        "  </div>",
        "</div>",
      ].join("");

      // Remove the warning class (no longer needed)
      stat4.classList.remove("warning");
    }
    Logger.debug("DASHBOARD", "Stats grid rendered");
  }

  function _renderHoursCard() {
    var summary = AppState.get("contracts").hoursSummary;
    // The Support Hours card uses the Support-type summary (falls back to total
    // for legacy data before contract types existed).
    var supportSummary = summary.support || summary;
    var purchased = supportSummary.totalPurchased;
    var consumed = supportSummary.totalConsumed;
    var remaining = supportSummary.totalRemaining;
    var usagePct = supportSummary.usagePercent;

    var activeCount = supportSummary.activeCount || 0;

    var contractEl = document.querySelector(
      "#page-dashboard .card.hours-card:not(.impl-hours-card) .card-subtle",
    );
    if (contractEl) {
      contractEl.style.display = "";
      if (activeCount === 0) {
        contractEl.textContent = "No active plans";
      } else if (activeCount === 1) {
        var firstContract = supportSummary.contracts[0];
        contractEl.textContent =
          firstContract.planDisplay ||
          "Plan SC-" + firstContract.id.slice(-6);
      } else {
        contractEl.textContent = activeCount + " active support plans";
      }
    }

    // ── Donut chart ──
    var circumference = 408.41;
    var dashOffset = circumference - circumference * (usagePct / 100);

    var donutFill = document.querySelector(
      "#page-dashboard .card.hours-card:not(.impl-hours-card) .donut-fill",
    );
    if (donutFill) {
      donutFill.style.transition = "none";
      donutFill.setAttribute("stroke-dashoffset", circumference);

      setTimeout(function () {
        donutFill.style.transition =
          "stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1)";
        donutFill.setAttribute("stroke-dashoffset", dashOffset.toFixed(2));
      }, CONSTANTS.UI.PROGRESS_ANIM_DELAY);
    }

    // ── Donut center text ──
    var donutNum = document.querySelector(
      "#page-dashboard .card.hours-card:not(.impl-hours-card) .donut-num",
    );
    if (donutNum) {
      _animateNumber(donutNum, remaining);
    }

    // ── Data rows ──
    var hoursData = document.querySelector(
      "#page-dashboard .card.hours-card:not(.impl-hours-card) .hours-data",
    );
    if (hoursData) {
      var dataValues = hoursData.querySelectorAll(".data-value");

      if (dataValues[0]) {
        dataValues[0].textContent = purchased + " hrs";
        dataValues[0].classList.remove("remaining");
      }
      if (dataValues[1]) {
        dataValues[1].textContent = consumed + " hrs";
      }
      if (dataValues[2]) {
        dataValues[2].textContent = remaining + " hrs";
        dataValues[2].classList.add("remaining");
      }

      var usageFill = hoursData.querySelector(".usage-fill");
      if (usageFill) {
        usageFill.style.width = "0%";
        setTimeout(function () {
          usageFill.style.width = usagePct + "%";
        }, CONSTANTS.UI.PROGRESS_ANIM_DELAY);
      }

      var usageTexts = hoursData.querySelectorAll(".usage-text span");
      if (usageTexts[0]) {
        usageTexts[0].textContent = usagePct + "% used";
      }
      if (usageTexts[1]) {
        usageTexts[1].textContent = 100 - usagePct + "% remaining";
      }
    }

    Logger.debug("DASHBOARD", "Hours card rendered");
  }

  /**
   * Render the Implementation Hours card.
   * Always visible on the dashboard — shows a zeroed state
   * when the client has no implementation contracts yet.
   */
  function _renderImplementationCard() {
    var card = _el(CONSTANTS.DOM.IMPL_HOURS_CARD);
    if (!card) return;

    var summary = AppState.get("contracts").hoursSummary;
    var impl = summary.implementation || {
      totalPurchased: 0,
      totalConsumed: 0,
      totalRemaining: 0,
      usagePercent: 0,
      activeCount: 0,
      contracts: [],
    };

    card.style.display = "";

    var purchased = impl.totalPurchased || 0;
    var consumed = impl.totalConsumed || 0;
    var remaining = impl.totalRemaining || 0;
    var usagePct = impl.usagePercent || 0;
    var activeCount = impl.activeCount || 0;

    // ── Subtitle (plan reference) ──
    var contractRef = _el(CONSTANTS.DOM.IMPL_CONTRACT_REF);
    if (contractRef) {
      contractRef.style.display = "";
      if (activeCount === 0) {
        contractRef.textContent = "No active plan";
      } else if (activeCount === 1) {
        var firstImpl = impl.contracts[0];
        contractRef.textContent =
          firstImpl.planDisplay || "Plan SC-" + firstImpl.id.slice(-6);
      } else {
        contractRef.textContent = activeCount + " active plans";
      }
    }

    var circumference = 408.41;
    var dashOffset = circumference - circumference * (usagePct / 100);

    var donutFill = card.querySelector(".impl-donut-fill");
    if (donutFill) {
      donutFill.style.transition = "none";
      donutFill.setAttribute("stroke-dashoffset", circumference);
      setTimeout(function () {
        donutFill.style.transition =
          "stroke-dashoffset 2s cubic-bezier(0.4,0,0.2,1)";
        donutFill.setAttribute("stroke-dashoffset", dashOffset.toFixed(2));
      }, CONSTANTS.UI.PROGRESS_ANIM_DELAY);
    }

    var donutNum = _el(CONSTANTS.DOM.IMPL_DONUT_NUM);
    if (donutNum) _animateNumber(donutNum, remaining);

    var totalEl = _el(CONSTANTS.DOM.IMPL_TOTAL);
    if (totalEl) totalEl.textContent = purchased + " hrs";
    var usedEl = _el(CONSTANTS.DOM.IMPL_USED);
    if (usedEl) usedEl.textContent = consumed + " hrs";
    var remEl = _el(CONSTANTS.DOM.IMPL_REMAINING);
    if (remEl) remEl.textContent = remaining + " hrs";

    var usageFill = card.querySelector(".impl-usage-fill");
    if (usageFill) {
      usageFill.style.width = "0%";
      setTimeout(function () {
        usageFill.style.width = usagePct + "%";
      }, CONSTANTS.UI.PROGRESS_ANIM_DELAY);
    }

    var textL = card.querySelector("#implUsageTextLeft");
    if (textL) textL.textContent = usagePct + "% used";
    var textR = card.querySelector("#implUsageTextRight");
    if (textR) textR.textContent = 100 - usagePct + "% remaining";

    Logger.debug("DASHBOARD", "Implementation card rendered", {
      purchased: purchased,
      consumed: consumed,
      remaining: remaining,
    });
  }

  /**
   * Render active requirements list (dash grid card)
   * Click on item → navigate to Requirements tab (no detail panel)
   */
  function _renderActiveRequirements() {
    var reqs = AppState.get("requirements");
    var activeReqs = reqs.active.slice(0, 3);
    var container = document.querySelector("#page-dashboard .item-list");

    if (!container) return;

    if (activeReqs.length === 0) {
      container.innerHTML = _renderEmptyState(
        "fa-file-lines",
        "No active requirements",
        "Submit a new requirement to get started",
      );
      return;
    }

    var icons = ["blue", "purple", "red"];
    var faIcons = ["fa-code", "fa-paintbrush", "fa-plug"];

    var html = activeReqs
      .map(function (req, index) {
        var iconColor = icons[index % icons.length];
        var faIcon = faIcons[index % faIcons.length];
        var badgeClass = req.badgeClass || "badge-gray";

        return [
          '<div class="list-row" ',
          '  style="cursor:pointer" ',
          "  onclick=\"navigateTo('" + CONSTANTS.PAGES.REQUIREMENTS + "')\" ",
          '  title="Go to Requirements tab">',
          '  <div class="row-icon ' + iconColor + '">',
          '    <i class="fa-solid ' + faIcon + '"></i>',
          "  </div>",
          '  <div class="row-content">',
          "    <h4>" + _escapeHtml(req.subject) + "</h4>",
          "    <p>" +
            _escapeHtml(req.id.slice(-6)) +
            " · " +
            _escapeHtml(req.projectDisplay) +
            "</p>",
          "  </div>",
          '  <span class="badge ' + badgeClass + '">',
          "    " + _escapeHtml(req.status),
          "  </span>",
          "</div>",
        ].join("");
      })
      .join("");

    container.innerHTML = html;

    Logger.debug(
      "DASHBOARD",
      "Active requirements rendered → " + activeReqs.length,
    );
  }

  function _renderTaskProgress() {
    var tasks = AppState.get("tasks");
    var summary = tasks.summary;

    var completedPct =
      summary.total > 0
        ? Math.round((summary.completed / summary.total) * 100)
        : 0;

    var miniDonutNum = document.querySelector(
      "#page-dashboard .mini-donut-num",
    );
    if (miniDonutNum) {
      miniDonutNum.textContent = completedPct + "%";
    }

    var circumference = 238.76;
    var dashOffset = circumference - circumference * (completedPct / 100);

    var miniCircle = document.querySelector(
      "#page-dashboard .mini-donut circle:last-child",
    );
    if (miniCircle) {
      miniCircle.setAttribute("stroke-dashoffset", dashOffset.toFixed(2));
    }

    var psRows = document.querySelectorAll("#page-dashboard .ps-row strong");
    if (psRows[0]) psRows[0].textContent = summary.completed;
    if (psRows[1]) psRows[1].textContent = summary.inProgress;
    if (psRows[2]) psRows[2].textContent = summary.pending;

    var miniList = document.querySelector("#page-dashboard .task-mini-list");
    if (!miniList) return;

    var showTasks = [];
    var pending = tasks.pending.slice(0, 1);
    var inProg = tasks.inProgress.slice(0, 1);
    var completed = tasks.completed.slice(0, 1);

    showTasks = showTasks
      .concat(completed)
      .concat(inProg)
      .concat(pending)
      .slice(0, 3);

    if (showTasks.length === 0) {
      miniList.innerHTML =
        '<p style="font-size:12px;color:var(--text-4);' +
        'text-align:center;padding:12px 0">No tasks yet</p>';
      return;
    }

    miniList.innerHTML = showTasks
      .map(function (task) {
        var statusMap = {
          [CONSTANTS.STATUS.TASK.COMPLETED]: { cls: "done", icon: "fa-check" },
          [CONSTANTS.STATUS.TASK.IN_PROGRESS]: {
            cls: "active",
            icon: "fa-spinner",
          },
          [CONSTANTS.STATUS.TASK.PENDING_APPROVAL]: {
            cls: "pending",
            icon: "fa-clock",
          },
          [CONSTANTS.STATUS.TASK.APPROVED]: {
            cls: "active",
            icon: "fa-spinner",
          },
          [CONSTANTS.STATUS.TASK.PAUSED]: { cls: "pending", icon: "fa-pause" },
        };

        var sm = statusMap[task.status] || { cls: "pending", icon: "fa-clock" };
        var pct = task.percent || 0;
        var fillCls =
          sm.cls === "done" ? "green" : sm.cls === "active" ? "amber" : "gray";
        var faType = sm.cls === "active" ? "fa-solid" : "fa-regular";

        return [
          '<div class="task-mini">',
          '  <div class="tm-status ' + sm.cls + '">',
          '    <i class="' + faType + " " + sm.icon + '"></i>',
          "  </div>",
          '  <div class="tm-data">',
          '    <span class="tm-name">' + _escapeHtml(task.taskName) + "</span>",
          '    <div class="tm-progress">',
          '      <div class="tm-fill ' + fillCls + '" ',
          '        style="width:' + pct + '%"></div>',
          "    </div>",
          "  </div>",
          '  <span class="tm-hrs">' + task.estimatedHours + "h</span>",
          "</div>",
        ].join("");
      })
      .join("");

    Logger.debug("DASHBOARD", "Task progress rendered");
  }

  function _renderTimeline() {
    var project = AppState.computed("currentTimelineProject");
    var timeline = AppState.get("timeline");
    var total = timeline.projects.length;
    var index = timeline.currentIndex;

    if (!project) {
      var timelineEl = _el(CONSTANTS.DOM.TIMELINE_CONTENT);
      if (timelineEl) {
        timelineEl.innerHTML = [
          '<div style="text-align:center;padding:24px;',
          'color:var(--text-4);font-size:13px;width:100%">',
          '  <i class="fa-solid fa-timeline" ',
          '    style="font-size:24px;opacity:0.3;',
          '    margin-bottom:8px;display:block"></i>',
          "  No active projects",
          "</div>",
        ].join("");
      }
      return;
    }

    var projIconEl = _el(CONSTANTS.DOM.TL_PROJ_ICON);
    if (projIconEl) {
      projIconEl.style.background = project.gradColor;
      projIconEl.innerHTML = '<i class="fa-solid fa-folder"></i>';
    }

    var projNameEl = _el(CONSTANTS.DOM.TL_PROJ_NAME);
    if (projNameEl) projNameEl.textContent = project.name;

    var projStatsEl = _el(CONSTANTS.DOM.TL_PROJ_STATS);
    if (projStatsEl) projStatsEl.textContent = project.stats;

    var subtitleEl = _el(CONSTANTS.DOM.TIMELINE_SUBTITLE);
    if (subtitleEl) subtitleEl.textContent = project.subtitle;

    var phaseEl = _el(CONSTANTS.DOM.TIMELINE_PHASE);
    if (phaseEl) {
      phaseEl.className = "badge " + project.phaseClass;
      phaseEl.textContent = project.phase;
    }

    var dotsEl = _el(CONSTANTS.DOM.TL_PROJ_DOTS);
    if (dotsEl) {
      dotsEl.innerHTML = timeline.projects
        .map(function (_, i) {
          return (
            '<span class="tl-dot ' + (i === index ? "active" : "") + '"></span>'
          );
        })
        .join("");
    }

    var idxEl = _el(CONSTANTS.DOM.TL_CURRENT_IDX);
    if (idxEl) idxEl.textContent = index + 1;

    var totalEl = _el(CONSTANTS.DOM.TL_TOTAL_COUNT);
    if (totalEl) totalEl.textContent = total;

    _renderTimelineSteps(project);

    Logger.debug("DASHBOARD", "Timeline rendered → " + project.name);
  }

  function _renderTimelineSteps(project) {
    var timelineEl = _el(CONSTANTS.DOM.TIMELINE_CONTENT);
    if (!timelineEl) return;

    var phases = _buildTimelinePhases(project);

    var html = "";
    phases.forEach(function (step, index) {
      var circleContent = "";
      if (step.status === "done") {
        circleContent = '<i class="fa-solid fa-check"></i>';
      } else if (step.status === "active") {
        circleContent = [
          '<span class="loader-dot"></span>',
          '<span class="loader-dot"></span>',
          '<span class="loader-dot"></span>',
        ].join("");
      } else {
        circleContent = "<span>" + (index + 1) + "</span>";
      }

      var stepClass =
        step.status === "done"
          ? "done"
          : step.status === "active"
            ? "active"
            : "";

      html += [
        '<div class="tl-step ' + stepClass + '">',
        '  <div class="tl-circle">' + circleContent + "</div>",
        '  <div class="tl-info">',
        "    <h5>" + _escapeHtml(step.name) + "</h5>",
        "    <span>" + _escapeHtml(step.date) + "</span>",
        "  </div>",
        "</div>",
      ].join("");

      if (index < phases.length - 1) {
        var barDone = step.status === "done";
        html += '<div class="tl-bar ' + (barDone ? "done" : "") + '"></div>';
      }
    });

    timelineEl.classList.add("switching");
    setTimeout(function () {
      timelineEl.innerHTML = html;
      setTimeout(function () {
        timelineEl.classList.remove("switching");
      }, 50);
    }, 200);
  }

  function _buildTimelinePhases(project) {
    var S = CONSTANTS.STATUS.REQUIREMENT;

    var reqs = project.requirements || [];
    var currentReq =
      reqs.find(function (r) {
        return r.isActive;
      }) || reqs[0];

    var currentStatus = currentReq ? currentReq.status : "";

    var phaseOrder = [
      S.SUBMITTED,
      S.UNDER_REVIEW,
      S.APPROVED,
      S.IN_PROGRESS,
      S.COMPLETED,
    ];

    var currentPhaseIdx = phaseOrder.indexOf(currentStatus);

    var phaseLabels = {
      [S.SUBMITTED]: "Submitted",
      [S.UNDER_REVIEW]: "Reviewed",
      [S.APPROVED]: "Approved",
      [S.IN_PROGRESS]: "Development",
      [S.COMPLETED]: "Delivery",
    };

    var phaseDates = {
      [S.SUBMITTED]: currentReq ? currentReq.submittedDate : "—",
      [S.UNDER_REVIEW]: "—",
      [S.APPROVED]: "—",
      [S.IN_PROGRESS]: "—",
      [S.COMPLETED]: "—",
    };

    return phaseOrder.map(function (phase, i) {
      var phaseStatus;
      if (currentPhaseIdx < 0) {
        phaseStatus = "pending";
      } else if (i < currentPhaseIdx) {
        phaseStatus = "done";
      } else if (i === currentPhaseIdx) {
        phaseStatus = "active";
      } else {
        phaseStatus = "pending";
      }

      return {
        name: phaseLabels[phase] || phase,
        date: phaseDates[phase] || "—",
        status: phaseStatus,
      };
    });
  }

  /**
   * Render recent task activity card
   * Shows recent tasks (all statuses) instead of approval queue
   */
  function _renderApprovals() {
    var tasks = AppState.get("tasks");
    var allTasks = tasks.list || [];
    var container = document.querySelector("#page-dashboard .approval-grid");

    if (!container) return;

    // ── Empty state ──
    if (allTasks.length === 0) {
      container.innerHTML = [
        '<div style="grid-column:1/-1;text-align:center;',
        'padding:32px;color:var(--text-4)">',
        '  <i class="fa-solid fa-list-check" ',
        '    style="font-size:32px;color:var(--text-5);',
        '    margin-bottom:12px;display:block"></i>',
        '  <strong style="color:var(--text);font-size:14px">',
        "    No tasks yet</strong><br>",
        '  <span style="font-size:13px">',
        "    Tasks will appear here once your team proposes them.</span>",
        "</div>",
      ].join("");
      return;
    }

    // ── Sort tasks: pending first, then in-progress, then completed ──
    var S = CONSTANTS.STATUS.TASK;
    var statusOrder = {};
    statusOrder[S.PENDING_APPROVAL] = 1;
    statusOrder[S.IN_PROGRESS] = 2;
    statusOrder[S.APPROVED] = 3;
    statusOrder[S.PAUSED] = 4;
    statusOrder[S.CONCERN_RAISED] = 5;
    statusOrder[S.COMPLETED] = 6;
    statusOrder[S.DISCARDED] = 7;

    var sortedTasks = allTasks.slice().sort(function (a, b) {
      var orderA = statusOrder[a.status] || 99;
      var orderB = statusOrder[b.status] || 99;
      return orderA - orderB;
    });

    // ── Take top 4 most relevant ──
    var displayTasks = sortedTasks.slice(0, 4);

    // ── Side color by status ──
    function _getSideColor(status) {
      if (status === S.PENDING_APPROVAL) return "amber";
      if (status === S.IN_PROGRESS) return "blue";
      if (status === S.APPROVED) return "blue";
      if (status === S.COMPLETED) return "green";
      if (status === S.PAUSED) return "amber";
      if (status === S.CONCERN_RAISED) return "red";
      if (status === S.DISCARDED) return "red";
      return "blue";
    }

    // ── Icon by status ──
    function _getStatusIcon(status) {
      if (status === S.PENDING_APPROVAL) return "fa-clock";
      if (status === S.IN_PROGRESS) return "fa-spinner";
      if (status === S.APPROVED) return "fa-check";
      if (status === S.COMPLETED) return "fa-circle-check";
      if (status === S.PAUSED) return "fa-pause";
      if (status === S.CONCERN_RAISED) return "fa-flag";
      if (status === S.DISCARDED) return "fa-xmark";
      return "fa-circle";
    }

    var html = displayTasks
      .map(function (task) {
        var sideColor = _getSideColor(task.status);
        var statusIcon = _getStatusIcon(task.status);
        var hours = task.estimatedHours || 0;
        var reqDisplay = task.requirementDisplay
          ? _truncate(task.requirementDisplay, 40)
          : "No requirement";

        return [
          '<div class="approval-item">',
          '  <div class="ap-side ' + sideColor + '"></div>',
          '  <div class="ap-body">',
          '    <div class="ap-top">',
          "      <h4>" + _escapeHtml(task.taskName) + "</h4>",
          '      <span class="ap-time">',
          '        <i class="fa-solid ' + statusIcon + '"></i> ',
          "        " + _escapeHtml(task.status),
          "      </span>",
          "    </div>",
          "    <p>",
          '      <i class="fa-solid fa-folder" style="margin-right:6px;font-size:10px;color:var(--text-4)"></i>',
          "      " + _escapeHtml(task.projectDisplay || "No project"),
          '      <span style="color:var(--text-4);margin:0 8px">·</span>',
          "      " + hours + " hrs estimated",
          task.owner
            ? ' <span style="color:var(--text-4);margin:0 8px">·</span> ' +
              '<i class="fa-regular fa-user" style="font-size:10px;margin-right:4px"></i>' +
              _escapeHtml(task.owner)
            : "",
          "    </p>",
          '    <div class="ap-actions">',
          '      <button class="btn btn-outline btn-sm" ',
          "        onclick=\"navigateTo('" + CONSTANTS.PAGES.TASKS + "')\">",
          '        <i class="fa-solid fa-eye"></i> View Details',
          "      </button>",
          "    </div>",
          "  </div>",
          "</div>",
        ].join("");
      })
      .join("");

    container.innerHTML = html;

    // ── Update badge in card header ──
    var card = container.closest(".card");
    if (card) {
      var badge = card.querySelector(".card-head .badge");
      if (badge) {
        var pendingCount = tasks.summary.pending || 0;
        if (pendingCount > 0) {
          badge.className = "badge badge-amber";
          badge.innerHTML =
            '<i class="fa-solid fa-clock"></i> ' + pendingCount + " Pending";
        } else {
          badge.className = "badge badge-success";
          badge.innerHTML =
            '<i class="fa-solid fa-circle-check"></i> All up to date';
        }
      }
    }

    Logger.debug(
      "DASHBOARD",
      "Recent task activity rendered → " + displayTasks.length + " tasks",
    );
  }
  // =========================================================================
  // PRIVATE — Animation & Utility Helpers
  // =========================================================================

  function _animateNumber(el, target, suffix) {
    if (!el) return;

    var current = 0;
    var step = Math.max(1, Math.ceil(target / 30));
    var sfx = suffix || "";

    var timer = setInterval(function () {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = current + sfx;
    }, 30);
  }

  function _renderEmptyState(icon, title, subtitle) {
    return [
      '<div style="text-align:center;padding:32px 16px;',
      'color:var(--text-4)">',
      '  <i class="fa-solid fa-' + icon + '" ',
      '    style="font-size:28px;opacity:0.3;margin-bottom:10px;',
      '    display:block"></i>',
      '  <strong style="display:block;color:var(--text);',
      '    font-size:13px;margin-bottom:4px">' +
        _escapeHtml(title) +
        "</strong>",
      '  <span style="font-size:12px">' + _escapeHtml(subtitle) + "</span>",
      "</div>",
    ].join("");
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
  function _truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.substring(0, max) + "…" : str;
  }

  function _renderAll() {
    Logger.time("DASHBOARD", "renderAll");

    _renderHero();
    _renderAlertBar();
    _renderStatsGrid();
    _renderHoursCard();
    _renderImplementationCard();
    _renderActiveRequirements();
    _renderTaskProgress();
    _renderTimeline();
    _renderApprovals();

    Logger.timeEnd("DASHBOARD", "renderAll");
    Logger.info("DASHBOARD", "✅ Dashboard fully rendered");
  }

  function _addStatCardIds() {
    var statCards = document.querySelectorAll(
      "#page-dashboard .stats-grid .stat-card",
    );

    statCards.forEach(function (card, index) {
      card.id = "statCard" + (index + 1);
    });

    Logger.debug(
      "DASHBOARD",
      "Stat card IDs assigned → " + statCards.length + " cards",
    );
  }

  // =========================================================================
  // PRIVATE — Event Subscriptions
  // =========================================================================

  function _subscribeToEvents() {
    var unsubReady = AppState.on("state:ready", function () {
      Logger.info("DASHBOARD", "state:ready → rendering dashboard");
      _renderAll();
    });

    var unsubContracts = AppState.on("contracts:loaded", function () {
      _renderHoursCard();
      _renderImplementationCard();
      _renderStatsGrid();
      _renderAlertBar();
    });

    var unsubReqs = AppState.on("requirements:loaded", function () {
      _renderActiveRequirements();
      _renderStatsGrid();
      _renderTimeline();
    });

    var unsubTasks = AppState.on("tasks:loaded", function () {
      _renderTaskProgress();
      _renderApprovals();
      _renderStatsGrid();
    });

    var unsubHours = AppState.on("hours:updated", function () {
      _renderHoursCard();
      _renderImplementationCard();
      _renderAlertBar();
    });

    var unsubTimeline = AppState.on("timeline:switched", function () {
      _renderTimeline();
    });

    var unsubApproved = AppState.on("task:approved", function () {
      _renderApprovals();
      _renderTaskProgress();
      _renderStatsGrid();
    });

    _unsubscribers = [
      unsubReady,
      unsubContracts,
      unsubReqs,
      unsubTasks,
      unsubHours,
      unsubTimeline,
      unsubApproved,
    ];
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  function init() {
    if (_initialized) {
      Logger.warn("DASHBOARD", "Already initialized — skipping");
      return;
    }

    Logger.info("DASHBOARD", "Initializing...");

    _addStatCardIds();
    _subscribeToEvents();

    _initialized = true;
    Logger.info("DASHBOARD", "✅ Initialized");
  }

  async function load() {
    Logger.info("DASHBOARD", "load() called");

    var contracts = AppState.get("contracts");
    if (contracts.loaded) {
      _renderAll();
      return;
    }

    Logger.debug("DASHBOARD", "Waiting for state:ready...");
  }

  function switchTimeline(direction) {
    AppState.switchTimeline(direction);
  }

  async function refresh() {
    Logger.info("DASHBOARD", "Full refresh requested");

    try {
      await AppState.dispatch("REFRESH_CONTRACTS");
      await AppState.dispatch("REFRESH_REQUIREMENTS");
      await AppState.dispatch("REFRESH_TASKS");
      _renderAll();
      showToast("Refreshed", "Dashboard data updated successfully.");
    } catch (err) {
      Logger.error("DASHBOARD", "Refresh failed", err);
      showToast("Error", "Could not refresh data. Please try again.");
    }
  }

  function destroy() {
    _unsubscribers.forEach(function (unsub) {
      if (typeof unsub === "function") unsub();
    });
    _unsubscribers = [];
    _initialized = false;
    Logger.info("DASHBOARD", "Destroyed");
  }

  return {
    init: init,
    load: load,
    switchTimeline: switchTimeline,
    refresh: refresh,
    destroy: destroy,
  };
})();
