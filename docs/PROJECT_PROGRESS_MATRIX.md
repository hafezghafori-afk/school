# Project Progress Matrix

Last update: 2026-03-10
Status: Audit snapshot against roadmap phases `0` to `11`

## Overall Snapshot

- Delivery progress by module surface: about `95%`
- Delivery progress by roadmap acceptance criteria: about `93%`
- Strongest phases: `0`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `11`
- Highest-risk open phases: `2`
- Sequencing note: most later-phase modules are now closed. The remaining roadmap work is concentrated in academic ownership cleanup and compatibility reduction.

## Status Legend

| Status | Meaning |
|---|---|
| Complete | Roadmap output is implemented and evidenced in code/docs. |
| Mostly complete | Core flow exists; closing the phase now needs policy, polish, or signoff work. |
| Partial | Important scope exists, but acceptance criteria are still missing. |
| Early | Foundations exist, but the roadmap output is not release-ready yet. |

## Matrix

| Phase | Target output | Status | Estimate | What already exists | Main gaps to close | Key references |
|---|---|---|---:|---|---|---|
| `0` | Stabilize current version | Complete | `100%` | Phase signoff, responsive QA baseline, UTF-8 baseline, open-task inventory, lint/smoke/e2e/perf/security evidence are in place. | Keep the UI consistency matrix updated when nav/layout changes. | `docs/PHASE0_SIGNOFF.md`, `docs/PHASE0_OPEN_TASKS.md`, `docs/UI_CONSISTENCY_MATRIX.md`, `.github/workflows/ci.yml` |
| `1` | Core system and roles (`student / instructor / finance manager / finance lead / president`), profile-change approval policy, activity log | Complete | `100%` | The final ownership model for role identity, membership intent, and finance boundaries is frozen and documented. | No policy ambiguity remains in role/class/membership/finance ownership. | `docs/PHASE1_EXECUTION_BACKLOG.md`, `docs/PHASE1_SIGNOFF.md` |
| `2` | Base academic data: class, subject, academic year, instructor-subject, student-class | Complete | `100%` | Canonical role/access implementation, `StudentMembership`, `CourseJoinRequest`, membership-only course access, canonical education read/write paths, legacy `order` route retirement, and final `/api/orders` unmount are all implemented and verified. | No roadmap blocker remains. Future changes only need regression updates if a compatibility policy is reintroduced. | `docs/PHASE2_EXECUTION_BACKLOG.md`, `docs/PHASE3_ACADEMIC_MEMBERSHIP_SIGNOFF.md`, `docs/PHASE4_DATA_MIGRATION_SIGNOFF.md`, `docs/ACADEMIC_ARCHITECTURE_FINAL_SIGNOFF_2026-03-12.md`, `backend/utils/courseAccess.js`, `backend/routes/educationRoutes.js`, `backend/server.js` |
| `3` | Official smart scheduling for admin + automatic display in student/instructor dashboards | Complete | `100%` | Schedule CRUD, bulk create, conflict checks, copy previous week, holiday management, publish item/range, Excel export, automatic dashboard display, and Phase 3 Playwright signoff are implemented and verified. | No roadmap blocker remains. Future changes only need regression updates when schedule rules or dashboard cards change. | `backend/routes/scheduleRoutes.js`, `frontend/src/pages/AdminSchedule.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/InstructorDashboard.jsx`, `frontend/tests/e2e/schedule.workflow.spec.js`, `docs/PHASE3_SIGNOFF.md` |
| `4` | Attendance: daily register, class report, individual report, weekly dashboard state | Complete | `100%` | Daily entry, class report, individual report, weekly dashboard widgets, CSV export, attendance-specific Playwright coverage, backend route-smoke coverage, and Phase 4 signoff are implemented and verified. | No roadmap blocker remains. Future changes only need regression updates when attendance routes, exports, or dashboard widgets change. | `backend/routes/attendanceRoutes.js`, `backend/utils/attendanceReporting.js`, `backend/scripts/checkAttendanceRoutes.js`, `frontend/src/pages/AttendanceManager.jsx`, `frontend/src/pages/MyAttendance.jsx`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/InstructorDashboard.jsx`, `frontend/tests/e2e/attendance.workflow.spec.js`, `docs/PHASE4_EXECUTION_BACKLOG.md`, `docs/PHASE4_SIGNOFF.md` |
| `5` | Homework: create/send/submit with file and text, clear separation between create and review | Complete | `100%` | Homework creation/update, attachment upload, student text+file submission, clear instructor-side split between create and review flows, grading, Phase 5 Playwright coverage, and Phase 5 signoff are implemented and verified. | No roadmap blocker remains. Future changes only need regression updates when homework create/review flows or submission rules change. | `backend/routes/homeworkRoutes.js`, `frontend/src/pages/HomeworkManager.jsx`, `frontend/src/pages/MyHomework.jsx`, `frontend/tests/e2e/homework.workflow.spec.js`, `docs/PHASE5_SIGNOFF.md` |
| `6` | Exams and grading: full `40 + 60` model, attachment-backed grade edits, PDF report card | Complete | `100%` | Detailed `40`-point grading in four `10`-point assessment parts plus `60`-point final exam, attachment-backed create/edit, legacy grade normalization on read, PDF report card output, backend grade route smoke coverage, frontend grading Playwright workflow, and Phase 6 signoff are implemented and verified. | No roadmap blocker remains. Future changes only need regression updates when grading schema, report-card output, or grade-entry flows change. | `backend/models/Grade.js`, `backend/routes/gradeRoutes.js`, `backend/scripts/checkGradeRoutes.js`, `frontend/src/pages/GradeManager.jsx`, `frontend/src/pages/MyGrades.jsx`, `frontend/tests/e2e/grade.workflow.spec.js`, `docs/PHASE6_SIGNOFF.md` |
| `7` | Virtual system and chat: online class, direct chat, class group chat with files, reliable start/send flow | Complete | `100%` | First-class online-class sessions, scoped direct/group chat, file attachments, stabilized realtime handling, recordings archive linkage, backend route-smoke coverage, frontend Playwright workflow, and Phase 7 signoff are implemented and verified. | No roadmap blocker remains. Future changes only need regression updates when live-session rules, chat access policy, or realtime message handling changes. | `backend/models/VirtualClassSession.js`, `backend/routes/virtualClassRoutes.js`, `backend/routes/chatRoutes.js`, `backend/server.js`, `backend/scripts/checkVirtualChatRoutes.js`, `frontend/src/components/VirtualClassPanel.jsx`, `frontend/src/pages/ChatPage.jsx`, `frontend/tests/e2e/chat.workflow.spec.js`, `docs/PHASE7_SIGNOFF.md` |
| `8` | Unified finance: fees, receipts, multi-stage approval, financial reports, automatic notifications | Complete | `100%` | Fee plans, billing, installments, receipt upload, multi-stage approval (`finance_manager -> finance_lead -> general_president`), reports, reminders, month close, duplicate-protection rules, canonical student/admin finance surfaces, backend finance smoke, frontend finance Playwright coverage, and Phase 8 signoff are implemented and verified. Legacy student-facing payment pages point users to canonical finance surfaces, legacy order-based finance endpoints are retired, and admin operators are routed to the canonical finance center for review. | No roadmap blocker remains. Historical legacy order records may still exist, but new operational finance work now runs through the canonical module only. | `backend/routes/financeRoutes.js`, `backend/routes/orderRoutes.js`, `backend/utils/financeReceiptValidation.js`, `backend/scripts/checkFinanceRoutes.js`, `backend/models/FinanceFeePlan.js`, `backend/models/FinanceBill.js`, `backend/models/FinanceReceipt.js`, `frontend/src/pages/AdminFinance.jsx`, `frontend/src/pages/StudentFinance.jsx`, `frontend/src/pages/AdminPanel.jsx`, `frontend/src/pages/Payment.jsx`, `frontend/src/pages/SubmitReceipt.jsx`, `frontend/tests/e2e/finance.workflow.spec.js`, `docs/PHASE8_EXECUTION_BACKLOG.md`, `docs/PHASE8_SIGNOFF.md` |
| `9` | Advanced admin panel: global search, priority alerts, professional logs with CSV, per-menu admin settings | Complete | `100%` | Expanded global search across finance/academic/settings domains, priority-sorted alerts, professional admin logs with CSV export, per-menu settings management, backend admin route smoke, frontend admin Playwright workflow, and Phase 9 signoff are implemented and verified. | No roadmap blocker remains. Future changes only need regression updates when search coverage, alert rules, log export, or admin menu settings change. | `backend/routes/adminRoutes.js`, `backend/routes/adminLogRoutes.js`, `backend/routes/settingsRoutes.js`, `backend/scripts/checkAdminRoutes.js`, `frontend/src/pages/AdminPanel.jsx`, `frontend/src/pages/AdminLogs.jsx`, `frontend/src/pages/AdminSettings.jsx`, `frontend/tests/e2e/admin.workflow.spec.js`, `docs/PHASE9_SIGNOFF.md` |
| `10` | Home page and CMS content management | Complete | `100%` | Home slider, CTA, short-news cards, footer controls, menu blueprints, brand assets, public settings, home workflow coverage, responsive verification, Lighthouse baseline, and Phase 10 signoff are implemented and verified. | No roadmap blocker remains. Future changes only need regression updates when home CMS surfaces, footer content rules, or responsive guardrails change. | `backend/models/SiteSettings.js`, `backend/routes/settingsRoutes.js`, `frontend/src/pages/AdminSettings.jsx`, `frontend/src/pages/Home.jsx`, `frontend/tests/e2e/home.workflow.spec.js`, `docs/PHASE10_EXECUTION_BACKLOG.md`, `docs/PHASE10_SIGNOFF.md` |
| `11` | Finalization and deployment: final testing, security, backup/restore, user docs, production-ready release | Complete | `100%` | Backend and frontend release verification are green. Backup/create and restore dry-run scripts now exist, deployment and rollback runbooks exist, a release checklist exists, user-operational guidance exists, and Phase 11 signoff is documented. | No roadmap blocker remains. Future changes only need regression updates when release operations, deployment assumptions, or backup format change. | `backend/scripts/backupDatabase.js`, `backend/scripts/restoreDatabase.js`, `backend/scripts/checkOperationalReadiness.js`, `backend/package.json`, `frontend/package.json`, `docs/BACKUP_RESTORE_RUNBOOK.md`, `docs/DEPLOYMENT_RUNBOOK.md`, `docs/RELEASE_CHECKLIST.md`, `docs/USER_GUIDE.md`, `docs/PHASE11_EXECUTION_BACKLOG.md`, `docs/PHASE11_SIGNOFF.md` |

## Cross-Phase Notes

- No phase is truly "not started". The remaining closure work is concentrated in Phase 1 and Phase 2.
- The biggest structural mismatch with the roadmap is no longer missing modules; it is unfinished academic ownership cleanup in:
  - class/enrollment ownership (`Phase 2`)
- UTF-8 check note:
  - Source files inspected in Node read correctly as UTF-8.
  - Mojibake seen in PowerShell output is a console rendering issue, not direct proof of file corruption.

## Recommended Next Execution Order

1. Finish `Phase 2` academic ownership cleanup:
   - finalize class versus course ownership
   - finalize student-class membership ownership
2. Reduce compatibility dependence after the new ownership model is stable:
   - shrink `Order` dependence in academic access
   - keep role/access cleanup incremental and safe

## Suggested Closure Gates

| Phase | Minimum gate to mark done |
|---|---|
| `1` | Complete. Verified in `docs/PHASE1_SIGNOFF.md`. |
| `2` | Complete. Verified in `docs/ACADEMIC_ARCHITECTURE_FINAL_SIGNOFF_2026-03-12.md`. |
| `3` | Complete. Verified in `docs/PHASE3_SIGNOFF.md`. |
| `4` | Complete. Verified in `docs/PHASE4_SIGNOFF.md`. |
| `5` | Complete. Verified in `docs/PHASE5_SIGNOFF.md`. |
| `6` | Complete. Verified in `docs/PHASE6_SIGNOFF.md`. |
| `7` | Complete. Verified in `docs/PHASE7_SIGNOFF.md`. |
| `8` | Complete. Verified in `docs/PHASE8_SIGNOFF.md`. |
| `9` | Complete. Verified in `docs/PHASE9_SIGNOFF.md`. |
| `10` | Complete. Verified in `docs/PHASE10_SIGNOFF.md`. |
| `11` | Complete. Verified in `docs/PHASE11_SIGNOFF.md`. |
