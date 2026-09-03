# Zoho Creator Application Analysis: "Client Support"

## Overview
This is a **Zoho Creator application** definition file (Deluge Script) for a client support management system. It defines the database schema, forms, reports, and relationships for managing support contracts, requirements, tasks, bug reports, and payments.

## Core Components

### 1. Forms (Database Tables)

#### **Bug_Report**
- Purpose: Track bug reports from clients
- Key Fields:
  - Support_Contract (link to Support_Contract)
  - Client (link to zenfirm.Accounts)
  - Project (link to zenfirm.Project)
  - Bug_Description (textarea)
  - Support_Documents (file upload, max 10 files)

#### **Support_Contract** (Central Entity)
- Purpose: Manage support contracts with clients
- Key Fields:
  - Name, Company, Contract_Type (Implementation/Support)
  - Business_Email, Email (from zenfirm.Accounts)
  - Project (link to zenfirm.Project)
  - clinent (Client link to zenfirm.Accounts)
  - Currency (USD/INR/EUR)
  - Support_Plan (link to Pricing)
  - Promotion_Code
  - Price, Purchase_Date
  - Purchased_Hours, Consumed_Hours (tracking)
  - Contract_Status (Active/Inactive)
  - Payment Integration: RazorPay_Response, PayLink_Response, Payment_Link_ID, Payment_Url, Payment_Status

#### **Payment**
- Purpose: Store payment gateway credentials
- Key Fields:
  - Payment_Method (RazorPay/Stripe)
  - Client_ID, Client_Secret

#### **Pricing**
- Purpose: Define pricing plans for support contracts
- Key Fields:
  - Title, Price_Type (Implementation/Support)
  - Support_Hours, Contract_Hours
  - Country (extensive list of countries)
  - Currency (INR/USD/EUR)
  - Price

#### **Promotion**
- Purpose: Manage promotional codes and discounts
- Key Fields:
  - Promotion_Name, Promotion_Code, Description
  - Promotion_Type (Free Hours/Percentage Discount)
  - Number_Of_Hours, Discount_Rate
  - Valid_From, Valid_To
  - Status (Active/Inactive/Expired)

#### **Proposed_Tasks**
- Purpose: Track tasks broken down from requirements
- Key Fields:
  - Assigned_By, Owner (both link to zenfirm.Employee)
  - Task_Name, Project, Requirement (link to Requirement)
  - Description, Estimated_Hours
  - Status workflow: Not Started → Start Approval → In Progress → Completed → Completion Approved / Task Rejected
  - Percent (completion percentage)
  - Priority (Low/Medium/High)
  - Rejection_Reason

#### **Requirement**
- Purpose: Capture client requirements/new feature requests
- Key Fields:
  - Support_Contract, Project, Client
  - Subject_field, Requirement_Details
  - Attachments (file upload, max 10 files)
  - Submitted_Date
  - Status workflow: Submitted → Under Review → Need More Information → Waiting For Approval → Approved → In Progress → Completed → Closed / Rejected
  - Tasks (subform/grid linking to Proposed_Tasks)

### 2. Reports (Views)

1. **Support_Contract_Report**: Main view of all contracts with related data
2. **Requirement_Report**: Requirements with custom action "Add Task" (workflow: add_task_requirments)
3. **Proposed_Tasks_Report**: Task tracking with assignment details
4. **Promotion_Report**: Active/inactive promotions
5. **Pricing_Report**: Pricing by country, grouped and sorted
6. **Payment_Report**: Payment gateway configurations
7. **All_Bug_Reports**: Bug report tracking

### 3. Key Integrations

#### External Zoho Creator App: **zenfirm**
- Accounts (Client information)
- Project (Project management)
- Employee (Staff assignment)

#### Payment Gateways
- **RazorPay**: Primary payment processor
- **Stripe**: Alternative payment processor

### 4. Business Logic & Workflows

#### Support Contract Lifecycle
1. Client selects Support Plan (from Pricing)
2. Optional Promotion Code applied
3. Payment processed via RazorPay/Stripe
4. Contract activated with Purchased Hours
5. Hours consumed as tasks are completed
6. Contract status tracked (Active/Inactive)

#### Requirement Workflow
```
Submitted → Under Review → Need More Information (optional) 
→ Waiting For Approval → Approved → In Progress → Completed → Closed
                                         ↓
                                    Rejected
```

#### Task Workflow
```
Not Started → Start Approval → In Progress → Completed 
                                      ↓
                            Completion Approved / Task Rejected
```

### 5. Key Features

1. **Multi-Currency Support**: USD, INR, EUR
2. **Hour Tracking**: Purchased vs Consumed hours per contract
3. **Promotional System**: Free hours or percentage discounts
4. **File Attachments**: Up to 10 files per requirement/bug report
5. **Approval Workflows**: Multi-stage approval for requirements and tasks
6. **Payment Integration**: RazorPay and Stripe with payment link generation
7. **Client Portal Ready**: Structure supports client-facing views
8. **Country-Specific Pricing**: Different prices per country

### 6. Data Relationships

```
Support_Contract
├── links to → zenfirm.Accounts (Client)
├── links to → zenfirm.Project
├── links to → Pricing (Support_Plan)
└── has many → Requirement

Requirement
├── links to → Support_Contract
├── links to → zenfirm.Project
├── links to → zenfirm.Accounts (Client)
└── has many → Proposed_Tasks (via grid)

Proposed_Tasks
├── links to → Requirement
├── links to → zenfirm.Employee (Assigned_By)
├── links to → zenfirm.Employee (Owner)
└── links to → zenfirm.Project

Bug_Report
├── links to → Support_Contract
├── links to → zenfirm.Accounts (Client)
└── links to → zenfirm.Project
```

### 7. Security & Compliance
- Business_Email marked as `personal data = true` (GDPR compliance)
- File uploads restricted to local_drive
- Payment credentials stored separately in Payment form

## Architecture Summary

This is a **comprehensive support contract management system** built on Zoho Creator that enables:
- Clients to purchase support contracts with predefined hour packages
- Tracking of requirement submissions and task execution
- Bug reporting with document attachments
- Multi-currency, multi-country pricing with promotional codes
- Integrated payment processing (RazorPay/Stripe)
- Hour consumption tracking against purchased limits
- Multi-level approval workflows for quality control

The application integrates with an external Zoho Creator app called "zenfirm" for core CRM data (Accounts, Projects, Employees), making this a specialized module focused on support service delivery and contract management.
