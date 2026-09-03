/* ==========================================================================
   PRICING.JS — Purchase Hours Page Module
   - Location-based currency filter (auto-detect via IP)
   - Plans displayed in their NATIVE currency
   - Currency switching converts from native to selected
   - Supports Percentage Discount AND Free Hours promotions
   - Smart UPDATE-or-CREATE contract logic
   ========================================================================== */

"use strict";

var PricingModule = (function () {
  var _activePaymentContext = null;
  var _initialized = false;
  var _unsubscribers = [];

  var _selectedPlan = null; // PricingDTO
  var _currentCurrency = CONSTANTS.CURRENCY.USD;
  var _appliedPromo = null; // Result from PromotionRepo.validateCode()

  // =========================================================================
  // DOM Helpers
  // =========================================================================

  function _el(id) {
    return document.getElementById(id);
  }
  function _setText(id, text) {
    var el = _el(id);
    if (el) el.textContent = String(text || "");
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
  // Currency Conversion
  // =========================================================================

  function _convertCurrency(amount, fromCurrency, toCurrency) {
    if (!amount || fromCurrency === toCurrency) return amount;

    var rates = CONSTANTS.CURRENCY.RATES;
    var fromRate = rates[fromCurrency] || 1;
    var toRate = rates[toCurrency] || 1;

    var usdAmount = amount / fromRate;
    var converted = usdAmount * toRate;

    return Math.round(converted * 100) / 100;
  }

  function _formatPrice(amount, currency) {
    var curr = currency || _currentCurrency;
    var symbol = CONSTANTS.CURRENCY.SYMBOLS[curr] || "$";
    var fixed = parseFloat(amount).toFixed(2);

    if (curr === CONSTANTS.CURRENCY.INR) {
      var parts = fixed.split(".");
      var intPart = parts[0];
      var decPart = parts[1];
      var result = "";
      var len = intPart.length;

      if (len > 3) {
        result = "," + intPart.slice(-3);
        intPart = intPart.slice(0, -3);
        while (intPart.length > 2) {
          result = "," + intPart.slice(-2) + result;
          intPart = intPart.slice(0, -2);
        }
        result = intPart + result;
      } else {
        result = intPart;
      }
      fixed = result + "." + decPart;
    }

    return symbol + fixed;
  }

  function _getPlanPriceInCurrentCurrency(plan) {
    if (!plan) return 0;
    if (plan.currency === _currentCurrency) return plan.price;
    return _convertCurrency(plan.price, plan.currency, _currentCurrency);
  }

  // =========================================================================
  // Render Balance Strip
  // =========================================================================

  function _renderBalanceStrip() {
    var summary = AppState.get("contracts").hoursSummary;
    var purchased = summary.totalPurchased || 0;
    var consumed = summary.totalConsumed || 0;
    var remaining = summary.totalRemaining || 0;
    var activeCount = summary.activeCount || 0;

    var balTotal = _el("balTotal");
    if (balTotal) balTotal.textContent = purchased + " hrs";

    var balUsed = _el("balUsed");
    if (balUsed) balUsed.textContent = consumed + " hrs";

    var balRemaining = _el("balRemaining");
    if (balRemaining) {
      balRemaining.textContent = remaining + " hrs";
      balRemaining.className =
        "bal-value " +
        (remaining <= 0
          ? "danger"
          : remaining <= CONSTANTS.UI.LOW_HOURS_THRESHOLD
            ? "warning"
            : "success");
    }

    var balContract = _el("balContract");
    if (balContract) {
      if (activeCount === 0) {
        balContract.textContent = "None";
        balContract.className = "bal-value";
      } else if (activeCount === 1) {
        var firstContract = summary.contracts[0];
        balContract.textContent =
          firstContract.planDisplay || "SC-" + firstContract.id.slice(-6);
        balContract.className = "bal-value mono";
      } else {
        balContract.textContent = activeCount + " contracts";
        balContract.className = "bal-value";
      }
    }
  }

  // =========================================================================
  // Render Plans Grid — FILTERED BY DETECTED CURRENCY
  // =========================================================================

  function _renderPlansGrid() {
    var pricingState = AppState.get("pricing");
    var allPlans = pricingState.plans || [];
    var container = document.querySelector("#page-purchase .plans-grid");

    if (!container) return;

    // ── FILTER by currency (location-based) ──
    var filteredPlans = allPlans.filter(function (p) {
      return p.currency === _currentCurrency;
    });

    // Fallback to USD if no plans in detected currency
    if (filteredPlans.length === 0 && _currentCurrency !== CONSTANTS.CURRENCY.USD) {
      Logger.warn("PRICING", "No plans in " + _currentCurrency + " — falling back to USD");
      _currentCurrency = CONSTANTS.CURRENCY.USD;
      filteredPlans = allPlans.filter(function (p) {
        return p.currency === CONSTANTS.CURRENCY.USD;
      });
    }

    Logger.debug("PRICING", "Showing " + filteredPlans.length + " " + _currentCurrency + " plans");

    if (filteredPlans.length === 0) {
      container.innerHTML = [
        '<div style="grid-column:1/-1;text-align:center;padding:64px 20px">',
        '  <i class="fa-solid fa-tag" style="font-size:48px;opacity:0.15;',
        '    margin-bottom:16px;display:block;color:var(--text-4)"></i>',
        '  <strong style="display:block;font-size:16px;color:var(--text);margin-bottom:8px">',
        "    No plans available for your region</strong>",
        '  <span style="font-size:13px;color:var(--text-4)">',
        "    Please contact support for pricing.</span>",
        "</div>",
      ].join("");
      return;
    }

    // Sort by hours ascending
    var sorted = filteredPlans.slice().sort(function (a, b) {
      return a.supportHours - b.supportHours;
    });

    // Mark middle plan as featured
    var featuredIdx = Math.floor(sorted.length / 2);

    container.innerHTML = sorted
      .map(function (plan, index) {
        var isFeatured = index === featuredIdx && sorted.length >= 2;
        var isSelected = _selectedPlan && _selectedPlan.id === plan.id;
        return _renderPlanCard(plan, isFeatured, isSelected);
      })
      .join("");

    // Attach click handlers
    container.querySelectorAll(".plan").forEach(function (card) {
      card.addEventListener("click", function () {
        var planId = this.getAttribute("data-plan-id");
        if (planId) selectPlan(planId);
      });
    });
  }

  function _renderPlanCard(plan, isFeatured, isSelected) {
    var planNativeCurrency = plan.currency || "USD";
    var planNativePrice = plan.price || 0;
    var hours = plan.supportHours || 0;
    var title = plan.title || "Support Plan";

    var displayPrice = _getPlanPriceInCurrentCurrency(plan);
    var displaySymbol = CONSTANTS.CURRENCY.SYMBOLS[_currentCurrency] || "$";
    var nativeSymbol = CONSTANTS.CURRENCY.SYMBOLS[planNativeCurrency] || "$";
    var isConverted = planNativeCurrency !== _currentCurrency;
    var perHour = hours > 0 ? displayPrice / hours : 0;

    var planIcon =
      hours <= 10
        ? "fa-rocket"
        : hours <= 20
          ? "fa-gem"
          : hours <= 40
            ? "fa-crown"
            : "fa-star";

    var allPlans = AppState.get("pricing").plans;
    var maxPerHour = allPlans.reduce(function (max, p) {
      var p1 = _getPlanPriceInCurrentCurrency(p);
      var rate = p.supportHours > 0 ? p1 / p.supportHours : 0;
      return Math.max(max, rate);
    }, 0);
    var savingsPct =
      maxPerHour > 0 && perHour < maxPerHour
        ? Math.round((1 - perHour / maxPerHour) * 100)
        : 0;

    var features = _getPlanFeatures(hours);

    var btnClass = isFeatured ? "btn-primary" : "btn-outline";
    var btnText = "Choose " + _escapeHtml(title);

    var priceFixed = parseFloat(displayPrice).toFixed(0);

    var conversionInfo = "";
    if (isConverted) {
      conversionInfo = [
        '<div style="margin-top:6px;font-size:11px;color:var(--text-4);',
        '  display:flex;align-items:center;gap:6px">',
        '  <i class="fa-solid fa-arrow-right-arrow-left" style="font-size:9px"></i>',
        "  <span>Converted from ",
        "    <strong>" +
          nativeSymbol +
          planNativePrice.toFixed(2) +
          " " +
          planNativeCurrency +
          "</strong>",
        "  </span>",
        "</div>",
      ].join("");
    }

    return [
      '<div class="plan ' +
        (isFeatured ? "featured " : "") +
        (isSelected ? "selected-plan " : "") +
        '" ',
      '  data-plan-id="' + _escapeHtml(plan.id) + '">',

      isFeatured
        ? '<div class="featured-badge"><i class="fa-solid fa-star"></i> Most Popular</div>'
        : "",

      '  <div class="plan-head">',
      '    <div class="plan-icon ' + (isFeatured ? "featured" : "") + '">',
      '      <i class="fa-solid ' + planIcon + '"></i>',
      "    </div>",
      "    <h3>" + _escapeHtml(title) + "</h3>",
      "    <p>" + hours + " hours of support</p>",
      "  </div>",

      '  <div class="plan-price">',
      '    <span class="ps-curr">' + displaySymbol + "</span>",
      '    <span class="ps-amt">' + priceFixed + "</span>",
      "  </div>",

      conversionInfo,

      '  <p class="plan-meta">',
      "    " + hours + " hours · ",
      "    <strong>" + displaySymbol + perHour.toFixed(2) + "</strong>/hour",
      savingsPct > 0
        ? ' · <span class="save-tag">Save ' + savingsPct + "%</span>"
        : "",
      "  </p>",
      '  <button class="btn ' + btnClass + ' btn-block plan-cta">',
      "    " + btnText,
      "  </button>",

      "</div>",
    ].join("");
  }

  function _getPlanFeatures(hours) {
    var base = [
      "Task tracking & approval",
      "Client support portal",
      "Progress reporting",
    ];

    if (hours <= 10) return ["Email support", "30-day validity"].concat(base);
    if (hours <= 20)
      return [
        "Priority support",
        "Dedicated manager",
        "60-day validity",
      ].concat(base);
    return [
      "Priority + phone support",
      "Dedicated manager",
      "90-day validity",
    ].concat(base);
  }

  // =========================================================================
  // Render Order Summary
  // =========================================================================

  function _renderOrderSummary() {
    if (!_selectedPlan) return;

    var basePrice = _getPlanPriceInCurrentCurrency(_selectedPlan);
    var planHours = _selectedPlan.supportHours || 0;

    var finalPrice = basePrice;
    var finalHours = planHours;
    var discount = 0;
    var bonusHours = 0;
    var promoType = "";

    if (_appliedPromo && _appliedPromo.valid) {
      if (_appliedPromo.type === "percentage") {
        discount =
          Math.round(basePrice * (_appliedPromo.discountRate / 100) * 100) /
          100;
        finalPrice = Math.max(0, basePrice - discount);
        promoType = "percentage";
      } else if (_appliedPromo.type === "freeHours") {
        bonusHours = _appliedPromo.bonusHours;
        finalHours = planHours + bonusHours;
        promoType = "freeHours";
      }
    }

    _setText(
      "sumPlan",
      (_selectedPlan.title || "Plan") +
        " · " +
        planHours +
        " hrs" +
        (bonusHours > 0 ? " + " + bonusHours + " free" : ""),
    );

    _setText("sumSub", _formatPrice(basePrice));

    var discountLine = _el("sumDiscountLine");
    var discountAmount = _el("sumDiscount");
    var discountLabel = discountLine
      ? discountLine.querySelector("span")
      : null;

    if (promoType === "percentage" && discount > 0) {
      if (discountLine) discountLine.style.display = "flex";
      if (discountLabel) {
        discountLabel.innerHTML =
          '<i class="fa-solid fa-tag"></i> Discount (' +
          _appliedPromo.discountRate +
          "%)";
      }
      if (discountAmount)
        discountAmount.textContent = "-" + _formatPrice(discount);
    } else if (promoType === "freeHours" && bonusHours > 0) {
      if (discountLine) discountLine.style.display = "flex";
      if (discountLabel) {
        discountLabel.innerHTML =
          '<i class="fa-solid fa-gift"></i> Bonus Hours';
      }
      if (discountAmount)
        discountAmount.textContent = "+" + bonusHours + " hrs free";
    } else {
      if (discountLine) discountLine.style.display = "none";
    }

    _setText("sumTotal", _formatPrice(finalPrice));

    Logger.debug("PRICING", "Order summary updated", {
      basePrice: basePrice,
      discount: discount,
      bonusHours: bonusHours,
      finalPrice: finalPrice,
      finalHours: finalHours,
    });
  }

  // =========================================================================
  // Currency Control — HIDDEN (auto-detected via geolocation)
  // =========================================================================

  function _setupCurrencyControl() {
    var segControl = document.querySelector("#page-purchase .segment-control");
    if (segControl) {
      segControl.style.display = "none";
    }
  }

  async function _reapplyPromo() {
    if (!_appliedPromo || !_appliedPromo.promotion) return;

    var code = _appliedPromo.promotion.code;
    var basePrice = _getPlanPriceInCurrentCurrency(_selectedPlan);
    var planHours = _selectedPlan.supportHours;

    var result = await PromotionRepo.validateCode(
      code,
      basePrice,
      planHours,
      _currentCurrency,
    );

    if (result.valid) {
      _appliedPromo = result;
      _renderOrderSummary();
    }
  }

  function _resetPromo() {
    _appliedPromo = null;

    var promoInput = _el("promoInput");
    var promoFeedback = _el("promoFeedback");
    var discountLine = _el("sumDiscountLine");

    if (promoInput) promoInput.value = "";
    if (promoFeedback) {
      promoFeedback.textContent = "";
      promoFeedback.className = "field-feedback";
    }
    if (discountLine) discountLine.style.display = "none";

    if (_selectedPlan) _renderOrderSummary();
  }

  // =========================================================================
  // Event Subscriptions
  // =========================================================================

  function _subscribeToEvents() {
    var unsubPricing = AppState.on("pricing:loaded", function () {
      var page = document.getElementById("page-purchase");
      if (page && page.classList.contains("active")) _renderPlansGrid();
    });

    var unsubContracts = AppState.on("contracts:loaded", function () {
      var page = document.getElementById("page-purchase");
      if (page && page.classList.contains("active")) _renderBalanceStrip();
    });

    var unsubCurrency = AppState.on("currency:changed", function (data) {
      _currentCurrency = data.currency;
      _renderPlansGrid();
      _renderBalanceStrip();
    });

    _unsubscribers = [unsubPricing, unsubContracts, unsubCurrency];
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  function init() {
    if (_initialized) return;
    Logger.info("PRICING", "Initializing...");
    _subscribeToEvents();
    _initialized = true;
    Logger.info("PRICING", "✅ Initialized");
  }

  async function onPageEnter() {
    Logger.info("PRICING", "Page entered");

    _renderBalanceStrip();
    _setupCurrencyControl();

    // ── Detect currency from IP location (cached 30 min) ──
    try {
      _currentCurrency = await GeoLocationService.detectCurrency();
      Logger.info("PRICING", "Currency set → " + _currentCurrency);
    } catch (err) {
      Logger.warn("PRICING", "Geo detection failed — using USD", err);
      _currentCurrency = CONSTANTS.CURRENCY.USD;
    }

    var pricingState = AppState.get("pricing");
    if (pricingState.loaded && pricingState.plans.length > 0) {
      _renderPlansGrid();
    }

    var orderSection = _el("orderSection");
    if (orderSection && !_selectedPlan) {
      orderSection.style.display = "none";
    }
  }

  function selectPlan(planId) {
    var pricingState = AppState.get("pricing");
    var plan =
      pricingState.byId[planId] ||
      (pricingState.plans || []).find(function (p) {
        return p.id === planId;
      });

    if (!plan) return;

    _selectedPlan = plan;
    _appliedPromo = null;

    Logger.info("PRICING", "Plan selected → " + plan.title);

    document.querySelectorAll("#page-purchase .plan").forEach(function (card) {
      card.classList.toggle(
        "selected-plan",
        card.getAttribute("data-plan-id") === planId,
      );
    });

    var orderSection = _el("orderSection");
    if (orderSection) {
      orderSection.style.display = "block";
      orderSection.style.animation = "slideUp 0.4s ease";

      setTimeout(function () {
        orderSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }

    _resetPromo();
    _renderOrderSummary();

    AppState.setUI("selectedPlanId", planId);
    _checkPurchaseFlow();
  }

  async function _checkPurchaseFlow() {
    var user = AppState.get("user");
    var contracts = AppState.get("contracts").active || [];

    if (contracts.length === 0) return;

    var activeContract = contracts[0];

    try {
      var existing = await ContractRepo.findExistingContract({
        userEmail: user.email,
        projectId: activeContract.projectId,
        currency: _currentCurrency,
      });

      var summaryCard = document.querySelector("#page-purchase .summary-card");
      if (!summaryCard) return;

      var existingHint = summaryCard.querySelector(".purchase-flow-hint");
      if (existingHint) existingHint.remove();

      var hint = document.createElement("div");
      hint.className = "purchase-flow-hint";

      if (existing) {
        var addingHours = _selectedPlan ? _selectedPlan.supportHours : 0;
        if (_appliedPromo && _appliedPromo.type === "freeHours") {
          addingHours += _appliedPromo.bonusHours;
        }
        var newTotal = existing.purchasedHours + addingHours;

        hint.innerHTML = [
          '<div style="background:var(--primary-soft);border:1px solid var(--primary-light);',
          "padding:12px 14px;border-radius:var(--r);margin-top:14px;",
          'font-size:12px;color:var(--primary-dark);line-height:1.5">',
          '  <i class="fa-solid fa-circle-info" style="margin-right:6px"></i>',
          "  <strong>Adding hours to your existing plan</strong> for ",
          _escapeHtml(existing.projectDisplay) + ". Hours: ",
          "<strong>" +
            existing.purchasedHours +
            " → " +
            newTotal +
            " hrs</strong>",
          "</div>",
        ].join("");
      } else {
        hint.innerHTML = [
          '<div style="background:var(--green-soft);border:1px solid var(--green-light);',
          "padding:12px 14px;border-radius:var(--r);margin-top:14px;",
          'font-size:12px;color:var(--green-dark);line-height:1.5">',
          '  <i class="fa-solid fa-circle-check" style="margin-right:6px"></i>',
          "  <strong>A new support plan</strong> will be created for ",
          _escapeHtml(activeContract.projectDisplay) + ".",
          "</div>",
        ].join("");
      }

      var paymentBtn = summaryCard.querySelector(".btn-lg");
      if (paymentBtn) {
        paymentBtn.parentNode.insertBefore(hint, paymentBtn);
      }
    } catch (err) {
      Logger.error("PRICING", "_checkPurchaseFlow failed", err);
    }
  }

  async function applyPromo() {
    var promoInput = _el("promoInput");
    var promoFeedback = _el("promoFeedback");

    if (!promoInput || !promoFeedback) return;

    var code = promoInput.value.trim().toUpperCase();

    if (!_selectedPlan) {
      promoFeedback.textContent = "✕ Please select a plan first";
      promoFeedback.className = "field-feedback error";
      return;
    }

    if (!code) {
      promoFeedback.textContent = "✕ Please enter a promo code";
      promoFeedback.className = "field-feedback error";
      return;
    }

    promoFeedback.textContent = "Validating...";
    promoFeedback.className = "field-feedback";

    var applyBtn = promoInput.nextElementSibling;
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    try {
      Logger.debug("PRICING", "applyPromo → " + code);

      var basePrice = _getPlanPriceInCurrentCurrency(_selectedPlan);
      var planHours = _selectedPlan.supportHours;

      var result = await PromotionRepo.validateCode(
        code,
        basePrice,
        planHours,
        _currentCurrency,
      );

      if (!result.valid) {
        _appliedPromo = null;
        promoFeedback.textContent = "✕ " + result.errorMessage;
        promoFeedback.className = "field-feedback error";

        var discountLine = _el("sumDiscountLine");
        if (discountLine) discountLine.style.display = "none";
      } else {
        _appliedPromo = result;

        promoFeedback.innerHTML =
          "✓ Applied — " + _escapeHtml(result.displayLabel);
        promoFeedback.className = "field-feedback success";

        _renderOrderSummary();
        _checkPurchaseFlow();

        showToast("Promo Applied", "Code " + code + ": " + result.displayLabel);
      }
    } catch (err) {
      Logger.error("PRICING", "applyPromo failed", err);
      promoFeedback.textContent = "✕ Could not validate code.";
      promoFeedback.className = "field-feedback error";
    } finally {
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.innerHTML = "Apply";
      }
    }
  }

  /**
   * Process checkout with payment flow — UNCHANGED from your working version
   */
  async function processCheckout() {
    if (!_selectedPlan) {
      showToast("No Plan Selected", "Please select a support plan first.");
      return;
    }

    var user = AppState.get("user");
    var contracts = AppState.get("contracts").active || [];

    if (!user.email) {
      showToast("Error", "User session not found. Please refresh.");
      return;
    }

    var basePrice = _getPlanPriceInCurrentCurrency(_selectedPlan);
    var planHours = _selectedPlan.supportHours;
    var finalPrice = basePrice;
    var finalHours = planHours;
    var promoCode = "";

    if (_appliedPromo && _appliedPromo.valid) {
      promoCode = _appliedPromo.promotion.code;
      if (_appliedPromo.type === "percentage") {
        var discount =
          Math.round(basePrice * (_appliedPromo.discountRate / 100) * 100) /
          100;
        finalPrice = Math.max(0, basePrice - discount);
      } else if (_appliedPromo.type === "freeHours") {
        finalHours = planHours + _appliedPromo.bonusHours;
      }
    }

    var activeContract = contracts.length > 0 ? contracts[0] : null;
    if (!activeContract) {
      showToast("Error", "Unable to identify your account.");
      return;
    }

    var checkoutBtn = document.querySelector(
      "#page-purchase .summary-card .btn-primary",
    );

    function _setBtn(html, disabled) {
      if (checkoutBtn) {
        checkoutBtn.disabled = disabled;
        checkoutBtn.innerHTML = html;
      }
    }

    try {
      _setBtn(
        '<i class="fa-solid fa-spinner fa-spin"></i> Creating order...',
        true,
      );

      var F = CONSTANTS.FIELDS.SUPPORT_CONTRACT;
      var payload = {};

      payload[F.SUPPORT_PLAN] = _selectedPlan.id;
      payload[F.CURRENCY] = _currentCurrency;
      payload[F.PRICE] = finalPrice;
      payload[F.PURCHASED_HOURS] = finalHours;
      payload[F.CONSUMED_HOURS] = 0;
      payload[F.CONTRACT_STATUS] = CONSTANTS.STATUS.CONTRACT.ACTIVE;
      payload[F.PROMOTION_CODE] = promoCode;

      var today = new Date();
      var months = [
        "Jan","Feb","Mar","Apr","May","Jun",
        "Jul","Aug","Sep","Oct","Nov","Dec",
      ];
      var todayStr =
        String(today.getDate()).padStart(2, "0") +
        "-" +
        months[today.getMonth()] +
        "-" +
        today.getFullYear();

      payload[F.PURCHASE_DATE] = todayStr;

      if (activeContract.clientId) {
        payload[F.CLIENT] = activeContract.clientId;
        payload[F.EMAIL] = activeContract.clientId;
      }
      if (activeContract.projectId) {
        payload[F.PROJECT] = activeContract.projectId;
      }

      Logger.info("PRICING", "Creating contract", payload);

      var newId = await ContractRepo.create(payload);
      Logger.info("PRICING", "✅ Contract created → ID: " + newId);

      _setBtn(
        '<i class="fa-solid fa-spinner fa-spin"></i> Preparing payment link...',
        true,
      );

      var paymentUrl = await ContractRepo.pollForPaymentUrl(newId, {
        maxAttempts: 30,
        interval: 1500,
      });

      if (!paymentUrl) {
        showToast(
          "Payment Link Failed",
          "Could not generate payment link. Please contact support.",
        );
        _setBtn('<i class="fa-solid fa-lock"></i> Proceed to Payment', false);
        return;
      }

      Logger.info("PRICING", "✅ Payment URL ready: " + paymentUrl);

      _setBtn(
        '<i class="fa-solid fa-external-link-alt"></i> Opening payment...',
        true,
      );

      var paymentWindow = window.open(
        paymentUrl,
        "paymentWindow",
        "width=900,height=750,scrollbars=yes,resizable=yes",
      );

      if (!paymentWindow) {
        _showPaymentLinkFallback(paymentUrl, newId);
        _setBtn('<i class="fa-solid fa-lock"></i> Proceed to Payment', false);
        return;
      }

      Logger.info("PRICING", "Payment window opened");

      _activePaymentContext = {
        contractId: newId,
        url: paymentUrl,
        window: paymentWindow,
      };

      _showPaymentWaitingUI(newId);

      var captured = await ContractRepo.pollForPaymentCapture(newId, {
        maxAttempts: 200,
        interval: 3000,
      });

      _hidePaymentWaitingUI();

      if (captured) {
        Logger.info("PRICING", "🎉 Payment captured!");

        try {
          paymentWindow.close();
        } catch (e) {}

        await AppState.dispatch("REFRESH_CONTRACTS");

        showToast(
          "🎉 Payment Successful!",
          finalHours + " hours added to your account.",
        );

        _selectedPlan = null;
        _appliedPromo = null;

        var orderSection = _el("orderSection");
        if (orderSection) orderSection.style.display = "none";

        document
          .querySelectorAll("#page-purchase .plan")
          .forEach(function (card) {
            card.classList.remove("selected-plan");
          });

        setTimeout(function () {
            navigateTo(CONSTANTS.PAGES.DASHBOARD);
        }, 1500);
      } else {
        Logger.warn("PRICING", "Payment not captured in time");

        showToast(
          "Payment Status Unknown",
          "We could not confirm your payment. Your hours will appear shortly.",
        );
      }
    } catch (err) {
      Logger.error("PRICING", "processCheckout failed", err);
      _hidePaymentWaitingUI();
      showToast(
        "Checkout Failed",
        "Could not process your order. Please try again.",
      );
    } finally {
      _setBtn('<i class="fa-solid fa-lock"></i> Proceed to Payment', false);
    }
  }

  function _showPaymentWaitingUI(contractId, paymentWindow) {
    var orderSection = _el("orderSection");
    if (!orderSection) return;

    var existing = _el("paymentWaiting");
    if (existing) existing.remove();

    var waitingDiv = document.createElement("div");
    waitingDiv.id = "paymentWaiting";
    waitingDiv.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(26,26,26,0.5)",
      "backdrop-filter:blur(8px)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "z-index:5000",
      "padding:24px",
    ].join(";");

    waitingDiv.innerHTML = [
      '<div style="background:white;border-radius:24px;padding:40px;',
      '  max-width:480px;text-align:center;box-shadow:0 24px 48px rgba(0,0,0,0.2)">',

      '  <div style="width:72px;height:72px;background:var(--primary-soft);',
      "    border-radius:50%;display:flex;align-items:center;justify-content:center;",
      '    margin:0 auto 24px">',
      '    <div style="width:40px;height:40px;border:3px solid var(--primary);',
      "      border-top-color:transparent;border-radius:50%;",
      '      animation:spin 1s linear infinite"></div>',
      "  </div>",

      '  <h2 style="font-size:22px;font-weight:600;color:var(--text);',
      '    margin-bottom:8px;letter-spacing:-0.02em">',
      "    Waiting for payment...</h2>",

      '  <p style="font-size:14px;color:var(--text-3);line-height:1.6;',
      '    margin-bottom:24px">',
      "    Complete your payment in the popup window.",
      "    We'll automatically update your account once payment is confirmed.",
      "  </p>",

      '  <div style="background:var(--bg);padding:14px 18px;border-radius:12px;',
      '    margin-bottom:20px;font-size:12px;color:var(--text-4);text-align:left">',
      '    <div style="margin-bottom:6px"><i class="fa-solid fa-circle-info" ',
      '      style="color:var(--primary);margin-right:6px"></i>',
      '      <strong style="color:var(--text-2)">Order ID:</strong> ',
      '      <span style="font-family:monospace">' +
        contractId +
        "</span></div>",
      '    <div><i class="fa-solid fa-clock" style="color:var(--text-4);',
      '      margin-right:6px"></i>Polling every 3 seconds...</div>',
      "  </div>",

      '  <button onclick="PricingModule.reopenPaymentWindow()" ',
      '    style="background:var(--primary-soft);color:var(--primary);',
      "    border:none;padding:10px 20px;border-radius:9999px;",
      "    font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;",
      '    margin-right:8px">',
      '    <i class="fa-solid fa-external-link-alt"></i> Reopen Payment Window',
      "  </button>",

      '  <button onclick="PricingModule.cancelPaymentWait()" ',
      '    style="background:transparent;color:var(--text-4);',
      "    border:1px solid var(--border);padding:10px 20px;border-radius:9999px;",
      '    font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">',
      "    Cancel & Check Later",
      "  </button>",

      "</div>",
    ].join("");

    document.body.appendChild(waitingDiv);

    _activePaymentContext = {
      contractId: contractId,
      url:
        paymentWindow && paymentWindow.location
          ? paymentWindow.location.href
          : "",
      window: paymentWindow,
    };
  }

  function _hidePaymentWaitingUI() {
    var el = _el("paymentWaiting");
    if (el) el.remove();
    _activePaymentContext = null;
  }

  function _showPaymentLinkFallback(paymentUrl, contractId) {
    var summaryCard = document.querySelector("#page-purchase .summary-card");
    if (!summaryCard) return;

    var existing = _el("paymentFallback");
    if (existing) existing.remove();

    var fallback = document.createElement("div");
    fallback.id = "paymentFallback";
    fallback.style.cssText = "margin-top:14px";

    fallback.innerHTML = [
      '<div style="background:var(--amber-soft);border:1px solid var(--amber-light);',
      '  padding:16px;border-radius:12px;font-size:13px">',
      '  <div style="font-weight:600;color:var(--amber-dark);margin-bottom:8px">',
      '    <i class="fa-solid fa-triangle-exclamation"></i> Popup blocked</div>',
      '  <p style="color:var(--text-3);margin-bottom:12px;font-size:12px">',
      "    Please click the link below to complete your payment:</p>",
      '  <a href="' + paymentUrl + '" target="_blank" ',
      '    style="display:inline-flex;align-items:center;gap:8px;',
      "    background:var(--primary);color:white;padding:10px 18px;",
      '    border-radius:9999px;text-decoration:none;font-weight:500;font-size:13px">',
      '    <i class="fa-solid fa-external-link-alt"></i> Open Payment Page',
      "  </a>",
      "</div>",
    ].join("");

    summaryCard.appendChild(fallback);
  }

  async function refresh() {
    Logger.info("PRICING", "Refresh requested");
    CacheService.invalidate(CONSTANTS.CACHE_KEYS.PRICING_PLANS);
    CacheService.invalidate(CONSTANTS.CACHE_KEYS.PROMOTIONS);

    try {
      var plans = await PricingRepo.getAll();
      var byId = {};
      plans.forEach(function (p) {
        byId[p.id] = p;
      });

      AppState.set("pricing", { plans: plans, byId: byId, loaded: true });
      _renderPlansGrid();
      showToast("Refreshed", "Pricing updated.");
    } catch (err) {
      Logger.error("PRICING", "Refresh failed", err);
    }
  }

  function destroy() {
    _unsubscribers.forEach(function (unsub) {
      if (typeof unsub === "function") unsub();
    });
    _unsubscribers = [];
    _selectedPlan = null;
    _appliedPromo = null;
    _initialized = false;
  }

  function reopenPaymentWindow() {
    if (!_activePaymentContext) return;

    var url = _activePaymentContext.url;
    if (!url) {
      showToast("Error", "Payment URL not available. Please retry checkout.");
      return;
    }

    _activePaymentContext.window = window.open(
      url,
      "paymentWindow",
      "width=800,height=700,scrollbars=yes,resizable=yes",
    );

    if (!_activePaymentContext.window) {
      showToast("Popup Blocked", "Please allow popups for this site.");
    }
  }

  function cancelPaymentWait() {
    _hidePaymentWaitingUI();

    showToast(
      "Payment Pending",
      "Your order is created. Your hours will appear once payment is complete.",
    );

    setTimeout(function () {
      navigateTo(CONSTANTS.PAGES.DASHBOARD);
    }, 1000);
  }

  return {
    init: init,
    onPageEnter: onPageEnter,
    selectPlan: selectPlan,
    applyPromo: applyPromo,
    processCheckout: processCheckout,
    reopenPaymentWindow: reopenPaymentWindow,
    cancelPaymentWait: cancelPaymentWait,
    refresh: refresh,
    destroy: destroy,
  };
})();