#!/usr/bin/env python3
"""DEV-ONLY PREVIEW HARNESS (not part of the Zoho widget package).

Generates preview.html — renders the widget outside Zoho Creator by
swapping the real SDK script for a mock ZOHO.CREATOR SDK with sample data.

Usage:
    python3 dev-preview/generate.py
    → writes dev-preview/preview.html

Then serve the repo root and open /dev-preview/preview.html:
    python3 -m http.server 4173 --bind 0.0.0.0
    http://localhost:4173/dev-preview/preview.html

Re-run after any change to app/index.html.
Optional: pass --no-impl to generate preview-noimpl.html, which simulates an
account with zero Implementation contracts (dashboard empty-state check).
"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, '..', 'app')

html = open(os.path.join(APP, 'index.html')).read()

# 1. Drop the real Zoho SDK (the mock replaces it)
html = html.replace(
    '    <script src="https://js.zohostatic.com/creator/widgets/version/2.0/widgetsdk-min.js"></script>\n\n',
    '')

# 2. Re-point css/js paths at the app folder
html = html.replace('href="css/', 'href="../app/css/')
html = html.replace('src="js/', 'src="../app/js/')

MOCK = '''
    <!-- DEV-ONLY MOCK SDK — sample data so the widget renders outside Zoho Creator -->
    <script>
    (function () {
      // Raw Zoho SDK lookup format (as the real widget SDK returns it)
      var L = function (display, id) { return { zc_display_value: display, ID: id }; };
      var DATA = {
        Support_Contract_Report: [
          // Project is a MULTI-SELECT lookup — arrays of lookups
          { ID: "SC1001", clinent: L("Acme Corp", "CL01"), Project: [L("Website Redesign", "PR01"), L("Mobile App v2", "PR02")], Email: L("john.smith@acme.com", "US01"), Currency: "USD", Support_Plan: L("40 Hours — Growth", "PL03"), Promotion_Code: "", Price: "3600", Purchase_Date: "12-Jun-2026", Purchased_Hours: "40", Consumed_Hours: "26", Contract_Status: "Active", Contract_Type: "Support", Payment_Url: "", Payment_Status: "Captured" },
          { ID: "SC1002", clinent: L("Acme Corp", "CL01"), Project: [L("Mobile App v2", "PR02")], Email: L("john.smith@acme.com", "US01"), Currency: "USD", Support_Plan: L("10 Hours — Starter", "PL01"), Promotion_Code: "", Price: "900", Purchase_Date: "02-Aug-2026", Purchased_Hours: "10", Consumed_Hours: "4", Contract_Status: "Active", Contract_Type: "Support", Payment_Url: "", Payment_Status: "Captured" },
          { ID: "SC1003", clinent: L("Acme Corp", "CL01"), Project: [L("Website Redesign", "PR01"), L("API Integrations", "PR06")], Email: L("john.smith@acme.com", "US01"), Currency: "USD", Support_Plan: L("30 Impl Hours", "PL05"), Promotion_Code: "", Price: "2700", Purchase_Date: "20-Aug-2026", Purchased_Hours: "30", Consumed_Hours: "12", Contract_Status: "Active", Contract_Type: "Implementation", Payment_Url: "", Payment_Status: "Captured" }
        ],
        Requirement_Report: [
          { ID: "RQ5001", Support_Contract: L("SC1001 — Growth", "SC1001"), Project: L("Website Redesign", "PR01"), Client: L("Acme Corp", "CL01"), Subject_field: "Add multi-currency checkout", Requirement_Details: "Support USD, INR and EUR at checkout with live FX rates.", Submitted_Date: "18-Aug-2026", Status: "In Progress" },
          { ID: "RQ5002", Support_Contract: L("SC1001 — Growth", "SC1001"), Project: L("Website Redesign", "PR01"), Client: L("Acme Corp", "CL01"), Subject_field: "SEO audit for landing pages", Requirement_Details: "Full technical + content audit with prioritized fixes.", Submitted_Date: "22-Aug-2026", Status: "Under Review" },
          { ID: "RQ5003", Support_Contract: L("SC1002 — Starter", "SC1002"), Project: L("Mobile App v2", "PR02"), Client: L("Acme Corp", "CL01"), Subject_field: "Push notification scheduler", Requirement_Details: "Schedule and queue push notifications per user timezone.", Submitted_Date: "01-Sep-2026", Status: "Waiting For Approval" },
          { ID: "RQ5004", Support_Contract: L("SC1001 — Growth", "SC1001"), Project: L("Website Redesign", "PR01"), Client: L("Acme Corp", "CL01"), Subject_field: "Migrate blog to new CMS", Requirement_Details: "Move 120 posts, preserve URLs and metadata.", Submitted_Date: "10-Jul-2026", Status: "Completed" },
          { ID: "RQ5005", Support_Contract: L("SC1003 — Impl", "SC1003"), Project: L("API Integrations", "PR06"), Client: L("Acme Corp", "CL01"), Subject_field: "Payment gateway integration", Requirement_Details: "Integrate Razorpay + Stripe with webhooks.", Submitted_Date: "25-Aug-2026", Status: "In Progress" }
        ],
        Proposed_Tasks_Report: [
          { ID: "TK7001", Task_Name: "Checkout currency switcher", Project: L("Website Redesign", "PR01"), Requirement: L("RQ5001", "RQ5001"), Description: "UI + API for currency selection.", Estimated_Hours: "6", Status: "Approved", Priority: "High", Owner: L("Priya Nair", "OW1"), Percent: "55", Task_Type: "Support", Rejection_Reason: "" },
          { ID: "TK7002", Task_Name: "FX rate caching layer", Project: L("Website Redesign", "PR01"), Requirement: L("RQ5001", "RQ5001"), Description: "Cache FX rates for 1h.", Estimated_Hours: "4", Status: "Draft", Priority: "Medium", Owner: L("Arun Kumar", "OW2"), Percent: "0", Task_Type: "Support", Rejection_Reason: "" },
          { ID: "TK7003", Task_Name: "SEO meta rewrite", Project: L("Website Redesign", "PR01"), Requirement: L("RQ5002", "RQ5002"), Description: "Rewrite meta titles/descriptions.", Estimated_Hours: "3", Status: "Pending Approval", Priority: "Medium", Owner: L("Priya Nair", "OW1"), Percent: "0", Task_Type: "Support", Rejection_Reason: "" },
          { ID: "TK7004", Task_Name: "Sitemap + robots audit", Project: L("Website Redesign", "PR01"), Requirement: L("RQ5002", "RQ5002"), Description: "Regenerate sitemap, fix robots.", Estimated_Hours: "2", Status: "Pending Completion Approval", Priority: "Low", Owner: L("Arun Kumar", "OW2"), Percent: "100", Task_Type: "Support", Rejection_Reason: "" },
          { ID: "TK7005", Task_Name: "Notification queue schema", Project: L("Mobile App v2", "PR02"), Requirement: L("RQ5003", "RQ5003"), Description: "Design DB schema.", Estimated_Hours: "5", Status: "Closed", Priority: "High", Owner: L("Priya Nair", "OW1"), Percent: "100", Task_Type: "Support", Rejection_Reason: "" },
          { ID: "TK7006", Task_Name: "CMS content freeze plan", Project: L("Website Redesign", "PR01"), Requirement: L("RQ5004", "RQ5004"), Description: "Plan freeze window.", Estimated_Hours: "2", Status: "Rework Required", Priority: "Low", Owner: L("Arun Kumar", "OW2"), Percent: "10", Task_Type: "Support", Rejection_Reason: "Timing conflicts with campaign" },
          { ID: "TK7007", Task_Name: "Deep-link routing", Project: L("Mobile App v2", "PR02"), Requirement: L("RQ5003", "RQ5003"), Description: "Universal links.", Estimated_Hours: "4", Status: "Not Started" /* legacy → Pending Approval */, Priority: "High", Owner: L("Priya Nair", "OW1"), Percent: "0", Task_Type: "Support", Rejection_Reason: "" },
          { ID: "TK7008", Task_Name: "Checkout E2E test suite", Project: L("Website Redesign", "PR01"), Requirement: L("RQ5001", "RQ5001"), Description: "Automated end-to-end coverage.", Estimated_Hours: "30", Status: "Closed", Priority: "High", Owner: L("Arun Kumar", "OW2"), Percent: "100", Task_Type: "Support", Rejection_Reason: "" },
          { ID: "TK7009", Task_Name: "Performance budget audit", Project: L("Website Redesign", "PR01"), Requirement: L("RQ5001", "RQ5001"), Description: "Lighthouse + bundle analysis.", Estimated_Hours: "10", Status: "Closed", Priority: "Medium", Owner: L("Priya Nair", "OW1"), Percent: "100", Task_Type: "Implementation", Rejection_Reason: "" },
          { ID: "TK7010", Task_Name: "API gateway setup", Project: L("API Integrations", "PR06"), Requirement: L("RQ5005", "RQ5005"), Description: "Razorpay + Stripe webhooks.", Estimated_Hours: "12", Status: "Closed", Priority: "High", Owner: L("Arun Kumar", "OW2"), Percent: "100", Task_Type: "Implementation", Rejection_Reason: "" }
        ],
        Pricing_Report: [
          { ID: "PL01", Title: "Starter", Support_Hours: "10", Currency: "USD", Price: "900", Price_Type: "Support" },
          { ID: "PL02", Title: "Team", Support_Hours: "20", Currency: "USD", Price: "1700", Price_Type: "Support" },
          { ID: "PL03", Title: "Growth", Support_Hours: "40", Currency: "USD", Price: "3200", Price_Type: "Support" },
          { ID: "PL04", Title: "Impl Starter", Support_Hours: "10", Currency: "USD", Price: "1100", Price_Type: "Implementation" },
          { ID: "PL05", Title: "Impl Growth", Support_Hours: "30", Currency: "USD", Price: "2700", Price_Type: "Implementation" }
        ],
        Promotion_Report: [
          { ID: "PM01", Promotion_Name: "Launch Promo", Promotion_Code: "LAUNCH20", Description: "20% off first purchase", Promotion_Type: "Percentage", Valid_From: "01-Aug-2026", Valid_To: "31-Dec-2026", Status: "Active", Discount_Rate: "20", Number_Of_Hours: "0" }
        ],
        All_Bug_Reports: [
          { ID: "BG9001", Support_Contract: L("SC1001", "SC1001"), Project: L("Website Redesign", "PR01"), Client: L("Acme Corp", "CL01"), Bug_Description: "Cart total not updating when currency switched on Safari iOS.", Status: "Reviewing" },
          { ID: "BG9002", Support_Contract: L("SC1002", "SC1002"), Project: L("Mobile App v2", "PR02"), Client: L("Acme Corp", "CL01"), Bug_Description: "Push permission prompt appears twice on Android 14.", Status: "Resolution Needed" }
        ]
      };

      window.__DATA = DATA; // exposed for preview testing

      function fetchAll(report_name) {
        return Promise.resolve({ data: (DATA[report_name] || []).map(function (r) { return JSON.parse(JSON.stringify(r)); }) });
      }

      window.ZOHO = {
        CREATOR: {
          UTIL: {
            getInitParams: function () {
              return Promise.resolve({ loginUser: "john.smith@acme.com", themeBrandColor: "#2563EB", appLinkName: "client-support", scope: "" });
            }
          },
          DATA: {
            getRecords: function (cfg) { return fetchAll(cfg.report_name); },
            getRecordById: function (cfg) {
              var rows = DATA[cfg.report_name] || [];
              var hit = rows.filter(function (r) { return r.ID === cfg.id; })[0] || null;
              return Promise.resolve({ data: hit });
            },
            getRecordCount: function () { return Promise.resolve({ count: 0 }); },
            addRecords: function (cfg) {
              // Test hook: window.__failNextAdd = { code: 3001, message: '...' }
              // makes the NEXT addRecords resolve with a Zoho-style error
              // payload (the SDK resolves instead of throwing on failures).
              if (window.__failNextAdd) {
                var failure = window.__failNextAdd;
                window.__failNextAdd = null;
                return Promise.resolve(failure);
              }
              // Form names differ from report names — map so created
              // records land in the bucket the app reads from.
              var FORM_TO_REPORT = {
                Support_Contract: 'Support_Contract_Report',
                Requirement: 'Requirement_Report',
                Proposed_Tasks: 'Proposed_Tasks_Report',
                Pricing: 'Pricing_Report',
                Promotion: 'Promotion_Report',
                Bug_Report: 'Bug_Report_Report'
              };
              var bucketName = FORM_TO_REPORT[cfg.form_name] || cfg.form_name;
              var form = DATA[bucketName] = DATA[bucketName] || [];
              var id = 'NEW' + (form.length + 1);
              var rec = Object.assign({ ID: id }, (cfg.payload && cfg.payload.data) || {});
              form.push(rec);
              // Simulate the Zoho payment workflow on new contracts:
              // Payment_Url appears ~2s after create, capture ~7s after.
              if (cfg.form_name === 'Support_Contract') {
                window.__updates = window.__updates || [];
                window.__updates.push({ report: 'CREATE:' + bucketName, id: id, data: rec });
                setTimeout(function () { rec.Payment_Url = 'https://pay.mock.example/' + id; }, 2000);
                setTimeout(function () { rec.Payment_Status = 'Captured'; rec.Contract_Status = 'Active'; }, 7000);
              }
              return Promise.resolve({ data: { ID: id, code: 3000 } });
            },
            updateRecordById: function (cfg) {
              // Track write-backs so the waterfall reconciliation is
              // visible in the preview (window.__updates)
              var patch = (cfg.payload && cfg.payload.data) || {};
              window.__updates = window.__updates || [];
              window.__updates.push({ report: cfg.report_name, id: cfg.id, data: patch });
              Object.keys(DATA).forEach(function (rn) {
                (DATA[rn] || []).forEach(function (r) {
                  if (r.ID === cfg.id) Object.assign(r, patch);
                });
              });
              return Promise.resolve({});
            },
            updateRecords: function () { return Promise.resolve({}); },
            deleteRecordById: function () { return Promise.resolve({}); },
            deleteRecords: function () { return Promise.resolve({}); }
          }
        }
      };
    })();
    </script>
'''

html = html.replace('    <!-- ============ SCRIPTS ============ -->',
                    MOCK + '\n    <!-- ============ SCRIPTS ============ -->')

out_name = 'preview.html'
if '--no-impl' in sys.argv:
    # Simulate an account with zero Implementation contracts/plans
    html = html.replace('Contract_Type: "Implementation"', 'Contract_Type: "Support"')
    html = html.replace('Price_Type: "Implementation"', 'Price_Type: "Support"')
    out_name = 'preview-noimpl.html'

open(os.path.join(ROOT, out_name), 'w').write(html)
print(out_name, 'written:', len(html), 'bytes')
