/* ==========================================================================
   APP.JS — Application Bootstrap
   
   Zoho Creator Widget SDK in this environment does NOT require init().
   The SDK is ready as soon as ZOHO.CREATOR namespace is available.
   
   Boot sequence:
   1. Wait for ZOHO.CREATOR to be injected by Zoho Creator
   2. Call getInitParams() to get user context
   3. Store user in AppState
   4. Initialize all page modules
   5. Bootstrap state (load all data in parallel)
   6. Hide loading overlay
   ========================================================================== */

"use strict";

(function () {
  // =========================================================================
  // SDK READINESS CHECK
  // =========================================================================

  /**
   * Check if the Zoho Creator SDK is ready to use.
   * The SDK is considered ready when ZOHO.CREATOR.UTIL.getInitParams exists.
   *
   * @returns {boolean}
   */
  function isSDKReady() {
    return (
      typeof ZOHO !== "undefined" &&
      ZOHO.CREATOR &&
      ZOHO.CREATOR.UTIL &&
      typeof ZOHO.CREATOR.UTIL.getInitParams === "function" &&
      ZOHO.CREATOR.DATA &&
      typeof ZOHO.CREATOR.DATA.getRecords === "function"
    );
  }

  /**
   * Wait for the Zoho Creator SDK to be available.
   * Polls every 100ms up to maxWait milliseconds.
   *
   * @param {number} [maxWait] - Maximum wait time in ms (default: 10000)
   * @returns {Promise<void>}
   */
  function waitForSDK(maxWait) {
    maxWait = maxWait || 10000;
    var pollInterval = 100;
    var elapsed = 0;

    return new Promise(function (resolve, reject) {
      // ── Quick check: already ready ──
      if (isSDKReady()) {
        console.log("[APP] SDK ready immediately");
        resolve();
        return;
      }

      console.log("[APP] Waiting for Zoho Creator SDK...");

      var timer = setInterval(function () {
        elapsed += pollInterval;

        if (isSDKReady()) {
          clearInterval(timer);
          console.log("[APP] ✅ SDK ready after " + elapsed + "ms");
          resolve();
          return;
        }

        if (elapsed >= maxWait) {
          clearInterval(timer);
          reject(
            new Error(
              "Zoho Creator SDK did not load within " +
                maxWait / 1000 +
                " seconds. " +
                "Ensure widget is opened inside a Zoho Creator page.",
            ),
          );
        }
      }, pollInterval);
    });
  }

  // =========================================================================
  // BOOT SEQUENCE
  // =========================================================================

  /**
   * Main application boot sequence
   */
  async function boot() {
    // ── Step 1: Show loading overlay ──
    if (typeof LoadingManager !== "undefined") {
      LoadingManager.showOverlay("Loading Zoho Creator SDK...");
    }

    try {
      // ── Step 2: Wait for SDK to be ready ──
      await waitForSDK(15000);

      if (typeof Logger !== "undefined") {
        Logger.info("APP", "✅ Zoho Creator SDK ready");
      }

      // ── Step 3: Load user context via getInitParams ──
      if (typeof LoadingManager !== "undefined") {
        LoadingManager.showOverlay("Loading your profile...");
      }

      console.log("[APP] Calling getInitParams...");
      var initParams = await ZOHO.CREATOR.UTIL.getInitParams();

      if (typeof Logger !== "undefined") {
        Logger.info("APP", "Init params loaded", initParams);
      } else {
        console.log("[APP] Init params:", initParams);
      }

      // ── Step 4: Store user context in AppState ──
      var email = initParams.loginUser || "";

      // Derive display name from email prefix
      // e.g. "john.smith@company.com" → "John Smith"
      var name = email
        ? email
            .split("@")[0]
            .replace(/[._-]/g, " ")
            .replace(/\b\w/g, function (c) {
              return c.toUpperCase();
            })
        : "User";

      AppState.set("user", {
        email: email,
        name: name,
        scope: initParams.scope || "",
        appName: initParams.appLinkName || CONSTANTS.APP.NAME,
        brandColor: initParams.themeBrandColor || "#2563EB",
      });
      applyBrandColor(initParams.themeBrandColor || "#2563EB");
      if (typeof Logger !== "undefined") {
        Logger.info("APP", "User context stored", {
          email: email,
          name: name,
          scope: initParams.scope,
        });
      }

      // ── Step 5: Initialize all page modules ──
      if (typeof LoadingManager !== "undefined") {
        LoadingManager.showOverlay("Initializing modules...");
      }

      var modules = [
        {
          name: "DashboardModule",
          ref: typeof DashboardModule !== "undefined" ? DashboardModule : null,
        },
        {
          name: "RequirementsModule",
          ref:
            typeof RequirementsModule !== "undefined"
              ? RequirementsModule
              : null,
        },
        {
          name: "TasksModule",
          ref: typeof TasksModule !== "undefined" ? TasksModule : null,
        },
        {
          name: "ContractsModule",
          ref: typeof ContractsModule !== "undefined" ? ContractsModule : null,
        },
        {
          name: "PricingModule",
          ref: typeof PricingModule !== "undefined" ? PricingModule : null,
        },
        {
          name: "SettingsModule",
          ref: typeof SettingsModule !== "undefined" ? SettingsModule : null,
        },
        {
            name: "BugReportModule",
            ref: typeof BugReportModule !== "undefined" ? BugReportModule : null,
        },
      ];

      modules.forEach(function (m) {
        if (m.ref && typeof m.ref.init === "function") {
          try {
            m.ref.init();
            if (typeof Logger !== "undefined") {
              Logger.debug("APP", m.name + " ✅ initialized");
            } else {
              console.log("[APP] " + m.name + " initialized");
            }
          } catch (initErr) {
            // One module failure must not break others
            console.error("[APP] " + m.name + " init failed", initErr);
            if (typeof Logger !== "undefined") {
              Logger.error("APP", m.name + " init failed", initErr);
            }
          }
        } else {
          console.warn("[APP] " + m.name + " not found or has no init()");
        }
      });

      // ── Step 6: Bootstrap state (loads all data in parallel) ──
      if (typeof LoadingManager !== "undefined") {
        LoadingManager.showOverlay("Loading your data...");
      }

      await AppState.bootstrap();

      // ── Step 7: Hide overlay ──
      if (typeof LoadingManager !== "undefined") {
        LoadingManager.hideOverlay();
      }

      console.log("[APP] ✅ ClientHub boot complete");

      if (typeof Logger !== "undefined") {
        Logger.separator("APPLICATION READY");
        Logger.info("APP", "✅ ClientHub boot complete");
      }
    } catch (err) {
      console.error("[APP] Boot sequence failed", err);

      if (typeof Logger !== "undefined") {
        Logger.error("APP", "Boot sequence failed", err);
      }

      if (typeof LoadingManager !== "undefined") {
        LoadingManager.hideOverlay();
      }

      showBootError(err);
    }
  }

  // =========================================================================
  // ERROR DISPLAY
  // =========================================================================

  /**
   * Render a full-screen error UI when boot fails
   * @param {*} err - Error object or message
   */
  function showBootError(err) {
    var errMsg = (err && err.message) || String(err) || "Unknown error";

    var isSDKError =
      errMsg.toLowerCase().indexOf("sdk") !== -1 ||
      errMsg.toLowerCase().indexOf("zoho") !== -1 ||
      errMsg.toLowerCase().indexOf("did not load") !== -1 ||
      errMsg.toLowerCase().indexOf("not loaded") !== -1;

    var message;
    var helpHTML = "";

    if (isSDKError) {
      message = "Could not connect to Zoho Creator.";
      helpHTML = [
        '<div style="background:#FFFBEB;border:1px solid #FCD34D;',
        "padding:14px;border-radius:8px;margin:16px 0;text-align:left;",
        'font-size:13px;color:#92400E;line-height:1.6">',
        "<strong>This widget must be opened inside Zoho Creator.</strong><br>",
        "<br>",
        "<strong>How to open it correctly:</strong><br>",
        "1. Go to Zoho Creator → Your App<br>",
        "2. Open the Page that contains this widget<br>",
        "3. Make sure widget is uploaded via ",
        "Settings → Widgets<br>",
        "4. Drag the widget onto a Page<br>",
        "5. Open that Page (not the widget URL directly)",
        "</div>",
      ].join("");
    } else {
      message = "Failed to load the application.";
    }

    document.body.innerHTML = [
      '<div style="min-height:100vh;display:flex;align-items:center;',
      "justify-content:center;background:#F8FAFC;padding:24px;",
      'font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">',

      '  <div style="text-align:center;max-width:520px">',

      '    <div style="width:72px;height:72px;background:#FEE2E2;',
      "      border-radius:20px;display:flex;align-items:center;",
      "      justify-content:center;margin:0 auto 24px;",
      '      font-size:32px">⚠️</div>',

      '    <h2 style="font-size:22px;font-weight:700;color:#0F172A;',
      '      margin-bottom:12px;letter-spacing:-0.02em">',
      "      " + message + "</h2>",

      helpHTML,

      '    <details style="text-align:left;background:#F1F5F9;',
      "      padding:12px;border-radius:8px;margin:16px 0;",
      '      font-family:monospace;font-size:11px;color:#475569">',
      '      <summary style="cursor:pointer;font-weight:600">',
      "        Technical details</summary>",
      '      <pre style="margin-top:8px;white-space:pre-wrap;',
      '        word-break:break-all">' + escapeHTML(errMsg) + "</pre>",
      "    </details>",

      '    <button onclick="window.location.reload()" ',
      '      style="background:linear-gradient(135deg,#3B82F6,#1D4ED8);',
      "      color:white;border:none;padding:14px 28px;",
      "      border-radius:10px;font-size:14px;font-weight:600;",
      "      cursor:pointer;font-family:inherit;",
      '      box-shadow:0 8px 24px -4px rgba(37,99,235,0.4)">',
      "      🔄 Retry",
      "    </button>",

      '    <p style="font-size:11px;color:#94A3B8;margin-top:20px">',
      "      ClientHub · Client Support Portal</p>",

      "  </div>",
      "</div>",
    ].join("");
  }

  /**
   * Escape HTML for safe display
   * @param {string} str
   * @returns {string}
   */
  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // =========================================================================
  // START — Wait for DOM then boot
  // =========================================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      console.log("[APP] DOM ready — starting boot");
      if (typeof Logger !== "undefined") {
        Logger.separator("BOOT START");
        Logger.info("APP", "DOM ready — starting boot sequence");
      }
      boot();
    });
  } else {
    // DOM already ready
    console.log("[APP] DOM already ready — starting boot immediately");
    if (typeof Logger !== "undefined") {
      Logger.separator("BOOT START");
      Logger.info("APP", "Starting boot sequence");
    }
    boot();
  }
  /**
   * Generate a complete color palette from a single brand hex color
   * and apply it as CSS variables
   * @param {string} hex - Brand color hex (e.g. "#2f78d0")
   */
  function applyBrandColor(hex) {
    if (!hex || !/^#[0-9A-Fa-f]{3,8}$/.test(hex)) {
      hex = "#2563EB";
    }

    console.log("[APP] Applying brand color:", hex);

    // Convert hex to RGB
    function hexToRgb(h) {
      h = h.replace("#", "");
      if (h.length === 3) {
        h = h
          .split("")
          .map(function (c) {
            return c + c;
          })
          .join("");
      }
      return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
      };
    }

    // Convert RGB to hex
    function rgbToHex(r, g, b) {
      return (
        "#" +
        [r, g, b]
          .map(function (x) {
            var hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
          })
          .join("")
      );
    }

    // Lighten or darken a color
    function shade(rgb, amount) {
      return {
        r: rgb.r + (amount > 0 ? (255 - rgb.r) * amount : rgb.r * amount),
        g: rgb.g + (amount > 0 ? (255 - rgb.g) * amount : rgb.g * amount),
        b: rgb.b + (amount > 0 ? (255 - rgb.b) * amount : rgb.b * amount),
      };
    }

    var base = hexToRgb(hex);

    // Generate full palette
    var palette = {
      "--primary": hex,
      "--primary-50": rgbToHex(
        shade(base, 0.95).r,
        shade(base, 0.95).g,
        shade(base, 0.95).b,
      ),
      "--primary-100": rgbToHex(
        shade(base, 0.88).r,
        shade(base, 0.88).g,
        shade(base, 0.88).b,
      ),
      "--primary-200": rgbToHex(
        shade(base, 0.75).r,
        shade(base, 0.75).g,
        shade(base, 0.75).b,
      ),
      "--primary-300": rgbToHex(
        shade(base, 0.55).r,
        shade(base, 0.55).g,
        shade(base, 0.55).b,
      ),
      "--primary-400": rgbToHex(
        shade(base, 0.25).r,
        shade(base, 0.25).g,
        shade(base, 0.25).b,
      ),
      "--primary-500": hex,
      "--primary-600": rgbToHex(
        shade(base, -0.12).r,
        shade(base, -0.12).g,
        shade(base, -0.12).b,
      ),
      "--primary-700": rgbToHex(
        shade(base, -0.25).r,
        shade(base, -0.25).g,
        shade(base, -0.25).b,
      ),
      "--primary-800": rgbToHex(
        shade(base, -0.4).r,
        shade(base, -0.4).g,
        shade(base, -0.4).b,
      ),
      "--primary-900": rgbToHex(
        shade(base, -0.55).r,
        shade(base, -0.55).g,
        shade(base, -0.55).b,
      ),

      // Semantic aliases
      "--primary-soft": rgbToHex(
        shade(base, 0.92).r,
        shade(base, 0.92).g,
        shade(base, 0.92).b,
      ),
      "--primary-light": rgbToHex(
        shade(base, 0.8).r,
        shade(base, 0.8).g,
        shade(base, 0.8).b,
      ),
      "--primary-hover": rgbToHex(
        shade(base, -0.1).r,
        shade(base, -0.1).g,
        shade(base, -0.1).b,
      ),
      "--primary-dark": rgbToHex(
        shade(base, -0.2).r,
        shade(base, -0.2).g,
        shade(base, -0.2).b,
      ),
      "--primary-glow":
        "rgba(" + base.r + "," + base.g + "," + base.b + ",0.15)",

      // Gradients
      "--grad-primary":
        "linear-gradient(135deg, " +
        hex +
        " 0%, " +
        rgbToHex(
          shade(base, -0.2).r,
          shade(base, -0.2).g,
          shade(base, -0.2).b,
        ) +
        " 100%)",
      "--grad-primary-hover":
        "linear-gradient(135deg, " +
        rgbToHex(
          shade(base, -0.1).r,
          shade(base, -0.1).g,
          shade(base, -0.1).b,
        ) +
        " 0%, " +
        rgbToHex(
          shade(base, -0.3).r,
          shade(base, -0.3).g,
          shade(base, -0.3).b,
        ) +
        " 100%)",
      "--grad-soft":
        "linear-gradient(135deg, " +
        rgbToHex(
          shade(base, 0.95).r,
          shade(base, 0.95).g,
          shade(base, 0.95).b,
        ) +
        " 0%, " +
        rgbToHex(
          shade(base, 0.85).r,
          shade(base, 0.85).g,
          shade(base, 0.85).b,
        ) +
        " 100%)",

      // Shadows with brand tint
      "--shadow-brand":
        "0 8px 24px -4px rgba(" +
        base.r +
        "," +
        base.g +
        "," +
        base.b +
        ",0.25)",
      "--shadow-brand-lg":
        "0 16px 40px -8px rgba(" +
        base.r +
        "," +
        base.g +
        "," +
        base.b +
        ",0.35)",
    };

    // Apply all variables to :root
    var root = document.documentElement;
    Object.keys(palette).forEach(function (key) {
      root.style.setProperty(key, palette[key]);
    });

    console.log("[APP] Brand palette applied");
  }
})();



