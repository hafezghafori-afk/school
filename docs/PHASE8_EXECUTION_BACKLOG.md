# Phase 8 - Unified Finance Execution Backlog

Last update: 2026-03-06
Status: Complete
Phase owner: Finance workflows / billing / admin operations

## Objective

Close Phase 8 with these deliverables:

1. Fees and bills managed from one canonical finance module
2. Receipt upload and multi-stage approval (`finance_manager -> finance_lead -> general_president`)
3. Financial reports and CSV export
4. Automatic finance notifications and reminders
5. One unified student/admin flow instead of parallel legacy payment paths

## Current Baseline

- Backend already has:
  - `FinanceFeePlan`, `FinanceBill`, `FinanceReceipt`, and `FinanceMonthClose`
  - manual and bulk bill generation
  - discount, waiver, penalty, installment, and void actions
  - receipt upload with multi-stage approval trail
  - student finance summary and admin finance summary/report endpoints
  - reminder runner and month-close guardrails
- Frontend already has:
  - `AdminFinance.jsx` for fee plans, bills, approvals, month close, reminders, and reports
  - `StudentFinance.jsx` for student bills, receipt upload, and receipt history
- Known structural mismatch:
  - legacy `Order` receipt flow is still present in parallel to canonical finance
  - old `/payment` and `/submit-receipt` routes still existed as active entry points
  - admin dashboard still reads legacy pending orders in parallel to new finance review
- QA gap:
  - no finance-specific backend route smoke
  - no finance-specific Playwright workflow
  - no formal Phase 8 signoff doc yet

## Controlled Cutover Strategy

Phase 8 should close through controlled cutover, not hard deletion:

1. Keep legacy routes/pages as compatibility wrappers for a short period.
2. Move all real receipt creation and approval to `FinanceBill` + `FinanceReceipt`.
3. Block new product usage of the legacy `Order` receipt path.
4. Add finance-specific smoke/e2e coverage before signoff.

## Exit Criteria

Phase 8 is done only when all of these are true:

1. Student payment entry always resolves to the canonical finance center.
2. No active UI path creates new payment receipts through legacy `Order` submission flow.
3. Receipt approval is fully managed through `FinanceReceipt` with file preview and approval trail.
4. Overpayment and invalid receipt amount cases are rejected by backend rules.
5. Finance reports and reminder flow are verified end-to-end.
6. Finance-specific backend smoke and frontend Playwright checks pass.
7. Phase 8 signoff is documented.

## Scope Boundaries

In scope:

- bill and fee-plan ownership
- receipt upload and approval chain
- finance reminders and month close
- finance reporting and CSV export
- cutover from legacy student payment flow
- Phase 8 QA and signoff

Out of scope for this phase:

- real payment gateway integration
- refund ledger and credit-note system
- parent account billing portal
- automated scheduled reminder worker

## Backlog

| ID | Priority | Stream | Status | Task | Expected output | Depends on | Key files |
|---|---|---|---|---|---|---|---|
| `P8-ARC-01` | High | Architecture | Completed | Define controlled cutover plan and single source of truth for finance. | `FinanceBill` and `FinanceReceipt` established as the canonical payment model; legacy receipt flow explicitly marked as transitional only. | None | `docs/PHASE8_EXECUTION_BACKLOG.md`, `docs/PROJECT_PROGRESS_MATRIX.md` |
| `P8-FE-01` | High | Frontend | Completed | Route legacy student-facing payment entry points to canonical finance flow. | `/payment`, `/submit-receipt`, and course payment CTA no longer initiate new legacy receipt submissions. | `P8-ARC-01` | `frontend/src/pages/Payment.jsx`, `frontend/src/pages/SubmitReceipt.jsx`, `frontend/src/pages/CourseDetails.jsx` |
| `P8-BE-01` | High | Backend | Completed | Enforce receipt amount invariants. | Backend rejects overpayment, zero/negative values, and invalid receipt amounts relative to the linked bill. | `P8-ARC-01` | `backend/routes/financeRoutes.js`, `backend/models/FinanceBill.js`, `backend/models/FinanceReceipt.js`, `backend/utils/financeReceiptValidation.js` |
| `P8-BE-02` | High | Backend | Completed | Add duplicate-protection rules across bills and receipts. | Clear policy for duplicate bill creation and repeated receipt submission on the same obligation. | `P8-BE-01` | `backend/routes/financeRoutes.js`, `backend/routes/orderRoutes.js`, `backend/models/FinanceBill.js`, `backend/utils/financeReceiptValidation.js` |
| `P8-BE-03` | High | Backend | Completed | Add a compatibility bridge or deprecation guard for legacy order receipt submission. | Legacy `orders/submit` can no longer create a parallel payment state outside the finance module. | `P8-ARC-01` | `backend/routes/orderRoutes.js`, `backend/routes/financeRoutes.js`, `backend/utils/financeReceiptValidation.js` |
| `P8-FE-02` | High | Frontend | Completed | Upgrade admin receipt review UX. | `AdminFinance` shows receipt file preview, approval trail, clearer stage-based review controls, and `AdminPanel` now routes operators to the canonical finance center instead of offering legacy review actions. | `P8-BE-03` | `frontend/src/pages/AdminFinance.jsx`, `frontend/src/pages/AdminFinance.css`, `frontend/src/pages/AdminPanel.jsx` |
| `P8-FE-03` | Medium | Frontend | Completed | Improve student finance workflow clarity. | Better filtering, clearer bill/receipt grouping, pending-lock messaging, and stable post-submit feedback in `StudentFinance`. | `P8-BE-01` | `frontend/src/pages/StudentFinance.jsx`, `frontend/src/pages/StudentFinance.css` |
| `P8-QA-01` | High | QA | Completed | Add backend finance route smoke coverage and wire it into `backend` smoke chain. | Route-level verification for auth, multi-stage approval, month-close guardrails, CSV export, and amount validation. | Backend tasks | `backend/scripts/checkFinanceRoutes.js`, `backend/package.json` |
| `P8-QA-02` | High | QA | Completed | Add Playwright workflow for the canonical finance flow. | Student bill -> receipt submit -> admin review chain -> report/reminder visibility verified in one workflow. | Frontend and backend tasks | `frontend/tests/e2e/finance.workflow.spec.js`, `frontend/package.json` |
| `P8-DOC-01` | Medium | Docs | Completed | Record backlog, cutover rationale, and matrix sync. | Phase 8 gap list now references the controlled cutover path instead of generic “business signoff only.” | `P8-ARC-01` | `docs/PHASE8_EXECUTION_BACKLOG.md`, `docs/PROJECT_PROGRESS_MATRIX.md` |
| `P8-DOC-02` | Medium | Docs | Completed | Add final Phase 8 signoff. | Completion evidence, commands, and stakeholder confirmation documented. | All implementation and QA tasks | `docs/PHASE8_SIGNOFF.md` |

## Recommended Implementation Order

All tracked Phase 8 backlog items are complete.

## Progress Log

- 2026-03-06: Opened Phase 8 execution backlog around controlled cutover instead of direct deletion.
- 2026-03-06: Completed `P8-FE-01` by converting legacy `/payment` and `/submit-receipt` pages into compatibility wrappers and changing the course payment CTA to point to the canonical finance path for students.
- 2026-03-06: Synced the project matrix so Phase 8 gaps explicitly track the legacy-vs-canonical cutover and finance QA/signoff work.
- 2026-03-06: Completed `P8-BE-01` by centralizing receipt-amount validation, pending-reservation checks, and final-approval amount caps in the canonical finance flow.
- 2026-03-06: Completed `P8-BE-03` by converting legacy `orders/submit` into a compatibility bridge that creates `FinanceReceipt` records instead of new payment-state `Order` rows.
- 2026-03-06: Completed `P8-BE-02` by rejecting duplicate bill obligations, blocking duplicate receipt submissions, and preventing concurrent pending receipts for the same bill.
- 2026-03-06: Completed `P8-FE-02` and `P8-FE-03` by upgrading admin/student finance UX and routing operator review actions to the canonical `AdminFinance` center.
- 2026-03-06: Completed `P8-QA-01` and `P8-QA-02` with backend finance route smoke and frontend Playwright finance workflows.
- 2026-03-06: Completed `P8-DOC-02` with final signoff evidence.

## Notes

- Legacy `Order` receipt submission is now compatibility-only. Canonical bill/receipt ownership, approval, and operator review live in the finance module.
- Historical legacy order records may still exist in databases from older flows, but new operational review now routes to `/admin-finance#pending-receipts`.
